import { describe, expect, it } from "vitest";

import { buildCandidateTraceWarnings } from "@/lib/mqchain/candidate-detail";

describe("candidate detail trace warnings", () => {
  it("flags duplicate targets and registry matches", () => {
    const warnings = buildCandidateTraceWarnings({
      candidateStatus: "duplicate",
      duplicateOfCandidateId: 42,
      registryMatchCount: 2,
    });

    expect(warnings.map((warning) => warning.message)).toEqual([
      "Duplicate of candidate 42; avoid approving both records.",
      "2 registry label(s) already exist for this chain/address.",
    ]);
  });

  it("flags conflict and reverse duplicate relationships", () => {
    const warnings = buildCandidateTraceWarnings({
      candidateStatus: "conflict_pending",
      duplicateCandidateCount: 3,
    });

    expect(warnings).toEqual([
      {
        tone: "warning",
        message: "Marked conflict; inspect evidence and approval history before batch inclusion.",
      },
      {
        tone: "info",
        message: "3 candidate(s) point to this record as their duplicate target.",
      },
    ]);
  });
});
