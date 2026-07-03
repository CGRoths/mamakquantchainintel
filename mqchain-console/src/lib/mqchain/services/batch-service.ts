import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressCandidates,
  mqAddressEvidence,
  mqAddressRegistry,
  mqApprovalEvents,
  mqAuditLog,
  mqEntities,
  mqKvBuilds,
  mqKvRoleDict,
  mqLabelBatchCandidates,
  mqLabelBatchEvidence,
  mqLabelBatches,
  mqProtocols,
  mqSourceDocuments,
  mqSourceJobs,
} from "@/db/schema";
import { assertPermission } from "@/lib/auth/permissions";
import {
  buildBatchCandidateRollups,
  buildBatchEvidenceRollups,
  buildBatchKvHandoffAuditPayload,
  buildBatchLifecycleAuditPayload,
  buildBatchRegistryRollup,
} from "../batch-detail";
import { assertBatchCandidatesStillApproved, assertSelectedCandidatesApproved } from "../batch-readiness";
import { LABEL_STATUS } from "../constants";
import { markHistoricalOnlyFlags } from "../flags";
import { buildPendingBatchKvManifest } from "../kv-manifest";
import { parseBatchListFilters, type BatchListFilters } from "../list-filters";
import {
  describeRegistryCommitTarget,
  findRegistryCommitConflict,
  type RegistryCommitTarget,
} from "../registry-conflicts";
import { batchIdSchema, batchLifecycleSchema, createBatchSchema } from "../validators/batch";
import { recordDictionaryVersion } from "./dictionary-service";
import { hashJson, optionalNumber } from "./service-utils";

function getApprovalDraft(candidate: typeof mqAddressCandidates.$inferSelect) {
  const metadata = candidate.metadata as { approvalDraft?: Record<string, unknown> } | null;
  return metadata?.approvalDraft ?? {};
}

