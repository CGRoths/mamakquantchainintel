import { describe, expect, it } from "vitest";

import { buildResolverLookupSummary, summarizeResolverEvidence } from "@/lib/mqchain/resolver-detail";

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

  it("summarizes current resolver lookup state", () => {
    expect(
      buildResolverLookupSummary({
        isValid: true,
        hasLabel: true,
        labelStatus: "active",
        labelRegistryId: 7,
        currentRegistryId: 7,
      }),
    ).toEqual({
      mode: "current",
      outcome: "active_label",
      timelineDiverged: false,
      metricGroupOutcome: "not_requested",
    });
  });

  it("flags point-in-time timeline divergence and metric membership state", () => {
    expect(
      buildResolverLookupSummary({
        isValid: true,
        hasLabel: true,
        blockNumber: 840000,
        labelStatus: "historical",
        labelRegistryId: 11,
        currentRegistryId: 12,
        metricGroupCode: "btc_cex_flow_boundary",
        metricGroupMatch: false,
      }),
    ).toEqual({
      mode: "point_in_time",
      outcome: "historical_label",
      timelineDiverged: true,
      metricGroupOutcome: "not_member",
    });
  });

  it("reports invalid address and no-label resolver outcomes", () => {
    expect(
      buildResolverLookupSummary({
        isValid: false,
        hasLabel: false,
        metricGroupCode: "btc_cex_flow_boundary",
        metricGroupMatch: null,
      }),
    ).toMatchObject({
      mode: "current",
      outcome: "invalid_address",
      metricGroupOutcome: "not_checked",
    });

    expect(
      buildResolverLookupSummary({
        isValid: true,
        hasLabel: false,
        blockNumber: 123,
      }),
    ).toMatchObject({
      mode: "point_in_time",
      outcome: "no_label",
      timelineDiverged: false,
    });
  });
});
