import { describe, expect, it } from "vitest";

import {
  buildDictionarySnapshotApiResponse,
  buildDictionaryVersionHistoryApiResponse,
  DICTIONARY_SNAPSHOT_API_CONTRACT,
  DICTIONARY_VERSION_HISTORY_API_CONTRACT,
} from "@/lib/mqchain/dictionary-api";
import { dictionaryVersionListFilterSchema } from "@/lib/mqchain/list-filters";
import { buildDictionaryVersionPayload } from "@/lib/mqchain/services/dictionary-service";
import { hashJson } from "@/lib/mqchain/services/service-utils";
import { dictionarySnapshotScopeSchema } from "@/lib/mqchain/validators/dictionary";

const updatedAt = new Date("2026-07-04T02:00:00.000Z");
const createdAt = new Date("2026-07-04T03:00:00.000Z");

const dictionaries = {
  categories: [
    {
      categoryId: 10,
      categoryCode: "cex",
      categoryName: "Exchange",
      parentCategoryId: null,
      domainCode: "exchange",
      metricDomain: "cex_flow",
      description: "Centralized exchange labels",
      isActive: true,
      updatedAt,
    },
    {
      categoryId: 11,
      categoryCode: "old",
      categoryName: "Old Category",
      parentCategoryId: null,
      domainCode: null,
      metricDomain: null,
      description: null,
      isActive: false,
      updatedAt,
    },
  ],
  entities: [
    {
      id: 1,
      entityCode: "binance",
      entityName: "Binance",
      entityType: "cex",
      categoryId: 10,
      websiteUrl: "https://binance.com",
      description: null,
      isActive: true,
      updatedAt,
    },
  ],
  protocols: [
    {
      id: 2,
      entityId: 1,
      protocolCode: "binance_cex",
      protocolName: "Binance CEX",
      protocolType: "exchange",
      chainScope: ["btc", "ethereum"],
      description: null,
      isActive: true,
      updatedAt,
    },
  ],
  prefixes: [
    {
      prefixCode: 60,
      chainCode: "ethereum",
      chainName: "Ethereum",
      chainFamily: "evm",
      addressFamily: "evm_20",
      codec: "hex",
      payloadLen: 20,
      evmChainId: 1,
      description: null,
      isActive: true,
      updatedAt,
    },
  ],
  roles: [
    {
      roleId: 1002,
      roleCode: "cex_hot_wallet",
      roleName: "CEX Hot Wallet",
      categoryId: 10,
      roleGroup: "cex",
      metricUsageDefault: "cex_flow",
      boundaryClass: "exchange_boundary",
      defaultQualityTier: 3,
      defaultFlags: 1,
      description: null,
      isActive: true,
      updatedAt,
    },
  ],
  metricGroups: [
    {
      id: 5,
      metricGroupCode: "btc_cex_flow_boundary",
      metricGroupName: "BTC CEX Flow Boundary",
      chainCode: "btc",
      minConfidence: 70,
      requireMetricEligible: true,
      description: "BTC exchange boundary universe",
      isActive: true,
      updatedAt,
    },
    {
      id: 6,
      metricGroupCode: "inactive_group",
      metricGroupName: "Inactive Group",
      chainCode: null,
      minConfidence: 0,
      requireMetricEligible: false,
      description: null,
      isActive: false,
      updatedAt,
    },
  ],
  metricGroupRules: [
    {
      id: 50,
      metricGroupId: 5,
      ruleJson: { include: { roleCodes: ["cex_hot_wallet"] } },
      createdAt,
    },
    {
      id: 51,
      metricGroupId: 6,
      ruleJson: { include: { roleCodes: ["inactive"] } },
      createdAt,
    },
  ],
};

