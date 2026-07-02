import type { DistributionRow } from "./batch-detail";
import { buildSourceJobCandidateRollup, buildSourceJobEvidenceRollup, type SourceJobCandidateRollupInput, type SourceJobEvidenceRollupInput } from "./source-job";

export type DiscoveryCompletionSummary = {
  rows: number | null;
  candidates: number;
  evidence: number;
  invalid: number;
  duplicates: number;
};

export function parseDiscoveryCompletionLog(logs: string[]): DiscoveryCompletionSummary {
  const completed = [...logs].reverse().find((line) => line.startsWith("completed:"));
  const fallback = { rows: null, candidates: 0, evidence: 0, invalid: 0, duplicates: 0 };

  if (!completed) {
    return fallback;
  }

  const pairs = Array.from(completed.matchAll(/\b(rows|candidates|evidence|invalid|duplicates)=(\d+)/g));
  return pairs.reduce<DiscoveryCompletionSummary>(
    (summary, pair) => ({
      ...summary,
      [pair[1] === "rows" ? "rows" : pair[1]]: Number(pair[2]),
    }),
    fallback,
  );
}

export function distributionFromLogs(logs: string[]): DistributionRow[] {
  const counts = new Map<string, number>();

  for (const line of logs) {
    const key = line.includes(":") ? line.split(":")[0]?.trim() || "log" : line.split("=")[0]?.trim() || "log";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function buildDiscoveryJobDetailRollup(input: {
  logs: string[];
  candidates: SourceJobCandidateRollupInput[];
  evidence: SourceJobEvidenceRollupInput[];
}) {
  return {
    completion: parseDiscoveryCompletionLog(input.logs),
    candidateRollup: buildSourceJobCandidateRollup(input.candidates),
    evidenceRollup: buildSourceJobEvidenceRollup(input.evidence),
    logDistribution: distributionFromLogs(input.logs),
  };
}
