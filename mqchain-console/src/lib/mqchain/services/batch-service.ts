import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqWorkflowAddressCandidates,
  mqDictAddressCodecs,
  mqWorkflowAddressEvidence,
  mqDictAddressNamespaces,
  mqRegistryAddressLabels,
  mqWorkflowApprovalEvents,
  mqAuditEvents,
  mqDictEntities,
  mqBuildKvBuilds,
  mqDictRoles,
  mqWorkflowLabelBatchCandidates,
  mqWorkflowLabelBatchEvidence,
  mqWorkflowLabelBatches,
  mqDictProtocols,
  mqWorkflowSourceDocuments,
  mqWorkflowSourceVerifications,
  mqWorkflowSourceJobs,
} from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";
import {
  buildBatchCandidateRollups,
  buildBatchEvidenceRollups,
  buildBatchKvHandoffAuditPayload,
  buildBatchLifecycleAuditPayload,
  buildBatchRegistryRollup,
} from "../batch-detail";
import { assertBatchCandidatesStillApproved, assertSelectedCandidatesApproved, type BatchCandidateReadinessRow } from "../batch-readiness";
import { buildBatchSourceProvenance } from "../batch-source";
import { buildCandidateSourceVerificationContext } from "../candidate-detail";
import { LABEL_STATUS } from "../constants";
import { effectiveCategoryId } from "../effective-category";
import { markHistoricalOnlyFlags } from "../flags";
import { validateU1AddressKey } from "../kv/contract";
import { parseBatchListFilters, type BatchListFilters } from "../list-filters";
import {
  describeRegistryCommitTarget,
  findRegistryCommitConflict,
  type RegistryCommitTarget,
} from "../registry-conflicts";
import { buildRegistryCommitMetadata } from "../registry-provenance";
import { batchIdSchema, batchLifecycleSchema, createBatchSchema } from "../validators/batch";
import { recordDictionaryVersion } from "./dictionary-service";
import { createFullKvBuildRequest } from "./full-kv-build-service";
import { hashJson, optionalNumber } from "./service-utils";

export class BatchLifecycleError extends Error {
  readonly status = 409 as const;
  constructor(readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = "BatchLifecycleError";
  }
}

function getApprovalDraft(candidate: typeof mqWorkflowAddressCandidates.$inferSelect) {
  const metadata = candidate.metadata as { approvalDraft?: Record<string, unknown> } | null;
  return metadata?.approvalDraft ?? {};
}

async function buildBatchCandidateReadinessRows(
  tx: Pick<ReturnType<typeof getDb>, "select">,
  candidates: (typeof mqWorkflowAddressCandidates.$inferSelect)[],
): Promise<BatchCandidateReadinessRow[]> {
  const candidateIds = candidates.map((candidate) => candidate.id);
  if (!candidateIds.length) {
    return [];
  }

  const sourceJobIds = Array.from(
    new Set(candidates.map((candidate) => candidate.sourceJobId).filter((id): id is number => typeof id === "number")),
  );
  const sourceDocumentIds = Array.from(
    new Set(candidates.map((candidate) => candidate.sourceDocumentId).filter((id): id is number => typeof id === "number")),
  );
  const verificationRowsById = new Map<number, typeof mqWorkflowSourceVerifications.$inferSelect>();
  const verificationQueries = [
    tx.select().from(mqWorkflowSourceVerifications).where(inArray(mqWorkflowSourceVerifications.candidateId, candidateIds)),
    sourceJobIds.length
      ? tx.select().from(mqWorkflowSourceVerifications).where(inArray(mqWorkflowSourceVerifications.sourceJobId, sourceJobIds))
      : Promise.resolve([]),
    sourceDocumentIds.length
      ? tx.select().from(mqWorkflowSourceVerifications).where(inArray(mqWorkflowSourceVerifications.sourceDocumentId, sourceDocumentIds))
      : Promise.resolve([]),
  ];

  for (const verifications of await Promise.all(verificationQueries)) {
    for (const verification of verifications) {
      verificationRowsById.set(verification.id, verification);
    }
  }

  const verificationRows = Array.from(verificationRowsById.values());
  return candidates.map((candidate) => {
    const context = buildCandidateSourceVerificationContext({
      candidate: {
        id: candidate.id,
        sourceJobId: candidate.sourceJobId,
        sourceDocumentId: candidate.sourceDocumentId,
        metadata: candidate.metadata,
      },
      verifications: verificationRows.filter((verification) => {
        if (verification.candidateId === candidate.id) return true;
        if (candidate.sourceDocumentId && verification.sourceDocumentId === candidate.sourceDocumentId) return true;
        return Boolean(candidate.sourceJobId && verification.sourceJobId === candidate.sourceJobId);
      }),
    });

    return {
      id: candidate.id,
      candidateStatus: candidate.candidateStatus,
      evidenceCount: candidate.evidenceCount,
      sourceVerificationStatus: context.status,
    };
  });
}

