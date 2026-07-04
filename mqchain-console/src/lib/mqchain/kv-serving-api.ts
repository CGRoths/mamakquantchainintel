import {
  buildKvManifestActivationPreflight,
  summarizeKvManifestIndexes,
  summarizePersistedKvIndexRecords,
  type PersistedKvIndexManifestInput,
  type PersistedKvIndexShardInput,
} from "./kv-manifest";

export const KV_SERVING_MANIFEST_API_CONTRACT = {
  apiVersion: "mqchain-kv-serving-manifest-api-v1",
  sourceOfTruth: "postgres_control_plane",
  servingBackend: "external_kv_artifact",
  mutationAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  postgresIsCanonicalTruth: true,
  rocksDbIsCompiledArtifact: true,
} as const;

export const KV_BUILD_DETAIL_API_CONTRACT = {
  apiVersion: "mqchain-kv-build-detail-api-v1",
  sourceOfTruth: "postgres_control_plane",
  servingBackend: "external_kv_artifact",
  artifactType: "kv_build_detail_export",
  mutationAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  postgresIsCanonicalTruth: true,
  rocksDbIsCompiledArtifact: true,
  rocksDbCompiledInsideVercel: false,
} as const;

export const KV_BUILD_LIST_API_CONTRACT = {
  apiVersion: "mqchain-kv-build-list-api-v1",
  sourceOfTruth: "postgres_control_plane",
  servingBackend: "external_kv_artifact",
  artifactType: "kv_build_queue_export",
  mutationAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  fullManifestIncluded: false,
  postgresIsCanonicalTruth: true,
  rocksDbIsCompiledArtifact: true,
  rocksDbCompiledInsideVercel: false,
} as const;

export const KV_BUILD_REGISTRATION_API_CONTRACT = {
  apiVersion: "mqchain-kv-build-registration-api-v1",
  sourceOfTruth: "postgres_control_plane",
  servingBackend: "external_kv_artifact",
  mutationAllowed: true,
  writes: "kv_build_manifest_control_plane_rows",
  registryWriteAllowed: false,
  kvArtifactWriteAllowed: false,
  rocksDbCompiledInsideVercel: false,
  postgresIsCanonicalTruth: true,
  rocksDbIsCompiledArtifact: true,
} as const;

type KvServingBuild = {
  id: number;
  buildHash: string | null;
  dictionaryVersion: string | null;
  status: string;
  rowCount: number;
  storageUri: string | null;
  manifest: Record<string, unknown>;
  createdAt: Date;
  activatedAt: Date | null;
};

export type KvBuildListApiInput = {
  query: {
    page: number;
    pageSize: number;
    filters: Record<string, unknown>;
  };
  rows: KvServingBuild[];
  total: number;
  totalPages: number;
};

export type KvBuildRegistrationApiInput = {
  build: KvServingBuild;
};

type KvServingMembershipSnapshot = {
  id: number;
  metricGroupId: number | null;
  metricGroupCode: string;
  dictionaryVersion: string | null;
  status: string;
  memberCount: number;
  manifestHash: string | null;
  activatedAt: Date | null;
};

type KvServingMembershipMember = {
  id: number;
  snapshotId: number | null;
  registryId?: number | null;
  chainCode?: string;
  normalizedAddress?: string;
  entityId?: number | null;
  roleId?: number | null;
  confidenceScore?: number;
  flags?: number;
};

export type KvServingManifestApiInput = {
  build: KvServingBuild;
  indexManifests: PersistedKvIndexManifestInput[];
  indexShards: PersistedKvIndexShardInput[];
  membershipSnapshots: KvServingMembershipSnapshot[];
  membershipRows: KvServingMembershipMember[];
};

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function manifestKeys(manifest: Record<string, unknown>) {
  return Object.keys(manifest ?? {}).sort((left, right) => left.localeCompare(right));
}

