import { describe, expect, it } from "vitest";

import { buildRegistryResolverHref, extractRegistryCandidateId, pickRegistryResolverBlock } from "@/lib/mqchain/registry-detail";

describe("registry detail helpers", () => {
  it("extracts positive integer candidate ids from registry metadata", () => {
    expect(extractRegistryCandidateId({ candidateId: 42 })).toBe(42);
    expect(extractRegistryCandidateId({ candidateId: "42" })).toBe(42);
  });

  it("ignores missing or unsafe candidate ids", () => {
    expect(extractRegistryCandidateId(null)).toBeNull();
    expect(extractRegistryCandidateId({ candidateId: 0 })).toBeNull();
    expect(extractRegistryCandidateId({ candidateId: "12.5" })).toBeNull();
    expect(extractRegistryCandidateId({ candidateId: "9007199254740993" })).toBeNull();
  });

  it("builds resolver links for registry rows", () => {
    expect(buildRegistryResolverHref({
      chainCode: "btc",
      normalizedAddress: "bc1q-test/address",
      blockNumber: 840000,
      metricGroupCode: "btc_cex_flow_boundary",
    })).toBe("/mqchain/resolver?chainCode=btc&address=bc1q-test%2Faddress&blockNumber=840000&metricGroupCode=btc_cex_flow_boundary");
  });

  it("picks an in-range resolver block for historical rows", () => {
    expect(pickRegistryResolverBlock({ validFromBlock: 100, firstSeenBlock: 50, validToBlock: 200 })).toBe(100);
    expect(pickRegistryResolverBlock({ firstSeenBlock: 50, validToBlock: 200 })).toBe(50);
    expect(pickRegistryResolverBlock({ validToBlock: 200 })).toBe(200);
    expect(pickRegistryResolverBlock({})).toBeNull();
  });
});
