import { describe, expect, it } from "vitest";

import {
  buildSourceJobExportApiResponse,
  buildSourceJobIntakeApiResponse,
  buildSourceJobListApiResponse,
  SOURCE_JOB_EXPORT_API_CONTRACT,
  SOURCE_JOB_INTAKE_API_CONTRACT,
  SOURCE_JOB_LIST_API_CONTRACT,
} from "@/lib/mqchain/source-job-api";

const createdAt = new Date("2026-07-04T02:00:00.000Z");
const updatedAt = new Date("2026-07-04T03:00:00.000Z");

describe("source job provenance API payloads", () => {
  it("reports intake writes as staged candidate/evidence rows only", () => {
    const payload = buildSourceJobIntakeApiResponse({
      intakeType: "csv",
      summary: {
        sourceJobId: 31,
        totalRows: 3,
        validAddresses: 2,
        invalidAddresses: 1,
        duplicates: 0,
        candidatesCreated: 2,
        candidatesUpdated: 0,
        evidenceCreated: 2,
        conflictsFound: 0,
        errors: ["row 3: invalid checksum"],
      },
    });

    expect(payload).toMatchObject({
      ...SOURCE_JOB_INTAKE_API_CONTRACT,
      mutationAllowed: true,
      stagingOnly: true,
      canonicalWriteBoundary: "approval_batch_commit",
      candidateWriteAllowed: true,
      approvalWriteAllowed: false,
      registryWriteAllowed: false,
      kvWriteAllowed: false,
      sourceJob: {
        id: 31,
        href: "/mqchain/source-jobs/31",
        detailApi: "/api/mqchain/source-jobs/31",
      },
      importSummary: {
        totalRows: 3,
        validAddresses: 2,
        invalidAddresses: 1,
        candidatesCreated: 2,
        evidenceCreated: 2,
        errorCount: 1,
      },
      canonicalWrites: {
        candidatesCreated: 2,
        evidenceCreated: 2,
        approvalsCreated: 0,
        registryRowsCreated: 0,
        kvBuildsCreated: 0,
      },
      policy: {
        intakeCreatesStagedCandidatesOnly: true,
        intakeDoesNotApproveCandidates: true,
        registryRowsRequireBatchCommit: true,
        canonicalRegistryAndKvWritesBlocked: true,
        rawRequestPayloadExcludedFromResponse: true,
      },
      nextActions: {
        reviewQueue: "/mqchain/review",
        sourceJob: "/mqchain/source-jobs/31",
      },
    });
  });

  it("exports source job pages without full metadata or raw archive bodies", () => {
    const payload = buildSourceJobListApiResponse({
      query: {
        page: 1,
        pageSize: 25,
        filters: {
          sourceType: "official_url",
          status: "archived",
        },
      },
      total: 1,
      totalPages: 1,
      rows: [
        {
          id: 15,
          sourceType: "official_url",
          sourceName: "Exchange reserves",
          sourceUrl: "https://example.com/reserves",
          localFileName: null,
          archiveStorageUri: "s3://mqchain/sources/job-15",
          entityHint: "Example Exchange",
          protocolHint: null,
          chainScope: ["btc"],
          expectedRoles: ["cex_cold_wallet"],
          status: "archived",
          parserVersion: "mqchain-console-v1",
          metadata: {
            totalRows: 2,
            validAddresses: 1,
            invalidAddresses: 1,
            candidatesCreated: 1,
            evidenceCreated: 1,
            errors: ["row 2: invalid checksum with private snippet"],
            archivedAt: "2026-07-04T04:00:00.000Z",
            archivedBy: "owner@mamakquant.local",
            archiveReason: "Reviewed official reserves page.",
            rawSourceExcerpt: "raw page body that must not be exported",
          },
          createdAt,
          updatedAt,
        },
      ],
    });

    expect(payload).toMatchObject({
      ...SOURCE_JOB_LIST_API_CONTRACT,
      mutationAllowed: false,
      rawSourceTextIncluded: false,
      fullMetadataIncluded: false,
      pagination: {
        totalRows: 1,
        returnedRows: 1,
      },
      rows: [
        {
          id: 15,
          sourceType: "official_url",
          sourceName: "Exchange reserves",
          archiveStorageUri: "s3://mqchain/sources/job-15",
          archived: true,
          archivedBy: "owner@mamakquant.local",
          archiveReason: "Reviewed official reserves page.",
          metadataKeys: expect.arrayContaining(["errors", "rawSourceExcerpt", "totalRows"]),
          importSummary: {
            totalRows: 2,
            validAddresses: 1,
            invalidAddresses: 1,
            candidatesCreated: 1,
            evidenceCreated: 1,
            errorCount: 1,
          },
          hrefs: {
            sourceJob: "/mqchain/source-jobs/15",
            detailApi: "/api/mqchain/source-jobs/15",
          },
        },
      ],
      canonicalWrites: {
        candidatesCreated: 0,
        approvalsCreated: 0,
        registryRowsCreated: 0,
        kvBuildsCreated: 0,
      },
      policy: {
        sourceArchiveIsProvenanceOnly: true,
        intakeDoesNotApproveCandidates: true,
        registryRowsRequireBatchCommit: true,
        fullMetadataExcludedByDefault: true,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("raw page body that must not be exported");
    expect(JSON.stringify(payload)).not.toContain("invalid checksum with private snippet");
  });

  it("exports source provenance without raw text or evidence payload bodies", () => {
    const payload = buildSourceJobExportApiResponse({
      sourceJob: {
        id: 15,
        sourceType: "official_url",
        sourceName: "Exchange reserves",
        sourceUrl: "https://example.com/reserves",
        localFileName: null,
        archiveStorageUri: "s3://mqchain/sources/job-15",
        entityHint: "Example Exchange",
        protocolHint: null,
        chainScope: ["btc"],
        expectedRoles: ["cex_cold_wallet"],
        status: "archived",
        parserVersion: "mqchain-console-v1",
        metadata: {
          totalRows: 2,
          validAddresses: 1,
          invalidAddresses: 1,
          candidatesCreated: 1,
          errors: ["row 2: invalid checksum"],
          archivedAt: "2026-07-04T04:00:00.000Z",
          archivedBy: "owner@mamakquant.local",
          archiveReason: "Reviewed.",
        },
        createdAt,
        updatedAt,
      },
      documents: [
        {
          id: 21,
          sourceJobId: 15,
          documentType: "html_snapshot",
          originalName: "reserves.html",
          storageUri: "s3://mqchain/sources/job-15/reserves.html",
          contentHash: "hash-document",
          mimeType: "text/html",
          sizeBytes: 1024,
          extractedText: "raw page body that must not be exported",
          metadata: { capturedUrl: "https://example.com/reserves" },
          createdAt,
        },
      ],
      candidates: [
        {
          id: 30,
          sourceDocumentId: 21,
          normalizedAddress: "bc1qsource",
          chainCode: "btc",
          candidateStatus: "approved",
          confidenceScore: 92,
          qualityTier: 3,
          evidenceCount: 1,
          discoveredBy: "source_url",
          discoveryJobId: null,
          createdAt,
          updatedAt,
        },
      ],
      evidence: [
        {
          id: 40,
          candidateId: 30,
          registryId: null,
          batchId: null,
          evidenceType: "official_page",
          sourceUrl: "https://example.com/reserves",
          sourceDocumentId: 21,
          evidenceHash: "hash-evidence",
          storageUri: "s3://mqchain/evidence/40.json",
          confidenceDelta: 20,
          trustTier: "official",
          summary: "official reserves page",
          payload: { rawReference: "line 12", extractedAddress: "bc1qsource" },
          createdAt,
        },
      ],
      verifications: [
        {
          verification: {
            id: 70,
            sourceJobId: 15,
            sourceDocumentId: 21,
            candidateId: 30,
            verificationScope: "source_document",
            sourceSheet: null,
            sourceUrl: "https://example.com/reserves",
            sourceTrust: "official",
            status: "verified",
            notes: "official page checked",
            verificationEvidence: {
              checkedUrl: "https://example.com/reserves",
              rawSnippet: "private source excerpt",
            },
            verifiedBy: "00000000-0000-0000-0000-000000000001",
            createdAt: updatedAt,
          },
          verifierEmail: "reviewer@mamakquant.local",
          verifierName: "Reviewer",
        },
      ],
      downstreamBatches: [
        {
          id: 50,
          status: "committed",
          acceptedCount: 1,
          conflictCount: 0,
          batchHash: "hash-batch",
          storageUri: "s3://mqchain/batches/50",
          dictionaryVersion: "dict-v1",
          committedAt: updatedAt,
        },
      ],
      downstreamRegistryRows: [
        {
          registry: {
            id: 60,
            chainCode: "btc",
            normalizedAddress: "bc1qsource",
            entityId: 7,
            protocolId: null,
            roleId: 1002,
            confidenceScore: 92,
            qualityTier: 3,
            flags: 1,
            metricUsage: "cex_flow",
            isActive: true,
            approvedBatchId: 50,
            updatedAt,
          },
          entityName: "Example Exchange",
          protocolName: null,
          roleCode: "cex_cold_wallet",
        },
      ],
      documentRollup: { totalDocuments: 1 },
      candidateRollup: { totalCandidates: 1 },
      evidenceRollup: { totalEvidence: 1 },
      verificationRollup: { totalVerifications: 1, verifiedCount: 1 },
      downstreamRollup: { totalRegistryRows: 1 },
    });

    expect(payload).toMatchObject({
      ...SOURCE_JOB_EXPORT_API_CONTRACT,
      rawSourceTextIncluded: false,
      evidencePayloadIncluded: false,
      verificationEvidencePayloadIncluded: false,
      sourceJob: {
        id: 15,
        archived: true,
        archiveStorageUri: "s3://mqchain/sources/job-15",
        metadataKeys: expect.arrayContaining(["errors", "totalRows", "validAddresses"]),
        importSummary: {
          totalRows: 2,
          validAddresses: 1,
          invalidAddresses: 1,
          candidatesCreated: 1,
          errorCount: 1,
        },
      },
      documents: [
        {
          id: 21,
          extractedTextLength: 39,
          metadataKeys: ["capturedUrl"],
        },
      ],
      evidence: [
        {
          id: 40,
          payloadKeys: ["extractedAddress", "rawReference"],
        },
      ],
      sourceVerifications: [
        {
          id: 70,
          sourceDocumentId: 21,
          candidateId: 30,
          verificationScope: "source_document",
          sourceTrust: "official",
          status: "verified",
          verificationEvidenceKeys: ["checkedUrl", "rawSnippet"],
          verifiedBy: {
            email: "reviewer@mamakquant.local",
            name: "Reviewer",
          },
        },
      ],
      downstream: {
        batches: [{ id: 50, status: "committed" }],
        registryRows: [{ registryId: 60, approvedBatchId: 50 }],
      },
      policy: {
        candidatesRemainStagedUntilApproval: true,
        registryRowsRequireBatchCommit: true,
        sourceVerificationIsOperatorDriven: true,
        sourceVerificationDoesNotApproveCandidates: true,
        rawTextAndEvidencePayloadsExcludedByDefault: true,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("raw page body that must not be exported");
    expect(JSON.stringify(payload)).not.toContain("line 12");
    expect(JSON.stringify(payload)).not.toContain("private source excerpt");
  });
});
