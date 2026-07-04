import type { CandidateSourceVerificationContext } from "./candidate-detail";
import { serializeCandidateExportRow, type CandidateExportRowInput } from "./candidate-api";
import {
  buildEditedApprovalReadiness,
  buildReviewReadiness,
  REVIEW_READINESS_BLOCKER_LABELS,
  type ReviewCandidateGroup,
} from "./review";

export const REVIEW_WORKSPACE_API_CONTRACT = {
  apiVersion: "mqchain-review-workspace-api-v1",
  sourceOfTruth: "postgres_candidate_staging",
  servingBackend: "postgres",
  artifactType: "review_queue_workspace_export",
  mutationAllowed: false,
  candidateWriteAllowed: false,
  approvalWriteAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  evidencePayloadIncluded: false,
  candidatesAreApprovedTruth: false,
  batchCommitRequiredForRegistryTruth: true,
  postgresIsCanonicalTruth: true,
} as const;

export const REVIEW_GROUP_LIST_API_CONTRACT = {
  apiVersion: "mqchain-review-group-list-api-v1",
  sourceOfTruth: "postgres_candidate_staging",
  servingBackend: "postgres",
  artifactType: "review_group_queue_export",
  mutationAllowed: false,
  candidateWriteAllowed: false,
  approvalWriteAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  evidencePayloadIncluded: false,
  candidatesAreApprovedTruth: false,
  batchCommitRequiredForRegistryTruth: true,
  postgresIsCanonicalTruth: true,
} as const;

export const REVIEW_GROUP_DETAIL_API_CONTRACT = {
  apiVersion: "mqchain-review-group-detail-api-v1",
  sourceOfTruth: "postgres_candidate_staging",
  servingBackend: "postgres",
  artifactType: "review_group_detail_export",
  mutationAllowed: false,
  candidateWriteAllowed: false,
  approvalWriteAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  evidencePayloadIncluded: false,
  candidatesAreApprovedTruth: false,
  batchCommitRequiredForRegistryTruth: true,
  postgresIsCanonicalTruth: true,
} as const;

type ReviewQueueRowInput = CandidateExportRowInput & {
  latestEvidence: {
    id: number;
    evidenceType: string;
    sourceUrl: string | null;
    evidenceHash: string | null;
    trustTier: string;
    summary: string | null;
    createdAt: Date;
  } | null;
  sourceVerificationContext: CandidateSourceVerificationContext;
};

type ReviewPagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ReviewWorkspaceApiInput = {
  query: {
    page: number;
    approvedPage: number;
    pageSize: number;
    filters: Record<string, unknown>;
  };
  counts: {
    pending: number;
    needsMoreEvidence: number;
    conflicts: number;
    approvedReady: number;
  };
  pending: ReviewPagination;
  pendingRows: ReviewQueueRowInput[];
  approved: ReviewPagination;
  approvedRows: ReviewQueueRowInput[];
  groups: ReviewCandidateGroup[];
};

export type ReviewGroupListApiInput = {
  query: {
    page: number;
    pageSize: number;
    filters: Record<string, unknown>;
  };
  totalPendingCandidates: number;
  totalGroupsBeforeFilters: number;
  total: number;
  totalPages: number;
  rows: ReviewCandidateGroup[];
};

export type ReviewGroupDetailApiInput = {
  slug: string;
  group: ReviewCandidateGroup | null;
  rows: ReviewQueueRowInput[];
  approvedRows: ReviewQueueRowInput[];
  rollups: {
    statuses: Array<{ label: string; count: number }>;
    sources: Array<{ label: string; count: number }>;
    evidenceTypes: Array<{ label: string; count: number }>;
    trustTiers: Array<{ label: string; count: number }>;
  };
};

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function serializeLatestEvidence(evidence: ReviewQueueRowInput["latestEvidence"]) {
  return evidence
    ? {
        id: evidence.id,
        evidenceType: evidence.evidenceType,
        sourceUrl: evidence.sourceUrl,
        evidenceHash: evidence.evidenceHash,
        trustTier: evidence.trustTier,
        summary: evidence.summary,
        createdAt: isoDate(evidence.createdAt),
      }
    : null;
}

