import { describe, expect, it } from "vitest";

import { parseDiscoveryConfigJson, discoveryTemplateCount } from "@/lib/mqchain/discovery-config";
import { buildDiscoveryJobDetailRollup, parseDiscoveryCompletionLog } from "@/lib/mqchain/discovery-detail";
import { defaultEvidenceTypeForDiscovery, parseDiscoveryResultsJson } from "@/lib/mqchain/discovery";
import { formatDiscoveryConfigTemplate } from "@/lib/mqchain/discovery-templates";
import { registryDiscoveryJobSchema } from "@/lib/mqchain/validators/discovery";

describe("discovery result helpers", () => {
  it("parses discovered address result arrays", () => {
    const rows = parseDiscoveryResultsJson(
      JSON.stringify([
        {
          address: "0x000000000000000000000000000000000000dEaD",
          chain: "ethereum",
          entity: "uniswap",
          protocol: "uniswap_v3",
          role: "pool",
          evidence_type: "factory_event",
          confidence: 65,
          quality_tier: 2,
          source_url: "https://example.com/tx/0x1",
          summary: "PoolCreated log",
          payload: { tx_hash: "0x1" },
        },
      ]),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.address).toBe("0x000000000000000000000000000000000000dEaD");
    expect(rows[0]?.confidence).toBe(65);
    expect(rows[0]?.payload?.tx_hash).toBe("0x1");
  });

  it("rejects non-array discovery result payloads", () => {
    expect(() => parseDiscoveryResultsJson('{"address":"0x0"}')).toThrow("JSON array");
  });

  it("maps discovery types to evidence defaults", () => {
    expect(defaultEvidenceTypeForDiscovery("factory_event_scan")).toBe("factory_event");
    expect(defaultEvidenceTypeForDiscovery("registry_call_scan")).toBe("registry_call");
    expect(defaultEvidenceTypeForDiscovery("proxy_admin_scan")).toBe("proxy_resolution");
    expect(defaultEvidenceTypeForDiscovery("vault_balance_scan")).toBe("token_balance");
    expect(defaultEvidenceTypeForDiscovery("tx_graph_cluster")).toBe("tx_pattern");
    expect(defaultEvidenceTypeForDiscovery("llm_web_research")).toBe("llm_analysis");
    expect(defaultEvidenceTypeForDiscovery("unknown")).toBe("onchain_discovery");
  });

  it("validates scanner template config JSON", () => {
    const parsed = parseDiscoveryConfigJson("factory_event_scanner", formatDiscoveryConfigTemplate("factory_event_scanner"));

    expect(parsed.event_signature).toContain("PairCreated");
    expect(parsed.from_block).toBe(0);
    expect(defaultEvidenceTypeForDiscovery("factory_event_scanner")).toBe("factory_event");
    expect(discoveryTemplateCount()).toBeGreaterThanOrEqual(6);
  });

  it("rejects invalid scanner config shapes", () => {
    expect(() => parseDiscoveryConfigJson("factory_event_scanner", "[]")).toThrow("JSON object");
    expect(() => parseDiscoveryConfigJson("factory_event_scanner", '{"from_block":0}')).toThrow();
  });

  it("allows custom discovery config objects for future scanners", () => {
    expect(parseDiscoveryConfigJson("custom_scanner", '{"custom":true,"threshold":3}')).toEqual({
      custom: true,
      threshold: 3,
    });
  });

  it("validates registry-seeded discovery jobs", () => {
    const parsed = registryDiscoveryJobSchema.parse({
      registryId: "42",
      discoveryType: "tx_graph_scanner",
      configJson: formatDiscoveryConfigTemplate("tx_graph_scanner"),
    });

    expect(parsed.registryId).toBe(42);
    expect(parsed.discoveryType).toBe("tx_graph_scanner");
  });

  it("parses completion logs into result summaries", () => {
    expect(
      parseDiscoveryCompletionLog([
        "template=Factory evidence=factory_event",
        "completed: rows=5 candidates=3 evidence=3 invalid=1 duplicates=1",
      ]),
    ).toEqual({
      rows: 5,
      candidates: 3,
      evidence: 3,
      invalid: 1,
      duplicates: 1,
    });
  });

  it("builds discovery detail rollups for candidates, evidence, and logs", () => {
    const rollup = buildDiscoveryJobDetailRollup({
      logs: ["template=Factory evidence=factory_event", "row 2: duplicate_in_result_set"],
      candidates: [
        { candidateStatus: "pending_review", chainCode: "ethereum", confidenceScore: 65, evidenceCount: 1 },
        { candidateStatus: "duplicate", chainCode: "ethereum", confidenceScore: 40, evidenceCount: 1 },
      ],
      evidence: [
        { evidenceType: "factory_event", trustTier: "inferred" },
        { evidenceType: "factory_event", trustTier: "inferred" },
      ],
    });

    expect(rollup.candidateRollup.pendingCount).toBe(1);
    expect(rollup.candidateRollup.duplicateCount).toBe(1);
    expect(rollup.evidenceRollup.totalEvidence).toBe(2);
    expect(rollup.logDistribution).toEqual([
      { label: "row 2", count: 1 },
      { label: "template", count: 1 },
    ]);
  });
});
