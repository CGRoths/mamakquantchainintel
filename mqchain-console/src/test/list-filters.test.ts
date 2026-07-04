import { describe, expect, it } from "vitest";

import {
  parseAuditListFilters,
  parseBatchListFilters,
  parseCandidateListFilters,
  parseCategoryDictionaryListFilters,
  parseDiscoveryJobListFilters,
  parseEntityDictionaryListFilters,
  parseKeyPrefixDictionaryListFilters,
  parseKvBuildListFilters,
  parseMetricGroupListFilters,
  parseProtocolDictionaryListFilters,
  parseRegistryListFilters,
  parseRoleDictionaryListFilters,
  parseReviewGroupListFilters,
  parseReviewQueueListFilters,
  parseSourceJobListFilters,
} from "@/lib/mqchain/list-filters";

describe("operator list filters", () => {
  it("normalizes candidate list filters from query strings", () => {
    const filters = parseCandidateListFilters({
      q: " 0xabc ",
      chain: "",
      minConfidence: "70",
      qualityTier: "7",
      page: "2",
      pageSize: "100",
      sort: "confidence",
      conflicts: "true",
    });

    expect(filters.q).toBe("0xabc");
    expect(filters.chain).toBeUndefined();
    expect(filters.minConfidence).toBe(70);
    expect(filters.qualityTier).toBe(7);
    expect(filters.page).toBe(2);
    expect(filters.pageSize).toBe(100);
    expect(filters.sort).toBe("confidence");
    expect(filters.conflicts).toBe("true");
  });

  it("rejects quality-tier filters outside the contract range", () => {
    expect(() => parseCandidateListFilters({ qualityTier: "8" })).toThrow();
    expect(() => parseRegistryListFilters({ qualityTier: "-1" })).toThrow();
    expect(() => parseReviewQueueListFilters({ qualityTier: "8" })).toThrow();
    expect(() => parseRoleDictionaryListFilters({ maxQuality: "8" })).toThrow();
  });

  it("clamps invalid page sizes through validation", () => {
    expect(() => parseCandidateListFilters({ pageSize: "500" })).toThrow();
    expect(() => parseRegistryListFilters({ pageSize: "5" })).toThrow();
  });

  it("defaults registry filters to active newest rows", () => {
    const filters = parseRegistryListFilters({});

    expect(filters.active).toBe("active");
    expect(filters.sort).toBe("created_at");
    expect(filters.page).toBe(1);
    expect(filters.pageSize).toBe(50);
  });

  it("accepts historical registry filters as a point-in-time label state", () => {
    const filters = parseRegistryListFilters({
      active: "historical",
      pageSize: "25",
    });

    expect(filters.active).toBe("historical");
    expect(filters.pageSize).toBe(25);
  });

  it("normalizes source job list filters from query strings", () => {
    const filters = parseSourceJobListFilters({
      q: " proof of reserves ",
      sourceType: "csv_upload",
      status: "candidate_created",
      entity: "",
      chain: "btc",
      sort: "updated_at",
      page: "3",
      pageSize: "25",
    });

    expect(filters.q).toBe("proof of reserves");
    expect(filters.entity).toBeUndefined();
    expect(filters.sourceType).toBe("csv_upload");
    expect(filters.status).toBe("candidate_created");
    expect(filters.chain).toBe("btc");
    expect(filters.sort).toBe("updated_at");
    expect(filters.page).toBe(3);
    expect(filters.pageSize).toBe(25);
  });

  it("rejects invalid source job sort and page size values", () => {
    expect(() => parseSourceJobListFilters({ sort: "confidence" })).toThrow();
    expect(() => parseSourceJobListFilters({ pageSize: "250" })).toThrow();
  });

  it("normalizes audit log filters from query strings", () => {
    const filters = parseAuditListFilters({
      q: " batch committed ",
      source: "approval",
      action: "candidate_approved",
      actor: " reviewer@mamakquant.local ",
      target: "",
      page: "2",
      pageSize: "25",
    });

    expect(filters.q).toBe("batch committed");
    expect(filters.source).toBe("approval");
    expect(filters.action).toBe("candidate_approved");
    expect(filters.actor).toBe("reviewer@mamakquant.local");
    expect(filters.target).toBeUndefined();
    expect(filters.page).toBe(2);
    expect(filters.pageSize).toBe(25);
  });

  it("rejects invalid audit source and page size values", () => {
    expect(() => parseAuditListFilters({ source: "registry" })).toThrow();
    expect(() => parseAuditListFilters({ pageSize: "5" })).toThrow();
  });

  it("normalizes batch list filters from query strings", () => {
    const filters = parseBatchListFilters({
      q: " reserve batch ",
      status: "committed",
      sourceType: "candidate_review",
      entity: " binance ",
      protocol: "",
      role: "cex_cold_wallet",
      labelAction: "create",
      sort: "accepted_count",
      page: "4",
      pageSize: "100",
    });

    expect(filters.q).toBe("reserve batch");
    expect(filters.status).toBe("committed");
    expect(filters.sourceType).toBe("candidate_review");
    expect(filters.entity).toBe("binance");
    expect(filters.protocol).toBeUndefined();
    expect(filters.role).toBe("cex_cold_wallet");
    expect(filters.labelAction).toBe("create");
    expect(filters.sort).toBe("accepted_count");
    expect(filters.page).toBe(4);
    expect(filters.pageSize).toBe(100);
  });

  it("rejects invalid batch sort and page size values", () => {
    expect(() => parseBatchListFilters({ sort: "confidence" })).toThrow();
    expect(() => parseBatchListFilters({ pageSize: "250" })).toThrow();
  });

  it("normalizes KV build list filters from query strings", () => {
    const filters = parseKvBuildListFilters({
      q: " rocksdb ",
      status: "compiled",
      dictionaryVersion: " dict-123 ",
      storage: "",
      minRows: "10",
      maxRows: "250",
      sort: "row_count",
      page: "2",
      pageSize: "25",
    });

    expect(filters.q).toBe("rocksdb");
    expect(filters.status).toBe("compiled");
    expect(filters.dictionaryVersion).toBe("dict-123");
    expect(filters.storage).toBeUndefined();
    expect(filters.minRows).toBe(10);
    expect(filters.maxRows).toBe(250);
    expect(filters.sort).toBe("row_count");
    expect(filters.page).toBe(2);
    expect(filters.pageSize).toBe(25);
  });

  it("rejects invalid KV build sort and page size values", () => {
    expect(() => parseKvBuildListFilters({ sort: "dictionary" })).toThrow();
    expect(() => parseKvBuildListFilters({ pageSize: "5" })).toThrow();
  });

  it("normalizes discovery job list filters from query strings", () => {
    const filters = parseDiscoveryJobListFilters({
      q: " proxy ",
      discoveryType: " proxy_resolution_scanner ",
      status: "completed",
      chain: "ethereum",
      entity: "",
      protocol: " aave ",
      seed: " 0xabc ",
      minCandidates: "2",
      minEvidence: "3",
      sort: "evidence_created",
      page: "2",
      pageSize: "25",
    });

    expect(filters.q).toBe("proxy");
    expect(filters.discoveryType).toBe("proxy_resolution_scanner");
    expect(filters.status).toBe("completed");
    expect(filters.chain).toBe("ethereum");
    expect(filters.entity).toBeUndefined();
    expect(filters.protocol).toBe("aave");
    expect(filters.seed).toBe("0xabc");
    expect(filters.minCandidates).toBe(2);
    expect(filters.minEvidence).toBe(3);
    expect(filters.sort).toBe("evidence_created");
    expect(filters.page).toBe(2);
    expect(filters.pageSize).toBe(25);
  });

  it("rejects invalid discovery job sort and page size values", () => {
    expect(() => parseDiscoveryJobListFilters({ sort: "registry_write" })).toThrow();
    expect(() => parseDiscoveryJobListFilters({ pageSize: "5" })).toThrow();
  });

  it("normalizes review group list filters from query strings", () => {
    const filters = parseReviewGroupListFilters({
      q: " binance ",
      chain: "btc",
      entity: "",
      role: " cex_hot_wallet ",
      sourceType: "official_url",
      discoveryType: " tx_graph_scanner ",
      minConfidence: "80",
      minCount: "2",
      minEvidence: "3",
      sort: "confidence",
      page: "2",
      pageSize: "25",
    });

    expect(filters.q).toBe("binance");
    expect(filters.chain).toBe("btc");
    expect(filters.entity).toBeUndefined();
    expect(filters.role).toBe("cex_hot_wallet");
    expect(filters.sourceType).toBe("official_url");
    expect(filters.discoveryType).toBe("tx_graph_scanner");
    expect(filters.minConfidence).toBe(80);
    expect(filters.minCount).toBe(2);
    expect(filters.minEvidence).toBe(3);
    expect(filters.sort).toBe("confidence");
    expect(filters.page).toBe(2);
    expect(filters.pageSize).toBe(25);
  });

  it("rejects invalid review group sort and page size values", () => {
    expect(() => parseReviewGroupListFilters({ sort: "created_at" })).toThrow();
    expect(() => parseReviewGroupListFilters({ pageSize: "5" })).toThrow();
  });

  it("normalizes review queue list filters from query strings", () => {
    const filters = parseReviewQueueListFilters({
      q: " binance ",
      chain: " btc ",
      entity: " binance ",
      protocol: "",
      role: " cex_cold_wallet ",
      sourceType: "official_url",
      discoveryType: "manual",
      minConfidence: "80",
      maxConfidence: "95",
      qualityTier: "3",
      sort: "evidence_count",
      page: "2",
      approvedPage: "4",
      pageSize: "25",
    });

    expect(filters.q).toBe("binance");
    expect(filters.chain).toBe("btc");
    expect(filters.entity).toBe("binance");
    expect(filters.protocol).toBeUndefined();
    expect(filters.role).toBe("cex_cold_wallet");
    expect(filters.sourceType).toBe("official_url");
    expect(filters.discoveryType).toBe("manual");
    expect(filters.minConfidence).toBe(80);
    expect(filters.maxConfidence).toBe(95);
    expect(filters.qualityTier).toBe(3);
    expect(filters.sort).toBe("evidence_count");
    expect(filters.page).toBe(2);
    expect(filters.approvedPage).toBe(4);
    expect(filters.pageSize).toBe(25);
  });

  it("rejects invalid review queue sort and page values", () => {
    expect(() => parseReviewQueueListFilters({ sort: "updated_at" })).toThrow();
    expect(() => parseReviewQueueListFilters({ approvedPage: "0" })).toThrow();
  });

  it("normalizes metric group list filters from query strings", () => {
    const filters = parseMetricGroupListFilters({
      q: " cex flow ",
      chain: " btc ",
      active: "all",
      metricEligible: "true",
      minConfidence: "70",
      maxConfidence: "95",
      sort: "confidence",
      page: "2",
      pageSize: "25",
    });

    expect(filters.q).toBe("cex flow");
    expect(filters.chain).toBe("btc");
    expect(filters.active).toBe("all");
    expect(filters.metricEligible).toBe("true");
    expect(filters.minConfidence).toBe(70);
    expect(filters.maxConfidence).toBe(95);
    expect(filters.sort).toBe("confidence");
    expect(filters.page).toBe(2);
    expect(filters.pageSize).toBe(25);
  });

  it("rejects invalid metric group sort and page size values", () => {
    expect(() => parseMetricGroupListFilters({ sort: "row_count" })).toThrow();
    expect(() => parseMetricGroupListFilters({ pageSize: "5" })).toThrow();
  });

  it("normalizes entity dictionary list filters from query strings", () => {
    const filters = parseEntityDictionaryListFilters({
      q: " binance ",
      entityType: " cex ",
      category: " exchange ",
      active: "all",
      sort: "updated_at",
      page: "3",
      pageSize: "25",
    });

    expect(filters.q).toBe("binance");
    expect(filters.entityType).toBe("cex");
    expect(filters.category).toBe("exchange");
    expect(filters.active).toBe("all");
    expect(filters.sort).toBe("updated_at");
    expect(filters.page).toBe(3);
    expect(filters.pageSize).toBe(25);
  });

  it("rejects invalid entity dictionary sort and page size values", () => {
    expect(() => parseEntityDictionaryListFilters({ sort: "confidence" })).toThrow();
    expect(() => parseEntityDictionaryListFilters({ pageSize: "5" })).toThrow();
  });

  it("normalizes category dictionary list filters from query strings", () => {
    const filters = parseCategoryDictionaryListFilters({
      q: " exchange ",
      domain: " cex ",
      metricDomain: " reserve_flow ",
      active: "all",
      sort: "domain",
      page: "2",
      pageSize: "25",
    });

    expect(filters.q).toBe("exchange");
    expect(filters.domain).toBe("cex");
    expect(filters.metricDomain).toBe("reserve_flow");
    expect(filters.active).toBe("all");
    expect(filters.sort).toBe("domain");
    expect(filters.page).toBe(2);
    expect(filters.pageSize).toBe(25);
  });

  it("rejects invalid category dictionary sort and page size values", () => {
    expect(() => parseCategoryDictionaryListFilters({ sort: "confidence" })).toThrow();
    expect(() => parseCategoryDictionaryListFilters({ pageSize: "5" })).toThrow();
  });

  it("normalizes protocol dictionary list filters from query strings", () => {
    const filters = parseProtocolDictionaryListFilters({
      q: " aave ",
      entity: " ethereum foundation ",
      protocolType: " lending ",
      chain: " base ",
      active: "all",
      sort: "entity",
      page: "4",
      pageSize: "25",
    });

    expect(filters.q).toBe("aave");
    expect(filters.entity).toBe("ethereum foundation");
    expect(filters.protocolType).toBe("lending");
    expect(filters.chain).toBe("base");
    expect(filters.active).toBe("all");
    expect(filters.sort).toBe("entity");
    expect(filters.page).toBe(4);
    expect(filters.pageSize).toBe(25);
  });

  it("rejects invalid protocol dictionary sort and page size values", () => {
    expect(() => parseProtocolDictionaryListFilters({ sort: "confidence" })).toThrow();
    expect(() => parseProtocolDictionaryListFilters({ pageSize: "5" })).toThrow();
  });

  it("normalizes role dictionary list filters from query strings", () => {
    const filters = parseRoleDictionaryListFilters({
      q: " hot wallet ",
      category: " exchange ",
      roleGroup: " custody ",
      metricUsage: " cex_flow ",
      boundary: " external ",
      minQuality: "1",
      maxQuality: "7",
      active: "all",
      sort: "quality",
      page: "2",
      pageSize: "25",
    });

    expect(filters.q).toBe("hot wallet");
    expect(filters.category).toBe("exchange");
    expect(filters.roleGroup).toBe("custody");
    expect(filters.metricUsage).toBe("cex_flow");
    expect(filters.boundary).toBe("external");
    expect(filters.minQuality).toBe(1);
    expect(filters.maxQuality).toBe(7);
    expect(filters.active).toBe("all");
    expect(filters.sort).toBe("quality");
    expect(filters.page).toBe(2);
    expect(filters.pageSize).toBe(25);
  });

  it("rejects invalid role dictionary sort and page size values", () => {
    expect(() => parseRoleDictionaryListFilters({ sort: "confidence" })).toThrow();
    expect(() => parseRoleDictionaryListFilters({ pageSize: "5" })).toThrow();
  });

  it("normalizes key prefix dictionary list filters from query strings", () => {
    const filters = parseKeyPrefixDictionaryListFilters({
      q: " ethereum ",
      chain: " eth ",
      chainFamily: " evm ",
      addressFamily: " evm20 ",
      codec: " hex ",
      evmChainId: "1",
      minPayloadLen: "20",
      maxPayloadLen: "32",
      active: "all",
      sort: "address_family",
      page: "3",
      pageSize: "25",
    });

    expect(filters.q).toBe("ethereum");
    expect(filters.chain).toBe("eth");
    expect(filters.chainFamily).toBe("evm");
    expect(filters.addressFamily).toBe("evm20");
    expect(filters.codec).toBe("hex");
    expect(filters.evmChainId).toBe(1);
    expect(filters.minPayloadLen).toBe(20);
    expect(filters.maxPayloadLen).toBe(32);
    expect(filters.active).toBe("all");
    expect(filters.sort).toBe("address_family");
    expect(filters.page).toBe(3);
    expect(filters.pageSize).toBe(25);
  });

  it("rejects invalid key prefix dictionary sort and page size values", () => {
    expect(() => parseKeyPrefixDictionaryListFilters({ sort: "confidence" })).toThrow();
    expect(() => parseKeyPrefixDictionaryListFilters({ pageSize: "5" })).toThrow();
  });
});
