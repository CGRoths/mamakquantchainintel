import { describe, expect, it } from "vitest";

import {
  buildCandidateDetailExportApiResponse,
  buildCandidateExportApiResponse,
  buildCandidateExportCsv,
  CANDIDATE_DETAIL_EXPORT_API_CONTRACT,
  CANDIDATE_EXPORT_API_CONTRACT,
} from "@/lib/mqchain/candidate-api";
import { candidateExportApiFormatSchema } from "@/lib/mqchain/validators/candidate";

const candidateRow = {
  candidate: {
    id: 31,
    sourceJobId: 12,
    sourceDocumentId: 13,
    rawAddress: "0x1111111111111111111111111111111111111111",
    normalizedAddress: "0x1111111111111111111111111111111111111111",
    chainCode: "ethereum",
    addressFamily: "evm_20",
    prefixCode: 60,
    payloadHex: "1111111111111111111111111111111111111111",
    entityHint: "Aave",
    protocolHint: "Aave V3",
    roleHint: "pool",
    suggestedEntityId: 7,
    suggestedProtocolId: 8,
    suggestedRoleId: 1007,
    confidenceScore: 84,
    qualityTier: 3,
    candidateStatus: "pending_review",
    duplicateOfCandidateId: null,
    discoveredBy: "github",
    discoveryJobId: 9,
    evidenceCount: 2,
    firstSeenBlock: 19000000,
    lastSeenBlock: null,
    metadata: {
      sourceInputType: "github",
      contractName: "PoolProxy",
      roleSource: "constant",
      rawReference: "deployments/mainnet.json:12",
      notes: "requires reviewer check, proxy",
      metricEligible: "false",
    },
    createdAt: new Date("2026-07-04T02:00:00.000Z"),
    updatedAt: new Date("2026-07-04T03:00:00.000Z"),
  },
  entityName: "Aave",
  protocolName: "Aave V3",
  roleCode: "protocol_pool",
  sourceType: "github",
  sourceVerificationContext: {
    sheetNames: ["Ethereum"],
    sourceUrls: [],
    sheetVerificationRequired: true,
    hasVerifiedSourceJob: true,
    hasVerifiedSourceDocument: false,
    hasVerifiedSourceSheet: true,
    hasVerifiedCandidate: false,
    hasVerifiedSourceUrl: false,
    matchingVerifiedCount: 2,
    status: "source_sheet_verified" as const,
    message: "Sheet-scoped source verification matches this candidate.",
  },
};

