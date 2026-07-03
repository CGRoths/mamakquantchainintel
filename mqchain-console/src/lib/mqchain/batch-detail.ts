import { FLAG_BITS, hasFlag } from "./flags";

export type BatchCandidateRollupInput = {
  candidateStatus: string;
  confidenceScore: number;
  qualityTier: number;
  firstSeenBlock?: number | null;
  lastSeenBlock?: number | null;
};

export type BatchEvidenceRollupInput = {
  evidenceType: string;
  trustTier?: string | null;
  confidenceDelta?: number | null;
};

export type BatchRegistryRollupInput = {
  isActive: boolean;
  flags: number;
};

export type DistributionRow = {
  label: string;
  count: number;
};

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function mapToDistribution(map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function confidenceBucket(score: number) {
  if (score >= 85) return "85-100";
  if (score >= 70) return "70-84";
  if (score >= 40) return "40-69";
  return "0-39";
}

export function buildBatchCandidateRollups(candidates: BatchCandidateRollupInput[]) {
  const statusCounts = new Map<string, number>();
  const qualityCounts = new Map<string, number>();
  const confidenceCounts = new Map<string, number>();
  const firstSeenBlocks = candidates
    .map((candidate) => candidate.firstSeenBlock)
    .filter((block): block is number => typeof block === "number");
  const lastSeenBlocks = candidates
    .map((candidate) => candidate.lastSeenBlock)
    .filter((block): block is number => typeof block === "number");

  for (const candidate of candidates) {
    increment(statusCounts, candidate.candidateStatus);
    increment(qualityCounts, String(candidate.qualityTier));
    increment(confidenceCounts, confidenceBucket(candidate.confidenceScore));
  }

  const averageConfidence = candidates.length
    ? Math.round(candidates.reduce((sum, candidate) => sum + candidate.confidenceScore, 0) / candidates.length)
    : 0;

  return {
    totalCandidates: candidates.length,
    acceptedCount: statusCounts.get("approved") ?? 0,
    rejectedCount: statusCounts.get("rejected") ?? 0,
    conflictCount: statusCounts.get("conflict_pending") ?? 0,
    duplicateCount: statusCounts.get("duplicate") ?? 0,
    averageConfidence,
    qualityDistribution: mapToDistribution(qualityCounts),
    confidenceDistribution: mapToDistribution(confidenceCounts),
    statusDistribution: mapToDistribution(statusCounts),
    firstSeenBlock: firstSeenBlocks.length ? Math.min(...firstSeenBlocks) : null,
    lastSeenBlock: lastSeenBlocks.length ? Math.max(...lastSeenBlocks) : null,
  };
}

export function buildBatchEvidenceRollups(evidence: BatchEvidenceRollupInput[]) {
  const typeCounts = new Map<string, number>();
  const trustCounts = new Map<string, number>();
  let netConfidenceDelta = 0;

  for (const item of evidence) {
    increment(typeCounts, item.evidenceType);
    increment(trustCounts, item.trustTier || "unknown");
    netConfidenceDelta += item.confidenceDelta ?? 0;
  }

  return {
    totalEvidence: evidence.length,
    netConfidenceDelta,
    evidenceTypeDistribution: mapToDistribution(typeCounts),
    trustDistribution: mapToDistribution(trustCounts),
  };
}

export function buildBatchRegistryRollup(registryRows: BatchRegistryRollupInput[]) {
  let activeRows = 0;
  let metricEligibleRows = 0;

  for (const row of registryRows) {
    if (row.isActive) {
      activeRows += 1;
    }
    if (hasFlag(row.flags, FLAG_BITS.metricEligible)) {
      metricEligibleRows += 1;
    }
  }

  return {
    totalRows: registryRows.length,
    activeRows,
    inactiveRows: registryRows.length - activeRows,
    metricEligibleRows,
  };
}

export function batchLifecyclePermissions(status: string) {
  return {
    canApprove: !["approved", "committed", "failed", "superseded"].includes(status),
    canCommit: ["pending_approval", "approved"].includes(status),
    canFail: !["committed", "failed", "superseded"].includes(status),
    canSupersede: !["failed", "superseded"].includes(status),
  };
}

export type BatchLifecycleAuditInput = {
  batchId: number;
  action: string;
  beforeStatus?: string | null;
  afterStatus: string;
  reason?: string | null;
  candidateIds?: number[];
  registryIds?: number[];
  dictionaryVersion?: string | null;
};

export function buildBatchLifecycleAuditPayload(input: BatchLifecycleAuditInput) {
  return {
    batchId: input.batchId,
    action: input.action,
    beforeStatus: input.beforeStatus ?? null,
    afterStatus: input.afterStatus,
    reason: input.reason ?? null,
    candidateIds: input.candidateIds ?? [],
    registryIds: input.registryIds ?? [],
    dictionaryVersion: input.dictionaryVersion ?? null,
  };
}

export type BatchKvHandoffAuditInput = {
  batchId: number;
  buildId: number;
  buildHash: string;
  dictionaryVersion: string;
  rowCount: number;
  registryIds: number[];
  manifest: Record<string, unknown>;
};

export function buildBatchKvHandoffAuditPayload(input: BatchKvHandoffAuditInput) {
  return {
    batchId: input.batchId,
    buildId: input.buildId,
    buildHash: input.buildHash,
    dictionaryVersion: input.dictionaryVersion,
    rowCount: input.rowCount,
    registryIds: input.registryIds,
    manifest: {
      reason: input.manifest.reason ?? null,
      artifactType: input.manifest.artifactType ?? null,
      artifactStatus: input.manifest.artifactStatus ?? null,
    },
  };
}
