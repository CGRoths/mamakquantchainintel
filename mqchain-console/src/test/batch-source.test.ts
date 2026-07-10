import { describe, expect, it } from "vitest";

import { buildBatchSourceProvenance } from "@/lib/mqchain/batch-source";

describe("batch source provenance", () => {
  it("keeps the operator batch name separate from source type and URL", () => {
    expect(
      buildBatchSourceProvenance({
        requestedName: "Local E2E batch",
        fallbackName: "Candidate batch fallback",
        sourceJob: {
          sourceType: "manual_input",
          sourceName: "Local E2E intake",
          sourceUrl: "https://example.com/mqchain-local-e2e",
        },
      }),
    ).toEqual({
      sourceType: "manual_input",
      sourceName: "Local E2E batch",
      sourceUrl: "https://example.com/mqchain-local-e2e",
    });
  });

  it("uses explicit candidate-review provenance without a source job", () => {
    expect(
      buildBatchSourceProvenance({
        fallbackName: "Candidate batch fallback",
      }),
    ).toEqual({
      sourceType: "candidate_review",
      sourceName: "Candidate batch fallback",
      sourceUrl: null,
    });
  });
});
