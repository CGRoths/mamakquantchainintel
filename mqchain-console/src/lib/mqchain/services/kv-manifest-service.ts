import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqRegistryAddressLabels,
  mqAuditEvents,
  mqBuildKvBuilds,
  mqBuildCompiledEntries,
  mqBuildIndexManifests,
  mqBuildIndexShards,
  mqBuildValidationRuns,
  mqBuildMetricGroupMembers,
  mqBuildMetricGroupMembershipSnapshots,
  mqWorkflowLabelBatches,
} from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";
import { extractMetricGroupMembershipSnapshotManifest } from "../metric-group-preview";
import { buildKvManifestActivationPreflight, extractKvIndexManifestRecords } from "../kv-manifest";
import { REQUIRED_KV_INDEXES } from "../kv/contract";
import { semanticHash } from "../kv/compiled-records";
import { parseKvBuildListFilters, type KvBuildListFilters } from "../list-filters";
import { createKvBuildManifestSchema, kvBuildIdSchema } from "../validators/kv-manifest";
import { hashJson } from "./service-utils";
import { loadFullKvCompilationSnapshot } from "./full-kv-build-service";

export class KvActivationError extends Error {
  readonly status = 409 as const;

  constructor(readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = "KvActivationError";
  }
}

function kvBuildOrderBy(sort: KvBuildListFilters["sort"]) {
  if (sort === "activated_at") return desc(mqBuildKvBuilds.activatedAt);
  if (sort === "row_count") return desc(mqBuildKvBuilds.rowCount);
  if (sort === "status") return asc(mqBuildKvBuilds.status);
  return desc(mqBuildKvBuilds.createdAt);
}

function addCondition(conditions: SQL[], condition: SQL | undefined) {
  if (condition) conditions.push(condition);
}

export async function listKvBuilds(input: unknown = {}) {
  const filters = typeof input === "number" ? parseKvBuildListFilters({ pageSize: input }) : parseKvBuildListFilters(input);
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqBuildKvBuilds.buildHash, `%${filters.q}%`),
        ilike(mqBuildKvBuilds.dictionaryVersion, `%${filters.q}%`),
        ilike(mqBuildKvBuilds.storageUri, `%${filters.q}%`),
        sql`${mqBuildKvBuilds.manifest}::text ilike ${`%${filters.q}%`}`,
        sql`${mqBuildKvBuilds.id}::text ilike ${`%${filters.q}%`}`,
      ),
    );
  }

  if (filters.status) conditions.push(eq(mqBuildKvBuilds.status, filters.status));
  if (filters.dictionaryVersion) conditions.push(ilike(mqBuildKvBuilds.dictionaryVersion, `%${filters.dictionaryVersion}%`));
  if (filters.storage) conditions.push(ilike(mqBuildKvBuilds.storageUri, `%${filters.storage}%`));
  if (typeof filters.minRows === "number") conditions.push(gte(mqBuildKvBuilds.rowCount, filters.minRows));
  if (typeof filters.maxRows === "number") conditions.push(lte(mqBuildKvBuilds.rowCount, filters.maxRows));

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(mqBuildKvBuilds).where(where);
  const rows = await db
    .select()
    .from(mqBuildKvBuilds)
    .where(where)
    .orderBy(kvBuildOrderBy(filters.sort), desc(mqBuildKvBuilds.id))
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

export async function getKvBuild(id: number) {
  const [build] = await getDb().select().from(mqBuildKvBuilds).where(eq(mqBuildKvBuilds.id, id)).limit(1);
  return build ?? null;
}

