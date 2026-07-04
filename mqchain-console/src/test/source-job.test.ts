import { describe, expect, it } from "vitest";

import {
  buildSourceJobArchiveMetadata,
  buildSourceJobCandidateRollup,
  buildSourceJobDocumentRollup,
  buildSourceJobDownstreamRollup,
  buildSourceJobEvidenceRollup,
  buildSourceJobIntakeAuditPayload,
  buildSourceJobOperationalSummary,
  buildSourceJobScopeSummary,
  buildSourceVerificationDecisionPayload,
  buildSourceJobVerificationRollup,
} from "@/lib/mqchain/source-job";
import { sourceVerificationSchema } from "@/lib/mqchain/validators/source-job";

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

  it("summarizes operator-driven source verification scope and trust", () => {
    expect(
      buildSourceJobVerificationRollup([
        { verificationScope: "source_job", sourceTrust: "official", status: "verified" },
        { verificationScope: "source_sheet", sourceTrust: "official", status: "verified" },
        { verificationScope: "source_url", sourceTrust: "conflict", status: "rejected" },
      ]),
    ).toEqual({
      totalVerifications: 3,
      verifiedCount: 2,
      nonVerifiedCount: 1,
      scopeDistribution: [
        { label: "source_job", count: 1 },
        { label: "source_sheet", count: 1 },
        { label: "source_url", count: 1 },
      ],
      trustDistribution: [
        { label: "official", count: 2 },
        { label: "conflict", count: 1 },
      ],
      statusDistribution: [
        { label: "verified", count: 2 },
        { label: "rejected", count: 1 },
      ],
    });
  });

  it("allows blank optional source verification form fields", () => {
    expect(
      sourceVerificationSchema.parse({
        sourceJobId: "12",
        sourceDocumentId: "",
        candidateId: "",
        verificationScope: "source_job",
        sourceSheet: "",
        sourceUrl: "",
        sourceTrust: "official",
        status: "verified",
        notes: "",
        verificationEvidenceJson: "",
      }),
    ).toMatchObject({
      sourceJobId: 12,
      verificationScope: "source_job",
      sourceTrust: "official",
      status: "verified",
    });
  });

  it("builds source verification decision payloads for audit and approval timelines", () => {
    expect(
      buildSourceVerificationDecisionPayload({
        sourceVerificationId: 55,
        sourceJobId: 12,
        sourceDocumentId: 34,
        candidateId: 99,
        verificationScope: "source_sheet",
        sourceSheet: "Reserve BTC",
        sourceUrl: "https://example.com/reserves",
        sourceTrust: "official",
        status: "verified",
        evidenceKeys: ["method", "checked_url"],
      }),
    ).toEqual({
      sourceVerificationId: 55,
      sourceJobId: 12,
      sourceDocumentId: 34,
      candidateId: 99,
      verificationScope: "source_sheet",
      sourceSheet: "Reserve BTC",
      sourceUrl: "https://example.com/reserves",
      sourceTrust: "official",
      status: "verified",
      evidenceKeys: ["checked_url", "method"],
      policy: {
        verificationIsOperatorDriven: true,
        registryWriteAllowed: false,
        kvWriteAllowed: false,
        candidateApprovalStillRequired: true,
        batchCommitStillRequired: true,
      },
    });
  });

  it("summarizes archived source documents for operator coverage checks", () => {
    expect(
      buildSourceJobDocumentRollup([
        {
          documentType: "csv",
          storageUri: "s3://mqchain/sources/1.csv",
          contentHash: "hash-1",
          sizeBytes: 512,
          extractedText: "address,chain",
        },
        {
          documentType: "html_snapshot",
          storageUri: "",
          contentHash: "hash-2",
          sizeBytes: 2048,
          extractedText: "",
        },
        {
          documentType: "csv",
          storageUri: "s3://mqchain/sources/2.csv",
          contentHash: null,
          sizeBytes: null,
          extractedText: "0xabc",
        },
      ]),
    ).toEqual({
      totalDocuments: 3,
      withStorageUri: 2,
      missingStorageUri: 1,
      withContentHash: 2,
      missingContentHash: 1,
      withExtractedText: 2,
      totalSizeBytes: 2560,
      typeDistribution: [
        { label: "csv", count: 2 },
        { label: "html_snapshot", count: 1 },
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

  it("preserves an existing archive URI when no replacement snapshot is provided", () => {
    const metadata = buildSourceJobArchiveMetadata(
      {
        archiveStorageUri: "s3://mqchain/sources/job-8",
        candidatesCreated: 5,
      },
      {
        reason: "Re-archived after review.",
        actorEmail: "owner@mamakquant.local",
      },
    );

    expect(metadata).toMatchObject({
      archiveStorageUri: "s3://mqchain/sources/job-8",
      archiveReason: "Re-archived after review.",
      archivedBy: "owner@mamakquant.local",
      candidatesCreated: 5,
    });
  });

  it("builds immutable intake audit payloads from import summaries", () => {
    expect(
      buildSourceJobIntakeAuditPayload({
        sourceJobId: 12,
        sourceDocumentId: 30,
        sourceType: "csv_upload",
        sourceName: "Binance reserves",
        sourceUrl: null,
        documentType: "csv",
        status: "candidate_created",
        chainScope: ["btc", "ethereum"],
        expectedRoles: ["cex_cold_wallet"],
        totalRows: 4,
        validAddresses: 3,
        invalidAddresses: 1,
        duplicates: 1,
        candidatesCreated: 2,
        candidatesUpdated: 0,
        evidenceCreated: 2,
        conflictsFound: 0,
        errors: ["row 4: invalid checksum"],
      }),
    ).toEqual({
      sourceJobId: 12,
      sourceDocumentId: 30,
      sourceType: "csv_upload",
      sourceName: "Binance reserves",
      sourceUrl: null,
      documentType: "csv",
      status: "candidate_created",
      chainScope: ["btc", "ethereum"],
      expectedRoles: ["cex_cold_wallet"],
      summary: {
        totalRows: 4,
        validAddresses: 3,
        invalidAddresses: 1,
        duplicates: 1,
        candidatesCreated: 2,
        candidatesUpdated: 0,
        evidenceCreated: 2,
        conflictsFound: 0,
        errorCount: 1,
      },
      errors: ["row 4: invalid checksum"],
    });
  });
});
