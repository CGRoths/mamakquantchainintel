import { describe, expect, it } from "vitest";

import {
  buildRegistryDetailExportApiResponse,
  buildRegistryExportApiResponse,
  buildRegistryExportCsv,
  REGISTRY_DETAIL_EXPORT_API_CONTRACT,
  REGISTRY_EXPORT_API_CONTRACT,
} from "@/lib/mqchain/registry-api";
import { registryExportApiFormatSchema } from "@/lib/mqchain/validators/registry";

const registryRow = {
  registry: {
    id: 42,
    chainCode: "btc",
    normalizedAddress: "bc1qcanonical",
    rawAddress: "bc1qcanonical",
    prefixCode: 18,
    payloadHex: "001122",
    entityId: 7,
    protocolId: null,
    roleId: 1002,
    confidenceScore: 95,
    qualityTier: 3,
    labelStatus: 1,
    flags: 1,
    metricUsage: "cex_flow",
    validFromBlock: 800000,
    validToBlock: null,
    firstSeenBlock: 790000,
    lastSeenBlock: null,
    isActive: true,
    primarySourceJobId: 11,
    approvedBatchId: 12,
    metadata: {
      source_role_label: "cold wallet",
      source_role_labels: ["cold wallet", "Proof of Reserves"],
    },
    updatedAt: new Date("2026-07-04T02:00:00.000Z"),
  },
  entityCode: "binance",
  entityName: "Binance, Global",
  protocolCode: null,
  protocolName: null,
  roleCode: "cex_cold_wallet",
  categoryCode: "cex_hot_cold",
};

