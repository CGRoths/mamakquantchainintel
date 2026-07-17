import { describe, expect, it } from "vitest";

import {
  assertStableCatalogIds,
  loadAndValidateU1Catalog,
  parseU1Csv,
  validateCanonicalNetworkRows,
  validateCapabilityCoverage,
  validateChainAliasRows,
  validateIdRangeAllocators,
  validateNamespaceCodecCompatibility,
} from "@/lib/mqchain/catalog/u1";

describe("U1 catalog governance", () => {
  it("loads every required catalog and produces a reproducible dictionary version", async () => {
    const first = await loadAndValidateU1Catalog();
    const second = await loadAndValidateU1Catalog();

    expect(first.dictionaryVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(second.dictionaryVersion).toBe(first.dictionaryVersion);
    expect(first.rows.get("chain_networks.csv")).toHaveLength(128);
    expect(first.rows.get("address_codecs.csv")).toHaveLength(59);
    expect(first.rows.get("address_namespaces.csv")).toHaveLength(166);
    expect(first.rows.get("chain_aliases.csv")).toHaveLength(316);
    const ranges = first.rows.get("id_ranges.csv") ?? [];
    expect(ranges.find(row => row.range_code === "u1_networks")?.next_id).toBe("129");
    expect(ranges.find(row => row.range_code === "u1_codecs")?.next_id).toBe("132");
    expect(ranges.find(row => row.range_code === "u1_namespaces")?.next_id).toBe("167");
    expect(ranges.find(row => row.range_code === "u1_chain_aliases")?.next_id).toBe("317");
    const capabilities = first.rows.get("chain_capabilities.csv") ?? [];
    expect(capabilities).toHaveLength(128);
    expect(capabilities.filter(row => row.support_tier === "1").map(row => Number(row.chain_network_id))).toEqual([1, 2, 4, 7, 8]);
    expect(capabilities.filter(row => row.support_tier === "2").map(row => Number(row.chain_network_id))).toEqual([3, 5, 6, 9, 14]);
    expect(capabilities.every(row => row.runtime_readiness === "not_ready")).toBe(true);
    expect(capabilities.some(row => ["test_ready", "production_ready"].includes(row.mqnode_parser_status))).toBe(false);
    expect(capabilities.some(row => ["test_ready", "production_ready"].includes(row.metric_status))).toBe(false);
    expect((first.rows.get("chain_networks.csv") ?? []).filter(row => Number(row.chain_network_id) > 48).every(row => row.is_active === "false")).toBe(true);
  });

  it("rejects duplicate IDs, uppercase codes, and uint16 codec overflow", () => {
    const header = "address_codec_id,codec_code,codec_name,identifier_kind,payload_rule,status,source_id\n";
    expect(() => parseU1Csv("address_codecs.csv", `${header}1,evm20,EVM,wallet_address,exact:20,test_ready,1\n1,other,Other,wallet_address,exact:20,planned,1\n`)).toThrow(/duplicate/);
    expect(() => parseU1Csv("address_codecs.csv", `${header}1,EVM20,EVM,wallet_address,exact:20,test_ready,1\n`)).toThrow(/lowercase canonical code/);
    expect(() => parseU1Csv("address_codecs.csv", `${header}65536,evm20,EVM,wallet_address,exact:20,test_ready,1\n`)).toThrow(/exceeds 65535/);
  });

  it("fails closed when a checked-in ID would renumber a live code", () => {
    expect(() => assertStableCatalogIds("entity", [{ id: 1, code: "binance" }], [{ id: 2, code: "binance" }])).toThrow(/already assigned ID 2/);
    expect(() => assertStableCatalogIds("entity", [{ id: 1, code: "binance" }], [{ id: 1, code: "coinbase" }])).toThrow(/already assigned to coinbase/);
  });

  it("rejects duplicate canonical names, CAIP-2 IDs, and EVM chain IDs", () => {
    const network = (id: string, name: string, caip2: string, evmChainId: string) => ({ chain_network_id: id, network_name: name, environment: "mainnet", caip2, evm_chain_id: evmChainId, network_code: `network_${id}`, is_active: "false" });
    expect(() => validateCanonicalNetworkRows([network("49", "Same", "", ""), network("50", "Same", "", "")])).toThrow(/Duplicate canonical network/);
    expect(() => validateCanonicalNetworkRows([network("49", "One", "eip155:9", "9"), network("50", "Two", "eip155:9", "10")])).toThrow(/Duplicate CAIP-2/);
    expect(() => validateCanonicalNetworkRows([network("49", "One", "eip155:9", "9"), network("50", "Two", "eip155:10", "9")])).toThrow(/Duplicate EVM chain ID/);
  });

  it("rejects namespace/codec family incompatibility", () => {
    const networks = [{ chain_network_id: "1", chain_family: "evm" }];
    const codecs = [{ address_codec_id: "10", codec_code: "cosmos", identifier_kind: "wallet_address", chain_family_compatibility: "cosmos", status: "catalogued" }];
    const namespaces = [{ namespace_id: "5", namespace_code: "bad", chain_network_id: "1", address_codec_id: "10", address_type: "wallet_address", is_active: "false" }];
    expect(() => validateNamespaceCodecCompatibility(networks, codecs, namespaces)).toThrow(/incompatible with evm/);
  });

  it("rejects invalid alias mappings and validator keys routed into wallet namespaces", () => {
    const networks = [{ chain_network_id: "1" }, { chain_network_id: "2" }];
    const codecs = [{ address_codec_id: "10" }];
    const namespaces = [{ namespace_id: "5", chain_network_id: "1", address_codec_id: "10", address_type: "wallet_address" }];
    const sources = [{ source_id: "13" }];
    const alias = { alias_id: "1", source_scope: "sheet", raw_chain_name: "raw", chain_network_id: "2", namespace_id: "5", address_codec_id: "10", address_type: "wallet_address", status: "approved", source_id: "13", approved_by: "reviewer", approved_at: "2026-07-17" };
    expect(() => validateChainAliasRows([alias], networks, namespaces, codecs, sources)).toThrow(/invalid network\/namespace\/codec/);
    expect(() => validateChainAliasRows([{ ...alias, chain_network_id: "1", address_type: "validator_public_key" }], networks, namespaces, codecs, sources)).toThrow(/routed into a wallet namespace/);
  });

  it("rejects missing capability rows and next_id collisions", () => {
    expect(() => validateCapabilityCoverage([{ chain_network_id: "1" }, { chain_network_id: "2" }], [{ chain_network_id: "1" }])).toThrow(/Network 2 has no capability row/);
    expect(() => validateIdRangeAllocators(
      [{ range_code: "u1_networks", start_id: "1", end_id: "9999", next_id: "2" }],
      new Map([["u1_networks", [[{ chain_network_id: "2" }], "chain_network_id"]]]),
    )).toThrow(/next_id collides/);
  });
});
