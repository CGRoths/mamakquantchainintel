export type ReviewCandidateGroupInput = {
  candidate: {
    id: number;
    chainCode: string | null;
    entityHint: string | null;
    roleHint: string | null;
    confidenceScore: number;
    evidenceCount: number;
    candidateStatus?: string;
  };
  entityName: string | null;
  roleCode: string | null;
};

export type ReviewGroupRollupInput = ReviewCandidateGroupInput & {
  sourceType?: string | null;
  latestEvidence?: {
    evidenceType: string | null;
    trustTier: string | null;
  } | null;
};

export type ReviewCandidateGroup = {
  key: string;
  slug: string;
  entity: string;
  chain: string;
  role: string;
  count: number;
  candidateIds: number[];
  averageConfidence: number;
  evidenceCount: number;
};

function cleanPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

export function reviewGroupSlug(entity: string, chain: string, role: string) {
  return [entity, chain, role].map(cleanPart).join("__");
}

export function buildReviewCandidateGroups(rows: ReviewCandidateGroupInput[]) {
  const groups = new Map<string, ReviewCandidateGroup & { confidenceTotal: number }>();

  for (const row of rows) {
    const entity = row.entityName ?? row.candidate.entityHint ?? "unknown";
    const chain = row.candidate.chainCode ?? "unknown";
    const role = row.roleCode ?? row.candidate.roleHint ?? "unknown";
    const key = `${entity} / ${chain} / ${role}`;
    const current = groups.get(key) ?? {
      key,
      slug: reviewGroupSlug(entity, chain, role),
      entity,
      chain,
      role,
      count: 0,
      candidateIds: [],
      averageConfidence: 0,
      evidenceCount: 0,
      confidenceTotal: 0,
    };

    current.count += 1;
    current.candidateIds.push(row.candidate.id);
    current.evidenceCount += row.candidate.evidenceCount;
    current.confidenceTotal += row.candidate.confidenceScore;
    current.averageConfidence = Math.round(current.confidenceTotal / current.count);
    groups.set(key, current);
  }

  return Array.from(groups.values())
    .map((group) => ({
      key: group.key,
      slug: group.slug,
      entity: group.entity,
      chain: group.chain,
      role: group.role,
      count: group.count,
      candidateIds: group.candidateIds,
      averageConfidence: group.averageConfidence,
      evidenceCount: group.evidenceCount,
    }))
    .sort((left, right) => right.count - left.count || right.averageConfidence - left.averageConfidence || left.key.localeCompare(right.key));
}

export function filterRowsByReviewGroup<T extends ReviewCandidateGroupInput>(rows: T[], slug: string) {
  return rows.filter((row) => {
    const entity = row.entityName ?? row.candidate.entityHint ?? "unknown";
    const chain = row.candidate.chainCode ?? "unknown";
    const role = row.roleCode ?? row.candidate.roleHint ?? "unknown";
    return reviewGroupSlug(entity, chain, role) === slug;
  });
}

function increment(map: Map<string, number>, value: string | null | undefined) {
  const key = value || "unknown";
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toSortedEntries(map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function buildReviewGroupRollups(rows: ReviewGroupRollupInput[]) {
  const statusCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const evidenceTypeCounts = new Map<string, number>();
  const trustTierCounts = new Map<string, number>();

  for (const row of rows) {
    increment(statusCounts, row.candidate.candidateStatus);
    increment(sourceCounts, row.sourceType);
    increment(evidenceTypeCounts, row.latestEvidence?.evidenceType);
    increment(trustTierCounts, row.latestEvidence?.trustTier);
  }

  return {
    statuses: toSortedEntries(statusCounts),
    sources: toSortedEntries(sourceCounts),
    evidenceTypes: toSortedEntries(evidenceTypeCounts),
    trustTiers: toSortedEntries(trustTierCounts),
  };
}