describe("registry export API payloads", () => {
  it("serializes canonical registry rows as read-only Postgres truth", () => {
    const payload = buildRegistryExportApiResponse({
      query: {
        page: 1,
        pageSize: 50,
        filters: { active: "active", chain: "btc" },
      },
      rows: [registryRow],
      total: 1,
      totalPages: 1,
    });

    expect(payload).toMatchObject({
      ...REGISTRY_EXPORT_API_CONTRACT,
      mutationAllowed: false,
      registryWriteAllowed: false,
      kvWriteAllowed: false,
      pagination: {
        totalRows: 1,
        returnedRows: 1,
      },
      rows: [
        {
          registryId: 42,
          chainCode: "btc",
          normalizedAddress: "bc1qcanonical",
          entity: { id: 7, code: "binance", name: "Binance, Global" },
          role: { id: 1002, code: "cex_cold_wallet" },
          category: { code: "cex_hot_cold" },
          metricEligible: true,
          validFromBlock: 800000,
          approvedBatchId: 12,
          sourceRoleLabel: "cold wallet",
          sourceRoleLabels: ["cold wallet", "Proof of Reserves"],
        },
      ],
      policy: {
        timelineFieldsIncluded: true,
        batchCommitIsRegistryBoundary: true,
        externalWorkersMustNotTreatThisAsKvArtifact: true,
      },
    });
  });

  it("exports deterministic registry CSV pages for workers", () => {
    const csv = buildRegistryExportCsv({
      query: {
        page: 1,
        pageSize: 50,
        filters: { active: "active", chain: "btc" },
      },
      rows: [registryRow],
      total: 1,
      totalPages: 1,
    });

    expect(csv.split("\n")).toEqual([
      "registry_id,chain_code,normalized_address,raw_address,prefix_code,payload_hex,entity_id,entity_code,entity_name,protocol_id,protocol_code,protocol_name,role_id,role_code,category_code,confidence_score,quality_tier,label_status,flags,metric_usage,metric_eligible,is_active,valid_from_block,valid_to_block,first_seen_block,last_seen_block,primary_source_job_id,approved_batch_id,source_role_label,source_role_labels,updated_at",
      '42,btc,bc1qcanonical,bc1qcanonical,18,001122,7,binance,"Binance, Global",,,,1002,cex_cold_wallet,cex_hot_cold,95,3,1,1,cex_flow,true,true,800000,,790000,,11,12,cold wallet,"[""cold wallet"",""Proof of Reserves""]",2026-07-04T02:00:00.000Z',
    ]);
  });

  it("validates registry export formats", () => {
    expect(registryExportApiFormatSchema.parse(undefined)).toBe("json");
    expect(registryExportApiFormatSchema.parse("csv")).toBe("csv");
    expect(() => registryExportApiFormatSchema.parse("xlsx")).toThrow();
  });

  it("exports registry detail provenance without raw evidence or source text bodies", () => {
    const payload = buildRegistryDetailExportApiResponse({
      registry: {
        ...registryRow.registry,
        notes: "canonical cold wallet",
        metadata: {
          candidateId: 31,
          source_role_label: "cold wallet",
        },
        createdAt: new Date("2026-07-04T01:00:00.000Z"),
      },
      entity: { id: 7, entityCode: "binance", entityName: "Binance, Global" },
      protocol: null,
      role: { roleId: 1002, roleCode: "cex_cold_wallet", roleName: "CEX cold wallet" },
      category: { categoryId: 3, categoryCode: "cex_hot_cold", categoryName: "CEX hot/cold" },
      evidence: [
        {
          id: 71,
          candidateId: 31,
          registryId: 42,
          batchId: 12,
          evidenceType: "proof_of_reserve",
          sourceUrl: "https://example.com/proof",
          sourceDocumentId: 81,
          evidenceHash: "hash-evidence",
          storageUri: "s3://mqchain/evidence/71.json",
          confidenceDelta: 20,
          trustTier: "official",
          summary: "official reserve proof",
          payload: {
            rawAddressExcerpt: "secret evidence body",
            source_role_label: "cold wallet",
          },
          createdAt: new Date("2026-07-04T02:30:00.000Z"),
        },
      ],
      sourceBatch: {
        id: 12,
        sourceJobId: 11,
        sourceDocumentId: 81,
        sourceType: "official_url",
        sourceUrl: "https://example.com/proof",
        sourceName: "Binance reserve proof",
        status: "committed",
        batchHash: "hash-batch",
        evidenceHash: "hash-batch-evidence",
        storageUri: "s3://mqchain/batches/12",
        dictionaryVersion: "dict-v1",
        importedCount: 1,
        acceptedCount: 1,
        rejectedCount: 0,
        conflictCount: 0,
        committedAt: new Date("2026-07-04T04:00:00.000Z"),
      },
      primarySourceJob: {
        id: 11,
        sourceType: "official_url",
        sourceName: "Binance reserve proof",
        sourceUrl: "https://example.com/proof",
        archiveStorageUri: "s3://mqchain/sources/11",
        status: "archived",
        parserVersion: "mqchain-console-v1",
      },
      primarySourceDocument: {
        id: 81,
        documentType: "html_snapshot",
        originalName: "proof.html",
        storageUri: "s3://mqchain/sources/11/proof.html",
        contentHash: "hash-document",
        mimeType: "text/html",
        sizeBytes: 8192,
        extractedText: "raw source document body that must not leave the detail API",
        metadata: { capturedUrl: "https://example.com/proof" },
        createdAt: new Date("2026-07-04T01:30:00.000Z"),
      },
      provenanceCandidate: {
        id: 31,
        sourceJobId: 11,
        sourceDocumentId: 81,
        candidateStatus: "approved",
        confidenceScore: 95,
        qualityTier: 3,
        evidenceCount: 1,
        discoveryJobId: null,
      },
      provenanceCandidateId: 31,
      approvalEvents: [
        {
          id: 91,
          action: "batch_committed",
          actorId: "00000000-0000-0000-0000-000000000001",
          candidateId: 31,
          registryId: 42,
          batchId: 12,
          reason: "official reserve batch",
          metadata: { batchHash: "hash-batch" },
          beforeJson: { candidateStatus: "approved" },
          afterJson: { registryId: 42 },
          createdAt: new Date("2026-07-04T04:05:00.000Z"),
        },
      ],
      relatedCandidates: [
        {
          id: 31,
          sourceJobId: 11,
          sourceDocumentId: 81,
          candidateStatus: "approved",
          confidenceScore: 95,
          qualityTier: 3,
          evidenceCount: 1,
          discoveryJobId: null,
          createdAt: new Date("2026-07-04T02:00:00.000Z"),
        },
      ],
      relatedDiscoveryJobs: [
        {
          id: 101,
          discoveryType: "tx_graph_scanner",
          status: "completed",
          chainCode: "btc",
          seedAddress: "bc1qcanonical",
          entityId: 7,
          protocolId: null,
          candidatesCreated: 2,
          evidenceCreated: 2,
          error: null,
          createdAt: new Date("2026-07-04T05:00:00.000Z"),
        },
      ],
      relatedRegistryRows: [
        {
          registry: {
            ...registryRow.registry,
            id: 43,
            roleId: 1003,
            flags: 257,
            updatedAt: new Date("2026-07-04T03:00:00.000Z"),
          },
          entityName: "Binance, Global",
          protocolName: null,
          roleCode: "cex_hot_wallet",
        },
      ],
      metricGroupMatches: [
        {
          id: 5,
          metricGroupCode: "btc_cex_flow_boundary",
          metricGroupName: "BTC CEX flow boundary",
          chainCode: "btc",
          minConfidence: 80,
          requireMetricEligible: true,
        },
      ],
      secondaryRoles: [{ roleId: 1003, roleCode: "cex_hot_wallet" }],
      resolverPreview: {
        chainCode: "btc",
        normalizedAddress: "bc1qcanonical",
        prefixCode: 18,
        payloadHex: "001122",
        activeLabel: true,
        validFromBlock: 800000,
        validToBlock: null,
      },
    });

    expect(payload).toMatchObject({
      ...REGISTRY_DETAIL_EXPORT_API_CONTRACT,
      evidencePayloadIncluded: false,
      sourceDocumentTextIncluded: false,
      approvalEventPayloadsIncluded: false,
      registry: {
        registryId: 42,
        chainCode: "btc",
        normalizedAddress: "bc1qcanonical",
        metadataKeys: ["candidateId", "source_role_label"],
      },
      dictionary: {
        entity: { id: 7, code: "binance", name: "Binance, Global" },
        role: { id: 1002, code: "cex_cold_wallet", name: "CEX cold wallet" },
        category: { id: 3, code: "cex_hot_cold", name: "CEX hot/cold" },
      },
      provenance: {
        sourceBatch: {
          id: 12,
          status: "committed",
          batchHash: "hash-batch",
        },
        primarySourceJob: {
          id: 11,
          status: "archived",
        },
        primarySourceDocument: {
          id: 81,
          extractedTextLength: 59,
          metadataKeys: ["capturedUrl"],
        },
        provenanceCandidateId: 31,
      },
      metricGroupMatches: [
        {
          id: 5,
          code: "btc_cex_flow_boundary",
          requireMetricEligible: true,
        },
      ],
      evidence: [
        {
          id: 71,
          payloadKeys: ["rawAddressExcerpt", "source_role_label"],
        },
      ],
      approvalEvents: [
        {
          id: 91,
          metadataKeys: ["batchHash"],
          beforeKeys: ["candidateStatus"],
          afterKeys: ["registryId"],
        },
      ],
      related: {
        candidates: [{ id: 31, candidateStatus: "approved" }],
        discoveryJobs: [{ id: 101, discoveryType: "tx_graph_scanner" }],
        registryRows: [{ registryId: 43, role: { id: 1003, code: "cex_hot_wallet" } }],
      },
      policy: {
        registryRowsAreCanonicalPostgresTruth: true,
        rocksDbIsCompiledArtifactOnly: true,
        rawEvidencePayloadsExcludedByDefault: true,
        sourceDocumentTextExcludedByDefault: true,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("secret evidence body");
    expect(JSON.stringify(payload)).not.toContain("raw source document body");
  });
});
