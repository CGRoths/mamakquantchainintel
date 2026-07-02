import { describe, expect, it } from "vitest";

import { summarizeResolverEvidence } from "@/lib/mqchain/resolver-detail";

describe("resolver detail helpers", () => {
  it("summarizes evidence by type, trust, and confidence delta", () => {
    expect(
      summarizeResolverEvidence([
        { evidenceType: "official_page", trustTier: "official", confidenceDelta: 5 },
        { evidenceType: "manual_note", trustTier: "weak", confidenceDelta: -1 },
        { evidenceType: "official_page", trustTier: "official", confidenceDelta: 0 },
      ]),
    ).toEqual({
      count: 3,
      netConfidenceDelta: 4,
      byType: {
        manual_note: 1,
        official_page: 2,
      },
      byTrust: {
        official: 2,
        weak: 1,
      },
    });
  });
});
