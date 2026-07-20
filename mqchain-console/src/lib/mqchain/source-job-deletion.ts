export type SourceJobDeletionCounts = {
  sourceDocuments: number;
  candidates: number;
  approvedCandidates: number;
  evidence: number;
  verifications: number;
  batches: number;
  protectedBatches: number;
  registryRows: number;
  kvBuildReferences: number;
};

export type SourceJobDeletionPreview = {
  sourceJobId: number;
  sourceName: string | null;
  sourceStatus: string;
  deletable: boolean;
  blockers: string[];
  counts: SourceJobDeletionCounts;
};

export type SourceJobDeletionSafetyCounts = SourceJobDeletionCounts & {
  canonicalEvidence: number;
  canonicalApprovalEvents: number;
  externalCandidateReferences: number;
  supersedingBatches: number;
  externalEvidenceBatchLinks: number;
  externalApprovalBatchLinks: number;
  externalBatchEvidenceLinks: number;
};

export const DELETABLE_SOURCE_JOB_STATUSES = Object.freeze([
  "draft",
  "normalized",
  "extracted",
  "candidate_created",
  "failed",
]);

export const SOURCE_JOB_DELETION_ORDER = Object.freeze([
  "batchEvidence",
  "approvalEvents",
  "batchCandidates",
  "addressEvidence",
  "sourceVerifications",
  "labelBatches",
  "addressCandidates",
  "sourceDocuments",
  "sourceJob",
] as const);

export class SourceJobDeletionError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: "invalid_confirmation" | "source_job_not_found" | "source_job_deletion_blocked",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "SourceJobDeletionError";
  }
}

export function buildSourceJobDeletionPreview(input: {
  sourceJobId: number;
  sourceName: string | null;
  sourceStatus: string;
  counts: SourceJobDeletionSafetyCounts;
}): SourceJobDeletionPreview {
  const blockers: string[] = [];
  if (!DELETABLE_SOURCE_JOB_STATUSES.includes(input.sourceStatus)) blockers.push(`Source status ${input.sourceStatus} cannot be deleted.`);
  if (input.counts.approvedCandidates) blockers.push(`${input.counts.approvedCandidates} approved candidate(s) are linked to this source job.`);
  if (input.counts.protectedBatches) blockers.push(`${input.counts.protectedBatches} linked batch(es) are outside draft or failed status.`);
  if (input.counts.registryRows) blockers.push(`${input.counts.registryRows} canonical registry row(s) depend on this source job or its batches.`);
  if (input.counts.kvBuildReferences) blockers.push(`${input.counts.kvBuildReferences} KV build reference(s) depend on linked batches.`);
  if (input.counts.canonicalEvidence) blockers.push(`${input.counts.canonicalEvidence} evidence row(s) carry canonical registry dependencies.`);
  if (input.counts.canonicalApprovalEvents) blockers.push(`${input.counts.canonicalApprovalEvents} approval event(s) carry canonical registry dependencies.`);
  if (input.counts.externalCandidateReferences) blockers.push(`${input.counts.externalCandidateReferences} candidate(s) from another source job reference these candidates.`);
  if (input.counts.supersedingBatches) blockers.push(`${input.counts.supersedingBatches} external batch(es) supersede linked batches.`);
  if (input.counts.externalEvidenceBatchLinks) blockers.push(`${input.counts.externalEvidenceBatchLinks} evidence row(s) link these records to an external batch.`);
  if (input.counts.externalApprovalBatchLinks) blockers.push(`${input.counts.externalApprovalBatchLinks} approval event(s) link these records to an external batch.`);
  if (input.counts.externalBatchEvidenceLinks) blockers.push(`${input.counts.externalBatchEvidenceLinks} external batch evidence link(s) depend on source evidence.`);

  const counts: SourceJobDeletionCounts = {
    sourceDocuments: input.counts.sourceDocuments,
    candidates: input.counts.candidates,
    approvedCandidates: input.counts.approvedCandidates,
    evidence: input.counts.evidence,
    verifications: input.counts.verifications,
    batches: input.counts.batches,
    protectedBatches: input.counts.protectedBatches,
    registryRows: input.counts.registryRows,
    kvBuildReferences: input.counts.kvBuildReferences,
  };
  return {
    sourceJobId: input.sourceJobId,
    sourceName: input.sourceName,
    sourceStatus: input.sourceStatus,
    deletable: blockers.length === 0,
    blockers,
    counts,
  };
}
