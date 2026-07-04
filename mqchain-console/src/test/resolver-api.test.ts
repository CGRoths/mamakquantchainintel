import { describe, expect, it } from "vitest";

import { normalizeAddress } from "@/lib/mqchain/address/normalize";
import { buildCexFlowMetricsSummary, type CexFlowSideLabel } from "@/lib/mqchain/cex-flow";
import { buildMetricGroupMembershipApiResponse, buildMetricGroupMembershipCsv, METRIC_GROUP_MEMBERSHIP_API_CONTRACT } from "@/lib/mqchain/metric-group-api";
import { buildCexFlowApiResponse, buildResolverApiResponse, RESOLVER_API_CONTRACT } from "@/lib/mqchain/resolver-api";
import type { ResolverLabel, ResolverOutput } from "@/lib/mqchain/services/resolver-service";
import {
  cexFlowApiRequestSchema,
  metricGroupMembershipApiQuerySchema,
  RESOLVER_API_MAX_TRANSACTION_ADDRESSES,
  resolverApiQuerySchema,
} from "@/lib/mqchain/validators/resolver-api";

function metricLabel(overrides: Partial<ResolverLabel> = {}): ResolverLabel {
  return {
    registry: {
      id: 44,
      chainCode: "ethereum",
      normalizedAddress: "0x000000000000000000000000000000000000dead",
      rawAddress: "0x000000000000000000000000000000000000dEaD",
      prefixCode: 60,
      payloadHex: "000000000000000000000000000000000000dead",
      entityId: 1,
      protocolId: null,
      roleId: 1020,
      confidenceScore: 95,
      qualityTier: 3,
      flags: 1,
      labelStatus: 1,
      isActive: true,
      validFromBlock: 100,
      validToBlock: null,
      firstSeenBlock: 100,
      lastSeenBlock: null,
      sourceCandidateId: 7,
      primarySourceJobId: 8,
      approvedBatchId: 9,
      metricUsage: "cex_flow",
      notes: null,
      metadata: {},
      createdAt: new Date("2026-07-04T00:00:00.000Z"),
      updatedAt: new Date("2026-07-04T00:00:00.000Z"),
    } as unknown as ResolverLabel["registry"],
    entity: {
      id: 1,
      entityCode: "binance",
      entityName: "Binance",
      entityType: "cex",
    } as ResolverLabel["entity"],
    protocol: null,
    role: {
      roleId: 1020,
      roleCode: "cex_hot_wallet",
      roleName: "CEX Hot Wallet",
      metricUsageDefault: "cex_flow",
      boundaryClass: "core_boundary",
    } as ResolverLabel["role"],
    category: {
      categoryId: 130,
      categoryCode: "cex_hot_cold",
      categoryName: "CEX Hot Cold",
      metricDomain: "cex_flow",
    } as ResolverLabel["category"],
    sourceBatch: {
      id: 9,
      status: "committed",
      dictionaryVersion: "dict-v1",
      committedAt: new Date("2026-07-04T01:00:00.000Z"),
    } as unknown as ResolverLabel["sourceBatch"],
    evidence: [],
    evidenceSummary: { count: 2, netConfidenceDelta: 15, byType: { official_csv: 1, manual_note: 1 }, byTrust: { official: 1, medium: 1 } },
    status: "active",
    metricEligible: true,
    ...overrides,
  };
}

function side(address: string, matched: boolean, entityCode: string | null): CexFlowSideLabel {
  return {
    address,
    normalizedAddress: address,
    matched,
    entityId: entityCode ? (entityCode === "binance" ? 1 : 2) : null,
    entityCode,
    entityName: entityCode ? entityCode.toUpperCase() : null,
    roleCode: matched ? "cex_hot_wallet" : null,
  };
}

