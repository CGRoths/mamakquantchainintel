import { describe, expect, it } from "vitest";

import { assertBatchCandidatesStillApproved, assertSelectedCandidatesApproved } from "@/lib/mqchain/batch-readiness";
import { createBatchSchema } from "@/lib/mqchain/validators/batch";

describe("batch candidate readiness", () => {
  it("deduplicates candidate IDs before batch creation", () => {
    expect(createBatchSchema.parse({ candidateIds: "1, 2 2 3" }).candidateIds).toEqual([1, 2, 3]);
  });

  it("rejects selected candidates that are missing or not approved", () => {
    expect(() =>
      assertSelectedCandidatesApproved(
        [1, 2, 3],
        [
          { id: 1, candidateStatus: "approved", evidenceCount: 1 },
          { id: 2, candidateStatus: "pending_review", evidenceCount: 1 },
        ],
      ),
    ).toThrow("missing candidate IDs: 3; not approved: 2 (pending_review)");
  });

  it("allows only fully approved selected candidates into a batch", () => {
    expect(() =>
      assertSelectedCandidatesApproved(
        [1, 2],
        [
          { id: 1, candidateStatus: "approved", evidenceCount: 1 },
          { id: 2, candidateStatus: "approved", evidenceCount: 2 },
        ],
      ),
    ).not.toThrow();
  });

  it("rejects approved selected candidates that have no evidence", () => {
    expect(() =>
      assertSelectedCandidatesApproved(
        [1, 2],
        [
          { id: 1, candidateStatus: "approved", evidenceCount: 1 },
          { id: 2, candidateStatus: "approved", evidenceCount: 0 },
        ],
      ),
    ).toThrow("missing evidence: 2 (0 evidence)");
  });

  it("blocks commit if a batched candidate left approved status", () => {
    expect(() =>
      assertBatchCandidatesStillApproved([
        { id: 10, candidateStatus: "approved", evidenceCount: 1 },
        { id: 11, candidateStatus: "rejected", evidenceCount: 1 },
      ]),
    ).toThrow("Batch candidate readiness changed");
  });

  it("blocks commit if a batched candidate lost evidence", () => {
    expect(() =>
      assertBatchCandidatesStillApproved([
        { id: 10, candidateStatus: "approved", evidenceCount: 1 },
        { id: 11, candidateStatus: "approved", evidenceCount: 0 },
      ]),
    ).toThrow("missing evidence: 11 (0 evidence)");
  });
});
