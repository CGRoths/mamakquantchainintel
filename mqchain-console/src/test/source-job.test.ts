import { describe, expect, it } from "vitest";

import {
  buildSourceJobArchiveMetadata,
  buildSourceJobCandidateRollup,
  buildSourceJobDownstreamRollup,
  buildSourceJobEvidenceRollup,
  buildSourceJobOperationalSummary,
  buildSourceJobScopeSummary,
} from "@/lib/mqchain/source-job";

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

  it("summarizes source job chain scope and expected roles from accepted candidates", () => {
    expect(
      buildSourceJobScopeSummary([
        { chainCode: "ethereum", roleHint: " contract_deployer " },
        { chainCode: "btc", roleHint: "cex_hot_wallet" },
        { chainCode: "ethereum", roleHint: "contract_deployer" },
        { chainCode: "polygon", roleHint: "raw_factory_label", suggestedRoleCode: "protocol_factory" },
        { chainCode: "", roleHint: " " },
      ]),
    ).toEqual({
      chainScope: ["btc", "ethereum", "polygon"],
      expectedRoles: ["cex_hot_wallet", "contract_deployer", "protocol_factory"],
    });
  });

  it("builds operational source scope from columns before metadata fallback", () => {
    expect(
      buildSourceJobOperationalSummary({
        status: "candidate_created",
        archiveStorageUri: "s3://column/archive",
        chainScope: ["ethereum", "btc", "ethereum", " "],
        expectedRoles: ["protocol_factory", "cex_hot_wallet"],
        metadata: {
          chainScope: ["stale"],
          expectedRoles: ["stale_role"],
          archiveStorageUri: "s3://metadata/archive",
        },
      }),
    ).toEqual({
      chainScope: ["btc", "ethereum"],
      expectedRoles: ["cex_hot_wallet", "protocol_factory"],
      archived: false,
      archiveStorageUri: "s3://column/archive",
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    });
  });

  it("falls back to archive and scope metadata for older source jobs", () => {
    expect(
      buildSourceJobOperationalSummary({
        status: "archived",
        metadata: {
          chainScope: ["polygon"],
          expectedRoles: ["treasury_wallet"],
          archiveStorageUri: "s3://metadata/archive",
          archivedAt: "2026-07-04T00:00:00.000Z",
          archivedBy: "owner@mamakquant.local",
          archiveReason: "Reviewed and archived.",
        },
      }),
    ).toEqual({
      chainScope: ["polygon"],
      expectedRoles: ["treasury_wallet"],
      archived: true,
      archiveStorageUri: "s3://metadata/archive",
      archivedAt: "2026-07-04T00:00:00.000Z",
      archivedBy: "owner@mamakquant.local",
      archiveReason: "Reviewed and archived.",
    });
  });

  it("summarizes downstream batch and registry handoff state", () => {
    const rollup = buildSourceJobDownstreamRollup(
      [{ status: "committed" }, { status: "pending_approval" }, { status: "committed" }],
      [{ isActive: true }, { isActive: false }, { isActive: true }],
    );

    expect(rollup).toEqual({
      totalBatches: 3,
      committedBatches: 2,
      totalRegistryRows: 3,
      activeRegistryRows: 2,
      inactiveRegistryRows: 1,
      batchStatusDistribution: [
        { label: "committed", count: 2 },
        { label: "pending_approval", count: 1 },
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
