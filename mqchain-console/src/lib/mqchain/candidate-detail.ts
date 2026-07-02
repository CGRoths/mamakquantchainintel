export type CandidateTraceWarningInput = {
  candidateStatus: string;
  duplicateOfCandidateId?: number | null;
  duplicateCandidateCount?: number;
  registryMatchCount?: number;
};

export type CandidateTraceWarning = {
  tone: "warning" | "info";
  message: string;
};

export function buildCandidateTraceWarnings(input: CandidateTraceWarningInput): CandidateTraceWarning[] {
  const warnings: CandidateTraceWarning[] = [];

  if (input.candidateStatus === "conflict_pending") {
    warnings.push({
      tone: "warning",
      message: "Marked conflict; inspect evidence and approval history before batch inclusion.",
    });
  }

  if (input.candidateStatus === "needs_more_evidence") {
    warnings.push({
      tone: "warning",
      message: "Needs more evidence before approval or batch creation.",
    });
  }

  if (input.candidateStatus === "duplicate") {
    warnings.push({
      tone: "warning",
      message: input.duplicateOfCandidateId
        ? `Duplicate of candidate ${input.duplicateOfCandidateId}; avoid approving both records.`
        : "Marked duplicate without a linked duplicate target.",
    });
  }

  if ((input.duplicateCandidateCount ?? 0) > 0) {
    warnings.push({
      tone: "info",
      message: `${input.duplicateCandidateCount} candidate(s) point to this record as their duplicate target.`,
    });
  }

  if ((input.registryMatchCount ?? 0) > 0) {
    warnings.push({
      tone: "info",
      message: `${input.registryMatchCount} registry label(s) already exist for this chain/address.`,
    });
  }

  return warnings;
}
