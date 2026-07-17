import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressCandidates,
  mqAddressEvidence,
  mqAddressRegistry,
  mqApprovalEvents,
  mqAuditLog,
  mqSourceDocuments,
  mqSourceJobs,
  mqSourceVerifications,
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
  return getDb().select().from(mqAddressEvidence).where(eq(mqAddressEvidence.candidateId, candidateId)).orderBy(desc(mqAddressEvidence.createdAt));
}

export async function listEvidenceForRegistry(registryId: number) {
  return getDb().select().from(mqAddressEvidence).where(eq(mqAddressEvidence.registryId, registryId)).orderBy(desc(mqAddressEvidence.createdAt));
}

function addCondition(conditions: SQL[], condition: SQL | undefined) {
  if (condition) conditions.push(condition);
}

function evidenceOrderBy(sort: EvidenceLedgerListFilters["sort"]) {
  if (sort === "type") return asc(mqAddressEvidence.evidenceType);
  if (sort === "trust") return asc(mqAddressEvidence.trustTier);
  return desc(mqAddressEvidence.createdAt);
}

function sourceVerificationOrderBy(sort: EvidenceLedgerListFilters["sort"]) {
  if (sort === "type") return asc(mqSourceVerifications.verificationScope);
  if (sort === "trust") return asc(mqSourceVerifications.sourceTrust);
  return desc(mqSourceVerifications.createdAt);
}

function buildEvidenceConditions(filters: EvidenceLedgerListFilters) {
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqAddressEvidence.summary, `%${filters.q}%`),
        ilike(mqAddressEvidence.sourceUrl, `%${filters.q}%`),
        ilike(mqAddressEvidence.evidenceHash, `%${filters.q}%`),
        ilike(mqAddressEvidence.storageUri, `%${filters.q}%`),
        ilike(mqAddressCandidates.normalizedAddress, `%${filters.q}%`),
        ilike(mqAddressRegistry.normalizedAddress, `%${filters.q}%`),
        ilike(mqSourceJobs.sourceName, `%${filters.q}%`),
        ilike(mqSourceJobs.sourceUrl, `%${filters.q}%`),
      ),
    );
  }

  if (filters.evidenceType) conditions.push(eq(mqAddressEvidence.evidenceType, filters.evidenceType));
  if (filters.trustTier) conditions.push(eq(mqAddressEvidence.trustTier, filters.trustTier));
  if (filters.sourceType) conditions.push(eq(mqSourceJobs.sourceType, filters.sourceType));
  if (filters.chain) addCondition(conditions, or(eq(mqAddressCandidates.chainCode, filters.chain), eq(mqAddressRegistry.chainCode, filters.chain)));
  if (filters.candidateId) conditions.push(eq(mqAddressEvidence.candidateId, filters.candidateId));
  if (filters.registryId) conditions.push(eq(mqAddressEvidence.registryId, filters.registryId));
  if (filters.sourceJobId) conditions.push(eq(mqSourceJobs.id, filters.sourceJobId));
  if (filters.sourceDocumentId) conditions.push(eq(mqAddressEvidence.sourceDocumentId, filters.sourceDocumentId));

  return conditions.length ? and(...conditions) : sql`true`;
}

