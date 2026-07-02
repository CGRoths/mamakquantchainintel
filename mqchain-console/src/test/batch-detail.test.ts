import { describe, expect, it } from "vitest";

import {
  batchLifecyclePermissions,
  buildBatchCandidateRollups,
  buildBatchEvidenceRollups,
  confidenceBucket,
} from "@/lib/mqchain/batch-detail";

describe("batch detail rollups", () => {
  it("buckets confidence scores", () => {
    expect(confidenceBucket(20)).toBe("0-39");
    expect(confidenceBucket(40)).toBe("40-69");
    expect(confidenceBucket(70)).toBe("70-84");
    expect(confidenceBucket(85)).toBe("85-100");
  });

  it("summarizes candidate status, quality, confidence, and block ranges", () => {
    const rollup = buildBatchCandidateRollups([
      { candidateStatus: "approved", confidenceScore: 92, qualityTier: 4, firstSeenBlock: 10, lastSeenBlock: 20 },
      { candidateStatus: "approved", confidenceScore: 72, qualityTier: 3, firstSeenBlock: 5, lastSeenBlock: 30 },
      { candidateStatus: "conflict_pending", confidenceScore: 35, qualityTier: 1 },
    ]);

    expect(rollup).toMatchObject({
      totalCandidates: 3,
      acceptedCount: 2,
      conflictCount: 1,
      averageConfidence: 66,
      firstSeenBlock: 5,
      lastSeenBlock: 30,
    });
    expect(rollup.confidenceDistribution).toEqual([
      { label: "0-39", count: 1 },
      { label: "70-84", count: 1 },
      { label: "85-100", count: 1 },
    ]);
  });

  it("summarizes evidence type, trust, and confidence deltas", () => {
    const rollup = buildBatchEvidenceRollups([
      { evidenceType: "official_csv", trustTier: "official", confidenceDelta: 5 },
      { evidenceType: "manual_note", trustTier: "weak", confidenceDelta: -1 },
      { evidenceType: "official_csv", trustTier: "official" },
    ]);

    expect(rollup).toEqual({
      totalEvidence: 3,
      netConfidenceDelta: 4,
      evidenceTypeDistribution: [
        { label: "manual_note", count: 1 },
        { label: "official_csv", count: 2 },
      ],
      trustDistribution: [
        { label: "official", count: 2 },
        { label: "weak", count: 1 },
      ],
    });
  });

  it("keeps batch lifecycle actions constrained by status", () => {
    expect(batchLifecyclePermissions("pending_approval")).toEqual({
      canApprove: true,
      canCommit: true,
      canFail: true,
      canSupersede: true,
    });
    expect(batchLifecyclePermissions("committed")).toEqual({
      canApprove: false,
      canCommit: false,
      canFail: false,
      canSupersede: true,
    });
    expect(batchLifecyclePermissions("failed")).toMatchObject({
      canCommit: false,
      canFail: false,
      canSupersede: false,
    });
  });
});