function batchOrderBy(sort: BatchListFilters["sort"]) {
  if (sort === "updated_at") return desc(mqWorkflowLabelBatches.updatedAt);
  if (sort === "status") return asc(mqWorkflowLabelBatches.status);
  if (sort === "accepted_count") return desc(mqWorkflowLabelBatches.acceptedCount);
  if (sort === "committed_at") return desc(mqWorkflowLabelBatches.committedAt);
  return desc(mqWorkflowLabelBatches.createdAt);
}

function addCondition(conditions: SQL[], condition: SQL | undefined) {
  if (condition) conditions.push(condition);
}

export async function listBatches(input: unknown = {}) {
  const filters = typeof input === "number" ? parseBatchListFilters({ pageSize: input }) : parseBatchListFilters(input);
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqWorkflowLabelBatches.sourceName, `%${filters.q}%`),
        ilike(mqWorkflowLabelBatches.sourceUrl, `%${filters.q}%`),
        ilike(mqWorkflowLabelBatches.batchHash, `%${filters.q}%`),
        ilike(mqWorkflowLabelBatches.evidenceHash, `%${filters.q}%`),
        ilike(mqWorkflowLabelBatches.storageUri, `%${filters.q}%`),
        sql`${mqWorkflowLabelBatches.id}::text ilike ${`%${filters.q}%`}`,
      ),
    );
  }

  if (filters.status) conditions.push(eq(mqWorkflowLabelBatches.status, filters.status));
  if (filters.sourceType) conditions.push(ilike(mqWorkflowLabelBatches.sourceType, `%${filters.sourceType}%`));
  if (filters.labelAction) conditions.push(ilike(mqWorkflowLabelBatches.labelAction, `%${filters.labelAction}%`));
  if (filters.entity) {
    addCondition(
      conditions,
      or(
        sql`${mqWorkflowLabelBatches.entityId}::text ilike ${`%${filters.entity}%`}`,
        ilike(mqDictEntities.entityCode, `%${filters.entity}%`),
        ilike(mqDictEntities.entityName, `%${filters.entity}%`),
      ),
    );
  }
  if (filters.protocol) {
    addCondition(
      conditions,
      or(
        sql`${mqWorkflowLabelBatches.protocolId}::text ilike ${`%${filters.protocol}%`}`,
        ilike(mqDictProtocols.protocolCode, `%${filters.protocol}%`),
        ilike(mqDictProtocols.protocolName, `%${filters.protocol}%`),
      ),
    );
  }
  if (filters.role) {
    addCondition(
      conditions,
      or(
        sql`${mqWorkflowLabelBatches.roleId}::text ilike ${`%${filters.role}%`}`,
        ilike(mqDictRoles.roleCode, `%${filters.role}%`),
        ilike(mqDictRoles.roleName, `%${filters.role}%`),
      ),
    );
  }

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqWorkflowLabelBatches)
    .leftJoin(mqDictEntities, eq(mqWorkflowLabelBatches.entityId, mqDictEntities.id))
    .leftJoin(mqDictProtocols, eq(mqWorkflowLabelBatches.protocolId, mqDictProtocols.id))
    .leftJoin(mqDictRoles, eq(mqWorkflowLabelBatches.roleId, mqDictRoles.roleId))
    .where(where);
  const rows = await db
    .select({ batch: mqWorkflowLabelBatches, entity: mqDictEntities, protocol: mqDictProtocols, role: mqDictRoles })
    .from(mqWorkflowLabelBatches)
    .leftJoin(mqDictEntities, eq(mqWorkflowLabelBatches.entityId, mqDictEntities.id))
    .leftJoin(mqDictProtocols, eq(mqWorkflowLabelBatches.protocolId, mqDictProtocols.id))
    .leftJoin(mqDictRoles, eq(mqWorkflowLabelBatches.roleId, mqDictRoles.roleId))
    .where(where)
    .orderBy(batchOrderBy(filters.sort), desc(mqWorkflowLabelBatches.id))
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

