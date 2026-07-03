import { describe, expect, it } from "vitest";

import { buildCexFlowMetricsSummary, classifyCexFlowSides, type CexFlowSideLabel } from "@/lib/mqchain/cex-flow";

function label(entityId: number | null, matched = entityId !== null): CexFlowSideLabel {
  return {
    address: `addr-${entityId ?? "unknown"}`,
    normalizedAddress: `addr-${entityId ?? "unknown"}`,
    matched,
    entityId,
    entityCode: entityId ? `entity_${entityId}` : null,
    entityName: entityId ? `Entity ${entityId}` : null,
    roleCode: entityId ? "cex_hot_wallet" : null,
  };
}

describe("classifyCexFlowSides", () => {
  it("classifies inflow when only outputs contain CEX labels", () => {
    expect(classifyCexFlowSides([label(null, false)], [label(1)])).toBe("cex_inflow");
  });

  it("classifies outflow when only inputs contain CEX labels", () => {
    expect(classifyCexFlowSides([label(1)], [label(null, false)])).toBe("cex_outflow");
  });

  it("classifies internal movement when both sides share one CEX entity", () => {
    expect(classifyCexFlowSides([label(1)], [label(1)])).toBe("internal_movement");
  });

  it("classifies inter-exchange flow when CEX entities differ", () => {
    expect(classifyCexFlowSides([label(1)], [label(2)])).toBe("inter_exchange_flow");
  });

  it("ignores transactions without matched CEX labels", () => {
    expect(classifyCexFlowSides([label(null, false)], [label(null, false)])).toBe("ignore");
  });

  it("summarizes metric boundary addresses separately from external addresses", () => {
    const summary = buildCexFlowMetricsSummary(
      [
        { ...label(1), normalizedAddress: "cex-a", roleCode: "cex_hot_wallet" },
        { ...label(null, false), normalizedAddress: "external-a" },
      ],
      [
        { ...label(1), normalizedAddress: "cex-a", roleCode: "cex_cold_wallet" },
        { ...label(2), normalizedAddress: "cex-b", roleCode: "cex_hot_wallet" },
      ],
    );

    expect(summary.classification).toBe("inter_exchange_flow");
    expect(summary.countableBoundaryAddresses).toBe(2);
    expect(summary.externalAddresses).toBe(1);
    expect(summary.entityCodes).toEqual(["entity_1", "entity_2"]);
    expect(summary.input).toMatchObject({
      totalAddresses: 2,
      matchedAddresses: 1,
      unmatchedAddresses: 1,
      roles: { cex_hot_wallet: 1 },
    });
    expect(summary.output.roles).toEqual({
      cex_cold_wallet: 1,
      cex_hot_wallet: 1,
    });
    expect(summary.metricPolicy).toEqual({
      usesMetricGroupMembership: true,
      countsMatchedBoundaryAddressesOnly: true,
    });
  });
});
