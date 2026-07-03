import { describe, expect, it } from "vitest";

import { buildDictionaryInventory } from "@/lib/mqchain/dictionary-overview";

describe("dictionary overview", () => {
  it("builds operator inventory rows with active counts and metric rule counts", () => {
    const rows = buildDictionaryInventory({
      entities: [{ isActive: true }, { isActive: false }],
      protocols: [{ isActive: true }],
      roles: [{ isActive: true }, { isActive: true }, { isActive: false }],
      categories: [],
      prefixes: [{ isActive: false }],
      metricGroups: [{ isActive: true }, { isActive: false }],
      metricGroupRules: [{}, {}, {}],
    });

    expect(rows.map((row) => row.key)).toEqual([
      "entities",
      "protocols",
      "roles",
      "categories",
      "key_prefixes",
      "metric_groups",
    ]);
    expect(rows.find((row) => row.key === "entities")).toMatchObject({ total: 2, active: 1 });
    expect(rows.find((row) => row.key === "roles")).toMatchObject({ total: 3, active: 2 });
    expect(rows.find((row) => row.key === "metric_groups")).toMatchObject({
      href: "/mqchain/metric-groups",
      total: 2,
      active: 1,
      ruleCount: 3,
    });
  });
});