function batchOrderBy(sort: BatchListFilters["sort"]) {
  if (sort === "updated_at") return desc(mqLabelBatches.updatedAt);
  if (sort === "status") return asc(mqLabelBatches.status);
  if (sort === "accepted_count") return desc(mqLabelBatches.acceptedCount);
  if (sort === "committed_at") return desc(mqLabelBatches.committedAt);
  return desc(mqLabelBatches.createdAt);
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
        ilike(mqLabelBatches.sourceName, `%${filters.q}%`),
        ilike(mqLabelBatches.sourceUrl, `%${filters.q}%`),
        ilike(mqLabelBatches.batchHash, `%${filters.q}%`),
        ilike(mqLabelBatches.evidenceHash, `%${filters.q}%`),
        ilike(mqLabelBatches.storageUri, `%${filters.q}%`),
        sql`${mqLabelBatches.id}::text ilike ${`%${filters.q}%`}`,
      ),
    );
  }

  if (filters.status) conditions.push(eq(mqLabelBatches.status, filters.status));
  if (filters.sourceType) conditions.push(ilike(mqLabelBatches.sourceType, `%${filters.sourceType}%`));
  if (filters.labelAction) conditions.push(ilike(mqLabelBatches.labelAction, `%${filters.labelAction}%`));
  if (filters.entity) {
    addCondition(
      conditions,
      or(
        sql`${mqLabelBatches.entityId}::text ilike ${`%${filters.entity}%`}`,
        ilike(mqEntities.entityCode, `%${filters.entity}%`),
        ilike(mqEntities.entityName, `%${filters.entity}%`),
      ),
    );
  }
  if (filters.protocol) {
    addCondition(
      conditions,
      or(
        sql`${mqLabelBatches.protocolId}::text ilike ${`%${filters.protocol}%`}`,
        ilike(mqProtocols.protocolCode, `%${filters.protocol}%`),
        ilike(mqProtocols.protocolName, `%${filters.protocol}%`),
      ),
    );
  }
  if (filters.role) {
    addCondition(
      conditions,
      or(
        sql`${mqLabelBatches.roleId}::text ilike ${`%${filters.role}%`}`,
        ilike(mqKvRoleDict.roleCode, `%${filters.role}%`),
        ilike(mqKvRoleDict.roleName, `%${filters.role}%`),
      ),
    );
  }

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqLabelBatches)
    .leftJoin(mqEntities, eq(mqLabelBatches.entityId, mqEntities.id))
    .leftJoin(mqProtocols, eq(mqLabelBatches.protocolId, mqProtocols.id))
    .leftJoin(mqKvRoleDict, eq(mqLabelBatches.roleId, mqKvRoleDict.roleId))
    .where(where);
  const rows = await db
    .select({ batch: mqLabelBatches, entity: mqEntities, protocol: mqProtocols, role: mqKvRoleDict })
    .from(mqLabelBatches)
    .leftJoin(mqEntities, eq(mqLabelBatches.entityId, mqEntities.id))
    .leftJoin(mqProtocols, eq(mqLabelBatches.protocolId, mqProtocols.id))
    .leftJoin(mqKvRoleDict, eq(mqLabelBatches.roleId, mqKvRoleDict.roleId))
    .where(where)
    .orderBy(batchOrderBy(filters.sort), desc(mqLabelBatches.id))
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
  const [batch] = await db.select().from(mqLabelBatches).where(eq(mqLabelBatches.id, batchId)).limit(1);

  if (!batch) {
    return null;
  }

  const candidateRows = await db
    .select({ candidate: mqAddressCandidates })
    .from(mqLabelBatchCandidates)
    .innerJoin(mqAddressCandidates, eq(mqLabelBatchCandidates.candidateId, mqAddressCandidates.id))
    .where(eq(mqLabelBatchCandidates.batchId, batchId))
    .orderBy(desc(mqAddressCandidates.createdAt));

  const candidates = candidateRows.map((row) => row.candidate);
  const candidateIds = candidates.map((candidate) => candidate.id);
  const candidateEvidenceQuery = candidateIds.length
    ? db
        .select()
        .from(mqAddressEvidence)
        .where(inArray(mqAddressEvidence.candidateId, candidateIds))
        .orderBy(desc(mqAddressEvidence.createdAt))
    : Promise.resolve([]);

  const [sourceJob, sourceDocument, entity, protocol, role, candidateEvidence, batchEvidence, approvalEvents, kvBuilds, registryRows] = await Promise.all([
    batch.sourceJobId ? db.select().from(mqSourceJobs).where(eq(mqSourceJobs.id, batch.sourceJobId)).limit(1) : Promise.resolve([]),
    batch.sourceDocumentId
      ? db.select().from(mqSourceDocuments).where(eq(mqSourceDocuments.id, batch.sourceDocumentId)).limit(1)
      : Promise.resolve([]),
    batch.entityId ? db.select().from(mqEntities).where(eq(mqEntities.id, batch.entityId)).limit(1) : Promise.resolve([]),
    batch.protocolId ? db.select().from(mqProtocols).where(eq(mqProtocols.id, batch.protocolId)).limit(1) : Promise.resolve([]),
    batch.roleId ? db.select().from(mqKvRoleDict).where(eq(mqKvRoleDict.roleId, batch.roleId)).limit(1) : Promise.resolve([]),
    candidateEvidenceQuery,
    db.select().from(mqLabelBatchEvidence).where(eq(mqLabelBatchEvidence.batchId, batchId)).orderBy(desc(mqLabelBatchEvidence.createdAt)),
    db.select().from(mqApprovalEvents).where(eq(mqApprovalEvents.batchId, batchId)).orderBy(desc(mqApprovalEvents.createdAt)).limit(50),
    db
      .select()
      .from(mqKvBuilds)
      .where(sql`${mqKvBuilds.manifest}->>'batchId' = ${String(batchId)}`)
      .orderBy(desc(mqKvBuilds.createdAt))
      .limit(10),
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
      .where(eq(mqAddressRegistry.approvedBatchId, batchId))
      .orderBy(desc(mqAddressRegistry.createdAt)),
  ]);

  return {
    batch,
    candidates,
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
    const candidates = await tx.select().from(mqAddressCandidates).where(inArray(mqAddressCandidates.id, parsed.candidateIds));

    assertSelectedCandidatesApproved(parsed.candidateIds, candidates);

    const batchHash = hashJson(candidates.map((candidate) => [candidate.id, candidate.normalizedAddress, candidate.chainCode]));
    const first = candidates[0];
    const firstDraft = getApprovalDraft(first);

    const [batch] = await tx
      .insert(mqLabelBatches)
      .values({
        sourceJobId: first.sourceJobId,
        sourceDocumentId: first.sourceDocumentId,
        entityId: optionalNumber(firstDraft.entityId) ?? first.suggestedEntityId,
        protocolId: optionalNumber(firstDraft.protocolId) ?? first.suggestedProtocolId,
        roleId: optionalNumber(firstDraft.roleId) ?? first.suggestedRoleId,
        sourceType: parsed.sourceName || "candidate_review",
        sourceName: parsed.sourceName || `Candidate batch ${new Date().toISOString()}`,
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

    await tx.insert(mqLabelBatchCandidates).values(candidates.map((candidate) => ({ batchId: batch.id, candidateId: candidate.id })));

    await tx.insert(mqApprovalEvents).values({
      batchId: batch.id,
      action: "batch_created",
      actorId: actor.id,
      reason: "Created from approved candidates.",
      afterJson: { candidateIds: candidates.map((candidate) => candidate.id) },
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "batch_created",
      targetTable: "mq_label_batches",
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
    const [before] = await tx.select().from(mqLabelBatches).where(eq(mqLabelBatches.id, parsed.batchId)).limit(1);

    if (!before) {
      throw new Error("Batch not found.");
    }

    const [batch] = await tx
      .update(mqLabelBatches)
      .set({ status: "approved", approvedBy: actor.id, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(mqLabelBatches.id, parsed.batchId))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      batchId: batch.id,
      action: "batch_approved",
      actorId: actor.id,
      reason: "Batch approved for commit.",
      beforeJson: before,
      afterJson: batch,
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "batch_approved",
      targetTable: "mq_label_batches",
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
    const [batch] = await tx.select().from(mqLabelBatches).where(eq(mqLabelBatches.id, parsed.batchId)).limit(1);

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
      .update(mqLabelBatches)
      .set({
        status,
        labelAction: status === "superseded" ? "supersede" : batch.labelAction,
        updatedAt: new Date(),
      })
      .where(eq(mqLabelBatches.id, parsed.batchId))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      batchId: updated.id,
      action,
      actorId: actor.id,
      reason: parsed.reason || defaultReason,
      beforeJson: batch,
      afterJson: updated,
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action,
      targetTable: "mq_label_batches",
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
  const dictionaryVersion = await recordDictionaryVersion(actor.id, "batch_commit_kv_handoff");

  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(mqLabelBatches).where(eq(mqLabelBatches.id, parsed.batchId)).limit(1);

    if (!batch) {
      throw new Error("Batch not found.");
    }

    if (!["approved", "pending_approval"].includes(batch.status)) {
      throw new Error("Only pending or approved batches can be committed.");
    }

    const rows = await tx
      .select({ candidate: mqAddressCandidates, role: mqKvRoleDict })
      .from(mqLabelBatchCandidates)
      .innerJoin(mqAddressCandidates, eq(mqLabelBatchCandidates.candidateId, mqAddressCandidates.id))
      .leftJoin(mqKvRoleDict, eq(mqAddressCandidates.suggestedRoleId, mqKvRoleDict.roleId))
      .where(eq(mqLabelBatchCandidates.batchId, parsed.batchId));

    if (!rows.length) {
      throw new Error("Batch has no candidates.");
    }

    assertBatchCandidatesStillApproved(rows.map((row) => row.candidate));

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

      let role = row.role;
      if (!role || role.roleId !== roleId) {
        [role] = await tx.select().from(mqKvRoleDict).where(eq(mqKvRoleDict.roleId, roleId)).limit(1);
      }
      if (!role) {
        throw new Error(`Candidate ${candidate.id} references missing role ${roleId}.`);
      }

      let supersededRegistry: typeof mqAddressRegistry.$inferSelect | null = null;
      if (supersedesRegistryId) {
        const [registry] = await tx.select().from(mqAddressRegistry).where(eq(mqAddressRegistry.id, supersedesRegistryId)).limit(1);

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
        .from(mqAddressRegistry)
        .where(
          and(
            eq(mqAddressRegistry.chainCode, candidate.chainCode),
            eq(mqAddressRegistry.normalizedAddress, candidate.normalizedAddress),
            eq(mqAddressRegistry.roleId, roleId),
            eq(mqAddressRegistry.isActive, true),
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
        .insert(mqAddressRegistry)
        .values({
          normalizedAddress: candidate.normalizedAddress,
          rawAddress: candidate.rawAddress,
          chainCode: candidate.chainCode,
          prefixCode: candidate.prefixCode,
          payloadHex: candidate.payloadHex,
          entityId,
          protocolId: optionalNumber(draft.protocolId) ?? candidate.suggestedProtocolId,
          roleId,
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
          metadata: {
            candidateId: candidate.id,
            committedBy: actor.email,
            labelAction: typeof draft.labelAction === "string" ? draft.labelAction : "create",
            supersedesRegistryId: supersedesRegistryId ?? null,
            historicalOnly,
          },
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
          .update(mqAddressRegistry)
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
          .where(eq(mqAddressRegistry.id, supersededRegistry.id))
          .returning();

        await tx.insert(mqApprovalEvents).values({
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

        await tx.insert(mqAuditLog).values({
          actorId: actor.id,
          action: "registry_label_superseded_by_candidate",
          targetTable: "mq_address_registry",
          targetId: String(superseded.id),
          payload: { before: supersededRegistry, after: superseded, replacementRegistryId: registry.id },
        });
      }

      await tx
        .update(mqAddressEvidence)
        .set({ registryId: registry.id, batchId: batch.id })
        .where(eq(mqAddressEvidence.candidateId, candidate.id));

      const evidenceRows = await tx.select().from(mqAddressEvidence).where(eq(mqAddressEvidence.candidateId, candidate.id));
      if (!evidenceRows.length) {
        throw new Error(`Candidate ${candidate.id} must have at least one evidence row before registry commit.`);
      }
      if (evidenceRows.length) {
        await tx.insert(mqLabelBatchEvidence).values(
          evidenceRows.map((evidence) => ({
            batchId: batch.id,
            evidenceId: evidence.id,
            evidenceHash: evidence.evidenceHash,
            summary: evidence.summary,
            payload: evidence.payload,
          })),
        );
      }

      await tx.insert(mqApprovalEvents).values({
        candidateId: candidate.id,
        registryId: registry.id,
        batchId: batch.id,
        action: "candidate_committed_to_registry",
        actorId: actor.id,
        reason: "Batch commit wrote registry row.",
        afterJson: registry,
      });
    }

    const pendingKvManifest = buildPendingBatchKvManifest({
      batchId: batch.id,
      registryIds,
      dictionaryVersion,
    });
    const buildHash = hashJson({ ...pendingKvManifest, createdAt: new Date().toISOString() });

    const [kvBuild] = await tx
      .insert(mqKvBuilds)
      .values({
        buildHash,
        dictionaryVersion,
        status: "pending",
        rowCount: registryIds.length,
        manifest: pendingKvManifest,
        createdBy: actor.id,
      })
      .returning();

    const [updatedBatch] = await tx
      .update(mqLabelBatches)
      .set({ status: "committed", committedAt: new Date(), updatedAt: new Date(), acceptedCount: registryIds.length })
      .where(eq(mqLabelBatches.id, batch.id))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      batchId: batch.id,
      action: "batch_committed",
      actorId: actor.id,
      reason: "Committed to canonical registry and queued KV manifest.",
      beforeJson: batch,
      afterJson: { ...updatedBatch, registryIds, dictionaryVersion },
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "kv_build_manifest_created",
      targetTable: "mq_kv_builds",
      targetId: String(kvBuild.id),
      payload: buildBatchKvHandoffAuditPayload({
        batchId: batch.id,
        buildId: kvBuild.id,
        buildHash: kvBuild.buildHash,
        dictionaryVersion,
        rowCount: registryIds.length,
        registryIds,
        manifest: pendingKvManifest,
      }),
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "batch_committed",
      targetTable: "mq_label_batches",
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
  });
}

export async function getBatchCandidateCount(batchId: number) {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(mqLabelBatchCandidates)
    .where(eq(mqLabelBatchCandidates.batchId, batchId));
  return row?.count ?? 0;
}
