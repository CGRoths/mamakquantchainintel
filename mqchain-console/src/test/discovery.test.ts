import { describe, expect, it } from "vitest";

import {
  buildDiscoveryRunnerTask,
  defaultRoleForProtocolRootType,
  discoveryResultSchemaSummary,
  discoveryTemplateCount,
  parseDiscoveryConfigJson,
} from "@/lib/mqchain/discovery-config";
import { buildDiscoveryJobDetailRollup, parseDiscoveryCompletionLog } from "@/lib/mqchain/discovery-detail";
import {
  buildDiscoveryJobCompletedAuditPayload,
  buildDiscoveryJobCreatedAuditPayload,
  defaultEvidenceTypeForDiscovery,
  parseDiscoveryResultsJson,
} from "@/lib/mqchain/discovery";
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

  it("validates protocol root inventory config and default role mapping", () => {
    const parsed = parseDiscoveryConfigJson(
      "protocol_root_inventory_scanner",
      JSON.stringify({
        official_url: "https://docs.example.org/deployments",
        protocol_id: 3,
        root_addresses: [
          {
            address: "0x0000000000000000000000000000000000000001",
            root_type: "Router",
            source_url: "https://docs.example.org/deployments#router",
          },
          {
            address: "0x0000000000000000000000000000000000000002",
            root_type: "Treasury",
            role: "protocol_treasury",
          },
        ],
      }),
    );

    expect(parsed.root_addresses).toHaveLength(2);
    expect(defaultRoleForProtocolRootType("Router")).toBe("protocol_router");
    expect(defaultRoleForProtocolRootType("Treasury")).toBe("protocol_treasury");
    expect(defaultEvidenceTypeForDiscovery("protocol_root_inventory_scanner")).toBe("official_deployment");
    expect(discoveryTemplateCount()).toBeGreaterThanOrEqual(7);
  });

  it("rejects invalid protocol root inventory types", () => {
    expect(() =>
      parseDiscoveryConfigJson(
        "protocol_root_inventory_scanner",
        JSON.stringify({
          root_addresses: [{ address: "0x0000000000000000000000000000000000000001", root_type: "LiquidationBot" }],
        }),
      ),
    ).toThrow();
  });

  it("builds an external runner task with discovery safety boundaries", () => {
    const config = parseDiscoveryConfigJson("registry_address_provider_scanner", formatDiscoveryConfigTemplate("registry_address_provider_scanner"));
    const task = buildDiscoveryRunnerTask({
      discoveryType: "registry_address_provider_scanner",
      chainCode: "ethereum",
      seedAddress: "0x0000000000000000000000000000000000000001",
      config,
    });

    expect(task.task_version).toBe("mqchain-discovery-task-v1");
    expect(task.root_type).toBe("Registry");
    expect(task.evidence_type).toBe("registry_call");
    expect(task.result_schema.required).toEqual(["address"]);
    expect(task.result_schema.optional).toContain("payload.function_name");
    expect(task.safety_policy).toEqual({
      writes: "candidates_and_evidence_only",
      approval_allowed: false,
      registry_commit_allowed: false,
      kv_write_allowed: false,
    });
  });

  it("builds discovery creation audit payloads with safety boundaries", () => {
    const payload = buildDiscoveryJobCreatedAuditPayload({
      discoveryJobId: 7,
      discoveryType: "factory_event_scanner",
      chainCode: "ethereum",
      seedAddress: "0x0000000000000000000000000000000000000001",
      entityId: 3,
      protocolId: 4,
      config: {
        runner_task: {
          task_version: "mqchain-discovery-task-v1",
          safety_policy: {
            writes: "candidates_and_evidence_only",
            approval_allowed: false,
            registry_commit_allowed: false,
            kv_write_allowed: false,
          },
        },
      },
    });

    expect(payload).toMatchObject({
      discoveryJobId: 7,
      discoveryType: "factory_event_scanner",
      chainCode: "ethereum",
      entityId: 3,
      protocolId: 4,
      runnerTaskVersion: "mqchain-discovery-task-v1",
      safetyPolicy: {
        writes: "candidates_and_evidence_only",
        approvalAllowed: false,
        registryCommitAllowed: false,
        kvWriteAllowed: false,
      },
    });
  });

  it("builds registry-seeded discovery audit payloads without canonical write permissions", () => {
    const payload = buildDiscoveryJobCreatedAuditPayload({
      discoveryJobId: 11,
      discoveryType: "tx_graph_scanner",
      chainCode: "ethereum",
      seedAddress: "0x0000000000000000000000000000000000000002",
      seededFromRegistryId: 99,
      entityId: 3,
      protocolId: 4,
      config: {
        runner_task: {
          task_version: "mqchain-discovery-task-v1",
        },
      },
    });

    expect(payload.seededFromRegistryId).toBe(99);
    expect(payload.safetyPolicy.registryCommitAllowed).toBe(false);
    expect(payload.safetyPolicy.kvWriteAllowed).toBe(false);
  });

  it("builds discovery completion audit payloads with staged IDs and zero canonical writes", () => {
    const payload = buildDiscoveryJobCompletedAuditPayload({
      discoveryJobId: 7,
      discoveryType: "factory_event_scanner",
      status: "completed",
      sourceJobId: 31,
      sourceDocumentId: 41,
      rows: 3,
      candidatesCreated: 2,
      evidenceCreated: 2,
      invalidRows: 1,
      duplicates: 0,
      candidateIds: [101, 102],
      evidenceIds: [201, 202],
      config: {
        runner_task: {
          task_version: "mqchain-discovery-task-v1",
        },
      },
    });

    expect(payload).toMatchObject({
      discoveryJobId: 7,
      sourceJobId: 31,
      sourceDocumentId: 41,
      candidateIds: [101, 102],
      evidenceIds: [201, 202],
      stagedArtifacts: {
        sourceJobsCreated: 1,
        sourceDocumentsCreated: 1,
        candidatesCreated: 2,
        evidenceCreated: 2,
      },
      canonicalWrites: {
        registryRowsCreated: 0,
        approvalsCreated: 0,
        batchesCreated: 0,
        kvBuildsCreated: 0,
      },
      safetyPolicy: {
        writes: "candidates_and_evidence_only",
        approvalAllowed: false,
        registryCommitAllowed: false,
        kvWriteAllowed: false,
      },
    });
  });

  it("summarizes result contracts for worker outputs", () => {
    const schema = discoveryResultSchemaSummary("proxy_resolution_scanner");

    expect(schema.required).toEqual(["address"]);
    expect(schema.optional).toContain("payload.implementation_address");
    expect(schema.optional).toContain("payload.proxy_admin");
  });

  it("includes protocol root inventory fields in runner output contracts", () => {
    const task = buildDiscoveryRunnerTask({
      discoveryType: "protocol_root_inventory_scanner",
      chainCode: "ethereum",
      seedAddress: "https://docs.example.org/deployments",
      config: parseDiscoveryConfigJson(
        "protocol_root_inventory_scanner",
        JSON.stringify({
          official_url: "https://docs.example.org/deployments",
          root_addresses: [{ address: "0x0000000000000000000000000000000000000001", root_type: "Registry" }],
        }),
      ),
    });

    expect(task.root_type).toBe("ProtocolRootInventory");
    expect(task.evidence_type).toBe("official_deployment");
    expect(task.result_schema.optional).toContain("root_type");
    expect(task.result_schema.optional).toContain("payload.root_type");
    expect(task.safety_policy.registry_commit_allowed).toBe(false);
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
