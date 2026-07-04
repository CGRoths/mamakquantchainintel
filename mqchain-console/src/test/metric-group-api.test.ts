import { describe, expect, it } from "vitest";

import { buildMetricGroupListApiResponse, METRIC_GROUP_LIST_API_CONTRACT } from "@/lib/mqchain/metric-group-api";

describe("metric group API payloads", () => {
  it("exports metric group catalog rows without mutating dictionaries or exposing full rule JSON", () => {
    const payload = buildMetricGroupListApiResponse({
      query: {
        page: 1,
        pageSize: 25,
        filters: {
          active: "active",
          chain: "btc",
        },
      },
      total: 1,
      totalPages: 1,
      rows: [
        {
          id: 7,
          metricGroupCode: "btc_cex_flow_boundary",
          metricGroupName: "BTC CEX Flow Boundary",
          chainCode: "btc",
          minConfidence: 80,
          requireMetricEligible: true,
          description: "Countable BTC CEX flow boundary addresses.",
          isActive: true,
          createdAt: new Date("2026-07-04T02:00:00.000Z"),
          updatedAt: new Date("2026-07-04T03:00:00.000Z"),
          rules: [
            {
              id: 50,
              metricGroupId: 7,
              ruleJson: {
                includeRoles: ["cex_hot_wallet", "cex_cold_wallet"],
                excludeEntities: ["internal_test_entity"],
                minConfidence: 80,
                requireMetricEligible: true,
                privateOperatorNote: "do not export this raw note",
              },
              createdAt: new Date("2026-07-04T02:30:00.000Z"),
            },
          ],
        },
      ],
    });

    expect(payload).toMatchObject({
      ...METRIC_GROUP_LIST_API_CONTRACT,
      mutationAllowed: false,
      dictionaryWriteAllowed: false,
      registryWriteAllowed: false,
      kvWriteAllowed: false,
      fullRuleJsonIncluded: false,
      pagination: {
        totalRows: 1,
        returnedRows: 1,
      },
      rows: [
        {
          id: 7,
          code: "btc_cex_flow_boundary",
          chainCode: "btc",
          minConfidence: 80,
          requireMetricEligible: true,
          isActive: true,
          ruleCount: 1,
          rules: [
            {
              id: 50,
              ruleKeys: ["excludeEntities", "includeRoles", "minConfidence", "privateOperatorNote", "requireMetricEligible"],
              sections: [
                {
                  key: "includeRoles",
                  label: "Include roles",
                  values: ["cex_hot_wallet", "cex_cold_wallet"],
                  intent: "include",
                },
                {
                  key: "excludeEntities",
                  label: "Exclude entities",
                  values: ["internal_test_entity"],
                  intent: "exclude",
                },
                {
                  key: "policy",
                  label: "Policy",
                  values: ["min confidence 80", "metric eligible required"],
                  intent: "policy",
                },
              ],
            },
          ],
          hrefs: {
            membersApi: "/api/mqchain/metric-groups/btc_cex_flow_boundary/members",
            membersCsv: "/api/mqchain/metric-groups/btc_cex_flow_boundary/members?format=csv",
            page: "/mqchain/metric-groups?group=btc_cex_flow_boundary",
          },
        },
      ],
      policy: {
        catalogOnly: true,
        membershipRowsLiveOnMembersEndpoint: true,
        previewDoesNotWriteRegistryOrKv: true,
        externalWorkerMustCompileKvArtifact: true,
        fullRuleJsonExcludedByDefault: true,
      },
    });
    expect(payload.rows[0]).not.toHaveProperty("members");
    expect(payload.rows[0].rules[0]).not.toHaveProperty("ruleJson");
    expect(JSON.stringify(payload)).not.toContain("do not export this raw note");
  });
});
