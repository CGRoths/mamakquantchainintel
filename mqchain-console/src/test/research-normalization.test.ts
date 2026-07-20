import { describe, expect, it } from "vitest";

import {
  exportResearchCsv,
  parseRawReference,
  preflightResearchCsv,
  RESEARCH_CSV_SCHEMA_VERSION,
  type ResearchDictionarySnapshot,
} from "@/lib/mqchain/research-normalization";

const dictionary: ResearchDictionarySnapshot = {
  dictionaryVersion: "d".repeat(64),
  entities: [{ id: 1, code: "binance", name: "Binance", aliases: ["Binance CEX"] }],
  protocols: [],
  roles: [{ id: 10, code: "cex_hot_wallet", name: "CEX hot wallet" }],
  components: [{ id: 20, code: "vault_v1", name: "Vault V1" }],
  tags: [{ id: 30, code: "por", name: "Proof of reserves" }],
  networkProfiles: [{
    networkId: 2,
    networkCode: "eth",
    networkName: "Ethereum",
    aliases: ["ERC20"],
    namespaceId: 3,
    prefixCode: 1,
    addressCodecId: 1,
    codecCode: "evm20_hex",
    identifierKind: "wallet_address",
  }],
};

const address = "0x52908400098527886E0F7030069857D2E4169EE7";

function csv(rows: string[]) {
  return [
    "schema_version,dictionary_version,address,chain,identifier_kind,entity,role,component,tags,source_url,source_sheet,source_row,retrieved_at,raw_reference,metric_eligible",
    ...rows,
  ].join("\n");
}

function validRow(overrides: Partial<Record<string, string>> = {}) {
  const values = {
    schema_version: RESEARCH_CSV_SCHEMA_VERSION,
    dictionary_version: dictionary.dictionaryVersion,
    address,
    chain: "Ethereum",
    identifier_kind: "wallet_address",
    entity: "Binance CEX",
    role: "cex_hot_wallet",
    component: "vault_v1",
    tags: "por",
    source_url: "https://example.com/por",
    source_sheet: "ETH",
    source_row: "7",
    retrieved_at: "2026-07-20",
    raw_reference: '"{""page"":7}"',
    metric_eligible: "true",
    ...overrides,
  };
  return Object.values(values).join(",");
}