function manifestString(manifest: Record<string, unknown>, key: string) {
  const value = manifest[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function manifestNumber(manifest: Record<string, unknown>, key: string) {
  const value = manifest[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildKvBuildListRow(build: KvServingBuild) {
  const preflight = buildKvManifestActivationPreflight(build);
  const declaredIndexSummary = summarizeKvManifestIndexes(build.manifest);

  return {
    id: build.id,
    buildHash: build.buildHash,
    dictionaryVersion: build.dictionaryVersion,
    status: build.status,
    rowCount: build.rowCount,
    storageUri: build.storageUri,
    artifactType: manifestString(build.manifest, "artifactType"),
    artifactStatus: manifestString(build.manifest, "artifactStatus"),
    manifestRowCount: manifestNumber(build.manifest, "rowCount"),
    manifestKeys: manifestKeys(build.manifest),
    declaredIndexes: {
      hasIndexes: declaredIndexSummary.hasIndexes,
      missingRequired: declaredIndexSummary.missingRequired,
      totalRowCount: declaredIndexSummary.totalRowCount,
      rowCountMissing: declaredIndexSummary.rowCountMissing,
      indexCount: declaredIndexSummary.rows.filter((row) => row.present).length,
    },
    activationPreflight: {
      canActivate: preflight.canActivate,
      blockerCount: preflight.blockers.length,
      blockers: preflight.blockers,
    },
    createdAt: isoDate(build.createdAt),
    activatedAt: isoDate(build.activatedAt),
    hrefs: {
      detailApi: `/api/mqchain/kv-builds/${build.id}`,
      detailPage: `/mqchain/kv-builds/${build.id}`,
      activeApi: "/api/mqchain/kv-builds/active",
    },
  };
}

export function buildKvBuildListApiResponse(input: KvBuildListApiInput) {
  return {
    ...KV_BUILD_LIST_API_CONTRACT,
    query: input.query,
    pagination: {
      totalRows: input.total,
      page: input.query.page,
      pageSize: input.query.pageSize,
      totalPages: input.totalPages,
      returnedRows: input.rows.length,
    },
    rows: input.rows.map(buildKvBuildListRow),
    policy: {
      queueContainsControlPlaneManifestsOnly: true,
      externalWorkerOwnsArtifactStorage: true,
      consoleOnlyTracksControlPlaneState: true,
      rocksDbCompilationNotPerformedInVercel: true,
      activationRequiresPreflightPass: true,
      activeServingEndpointIsSeparate: true,
      fullManifestAvailableOnDetailEndpoint: true,
    },
  };
}

export function buildKvBuildRegistrationApiResponse(input: KvBuildRegistrationApiInput) {
  const preflight = buildKvManifestActivationPreflight(input.build);

  return {
    ...KV_BUILD_REGISTRATION_API_CONTRACT,
    build: buildKvBuildListRow(input.build),
    canonicalWrites: {
      registryRowsCreated: 0,
      labelsCreated: 0,
      candidatesCreated: 0,
    },
    controlPlaneWrites: {
      kvBuildsCreated: 1,
      indexManifestsMayBeCreated: true,
      indexShardsMayBeCreated: true,
      metricGroupSnapshotsMayBeCreated: true,
    },
    activationPreflight: {
      canActivate: preflight.canActivate,
      blockerCount: preflight.blockers.length,
      blockers: preflight.blockers,
    },
    nextActions: {
      detailApi: `/api/mqchain/kv-builds/${input.build.id}`,
      detailPage: `/mqchain/kv-builds/${input.build.id}`,
      activeApi: "/api/mqchain/kv-builds/active",
    },
    policy: {
      externalWorkerOwnsArtifactStorage: true,
      consoleRegistersManifestOnly: true,
      rocksDbCompilationNotPerformedInVercel: true,
      activationRequiresPreflightPass: true,
      registryRowsRequireBatchCommitBeforeCompile: true,
      kvArtifactRegistrationDoesNotCreateLabels: true,
    },
  };
}

export function buildKvServingManifestApiResponse(input: KvServingManifestApiInput) {
  const indexSummary = summarizePersistedKvIndexRecords(input.indexManifests, input.indexShards);
  const membershipRowsBySnapshot = new Map<number, number>();

  for (const row of input.membershipRows) {
    if (typeof row.snapshotId !== "number") continue;
    membershipRowsBySnapshot.set(row.snapshotId, (membershipRowsBySnapshot.get(row.snapshotId) ?? 0) + 1);
  }

  return {
    ...KV_SERVING_MANIFEST_API_CONTRACT,
    activeBuild: {
      id: input.build.id,
      buildHash: input.build.buildHash,
      dictionaryVersion: input.build.dictionaryVersion,
      status: input.build.status,
      rowCount: input.build.rowCount,
      storageUri: input.build.storageUri,
      createdAt: isoDate(input.build.createdAt),
      activatedAt: isoDate(input.build.activatedAt),
    },
    indexSummary: {
      indexCount: indexSummary.indexCount,
      shardCount: indexSummary.shardCount,
      totalRowCount: indexSummary.totalRowCount,
      totalShardRowCount: indexSummary.totalShardRowCount,
      missingRequired: indexSummary.missingRequired,
      statusCounts: indexSummary.statusCounts,
    },
    indexes: indexSummary.rows.map((row) => ({
      id: row.id,
      indexName: row.indexName,
      requiredKey: row.requiredKey,
      requiredLabel: row.requiredLabel,
      dictionaryVersion: row.dictionaryVersion,
      status: row.status,
      rowCount: row.rowCount,
      storageUri: row.storageUri,
      manifestHash: row.manifestHash,
      lastCommittedBatchId: row.lastCommittedBatchId,
      activatedAt: isoDate(row.activatedAt),
      shardCount: row.shardCount,
      shardRowCount: row.shardRowCount,
      shards: row.shards.map((shard) => ({
        shardId: shard.shardId,
        shardKey: shard.shardKey,
        shardHash: shard.shardHash,
        storageUri: shard.storageUri,
        rowCount: shard.rowCount,
      })),
    })),
    metricGroupMembership: input.membershipSnapshots.map((snapshot) => ({
      snapshotId: snapshot.id,
      metricGroupId: snapshot.metricGroupId,
      metricGroupCode: snapshot.metricGroupCode,
      dictionaryVersion: snapshot.dictionaryVersion,
      status: snapshot.status,
      memberCount: snapshot.memberCount,
      persistedMemberRows: membershipRowsBySnapshot.get(snapshot.id) ?? 0,
      manifestHash: snapshot.manifestHash,
      activatedAt: isoDate(snapshot.activatedAt),
    })),
    manifest: input.build.manifest,
    policy: {
      activeBuildOnly: true,
      requiredServingIndexes: indexSummary.missingRequired.length === 0,
      externalWorkerOwnsArtifactStorage: true,
      consoleOnlyTracksControlPlaneState: true,
    },
  };
}

export function buildKvBuildDetailApiResponse(input: KvServingManifestApiInput) {
  const declaredIndexSummary = summarizeKvManifestIndexes(input.build.manifest);
  const persistedIndexSummary = summarizePersistedKvIndexRecords(input.indexManifests, input.indexShards);
  const preflight = buildKvManifestActivationPreflight(input.build);
  const membershipRowsBySnapshot = new Map<number, KvServingMembershipMember[]>();

  for (const row of input.membershipRows) {
    if (typeof row.snapshotId !== "number") continue;
    const current = membershipRowsBySnapshot.get(row.snapshotId) ?? [];
    current.push(row);
    membershipRowsBySnapshot.set(row.snapshotId, current);
  }

  return {
    ...KV_BUILD_DETAIL_API_CONTRACT,
    build: {
      id: input.build.id,
      buildHash: input.build.buildHash,
      dictionaryVersion: input.build.dictionaryVersion,
      status: input.build.status,
      rowCount: input.build.rowCount,
      storageUri: input.build.storageUri,
      createdAt: isoDate(input.build.createdAt),
      activatedAt: isoDate(input.build.activatedAt),
    },
    activationPreflight: {
      canActivate: preflight.canActivate,
      blockers: preflight.blockers,
      checks: preflight.checks,
    },
    declaredIndexes: {
      hasIndexes: declaredIndexSummary.hasIndexes,
      missingRequired: declaredIndexSummary.missingRequired,
      totalRowCount: declaredIndexSummary.totalRowCount,
      rowCountMissing: declaredIndexSummary.rowCountMissing,
      rows: declaredIndexSummary.rows,
    },
    persistedIndexes: {
      indexCount: persistedIndexSummary.indexCount,
      shardCount: persistedIndexSummary.shardCount,
      totalRowCount: persistedIndexSummary.totalRowCount,
      totalShardRowCount: persistedIndexSummary.totalShardRowCount,
      missingRequired: persistedIndexSummary.missingRequired,
      statusCounts: persistedIndexSummary.statusCounts,
      rows: persistedIndexSummary.rows.map((row) => ({
        id: row.id,
        indexName: row.indexName,
        requiredKey: row.requiredKey,
        requiredLabel: row.requiredLabel,
        dictionaryVersion: row.dictionaryVersion,
        status: row.status,
        rowCount: row.rowCount,
        storageUri: row.storageUri,
        manifestHash: row.manifestHash,
        lastCommittedBatchId: row.lastCommittedBatchId,
        activatedAt: isoDate(row.activatedAt),
        shardCount: row.shardCount,
        shardRowCount: row.shardRowCount,
        shards: row.shards.map((shard) => ({
          manifestId: shard.manifestId,
          shardId: shard.shardId,
          shardKey: shard.shardKey,
          shardHash: shard.shardHash,
          storageUri: shard.storageUri,
          rowCount: shard.rowCount,
        })),
      })),
    },
    metricGroupMembership: input.membershipSnapshots.map((snapshot) => {
      const rows = membershipRowsBySnapshot.get(snapshot.id) ?? [];
      return {
        snapshotId: snapshot.id,
        metricGroupId: snapshot.metricGroupId,
        metricGroupCode: snapshot.metricGroupCode,
        dictionaryVersion: snapshot.dictionaryVersion,
        status: snapshot.status,
        memberCount: snapshot.memberCount,
        persistedMemberRows: rows.length,
        manifestHash: snapshot.manifestHash,
        activatedAt: isoDate(snapshot.activatedAt),
        memberPreview: rows.slice(0, 50).map((row) => ({
          id: row.id,
          registryId: row.registryId ?? null,
          chainCode: row.chainCode ?? null,
          normalizedAddress: row.normalizedAddress ?? null,
          entityId: row.entityId ?? null,
          roleId: row.roleId ?? null,
          confidenceScore: row.confidenceScore ?? null,
          flags: row.flags ?? null,
        })),
      };
    }),
    manifest: input.build.manifest,
    policy: {
      externalWorkerOwnsArtifactStorage: true,
      consoleOnlyTracksControlPlaneState: true,
      rocksDbCompilationNotPerformedInVercel: true,
      activationRequiresPreflightPass: true,
      requiredServingIndexesPersisted: persistedIndexSummary.missingRequired.length === 0,
      activeBuildEndpointUsesOnlyActiveManifests: true,
      mutationRequiresServerActionAndBatchCommitPermission: true,
    },
  };
}
