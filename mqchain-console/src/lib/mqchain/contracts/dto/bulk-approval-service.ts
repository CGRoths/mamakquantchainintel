export type BulkApprovalMode = "strict" | "eligible_only";

export type BulkApprovalBlockedCandidate = {
    candidateId: number;
    blockers: string[];
};

export type BulkApprovalBlockerSummaryRow = {
    blocker: string;
    label: string;
    count: number;
};

export declare function previewBulkCandidateApproval(input: unknown): Promise<{
    selectionType: "explicit_ids" | "source_sheet" | "source_job";
    sourceJobId: number | null;
    sourceSheet: string | null;
    selectedCount: number;
    eligibleCount: number;
    blockedCount: number;
    candidateIds: number[];
    eligibleCandidateIds: number[];
    blockedCandidates: BulkApprovalBlockedCandidate[];
    blockerSummary: BulkApprovalBlockerSummaryRow[];
    sourceJobIds: number[];
    dictionaryVersion: string;
    candidateSnapshotHash: string;
    sourceVerificationSnapshotHash: string;
    previewHash: string;
    mode: BulkApprovalMode;
    blockerPage: number;
    blockerPageSize: number;
    blockerTotalPages: number;
}>;

export declare function executeBulkCandidateApproval(input: unknown): Promise<{
    bulkOperationId: string;
    selectionType: "explicit_ids" | "source_sheet" | "source_job";
    sourceJobId: number | null;
    sourceSheet: string | null;
    mode: BulkApprovalMode;
    selectedCount: number;
    eligibleCount: number;
    approvedCount: number;
    blockedCount: number;
    approvedCandidateIds: number[];
    blockedCandidates: BulkApprovalBlockedCandidate[];
    blockerSummary: BulkApprovalBlockerSummaryRow[];
    sourceJobIds: number[];
    dictionaryVersion: string;
    candidateSnapshotHash: string;
    sourceVerificationSnapshotHash: string;
    previewHash: string;
    reason: string;
    batchCreated: false;
    registryRowsCreated: 0;
    kvBuildsCreated: 0;
}>;