describe("deterministic research normalization", () => {
  it("resolves canonical dictionaries and approved aliases without writing state", () => {
    const report = preflightResearchCsv({ csvText: csv([validRow()]), dictionary, now: new Date("2026-07-20T00:00:00Z") });
    expect(report.counts).toEqual({ totalRows: 1, resolvedRows: 1, unresolvedRows: 0, invalidRows: 0, duplicates: 0 });
    expect(report.canCreateSourceJob).toBe(true);
    expect(report.records[0]).toMatchObject({
      status: "resolved",
      chainCode: "eth",
      chainNetworkId: 2,
      namespaceId: 3,
      entityId: 1,
      roleId: 10,
      componentId: 20,
      tagIds: [30],
      sourceRow: 7,
      rawReference: { page: 7 },
    });
  });

  it("never treats an unknown EVM chain as Ethereum", () => {
    const report = preflightResearchCsv({ csvText: csv([validRow({ chain: "Mystery L2" })]), dictionary });
    expect(report.records[0]).toMatchObject({ status: "pending_alias", chainCode: null, normalizedAddress: null });
  });

  it("detects duplicates and dictionary-version races deterministically", () => {
    const duplicate = preflightResearchCsv({ csvText: csv([validRow(), validRow({ source_row: "8" })]), dictionary });
    expect(duplicate.counts.duplicates).toBe(1);
    const mismatch = preflightResearchCsv({ csvText: csv([validRow({ dictionary_version: "0".repeat(64) })]), dictionary });
    expect(mismatch.records[0].blockers).toContain("dictionary_version_mismatch");
    expect(mismatch.canCreateSourceJob).toBe(false);
  });

  it("warns for legacy schema but keeps provenance mandatory", () => {
    const report = preflightResearchCsv({
      csvText: "address,chain,entity,role\n" + [address, "Ethereum", "Binance", "cex_hot_wallet"].join(","),
      dictionary,
    });
    expect(report.warnings).toContain("legacy_schema");
    expect(report.records[0].status).toBe("source_provenance_missing");
    expect(report.canCreateSourceJob).toBe(false);
  });

  it("keeps protocol components separate from role resolution", () => {
    const report = preflightResearchCsv({ csvText: csv([validRow({ role: "vault_v1", component: "" })]), dictionary });
    expect(report.records[0]).toMatchObject({ status: "pending_role", roleId: null });
  });

  it("rejects malformed, oversized, deeply nested, and pollution-shaped raw references", () => {
    expect(() => parseRawReference("not json")).toThrow();
    expect(() => parseRawReference(JSON.stringify({ value: "x".repeat(33 * 1024) }))).toThrow("raw_reference_too_large");
    let nested: Record<string, unknown> = {};
    for (let index = 0; index < 10; index += 1) nested = { nested };
    expect(() => parseRawReference(JSON.stringify(nested))).toThrow("raw_reference_too_deep");
    expect(() => parseRawReference('{"constructor":{"polluted":true}}')).toThrow("raw_reference_forbidden_key");
  });

  it("escapes spreadsheet formulas and produces stable exports and hashes", () => {
    expect(exportResearchCsv([{ note: "=HYPERLINK(\"bad\")" }])).toContain("'=HYPERLINK");
    const first = preflightResearchCsv({ csvText: csv([validRow()]), dictionary, now: new Date("2026-01-01") });
    const second = preflightResearchCsv({ csvText: csv([validRow()]), dictionary, now: new Date("2026-02-01") });
    expect(second.preflightHash).toBe(first.preflightHash);
    expect(second.normalizedCsv).toBe(first.normalizedCsv);
  });

  it("preflights the controlled multi-CEX acceptance matrix", () => {
    const acceptanceDictionary: ResearchDictionarySnapshot = {
      ...dictionary,
      entities: [
        { id: 1, code: "binance", name: "Binance" },
        { id: 3, code: "bybit", name: "Bybit" },
        { id: 8, code: "kucoin", name: "KuCoin" },
        { id: 10, code: "mexc", name: "MEXC" },
      ],
      roles: [
        { id: 1000, code: "cex_por_cold_wallet", name: "CEX PoR Cold Wallet" },
        { id: 1010, code: "cex_cold_wallet", name: "CEX Cold Wallet" },
        { id: 1020, code: "cex_hot_wallet", name: "CEX Hot Wallet" },
        { id: 1080, code: "cex_reserve_wallet", name: "CEX Reserve Wallet" },
      ],
    };
    const row = (suffix: string, entityCode: string, roleCode: string, overrides: Record<string, unknown> = {}) => ({
      schema_version: RESEARCH_CSV_SCHEMA_VERSION,
      dictionary_version: acceptanceDictionary.dictionaryVersion,
      address: `0x${suffix.padStart(40, "0")}`,
      chain: "Ethereum",
      address_type: "wallet_address",
      entity_code: entityCode,
      role_code: roleCode,
      source_url: "https://example.com/controlled-acceptance",
      source_name: "Controlled acceptance fixture",
      source_sheet: entityCode,
      source_row: suffix,
      retrieved_at: "2026-07-20",
      evidence_type: "official_page",
      trust_tier: "official",
      confidence: 80,
      quality_tier: 3,
      metric_eligible: false,
      normalization_status: "resolved",
      raw_reference: { fixture: true, row: suffix },
      ...overrides,
    });
    const rows = [
      row("1", "mexc", "cex_reserve_wallet"),
      row("2", "bybit", "cex_reserve_wallet"),
      row("3", "binance", "cex_hot_wallet"),
      row("4", "kucoin", "cex_cold_wallet"),
      row("1", "mexc", "cex_reserve_wallet", { source_row: "5" }),
      row("6", "mexc", "unknown_role"),
      row("7", "bybit", "cex_reserve_wallet", { chain: "Unknown Exchange Chain" }),
      row("8", "binance", "cex_hot_wallet", { address_type: "validator_public_key" }),
      row("9", "kucoin", "cex_cold_wallet", { source_url: "" }),
    ];

    const report = preflightResearchCsv({ csvText: exportResearchCsv(rows), dictionary: acceptanceDictionary });

    expect(report.counts).toEqual({ totalRows: 9, resolvedRows: 4, unresolvedRows: 3, invalidRows: 1, duplicates: 1 });
    expect(report.records.map(record => record.status)).toEqual([
      "resolved", "resolved", "resolved", "resolved", "duplicate", "pending_role",
      "pending_alias", "unsupported_identifier_kind", "source_provenance_missing",
    ]);
    expect(report.canCreateSourceJob).toBe(false);
  });
});
