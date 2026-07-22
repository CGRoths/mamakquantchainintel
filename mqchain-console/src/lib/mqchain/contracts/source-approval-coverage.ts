export type SourceJobApprovalCoverageDto = Readonly<{
  sourceJobId: number;
  dictionaryVersion: string;
  candidateCount: number;
  eligibleCount: number;
  blockedCount: number;
  sheets: readonly Readonly<{
    sourceSheet: string;
    candidateCount: number;
    verification: string;
    eligibleCount: number;
    blockedCount: number;
    candidateIds: readonly number[];
    eligibleCandidateIds: readonly number[];
    blockedCandidateIds: readonly number[];
    selectionAllowed: boolean;
  }>[];
}>;
