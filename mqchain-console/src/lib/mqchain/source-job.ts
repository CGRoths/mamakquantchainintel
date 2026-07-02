import { confidenceBucket, type DistributionRow } from "./batch-detail";

export type SourceJobCandidateRollupInput = {
  candidateStatus: string;
  chainCode?: string | null;
  confidenceScore: number;
  evidenceCount: number;
};

export type SourceJobEvidenceRollupInput = {
  evidenceType: string;
  trustTier?: string | null;
};

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toDistribution(map: Map<string, number>): DistributionRow[] {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function buildSourceJobCandidateRollup(candidates: SourceJobCandidateRollupInput[]) {
  const statusCounts = new Map<string, number>();
  const chainCounts = new Map<string, number>();
  const confidenceCounts = new Map<string, number>();
  let evidenceCount = 0;

  for (const candidate of candidates) {
    increment(statusCounts, candidate.candidateStatus);
    increment(chainCounts, candidate.chainCode || "unknown");
    increment(confidenceCounts, confidenceBucket(candidate.confidenceScore));
    evidenceCount += candidate.evidenceCount;
  }

  return {
    totalCandidates: candidates.length,
    evidenceCount,
    approvedCount: statusCounts.get("approved") ?? 0,
    pendingCount: statusCounts.get("pending_review") ?? 0,
    duplicateCount: statusCounts.get("duplicate") ?? 0,
    conflictCount: statusCounts.get("conflict_pending") ?? 0,
    statusDistribution: toDistribution(statusCounts),
    chainDistribution: toDistribution(chainCounts),
    confidenceDistribution: toDistribution(confidenceCounts),
  };
}

export function buildSourceJobEvidenceRollup(evidence: SourceJobEvidenceRollupInput[]) {
  const typeCounts = new Map<string, number>();
  const trustCounts = new Map<string, number>();

  for (const row of evidence) {
    increment(typeCounts, row.evidenceType);
    increment(trustCounts, row.trustTier || "unknown");
  }

  return {
    totalEvidence: evidence.length,
    typeDistribution: toDistribution(typeCounts),
    trustDistribution: toDistribution(trustCounts),
  };
}

export function buildSourceJobArchiveMetadata(
  metadata: Record<string, unknown> | null | undefined,
  input: { archiveStorageUri?: string | null; reason?: string | null; actorEmail?: string | null },
) {
  return {
    ...(metadata ?? {}),
    archivedAt: new Date().toISOString(),
    archivedBy: input.actorEmail ?? null,
    archiveReason: input.reason || "Source job archived by operator.",
    archiveStorageUri: input.archiveStorageUri || null,
  };
}