function buildSourceVerificationConditions(filters: EvidenceLedgerListFilters) {
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqSourceVerifications.notes, `%${filters.q}%`),
        ilike(mqSourceVerifications.sourceUrl, `%${filters.q}%`),
        ilike(mqSourceVerifications.sourceSheet, `%${filters.q}%`),
        ilike(mqAddressCandidates.normalizedAddress, `%${filters.q}%`),
        ilike(mqSourceJobs.sourceName, `%${filters.q}%`),
        ilike(mqSourceJobs.sourceUrl, `%${filters.q}%`),
      ),
    );
  }

  if (filters.sourceTrust) conditions.push(eq(mqSourceVerifications.sourceTrust, filters.sourceTrust));
  if (filters.verificationStatus) conditions.push(eq(mqSourceVerifications.status, filters.verificationStatus));
  if (filters.verificationScope) conditions.push(eq(mqSourceVerifications.verificationScope, filters.verificationScope));
  if (filters.sourceType) conditions.push(eq(mqSourceJobs.sourceType, filters.sourceType));
  if (filters.chain) conditions.push(eq(mqAddressCandidates.chainCode, filters.chain));
  if (filters.candidateId) conditions.push(eq(mqSourceVerifications.candidateId, filters.candidateId));
  if (filters.sourceJobId) conditions.push(eq(mqSourceVerifications.sourceJobId, filters.sourceJobId));
  if (filters.sourceDocumentId) conditions.push(eq(mqSourceVerifications.sourceDocumentId, filters.sourceDocumentId));

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
      evidence: mqAddressEvidence,
      candidate: mqAddressCandidates,
      registry: mqAddressRegistry,
      sourceDocument: mqSourceDocuments,
      sourceJob: mqSourceJobs,
      creatorEmail: mqUsers.email,
      creatorName: mqUsers.displayName,
    })
    .from(mqAddressEvidence)
    .leftJoin(mqAddressCandidates, eq(mqAddressEvidence.candidateId, mqAddressCandidates.id))
    .leftJoin(mqAddressRegistry, eq(mqAddressEvidence.registryId, mqAddressRegistry.id))
    .leftJoin(mqSourceDocuments, eq(mqAddressEvidence.sourceDocumentId, mqSourceDocuments.id))
    .leftJoin(
      mqSourceJobs,
      or(eq(mqAddressCandidates.sourceJobId, mqSourceJobs.id), eq(mqSourceDocuments.sourceJobId, mqSourceJobs.id)),
    )
    .leftJoin(mqUsers, eq(mqAddressEvidence.createdBy, mqUsers.id));

  const verificationBase = db
    .select({
      verification: mqSourceVerifications,
      candidate: mqAddressCandidates,
      sourceDocument: mqSourceDocuments,
      sourceJob: mqSourceJobs,
      verifierEmail: mqUsers.email,
      verifierName: mqUsers.displayName,
    })
    .from(mqSourceVerifications)
    .leftJoin(mqAddressCandidates, eq(mqSourceVerifications.candidateId, mqAddressCandidates.id))
    .leftJoin(mqSourceDocuments, eq(mqSourceVerifications.sourceDocumentId, mqSourceDocuments.id))
    .leftJoin(mqSourceJobs, eq(mqSourceVerifications.sourceJobId, mqSourceJobs.id))
    .leftJoin(mqUsers, eq(mqSourceVerifications.verifiedBy, mqUsers.id));

  const [evidenceCount, verificationCount, evidenceRows, verificationRows] = await Promise.all([
    db
      .select({ total: sql<number>`count(distinct ${mqAddressEvidence.id})::int` })
      .from(mqAddressEvidence)
      .leftJoin(mqAddressCandidates, eq(mqAddressEvidence.candidateId, mqAddressCandidates.id))
      .leftJoin(mqAddressRegistry, eq(mqAddressEvidence.registryId, mqAddressRegistry.id))
      .leftJoin(mqSourceDocuments, eq(mqAddressEvidence.sourceDocumentId, mqSourceDocuments.id))
      .leftJoin(
        mqSourceJobs,
        or(eq(mqAddressCandidates.sourceJobId, mqSourceJobs.id), eq(mqSourceDocuments.sourceJobId, mqSourceJobs.id)),
      )
      .where(evidenceWhere),
    db
      .select({ total: sql<number>`count(distinct ${mqSourceVerifications.id})::int` })
      .from(mqSourceVerifications)
      .leftJoin(mqAddressCandidates, eq(mqSourceVerifications.candidateId, mqAddressCandidates.id))
      .leftJoin(mqSourceDocuments, eq(mqSourceVerifications.sourceDocumentId, mqSourceDocuments.id))
      .leftJoin(mqSourceJobs, eq(mqSourceVerifications.sourceJobId, mqSourceJobs.id))
      .where(verificationWhere),
    evidenceBase.where(evidenceWhere).orderBy(evidenceOrderBy(filters.sort), desc(mqAddressEvidence.id)).limit(filters.pageSize).offset(offset),
    verificationBase
      .where(verificationWhere)
      .orderBy(sourceVerificationOrderBy(filters.sort), desc(mqSourceVerifications.id))
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
  const actor = await assertPermission(REGISTRY_EVIDENCE_PERMISSION);
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
