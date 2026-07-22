import { describe, expect, it } from "vitest";

import { buildEvidenceLedgerApiResponse, EVIDENCE_LEDGER_API_CONTRACT } from "@/lib/mqchain/evidence-api";
import { evidenceLedgerListFilterSchema } from "@/lib/mqchain/list-filters";

const createdAt = new Date("2026-07-04T04:00:00.000Z");

describe("evidence ledger API payloads", () => {
  it("exports redacted evidence and source verification ledgers without creating truth", () => {
    const payload = buildEvidenceLedgerApiResponse({
      query: {
        page: 1,
        pageSize: 25,
        filters: {
          chain: "ethereum",
          sourceType: "github",
          verificationScope: "source_sheet",
        },
      },
      evidenceTotal: 1,
      evidenceTotalPages: 1,
      evidenceRows: [
        {
          evidence: {
            id: 41,
            candidateId: 31,
            registryId: null,
            batchId: null,
            evidenceType: "github_deployment",
            sourceUrl: "https://github.com/aave/deployments",
            sourceDocumentId: 13,
            evidenceHash: "hash-evidence",
            storageUri: "postgres://mq_workflow_address_evidence/41",
            confidenceDelta: 10,
            trustTier: "official",
            summary: "official deployment file",
            payload: {
              rawReference: "secret deployment line",
              source_role_label: "PoolProxy",
            },
            createdBy: "00000000-0000-0000-0000-000000000001",
            createdAt,
          },
          candidate: {
            id: 31,
            sourceJobId: 12,
            normalizedAddress: "0x1111111111111111111111111111111111111111",
            chainCode: "ethereum",
            candidateStatus: "pending_review",
            confidenceScore: 84,
            qualityTier: 3,
          },
          registry: null,
          sourceDocument: {
            id: 13,
            sourceJobId: 12,
            documentType: "github_file",
            storageUri: "postgres://mq_workflow_source_documents/13",
            contentHash: "hash-document",
          },
          sourceJob: {
            id: 12,
            sourceType: "github",
            sourceName: "Aave deployments",
            sourceUrl: "https://github.com/aave/deployments",
            status: "candidate_created",
          },
          creatorEmail: "reviewer@mamakquant.local",
          creatorName: "Reviewer",
        },
      ],
      sourceVerificationTotal: 1,
      sourceVerificationTotalPages: 1,
      sourceVerificationRows: [
        {
          verification: {
            id: 88,
            sourceJobId: 12,
            sourceDocumentId: 13,
            candidateId: 31,
            verificationScope: "source_sheet",
            sourceSheet: "Ethereum",
            sourceUrl: "https://github.com/aave/deployments",
            sourceTrust: "official",
            status: "verified",
            notes: "official repository sheet checked",
            verificationEvidence: {
              checkedUrl: "https://github.com/aave/deployments",
              rawSnippet: "private verification note",
            },
            verifiedBy: "00000000-0000-0000-0000-000000000001",
            createdAt,
          },
          candidate: {
            id: 31,
            sourceJobId: 12,
            normalizedAddress: "0x1111111111111111111111111111111111111111",
            chainCode: "ethereum",
            candidateStatus: "pending_review",
            confidenceScore: 84,
            qualityTier: 3,
          },
          sourceDocument: {
            id: 13,
            sourceJobId: 12,
            documentType: "github_file",
            storageUri: "postgres://mq_workflow_source_documents/13",
            contentHash: "hash-document",
          },
          sourceJob: {
            id: 12,
            sourceType: "github",
            sourceName: "Aave deployments",
            sourceUrl: "https://github.com/aave/deployments",
            status: "candidate_created",
          },
          verifierEmail: "reviewer@mamakquant.local",
          verifierName: "Reviewer",
        },
      ],
    });

    expect(payload).toMatchObject({
      ...EVIDENCE_LEDGER_API_CONTRACT,
      mutationAllowed: false,
      candidateWriteAllowed: false,
      approvalWriteAllowed: false,
      registryWriteAllowed: false,
      kvWriteAllowed: false,
      evidencePayloadIncluded: false,
      verificationEvidencePayloadIncluded: false,
      pagination: {
        evidence: {
          totalRows: 1,
          returnedRows: 1,
        },
        sourceVerifications: {
          totalRows: 1,
          returnedRows: 1,
        },
      },
      evidence: [
        {
          id: 41,
          evidenceType: "github_deployment",
          trustTier: "official",
          payloadKeys: ["rawReference", "source_role_label"],
          candidate: {
            id: 31,
            detailApi: "/api/mqchain/candidates/31",
          },
          source: {
            sourceJob: {
              id: 12,
              detailApi: "/api/mqchain/source-jobs/12",
            },
            sourceDocument: {
              id: 13,
              contentHash: "hash-document",
            },
          },
        },
      ],
      sourceVerifications: [
        {
          id: 88,
          verificationScope: "source_sheet",
          sourceSheet: "Ethereum",
          sourceTrust: "official",
          status: "verified",
          verificationEvidenceKeys: ["checkedUrl", "rawSnippet"],
        },
      ],
      canonicalWrites: {
        candidatesCreated: 0,
        approvalsCreated: 0,
        registryRowsCreated: 0,
        kvBuildsCreated: 0,
      },
      policy: {
        evidenceIsProvenanceOnly: true,
        sourceVerificationIsOperatorDriven: true,
        sourceVerificationDoesNotApproveCandidates: true,
        sourceJobVerificationDoesNotSatisfySheetScopedCandidates: true,
        batchCommitRequiredBeforeRegistry: true,
        externalWorkersMustNotTreatEvidenceAsProductionLabels: true,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("secret deployment line");
    expect(JSON.stringify(payload)).not.toContain("private verification note");
  });

  it("validates evidence ledger filters", () => {
    expect(
      evidenceLedgerListFilterSchema.parse({
        page: "2",
        pageSize: "25",
        sort: "trust",
        candidateId: "31",
        verificationScope: "source_sheet",
      }),
    ).toMatchObject({
      page: 2,
      pageSize: 25,
      sort: "trust",
      candidateId: 31,
      verificationScope: "source_sheet",
    });
    expect(() => evidenceLedgerListFilterSchema.parse({ sort: "registry_write" })).toThrow();
  });
});
