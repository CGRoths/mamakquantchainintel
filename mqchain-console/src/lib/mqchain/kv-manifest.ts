import {
  MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS,
  REQUIRED_KV_INDEXES,
  type RequiredKvIndexKey,
} from "./kv/contract";
import { hashJson } from "./contracts/hash";

export { REQUIRED_KV_INDEXES };

export type PendingKvExpectedCounts = Record<RequiredKvIndexKey, number>;

export type PendingBatchKvManifestInput = {
  batchId: number;
  registryIds: number[];
  registrySnapshotHash: string;
  dictionaryVersion: string;
  expectedCounts: PendingKvExpectedCounts;
};

export type FullKvBuildManifestInput = {
  triggeringBatchId: number;
  lastCommittedBatchId: number;
  registryIds: readonly number[];
  registrySnapshotHash: string;
  dictionaryVersion: string;
  expectedCounts: PendingKvExpectedCounts;
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

export function buildPendingBatchKvManifest(input: PendingBatchKvManifestInput) {
  return {
    reason: "batch_commit",
    batchId: input.batchId,
    registryIds: [...input.registryIds].sort((left, right) => left - right),
    registrySnapshotHash: input.registrySnapshotHash,
    dictionaryVersion: input.dictionaryVersion,
    ...MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS,
    expectedCounts: {
      addressLabelCurrent: input.expectedCounts.addressLabelCurrent,
      addressLabelTimeline: input.expectedCounts.addressLabelTimeline,
      metricGroupMembership: input.expectedCounts.metricGroupMembership,
    },
    artifactType: "rocksdb",
    artifactStatus: "pending_external_compile",
    note: "RocksDB compilation is external; this manifest is the Vercel control-plane handoff.",
  };
}

export function buildPendingFullKvManifest(input: FullKvBuildManifestInput) {
  return {
    reason: "full_registry_compile",
    compileScope: "full",
    triggeringBatchId: input.triggeringBatchId,
    lastCommittedBatchId: input.lastCommittedBatchId,
    registryIds: [...input.registryIds].sort((left, right) => left - right),
    registrySnapshotHash: input.registrySnapshotHash,
    dictionaryVersion: input.dictionaryVersion,
    ...MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS,
    expectedCounts: { ...input.expectedCounts },
    artifactType: "rocksdb",
    artifactStatus: "pending_external_compile",
    note: "Full immutable registry snapshot pending external RocksDB compilation.",
  } as const;
}

export function computeFullKvBuildRequestHash(manifest: ReturnType<typeof buildPendingFullKvManifest>) {
  return hashJson({
    reason: manifest.reason,
    compileScope: manifest.compileScope,
    triggeringBatchId: manifest.triggeringBatchId,
    lastCommittedBatchId: manifest.lastCommittedBatchId,
    registryIds: manifest.registryIds,
    registrySnapshotHash: manifest.registrySnapshotHash,
    dictionaryVersion: manifest.dictionaryVersion,
    dictionarySchemaVersion: manifest.dictionarySchemaVersion,
    keySchemaVersion: manifest.keySchemaVersion,
    valueSchemaVersion: manifest.valueSchemaVersion,
    timelineSchemaVersion: manifest.timelineSchemaVersion,
    metricSchemaVersion: manifest.metricSchemaVersion,
    expectedCounts: manifest.expectedCounts,
    artifactType: manifest.artifactType,
  });
}

/**
 * Deterministic hash of the pending KV build request. Uses immutable content
 * only — never timestamps. Same registry snapshot in, same hash out.
 */
export function computePendingKvBuildHash(manifest: ReturnType<typeof buildPendingBatchKvManifest>) {
  return hashJson({
    reason: manifest.reason,
    batchId: manifest.batchId,
    registryIds: manifest.registryIds,
    registrySnapshotHash: manifest.registrySnapshotHash,
    dictionaryVersion: manifest.dictionaryVersion,
    dictionarySchemaVersion: manifest.dictionarySchemaVersion,
    keySchemaVersion: manifest.keySchemaVersion,
    valueSchemaVersion: manifest.valueSchemaVersion,
    timelineSchemaVersion: manifest.timelineSchemaVersion,
    metricSchemaVersion: manifest.metricSchemaVersion,
    expectedCounts: manifest.expectedCounts,
    artifactType: manifest.artifactType,
  });
}

const PREVIEW_ARTIFACT_TYPES = new Set(["jsonl-kv-preview", "preview", "partial"]);

function isPreviewOrPartialArtifact(manifest: Record<string, unknown>) {
  if (manifest.preview === true || manifest.partial === true) return true;
  if (hasText(manifest.buildKind) && ["preview", "partial", "test"].includes(manifest.buildKind)) return true;
  return hasText(manifest.artifactType) && PREVIEW_ARTIFACT_TYPES.has(manifest.artifactType);
}

function schemaVersionCheck(manifest: Record<string, unknown>, key: keyof typeof MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS, label: string): KvManifestPreflightCheck {
  const expected = MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS[key];
  const declared = manifest[key];
  const matches = declared === expected;
  return {
    key,
    label,
    status: matches ? "pass" : "fail",
    detail: matches
      ? `${label} is ${expected}.`
      : hasText(declared)
        ? `${label} is ${declared}; production activation requires ${expected}.`
        : `${label} is missing; production activation requires ${expected}.`,
  };
}

export function buildKvManifestActivationPreflight(build: KvBuildActivationCandidate): KvManifestActivationPreflight {
  const manifest = isRecord(build.manifest) ? build.manifest : null;
  const checks: KvManifestPreflightCheck[] = [];
  const isCompiled = build.status === "compiled";
  const isActive = build.status === "active";

  checks.push({
    key: "status",
    label: "Compiled status",
    status: isCompiled || isActive ? "pass" : "fail",
    detail: isCompiled
      ? "Manifest is compiled and ready for activation."
      : isActive
        ? "Manifest is the active serving artifact."
        : "Only compiled manifests can become active.",
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
    const isProductionArtifact = manifest.artifactType === "rocksdb";
    checks.push({
      key: "artifactType",
      label: "Artifact type",
      status: isProductionArtifact ? "pass" : "fail",
      detail: hasText(manifest.artifactType)
        ? isProductionArtifact
          ? "Artifact type is rocksdb."
          : `Artifact type ${manifest.artifactType} cannot be activated as the production serving artifact.`
        : "Manifest must declare artifactType rocksdb for production activation.",
    });

    checks.push({
      key: "notPreviewBuild",
      label: "Production build kind",
      status: isPreviewOrPartialArtifact(manifest) ? "fail" : "pass",
      detail: isPreviewOrPartialArtifact(manifest)
        ? "Preview, partial, or test artifacts must never be activated as the production serving artifact."
        : "Artifact is a full production build.",
    });

    checks.push(schemaVersionCheck(manifest, "dictionarySchemaVersion", "Dictionary schema version"));
    checks.push(schemaVersionCheck(manifest, "keySchemaVersion", "Key schema version"));
    checks.push(schemaVersionCheck(manifest, "valueSchemaVersion", "Value schema version"));
    checks.push(schemaVersionCheck(manifest, "timelineSchemaVersion", "Timeline schema version"));
    checks.push(schemaVersionCheck(manifest, "metricSchemaVersion", "Metric schema version"));

    const manifestDictionaryVersion = hasText(manifest.dictionaryVersion) ? manifest.dictionaryVersion : null;
    checks.push({
      key: "dictionaryVersionMatch",
      label: "Dictionary version agreement",
      status: manifestDictionaryVersion !== null && manifestDictionaryVersion === build.dictionaryVersion ? "pass" : "fail",
      detail:
        manifestDictionaryVersion === null
          ? "Manifest must declare the dictionary version of the compiled snapshot."
          : manifestDictionaryVersion === build.dictionaryVersion
            ? "Manifest dictionary version matches the compiled snapshot."
            : `Manifest dictionary version ${manifestDictionaryVersion} does not match build dictionary version ${build.dictionaryVersion ?? "unset"}.`,
    });

    checks.push({
      key: "registrySnapshotHash",
      label: "Registry snapshot hash",
      status: hasText(manifest.registrySnapshotHash) ? "pass" : "fail",
      detail: hasText(manifest.registrySnapshotHash)
        ? "Manifest declares the registry snapshot hash."
        : "Manifest must declare the deterministic registry snapshot hash used for compilation.",
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

    // Each required index validates on its own: presence, its own rowCount, its
    // own content hash, and its own expected count. Unrelated index
    // cardinalities are never summed against a single top-level row count.
    const indexes = isRecord(manifest.indexes) ? manifest.indexes : null;
    const expectedCounts = isRecord(manifest.expectedCounts) ? manifest.expectedCounts : null;
    checks.push({
      key: "expectedCounts",
      label: "Expected index counts",
      status: expectedCounts && REQUIRED_KV_INDEXES.every(required => numberFromManifest(expectedCounts, required.key) !== null) ? "pass" : "fail",
      detail: expectedCounts && REQUIRED_KV_INDEXES.every(required => numberFromManifest(expectedCounts, required.key) !== null)
        ? "All required expectedCounts fields are present."
        : "Manifest must explicitly declare a non-negative expected count for every production index.",
    });
    checks.push({
      key: "indexesDeclared",
      label: "Serving indexes declared",
      status: indexes ? "pass" : "fail",
      detail: indexes
        ? "Manifest declares its serving indexes."
        : "Manifest is missing the indexes object; production activation requires every required serving index.",
    });

    if (indexes) {
      for (const required of REQUIRED_KV_INDEXES) {
        const indexManifest = findIndexManifest(indexes, required.key, required.indexName);
        const rowCount = indexManifest ? numberFromManifest(indexManifest, "rowCount") : null;
        const indexHash = indexManifest
          ? hasText(indexManifest.hash)
            ? indexManifest.hash
            : hasText(indexManifest.manifestHash)
              ? indexManifest.manifestHash
              : null
          : null;
        const expectedCount = expectedCounts ? numberFromManifest(expectedCounts, required.key) : null;

        const problems: string[] = [];
        if (!indexManifest) problems.push("index missing");
        if (indexManifest && rowCount === null) problems.push("rowCount missing");
        if (indexManifest && indexHash === null) problems.push("content hash missing");
        if (expectedCount === null) problems.push(`expectedCounts.${required.key} missing`);
        if (indexManifest && rowCount !== null && expectedCount !== null && rowCount !== expectedCount) {
          problems.push(`rowCount ${rowCount} does not match expectedCounts.${required.key} ${expectedCount}`);
        }

        checks.push({
          key: `index:${required.key}`,
          label: `${required.label} index`,
          status: problems.length ? "fail" : "pass",
          detail: problems.length
            ? `${required.indexName}: ${problems.join("; ")}.`
            : `${required.indexName} present with rowCount ${rowCount}${expectedCount !== null ? ` matching expected ${expectedCount}` : ""} and content hash.`,
        });
      }
    }

    const validation = isRecord(manifest.validation) ? manifest.validation : null;
    checks.push({
      key: "threeWayValidation",
      label: "Three-way parity validation",
      status: validation?.status === "passed" && positiveInteger(validation.validationRunId) !== null && hasText(validation.reportHash) ? "pass" : "fail",
      detail: validation?.status === "passed"
        ? "Canonical, PostgreSQL-compiled, and RocksDB parity validation passed."
        : "Activation requires a persisted passing three-way parity validation run.",
    });

    if (manifest.filterSupport === true) {
      const filters = isRecord(manifest.filters) ? manifest.filters : null;
      checks.push({
        key: "filterManifests",
        label: "Filter manifests",
        status: filters && Object.keys(filters).length ? "pass" : "fail",
        detail: filters && Object.keys(filters).length
          ? "Filter manifests are declared for the filter-enabled artifact."
          : "Filter support is enabled but the manifest declares no filter manifests.",
      });
    }
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
  return { canActivate: isCompiled && blockers.length === 0, checks, blockers };
}
