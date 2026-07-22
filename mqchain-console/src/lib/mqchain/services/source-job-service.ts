import { and, asc, desc, eq, ilike, inArray, not, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqWorkflowAddressCandidates,
  mqWorkflowAddressEvidence,
  mqRegistryAddressLabels,
  mqWorkflowApprovalEvents,
  mqAuditEvents,
  mqDictEntities,
  mqDictRoles,
  mqBuildKvBuilds,
  mqBuildIndexManifests,
  mqWorkflowLabelBatchCandidates,
  mqWorkflowLabelBatchEvidence,
  mqWorkflowLabelBatches,
  mqDictProtocols,
  mqWorkflowSourceDocuments,
  mqWorkflowSourceJobs,
  mqWorkflowSourceVerifications,
  mqUsers,
} from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";
import { parseSourceJobListFilters, type SourceJobListFilters } from "../list-filters";
import {
  buildSourceJobArchiveMetadata,
  buildSourceJobDocumentRollup,
  buildSourceJobDownstreamRollup,
  buildSourceVerificationDecisionPayload,
  buildSourceJobVerificationRollup,
} from "../source-job";
import { buildCandidateSourceVerificationContext, candidateSourceSheetMatches, candidateSourceUrlMatches } from "../candidate-detail";
import { buildEvidenceTrustDisplay } from "../trust";
import { buildSourceJobDeletionPreview, SourceJobDeletionError, type SourceJobDeletionPreview } from "../source-job-deletion";
import { isSourceJobDeleteConfirmation, sourceJobDeletionSchema, sourceJobArchiveSchema, sourceVerificationSchema } from "../validators/source-job";

function sourceJobOrderBy(sort: SourceJobListFilters["sort"]) {
  if (sort === "updated_at") return desc(mqWorkflowSourceJobs.updatedAt);
  if (sort === "source_type") return asc(mqWorkflowSourceJobs.sourceType);
  if (sort === "status") return asc(mqWorkflowSourceJobs.status);
  return desc(mqWorkflowSourceJobs.createdAt);
}

function addCondition(conditions: SQL[], condition: SQL | undefined) {
  if (condition) conditions.push(condition);
}

export async function listSourceJobs(input?: unknown) {
  const filters = parseSourceJobListFilters(input ?? {});
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqWorkflowSourceJobs.sourceName, `%${filters.q}%`),
        ilike(mqWorkflowSourceJobs.sourceUrl, `%${filters.q}%`),
        ilike(mqWorkflowSourceJobs.localFileName, `%${filters.q}%`),
        ilike(mqWorkflowSourceJobs.archiveStorageUri, `%${filters.q}%`),
      ),
    );
  }

  if (filters.sourceType) {
    conditions.push(eq(mqWorkflowSourceJobs.sourceType, filters.sourceType));
  }

  if (filters.status) {
    conditions.push(eq(mqWorkflowSourceJobs.status, filters.status));
  }

  if (filters.entity) {
    conditions.push(ilike(mqWorkflowSourceJobs.entityHint, `%${filters.entity}%`));
  }

  if (filters.protocol) {
    conditions.push(ilike(mqWorkflowSourceJobs.protocolHint, `%${filters.protocol}%`));
  }

  if (filters.chain) {
    conditions.push(sql`${filters.chain} = any(${mqWorkflowSourceJobs.chainScope})`);
  }

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(mqWorkflowSourceJobs).where(where);
  const rows = await db
    .select()
    .from(mqWorkflowSourceJobs)
    .where(where)
    .orderBy(sourceJobOrderBy(filters.sort), desc(mqWorkflowSourceJobs.id))
    .limit(filters.pageSize)
    .offset(offset);

  return {
    rows,
    filters,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}

export function normalizeSourceJobDetailPagination(input: unknown) {
  const record = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const integer = (value: unknown, fallback: number, maximum = Number.MAX_SAFE_INTEGER) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
  };
  return { candidatePage: integer(record.candidatePage, 1), evidencePage: integer(record.evidencePage, 1), pageSize: integer(record.pageSize, 50, 100) };
}