export async function getKvBuildDetail(id: number) {
  const db = getDb();
  const [build] = await db.select().from(mqBuildKvBuilds).where(eq(mqBuildKvBuilds.id, id)).limit(1);

  if (!build) {
    return null;
  }

  const indexManifests = await db
    .select()
    .from(mqBuildIndexManifests)
    .where(eq(mqBuildIndexManifests.buildId, build.id))
    .orderBy(asc(mqBuildIndexManifests.indexName), asc(mqBuildIndexManifests.id));
  const indexManifestIds = indexManifests.map((indexManifest) => indexManifest.id);
  const indexShards = indexManifestIds.length
    ? await db
        .select()
        .from(mqBuildIndexShards)
        .where(inArray(mqBuildIndexShards.manifestId, indexManifestIds))
        .orderBy(asc(mqBuildIndexShards.manifestId), asc(mqBuildIndexShards.shardKey), asc(mqBuildIndexShards.shardId))
    : [];
  const membershipSnapshots = await db
    .select()
    .from(mqBuildMetricGroupMembershipSnapshots)
    .where(eq(mqBuildMetricGroupMembershipSnapshots.kvBuildId, build.id))
    .orderBy(asc(mqBuildMetricGroupMembershipSnapshots.metricGroupCode), asc(mqBuildMetricGroupMembershipSnapshots.id));
  const membershipSnapshotIds = membershipSnapshots.map((snapshot) => snapshot.id);
  const membershipRows = membershipSnapshotIds.length
    ? await db
        .select()
        .from(mqBuildMetricGroupMembers)
        .where(inArray(mqBuildMetricGroupMembers.snapshotId, membershipSnapshotIds))
        .orderBy(asc(mqBuildMetricGroupMembers.snapshotId), asc(mqBuildMetricGroupMembers.chainCode), asc(mqBuildMetricGroupMembers.normalizedAddress))
    : [];

  const [latestValidation] = await db
    .select()
    .from(mqBuildValidationRuns)
    .where(eq(mqBuildValidationRuns.buildId, build.id))
    .orderBy(desc(mqBuildValidationRuns.createdAt), desc(mqBuildValidationRuns.id))
    .limit(1);
  const [currentActiveBuild] = await db
    .select({ id: mqBuildKvBuilds.id })
    .from(mqBuildKvBuilds)
    .where(eq(mqBuildKvBuilds.status, "active"))
    .limit(1);

  return {
    build,
    indexManifests,
    indexShards,
    membershipSnapshots,
    membershipRows,
    latestValidation: latestValidation ?? null,
    currentActiveBuildId: currentActiveBuild?.id ?? null,
  };
}

export async function getActiveKvBuildDetail() {
  const [build] = await getDb()
    .select()
    .from(mqBuildKvBuilds)
    .where(eq(mqBuildKvBuilds.status, "active"))
    .orderBy(desc(mqBuildKvBuilds.activatedAt), desc(mqBuildKvBuilds.id))
    .limit(1);

  return build ? getKvBuildDetail(build.id) : null;
}

