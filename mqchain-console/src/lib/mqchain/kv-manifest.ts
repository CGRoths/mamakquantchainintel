export type PendingBatchKvManifestInput = {
  batchId: number;
  registryIds: number[];
  dictionaryVersion: string;
};

export type KvBuildActivationCandidate = {
  status: string;
  buildHash: string | null;
  dictionaryVersion: string | null;
  rowCount: number;
  storageUri: string | null;
  manifest: Record<string, unknown> | null;
};

export type KvManifestPreflightCheck = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type KvManifestActivationPreflight = {
  canActivate: boolean;
  checks: KvManifestPreflightCheck[];
  blockers: string[];
};

export type KvManifestIndexSummaryRow = {
  key: string;
  indexName: string;
  label: string;
  present: boolean;
  rowCount: number | null;
  hash: string | null;
  path: string | null;
};

export type KvManifestIndexSummary = {
  hasIndexes: boolean;
  rows: KvManifestIndexSummaryRow[];
  missingRequired: string[];
  totalRowCount: number | null;
  rowCountMissing: string[];
};

export type KvIndexManifestRecord = {
  indexKey: string;
  indexName: string;
  rowCount: number;
  storageUri: string | null;
  manifestHash: string | null;
  lastCommittedBatchId: number | null;
  metadata: Record<string, unknown>;
  shards: KvIndexShardRecord[];
};

export type KvIndexShardRecord = {
  shardId: string;
  shardKey: string;
  shardHash: string | null;
  storageUri: string | null;
  rowCount: number;
  metadata: Record<string, unknown>;
};

export type PersistedKvIndexManifestInput = {
  id: number;
  indexName: string;
  dictionaryVersion: string | null;
  status: string;
  rowCount: number;
  storageUri: string | null;
  manifestHash: string | null;
  lastCommittedBatchId: number | null;
  activatedAt?: Date | null;
};

export type PersistedKvIndexShardInput = {
  manifestId: number | null;
  shardId: string;
  shardKey: string;
  shardHash: string | null;
  storageUri: string | null;
  rowCount: number;
};

export type PersistedKvIndexSummaryRow = PersistedKvIndexManifestInput & {
  requiredKey: string | null;
  requiredLabel: string | null;
  shardCount: number;
  shardRowCount: number;
  shards: PersistedKvIndexShardInput[];
};

export type PersistedKvIndexSummary = {
  rows: PersistedKvIndexSummaryRow[];
  indexCount: number;
  shardCount: number;
  totalRowCount: number;
  totalShardRowCount: number;
  missingRequired: string[];
  statusCounts: Record<string, number>;
};

