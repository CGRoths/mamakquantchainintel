import { describe, expect, it } from "vitest";

import {
  buildCandidateSourceVerificationContext,
  buildCandidateTraceWarnings,
  extractCandidateSourceSheetNames,
  isCandidateSourceVerificationSatisfied,
} from "@/lib/mqchain/candidate-detail";

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

  it("extracts source sheet names from nested candidate provenance", () => {
    expect(
      extractCandidateSourceSheetNames({
        rawReference: {
          source_evidence: {
            sheet_profiles: [
              { sheet_name: "Ethereum" },
              { sourceSheet: "BTC" },
              { tab: "Ethereum" },
            ],
          },
        },
      }),
    ).toEqual(["BTC", "Ethereum"]);
  });

  it("does not let source-job verification satisfy sheet-scoped candidates", () => {
    const context = buildCandidateSourceVerificationContext({
      candidate: {
        id: 31,
        sourceJobId: 12,
        sourceDocumentId: 13,
        metadata: {
          rawReference: {
            source_evidence: {
              sheet_profiles: [{ sheet_name: "Ethereum" }],
            },
          },
        },
      },
      verifications: [
        {
          id: 1,
          sourceJobId: 12,
          sourceDocumentId: null,
          candidateId: null,
          verificationScope: "source_job",
          sourceTrust: "official",
          status: "verified",
          createdAt: new Date("2026-07-04T01:00:00.000Z"),
        },
      ],
    });

    expect(context).toMatchObject({
      sheetNames: ["Ethereum"],
      sheetVerificationRequired: true,
      hasVerifiedSourceJob: true,
      hasVerifiedSourceSheet: false,
      status: "source_sheet_verification_missing",
      message: "This candidate carries sheet-level provenance; source_job verification alone does not satisfy that scope.",
    });
  });

  it("marks matching sheet and candidate-specific source verifications", () => {
    const sheetContext = buildCandidateSourceVerificationContext({
      candidate: {
        id: 31,
        sourceJobId: 12,
        sourceDocumentId: 13,
        metadata: { sourceSheet: "Ethereum" },
      },
      verifications: [
        {
          id: 2,
          sourceJobId: 12,
          sourceDocumentId: null,
          candidateId: null,
          verificationScope: "source_sheet",
          sourceSheet: "Ethereum",
          sourceTrust: "official",
          status: "verified",
          createdAt: new Date("2026-07-04T01:00:00.000Z"),
        },
      ],
    });

    expect(sheetContext).toMatchObject({
      status: "source_sheet_verified",
      hasVerifiedSourceSheet: true,
      matchingVerifiedCount: 1,
    });

    const candidateContext = buildCandidateSourceVerificationContext({
      candidate: {
        id: 31,
        sourceJobId: 12,
        sourceDocumentId: 13,
        metadata: { sourceSheet: "Ethereum" },
      },
      verifications: [
        {
          id: 3,
          sourceJobId: 12,
          sourceDocumentId: null,
          candidateId: 31,
          verificationScope: "source_job",
          sourceTrust: "official",
          status: "verified",
          createdAt: new Date("2026-07-04T01:00:00.000Z"),
        },
      ],
    });

    expect(candidateContext).toMatchObject({
      status: "candidate_verified",
      hasVerifiedCandidate: true,
      matchingVerifiedCount: 1,
    });
  });

  it("classifies source verification statuses for approval readiness", () => {
    expect(isCandidateSourceVerificationSatisfied("candidate_verified")).toBe(true);
    expect(isCandidateSourceVerificationSatisfied("source_sheet_verified")).toBe(true);
    expect(isCandidateSourceVerificationSatisfied("source_verification_missing")).toBe(false);
    expect(isCandidateSourceVerificationSatisfied("source_sheet_verification_missing")).toBe(false);
    expect(isCandidateSourceVerificationSatisfied(null)).toBe(false);
  });
});
