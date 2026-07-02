import { describe, expect, it } from "vitest";

import { buildConfidenceDistribution, normalizeDistributionRows } from "@/lib/mqchain/dashboard";

describe("dashboard rollups", () => {
  it("normalizes count rows with deterministic ordering", () => {
    expect(
      normalizeDistributionRows([
        { label: "manual_input", count: 2 },
        { label: null, count: 3 },
        { label: "csv_upload", count: 0 },
        { label: "official_url", count: 3 },
      ]),
    ).toEqual([
      { label: "official_url", count: 3 },
      { label: "unknown", count: 3 },
      { label: "manual_input", count: 2 },
    ]);
  });

  it("buckets registry confidence for dashboard distribution", () => {
    expect(
      buildConfidenceDistribution([
        { confidenceScore: 95 },
        { confidenceScore: 84 },
        { confidenceScore: 70 },
        { confidenceScore: 40 },
        { confidenceScore: 39 },
      ]),
    ).toEqual([
      { label: "0-39", count: 1 },
      { label: "40-69", count: 1 },
      { label: "70-84", count: 2 },
      { label: "85-100", count: 1 },
    ]);
  });
});