export async function getBatchDetail(batchId: number) {
  const db = getDb();
  const [batch] = await db.select().from(mqWorkflowLabelBatches).where(eq(mqWorkflowLabelBatches.id, batchId)).limit(1);

  if (!batch) {
    return null;
  }

  const candidateRows = await db
    .select({ candidate: mqWorkflowAddressCandidates })
    .from(mqWorkflowLabelBatchCandidates)
    .innerJoin(mqWorkflowAddressCandidates, eq(mqWorkflowLabelBatchCandidates.candidateId, mqWorkflowAddressCandidates.id))
    .where(eq(mqWorkflowLabelBatchCandidates.batchId, batchId))
    .orderBy(desc(mqWorkflowAddressCandidates.createdAt));

  const candidates = candidateRows.map((row) => row.candidate);
  const candidateIds = candidates.map((candidate) => candidate.id);
  const candidateEvidenceQuery = candidateIds.length
    ? db
        .select()
        .from(mqWorkflowAddressEvidence)
        .where(inArray(mqWorkflowAddressEvidence.candidateId, candidateIds))
        .orderBy(desc(mqWorkflowAddressEvidence.createdAt))
    : Promise.resolve([]);

  const [sourceJob, sourceDocument, entity, protocol, role, candidateEvidence, batchEvidence, approvalEvents, kvBuilds, registryRows] = await Promise.all([
    batch.sourceJobId ? db.select().from(mqWorkflowSourceJobs).where(eq(mqWorkflowSourceJobs.id, batch.sourceJobId)).limit(1) : Promise.resolve([]),
    batch.sourceDocumentId
      ? db.select().from(mqWorkflowSourceDocuments).where(eq(mqWorkflowSourceDocuments.id, batch.sourceDocumentId)).limit(1)
      : Promise.resolve([]),
    batch.entityId ? db.select().from(mqDictEntities).where(eq(mqDictEntities.id, batch.entityId)).limit(1) : Promise.resolve([]),
    batch.protocolId ? db.select().from(mqDictProtocols).where(eq(mqDictProtocols.id, batch.protocolId)).limit(1) : Promise.resolve([]),
    batch.roleId ? db.select().from(mqDictRoles).where(eq(mqDictRoles.roleId, batch.roleId)).limit(1) : Promise.resolve([]),
    candidateEvidenceQuery,
    db.select().from(mqWorkflowLabelBatchEvidence).where(eq(mqWorkflowLabelBatchEvidence.batchId, batchId)).orderBy(desc(mqWorkflowLabelBatchEvidence.createdAt)),
    db.select().from(mqWorkflowApprovalEvents).where(eq(mqWorkflowApprovalEvents.batchId, batchId)).orderBy(desc(mqWorkflowApprovalEvents.createdAt)).limit(50),
    db
      .select()
      .from(mqBuildKvBuilds)
      .where(sql`${mqBuildKvBuilds.manifest}->>'batchId' = ${String(batchId)}`)
      .orderBy(desc(mqBuildKvBuilds.createdAt))
      .limit(10),
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
      .where(eq(mqRegistryAddressLabels.approvedBatchId, batchId))
      .orderBy(desc(mqRegistryAddressLabels.createdAt)),
  ]);
  const candidateReadiness = await buildBatchCandidateReadinessRows(db, candidates);

  return {
    batch,
    candidates,
    candidateReadiness,
    sourceJob: sourceJob[0] ?? null,
    sourceDocument: sourceDocument[0] ?? null,
    entity: entity[0] ?? null,
    protocol: protocol[0] ?? null,
    role: role[0] ?? null,
    candidateEvidence,
    batchEvidence,
    approvalEvents,
    kvBuilds,
    registryRows,
    candidateRollup: buildBatchCandidateRollups(candidates),
    evidenceRollup: buildBatchEvidenceRollups(candidateEvidence),
    registryRollup: buildBatchRegistryRollup(registryRows.map((row) => row.registry)),
  };
}