function distribution(rows: Array<{ label: string | null; count: number }>) {
  return rows.map(row => ({ label: row.label || "unknown", count: row.count })).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export async function getSourceJob(id: number, input: unknown = {}) {
  const db = getDb();
  const pagination = normalizeSourceJobDetailPagination(input);
  const [sourceJob] = await db.select().from(mqWorkflowSourceJobs).where(eq(mqWorkflowSourceJobs.id, id)).limit(1);

  if (!sourceJob) {
    return null;
  }

  const confidenceLabel = sql<string>`case when ${mqWorkflowAddressCandidates.confidenceScore} >= 85 then '85-100' when ${mqWorkflowAddressCandidates.confidenceScore} >= 70 then '70-84' when ${mqWorkflowAddressCandidates.confidenceScore} >= 40 then '40-69' else '0-39' end`;
  const [
    documents, candidates, downstreamBatches, verifications, downstreamRegistryRows, candidateSummary,
    candidateStatuses, candidateChains, candidateConfidences, evidenceSummary, evidenceTypes, evidenceTrusts,
  ] = await Promise.all([
    db.select().from(mqWorkflowSourceDocuments).where(eq(mqWorkflowSourceDocuments.sourceJobId, id)),
    db.select().from(mqWorkflowAddressCandidates).where(eq(mqWorkflowAddressCandidates.sourceJobId, id)).orderBy(desc(mqWorkflowAddressCandidates.createdAt), desc(mqWorkflowAddressCandidates.id)).limit(pagination.pageSize).offset((pagination.candidatePage - 1) * pagination.pageSize),
    db.select().from(mqWorkflowLabelBatches).where(eq(mqWorkflowLabelBatches.sourceJobId, id)).orderBy(desc(mqWorkflowLabelBatches.createdAt)),
    db
      .select({
        verification: mqWorkflowSourceVerifications,
        verifierEmail: mqUsers.email,
        verifierName: mqUsers.displayName,
      })
      .from(mqWorkflowSourceVerifications)
      .leftJoin(mqUsers, eq(mqWorkflowSourceVerifications.verifiedBy, mqUsers.id))
      .where(eq(mqWorkflowSourceVerifications.sourceJobId, id))
      .orderBy(desc(mqWorkflowSourceVerifications.createdAt)),
    db
      .select({
        registry: mqRegistryAddressLabels,
        entityName: mqDictEntities.entityName,
        protocolName: mqDictProtocols.protocolName,
        roleCode: mqDictRoles.roleCode,
      })
      .from(mqRegistryAddressLabels)
      .leftJoin(mqDictEntities, eq(mqRegistryAddressLabels.entityId, mqDictEntities.id))
      .leftJoin(mqDictProtocols, eq(mqRegistryAddressLabels.protocolId, mqDictProtocols.id))
      .leftJoin(mqDictRoles, eq(mqRegistryAddressLabels.roleId, mqDictRoles.roleId))
      .where(eq(mqRegistryAddressLabels.primarySourceJobId, id))
      .orderBy(desc(mqRegistryAddressLabels.createdAt)),
    db.select({
      totalCandidates: sql<number>`count(*)::int`,
      evidenceCount: sql<number>`coalesce(sum(${mqWorkflowAddressCandidates.evidenceCount}), 0)::int`,
      approvedCount: sql<number>`count(*) filter (where ${mqWorkflowAddressCandidates.candidateStatus} = 'approved')::int`,
      pendingCount: sql<number>`count(*) filter (where ${mqWorkflowAddressCandidates.candidateStatus} = 'pending_review')::int`,
      duplicateCount: sql<number>`count(*) filter (where ${mqWorkflowAddressCandidates.candidateStatus} = 'duplicate')::int`,
      conflictCount: sql<number>`count(*) filter (where ${mqWorkflowAddressCandidates.candidateStatus} = 'conflict_pending')::int`,
    }).from(mqWorkflowAddressCandidates).where(eq(mqWorkflowAddressCandidates.sourceJobId, id)),
    db.select({ label: mqWorkflowAddressCandidates.candidateStatus, count: sql<number>`count(*)::int` }).from(mqWorkflowAddressCandidates).where(eq(mqWorkflowAddressCandidates.sourceJobId, id)).groupBy(mqWorkflowAddressCandidates.candidateStatus),
    db.select({ label: sql<string>`coalesce(${mqWorkflowAddressCandidates.chainCode}, 'unknown')`, count: sql<number>`count(*)::int` }).from(mqWorkflowAddressCandidates).where(eq(mqWorkflowAddressCandidates.sourceJobId, id)).groupBy(mqWorkflowAddressCandidates.chainCode),
    db.select({ label: confidenceLabel, count: sql<number>`count(*)::int` }).from(mqWorkflowAddressCandidates).where(eq(mqWorkflowAddressCandidates.sourceJobId, id)).groupBy(confidenceLabel),
    db.select({ totalEvidence: sql<number>`count(*)::int` }).from(mqWorkflowAddressEvidence).innerJoin(mqWorkflowAddressCandidates, eq(mqWorkflowAddressEvidence.candidateId, mqWorkflowAddressCandidates.id)).where(eq(mqWorkflowAddressCandidates.sourceJobId, id)),
    db.select({ label: mqWorkflowAddressEvidence.evidenceType, count: sql<number>`count(*)::int` }).from(mqWorkflowAddressEvidence).innerJoin(mqWorkflowAddressCandidates, eq(mqWorkflowAddressEvidence.candidateId, mqWorkflowAddressCandidates.id)).where(eq(mqWorkflowAddressCandidates.sourceJobId, id)).groupBy(mqWorkflowAddressEvidence.evidenceType),
    db.select({ label: mqWorkflowAddressEvidence.trustTier, count: sql<number>`count(*)::int` }).from(mqWorkflowAddressEvidence).innerJoin(mqWorkflowAddressCandidates, eq(mqWorkflowAddressEvidence.candidateId, mqWorkflowAddressCandidates.id)).where(eq(mqWorkflowAddressCandidates.sourceJobId, id)).groupBy(mqWorkflowAddressEvidence.trustTier),
  ]);

  const evidenceRows = await db.select({
    evidence: mqWorkflowAddressEvidence,
    candidateAddress: mqWorkflowAddressCandidates.normalizedAddress,
    candidateMetadata: mqWorkflowAddressCandidates.metadata,
    candidateSourceJobId: mqWorkflowAddressCandidates.sourceJobId,
    candidateSourceDocumentId: mqWorkflowAddressCandidates.sourceDocumentId,
  }).from(mqWorkflowAddressEvidence)
    .innerJoin(mqWorkflowAddressCandidates, eq(mqWorkflowAddressEvidence.candidateId, mqWorkflowAddressCandidates.id))
    .where(eq(mqWorkflowAddressCandidates.sourceJobId, id))
    .orderBy(desc(mqWorkflowAddressEvidence.createdAt), desc(mqWorkflowAddressEvidence.id))
    .limit(pagination.pageSize)
    .offset((pagination.evidencePage - 1) * pagination.pageSize);
  const verificationRows = verifications.map(row => row.verification);
  const evidence = evidenceRows.map(row => {
    const verification = buildCandidateSourceVerificationContext({
      candidate: { id: row.evidence.candidateId!, sourceJobId: row.candidateSourceJobId, sourceDocumentId: row.candidateSourceDocumentId, metadata: row.candidateMetadata },
      verifications: verificationRows,
    });
    return { ...row.evidence, candidateAddress: row.candidateAddress, verificationStatus: verification.status, ...buildEvidenceTrustDisplay({ sourceType: sourceJob.sourceType, importedTrust: row.evidence.trustTier, verificationStatus: verification.status, verificationTrustTiers: verification.matchingTrustTiers ?? [] }) };
  });
  const candidateAggregate = candidateSummary[0] ?? { totalCandidates: 0, evidenceCount: 0, approvedCount: 0, pendingCount: 0, duplicateCount: 0, conflictCount: 0 };
  const totalEvidence = evidenceSummary[0]?.totalEvidence ?? 0;

  return {
    sourceJob,
    documents,
    candidates,
    verifications,
    evidence,
    downstreamBatches,
    downstreamRegistryRows,
    documentRollup: buildSourceJobDocumentRollup(documents),
    candidateRollup: { ...candidateAggregate, statusDistribution: distribution(candidateStatuses), chainDistribution: distribution(candidateChains), confidenceDistribution: distribution(candidateConfidences) },
    evidenceRollup: { totalEvidence, typeDistribution: distribution(evidenceTypes), trustDistribution: distribution(evidenceTrusts) },
    verificationRollup: buildSourceJobVerificationRollup(verifications.map((row) => row.verification)),
    downstreamRollup: buildSourceJobDownstreamRollup(downstreamBatches, downstreamRegistryRows.map((row) => row.registry)),
    pagination: {
      candidatePage: pagination.candidatePage,
      candidateTotalPages: Math.max(1, Math.ceil(candidateAggregate.totalCandidates / pagination.pageSize)),
      evidencePage: pagination.evidencePage,
      evidenceTotalPages: Math.max(1, Math.ceil(totalEvidence / pagination.pageSize)),
      pageSize: pagination.pageSize,
    },
  };
}

function parseVerificationEvidence(value: string | undefined) {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Verification evidence JSON must be an object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Verification evidence JSON is invalid: ${error.message}`);
    }
    throw new Error("Verification evidence JSON is invalid.");
  }
}

function assertCandidateVerificationScopeMatches(
  candidate: typeof mqWorkflowAddressCandidates.$inferSelect | null,
  verification: {
    verificationScope: string;
    sourceSheet?: string;
    sourceUrl?: string;
  },
) {
  if (!candidate) return;

  if (verification.verificationScope === "source_sheet") {
    const sheetMatch = candidateSourceSheetMatches(candidate.metadata, verification.sourceSheet);
    if (sheetMatch.matchRequired && !sheetMatch.matches) {
      throw new Error(
        `Source sheet verification does not match candidate provenance. Expected one of: ${sheetMatch.knownValues.join(", ")}.`,
      );
    }
  }

  if (verification.verificationScope === "source_url") {
    const urlMatch = candidateSourceUrlMatches(candidate.metadata, verification.sourceUrl);
    if (urlMatch.matchRequired && !urlMatch.matches) {
      throw new Error(
        `Source URL verification does not match candidate provenance. Expected one of: ${urlMatch.knownValues.join(", ")}.`,
      );
    }
  }
}

export async function recordSourceVerification(input: unknown) {
  const actor = await assertPermission("source:verify");
  const parsed = sourceVerificationSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [sourceJob] = await tx.select().from(mqWorkflowSourceJobs).where(eq(mqWorkflowSourceJobs.id, parsed.sourceJobId)).limit(1).for("update");
    let candidateForScope: typeof mqWorkflowAddressCandidates.$inferSelect | null = null;
    if (!sourceJob) {
      throw new Error("Source job not found.");
    }

    if (parsed.sourceDocumentId) {
      const [document] = await tx
        .select()
        .from(mqWorkflowSourceDocuments)
        .where(and(eq(mqWorkflowSourceDocuments.id, parsed.sourceDocumentId), eq(mqWorkflowSourceDocuments.sourceJobId, parsed.sourceJobId)))
        .limit(1);
      if (!document) {
        throw new Error("Source document does not belong to this source job.");
      }
    }

    if (parsed.candidateId) {
      const [candidate] = await tx
        .select()
        .from(mqWorkflowAddressCandidates)
        .where(and(eq(mqWorkflowAddressCandidates.id, parsed.candidateId), eq(mqWorkflowAddressCandidates.sourceJobId, parsed.sourceJobId)))
        .limit(1);
      if (!candidate) {
        throw new Error("Candidate does not belong to this source job.");
      }
      candidateForScope = candidate;
    }

    if (parsed.verificationScope === "source_document" && !parsed.sourceDocumentId) {
      throw new Error("Source document verification requires a source document id.");
    }
    if (parsed.verificationScope === "source_sheet" && !parsed.sourceSheet) {
      throw new Error("Source sheet verification requires a sheet or tab name.");
    }
    if (parsed.verificationScope === "source_url" && !parsed.sourceUrl) {
      throw new Error("Source URL verification requires a source URL.");
    }
    assertCandidateVerificationScopeMatches(candidateForScope, parsed);

    const verificationEvidence = parseVerificationEvidence(parsed.verificationEvidenceJson);
    const evidenceKeys = Object.keys(verificationEvidence).sort((left, right) => left.localeCompare(right));
    const [verification] = await tx
      .insert(mqWorkflowSourceVerifications)
      .values({
        sourceJobId: parsed.sourceJobId,
        sourceDocumentId: parsed.sourceDocumentId ?? null,
        candidateId: parsed.candidateId ?? null,
        verificationScope: parsed.verificationScope,
        sourceSheet: parsed.sourceSheet || null,
        sourceUrl: parsed.sourceUrl || null,
        sourceTrust: parsed.sourceTrust,
        status: parsed.status,
        notes: parsed.notes || null,
        verificationEvidence,
        verifiedBy: actor.id,
      })
      .returning();
    const decisionPayload = buildSourceVerificationDecisionPayload({
      sourceVerificationId: verification.id,
      sourceJobId: parsed.sourceJobId,
      sourceDocumentId: parsed.sourceDocumentId ?? null,
      candidateId: parsed.candidateId ?? null,
      verificationScope: parsed.verificationScope,
      sourceSheet: parsed.sourceSheet ?? null,
      sourceUrl: parsed.sourceUrl ?? null,
      sourceTrust: parsed.sourceTrust,
      status: parsed.status,
      evidenceKeys,
    });

    await tx.insert(mqWorkflowApprovalEvents).values({
      candidateId: parsed.candidateId ?? null,
      action: "source_verification_recorded",
      actorId: actor.id,
      reason: parsed.notes || `${parsed.verificationScope} ${parsed.status}`,
      beforeJson: sourceJob,
      afterJson: verification,
      metadata: decisionPayload,
    });

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "source_verification_recorded",
      targetTable: "mq_workflow_source_verifications",
      targetId: String(verification.id),
      payload: decisionPayload,
    });

    return verification;
  });
}

export async function archiveSourceJob(input: unknown) {
  const actor = await assertPermission("intake:create");
  const parsed = sourceJobArchiveSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(mqWorkflowSourceJobs).where(eq(mqWorkflowSourceJobs.id, parsed.sourceJobId)).limit(1);

    if (!before) {
      throw new Error("Source job not found.");
    }

    const archiveStorageUri = parsed.archiveStorageUri || before.archiveStorageUri;
    if (!archiveStorageUri) {
      throw new Error("Archive storage URI is required before archiving a source job.");
    }

    const metadata = buildSourceJobArchiveMetadata(before.metadata, {
      archiveStorageUri,
      reason: parsed.reason,
      actorEmail: actor.email,
    });

    const [updated] = await tx
      .update(mqWorkflowSourceJobs)
      .set({
        status: "archived",
        archiveStorageUri,
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(mqWorkflowSourceJobs.id, parsed.sourceJobId))
      .returning();

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "source_job_archived",
      targetTable: "mq_workflow_source_jobs",
      targetId: String(parsed.sourceJobId),
      payload: {
        beforeStatus: before.status,
        afterStatus: updated.status,
        archiveStorageUri: updated.archiveStorageUri,
        reason: parsed.reason,
        snapshotPolicy: {
          archivedSourceSnapshotRequired: true,
          sourceDocumentsImmutable: true,
          registryWriteAllowed: false,
          kvWriteAllowed: false,
        },
      },
    });

    return updated;
  });
}

type SourceJobTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

type SourceJobDeletionPlan = {
  preview: SourceJobDeletionPreview;
  sourceJob: typeof mqWorkflowSourceJobs.$inferSelect;
  documentIds: number[];
  candidateIds: number[];
  batchIds: number[];
  evidenceIds: number[];
  verificationIds: number[];
};

function ids(rows: Array<{ id: number }>) {
  return rows.map(row => row.id);
}

async function loadSourceJobDeletionPlan(tx: SourceJobTransaction, sourceJobId: number): Promise<SourceJobDeletionPlan> {
  const [sourceJob] = await tx
    .select()
    .from(mqWorkflowSourceJobs)
    .where(eq(mqWorkflowSourceJobs.id, sourceJobId))
    .limit(1)
    .for("update");
  if (!sourceJob) throw new SourceJobDeletionError(404, "source_job_not_found", "Source job not found.");

  const documents = await tx.select({ id: mqWorkflowSourceDocuments.id }).from(mqWorkflowSourceDocuments).where(eq(mqWorkflowSourceDocuments.sourceJobId, sourceJobId));
  const documentIds = ids(documents);
  const candidates = await tx
    .select({ id: mqWorkflowAddressCandidates.id, candidateStatus: mqWorkflowAddressCandidates.candidateStatus })
    .from(mqWorkflowAddressCandidates)
    .where(eq(mqWorkflowAddressCandidates.sourceJobId, sourceJobId));
  const candidateIds = ids(candidates);

  const directBatchConditions: SQL[] = [eq(mqWorkflowLabelBatches.sourceJobId, sourceJobId)];
  if (documentIds.length) directBatchConditions.push(inArray(mqWorkflowLabelBatches.sourceDocumentId, documentIds));
  const directBatches = await tx.select({ id: mqWorkflowLabelBatches.id }).from(mqWorkflowLabelBatches).where(or(...directBatchConditions));
  const candidateBatchLinks = candidateIds.length
    ? await tx.select({ id: mqWorkflowLabelBatchCandidates.batchId }).from(mqWorkflowLabelBatchCandidates).where(inArray(mqWorkflowLabelBatchCandidates.candidateId, candidateIds))
    : [];
  const batchIds = [...new Set([...ids(directBatches), ...ids(candidateBatchLinks)])];
  const batches = batchIds.length
    ? await tx.select({ id: mqWorkflowLabelBatches.id, status: mqWorkflowLabelBatches.status }).from(mqWorkflowLabelBatches).where(inArray(mqWorkflowLabelBatches.id, batchIds))
    : [];

  const evidenceConditions: SQL[] = [];
  if (candidateIds.length) evidenceConditions.push(inArray(mqWorkflowAddressEvidence.candidateId, candidateIds));
  if (documentIds.length) evidenceConditions.push(inArray(mqWorkflowAddressEvidence.sourceDocumentId, documentIds));
  if (batchIds.length) evidenceConditions.push(inArray(mqWorkflowAddressEvidence.batchId, batchIds));
  const evidence = evidenceConditions.length
    ? await tx.select({ id: mqWorkflowAddressEvidence.id, registryId: mqWorkflowAddressEvidence.registryId, batchId: mqWorkflowAddressEvidence.batchId }).from(mqWorkflowAddressEvidence).where(or(...evidenceConditions))
    : [];

  const verificationConditions: SQL[] = [eq(mqWorkflowSourceVerifications.sourceJobId, sourceJobId)];
  if (documentIds.length) verificationConditions.push(inArray(mqWorkflowSourceVerifications.sourceDocumentId, documentIds));
  if (candidateIds.length) verificationConditions.push(inArray(mqWorkflowSourceVerifications.candidateId, candidateIds));
  const verifications = await tx.select({ id: mqWorkflowSourceVerifications.id }).from(mqWorkflowSourceVerifications).where(or(...verificationConditions));

  const approvalConditions: SQL[] = [];
  if (candidateIds.length) approvalConditions.push(inArray(mqWorkflowApprovalEvents.candidateId, candidateIds));
  if (batchIds.length) approvalConditions.push(inArray(mqWorkflowApprovalEvents.batchId, batchIds));
  const approvalEvents = approvalConditions.length
    ? await tx.select({ id: mqWorkflowApprovalEvents.id, registryId: mqWorkflowApprovalEvents.registryId, batchId: mqWorkflowApprovalEvents.batchId }).from(mqWorkflowApprovalEvents).where(or(...approvalConditions))
    : [];

  const registryConditions: SQL[] = [eq(mqRegistryAddressLabels.primarySourceJobId, sourceJobId)];
  if (batchIds.length) registryConditions.push(inArray(mqRegistryAddressLabels.approvedBatchId, batchIds));
  const registryRows = await tx.select({ id: mqRegistryAddressLabels.id }).from(mqRegistryAddressLabels).where(or(...registryConditions));
  const kvBuilds = batchIds.length
    ? await tx.select({ id: mqBuildKvBuilds.id }).from(mqBuildKvBuilds).where(inArray(mqBuildKvBuilds.lastCommittedBatchId, batchIds))
    : [];
  const kvIndexManifests = batchIds.length
    ? await tx.select({ id: mqBuildIndexManifests.id }).from(mqBuildIndexManifests).where(inArray(mqBuildIndexManifests.lastCommittedBatchId, batchIds))
    : [];
  const candidateReferences = candidateIds.length
    ? await tx
        .select({ id: mqWorkflowAddressCandidates.id, sourceJobId: mqWorkflowAddressCandidates.sourceJobId })
        .from(mqWorkflowAddressCandidates)
        .where(inArray(mqWorkflowAddressCandidates.duplicateOfCandidateId, candidateIds))
    : [];
  const externalCandidateReferences = candidateReferences.filter(candidate => candidate.sourceJobId !== sourceJobId);
  const supersedingBatches = batchIds.length
    ? await tx
        .select({ id: mqWorkflowLabelBatches.id })
        .from(mqWorkflowLabelBatches)
        .where(and(inArray(mqWorkflowLabelBatches.supersedesBatchId, batchIds), not(inArray(mqWorkflowLabelBatches.id, batchIds))))
    : [];
  const batchEvidence = batchIds.length
    ? await tx.select({ id: mqWorkflowLabelBatchEvidence.id }).from(mqWorkflowLabelBatchEvidence).where(inArray(mqWorkflowLabelBatchEvidence.batchId, batchIds))
    : [];
  const evidenceBatchLinks = evidence.length
    ? await tx
        .select({ id: mqWorkflowLabelBatchEvidence.id, batchId: mqWorkflowLabelBatchEvidence.batchId })
        .from(mqWorkflowLabelBatchEvidence)
        .where(inArray(mqWorkflowLabelBatchEvidence.evidenceId, ids(evidence)))
    : [];
  const linkedBatchIds = new Set(batchIds);
  const externalEvidenceBatchLinks = evidence.filter(row => row.batchId !== null && !linkedBatchIds.has(row.batchId));
  const externalApprovalBatchLinks = approvalEvents.filter(row => row.batchId !== null && !linkedBatchIds.has(row.batchId));
  const externalBatchEvidenceLinks = evidenceBatchLinks.filter(row => row.batchId !== null && !linkedBatchIds.has(row.batchId));

  const protectedBatches = batches.filter(batch => batch.status !== "draft" && batch.status !== "failed");
  const preview = buildSourceJobDeletionPreview({
    sourceJobId,
    sourceName: sourceJob.sourceName,
    sourceStatus: sourceJob.status,
    counts: {
      sourceDocuments: documentIds.length,
      candidates: candidateIds.length,
      approvedCandidates: candidates.filter(candidate => candidate.candidateStatus === "approved").length,
      evidence: evidence.length + batchEvidence.length,
      verifications: verifications.length,
      batches: batchIds.length,
      protectedBatches: protectedBatches.length,
      registryRows: registryRows.length,
      kvBuildReferences: kvBuilds.length + kvIndexManifests.length,
      canonicalEvidence: evidence.filter(row => row.registryId !== null).length,
      canonicalApprovalEvents: approvalEvents.filter(row => row.registryId !== null).length,
      externalCandidateReferences: externalCandidateReferences.length,
      supersedingBatches: supersedingBatches.length,
      externalEvidenceBatchLinks: externalEvidenceBatchLinks.length,
      externalApprovalBatchLinks: externalApprovalBatchLinks.length,
      externalBatchEvidenceLinks: externalBatchEvidenceLinks.length,
    },
  });

  return {
    preview,
    sourceJob,
    documentIds,
    candidateIds,
    batchIds,
    evidenceIds: ids(evidence),
    verificationIds: ids(verifications),
  };
}

export async function getSourceJobDeletionPreview(sourceJobId: number) {
  await assertPermission("intake:delete");
  if (!Number.isInteger(sourceJobId) || sourceJobId <= 0) throw new SourceJobDeletionError(404, "source_job_not_found", "Source job not found.");
  return getDb().transaction(async tx => (await loadSourceJobDeletionPlan(tx, sourceJobId)).preview);
}

export async function deletePendingSourceJob(input: unknown) {
  const actor = await assertPermission("intake:delete");
  const parsed = sourceJobDeletionSchema.parse(input);
  if (!isSourceJobDeleteConfirmation(parsed.sourceJobId, parsed.confirmation)) {
    throw new SourceJobDeletionError(400, "invalid_confirmation", `Confirmation must exactly equal DELETE ${parsed.sourceJobId}.`);
  }

  return getDb().transaction(async tx => {
    const plan = await loadSourceJobDeletionPlan(tx, parsed.sourceJobId);
    if (!plan.preview.deletable) {
      throw new SourceJobDeletionError(409, "source_job_deletion_blocked", "Source job has protected downstream dependencies.", {
        blockers: plan.preview.blockers,
        preview: plan.preview,
      });
    }

    const deletionTimestamp = new Date();
    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "source_job_deleted",
      targetTable: "mq_workflow_source_jobs",
      targetId: String(parsed.sourceJobId),
      payload: {
        sourceName: plan.sourceJob.sourceName,
        sourceStatus: plan.sourceJob.status,
        deletedCounts: plan.preview.counts,
        actor: { id: actor.id, email: actor.email, name: actor.name, role: actor.role },
        confirmation: parsed.confirmation,
        deletionTimestamp: deletionTimestamp.toISOString(),
      },
    });

    if (plan.batchIds.length) await tx.delete(mqWorkflowLabelBatchEvidence).where(inArray(mqWorkflowLabelBatchEvidence.batchId, plan.batchIds));
    const approvalConditions: SQL[] = [];
    if (plan.candidateIds.length) approvalConditions.push(inArray(mqWorkflowApprovalEvents.candidateId, plan.candidateIds));
    if (plan.batchIds.length) approvalConditions.push(inArray(mqWorkflowApprovalEvents.batchId, plan.batchIds));
    if (approvalConditions.length) await tx.delete(mqWorkflowApprovalEvents).where(or(...approvalConditions));
    const batchCandidateConditions: SQL[] = [];
    if (plan.candidateIds.length) batchCandidateConditions.push(inArray(mqWorkflowLabelBatchCandidates.candidateId, plan.candidateIds));
    if (plan.batchIds.length) batchCandidateConditions.push(inArray(mqWorkflowLabelBatchCandidates.batchId, plan.batchIds));
    if (batchCandidateConditions.length) await tx.delete(mqWorkflowLabelBatchCandidates).where(or(...batchCandidateConditions));
    if (plan.evidenceIds.length) await tx.delete(mqWorkflowAddressEvidence).where(inArray(mqWorkflowAddressEvidence.id, plan.evidenceIds));
    if (plan.verificationIds.length) await tx.delete(mqWorkflowSourceVerifications).where(inArray(mqWorkflowSourceVerifications.id, plan.verificationIds));
    if (plan.batchIds.length) await tx.delete(mqWorkflowLabelBatches).where(inArray(mqWorkflowLabelBatches.id, plan.batchIds));
    if (plan.candidateIds.length) await tx.delete(mqWorkflowAddressCandidates).where(inArray(mqWorkflowAddressCandidates.id, plan.candidateIds));
    if (plan.documentIds.length) await tx.delete(mqWorkflowSourceDocuments).where(inArray(mqWorkflowSourceDocuments.id, plan.documentIds));
    const deleted = await tx.delete(mqWorkflowSourceJobs).where(eq(mqWorkflowSourceJobs.id, parsed.sourceJobId)).returning({ id: mqWorkflowSourceJobs.id });
    if (deleted.length !== 1) throw new Error("Source job deletion did not remove exactly one row.");

    return { sourceJobId: parsed.sourceJobId, deletedCounts: plan.preview.counts };
  });
}
