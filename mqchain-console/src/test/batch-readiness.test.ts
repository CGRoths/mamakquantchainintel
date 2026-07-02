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
          { id: 1, candidateStatus: "approved" },
          { id: 2, candidateStatus: "pending_review" },
        ],
      ),
    ).toThrow("missing candidate IDs: 3; not approved: 2 (pending_review)");
  });

  it("allows only fully approved selected candidates into a batch", () => {
    expect(() =>
      assertSelectedCandidatesApproved(
        [1, 2],
        [
          { id: 1, candidateStatus: "approved" },
          { id: 2, candidateStatus: "approved" },
        ],
      ),
    ).not.toThrow();
  });

  it("blocks commit if a batched candidate left approved status", () => {
    expect(() =>
      assertBatchCandidatesStillApproved([
        { id: 10, candidateStatus: "approved" },
        { id: 11, candidateStatus: "rejected" },
      ]),
    ).toThrow("Batch candidate readiness changed");
  });
});