export async function createBatchFromCandidates(input: unknown) {
  const actor = await assertPermission("candidate:review");
  const parsed = createBatchSchema.parse(input);

  if (!parsed.candidateIds.length) {
    throw new Error("No valid candidate IDs were provided.");
  }

  const db = getDb();

  return db.transaction(async (tx) => {
    const candidates = await tx.select().from(mqWorkflowAddressCandidates).where(inArray(mqWorkflowAddressCandidates.id, parsed.candidateIds));

    assertSelectedCandidatesApproved(parsed.candidateIds, await buildBatchCandidateReadinessRows(tx, candidates));

    const batchHash = hashJson(candidates.map((candidate) => [candidate.id, candidate.normalizedAddress, candidate.chainCode]));
    const first = candidates[0];
    const firstDraft = getApprovalDraft(first);
    const [sourceJob] = first.sourceJobId
      ? await tx.select().from(mqWorkflowSourceJobs).where(eq(mqWorkflowSourceJobs.id, first.sourceJobId)).limit(1)
      : [null];
    const source = buildBatchSourceProvenance({
      requestedName: parsed.sourceName,
      fallbackName: `Candidate batch ${new Date().toISOString()}`,
      sourceJob,
    });

    const [batch] = await tx
      .insert(mqWorkflowLabelBatches)
      .values({
        sourceJobId: first.sourceJobId,
        sourceDocumentId: first.sourceDocumentId,
        entityId: optionalNumber(firstDraft.entityId) ?? first.suggestedEntityId,
        protocolId: optionalNumber(firstDraft.protocolId) ?? first.suggestedProtocolId,
        roleId: optionalNumber(firstDraft.roleId) ?? first.suggestedRoleId,
        sourceType: source.sourceType,
        sourceUrl: source.sourceUrl,
        sourceName: source.sourceName,
        confidenceDefault: optionalNumber(firstDraft.confidenceScore) ?? first.confidenceScore,
        qualityTierDefault: optionalNumber(firstDraft.qualityTier) ?? first.qualityTier,
        flagsDefault: optionalNumber(firstDraft.flags),
        effectiveFromBlock: optionalNumber(firstDraft.validFromBlock),
        effectiveToBlock: optionalNumber(firstDraft.validToBlock),
        labelAction: typeof firstDraft.labelAction === "string" ? firstDraft.labelAction : "create",
        importedCount: candidates.length,
        acceptedCount: candidates.length,
        batchHash,
        status: "pending_approval",
        createdBy: actor.id,
      })
      .returning();

    await tx.insert(mqWorkflowLabelBatchCandidates).values(candidates.map((candidate) => ({ batchId: batch.id, candidateId: candidate.id })));

    await tx.insert(mqWorkflowApprovalEvents).values({
      batchId: batch.id,
      action: "batch_created",
      actorId: actor.id,
      reason: "Created from approved candidates.",
      afterJson: { candidateIds: candidates.map((candidate) => candidate.id) },
    });

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "batch_created",
      targetTable: "mq_workflow_label_batches",
      targetId: String(batch.id),
      payload: buildBatchLifecycleAuditPayload({
        batchId: batch.id,
        action: "batch_created",
        afterStatus: batch.status,
        reason: "Created from approved candidates.",
        candidateIds: candidates.map((candidate) => candidate.id),
      }),
    });

    return batch;
  });
}

export async function approveBatch(input: unknown) {
  const actor = await assertPermission("candidate:review");
  const parsed = batchIdSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(mqWorkflowLabelBatches).where(eq(mqWorkflowLabelBatches.id, parsed.batchId)).limit(1);

    if (!before) {
      throw new Error("Batch not found.");
    }

    const [batch] = await tx
      .update(mqWorkflowLabelBatches)
      .set({ status: "approved", approvedBy: actor.id, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(mqWorkflowLabelBatches.id, parsed.batchId))
      .returning();

    await tx.insert(mqWorkflowApprovalEvents).values({
      batchId: batch.id,
      action: "batch_approved",
      actorId: actor.id,
      reason: "Batch approved for commit.",
      beforeJson: before,
      afterJson: batch,
    });

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "batch_approved",
      targetTable: "mq_workflow_label_batches",
      targetId: String(batch.id),
      payload: buildBatchLifecycleAuditPayload({
        batchId: batch.id,
        action: "batch_approved",
        beforeStatus: before.status,
        afterStatus: batch.status,
        reason: "Batch approved for commit.",
      }),
    });

    return batch;
  });
}

