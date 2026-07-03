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

export type ReviewGroupFilters = {
  q?: string;
  chain?: string;
  entity?: string;
  role?: string;
  minConfidence?: number;
  minCount?: number;
  minEvidence?: number;
  sort: "count" | "confidence" | "evidence" | "entity";
  page: number;
  pageSize: number;
};

export type ReviewReadinessInput = {
  chainCode?: string | null;
  normalizedAddress?: string | null;
  suggestedEntityId?: number | null;
  suggestedRoleId?: number | null;
  evidenceCount?: number | null;
};

export type ReviewReadinessBlocker =
  | "missing_chain"
  | "missing_normalized_address"
  | "missing_entity"
  | "missing_role"
  | "missing_evidence";

export const REVIEW_READINESS_BLOCKER_LABELS: Record<ReviewReadinessBlocker, string> = {
  missing_chain: "Missing chain",
  missing_normalized_address: "Missing normalized address",
  missing_entity: "Missing entity",
  missing_role: "Missing role",
  missing_evidence: "Missing attached evidence",
};

const EDITED_APPROVAL_HARD_BLOCKERS = new Set<ReviewReadinessBlocker>([
  "missing_chain",
  "missing_normalized_address",
  "missing_evidence",
]);

export function buildReviewReadiness(candidate: ReviewReadinessInput) {
  const blockers: ReviewReadinessBlocker[] = [];

  if (!candidate.chainCode) blockers.push("missing_chain");
  if (!candidate.normalizedAddress) blockers.push("missing_normalized_address");
  if (!candidate.suggestedEntityId) blockers.push("missing_entity");
  if (!candidate.suggestedRoleId) blockers.push("missing_role");
  if ((candidate.evidenceCount ?? 0) < 1) blockers.push("missing_evidence");

  return {
    canQuickApprove: blockers.length === 0,
    blockers,
  };
}

export function buildEditedApprovalReadiness(blockers: ReviewReadinessBlocker[]) {
  const hardBlockers = blockers.filter((blocker) => EDITED_APPROVAL_HARD_BLOCKERS.has(blocker));
  const editableBlockers = blockers.filter((blocker) => !EDITED_APPROVAL_HARD_BLOCKERS.has(blocker));

  return {
    canApproveWithEdits: hardBlockers.length === 0,
    hardBlockers,
    editableBlockers,
  };
}

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

function contains(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase());
}

function compareReviewGroups(sort: ReviewGroupFilters["sort"]) {
  return (left: ReviewCandidateGroup, right: ReviewCandidateGroup) => {
    if (sort === "confidence") {
      return right.averageConfidence - left.averageConfidence || right.count - left.count || left.key.localeCompare(right.key);
    }
    if (sort === "evidence") {
      return right.evidenceCount - left.evidenceCount || right.count - left.count || left.key.localeCompare(right.key);
    }
    if (sort === "entity") {
      return left.entity.localeCompare(right.entity) || left.chain.localeCompare(right.chain) || left.role.localeCompare(right.role);
    }
    return right.count - left.count || right.averageConfidence - left.averageConfidence || left.key.localeCompare(right.key);
  };
}

export function filterReviewCandidateGroups(groups: ReviewCandidateGroup[], filters: ReviewGroupFilters) {
  return groups
    .filter((group) => {
      if (filters.q) {
        const haystack = [group.key, group.slug, group.candidateIds.join(",")].join(" ");
        if (!contains(haystack, filters.q)) return false;
      }
      if (filters.chain && !contains(group.chain, filters.chain)) return false;
      if (filters.entity && !contains(group.entity, filters.entity)) return false;
      if (filters.role && !contains(group.role, filters.role)) return false;
      if (typeof filters.minConfidence === "number" && group.averageConfidence < filters.minConfidence) return false;
      if (typeof filters.minCount === "number" && group.count < filters.minCount) return false;
      if (typeof filters.minEvidence === "number" && group.evidenceCount < filters.minEvidence) return false;
      return true;
    })
    .sort(compareReviewGroups(filters.sort));
}

export function paginateReviewCandidateGroups(groups: ReviewCandidateGroup[], filters: ReviewGroupFilters) {
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = groups.slice(offset, offset + filters.pageSize);

  return {
    rows,
    total: groups.length,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(groups.length / filters.pageSize)),
  };
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

export type CandidateReviewAuditInput = {
  candidateId: number;
  action: string;
  beforeStatus?: string | null;
  afterStatus: string;
  reason?: string | null;
  approvalDraft?: Record<string, unknown> | null;
};

export function buildCandidateReviewAuditPayload(input: CandidateReviewAuditInput) {
  return {
    candidateId: input.candidateId,
    action: input.action,
    beforeStatus: input.beforeStatus ?? null,
    afterStatus: input.afterStatus,
    reason: input.reason ?? null,
    approvalDraft: input.approvalDraft ?? null,
  };
}
