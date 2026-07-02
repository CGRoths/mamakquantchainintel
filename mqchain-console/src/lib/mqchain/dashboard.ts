import { confidenceBucket, type DistributionRow } from "./batch-detail";

export type DashboardCountRow = {
  label: string | null;
  count: number;
};

export type ConfidenceInput = {
  confidenceScore: number;
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