async function updateBatchLifecycleStatus(input: unknown, status: "failed" | "superseded", action: string, defaultReason: string) {
  const actor = await assertPermission("candidate:review");
  const parsed = batchLifecycleSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(mqWorkflowLabelBatches).where(eq(mqWorkflowLabelBatches.id, parsed.batchId)).limit(1);

    if (!batch) {
      throw new Error("Batch not found.");
    }

    if (status === "failed" && ["committed", "superseded"].includes(batch.status)) {
      throw new Error("Committed or superseded batches cannot be failed.");
    }

    if (status === "superseded" && ["failed", "superseded"].includes(batch.status)) {
      throw new Error("Failed or already superseded batches cannot be superseded.");
    }

    const [updated] = await tx
      .update(mqWorkflowLabelBatches)
      .set({
        status,
        labelAction: status === "superseded" ? "supersede" : batch.labelAction,
        updatedAt: new Date(),
      })
      .where(eq(mqWorkflowLabelBatches.id, parsed.batchId))
      .returning();

    await tx.insert(mqWorkflowApprovalEvents).values({
      batchId: updated.id,
      action,
      actorId: actor.id,
      reason: parsed.reason || defaultReason,
      beforeJson: batch,
      afterJson: updated,
    });

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action,
      targetTable: "mq_workflow_label_batches",
      targetId: String(updated.id),
      payload: buildBatchLifecycleAuditPayload({
        batchId: updated.id,
        action,
        beforeStatus: batch.status,
        afterStatus: updated.status,
        reason: parsed.reason || defaultReason,
      }),
    });

    return updated;
  });
}

export async function failBatch(input: unknown) {
  return updateBatchLifecycleStatus(input, "failed", "batch_failed", "Batch failed by reviewer.");
}

export async function supersedeBatch(input: unknown) {
  return updateBatchLifecycleStatus(input, "superseded", "batch_superseded", "Batch marked superseded by reviewer.");
}