export async function createKvBuildManifest(input: unknown) {
  const actor = await assertPermission("batch:commit");
  const parsed = createKvBuildManifestSchema.parse(input);
  const manifestArtifactStatus =
    typeof parsed.manifestJson.artifactStatus === "string" && parsed.manifestJson.artifactStatus.trim()
      ? parsed.manifestJson.artifactStatus
      : parsed.status;
  const baseManifest = {
    ...parsed.manifestJson,
    dictionaryVersion: parsed.dictionaryVersion ?? null,
    rowCount: parsed.rowCount,
    artifactStatus: manifestArtifactStatus,
    storageUri: parsed.storageUri ?? null,
  };
  const buildHash = parsed.buildHash || hashJson({
    dictionaryVersion: parsed.dictionaryVersion,
    rowCount: parsed.rowCount,
    storageUri: parsed.storageUri,
    manifest: baseManifest,
  });
  const manifest = {
    ...baseManifest,
    buildHash,
    controlPlaneCreatedAt: new Date().toISOString(),
    note: "RocksDB compilation is external; MQCHAIN Console tracks the manifest and activation state.",
  };

  const db = getDb();
  return db.transaction(async (tx) => {
    const [build] = await tx
      .insert(mqBuildKvBuilds)
      .values({
        buildHash,
        dictionaryVersion: parsed.dictionaryVersion,
        status: parsed.status,
        rowCount: parsed.rowCount,
        storageUri: parsed.storageUri,
        manifest,
        createdBy: actor.id,
      })
      .returning();

    const indexRecords = extractKvIndexManifestRecords(manifest, parsed.storageUri);
    for (const record of indexRecords) {
      const [indexManifest] = await tx
        .insert(mqBuildIndexManifests)
        .values({
          buildId: build.id,
          indexName: record.indexName,
          dictionaryVersion: parsed.dictionaryVersion,
          status: parsed.status,
          rowCount: record.rowCount,
          storageUri: record.storageUri,
          manifestHash: record.manifestHash,
          lastCommittedBatchId: record.lastCommittedBatchId,
          metadata: record.metadata,
          createdBy: actor.id,
        })
        .returning();

      if (indexManifest && record.shards.length) {
        await tx.insert(mqBuildIndexShards).values(
          record.shards.map((shard) => ({
            manifestId: indexManifest.id,
            shardId: shard.shardId,
            shardKey: shard.shardKey,
            shardHash: shard.shardHash,
            storageUri: shard.storageUri,
            rowCount: shard.rowCount,
            metadata: shard.metadata,
          })),
        );
      }
    }

    const metricGroupSnapshotInput = extractMetricGroupMembershipSnapshotManifest(manifest);
    let metricGroupSnapshotId: number | null = null;
    let metricGroupMemberCount = 0;
    if (metricGroupSnapshotInput) {
      const registryRows = metricGroupSnapshotInput.registryIds.length
        ? await tx
            .select()
            .from(mqRegistryAddressLabels)
            .where(inArray(mqRegistryAddressLabels.id, metricGroupSnapshotInput.registryIds))
            .orderBy(asc(mqRegistryAddressLabels.chainCode), asc(mqRegistryAddressLabels.normalizedAddress), asc(mqRegistryAddressLabels.id))
        : [];

      const [snapshot] = await tx
        .insert(mqBuildMetricGroupMembershipSnapshots)
        .values({
          metricGroupId: metricGroupSnapshotInput.metricGroupId,
          kvBuildId: build.id,
          metricGroupCode: metricGroupSnapshotInput.metricGroupCode,
          dictionaryVersion: parsed.dictionaryVersion,
          status: parsed.status,
          memberCount: registryRows.length,
          manifestHash: buildHash,
          manifest,
          createdBy: actor.id,
        })
        .returning();

      metricGroupSnapshotId = snapshot.id;
      metricGroupMemberCount = registryRows.length;

      if (registryRows.length) {
        await tx.insert(mqBuildMetricGroupMembers).values(
          registryRows.map((row) => ({
            snapshotId: snapshot.id,
            metricGroupId: metricGroupSnapshotInput.metricGroupId,
            registryId: row.id,
            chainCode: row.chainCode,
            normalizedAddress: row.normalizedAddress,
            entityId: row.entityId,
            roleId: row.roleId,
            confidenceScore: row.confidenceScore,
            flags: row.flags,
            metadata: {
              source: "metric_group_compile_manifest",
              metricGroupCode: metricGroupSnapshotInput.metricGroupCode,
              kvBuildId: build.id,
              previewRowCount: metricGroupSnapshotInput.rowCount,
            },
          })),
        );
      }
    }

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "kv_build_manifest_created",
      targetTable: "mq_build_kv_builds",
      targetId: String(build.id),
      payload: {
        buildHash,
        status: parsed.status,
        rowCount: parsed.rowCount,
        storageUri: parsed.storageUri,
        indexManifestCount: indexRecords.length,
        indexShardCount: indexRecords.reduce((total, record) => total + record.shards.length, 0),
        metricGroupSnapshotId,
        metricGroupMemberCount,
      },
    });

    return build;
  });
}

