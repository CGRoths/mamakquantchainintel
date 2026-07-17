import type * as CandidateContract from "./candidate-service";
type CandidateListRow = Awaited<ReturnType<typeof CandidateContract.listCandidatesFromDatabase>>["rows"][number];
type CandidateDetail = NonNullable<Awaited<ReturnType<typeof CandidateContract.getCandidateDetail>>>;
type CandidateEvidenceRow = CandidateDetail["evidence"][number];
type ReviewQueueRow = CandidateListRow & { latestEvidence: CandidateEvidenceRow | null; sourceVerificationContext: NonNullable<CandidateListRow["sourceVerificationContext"]> };
export declare function getReviewWorkspace(input?: unknown): Promise<{
    counts: {
        pending: number;
        needsMoreEvidence: number;
        conflicts: number;
        approvedReady: number;
    };
    filters: {
        sort: "created_at" | "evidence_count" | "confidence";
        page: number;
        approvedPage: number;
        pageSize: number;
        q?: string | undefined;
        chain?: string | undefined;
        entity?: string | undefined;
        protocol?: string | undefined;
        role?: string | undefined;
        sourceType?: string | undefined;
        discoveryType?: string | undefined;
        minConfidence?: number | undefined;
        maxConfidence?: number | undefined;
        qualityTier?: number | undefined;
    };
    pendingRows: ReviewQueueRow[];
    pending: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
    approvedRows: ReviewQueueRow[];
    approved: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
    groups: {
        key: string;
        slug: string;
        entity: string;
        chain: string;
        role: string;
        count: number;
        candidateIds: number[];
        averageConfidence: number;
        evidenceCount: number;
    }[];
}>;
export declare function getReviewGroupsWorkspace(input?: unknown): Promise<{
    rows: ReviewQueueRow[];
    allGroups: {
        key: string;
        slug: string;
        entity: string;
        chain: string;
        role: string;
        count: number;
        candidateIds: number[];
        averageConfidence: number;
        evidenceCount: number;
    }[];
    groups: import("../../review").ReviewCandidateGroup[];
    filters: {
        sort: "entity" | "confidence" | "count" | "evidence";
        page: number;
        pageSize: number;
        q?: string | undefined;
        chain?: string | undefined;
        entity?: string | undefined;
        role?: string | undefined;
        sourceType?: string | undefined;
        discoveryType?: string | undefined;
        minConfidence?: number | undefined;
        minCount?: number | undefined;
        minEvidence?: number | undefined;
    };
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}>;
export declare function getReviewGroupDetail(slug: string): Promise<{
    group: {
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
    rows: ReviewQueueRow[];
    approvedRows: ReviewQueueRow[];
    rollups: {
        statuses: {
            label: string;
            count: number;
        }[];
        sources: {
            label: string;
            count: number;
        }[];
        evidenceTypes: {
            label: string;
            count: number;
        }[];
        trustTiers: {
            label: string;
            count: number;
        }[];
    };
}>;
export {};