describe("candidate export API payloads", () => {
  it("serializes staged candidates without treating them as production labels", () => {
    const payload = buildCandidateExportApiResponse({
      query: {
        page: 1,
        pageSize: 50,
        filters: { status: "pending_review", chain: "ethereum" },
      },
      rows: [candidateRow],
      total: 1,
      totalPages: 1,
    });

    expect(payload).toMatchObject({
      ...CANDIDATE_EXPORT_API_CONTRACT,
      mutationAllowed: false,
      registryWriteAllowed: false,
      kvWriteAllowed: false,
      candidatesAreApprovedTruth: false,
      rows: [
        {
          candidateId: 31,
          chainCode: "ethereum",
          normalizedAddress: "0x1111111111111111111111111111111111111111",
          suggestedEntity: { id: 7, name: "Aave", hint: "Aave" },
          suggestedProtocol: { id: 8, name: "Aave V3", hint: "Aave V3" },
          suggestedRole: { id: 1007, code: "protocol_pool", hint: "pool" },
          candidateStatus: "pending_review",
          evidenceCount: 2,
          sourceVerification: {
            status: "source_sheet_verified",
            message: "Sheet-scoped source verification matches this candidate.",
            matchingVerifiedCount: 2,
            sheetVerificationRequired: true,
            sheetNames: ["Ethereum"],
            hasVerifiedSourceJob: true,
            hasVerifiedSourceSheet: true,
          },
          sourceReference: {
            sourceInputType: "github",
            contractName: "PoolProxy",
            roleSource: "constant",
            rawReference: "deployments/mainnet.json:12",
            notes: "requires reviewer check, proxy",
            metricEligibleHint: "false",
          },
        },
      ],
      policy: {
        candidateRowsAreStagingOnly: true,
        sourceVerificationRequiredBeforeApproval: true,
        sourceVerificationRequiredBeforeBatchCommit: true,
        approvalRequiredBeforeBatch: true,
        batchCommitRequiredBeforeRegistry: true,
        externalWorkersMustNotTreatCandidatesAsProductionLabels: true,
      },
    });
  });

  it("exports deterministic candidate CSV pages for review and enrichment workers", () => {
    const csv = buildCandidateExportCsv({
      query: {
        page: 1,
        pageSize: 50,
        filters: { status: "pending_review", chain: "ethereum" },
      },
      rows: [candidateRow],
      total: 1,
      totalPages: 1,
    });

    expect(csv.split("\n")).toEqual([
      "candidate_id,source_job_id,source_document_id,source_type,chain_code,normalized_address,raw_address,address_family,prefix_code,payload_hex,entity_hint,suggested_entity_id,entity_name,protocol_hint,suggested_protocol_id,protocol_name,role_hint,suggested_role_id,role_code,confidence_score,quality_tier,candidate_status,evidence_count,discovered_by,discovery_job_id,duplicate_of_candidate_id,first_seen_block,last_seen_block,source_verification_status,source_verification_message,source_verification_matching_count,source_verification_sheet_required,source_verification_sheets,source_input_type,contract_name,role_source,raw_reference,notes,metric_eligible_hint,created_at,updated_at",
      '31,12,13,github,ethereum,0x1111111111111111111111111111111111111111,0x1111111111111111111111111111111111111111,evm_20,60,1111111111111111111111111111111111111111,Aave,7,Aave,Aave V3,8,Aave V3,pool,1007,protocol_pool,84,3,pending_review,2,github,9,,19000000,,source_sheet_verified,Sheet-scoped source verification matches this candidate.,2,true,Ethereum,github,PoolProxy,constant,deployments/mainnet.json:12,"requires reviewer check, proxy",false,2026-07-04T02:00:00.000Z,2026-07-04T03:00:00.000Z',
    ]);
  });

  it("validates candidate export formats", () => {
    expect(candidateExportApiFormatSchema.parse(undefined)).toBe("json");
    expect(candidateExportApiFormatSchema.parse("csv")).toBe("csv");
    expect(() => candidateExportApiFormatSchema.parse("xlsx")).toThrow();
  });

  it("exports candidate detail provenance without raw evidence payload bodies", () => {
    const payload = buildCandidateDetailExportApiResponse({
      candidate: candidateRow.candidate,
      dictionaries: {
        entities: [{ id: 7, entityCode: "aave", entityName: "Aave" }],
        protocols: [{ id: 8, protocolCode: "aave_v3", protocolName: "Aave V3" }],
        roles: [{ roleId: 1007, roleCode: "protocol_pool", defaultFlags: 257 }],
      },
      sourceJob: {
        id: 12,
        sourceType: "github",
        sourceName: "Aave deployments",
        sourceUrl: "https://github.com/aave/deployments",
        status: "candidate_created",
        parserVersion: "mqchain-console-v1",
      },
      sourceDocument: {
        id: 13,
        documentType: "github_file",
        originalName: "deployments/mainnet.json",
        storageUri: "postgres://mq_source_documents/12",
        contentHash: "hash-document",
        mimeType: "application/json",
        sizeBytes: 4096,
        extractedText: "raw deployment json that must not be returned",
        metadata: { fetchedUrl: "https://raw.githubusercontent.com/aave/deployments/mainnet.json" },
        createdAt: new Date("2026-07-04T01:00:00.000Z"),
      },
      evidence: [
        {
          id: 41,
          candidateId: 31,
          registryId: null,
          batchId: null,
          evidenceType: "github_deployment",
          sourceUrl: "https://github.com/aave/deployments",
          sourceDocumentId: 13,
          evidenceHash: "hash-evidence",
          storageUri: "postgres://mq_address_evidence/41",
          confidenceDelta: 10,
          trustTier: "official",
          summary: "official deployment file",
          payload: {
            rawReference: "secret line body",
            source_role_label: "PoolProxy",
          },
          createdAt: new Date("2026-07-04T02:30:00.000Z"),
        },
      ],
      registryMatches: [
        {
          registry: {
            id: 91,
            chainCode: "ethereum",
            normalizedAddress: "0x1111111111111111111111111111111111111111",
            entityId: 7,
            protocolId: 8,
            roleId: 1007,
            confidenceScore: 90,
            qualityTier: 3,
            labelStatus: 1,
            flags: 257,
            metricUsage: "protocol_graph",
            validFromBlock: 19000000,
            validToBlock: null,
            isActive: true,
            approvedBatchId: 55,
            updatedAt: new Date("2026-07-04T04:00:00.000Z"),
          },
          entity: { entityCode: "aave", entityName: "Aave" },
          protocol: { protocolCode: "aave_v3", protocolName: "Aave V3" },
          role: { roleCode: "protocol_pool" },
          category: { categoryCode: "defi_lending" },
        },
      ],
      approvalEvents: [
        {
          id: 77,
          action: "candidate_approved",
          actorId: "00000000-0000-0000-0000-000000000001",
          candidateId: 31,
          registryId: 91,
          batchId: 55,
          reason: "reviewed official deployment",
          metadata: { approvalDraft: { flags: 257 } },
          beforeJson: { candidateStatus: "pending_review" },
          afterJson: { candidateStatus: "approved" },
          createdAt: new Date("2026-07-04T04:10:00.000Z"),
        },
      ],
      duplicateOfCandidate: null,
      duplicateCandidates: [],
      discoveryJob: {
        id: 9,
        discoveryType: "registry_scanner",
        status: "completed",
        seedAddress: "0x2222222222222222222222222222222222222222",
      },
      sourceVerifications: [
        {
          verification: {
            id: 88,
            sourceJobId: 12,
            sourceDocumentId: 13,
            candidateId: 31,
            verificationScope: "candidate",
            sourceSheet: null,
            sourceUrl: "https://github.com/aave/deployments",
            sourceTrust: "official",
            status: "verified",
            notes: "official repository checked",
            verificationEvidence: {
              checkedUrl: "https://github.com/aave/deployments",
              rawSnippet: "private verification note",
            },
            verifiedBy: "00000000-0000-0000-0000-000000000001",
            createdAt: new Date("2026-07-04T03:20:00.000Z"),
          },
          verifierEmail: "reviewer@mamakquant.local",
          verifierName: "Reviewer",
        },
      ],
    });

    expect(payload).toMatchObject({
      ...CANDIDATE_DETAIL_EXPORT_API_CONTRACT,
      evidencePayloadIncluded: false,
      verificationEvidencePayloadIncluded: false,
      approvalEventPayloadsIncluded: false,
      candidate: {
        candidateId: 31,
        suggestedEntity: { id: 7, code: "aave", name: "Aave" },
        suggestedProtocol: { id: 8, code: "aave_v3", name: "Aave V3" },
        suggestedRole: { id: 1007, code: "protocol_pool", defaultFlags: 257 },
        sourceVerification: { status: "candidate_verified", matchingVerifiedCount: 1 },
      },
      source: {
        sourceDocument: {
          id: 13,
          extractedTextLength: 45,
          metadataKeys: ["fetchedUrl"],
        },
      },
      reviewReadiness: {
        blockers: [],
        canApproveWithEdits: true,
      },
      sourceVerification: {
        context: {
          status: "candidate_verified",
          hasVerifiedCandidate: true,
        },
        records: [
          {
            id: 88,
            verificationEvidenceKeys: ["checkedUrl", "rawSnippet"],
            verifier: {
              email: "reviewer@mamakquant.local",
              name: "Reviewer",
            },
          },
        ],
      },
      evidence: [
        {
          id: 41,
          payloadKeys: ["rawReference", "source_role_label"],
        },
      ],
      registryMatches: [
        {
          registryId: 91,
          approvedBatchId: 55,
          category: { code: "defi_lending" },
        },
      ],
      approvalEvents: [
        {
          id: 77,
          metadataKeys: ["approvalDraft"],
          beforeKeys: ["candidateStatus"],
          afterKeys: ["candidateStatus"],
        },
      ],
      policy: {
        candidateRowsAreStagingOnly: true,
        sourceVerificationRequiredBeforeApproval: true,
        rawEvidencePayloadsExcludedByDefault: true,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("secret line body");
    expect(JSON.stringify(payload)).not.toContain("private verification note");
    expect(JSON.stringify(payload)).not.toContain("raw deployment json that must not be returned");
  });
});
