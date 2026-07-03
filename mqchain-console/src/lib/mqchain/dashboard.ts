import { confidenceBucket, type DistributionRow } from "./batch-detail";
import { buildKvManifestActivationPreflight, summarizeKvManifestIndexes, type KvBuildActivationCandidate } from "./kv-manifest";

export type DashboardCountRow = {
  label: string | null;
  count: number;
};

export type ConfidenceInput = {
  confidenceScore: number;
};

export type DashboardLatestKvBuildInput = KvBuildActivationCandidate & {
  id: number;
  createdAt: Date;
  activatedAt: Date | null;
};

export type DashboardLatestKvBuildSummary = {
  exists: boolean;
  servingStatus: "missing" | "active" | "ready" | "blocked" | "pending";
  canServe: boolean;
  canActivate: boolean;
  requiredIndexesPresent: number;
  requiredIndexesTotal: number;
  servingIndexesDeclared: boolean;
  servingIndexesReady: boolean;
  blockerCount: number;
  blockers: string[];
};

export function normalizeDistributionRows(rows: DashboardCountRow[], fallbackLabel = "unknown") {
  return rows
    .map((row) => ({
      label: row.label || fallbackLabel,
      count: Number(row.count) || 0,
    }))
    .filter((row) => row.count > 0)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function buildConfidenceDistribution(rows: ConfidenceInput[]): DistributionRow[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const bucket = confidenceBucket(row.confidenceScore);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function buildDashboardLatestKvBuildSummary(build: DashboardLatestKvBuildInput | null): DashboardLatestKvBuildSummary {
  if (!build) {
    return {
      exists: false,
      servingStatus: "missing",
      canServe: false,
      canActivate: false,
      requiredIndexesPresent: 0,
      requiredIndexesTotal: 0,
      servingIndexesDeclared: false,
      servingIndexesReady: false,
      blockerCount: 0,
      blockers: [],
    };
  }

  const preflight = buildKvManifestActivationPreflight(build);
  const indexSummary = summarizeKvManifestIndexes(build.manifest);
  const requiredIndexesPresent = indexSummary.rows.filter((row) => row.present).length;
  const servingIndexesReady =
    indexSummary.hasIndexes && indexSummary.missingRequired.length === 0 && indexSummary.rowCountMissing.length === 0;
  const servingStatus =
    build.status === "active"
      ? "active"
      : preflight.canActivate
        ? "ready"
        : build.status === "pending"
          ? "pending"
          : "blocked";

  return {
    exists: true,
    servingStatus,
    canServe: build.status === "active",
    canActivate: preflight.canActivate,
    requiredIndexesPresent,
    requiredIndexesTotal: indexSummary.rows.length,
    servingIndexesDeclared: indexSummary.hasIndexes,
    servingIndexesReady,
    blockerCount: preflight.blockers.length,
    blockers: preflight.blockers.slice(0, 3),
  };
}
