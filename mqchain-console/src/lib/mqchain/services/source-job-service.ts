import { and, asc, desc, eq, ilike, inArray, not, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressCandidates,
  mqAddressEvidence,
  mqAddressRegistry,
  mqApprovalEvents,
  mqAuditLog,
  mqEntities,
  mqKvRoleDict,
  mqKvBuilds,
  mqKvIndexManifests,
  mqLabelBatchCandidates,
  mqLabelBatchEvidence,
  mqLabelBatches,
  mqProtocols,
  mqSourceDocuments,
  mqSourceJobs,
  mqSourceVerifications,
  mqUsers,
} from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";
import { parseSourceJobListFilters, type SourceJobListFilters } from "../list-filters";
import {
  buildSourceJobArchiveMetadata,
  buildSourceJobCandidateRollup,
  buildSourceJobDocumentRollup,
  buildSourceJobDownstreamRollup,
  buildSourceJobEvidenceRollup,
  buildSourceVerificationDecisionPayload,
  buildSourceJobVerificationRollup,
} from "../source-job";
import { candidateSourceSheetMatches, candidateSourceUrlMatches } from "../candidate-detail";
import { buildSourceJobDeletionPreview, SourceJobDeletionError, type SourceJobDeletionPreview } from "../source-job-deletion";
import { isSourceJobDeleteConfirmation, sourceJobDeletionSchema, sourceJobArchiveSchema, sourceVerificationSchema } from "../validators/source-job";

function sourceJobOrderBy(sort: SourceJobListFilters["sort"]) {
  if (sort === "updated_at") return desc(mqSourceJobs.updatedAt);
  if (sort === "source_type") return asc(mqSourceJobs.sourceType);
  if (sort === "status") return asc(mqSourceJobs.status);
  return desc(mqSourceJobs.createdAt);
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
        ilike(mqSourceJobs.sourceName, `%${filters.q}%`),
        ilike(mqSourceJobs.sourceUrl, `%${filters.q}%`),
        ilike(mqSourceJobs.localFileName, `%${filters.q}%`),
        ilike(mqSourceJobs.archiveStorageUri, `%${filters.q}%`),
      ),
    );
  }

  if (filters.sourceType) {
    conditions.push(eq(mqSourceJobs.sourceType, filters.sourceType));
  }

  if (filters.status) {
    conditions.push(eq(mqSourceJobs.status, filters.status));
  }

  if (filters.entity) {
    conditions.push(ilike(mqSourceJobs.entityHint, `%${filters.entity}%`));
  }

  if (filters.protocol) {
    conditions.push(ilike(mqSourceJobs.protocolHint, `%${filters.protocol}%`));
  }

  if (filters.chain) {
    conditions.push(sql`${filters.chain} = any(${mqSourceJobs.chainScope})`);
  }

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(mqSourceJobs).where(where);
  const rows = await db
    .select()
    .from(mqSourceJobs)
    .where(where)
    .orderBy(sourceJobOrderBy(filters.sort), desc(mqSourceJobs.id))
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