export async function activateKvBuildManifest(input: unknown) {
  const actor = await assertPermission("kv:activate");
  const parsed = kvBuildIdSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [build] = await tx.select().from(mqBuildKvBuilds).where(eq(mqBuildKvBuilds.id, parsed.buildId)).limit(1).for("update");

    if (!build) {
      throw new Error("KV build manifest not found.");
    }
    if (build.id === 5) throw new KvActivationError("protected_build", "Build 5 is a protected historical build and cannot be activated.");
    if (build.status !== "compiled") throw new KvActivationError("build_not_compiled", "KV build activation requires compiled status.");
    if (build.buildHash !== parsed.expectedBuildHash) throw new KvActivationError("build_hash_changed", "KV build hash changed after activation preview.");
    if (build.dictionaryVersion !== parsed.expectedDictionaryVersion) throw new KvActivationError("build_dictionary_changed", "KV build dictionary version changed after activation preview.");

    const [currentActiveBuild] = await tx
      .select({ id: mqBuildKvBuilds.id })
      .from(mqBuildKvBuilds)
      .where(eq(mqBuildKvBuilds.status, "active"))
      .limit(1)
      .for("update");
    if ((currentActiveBuild?.id ?? null) !== parsed.expectedCurrentActiveBuildId) {
      throw new KvActivationError("active_build_changed", "Current active build changed after activation preview.");
    }

    const preflight = buildKvManifestActivationPreflight(build);
    if (!preflight.canActivate) {
      throw new KvActivationError("activation_preflight_failed", `KV build manifest failed activation preflight. ${preflight.blockers.join(" ")}`);
    }
    const [latestValidation] = await tx
      .select()
      .from(mqBuildValidationRuns)
      .where(eq(mqBuildValidationRuns.buildId, parsed.buildId))
      .orderBy(desc(mqBuildValidationRuns.createdAt), desc(mqBuildValidationRuns.id))
      .limit(1)
      .for("update");
    if (!latestValidation || latestValidation.status !== "passed" || latestValidation.validationType !== "three_way_u1_parity") {
      throw new KvActivationError("validation_not_passed", "KV build activation requires the latest three-way parity validation to be passed.");
    }
    if (latestValidation.id !== parsed.expectedValidationRunId || latestValidation.reportHash !== parsed.expectedValidationReportHash) {
      throw new KvActivationError("validation_changed", "KV validation result changed after activation preview.");
    }
    const manifest = build.manifest as Record<string, unknown>;
    if (manifest.artifactType !== "rocksdb" || manifest.compileScope !== "full" || build.buildKind !== "base") {
      throw new KvActivationError("invalid_artifact_kind", "KV activation requires a full production RocksDB base build.");
    }
    if (manifest.registrySnapshotHash !== parsed.expectedRegistrySnapshotHash) {
      throw new KvActivationError("registry_expectation_mismatch", "KV registry snapshot expectation does not match the build manifest.");
    }
    const validationManifest = manifest.validation;
    if (!validationManifest || typeof validationManifest !== "object" || Array.isArray(validationManifest)) {
      throw new Error("KV build manifest is missing validation lineage.");
    }
    const validationRecord = validationManifest as Record<string, unknown>;
    if (validationRecord.validationRunId !== latestValidation.id || validationRecord.reportHash !== latestValidation.reportHash) {
      throw new Error("KV build validation lineage does not match the latest persisted validation.");
    }
    if (latestValidation.dictionaryVersion !== build.dictionaryVersion || latestValidation.registrySnapshotHash !== manifest.registrySnapshotHash) {
      throw new Error("KV validation snapshot does not match the compiled build.");
    }
    if (!build.compileRequestBuildId || manifest.compileRequestBuildId !== build.compileRequestBuildId) {
      throw new Error("KV build compile-request lineage is missing or mismatched.");
    }

    const canonicalSnapshot = await loadFullKvCompilationSnapshot(tx);
    if (canonicalSnapshot.dictionaryVersion !== build.dictionaryVersion) throw new Error("KV build is stale: dictionary version changed.");
    if (canonicalSnapshot.registrySnapshotHash !== manifest.registrySnapshotHash) throw new Error("KV build is stale: registry snapshot changed.");
    const [latestCommittedBatch] = await tx
      .select({ id: mqWorkflowLabelBatches.id })
      .from(mqWorkflowLabelBatches)
      .where(eq(mqWorkflowLabelBatches.status, "committed"))
      .orderBy(desc(mqWorkflowLabelBatches.id))
      .limit(1);
    if ((latestCommittedBatch?.id ?? null) !== (build.lastCommittedBatchId ?? null)) {
      throw new Error("KV build is stale: a newer committed batch exists.");
    }

    const indexManifests = await tx
      .select()
      .from(mqBuildIndexManifests)
      .where(eq(mqBuildIndexManifests.buildId, build.id))
      .for("update");
    const compiledRows = await tx
      .select({ indexName: mqBuildCompiledEntries.indexName, keyBytes: mqBuildCompiledEntries.keyBytes, valueBytes: mqBuildCompiledEntries.valueBytes })
      .from(mqBuildCompiledEntries)
      .where(eq(mqBuildCompiledEntries.buildId, build.id))
      .orderBy(asc(mqBuildCompiledEntries.indexName), asc(mqBuildCompiledEntries.ordinal));
    const expectedCounts = canonicalSnapshot.expectedCounts;
    for (const required of REQUIRED_KV_INDEXES) {
      const persisted = indexManifests.find((indexManifest) => indexManifest.indexName === required.indexName);
      if (!persisted || persisted.status !== "compiled" || !persisted.contentHash) {
        throw new Error(`KV activation requires compiled index ${required.indexName} with a semantic hash.`);
      }
      const rows = compiledRows.filter((row) => row.indexName === required.indexName);
      const expectedCount = expectedCounts[required.key];
      if (persisted.rowCount !== expectedCount || rows.length !== expectedCount) {
        throw new Error(`KV activation index count mismatch for ${required.indexName}.`);
      }
      if (semanticHash(rows) !== persisted.contentHash) {
        throw new Error(`KV activation semantic hash mismatch for ${required.indexName}.`);
      }
    }
    const [{ compiledCount }] = await tx
      .select({ compiledCount: sql<number>`count(*)::int` })
      .from(mqBuildCompiledEntries)
      .where(eq(mqBuildCompiledEntries.buildId, parsed.buildId));
    const reference = manifest.postgresCompiledReference;
    const expectedCompiledCount = reference && typeof reference === "object" && !Array.isArray(reference)
      ? (reference as Record<string, unknown>).rowCount
      : null;
    if (typeof expectedCompiledCount !== "number" || expectedCompiledCount !== compiledCount) {
      throw new Error("KV build activation requires complete PostgreSQL compiled-entry accounting.");
    }

    await tx
      .update(mqBuildKvBuilds)
      .set({ status: "superseded" })
      .where(eq(mqBuildKvBuilds.status, "active"));
    await tx
      .update(mqBuildIndexManifests)
      .set({ status: "superseded" })
      .where(eq(mqBuildIndexManifests.status, "active"));
    await tx
      .update(mqBuildMetricGroupMembershipSnapshots)
      .set({ status: "superseded" })
      .where(eq(mqBuildMetricGroupMembershipSnapshots.status, "active"));

    const activatedAt = new Date();
    const [updated] = await tx
      .update(mqBuildKvBuilds)
      .set({
        status: "active",
        activatedAt,
        manifest: {
          ...(build.manifest ?? {}),
          activatedAt: activatedAt.toISOString(),
          activatedBy: actor.email,
        },
      })
      .where(eq(mqBuildKvBuilds.id, parsed.buildId))
      .returning();
    await tx
      .update(mqBuildIndexManifests)
      .set({ status: "active", activatedAt })
      .where(eq(mqBuildIndexManifests.buildId, parsed.buildId));
    await tx
      .update(mqBuildMetricGroupMembershipSnapshots)
      .set({ status: "active", activatedAt })
      .where(eq(mqBuildMetricGroupMembershipSnapshots.kvBuildId, parsed.buildId));

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "kv_build_manifest_activated",
      targetTable: "mq_build_kv_builds",
      targetId: String(updated.id),
      payload: { beforeStatus: build.status, afterStatus: updated.status, buildHash: updated.buildHash, preflight },
    });

    return updated;
  });
}
