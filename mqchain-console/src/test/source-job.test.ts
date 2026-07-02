import { describe, expect, it } from "vitest";

import { buildSourceJobArchiveMetadata, buildSourceJobCandidateRollup, buildSourceJobEvidenceRollup } from "@/lib/mqchain/source-job";

describe("source job rollups", () => {
  it("summarizes candidate status, chain, confidence, and evidence counts", () => {
    const rollup = buildSourceJobCandidateRollup([
      { candidateStatus: "pending_review", chainCode: "btc", confidenceScore: 90, evidenceCount: 2 },
      { candidateStatus: "duplicate", chainCode: "btc", confidenceScore: 55, evidenceCount: 1 },
      { candidateStatus: "approved", chainCode: "ethereum", confidenceScore: 72, evidenceCount: 3 },
    ]);

    expect(rollup).toMatchObject({
      totalCandidates: 3,
      evidenceCount: 6,
      approvedCount: 1,
      pendingCount: 1,
      duplicateCount: 1,
      conflictCount: 0,
    });
    expect(rollup.chainDistribution).toEqual([
      { label: "btc", count: 2 },
      { label: "ethereum", count: 1 },
    ]);
  });

  it("summarizes evidence type and trust distributions", () => {
    expect(
      buildSourceJobEvidenceRollup([
        { evidenceType: "official_csv", trustTier: "official" },
        { evidenceType: "official_csv", trustTier: "official" },
        { evidenceType: "manual_note", trustTier: "weak" },
      ]),
    ).toEqual({
      totalEvidence: 3,
      typeDistribution: [
        { label: "official_csv", count: 2 },
        { label: "manual_note", count: 1 },
      ],
      trustDistribution: [
        { label: "official", count: 2 },
        { label: "weak", count: 1 },
      ],
    });
  });

  it("builds archive metadata without dropping existing import summary", () => {
    const metadata = buildSourceJobArchiveMetadata(
      {
        totalRows: 3,
        candidatesCreated: 2,
      },
      {
        archiveStorageUri: "s3://mqchain/sources/job-7",
        reason: "Source reviewed.",
        actorEmail: "owner@mamakquant.local",
      },
    );

    expect(metadata).toMatchObject({
      totalRows: 3,
      candidatesCreated: 2,
      archiveStorageUri: "s3://mqchain/sources/job-7",
      archiveReason: "Source reviewed.",
      archivedBy: "owner@mamakquant.local",
    });
    expect(typeof metadata.archivedAt).toBe("string");
  });
});
