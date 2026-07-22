import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqWorkflowAddressCandidates,
  mqWorkflowAddressEvidence,
  mqRegistryAddressLabels,
  mqWorkflowApprovalEvents,
  mqAuditEvents,
  mqWorkflowSourceDocuments,
  mqWorkflowSourceJobs,
  mqWorkflowSourceVerifications,
  mqUsers,
} from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";
import { parseEvidencePayload, summarizeEvidencePayload } from "../evidence";
import { parseEvidenceLedgerListFilters, type EvidenceLedgerListFilters } from "../list-filters";
import { candidateEvidenceSchema, registryEvidenceSchema } from "../validators/evidence";
import { hashJson } from "./service-utils";

export const CANDIDATE_EVIDENCE_PERMISSION = "candidate:evidence";
export const REGISTRY_EVIDENCE_PERMISSION = "registry:edit";

export async function listEvidenceForCandidate(candidateId: number) {
  return getDb().select().from(mqWorkflowAddressEvidence).where(eq(mqWorkflowAddressEvidence.candidateId, candidateId)).orderBy(desc(mqWorkflowAddressEvidence.createdAt));
}

export async function listEvidenceForRegistry(registryId: number) {
  return getDb().select().from(mqWorkflowAddressEvidence).where(eq(mqWorkflowAddressEvidence.registryId, registryId)).orderBy(desc(mqWorkflowAddressEvidence.createdAt));
}

function addCondition(conditions: SQL[], condition: SQL | undefined) {
  if (condition) conditions.push(condition);
}

function evidenceOrderBy(sort: EvidenceLedgerListFilters["sort"]) {
  if (sort === "type") return asc(mqWorkflowAddressEvidence.evidenceType);
  if (sort === "trust") return asc(mqWorkflowAddressEvidence.trustTier);
  return desc(mqWorkflowAddressEvidence.createdAt);
}

function sourceVerificationOrderBy(sort: EvidenceLedgerListFilters["sort"]) {
  if (sort === "type") return asc(mqWorkflowSourceVerifications.verificationScope);
  if (sort === "trust") return asc(mqWorkflowSourceVerifications.sourceTrust);
  return desc(mqWorkflowSourceVerifications.createdAt);
}

function buildEvidenceConditions(filters: EvidenceLedgerListFilters) {
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqWorkflowAddressEvidence.summary, `%${filters.q}%`),
        ilike(mqWorkflowAddressEvidence.sourceUrl, `%${filters.q}%`),
        ilike(mqWorkflowAddressEvidence.evidenceHash, `%${filters.q}%`),
        ilike(mqWorkflowAddressEvidence.storageUri, `%${filters.q}%`),
        ilike(mqWorkflowAddressCandidates.normalizedAddress, `%${filters.q}%`),
        ilike(mqRegistryAddressLabels.normalizedAddress, `%${filters.q}%`),
        ilike(mqWorkflowSourceJobs.sourceName, `%${filters.q}%`),
        ilike(mqWorkflowSourceJobs.sourceUrl, `%${filters.q}%`),
      ),
    );
  }

  if (filters.evidenceType) conditions.push(eq(mqWorkflowAddressEvidence.evidenceType, filters.evidenceType));
  if (filters.trustTier) conditions.push(eq(mqWorkflowAddressEvidence.trustTier, filters.trustTier));
  if (filters.sourceType) conditions.push(eq(mqWorkflowSourceJobs.sourceType, filters.sourceType));
  if (filters.chain) addCondition(conditions, or(eq(mqWorkflowAddressCandidates.chainCode, filters.chain), eq(mqRegistryAddressLabels.chainCode, filters.chain)));
  if (filters.candidateId) conditions.push(eq(mqWorkflowAddressEvidence.candidateId, filters.candidateId));
  if (filters.registryId) conditions.push(eq(mqWorkflowAddressEvidence.registryId, filters.registryId));
  if (filters.sourceJobId) conditions.push(eq(mqWorkflowSourceJobs.id, filters.sourceJobId));
  if (filters.sourceDocumentId) conditions.push(eq(mqWorkflowAddressEvidence.sourceDocumentId, filters.sourceDocumentId));

  return conditions.length ? and(...conditions) : sql`true`;
}

