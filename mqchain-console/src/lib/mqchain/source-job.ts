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

export type SourceJobScopeInput = {
  chainCode?: string | null;
  roleHint?: string | null;
  suggestedRoleCode?: string | null;
};

export type SourceJobOperationalSummaryInput = {
  status?: string | null;
  archiveStorageUri?: string | null;
  chainScope?: string[] | null;
  expectedRoles?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

export type SourceJobDownstreamBatchInput = {
  status: string;
};

export type SourceJobDownstreamRegistryInput = {
  isActive: boolean;
};

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toDistribution(map: Map<string, number>): DistributionRow[] {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function addCleanValue(values: Set<string>, value: string | null | undefined) {
  const clean = value?.trim();
  if (clean) {
    values.add(clean);
  }
}

function toCleanSortedStrings(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const values = new Set<string>();
  for (const item of value) {
    if (typeof item === "string") {
      addCleanValue(values, item);
    }
  }
  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

export function buildSourceJobScopeSummary(rows: SourceJobScopeInput[]) {
  const chainScope = new Set<string>();
  const expectedRoles = new Set<string>();

  for (const row of rows) {
    addCleanValue(chainScope, row.chainCode);
    addCleanValue(expectedRoles, row.suggestedRoleCode ?? row.roleHint);
  }

  return {
    chainScope: Array.from(chainScope).sort((left, right) => left.localeCompare(right)),
    expectedRoles: Array.from(expectedRoles).sort((left, right) => left.localeCompare(right)),
  };
}

export function buildSourceJobOperationalSummary(input: SourceJobOperationalSummaryInput) {
  const metadata = input.metadata ?? {};
  const chainScope = toCleanSortedStrings(input.chainScope?.length ? input.chainScope : metadata.chainScope);
  const expectedRoles = toCleanSortedStrings(input.expectedRoles?.length ? input.expectedRoles : metadata.expectedRoles);
  const archiveStorageUri = cleanString(input.archiveStorageUri) ?? cleanString(metadata.archiveStorageUri);

  return {
    chainScope,
    expectedRoles,
    archived: input.status === "archived",
    archiveStorageUri,
    archivedAt: cleanString(metadata.archivedAt),
    archivedBy: cleanString(metadata.archivedBy),
    archiveReason: cleanString(metadata.archiveReason),
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

export function buildSourceJobDownstreamRollup(
  batches: SourceJobDownstreamBatchInput[],
  registryRows: SourceJobDownstreamRegistryInput[],
) {
  const batchStatusCounts = new Map<string, number>();
  let activeRegistryRows = 0;

  for (const batch of batches) {
    increment(batchStatusCounts, batch.status);
  }

  for (const row of registryRows) {
    if (row.isActive) {
      activeRegistryRows += 1;
    }
  }

  return {
    totalBatches: batches.length,
    committedBatches: batchStatusCounts.get("committed") ?? 0,
    totalRegistryRows: registryRows.length,
    activeRegistryRows,
    inactiveRegistryRows: registryRows.length - activeRegistryRows,
    batchStatusDistribution: toDistribution(batchStatusCounts),
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
