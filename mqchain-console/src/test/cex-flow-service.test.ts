import { describe, expect, it } from "vitest";

import { normalizeAddress } from "@/lib/mqchain/address/normalize";
import { classifyCexTransactionFlow } from "@/lib/mqchain/services/cex-flow-service";
import { getAddressResolver, type AddressResolver, type ResolverLabel } from "@/lib/mqchain/services/resolver-service";

function fakeLabel(address: string): ResolverLabel {
  const isCoinbase = address.includes("coinbase");
  return {
    registry: { confidenceScore: 95, flags: 0 } as ResolverLabel["registry"],
    entity: {
      id: isCoinbase ? 2 : 1,
      entityCode: isCoinbase ? "coinbase" : "binance",
      entityName: isCoinbase ? "Coinbase" : "Binance",
    } as ResolverLabel["entity"],
    protocol: null,
    role: { roleCode: "cex_hot_wallet" } as ResolverLabel["role"],
    category: null,
    sourceBatch: null,
    evidence: [],
    evidenceSummary: { count: 0, netConfidenceDelta: 0, byType: {}, byTrust: {} },
    status: "active",
    metricEligible: true,
  };
}

const fakeResolver: AddressResolver = {
  async resolveCurrent(chainCode, address) {
    return this.resolveAt(chainCode, address, null);
  },
  async resolveAt(chainCode, address, blockNumber = null) {
    const normalized = normalizeAddress(address, chainCode);
    return { normalized, label: null, currentLabel: null, metricGroupMatch: null, blockNumber };
  },
  async checkMetricGroup(chainCode, address, metricGroupCode, blockNumber = null) {
    const normalized = normalizeAddress(address, chainCode);
    const matched = address.startsWith("cex");
    const label = matched ? fakeLabel(address) : null;
    return { normalized, label, currentLabel: label, metricGroupMatch: matched, metricGroupCode, blockNumber };
  },
};

describe("classifyCexTransactionFlow", () => {
  it("uses the injected resolver abstraction for metric group checks", async () => {
    const result = await classifyCexTransactionFlow(
      {
        chainCode: "btc",
        inputAddresses: ["external_wallet"],
        outputAddresses: ["cex_binance_hot"],
        metricGroupCode: "btc_cex_flow_boundary",
      },
      fakeResolver,
    );

    expect(result.classification).toBe("cex_inflow");
    expect(result.outputs[0]).toMatchObject({
      matched: true,
      entityCode: "binance",
      roleCode: "cex_hot_wallet",
    });
    expect(result.metricsSummary).toMatchObject({
      countableBoundaryAddresses: 1,
      externalAddresses: 1,
      entityCodes: ["binance"],
      metricPolicy: {
        usesMetricGroupMembership: true,
        countsMatchedBoundaryAddressesOnly: true,
      },
    });
  });
});

describe("getAddressResolver", () => {
  it("keeps RocksDB as an explicit unwired external backend", () => {
    expect(() => getAddressResolver("rocksdb")).toThrow(/external to Vercel/);
  });
});