describe("resolver API payloads", () => {
  it("serializes point-in-time resolver output with serving-artifact boundaries", () => {
    const label = metricLabel();
    const currentLabel = metricLabel({
      registry: { ...label.registry, id: 45, validFromBlock: 500 } as ResolverLabel["registry"],
    });
    const result: ResolverOutput = {
      normalized: normalizeAddress("0x000000000000000000000000000000000000dEaD", "ethereum"),
      label,
      currentLabel,
      metricGroupCode: "eth_cex_flow_boundary",
      metricGroupMatch: true,
      blockNumber: 200,
    };

    const payload = buildResolverApiResponse({
      query: {
        chainCode: "ethereum",
        address: "0x000000000000000000000000000000000000dEaD",
        blockNumber: 200,
        metricGroupCode: "eth_cex_flow_boundary",
      },
      result,
    });

    expect(payload).toMatchObject({
      ...RESOLVER_API_CONTRACT,
      mutationAllowed: false,
      registryWriteAllowed: false,
      kvWriteAllowed: false,
      summary: {
        mode: "point_in_time",
        outcome: "active_label",
        timelineDiverged: true,
        metricGroupOutcome: "member",
      },
      label: {
        registryId: 44,
        entity: { code: "binance" },
        role: { code: "cex_hot_wallet", metricUsageDefault: "cex_flow" },
        metricEligible: true,
        sourceBatch: { dictionaryVersion: "dict-v1" },
      },
      metricGroup: {
        code: "eth_cex_flow_boundary",
        match: true,
      },
    });
  });

  it("serializes CEX flow classifications with read-only metric policy", () => {
    const inputs = [side("external-a", false, null)];
    const outputs = [side("cex-a", true, "binance")];
    const metricsSummary = buildCexFlowMetricsSummary(inputs, outputs, "cex_inflow");
    const payload = buildCexFlowApiResponse({
      query: {
        chainCode: "btc",
        blockNumber: 840000,
        metricGroupCode: "btc_cex_flow_boundary",
        inputAddressCount: inputs.length,
        outputAddressCount: outputs.length,
      },
      result: {
        chainCode: "btc",
        metricGroupCode: "btc_cex_flow_boundary",
        blockNumber: 840000,
        classification: "cex_inflow",
        metricsSummary,
        inputs,
        outputs,
      },
    });

    expect(payload).toMatchObject({
      ...RESOLVER_API_CONTRACT,
      query: {
        chainCode: "btc",
        metricGroupCode: "btc_cex_flow_boundary",
        inputAddressCount: 1,
        outputAddressCount: 1,
      },
      flow: {
        classification: "cex_inflow",
        metricsSummary: {
          countableBoundaryAddresses: 1,
          externalAddresses: 1,
          metricPolicy: {
            usesMetricGroupMembership: true,
            countsMatchedBoundaryAddressesOnly: true,
          },
        },
      },
    });
  });

  it("serializes metric group membership exports as read-only Postgres-derived previews", () => {
    const payload = buildMetricGroupMembershipApiResponse({
      query: {
        metricGroupCode: "btc_cex_flow_boundary",
        page: 1,
        pageSize: 1,
      },
      group: {
        id: 7,
        metricGroupCode: "btc_cex_flow_boundary",
        metricGroupName: "BTC CEX Flow Boundary",
        chainCode: "btc",
        minConfidence: 80,
        requireMetricEligible: true,
        isActive: true,
      },
      members: [
        {
          registry: {
            id: 11,
            chainCode: "btc",
            normalizedAddress: "bc1qmember",
            confidenceScore: 95,
            qualityTier: 3,
            flags: 1,
            isActive: true,
          },
          entity: { entityCode: "binance", entityName: "Binance" },
          protocol: null,
          role: { roleCode: "cex_cold_wallet" },
          category: { categoryCode: "cex_hot_cold" },
        },
        {
          registry: {
            id: 12,
            chainCode: "btc",
            normalizedAddress: "bc1qsecond",
            confidenceScore: 90,
            qualityTier: 3,
            flags: 1,
            isActive: true,
          },
          entity: { entityCode: "coinbase", entityName: "Coinbase" },
          protocol: null,
          role: { roleCode: "cex_hot_wallet" },
          category: { categoryCode: "cex_hot_cold" },
        },
      ],
      diagnostics: {
        evaluatedRows: 4,
        memberRows: 2,
        excludedInactive: 1,
        excludedOutOfChainScope: 0,
        excludedMetricIneligible: 1,
        excludedRuleMismatch: 0,
      },
      manifest: { artifactType: "metric_group_preview", registryIds: [11, 12], rowCount: 2 },
      kvManifest: { artifactType: "metric_group_kv", artifactStatus: "pending_external_compile", registryIds: [11, 12], rowCount: 2 },
    });

    expect(payload).toMatchObject({
      ...METRIC_GROUP_MEMBERSHIP_API_CONTRACT,
      mutationAllowed: false,
      registryWriteAllowed: false,
      kvWriteAllowed: false,
      metricGroup: {
        code: "btc_cex_flow_boundary",
        chainCode: "btc",
      },
      pagination: {
        totalMembers: 2,
        returnedMembers: 1,
        totalPages: 2,
      },
      members: [
        {
          registryId: 11,
          chainCode: "btc",
          normalizedAddress: "bc1qmember",
          entity: { code: "binance", name: "Binance" },
          role: { code: "cex_cold_wallet" },
          category: { code: "cex_hot_cold" },
        },
      ],
      policy: {
        postgresIsCanonicalTruth: true,
        membershipIsDerivedFromActiveRegistryRows: true,
        externalWorkerMustCompileKvArtifact: true,
      },
    });
  });

  it("exports metric group membership pages as deterministic worker CSV", () => {
    const csv = buildMetricGroupMembershipCsv({
      query: {
        metricGroupCode: "btc_cex_flow_boundary",
        page: 1,
        pageSize: 2,
      },
      group: {
        id: 7,
        metricGroupCode: "btc_cex_flow_boundary",
        metricGroupName: "BTC CEX Flow Boundary",
        chainCode: "btc",
        minConfidence: 80,
        requireMetricEligible: true,
        isActive: true,
      },
      members: [
        {
          registry: {
            id: 11,
            chainCode: "btc",
            normalizedAddress: "bc1qmember",
            confidenceScore: 95,
            qualityTier: 3,
            flags: 1,
            isActive: true,
          },
          entity: { entityCode: "binance", entityName: "Binance, Global" },
          protocol: null,
          role: { roleCode: "cex_cold_wallet" },
          category: { categoryCode: "cex_hot_cold" },
        },
      ],
      diagnostics: {
        evaluatedRows: 1,
        memberRows: 1,
        excludedInactive: 0,
        excludedOutOfChainScope: 0,
        excludedMetricIneligible: 0,
        excludedRuleMismatch: 0,
      },
      manifest: { artifactType: "metric_group_preview", registryIds: [11], rowCount: 1 },
      kvManifest: { artifactType: "metric_group_kv", artifactStatus: "pending_external_compile", registryIds: [11], rowCount: 1 },
    });

    expect(csv.split("\n")).toEqual([
      "metric_group_code,registry_id,chain_code,normalized_address,entity_code,entity_name,protocol_code,protocol_name,role_code,category_code,confidence_score,quality_tier,flags,source_of_truth,artifact_status,external_compile_required",
      'btc_cex_flow_boundary,11,btc,bc1qmember,binance,"Binance, Global",,,cex_cold_wallet,cex_hot_cold,95,3,1,postgres_registry,preview_only,true',
    ]);
  });
});

