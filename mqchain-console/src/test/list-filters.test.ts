import { describe, expect, it } from "vitest";

import {
  parseAuditListFilters,
  parseBatchListFilters,
  parseCandidateListFilters,
  parseDiscoveryJobListFilters,
  parseKvBuildListFilters,
  parseRegistryListFilters,
  parseSourceJobListFilters,
} from "@/lib/mqchain/list-filters";

describe("operator list filters", () => {
  it("normalizes candidate list filters from query strings", () => {
    const filters = parseCandidateListFilters({
      q: " 0xabc ",
      chain: "",
      minConfidence: "70",
      page: "2",
      pageSize: "100",
      sort: "confidence",
      conflicts: "true",
    });

    expect(filters.q).toBe("0xabc");
    expect(filters.chain).toBeUndefined();
    expect(filters.minConfidence).toBe(70);
    expect(filters.page).toBe(2);
    expect(filters.pageSize).toBe(100);
    expect(filters.sort).toBe("confidence");
    expect(filters.conflicts).toBe("true");
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
});