export async function getSourceJob(id: number) {
  const db = getDb();
  const [sourceJob] = await db.select().from(mqSourceJobs).where(eq(mqSourceJobs.id, id)).limit(1);

  if (!sourceJob) {
    return null;
  }

  const [documents, candidates, downstreamBatches, verifications, downstreamRegistryRows] = await Promise.all([
    db.select().from(mqSourceDocuments).where(eq(mqSourceDocuments.sourceJobId, id)),
    db.select().from(mqAddressCandidates).where(eq(mqAddressCandidates.sourceJobId, id)).orderBy(desc(mqAddressCandidates.createdAt)),
    db.select().from(mqLabelBatches).where(eq(mqLabelBatches.sourceJobId, id)).orderBy(desc(mqLabelBatches.createdAt)),
    db
      .select({
        verification: mqSourceVerifications,
        verifierEmail: mqUsers.email,
        verifierName: mqUsers.displayName,
      })
      .from(mqSourceVerifications)
      .leftJoin(mqUsers, eq(mqSourceVerifications.verifiedBy, mqUsers.id))
      .where(eq(mqSourceVerifications.sourceJobId, id))
      .orderBy(desc(mqSourceVerifications.createdAt)),
    db
      .select({
        registry: mqAddressRegistry,
        entityName: mqEntities.entityName,
        protocolName: mqProtocols.protocolName,
        roleCode: mqKvRoleDict.roleCode,
      })
      .from(mqAddressRegistry)
      .leftJoin(mqEntities, eq(mqAddressRegistry.entityId, mqEntities.id))
      .leftJoin(mqProtocols, eq(mqAddressRegistry.protocolId, mqProtocols.id))
      .leftJoin(mqKvRoleDict, eq(mqAddressRegistry.roleId, mqKvRoleDict.roleId))
      .where(eq(mqAddressRegistry.primarySourceJobId, id))
      .orderBy(desc(mqAddressRegistry.createdAt)),
  ]);

  const candidateIds = candidates.map((candidate) => candidate.id);
  const evidence = candidateIds.length
    ? await db
        .select()
        .from(mqAddressEvidence)
        .where(inArray(mqAddressEvidence.candidateId, candidateIds))
        .orderBy(desc(mqAddressEvidence.createdAt))
    : [];

  return {
    sourceJob,
    documents,
    candidates,
    verifications,
    evidence,
    downstreamBatches,
    downstreamRegistryRows,
    documentRollup: buildSourceJobDocumentRollup(documents),
    candidateRollup: buildSourceJobCandidateRollup(candidates),
    evidenceRollup: buildSourceJobEvidenceRollup(evidence),
    verificationRollup: buildSourceJobVerificationRollup(verifications.map((row) => row.verification)),
    downstreamRollup: buildSourceJobDownstreamRollup(downstreamBatches, downstreamRegistryRows.map((row) => row.registry)),
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
  candidate: typeof mqAddressCandidates.$inferSelect | null,
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
    const [sourceJob] = await tx.select().from(mqSourceJobs).where(eq(mqSourceJobs.id, parsed.sourceJobId)).limit(1).for("update");
    let candidateForScope: typeof mqAddressCandidates.$inferSelect | null = null;
    if (!sourceJob) {
      throw new Error("Source job not found.");
    }

    if (parsed.sourceDocumentId) {
      const [document] = await tx
        .select()
        .from(mqSourceDocuments)
        .where(and(eq(mqSourceDocuments.id, parsed.sourceDocumentId), eq(mqSourceDocuments.sourceJobId, parsed.sourceJobId)))
        .limit(1);
      if (!document) {
        throw new Error("Source document does not belong to this source job.");
      }
    }

    if (parsed.candidateId) {
      const [candidate] = await tx
        .select()
        .from(mqAddressCandidates)
        .where(and(eq(mqAddressCandidates.id, parsed.candidateId), eq(mqAddressCandidates.sourceJobId, parsed.sourceJobId)))
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
      .insert(mqSourceVerifications)
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

    await tx.insert(mqApprovalEvents).values({
      candidateId: parsed.candidateId ?? null,
      action: "source_verification_recorded",
      actorId: actor.id,
      reason: parsed.notes || `${parsed.verificationScope} ${parsed.status}`,
      beforeJson: sourceJob,
      afterJson: verification,
      metadata: decisionPayload,
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "source_verification_recorded",
      targetTable: "mq_source_verifications",
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
    const [before] = await tx.select().from(mqSourceJobs).where(eq(mqSourceJobs.id, parsed.sourceJobId)).limit(1);

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
      .update(mqSourceJobs)
      .set({
        status: "archived",
        archiveStorageUri,
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(mqSourceJobs.id, parsed.sourceJobId))
      .returning();

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "source_job_archived",
      targetTable: "mq_source_jobs",
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
  sourceJob: typeof mqSourceJobs.$inferSelect;
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
    .from(mqSourceJobs)
    .where(eq(mqSourceJobs.id, sourceJobId))
    .limit(1)
    .for("update");
  if (!sourceJob) throw new SourceJobDeletionError(404, "source_job_not_found", "Source job not found.");

  const documents = await tx.select({ id: mqSourceDocuments.id }).from(mqSourceDocuments).where(eq(mqSourceDocuments.sourceJobId, sourceJobId));
  const documentIds = ids(documents);
  const candidates = await tx
    .select({ id: mqAddressCandidates.id, candidateStatus: mqAddressCandidates.candidateStatus })
    .from(mqAddressCandidates)
    .where(eq(mqAddressCandidates.sourceJobId, sourceJobId));
  const candidateIds = ids(candidates);

  const directBatchConditions: SQL[] = [eq(mqLabelBatches.sourceJobId, sourceJobId)];
  if (documentIds.length) directBatchConditions.push(inArray(mqLabelBatches.sourceDocumentId, documentIds));
  const directBatches = await tx.select({ id: mqLabelBatches.id }).from(mqLabelBatches).where(or(...directBatchConditions));
  const candidateBatchLinks = candidateIds.length
    ? await tx.select({ id: mqLabelBatchCandidates.batchId }).from(mqLabelBatchCandidates).where(inArray(mqLabelBatchCandidates.candidateId, candidateIds))
    : [];
  const batchIds = [...new Set([...ids(directBatches), ...ids(candidateBatchLinks)])];
  const batches = batchIds.length
    ? await tx.select({ id: mqLabelBatches.id, status: mqLabelBatches.status }).from(mqLabelBatches).where(inArray(mqLabelBatches.id, batchIds))
    : [];

  const evidenceConditions: SQL[] = [];
  if (candidateIds.length) evidenceConditions.push(inArray(mqAddressEvidence.candidateId, candidateIds));
  if (documentIds.length) evidenceConditions.push(inArray(mqAddressEvidence.sourceDocumentId, documentIds));
  if (batchIds.length) evidenceConditions.push(inArray(mqAddressEvidence.batchId, batchIds));
  const evidence = evidenceConditions.length
    ? await tx.select({ id: mqAddressEvidence.id, registryId: mqAddressEvidence.registryId, batchId: mqAddressEvidence.batchId }).from(mqAddressEvidence).where(or(...evidenceConditions))
    : [];

  const verificationConditions: SQL[] = [eq(mqSourceVerifications.sourceJobId, sourceJobId)];
  if (documentIds.length) verificationConditions.push(inArray(mqSourceVerifications.sourceDocumentId, documentIds));
  if (candidateIds.length) verificationConditions.push(inArray(mqSourceVerifications.candidateId, candidateIds));
  const verifications = await tx.select({ id: mqSourceVerifications.id }).from(mqSourceVerifications).where(or(...verificationConditions));

  const approvalConditions: SQL[] = [];
  if (candidateIds.length) approvalConditions.push(inArray(mqApprovalEvents.candidateId, candidateIds));
  if (batchIds.length) approvalConditions.push(inArray(mqApprovalEvents.batchId, batchIds));
  const approvalEvents = approvalConditions.length
    ? await tx.select({ id: mqApprovalEvents.id, registryId: mqApprovalEvents.registryId, batchId: mqApprovalEvents.batchId }).from(mqApprovalEvents).where(or(...approvalConditions))
    : [];

  const registryConditions: SQL[] = [eq(mqAddressRegistry.primarySourceJobId, sourceJobId)];
  if (batchIds.length) registryConditions.push(inArray(mqAddressRegistry.approvedBatchId, batchIds));
  const registryRows = await tx.select({ id: mqAddressRegistry.id }).from(mqAddressRegistry).where(or(...registryConditions));
  const kvBuilds = batchIds.length
    ? await tx.select({ id: mqKvBuilds.id }).from(mqKvBuilds).where(inArray(mqKvBuilds.lastCommittedBatchId, batchIds))
    : [];
  const kvIndexManifests = batchIds.length
    ? await tx.select({ id: mqKvIndexManifests.id }).from(mqKvIndexManifests).where(inArray(mqKvIndexManifests.lastCommittedBatchId, batchIds))
    : [];
  const candidateReferences = candidateIds.length
    ? await tx
        .select({ id: mqAddressCandidates.id, sourceJobId: mqAddressCandidates.sourceJobId })
        .from(mqAddressCandidates)
        .where(inArray(mqAddressCandidates.duplicateOfCandidateId, candidateIds))
    : [];
  const externalCandidateReferences = candidateReferences.filter(candidate => candidate.sourceJobId !== sourceJobId);
  const supersedingBatches = batchIds.length
    ? await tx
        .select({ id: mqLabelBatches.id })
        .from(mqLabelBatches)
        .where(and(inArray(mqLabelBatches.supersedesBatchId, batchIds), not(inArray(mqLabelBatches.id, batchIds))))
    : [];
  const batchEvidence = batchIds.length
    ? await tx.select({ id: mqLabelBatchEvidence.id }).from(mqLabelBatchEvidence).where(inArray(mqLabelBatchEvidence.batchId, batchIds))
    : [];
  const evidenceBatchLinks = evidence.length
    ? await tx
        .select({ id: mqLabelBatchEvidence.id, batchId: mqLabelBatchEvidence.batchId })
        .from(mqLabelBatchEvidence)
        .where(inArray(mqLabelBatchEvidence.evidenceId, ids(evidence)))
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
    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "source_job_deleted",
      targetTable: "mq_source_jobs",
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

    if (plan.batchIds.length) await tx.delete(mqLabelBatchEvidence).where(inArray(mqLabelBatchEvidence.batchId, plan.batchIds));
    const approvalConditions: SQL[] = [];
    if (plan.candidateIds.length) approvalConditions.push(inArray(mqApprovalEvents.candidateId, plan.candidateIds));
    if (plan.batchIds.length) approvalConditions.push(inArray(mqApprovalEvents.batchId, plan.batchIds));
    if (approvalConditions.length) await tx.delete(mqApprovalEvents).where(or(...approvalConditions));
    const batchCandidateConditions: SQL[] = [];
    if (plan.candidateIds.length) batchCandidateConditions.push(inArray(mqLabelBatchCandidates.candidateId, plan.candidateIds));
    if (plan.batchIds.length) batchCandidateConditions.push(inArray(mqLabelBatchCandidates.batchId, plan.batchIds));
    if (batchCandidateConditions.length) await tx.delete(mqLabelBatchCandidates).where(or(...batchCandidateConditions));
    if (plan.evidenceIds.length) await tx.delete(mqAddressEvidence).where(inArray(mqAddressEvidence.id, plan.evidenceIds));
    if (plan.verificationIds.length) await tx.delete(mqSourceVerifications).where(inArray(mqSourceVerifications.id, plan.verificationIds));
    if (plan.batchIds.length) await tx.delete(mqLabelBatches).where(inArray(mqLabelBatches.id, plan.batchIds));
    if (plan.candidateIds.length) await tx.delete(mqAddressCandidates).where(inArray(mqAddressCandidates.id, plan.candidateIds));
    if (plan.documentIds.length) await tx.delete(mqSourceDocuments).where(inArray(mqSourceDocuments.id, plan.documentIds));
    const deleted = await tx.delete(mqSourceJobs).where(eq(mqSourceJobs.id, parsed.sourceJobId)).returning({ id: mqSourceJobs.id });
    if (deleted.length !== 1) throw new Error("Source job deletion did not remove exactly one row.");

    return { sourceJobId: parsed.sourceJobId, deletedCounts: plan.preview.counts };
  });
}
