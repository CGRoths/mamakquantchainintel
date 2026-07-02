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