function buildSourceVerificationConditions(filters: EvidenceLedgerListFilters) {
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqWorkflowSourceVerifications.notes, `%${filters.q}%`),
        ilike(mqWorkflowSourceVerifications.sourceUrl, `%${filters.q}%`),
        ilike(mqWorkflowSourceVerifications.sourceSheet, `%${filters.q}%`),
        ilike(mqWorkflowAddressCandidates.normalizedAddress, `%${filters.q}%`),
        ilike(mqWorkflowSourceJobs.sourceName, `%${filters.q}%`),
        ilike(mqWorkflowSourceJobs.sourceUrl, `%${filters.q}%`),
      ),
    );
  }

  if (filters.sourceTrust) conditions.push(eq(mqWorkflowSourceVerifications.sourceTrust, filters.sourceTrust));
  if (filters.verificationStatus) conditions.push(eq(mqWorkflowSourceVerifications.status, filters.verificationStatus));
  if (filters.verificationScope) conditions.push(eq(mqWorkflowSourceVerifications.verificationScope, filters.verificationScope));
  if (filters.sourceType) conditions.push(eq(mqWorkflowSourceJobs.sourceType, filters.sourceType));
  if (filters.chain) conditions.push(eq(mqWorkflowAddressCandidates.chainCode, filters.chain));
  if (filters.candidateId) conditions.push(eq(mqWorkflowSourceVerifications.candidateId, filters.candidateId));
  if (filters.sourceJobId) conditions.push(eq(mqWorkflowSourceVerifications.sourceJobId, filters.sourceJobId));
  if (filters.sourceDocumentId) conditions.push(eq(mqWorkflowSourceVerifications.sourceDocumentId, filters.sourceDocumentId));

  return conditions.length ? and(...conditions) : sql`true`;
}

export async function listEvidenceLedger(input?: unknown) {
  const filters = parseEvidenceLedgerListFilters(input ?? {});
  const db = getDb();
  const offset = (filters.page - 1) * filters.pageSize;
  const evidenceWhere = buildEvidenceConditions(filters);
  const verificationWhere = buildSourceVerificationConditions(filters);

  const evidenceBase = db
    .select({
      evidence: mqWorkflowAddressEvidence,
      candidate: mqWorkflowAddressCandidates,
      registry: mqRegistryAddressLabels,
      sourceDocument: mqWorkflowSourceDocuments,
      sourceJob: mqWorkflowSourceJobs,
      creatorEmail: mqUsers.email,
      creatorName: mqUsers.displayName,
    })
    .from(mqWorkflowAddressEvidence)
    .leftJoin(mqWorkflowAddressCandidates, eq(mqWorkflowAddressEvidence.candidateId, mqWorkflowAddressCandidates.id))
    .leftJoin(mqRegistryAddressLabels, eq(mqWorkflowAddressEvidence.registryId, mqRegistryAddressLabels.id))
    .leftJoin(mqWorkflowSourceDocuments, eq(mqWorkflowAddressEvidence.sourceDocumentId, mqWorkflowSourceDocuments.id))
    .leftJoin(
      mqWorkflowSourceJobs,
      or(eq(mqWorkflowAddressCandidates.sourceJobId, mqWorkflowSourceJobs.id), eq(mqWorkflowSourceDocuments.sourceJobId, mqWorkflowSourceJobs.id)),
    )
    .leftJoin(mqUsers, eq(mqWorkflowAddressEvidence.createdBy, mqUsers.id));

  const verificationBase = db
    .select({
      verification: mqWorkflowSourceVerifications,
      candidate: mqWorkflowAddressCandidates,
      sourceDocument: mqWorkflowSourceDocuments,
      sourceJob: mqWorkflowSourceJobs,
      verifierEmail: mqUsers.email,
      verifierName: mqUsers.displayName,
    })
    .from(mqWorkflowSourceVerifications)
    .leftJoin(mqWorkflowAddressCandidates, eq(mqWorkflowSourceVerifications.candidateId, mqWorkflowAddressCandidates.id))
    .leftJoin(mqWorkflowSourceDocuments, eq(mqWorkflowSourceVerifications.sourceDocumentId, mqWorkflowSourceDocuments.id))
    .leftJoin(mqWorkflowSourceJobs, eq(mqWorkflowSourceVerifications.sourceJobId, mqWorkflowSourceJobs.id))
    .leftJoin(mqUsers, eq(mqWorkflowSourceVerifications.verifiedBy, mqUsers.id));

  const [evidenceCount, verificationCount, evidenceRows, verificationRows] = await Promise.all([
    db
      .select({ total: sql<number>`count(distinct ${mqWorkflowAddressEvidence.id})::int` })
      .from(mqWorkflowAddressEvidence)
      .leftJoin(mqWorkflowAddressCandidates, eq(mqWorkflowAddressEvidence.candidateId, mqWorkflowAddressCandidates.id))
      .leftJoin(mqRegistryAddressLabels, eq(mqWorkflowAddressEvidence.registryId, mqRegistryAddressLabels.id))
      .leftJoin(mqWorkflowSourceDocuments, eq(mqWorkflowAddressEvidence.sourceDocumentId, mqWorkflowSourceDocuments.id))
      .leftJoin(
        mqWorkflowSourceJobs,
        or(eq(mqWorkflowAddressCandidates.sourceJobId, mqWorkflowSourceJobs.id), eq(mqWorkflowSourceDocuments.sourceJobId, mqWorkflowSourceJobs.id)),
      )
      .where(evidenceWhere),
    db
      .select({ total: sql<number>`count(distinct ${mqWorkflowSourceVerifications.id})::int` })
      .from(mqWorkflowSourceVerifications)
      .leftJoin(mqWorkflowAddressCandidates, eq(mqWorkflowSourceVerifications.candidateId, mqWorkflowAddressCandidates.id))
      .leftJoin(mqWorkflowSourceDocuments, eq(mqWorkflowSourceVerifications.sourceDocumentId, mqWorkflowSourceDocuments.id))
      .leftJoin(mqWorkflowSourceJobs, eq(mqWorkflowSourceVerifications.sourceJobId, mqWorkflowSourceJobs.id))
      .where(verificationWhere),
    evidenceBase.where(evidenceWhere).orderBy(evidenceOrderBy(filters.sort), desc(mqWorkflowAddressEvidence.id)).limit(filters.pageSize).offset(offset),
    verificationBase
      .where(verificationWhere)
      .orderBy(sourceVerificationOrderBy(filters.sort), desc(mqWorkflowSourceVerifications.id))
      .limit(filters.pageSize)
      .offset(offset),
  ]);

  const evidenceTotal = evidenceCount[0]?.total ?? 0;
  const verificationTotal = verificationCount[0]?.total ?? 0;

  return {
    evidenceRows,
    sourceVerificationRows: verificationRows,
    filters,
    page: filters.page,
    pageSize: filters.pageSize,
    evidenceTotal,
    evidenceTotalPages: Math.max(1, Math.ceil(evidenceTotal / filters.pageSize)),
    sourceVerificationTotal: verificationTotal,
    sourceVerificationTotalPages: Math.max(1, Math.ceil(verificationTotal / filters.pageSize)),
  };
}