describe("resolver API validators", () => {
  it("normalizes resolver query inputs", () => {
    expect(
      resolverApiQuerySchema.parse({
        chainCode: " btc ",
        address: " abc ",
        blockNumber: "840000",
        metricGroupCode: "btc_cex_flow_boundary",
      }),
    ).toEqual({
      chainCode: "btc",
      address: "abc",
      blockNumber: 840000,
      metricGroupCode: "btc_cex_flow_boundary",
    });
  });

  it("caps transaction flow requests for route-handler safety", () => {
    const addresses = Array.from({ length: RESOLVER_API_MAX_TRANSACTION_ADDRESSES }, (_, index) => `addr-${index}`);

    expect(() =>
      cexFlowApiRequestSchema.parse({
        chainCode: "btc",
        inputAddresses: addresses,
        outputAddresses: ["extra"],
      }),
    ).toThrow(/at most 200 total addresses/);
  });

  it("normalizes metric group membership export pagination with a hard cap", () => {
    expect(metricGroupMembershipApiQuerySchema.parse({ page: "2", pageSize: "250" })).toEqual({
      page: 2,
      pageSize: 250,
      format: "json",
    });
    expect(metricGroupMembershipApiQuerySchema.parse({ format: "csv" }).format).toBe("csv");
    expect(() => metricGroupMembershipApiQuerySchema.parse({ pageSize: "5000" })).toThrow();
  });
});