function serializeReviewReadiness(row: ReviewQueueRowInput) {
  const quickReadiness = buildReviewReadiness({
    chainCode: row.candidate.chainCode,
    normalizedAddress: row.candidate.normalizedAddress,
    suggestedEntityId: row.candidate.suggestedEntityId,
    suggestedRoleId: row.candidate.suggestedRoleId,
    evidenceCount: row.candidate.evidenceCount,
    sourceVerificationStatus: row.sourceVerificationContext.status,
  });
  const editedReadiness = buildEditedApprovalReadiness(quickReadiness.blockers);

  return {
    canQuickApprove: quickReadiness.canQuickApprove,
    canApproveWithEdits: editedReadiness.canApproveWithEdits,
    blockers: quickReadiness.blockers.map((blocker) => ({
      code: blocker,
      label: REVIEW_READINESS_BLOCKER_LABELS[blocker],
      hard: editedReadiness.hardBlockers.includes(blocker),
    })),
  };
}

function serializeReviewQueueRow(row: ReviewQueueRowInput) {
  const candidate = serializeCandidateExportRow({
    ...row,
    sourceVerificationContext: row.sourceVerificationContext,
  });

  return {
    ...candidate,
    latestEvidence: serializeLatestEvidence(row.latestEvidence),
    reviewReadiness: serializeReviewReadiness(row),
    hrefs: {
      candidatePage: `/mqchain/candidates/${row.candidate.id}`,
      candidateApi: `/api/mqchain/candidates/${row.candidate.id}`,
      sourceJob: row.candidate.sourceJobId ? `/mqchain/source-jobs/${row.candidate.sourceJobId}` : null,
    },
  };
}

function serializeReviewGroup(group: ReviewCandidateGroup) {
  return {
    ...group,
    hrefs: {
      detailPage: `/mqchain/review/groups/${group.slug}`,
      detailApi: `/api/mqchain/review/groups/${group.slug}`,
      pendingCandidates: `/mqchain/candidates?status=pending_review&entity=${encodeURIComponent(group.entity)}&chain=${encodeURIComponent(group.chain)}&role=${encodeURIComponent(group.role)}`,
    },
  };
}

function reviewPolicy() {
  return {
    reviewApiIsReadOnly: true,
    candidatesRemainStagedUntilApproval: true,
    approvalStillRequiresServerAction: true,
    sourceVerificationRequiredBeforeApproval: true,
    sourceSheetVerificationNotSatisfiedBySourceJobOnly: true,
    batchCommitRequiredBeforeRegistry: true,
    registryRowsNeverWrittenFromReviewExports: true,
    evidencePayloadsExcludedByDefault: true,
  };
}

export function buildReviewWorkspaceApiResponse(input: ReviewWorkspaceApiInput) {
  return {
    ...REVIEW_WORKSPACE_API_CONTRACT,
    query: input.query,
    counts: input.counts,
    pending: {
      ...input.pending,
      returnedRows: input.pendingRows.length,
      rows: input.pendingRows.map(serializeReviewQueueRow),
    },
    approvedForBatch: {
      ...input.approved,
      returnedRows: input.approvedRows.length,
      rows: input.approvedRows.map(serializeReviewQueueRow),
    },
    groups: input.groups.map(serializeReviewGroup),
    policy: reviewPolicy(),
  };
}

export function buildReviewGroupListApiResponse(input: ReviewGroupListApiInput) {
  return {
    ...REVIEW_GROUP_LIST_API_CONTRACT,
    query: input.query,
    pagination: {
      totalRows: input.total,
      page: input.query.page,
      pageSize: input.query.pageSize,
      totalPages: input.totalPages,
      returnedRows: input.rows.length,
    },
    totals: {
      pendingCandidates: input.totalPendingCandidates,
      groupsBeforeFilters: input.totalGroupsBeforeFilters,
      groupsAfterFilters: input.total,
    },
    rows: input.rows.map(serializeReviewGroup),
    policy: reviewPolicy(),
  };
}

export function buildReviewGroupDetailApiResponse(input: ReviewGroupDetailApiInput) {
  return {
    ...REVIEW_GROUP_DETAIL_API_CONTRACT,
    slug: input.slug,
    group: input.group ? serializeReviewGroup(input.group) : null,
    rollups: input.rollups,
    pending: {
      totalRows: input.rows.length,
      rows: input.rows.map(serializeReviewQueueRow),
    },
    approvedForBatch: {
      totalRows: input.approvedRows.length,
      rows: input.approvedRows.map(serializeReviewQueueRow),
    },
    policy: reviewPolicy(),
  };
}
