import { describe, expect, it } from "vitest";

import { assertStableCatalogIds, loadAndValidateU1Catalog, parseU1Csv } from "@/lib/mqchain/catalog/u1";

describe("U1 catalog governance", () => {
  it("loads every required catalog and produces a reproducible dictionary version", async () => {
    const first = await loadAndValidateU1Catalog();
    const second = await loadAndValidateU1Catalog();

    expect(first.dictionaryVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(second.dictionaryVersion).toBe(first.dictionaryVersion);
    expect(first.rows.get("chain_networks.csv")).toHaveLength(48);
    expect(first.rows.get("address_codecs.csv")).toHaveLength(23);
    expect(first.rows.get("address_namespaces.csv")).toHaveLength(47);
    const ranges = first.rows.get("id_ranges.csv") ?? [];
    expect(ranges.find(row => row.range_code === "u1_namespaces")?.next_id).toBe("48");
    const capabilities = first.rows.get("chain_capabilities.csv") ?? [];
    expect(capabilities.filter(row => row.support_tier === "1").map(row => Number(row.chain_network_id))).toEqual([1, 2, 4, 7, 8]);
    expect(capabilities.filter(row => row.support_tier === "2").map(row => Number(row.chain_network_id))).toEqual([3, 5, 6, 9, 14]);
    expect(capabilities.every(row => row.runtime_readiness === "not_ready")).toBe(true);
    expect(capabilities.some(row => ["test_ready", "production_ready"].includes(row.mqnode_parser_status))).toBe(false);
    expect(capabilities.some(row => ["test_ready", "production_ready"].includes(row.metric_status))).toBe(false);
  });

  it("rejects duplicate IDs, uppercase codes, and uint16 codec overflow", () => {
    const header = "address_codec_id,codec_code,codec_name,payload_rule,status,source_id\n";
    expect(() => parseU1Csv("address_codecs.csv", `${header}1,evm20,EVM,exact:20,test_ready,1\n1,other,Other,exact:20,planned,1\n`)).toThrow(/duplicate/);
    expect(() => parseU1Csv("address_codecs.csv", `${header}1,EVM20,EVM,exact:20,test_ready,1\n`)).toThrow(/lowercase canonical code/);
    expect(() => parseU1Csv("address_codecs.csv", `${header}65536,evm20,EVM,exact:20,test_ready,1\n`)).toThrow(/exceeds 65535/);
  });

  it("fails closed when a checked-in ID would renumber a live code", () => {
    expect(() => assertStableCatalogIds("entity", [{ id: 1, code: "binance" }], [{ id: 2, code: "binance" }])).toThrow(/already assigned ID 2/);
    expect(() => assertStableCatalogIds("entity", [{ id: 1, code: "binance" }], [{ id: 1, code: "coinbase" }])).toThrow(/already assigned to coinbase/);
  });
});
