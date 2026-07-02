import { describe, expect, it } from "vitest";

import { FLAG_BITS, setFlag } from "@/lib/mqchain/flags";
import { buildMetricGroupCompilePreviewManifest, filterMetricGroupPreviewMembers } from "@/lib/mqchain/metric-group-preview";
import { matchesMetricGroupRule, matchingMetricGroupsForRow } from "@/lib/mqchain/metric-rules";
import { buildMetricGroupRule, createMetricGroupRuleSchema, createMetricGroupSchema, parseMetricGroupRuleList } from "@/lib/mqchain/validators/metric-group";

describe("metric group rules", () => {
  it("matches eligible CEX flow rows", () => {
    const flags = setFlag(0, FLAG_BITS.metricEligible);

    expect(
      matchesMetricGroupRule(
        {
          roleCode: "cex_hot_wallet",
          categoryCode: "cex_hot_cold",
          entityCode: "binance",
          confidenceScore: 90,
          flags,
        },
        {
          includeRoles: ["cex_hot_wallet", "cex_cold_wallet"],
          minConfidence: 70,
          requireMetricEligible: true,
        },
      ),
    ).toBe(true);
  });

  it("excludes non-eligible rows", () => {
    expect(
      matchesMetricGroupRule(
        {
          roleCode: "cex_fee_wallet",
          categoryCode: "cex_hot_cold",
          entityCode: "binance",
          confidenceScore: 95,
          flags: 0,
        },
        {
          includeRoles: ["cex_fee_wallet"],
          excludeRoles: ["cex_fee_wallet"],
          requireMetricEligible: true,
        },
      ),
    ).toBe(false);
  });

  it("builds metric group rules from operator input", () => {
    const input = createMetricGroupSchema.parse({
      metricGroupCode: "btc_cex_flow_boundary",
      metricGroupName: "BTC CEX Flow Boundary",
      chainCode: "btc",
      minConfidence: "75",
      requireMetricEligible: "true",
      includeRoles: "cex_hot_wallet\ncex_cold_wallet, cex_por_cold_wallet",
      excludeRoles: "cex_fee_wallet",
      ruleRequireMetricEligible: "true",
    });

    expect(parseMetricGroupRuleList(input.includeRoles)).toEqual([
      "cex_hot_wallet",
      "cex_cold_wallet",
      "cex_por_cold_wallet",
    ]);
    expect(buildMetricGroupRule(input)).toEqual({
      includeRoles: ["cex_hot_wallet", "cex_cold_wallet", "cex_por_cold_wallet"],
      excludeRoles: ["cex_fee_wallet"],
      minConfidence: 75,
      requireMetricEligible: true,
    });
  });

  it("prevents catch-all metric group rules", () => {
    expect(() =>
      createMetricGroupSchema.parse({
        metricGroupCode: "bad_group",
        metricGroupName: "Bad Group",
        includeRoles: "",
      }),
    ).toThrow("At least one include");
  });

  it("builds appended metric group rules from operator input", () => {
    const input = createMetricGroupRuleSchema.parse({
      metricGroupId: "7",
      includeCategories: "cex_reserve",
      excludeRoles: "cex_deposit_wallet",
      ruleMinConfidence: "85",
      ruleRequireMetricEligible: "true",
    });

    expect(buildMetricGroupRule({ ...input, minConfidence: 70 })).toEqual({
      includeCategories: ["cex_reserve"],
      excludeRoles: ["cex_deposit_wallet"],
      minConfidence: 85,
      requireMetricEligible: true,
    });
  });

  it("returns metric groups matched by a registry row", () => {
    const flags = setFlag(0, FLAG_BITS.metricEligible);
    const matches = matchingMetricGroupsForRow(
      {
        roleCode: "cex_cold_wallet",
        categoryCode: "cex_hot_cold",
        entityCode: "coinbase",
        confidenceScore: 82,
        flags,
      },
      [
        {
          id: 1,
          metricGroupCode: "btc_cex_flow_boundary",
          metricGroupName: "BTC CEX Flow Boundary",
          minConfidence: 70,
          requireMetricEligible: true,
          rules: [{ includeRoles: ["cex_cold_wallet"] }],
        },
        {
          id: 2,
          metricGroupCode: "protocol_graph",
          metricGroupName: "Protocol Graph",
          minConfidence: 70,
          requireMetricEligible: false,
          rules: [{ includeRoles: ["protocol_factory"] }],
        },
      ],
    );

    expect(matches.map((group) => group.metricGroupCode)).toEqual(["btc_cex_flow_boundary"]);
  });

  it("previews active metric group members within chain scope only", () => {
    const flags = setFlag(0, FLAG_BITS.metricEligible);
    const group = {
      id: 1,
      metricGroupCode: "btc_cex_flow_boundary",
      metricGroupName: "BTC CEX Flow Boundary",
      chainCode: "btc",
      minConfidence: 70,
      requireMetricEligible: true,
    };
    const rows = [
      {
        registry: { id: 1, chainCode: "btc", normalizedAddress: "bc1q1", confidenceScore: 90, qualityTier: 3, flags, isActive: true },
        entity: { entityCode: "binance", entityName: "Binance" },
        role: { roleCode: "cex_cold_wallet" },
        category: { categoryCode: "cex_hot_cold" },
      },
      {
        registry: { id: 2, chainCode: "ethereum", normalizedAddress: "0xabc", confidenceScore: 95, qualityTier: 3, flags, isActive: true },
        entity: { entityCode: "binance", entityName: "Binance" },
        role: { roleCode: "cex_cold_wallet" },
        category: { categoryCode: "cex_hot_cold" },
      },
      {
        registry: { id: 3, chainCode: "btc", normalizedAddress: "bc1qold", confidenceScore: 99, qualityTier: 3, flags, isActive: false },
        entity: { entityCode: "binance", entityName: "Binance" },
        role: { roleCode: "cex_cold_wallet" },
        category: { categoryCode: "cex_hot_cold" },
      },
    ];

    const members = filterMetricGroupPreviewMembers(group, [{ includeRoles: ["cex_cold_wallet"] }], rows);

    expect(members.map((row) => row.registry.id)).toEqual([1]);
  });

  it("builds metric group compile preview manifests", () => {
    const flags = setFlag(0, FLAG_BITS.metricEligible);
    const manifest = buildMetricGroupCompilePreviewManifest({
      group: {
        id: 7,
        metricGroupCode: "btc_cex_reserve_boundary",
        metricGroupName: "BTC CEX Reserve Boundary",
        chainCode: "btc",
        minConfidence: 80,
        requireMetricEligible: true,
      },
      rules: [{ includeRoles: ["cex_cold_wallet"] }],
      focusedRegistryId: 11,
      members: [
        {
          registry: { id: 11, chainCode: "btc", normalizedAddress: "bc1q1", confidenceScore: 90, qualityTier: 3, flags, isActive: true },
          entity: { entityCode: "coinbase", entityName: "Coinbase" },
          role: { roleCode: "cex_cold_wallet" },
          category: { categoryCode: "cex_hot_cold" },
        },
      ],
    });

    expect(manifest).toMatchObject({
      artifactType: "metric_group_preview",
      artifactStatus: "preview_only",
      metricGroupCode: "btc_cex_reserve_boundary",
      chainCode: "btc",
      rowCount: 1,
      registryIds: [11],
      focusedRegistryId: 11,
      focusedRegistryIncluded: true,
      ruleCount: 1,
    });
    expect(manifest.distributions.roles).toEqual([{ label: "cex_cold_wallet", count: 1 }]);
  });

  it("records when a focused registry row is outside the preview", () => {
    const manifest = buildMetricGroupCompilePreviewManifest({
      group: {
        id: 7,
        metricGroupCode: "btc_cex_reserve_boundary",
        metricGroupName: "BTC CEX Reserve Boundary",
        chainCode: "btc",
        minConfidence: 80,
        requireMetricEligible: true,
      },
      rules: [{ includeRoles: ["cex_cold_wallet"] }],
      focusedRegistryId: 99,
      members: [],
    });

    expect(manifest).toMatchObject({
      rowCount: 0,
      registryIds: [],
      focusedRegistryId: 99,
      focusedRegistryIncluded: false,
    });
  });
});