describe("dictionary snapshot API payloads", () => {
  it("exports active compiler dictionaries with policy and deterministic hash", () => {
    const payload = buildDictionarySnapshotApiResponse({
      scope: "active",
      dictionaries,
      latestVersion: {
        versionHash: "dict-version-1",
        summary: { reason: "seed" },
        createdAt,
      },
    });

    expect(payload).toMatchObject({
      ...DICTIONARY_SNAPSHOT_API_CONTRACT,
      mutationAllowed: false,
      dictionaryWriteAllowed: false,
      scope: "active",
      latestRecordedVersion: {
        versionHash: "dict-version-1",
        summary: { reason: "seed" },
        createdAt: "2026-07-04T03:00:00.000Z",
      },
      counts: {
        categories: 1,
        entities: 1,
        protocols: 1,
        keyPrefixes: 1,
        roles: 1,
        metricGroups: 1,
        metricGroupRules: 1,
        totalRows: 7,
      },
      sourceCounts: {
        categories: { total: 2, active: 1 },
        metricGroups: { total: 2, active: 1 },
        metricGroupRules: { total: 2 },
      },
      snapshot: {
        categories: [{ categoryCode: "cex" }],
        metricGroups: [{ metricGroupCode: "btc_cex_flow_boundary" }],
        metricGroupRules: [{ id: 50 }],
      },
      policy: {
        dictionarySnapshotIsReadOnly: true,
        rolesDefineAddressFunction: true,
        categoriesDefineTaxonomy: true,
        metricGroupsAreSeparateFromCategories: true,
        keyPrefixesDefineCompactResolverEncoding: true,
      },
    });
    expect(payload.exportHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(payload)).not.toContain("inactive_group");
  });

  it("can include inactive historical dictionary rows when requested", () => {
    const payload = buildDictionarySnapshotApiResponse({
      scope: "all",
      dictionaries,
      latestVersion: null,
    });

    expect(payload.counts).toMatchObject({
      categories: 2,
      metricGroups: 2,
      metricGroupRules: 2,
      totalRows: 10,
    });
    expect(payload.snapshot.categories.map((category) => category.categoryCode)).toEqual(["cex", "old"]);
    expect(payload.snapshot.metricGroupRules.map((rule) => rule.id)).toEqual([50, 51]);
  });

  it("validates dictionary snapshot scope", () => {
    expect(dictionarySnapshotScopeSchema.parse(undefined)).toBe("active");
    expect(dictionarySnapshotScopeSchema.parse("all")).toBe("all");
    expect(() => dictionarySnapshotScopeSchema.parse("inactive")).toThrow();
  });

  it("exports dictionary version history without full summary bodies or writes", () => {
    const payload = buildDictionaryVersionHistoryApiResponse({
      query: {
        page: 1,
        pageSize: 25,
        filters: { reason: "metric_group_created" },
      },
      total: 1,
      totalPages: 1,
      rows: [
        {
          version: {
            id: 9,
            versionHash: "abcdef123456",
            summary: {
              reason: "metric_group_created",
              counts: {
                categories: 17,
                entities: 31,
                protocols: 12,
                prefixes: 11,
                roles: 58,
                metricGroups: 3,
                metricGroupRules: 4,
              },
              rawDictionaryDiff: "large internal diff that must stay out of worker export",
            },
            createdBy: "00000000-0000-0000-0000-000000000001",
            createdAt,
          },
          creatorEmail: "owner@mamakquant.local",
          creatorName: "Owner",
        },
      ],
    });

    expect(payload).toMatchObject({
      ...DICTIONARY_VERSION_HISTORY_API_CONTRACT,
      mutationAllowed: false,
      dictionaryWriteAllowed: false,
      registryWriteAllowed: false,
      kvWriteAllowed: false,
      fullSummaryIncluded: false,
      pagination: {
        totalRows: 1,
        returnedRows: 1,
      },
      rows: [
        {
          id: 9,
          versionHash: "abcdef123456",
          reason: "metric_group_created",
          summaryKeys: ["counts", "rawDictionaryDiff", "reason"],
          counts: {
            categories: 17,
            entities: 31,
            protocols: 12,
            keyPrefixes: 11,
            roles: 58,
            metricGroups: 3,
            metricGroupRules: 4,
          },
          createdBy: {
            email: "owner@mamakquant.local",
            name: "Owner",
          },
          currentSnapshotApi: "/api/mqchain/dictionaries?scope=all",
        },
      ],
      canonicalWrites: {
        dictionaryRowsCreated: 0,
        registryRowsCreated: 0,
        kvBuildsCreated: 0,
      },
      policy: {
        dictionaryVersionsAreReadOnly: true,
        dictionaryVersionHashControlsCompilerHandoff: true,
        metricGroupRulesArePartOfDictionaryVersion: true,
        fullVersionSummaryExcludedByDefault: true,
        rocksDbMustNotBecomeDictionaryTruth: true,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("large internal diff");
  });

  it("includes every editable dictionary family field in the version hash payload", () => {
    const payload = buildDictionaryVersionPayload(dictionaries as never);

    expect(payload.categories).toEqual(expect.arrayContaining([expect.objectContaining({ code: "cex", description: "Centralized exchange labels" })]));
    expect(payload.entities).toEqual(expect.arrayContaining([expect.objectContaining({ code: "binance", websiteUrl: "https://binance.com", description: null })]));
    expect(payload.protocols).toEqual(expect.arrayContaining([expect.objectContaining({ code: "binance_cex", description: null })]));
    expect(payload.prefixes).toEqual(expect.arrayContaining([expect.objectContaining({ chainCode: "ethereum", chainName: "Ethereum", evmChainId: 1, description: null })]));
    expect(payload.roles).toEqual(expect.arrayContaining([expect.objectContaining({ code: "cex_hot_wallet", name: "CEX Hot Wallet", qualityTier: 3, description: null })]));
    expect(payload.metricGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "btc_cex_flow_boundary", name: "BTC CEX Flow Boundary", description: "BTC exchange boundary universe" }),
      ]),
    );
    expect(payload.metricGroupRules).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 50, ruleJson: { include: { roleCodes: ["cex_hot_wallet"] } } })]),
    );

    const baseHash = hashJson(payload);
    const changed = {
      ...dictionaries,
      roles: dictionaries.roles.map((role) =>
        role.roleCode === "cex_hot_wallet" ? { ...role, defaultQualityTier: 6 } : role,
      ),
      prefixes: dictionaries.prefixes.map((prefix) =>
        prefix.chainCode === "ethereum" ? { ...prefix, evmChainId: 11155111 } : prefix,
      ),
      metricGroups: dictionaries.metricGroups.map((group) =>
        group.metricGroupCode === "btc_cex_flow_boundary" ? { ...group, metricGroupName: "BTC CEX Flow Universe" } : group,
      ),
    };

    expect(hashJson(buildDictionaryVersionPayload(changed as never))).not.toBe(baseHash);
  });

  it("validates dictionary version history filters", () => {
    expect(
      dictionaryVersionListFilterSchema.parse({
        page: "2",
        pageSize: "25",
        reason: " metric_group_created ",
        actor: " owner ",
        sort: "reason",
      }),
    ).toMatchObject({
      page: 2,
      pageSize: 25,
      reason: "metric_group_created",
      actor: "owner",
      sort: "reason",
    });
    expect(() => dictionaryVersionListFilterSchema.parse({ sort: "mutable" })).toThrow();
  });
});
