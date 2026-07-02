import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mqAddressCandidates, mqAddressEvidence, mqAddressRegistry, mqApprovalEvents, mqAuditLog } from "@/db/schema";
import { assertPermission } from "@/lib/auth/permissions";
import { parseEvidencePayload, summarizeEvidencePayload } from "../evidence";
import { candidateEvidenceSchema, registryEvidenceSchema } from "../validators/evidence";
import { hashJson } from "./service-utils";

export async function listEvidenceForCandidate(candidateId: number) {
  return getDb().select().from(mqAddressEvidence).where(eq(mqAddressEvidence.candidateId, candidateId)).orderBy(desc(mqAddressEvidence.createdAt));
}

export async function listEvidenceForRegistry(registryId: number) {
  return getDb().select().from(mqAddressEvidence).where(eq(mqAddressEvidence.registryId, registryId)).orderBy(desc(mqAddressEvidence.createdAt));
}

export async function addCandidateEvidence(input: unknown) {
  const actor = await assertPermission("candidate:evidence");
  const parsed = candidateEvidenceSchema.parse(input);
  const payload = parseEvidencePayload(parsed.payloadJson);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(mqAddressCandidates).where(eq(mqAddressCandidates.id, parsed.candidateId)).limit(1);

    if (!candidate) {
      throw new Error("Candidate not found.");
    }

    const evidencePayload = {
      ...payload,
      payloadSummary: summarizeEvidencePayload(payload),
      enteredBy: actor.email,
    };

    const [evidence] = await tx
      .insert(mqAddressEvidence)
      .values({
        candidateId: parsed.candidateId,
        sourceDocumentId: candidate.sourceDocumentId,
        evidenceType: parsed.evidenceType,
        sourceUrl: parsed.sourceUrl || null,
        evidenceHash: hashJson({ candidateId: parsed.candidateId, evidenceType: parsed.evidenceType, summary: parsed.summary, payload }),
        confidenceDelta: parsed.confidenceDelta,
        trustTier: parsed.trustTier,
        summary: parsed.summary,
        payload: evidencePayload,
        createdBy: actor.id,
      })
      .returning();

    const [updatedCandidate] = await tx
      .update(mqAddressCandidates)
      .set({
        evidenceCount: candidate.evidenceCount + 1,
        metadata: {
          ...(candidate.metadata ?? {}),
          lastEvidenceAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(mqAddressCandidates.id, parsed.candidateId))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      candidateId: parsed.candidateId,
      action: "candidate_evidence_added",
      actorId: actor.id,
      reason: parsed.summary,
      beforeJson: candidate,
      afterJson: updatedCandidate,
      metadata: { evidenceId: evidence.id, evidenceHash: evidence.evidenceHash, trustTier: parsed.trustTier },
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "candidate_evidence_added",
      targetTable: "mq_address_candidates",
      targetId: String(parsed.candidateId),
      payload: { evidenceId: evidence.id, evidenceHash: evidence.evidenceHash },
    });

    return evidence;
  });
}

export async function addRegistryEvidence(input: unknown) {
  const actor = await assertPermission("candidate:evidence");
  const parsed = registryEvidenceSchema.parse(input);
  const payload = parseEvidencePayload(parsed.payloadJson);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [registry] = await tx.select().from(mqAddressRegistry).where(eq(mqAddressRegistry.id, parsed.registryId)).limit(1);

    if (!registry) {
      throw new Error("Registry row not found.");
    }

    const evidencePayload = {
      ...payload,
      payloadSummary: summarizeEvidencePayload(payload),
      enteredBy: actor.email,
    };

    const [evidence] = await tx
      .insert(mqAddressEvidence)
      .values({
        registryId: parsed.registryId,
        evidenceType: parsed.evidenceType,
        sourceUrl: parsed.sourceUrl || null,
        evidenceHash: hashJson({ registryId: parsed.registryId, evidenceType: parsed.evidenceType, summary: parsed.summary, payload }),
        confidenceDelta: parsed.confidenceDelta,
        trustTier: parsed.trustTier,
        summary: parsed.summary,
        payload: evidencePayload,
        createdBy: actor.id,
      })
      .returning();

    await tx.insert(mqApprovalEvents).values({
      registryId: parsed.registryId,
      action: "registry_evidence_added",
      actorId: actor.id,
      reason: parsed.summary,
      beforeJson: registry,
      afterJson: registry,
      metadata: { evidenceId: evidence.id, evidenceHash: evidence.evidenceHash, trustTier: parsed.trustTier },
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "registry_evidence_added",
      targetTable: "mq_address_registry",
      targetId: String(parsed.registryId),
      payload: { evidenceId: evidence.id, evidenceHash: evidence.evidenceHash },
    });

    return evidence;
  });
}
