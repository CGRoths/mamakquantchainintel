import { describe, expect, it } from "vitest";

import {
  BATCH_EXPORT_API_CONTRACT,
  BATCH_LIST_API_CONTRACT,
  buildBatchExportApiResponse,
  buildBatchListApiResponse,
} from "@/lib/mqchain/batch-api";

const createdAt = new Date("2026-07-04T02:00:00.000Z");
const updatedAt = new Date("2026-07-04T03:00:00.000Z");

describe("batch provenance API payloads", () => {
  it("exports the batch queue without mutating registry or exposing evidence payload bodies", () => {
    const payload = buildBatchListApiResponse({
      query: {
        page: 1,
        pageSize: 25,
        filters: {
          status: "approved",
          sort: "committed_at",
        },
      },
      total: 1,
      totalPages: 1,
      rows: [
        {
          batch: {
            id: 42,
            sourceJobId: 12,
            sourceDocumentId: 13,
            entityId: 7,
            protocolId: null,
            roleId: 1002,
            sourceType: "candidate_review",
            sourceUrl: "https://example.com/proof",
            sourceName: "Binance cold wallet batch",
            confidenceDefault: 95,
            qualityTierDefault: 3,
            statusDefault: 1,
            flagsDefault: 1,
            importedCount: 8,
            acceptedCount: 7,
            rejectedCount: 1,
            conflictCount: 0,
            effectiveFromBlock: 800000,
            effectiveToBlock: null,
            labelAction: "create",
            supersedesBatchId: null,
            batchHash: "hash-batch",
            evidenceHash: "hash-evidence-set",
            storageUri: "s3://mqchain/batches/42",
            parserVersion: "mqchain-console-v1",
            dictionaryVersion: "dict-v1",
            status: "approved",
            createdAt,
            updatedAt,
            approvedAt: updatedAt,
            committedAt: null,
          },
          entity: { id: 7, entityCode: "binance", entityName: "Binance" },
          protocol: null,
          role: { roleId: 1002, roleCode: "cex_cold_wallet", roleName: "CEX Cold Wallet" },
        },
      ],
    });

    expect(payload).toMatchObject({
      ...BATCH_LIST_API_CONTRACT,
      mutationAllowed: false,
      batchWriteAllowed: false,
      registryWriteAllowed: false,
      kvWriteAllowed: false,
      evidencePayloadIncluded: false,
      pagination: {
        totalRows: 1,
        returnedRows: 1,
      },
      rows: [
        {
          id: 42,
          sourceJobId: 12,
          sourceType: "candidate_review",
          defaults: {
            entityCode: "binance",
            roleCode: "cex_cold_wallet",
            confidence: 95,
          },
          counts: {
            imported: 8,
            accepted: 7,
            rejected: 1,
            conflicts: 0,
          },
          timeline: {
            effectiveFromBlock: 800000,
            effectiveToBlock: null,
          },
          batchHash: "hash-batch",
          evidenceHash: "hash-evidence-set",
          status: "approved",
          lifecycle: {
            readyForCommit: true,
            committed: false,
          },
          hrefs: {
            detailApi: "/api/mqchain/batches/42",
            detailPage: "/mqchain/batches/42",
            sourceJob: "/mqchain/source-jobs/12",
          },
        },
      ],
      canonicalWrites: {
        candidatesApproved: 0,
        registryRowsCreated: 0,
        kvBuildsCreated: 0,
      },
      policy: {
        batchListIsControlPlaneQueueOnly: true,
        batchCommitWritesCanonicalRegistry: true,
        registryRowsRequireBatchCommit: true,
        kvHandoffIsExternalCompileOnly: true,
        detailEndpointContainsExpandedProvenance: true,
      },
    });
    expect(payload.rows[0]).not.toHaveProperty("evidence");
    expect(payload.rows[0]).not.toHaveProperty("candidates");
  });

  it("exports the batch commit boundary without exposing evidence payload bodies", () => {
    const payload = buildBatchExportApiResponse({
      batch: {
        id: 42,
        sourceJobId: 12,
        sourceDocumentId: 13,
        entityId: 7,
        protocolId: null,
        roleId: 1002,
        sourceType: "candidate_review",
        sourceUrl: "https://example.com/proof",
        sourceName: "Binance cold wallet batch",
        confidenceDefault: 95,
        qualityTierDefault: 3,
        statusDefault: 1,
        flagsDefault: 1,
        importedCount: 1,
        acceptedCount: 1,
        rejectedCount: 0,
        conflictCount: 0,
        effectiveFromBlock: 800000,
        effectiveToBlock: null,
        labelAction: "create",
        supersedesBatchId: null,
        batchHash: "hash-batch",
        evidenceHash: "hash-evidence-set",
        storageUri: "s3://mqchain/batches/42",
        parserVersion: "mqchain-console-v1",
        dictionaryVersion: "dict-v1",
        status: "committed",
        createdAt,
        updatedAt,
        approvedAt: createdAt,
        committedAt: updatedAt,
      },
      candidates: [
        {
          id: 30,
          sourceJobId: 12,
          sourceDocumentId: 13,
          normalizedAddress: "bc1qbatch",
          rawAddress: "bc1qbatch",
          chainCode: "btc",
          suggestedEntityId: 7,
          suggestedProtocolId: null,
          suggestedRoleId: 1002,
          confidenceScore: 95,
          qualityTier: 3,
          candidateStatus: "approved",
          evidenceCount: 1,
          discoveredBy: "csv",
          firstSeenBlock: 790000,
          lastSeenBlock: null,
          metadata: {
            rawReference: "row 7",
            contractName: "not-applicable",
          },
        },
      ],
      sourceJob: {
        id: 12,
        sourceType: "csv_upload",
        sourceName: "Binance reserves",
        sourceUrl: "https://example.com/proof",
        status: "candidate_created",
      },
      sourceDocument: {
        id: 13,
        documentType: "csv",
        originalName: "reserves.csv",
        storageUri: "postgres://mq_workflow_source_documents/12",
        contentHash: "hash-doc",
        sizeBytes: 512,
      },
      entity: { id: 7, entityCode: "binance", entityName: "Binance" },
      protocol: null,
      role: { roleId: 1002, roleCode: "cex_cold_wallet", roleName: "CEX Cold Wallet" },
      candidateEvidence: [
        {
          id: 40,
          candidateId: 30,
          registryId: 60,
          batchId: 42,
          evidenceType: "official_csv",
          sourceUrl: "https://example.com/proof",
          sourceDocumentId: 13,
          evidenceHash: "hash-evidence",
          storageUri: "s3://mqchain/evidence/40.json",
          confidenceDelta: 10,
          trustTier: "official",
          summary: "official reserves CSV",
          payload: { rawRow: "secret raw row", normalized: "bc1qbatch" },
          createdAt,
        },
      ],
      batchEvidence: [
        {
          id: 41,
          evidenceId: 40,
          evidenceHash: "hash-evidence",
          summary: "official reserves CSV",
          payload: { rawRow: "secret raw row", normalized: "bc1qbatch" },
          createdAt: updatedAt,
        },
      ],
      approvalEvents: [
        {
          id: 50,
          candidateId: 30,
          registryId: 60,
          batchId: 42,
          action: "candidate_committed_to_registry",
          reason: "Batch commit wrote registry row.",
          metadata: { reviewer: "owner" },
          createdAt: updatedAt,
        },
      ],
      kvBuilds: [
        {
          id: 70,
          buildHash: "hash-build",
          dictionaryVersion: "dict-v1",
          status: "pending",
          rowCount: 1,
          storageUri: null,
          manifest: {
            artifactType: "kv-index-build",
            artifactStatus: "pending_external_compile",
            reason: "batch_commit",
            batchId: 42,
            registryIds: [60],
            indexes: ["address_label_current"],
            longDetail: "not exported",
          },
          createdAt: updatedAt,
          activatedAt: null,
        },
      ],
      registryRows: [
        {
          registry: {
            id: 60,
            chainCode: "btc",
            normalizedAddress: "bc1qbatch",
            entityId: 7,
            protocolId: null,
            roleId: 1002,
            confidenceScore: 95,
            qualityTier: 3,
            flags: 1,
            metricUsage: "cex_flow",
            validFromBlock: 800000,
            validToBlock: null,
            isActive: true,
            primarySourceJobId: 12,
            approvedBatchId: 42,
            updatedAt,
          },
          entityName: "Binance",
          protocolName: null,
          roleCode: "cex_cold_wallet",
        },
      ],
      candidateRollup: { totalCandidates: 1 },
      evidenceRollup: { totalEvidence: 1 },
      registryRollup: { totalRows: 1, metricEligibleRows: 1 },
    });

    expect(payload).toMatchObject({
      ...BATCH_EXPORT_API_CONTRACT,
      mutationAllowed: false,
      batchWriteAllowed: false,
      registryWriteAllowed: false,
      kvWriteAllowed: false,
      evidencePayloadIncluded: false,
      batch: {
        id: 42,
        status: "committed",
        batchHash: "hash-batch",
        dictionaryVersion: "dict-v1",
        counts: { imported: 1, accepted: 1 },
      },
      candidates: [
        {
          candidateId: 30,
          candidateStatus: "approved",
          sourceReference: {
            rawReference: "row 7",
            contractName: "not-applicable",
          },
        },
      ],
      evidence: {
        candidateEvidence: [
          {
            id: 40,
            evidenceHash: "hash-evidence",
            payloadKeys: ["normalized", "rawRow"],
          },
        ],
        committedBatchEvidence: [
          {
            id: 41,
            evidenceHash: "hash-evidence",
            payloadKeys: ["normalized", "rawRow"],
          },
        ],
      },
      registryRows: [
        {
          registryId: 60,
          metricEligible: true,
          approvedBatchId: 42,
        },
      ],
      kvHandoffs: [
        {
          id: 70,
          manifest: {
            artifactType: "kv-index-build",
            artifactStatus: "pending_external_compile",
            registryIds: [60],
          },
        },
      ],
      policy: {
        batchCommitWritesCanonicalRegistry: true,
        evidenceRequiredBeforeRegistryCommit: true,
        kvHandoffIsExternalCompileOnly: true,
        evidencePayloadsExcludedByDefault: true,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("secret raw row");
    expect(JSON.stringify(payload)).not.toContain("not exported");
  });
});