export async function addCandidateEvidence(input: unknown) {
  const actor = await assertPermission(CANDIDATE_EVIDENCE_PERMISSION);
  const parsed = candidateEvidenceSchema.parse(input);
  const payload = parseEvidencePayload(parsed.payloadJson);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(mqWorkflowAddressCandidates).where(eq(mqWorkflowAddressCandidates.id, parsed.candidateId)).limit(1);

    if (!candidate) {
      throw new Error("Candidate not found.");
    }

    const evidencePayload = {
      ...payload,
      payloadSummary: summarizeEvidencePayload(payload),
      enteredBy: actor.email,
    };

    const [evidence] = await tx
      .insert(mqWorkflowAddressEvidence)
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
      .update(mqWorkflowAddressCandidates)
      .set({
        evidenceCount: candidate.evidenceCount + 1,
        metadata: {
          ...(candidate.metadata ?? {}),
          lastEvidenceAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(mqWorkflowAddressCandidates.id, parsed.candidateId))
      .returning();

    await tx.insert(mqWorkflowApprovalEvents).values({
      candidateId: parsed.candidateId,
      action: "candidate_evidence_added",
      actorId: actor.id,
      reason: parsed.summary,
      beforeJson: candidate,
      afterJson: updatedCandidate,
      metadata: { evidenceId: evidence.id, evidenceHash: evidence.evidenceHash, trustTier: parsed.trustTier },
    });

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "candidate_evidence_added",
      targetTable: "mq_workflow_address_candidates",
      targetId: String(parsed.candidateId),
      payload: { evidenceId: evidence.id, evidenceHash: evidence.evidenceHash },
    });

    return evidence;
  });
}

export async function addRegistryEvidence(input: unknown) {
  const actor = await assertPermission(REGISTRY_EVIDENCE_PERMISSION);
  const parsed = registryEvidenceSchema.parse(input);
  const payload = parseEvidencePayload(parsed.payloadJson);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [registry] = await tx.select().from(mqRegistryAddressLabels).where(eq(mqRegistryAddressLabels.id, parsed.registryId)).limit(1);

    if (!registry) {
      throw new Error("Registry row not found.");
    }

    const evidencePayload = {
      ...payload,
      payloadSummary: summarizeEvidencePayload(payload),
      enteredBy: actor.email,
    };

    const [evidence] = await tx
      .insert(mqWorkflowAddressEvidence)
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

    await tx.insert(mqWorkflowApprovalEvents).values({
      registryId: parsed.registryId,
      action: "registry_evidence_added",
      actorId: actor.id,
      reason: parsed.summary,
      beforeJson: registry,
      afterJson: registry,
      metadata: { evidenceId: evidence.id, evidenceHash: evidence.evidenceHash, trustTier: parsed.trustTier },
    });

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "registry_evidence_added",
      targetTable: "mq_registry_address_labels",
      targetId: String(parsed.registryId),
      payload: { evidenceId: evidence.id, evidenceHash: evidence.evidenceHash },
    });

    return evidence;
  });
}
