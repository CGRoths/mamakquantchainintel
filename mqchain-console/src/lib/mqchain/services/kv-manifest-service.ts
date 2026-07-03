import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressRegistry,
  mqAuditLog,
  mqKvBuilds,
  mqKvIndexManifests,
  mqKvIndexShards,
  mqMetricGroupMembers,
  mqMetricGroupMembershipSnapshots,
} from "@/db/schema";
import { assertPermission } from "@/lib/auth/permissions";
import { extractMetricGroupMembershipSnapshotManifest } from "../metric-group-preview";
import { buildKvManifestActivationPreflight, extractKvIndexManifestRecords } from "../kv-manifest";
import { parseKvBuildListFilters, type KvBuildListFilters } from "../list-filters";
import { createKvBuildManifestSchema, kvBuildIdSchema } from "../validators/kv-manifest";
import { hashJson } from "./service-utils";

function kvBuildOrderBy(sort: KvBuildListFilters["sort"]) {
  if (sort === "activated_at") return desc(mqKvBuilds.activatedAt);
  if (sort === "row_count") return desc(mqKvBuilds.rowCount);
  if (sort === "status") return asc(mqKvBuilds.status);
  return desc(mqKvBuilds.createdAt);
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
        ilike(mqKvBuilds.buildHash, `%${filters.q}%`),
        ilike(mqKvBuilds.dictionaryVersion, `%${filters.q}%`),
        ilike(mqKvBuilds.storageUri, `%${filters.q}%`),
        sql`${mqKvBuilds.manifest}::text ilike ${`%${filters.q}%`}`,
        sql`${mqKvBuilds.id}::text ilike ${`%${filters.q}%`}`,
      ),
    );
  }

  if (filters.status) conditions.push(eq(mqKvBuilds.status, filters.status));
  if (filters.dictionaryVersion) conditions.push(ilike(mqKvBuilds.dictionaryVersion, `%${filters.dictionaryVersion}%`));
  if (filters.storage) conditions.push(ilike(mqKvBuilds.storageUri, `%${filters.storage}%`));
  if (typeof filters.minRows === "number") conditions.push(gte(mqKvBuilds.rowCount, filters.minRows));
  if (typeof filters.maxRows === "number") conditions.push(lte(mqKvBuilds.rowCount, filters.maxRows));

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(mqKvBuilds).where(where);
  const rows = await db
    .select()
    .from(mqKvBuilds)
    .where(where)
    .orderBy(kvBuildOrderBy(filters.sort), desc(mqKvBuilds.id))
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
  const [build] = await getDb().select().from(mqKvBuilds).where(eq(mqKvBuilds.id, id)).limit(1);
  return build ?? null;
}

export async function getKvBuildDetail(id: number) {
  const db = getDb();
  const [build] = await db.select().from(mqKvBuilds).where(eq(mqKvBuilds.id, id)).limit(1);

  if (!build) {
    return null;
  }

  const indexManifests = await db
    .select()
    .from(mqKvIndexManifests)
    .where(eq(mqKvIndexManifests.buildId, build.id))
    .orderBy(asc(mqKvIndexManifests.indexName), asc(mqKvIndexManifests.id));
  const indexManifestIds = indexManifests.map((indexManifest) => indexManifest.id);
  const indexShards = indexManifestIds.length
    ? await db
        .select()
        .from(mqKvIndexShards)
        .where(inArray(mqKvIndexShards.manifestId, indexManifestIds))
        .orderBy(asc(mqKvIndexShards.manifestId), asc(mqKvIndexShards.shardKey), asc(mqKvIndexShards.shardId))
    : [];
  const membershipSnapshots = await db
    .select()
    .from(mqMetricGroupMembershipSnapshots)
    .where(eq(mqMetricGroupMembershipSnapshots.kvBuildId, build.id))
    .orderBy(asc(mqMetricGroupMembershipSnapshots.metricGroupCode), asc(mqMetricGroupMembershipSnapshots.id));
  const membershipSnapshotIds = membershipSnapshots.map((snapshot) => snapshot.id);
  const membershipRows = membershipSnapshotIds.length
    ? await db
        .select()
        .from(mqMetricGroupMembers)
        .where(inArray(mqMetricGroupMembers.snapshotId, membershipSnapshotIds))
        .orderBy(asc(mqMetricGroupMembers.snapshotId), asc(mqMetricGroupMembers.chainCode), asc(mqMetricGroupMembers.normalizedAddress))
    : [];

  return { build, indexManifests, indexShards, membershipSnapshots, membershipRows };
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
      .insert(mqKvBuilds)
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
        .insert(mqKvIndexManifests)
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
        await tx.insert(mqKvIndexShards).values(
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
            .from(mqAddressRegistry)
            .where(inArray(mqAddressRegistry.id, metricGroupSnapshotInput.registryIds))
            .orderBy(asc(mqAddressRegistry.chainCode), asc(mqAddressRegistry.normalizedAddress), asc(mqAddressRegistry.id))
        : [];

      const [snapshot] = await tx
        .insert(mqMetricGroupMembershipSnapshots)
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
        await tx.insert(mqMetricGroupMembers).values(
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

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "kv_build_manifest_created",
      targetTable: "mq_kv_builds",
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
  const actor = await assertPermission("batch:commit");
  const parsed = kvBuildIdSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [build] = await tx.select().from(mqKvBuilds).where(eq(mqKvBuilds.id, parsed.buildId)).limit(1);

    if (!build) {
      throw new Error("KV build manifest not found.");
    }

    const preflight = buildKvManifestActivationPreflight(build);
    if (!preflight.canActivate) {
      throw new Error(`KV build manifest failed activation preflight. ${preflight.blockers.join(" ")}`);
    }

    await tx
      .update(mqKvBuilds)
      .set({ status: "superseded" })
      .where(eq(mqKvBuilds.status, "active"));
    await tx
      .update(mqKvIndexManifests)
      .set({ status: "superseded" })
      .where(eq(mqKvIndexManifests.status, "active"));
    await tx
      .update(mqMetricGroupMembershipSnapshots)
      .set({ status: "superseded" })
      .where(eq(mqMetricGroupMembershipSnapshots.status, "active"));

    const activatedAt = new Date();
    const [updated] = await tx
      .update(mqKvBuilds)
      .set({
        status: "active",
        activatedAt,
        manifest: {
          ...(build.manifest ?? {}),
          activatedAt: activatedAt.toISOString(),
          activatedBy: actor.email,
        },
      })
      .where(eq(mqKvBuilds.id, parsed.buildId))
      .returning();
    await tx
      .update(mqKvIndexManifests)
      .set({ status: "active", activatedAt })
      .where(eq(mqKvIndexManifests.buildId, parsed.buildId));
    await tx
      .update(mqMetricGroupMembershipSnapshots)
      .set({ status: "active", activatedAt })
      .where(eq(mqMetricGroupMembershipSnapshots.kvBuildId, parsed.buildId));

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "kv_build_manifest_activated",
      targetTable: "mq_kv_builds",
      targetId: String(updated.id),
      payload: { beforeStatus: build.status, afterStatus: updated.status, buildHash: updated.buildHash, preflight },
    });

    return updated;
  });
}