export async function commitBatch(input: unknown) {
  const actor = await assertPermission("batch:commit");
  const parsed = batchIdSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(mqWorkflowLabelBatches).where(eq(mqWorkflowLabelBatches.id, parsed.batchId)).limit(1);

    if (!batch) {
      throw new Error("Batch not found.");
    }

    // Batch approval and batch commit are two separate governed decisions and
    // must produce two separate audit records. A pending_approval batch can
    // never write registry or KV state.
    if (batch.status !== "approved") {
      throw new BatchLifecycleError("batch_not_approved",
        `Only approved batches can be committed; batch ${batch.id} is ${batch.status}. Approve the batch first.`,
      );
    }

    const rows = await tx
      .select({ candidate: mqWorkflowAddressCandidates, role: mqDictRoles })
      .from(mqWorkflowLabelBatchCandidates)
      .innerJoin(mqWorkflowAddressCandidates, eq(mqWorkflowLabelBatchCandidates.candidateId, mqWorkflowAddressCandidates.id))
      .leftJoin(mqDictRoles, eq(mqWorkflowAddressCandidates.suggestedRoleId, mqDictRoles.roleId))
      .where(eq(mqWorkflowLabelBatchCandidates.batchId, parsed.batchId));

    if (!rows.length) {
      throw new Error("Batch has no candidates.");
    }

    assertBatchCandidatesStillApproved(await buildBatchCandidateReadinessRows(tx, rows.map((row) => row.candidate)));

    const registryIds: number[] = [];
    const plannedRegistryTargets: RegistryCommitTarget[] = [];

    for (const row of rows) {
      const candidate = row.candidate;
      const draft = getApprovalDraft(candidate);
      const entityId = optionalNumber(draft.entityId) ?? candidate.suggestedEntityId;
      const roleId = optionalNumber(draft.roleId) ?? candidate.suggestedRoleId;
      const supersedesRegistryId = optionalNumber(draft.supersedesRegistryId);
      const historicalOnly = draft.historicalOnly === true || draft.labelAction === "mark_historical";
      const validFromBlock = optionalNumber(draft.validFromBlock);

      if (!candidate.chainCode || !entityId || !roleId) {
        throw new Error(`Candidate ${candidate.id} is missing chain, entity, or role.`);
      }

      // Fail closed on the canonical U1 identity. Never reconstruct or guess a
      // missing namespace/codec/payload during commit.
      const [namespace] = candidate.namespaceId
        ? await tx.select().from(mqDictAddressNamespaces).where(eq(mqDictAddressNamespaces.id, candidate.namespaceId)).limit(1)
        : [null];
      const [codec] = candidate.addressCodecId
        ? await tx.select().from(mqDictAddressCodecs).where(eq(mqDictAddressCodecs.id, candidate.addressCodecId)).limit(1)
        : [null];
      const u1Blockers = validateU1AddressKey(candidate, { namespace: namespace ?? null, codec: codec ?? null });

      if (u1Blockers.length) {
        throw new Error(
          `Candidate ${candidate.id} cannot be committed: invalid or incomplete U1 address key (${u1Blockers.join(", ")}). ` +
            "Re-run research normalization so namespaceId, addressCodecId and payloadHex are resolved.",
        );
      }

      let role = row.role;
      if (!role || role.roleId !== roleId) {
        [role] = await tx.select().from(mqDictRoles).where(eq(mqDictRoles.roleId, roleId)).limit(1);
      }
      if (!role) {
        throw new Error(`Candidate ${candidate.id} references missing role ${roleId}.`);
      }

      let supersededRegistry: typeof mqRegistryAddressLabels.$inferSelect | null = null;
      if (supersedesRegistryId) {
        const [registry] = await tx.select().from(mqRegistryAddressLabels).where(eq(mqRegistryAddressLabels.id, supersedesRegistryId)).limit(1);

        if (!registry) {
          throw new Error(`Candidate ${candidate.id} supersedes missing registry row ${supersedesRegistryId}.`);
        }

        if (registry.chainCode !== candidate.chainCode || registry.normalizedAddress !== candidate.normalizedAddress) {
          throw new Error(`Candidate ${candidate.id} can only supersede a registry row with the same chain and normalized address.`);
        }

        supersededRegistry = registry;
      }

      const baseFlags = optionalNumber(draft.flags) ?? role?.defaultFlags ?? 0;
      const registryFlags = historicalOnly ? markHistoricalOnlyFlags(baseFlags) : baseFlags;
      const labelStatus = historicalOnly ? LABEL_STATUS.inactiveHistorical : optionalNumber(draft.labelStatus) ?? LABEL_STATUS.activeCurrent;
      const registryTarget: RegistryCommitTarget = {
        candidateId: candidate.id,
        chainCode: candidate.chainCode,
        normalizedAddress: candidate.normalizedAddress,
        roleId,
        validFromBlock,
        isActive: !historicalOnly,
      };
      const plannedConflict = findRegistryCommitConflict(plannedRegistryTargets, registryTarget);

      if (plannedConflict) {
        throw new Error(
          `Candidate ${candidate.id} duplicates another active registry target in this batch: ${describeRegistryCommitTarget(registryTarget)}.`,
        );
      }

      const existingRegistryRows = await tx
        .select()
        .from(mqRegistryAddressLabels)
        .where(
          and(
            eq(mqRegistryAddressLabels.chainCode, candidate.chainCode),
            eq(mqRegistryAddressLabels.normalizedAddress, candidate.normalizedAddress),
            eq(mqRegistryAddressLabels.roleId, roleId),
            eq(mqRegistryAddressLabels.isActive, true),
          ),
        );
      const existingConflict = findRegistryCommitConflict(
        existingRegistryRows.map((registryRow) => ({
          id: registryRow.id,
          chainCode: registryRow.chainCode,
          normalizedAddress: registryRow.normalizedAddress,
          roleId: registryRow.roleId ?? roleId,
          validFromBlock: registryRow.validFromBlock,
          isActive: registryRow.isActive,
        })),
        registryTarget,
        supersedesRegistryId,
      );

      if (existingConflict) {
        throw new Error(
          `Candidate ${candidate.id} would duplicate active registry row ${existingConflict.id} for ${describeRegistryCommitTarget(registryTarget)}. Mark the candidate as superseding that row, edit the timeline, or update the existing registry label instead.`,
        );
      }

      if (
        supersededRegistry &&
        supersededRegistry.roleId === roleId &&
        (supersededRegistry.validFromBlock ?? null) === (validFromBlock ?? null)
      ) {
        throw new Error(
          `Candidate ${candidate.id} supersedes registry row ${supersededRegistry.id} with the same role and valid-from block. Use registry edit for same-key corrections or choose a distinct replacement timeline.`,
        );
      }

      const [registry] = await tx
        .insert(mqRegistryAddressLabels)
        .values({
          normalizedAddress: candidate.normalizedAddress,
          rawAddress: candidate.rawAddress,
          chainCode: candidate.chainCode,
          prefixCode: candidate.prefixCode,
          namespaceId: candidate.namespaceId,
          addressCodecId: candidate.addressCodecId,
          payloadHex: candidate.payloadHex,
          entityId,
          protocolId: optionalNumber(draft.protocolId) ?? candidate.suggestedProtocolId,
          categoryId: effectiveCategoryId(optionalNumber(draft.categoryId), role?.categoryId),
          roleId,
          componentId: optionalNumber(draft.componentId) ?? candidate.suggestedComponentId,
          confidenceScore: optionalNumber(draft.confidenceScore) ?? candidate.confidenceScore,
          labelStatus,
          qualityTier: optionalNumber(draft.qualityTier) ?? candidate.qualityTier,
          flags: registryFlags,
          metricUsage: role?.metricUsageDefault,
          validFromBlock,
          validToBlock: optionalNumber(draft.validToBlock),
          firstSeenBlock: optionalNumber(draft.firstSeenBlock) ?? candidate.firstSeenBlock,
          lastSeenBlock: optionalNumber(draft.lastSeenBlock) ?? candidate.lastSeenBlock,
          isActive: !historicalOnly,
          primarySourceJobId: candidate.sourceJobId,
          approvedBatchId: batch.id,
          notes: typeof draft.notes === "string" ? draft.notes : null,
          metadata: buildRegistryCommitMetadata({
            candidateMetadata: candidate.metadata,
            candidateId: candidate.id,
            committedBy: actor.email,
            labelAction: typeof draft.labelAction === "string" ? draft.labelAction : "create",
            supersedesRegistryId: supersedesRegistryId ?? null,
            historicalOnly,
          }),
        })
        .returning();

      registryIds.push(registry.id);
      plannedRegistryTargets.push({ ...registryTarget, id: registry.id });

      if (supersededRegistry) {
        const replacementFromBlock = optionalNumber(draft.validFromBlock);
        const supersededValidToBlock =
          supersededRegistry.validToBlock ??
          (replacementFromBlock && replacementFromBlock > 1 ? replacementFromBlock - 1 : supersededRegistry.lastSeenBlock ?? candidate.firstSeenBlock);
        const [superseded] = await tx
          .update(mqRegistryAddressLabels)
          .set({
            isActive: false,
            flags: markHistoricalOnlyFlags(supersededRegistry.flags),
            validToBlock: supersededValidToBlock,
            metadata: {
              ...(supersededRegistry.metadata ?? {}),
              supersededByCandidateId: candidate.id,
              supersededByRegistryId: registry.id,
              supersededByBatchId: batch.id,
              supersededAt: new Date().toISOString(),
              supersededBy: actor.email,
            },
            updatedAt: new Date(),
          })
          .where(eq(mqRegistryAddressLabels.id, supersededRegistry.id))
          .returning();

        await tx.insert(mqWorkflowApprovalEvents).values({
          candidateId: candidate.id,
          registryId: superseded.id,
          batchId: batch.id,
          action: "registry_label_superseded_by_candidate",
          actorId: actor.id,
          reason: "Batch commit superseded the previous registry label.",
          beforeJson: supersededRegistry,
          afterJson: superseded,
          metadata: { replacementRegistryId: registry.id },
        });

        await tx.insert(mqAuditEvents).values({
          actorId: actor.id,
          action: "registry_label_superseded_by_candidate",
          targetTable: "mq_registry_address_labels",
          targetId: String(superseded.id),
          payload: { before: supersededRegistry, after: superseded, replacementRegistryId: registry.id },
        });
      }

      await tx
        .update(mqWorkflowAddressEvidence)
        .set({ registryId: registry.id, batchId: batch.id })
        .where(eq(mqWorkflowAddressEvidence.candidateId, candidate.id));

      const evidenceRows = await tx.select().from(mqWorkflowAddressEvidence).where(eq(mqWorkflowAddressEvidence.candidateId, candidate.id));
      if (!evidenceRows.length) {
        throw new Error(`Candidate ${candidate.id} must have at least one evidence row before registry commit.`);
      }
      if (evidenceRows.length) {
        await tx.insert(mqWorkflowLabelBatchEvidence).values(
          evidenceRows.map((evidence) => ({
            batchId: batch.id,
            evidenceId: evidence.id,
            evidenceHash: evidence.evidenceHash,
            summary: evidence.summary,
            payload: evidence.payload,
          })),
        );
      }

      await tx.insert(mqWorkflowApprovalEvents).values({
        candidateId: candidate.id,
        registryId: registry.id,
        batchId: batch.id,
        action: "candidate_committed_to_registry",
        actorId: actor.id,
        reason: "Batch commit wrote registry row.",
        afterJson: registry,
      });
    }

    const fullRequest = await createFullKvBuildRequest(tx, {
      triggeringBatchId: batch.id,
      lastCommittedBatchId: batch.id,
    });
    const dictionaryVersion = await recordDictionaryVersion(actor.id, "batch_commit_full_kv_handoff", tx);
    if (dictionaryVersion !== fullRequest.snapshot.dictionaryVersion) {
      throw new Error("Dictionary snapshot changed while creating the full KV request.");
    }
    const pendingKvManifest = fullRequest.manifest;
    const buildHash = fullRequest.buildHash;

    const [kvBuild] = await tx
      .insert(mqBuildKvBuilds)
      .values({
        buildHash,
        dictionaryVersion,
        status: "pending",
        rowCount: fullRequest.snapshot.registryIds.length,
        lastCommittedBatchId: batch.id,
        manifest: pendingKvManifest,
        createdBy: actor.id,
      })
      .returning();

    const [updatedBatch] = await tx
      .update(mqWorkflowLabelBatches)
      .set({ status: "committed", committedAt: new Date(), updatedAt: new Date(), acceptedCount: registryIds.length })
      .where(eq(mqWorkflowLabelBatches.id, batch.id))
      .returning();

    await tx.insert(mqWorkflowApprovalEvents).values({
      batchId: batch.id,
      action: "batch_committed",
      actorId: actor.id,
      reason: "Committed to canonical registry and queued KV manifest.",
      beforeJson: batch,
      afterJson: { ...updatedBatch, registryIds, dictionaryVersion },
    });

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "kv_build_manifest_created",
      targetTable: "mq_build_kv_builds",
      targetId: String(kvBuild.id),
      payload: buildBatchKvHandoffAuditPayload({
        batchId: batch.id,
        buildId: kvBuild.id,
        buildHash: kvBuild.buildHash,
        dictionaryVersion,
        rowCount: fullRequest.snapshot.registryIds.length,
        registryIds: [...fullRequest.snapshot.registryIds],
        manifest: pendingKvManifest,
      }),
    });

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "batch_committed",
      targetTable: "mq_workflow_label_batches",
      targetId: String(batch.id),
      payload: buildBatchLifecycleAuditPayload({
        batchId: batch.id,
        action: "batch_committed",
        beforeStatus: batch.status,
        afterStatus: updatedBatch.status,
        reason: "Committed to canonical registry and queued KV manifest.",
        registryIds,
        dictionaryVersion,
      }),
    });

    return { batch: updatedBatch, registryIds, dictionaryVersion };
  }, { isolationLevel: "repeatable read" });
}

export async function getBatchCandidateCount(batchId: number) {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(mqWorkflowLabelBatchCandidates)
    .where(eq(mqWorkflowLabelBatchCandidates.batchId, batchId));
  return row?.count ?? 0;
}