export const REQUIRED_KV_INDEXES = [
  { key: "addressLabelCurrent", indexName: "address_label_current", label: "Address label current" },
  { key: "addressLabelTimeline", indexName: "address_label_timeline", label: "Address label timeline" },
  { key: "metricGroupMembership", indexName: "metric_group_membership", label: "Metric group membership" },
] as const;

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberFromManifest(manifest: Record<string, unknown>, key: string) {
  const value = manifest[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function findIndexManifest(indexes: Record<string, unknown>, key: string, indexName: string) {
  const direct = indexes[key];
  if (isRecord(direct)) {
    return direct;
  }

  for (const value of Object.values(indexes)) {
    if (!isRecord(value)) {
      continue;
    }
    if (value.indexName === indexName) {
      return value;
    }
  }

  return null;
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function indexStorageUri(indexManifest: Record<string, unknown>, fallbackStorageUri?: string | null) {
  if (hasText(indexManifest.storageUri)) return indexManifest.storageUri;
  if (hasText(indexManifest.path)) return indexManifest.path;
  return fallbackStorageUri ?? null;
}

function shardRows(indexKey: string, indexName: string, indexManifest: Record<string, unknown>, fallbackStorageUri?: string | null) {
  if (!Array.isArray(indexManifest.shards)) {
    return [];
  }

  const rows: KvIndexShardRecord[] = [];
  for (const [position, shard] of indexManifest.shards.entries()) {
    if (!isRecord(shard)) {
      continue;
    }

    const shardId = hasText(shard.shardId) ? shard.shardId : hasText(shard.id) ? shard.id : `${indexName}-${position + 1}`;
    const shardKey = hasText(shard.shardKey) ? shard.shardKey : hasText(shard.key) ? shard.key : shardId;
    rows.push({
      shardId,
      shardKey,
      shardHash: hasText(shard.shardHash) ? shard.shardHash : hasText(shard.hash) ? shard.hash : null,
      storageUri: indexStorageUri(shard, indexStorageUri(indexManifest, fallbackStorageUri)),
      rowCount: nonNegativeInteger(shard.rowCount) ?? 0,
      metadata: {
        indexKey,
        indexName,
        source: "kv_manifest_indexes",
        shard,
      },
    });
  }

  return rows;
}

export function extractKvIndexManifestRecords(
  manifest: Record<string, unknown> | null | undefined,
  fallbackStorageUri?: string | null,
): KvIndexManifestRecord[] {
  const indexes = isRecord(manifest?.indexes) ? manifest.indexes : null;
  if (!indexes) {
    return [];
  }

  return Object.entries(indexes)
    .filter(([, value]) => isRecord(value))
    .map(([indexKey, value]) => {
      const indexManifest = value as Record<string, unknown>;
      const indexName = hasText(indexManifest.indexName) ? indexManifest.indexName : indexKey;
      return {
        indexKey,
        indexName,
        rowCount: nonNegativeInteger(indexManifest.rowCount) ?? 0,
        storageUri: indexStorageUri(indexManifest, fallbackStorageUri),
        manifestHash: hasText(indexManifest.hash) ? indexManifest.hash : hasText(indexManifest.manifestHash) ? indexManifest.manifestHash : null,
        lastCommittedBatchId: positiveInteger(manifest?.lastCommittedBatchId) ?? positiveInteger(manifest?.batchId),
        metadata: {
          indexKey,
          indexName,
          source: "kv_manifest_indexes",
          indexManifest,
        },
        shards: shardRows(indexKey, indexName, indexManifest, fallbackStorageUri),
      };
    });
}

export function summarizePersistedKvIndexRecords(
  indexManifests: PersistedKvIndexManifestInput[],
  indexShards: PersistedKvIndexShardInput[],
): PersistedKvIndexSummary {
  const requiredByName: Map<string, (typeof REQUIRED_KV_INDEXES)[number]> = new Map(
    REQUIRED_KV_INDEXES.map((index) => [index.indexName, index]),
  );
  const presentNames = new Set(indexManifests.map((index) => index.indexName));
  const shardsByManifestId = new Map<number, PersistedKvIndexShardInput[]>();
  for (const shard of indexShards) {
    if (typeof shard.manifestId !== "number") {
      continue;
    }
    const current = shardsByManifestId.get(shard.manifestId) ?? [];
    current.push(shard);
    shardsByManifestId.set(shard.manifestId, current);
  }

  const statusCounts: Record<string, number> = {};
  const rows = indexManifests.map((indexManifest) => {
    const required = requiredByName.get(indexManifest.indexName) ?? null;
    const shards = shardsByManifestId.get(indexManifest.id) ?? [];
    statusCounts[indexManifest.status] = (statusCounts[indexManifest.status] ?? 0) + 1;

    return {
      ...indexManifest,
      requiredKey: required?.key ?? null,
      requiredLabel: required?.label ?? null,
      shardCount: shards.length,
      shardRowCount: shards.reduce((total, shard) => total + shard.rowCount, 0),
      shards,
    };
  });

  return {
    rows,
    indexCount: indexManifests.length,
    shardCount: indexShards.length,
    totalRowCount: indexManifests.reduce((total, indexManifest) => total + indexManifest.rowCount, 0),
    totalShardRowCount: indexShards.reduce((total, shard) => total + shard.rowCount, 0),
    missingRequired: REQUIRED_KV_INDEXES.filter((index) => !presentNames.has(index.indexName)).map((index) => index.label),
    statusCounts,
  };
}

export function summarizeKvManifestIndexes(manifest: Record<string, unknown> | null | undefined): KvManifestIndexSummary {
  const indexes = isRecord(manifest?.indexes) ? manifest.indexes : null;
  if (!indexes) {
    return {
      hasIndexes: false,
      rows: REQUIRED_KV_INDEXES.map((index) => ({
        ...index,
        present: false,
        rowCount: null,
        hash: null,
        path: null,
      })),
      missingRequired: [],
      totalRowCount: null,
      rowCountMissing: [],
    };
  }

  let totalRowCount = 0;
  const rowCountMissing: string[] = [];
  const rows = REQUIRED_KV_INDEXES.map((index) => {
    const indexManifest = findIndexManifest(indexes, index.key, index.indexName);
    const rowCount = indexManifest ? numberFromManifest(indexManifest, "rowCount") : null;
    if (indexManifest && rowCount === null) {
      rowCountMissing.push(index.label);
    }
    if (rowCount !== null) {
      totalRowCount += rowCount;
    }

    return {
      ...index,
      present: Boolean(indexManifest),
      rowCount,
      hash: indexManifest && hasText(indexManifest.hash) ? indexManifest.hash : null,
      path: indexManifest && hasText(indexManifest.path) ? indexManifest.path : null,
    };
  });

  return {
    hasIndexes: true,
    rows,
    missingRequired: rows.filter((row) => !row.present).map((row) => row.label),
    totalRowCount,
    rowCountMissing,
  };
}

function indexRowCountSummary(indexes: unknown) {
  if (!isRecord(indexes)) {
    return null;
  }

  let total = 0;
  const missing: string[] = [];
  for (const [indexName, indexManifest] of Object.entries(indexes)) {
    if (!isRecord(indexManifest)) {
      missing.push(indexName);
      continue;
    }
    const rowCount = numberFromManifest(indexManifest, "rowCount");
    if (rowCount === null) {
      missing.push(indexName);
      continue;
    }
    total += rowCount;
  }

  return { total, missing };
}

export function buildPendingBatchKvManifest(input: PendingBatchKvManifestInput) {
  return {
    reason: "batch_commit",
    batchId: input.batchId,
    registryIds: input.registryIds,
    dictionaryVersion: input.dictionaryVersion,
    artifactType: "rocksdb",
    artifactStatus: "pending_external_compile",
    note: "RocksDB compilation is external; this manifest is the Vercel control-plane handoff.",
  };
}

export function buildKvManifestActivationPreflight(build: KvBuildActivationCandidate): KvManifestActivationPreflight {
  const manifest = isRecord(build.manifest) ? build.manifest : null;
  const checks: KvManifestPreflightCheck[] = [];

  checks.push({
    key: "status",
    label: "Compiled status",
    status: build.status === "compiled" ? "pass" : "fail",
    detail: build.status === "compiled" ? "Manifest is compiled and ready for activation." : "Only compiled manifests can become active.",
  });

  checks.push({
    key: "buildHash",
    label: "Build hash",
    status: hasText(build.buildHash) ? "pass" : "fail",
    detail: hasText(build.buildHash) ? build.buildHash : "A deterministic build hash is required.",
  });

  checks.push({
    key: "dictionaryVersion",
    label: "Dictionary version",
    status: hasText(build.dictionaryVersion) ? "pass" : "fail",
    detail: hasText(build.dictionaryVersion) ? build.dictionaryVersion : "Activation requires the dictionary version used to compile the artifact.",
  });

  checks.push({
    key: "storageUri",
    label: "External artifact URI",
    status: hasText(build.storageUri) ? "pass" : "fail",
    detail: hasText(build.storageUri) ? build.storageUri : "Activation must point to an external/local worker-produced artifact.",
  });

  checks.push({
    key: "manifestObject",
    label: "Manifest object",
    status: manifest ? "pass" : "fail",
    detail: manifest ? "Manifest JSON is an object." : "Manifest JSON must be an object.",
  });

  if (manifest) {
    checks.push({
      key: "artifactType",
      label: "Artifact type",
      status: hasText(manifest.artifactType) ? "pass" : "fail",
      detail: hasText(manifest.artifactType) ? manifest.artifactType : "Manifest must name the artifact type, such as rocksdb or jsonl-kv-preview.",
    });

    const manifestRowCount = numberFromManifest(manifest, "rowCount");
    checks.push({
      key: "rowCount",
      label: "Row count agreement",
      status: manifestRowCount === null || manifestRowCount === build.rowCount ? "pass" : "fail",
      detail:
        manifestRowCount === null
          ? `Database row count is ${build.rowCount}; manifest rowCount is not declared.`
          : `Database row count is ${build.rowCount}; manifest rowCount is ${manifestRowCount}.`,
    });

    const registryIds = Array.isArray(manifest.registryIds) ? manifest.registryIds : null;
    checks.push({
      key: "registryIds",
      label: "Registry ID accounting",
      status: registryIds === null || registryIds.length === build.rowCount ? "pass" : "fail",
      detail:
        registryIds === null
          ? "Manifest does not enumerate registry IDs; this is acceptable for full external builds."
          : `Manifest lists ${registryIds.length} registry IDs for ${build.rowCount} rows.`,
    });

    const indexes = indexRowCountSummary(manifest.indexes);
    const requiredIndexes = summarizeKvManifestIndexes(manifest);
    checks.push({
      key: "indexRowCounts",
      label: "Index row counts",
      status: !manifest.indexes || (indexes !== null && indexes.missing.length === 0 && indexes.total === build.rowCount) ? "pass" : "fail",
      detail: !manifest.indexes
        ? "Manifest does not declare per-index row counts."
        : indexes === null
          ? "Manifest indexes must be an object keyed by index name."
          : indexes.missing.length
            ? `Missing rowCount for indexes: ${indexes.missing.join(", ")}.`
            : `Index row counts sum to ${indexes.total} for database row count ${build.rowCount}.`,
    });

    checks.push({
      key: "requiredIndexes",
      label: "Required serving indexes",
      status:
        !requiredIndexes.hasIndexes ||
        (requiredIndexes.missingRequired.length === 0 && requiredIndexes.rowCountMissing.length === 0)
          ? "pass"
          : "fail",
      detail: !requiredIndexes.hasIndexes
        ? "Manifest does not declare serving indexes."
        : requiredIndexes.missingRequired.length
          ? `Missing required indexes: ${requiredIndexes.missingRequired.join(", ")}.`
          : requiredIndexes.rowCountMissing.length
            ? `Missing rowCount for required indexes: ${requiredIndexes.rowCountMissing.join(", ")}.`
            : `Manifest declares ${requiredIndexes.rows.length} required serving indexes.`,
    });
  }

  if (build.rowCount === 0) {
    checks.push({
      key: "emptyBuild",
      label: "Empty build",
      status: "warn",
      detail: "This artifact contains zero rows. Activate only if the empty registry is intentional.",
    });
  }

  const blockers = checks.filter((check) => check.status === "fail").map((check) => `${check.label}: ${check.detail}`);
  return { canActivate: blockers.length === 0, checks, blockers };
}
