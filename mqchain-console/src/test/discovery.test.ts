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
import {
  buildDiscoveryCompletionApiResponse,
  buildDiscoveryJobDetailApiResponse,
  buildDiscoveryJobListApiResponse,
  DISCOVERY_COMPLETION_API_CONTRACT,
  DISCOVERY_JOB_DETAIL_API_CONTRACT,
  DISCOVERY_JOB_LIST_API_CONTRACT,
} from "@/lib/mqchain/discovery-api";
import { formatDiscoveryConfigTemplate } from "@/lib/mqchain/discovery-templates";
import { discoveryResultsApiRequestSchema, registryDiscoveryJobSchema } from "@/lib/mqchain/validators/discovery";

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

  it("accepts worker completion API results as an array or serialized JSON", () => {
    const results = [
      {
        address: "0x000000000000000000000000000000000000dEaD",
        chain: "ethereum",
        evidence_type: "registry_call",
      },
    ];

    expect(discoveryResultsApiRequestSchema.parse({ results })).toEqual({ results });
    expect(discoveryResultsApiRequestSchema.parse({ resultsJson: JSON.stringify(results) })).toEqual({
      resultsJson: JSON.stringify(results),
    });
    expect(() => discoveryResultsApiRequestSchema.parse({})).toThrow("Provide either results or resultsJson");
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

  it("serializes discovery worker completion responses with canonical write blockers", () => {
    const payload = buildDiscoveryCompletionApiResponse({
      query: { jobId: 7 },
      result: {
        job: {
          id: 7,
          discoveryType: "factory_event_scanner",
          status: "completed",
          candidatesCreated: 2,
          evidenceCreated: 2,
        },
        sourceJobId: 31,
        sourceDocumentId: 41,
        rows: 3,
        candidatesCreated: 2,
        evidenceCreated: 2,
        invalidRows: 1,
        duplicates: 0,
      },
    });

    expect(payload).toMatchObject({
      ...DISCOVERY_COMPLETION_API_CONTRACT,
      mutationAllowed: true,
      registryWriteAllowed: false,
      kvWriteAllowed: false,
      stagedArtifacts: {
        sourceJobId: 31,
        sourceDocumentId: 41,
        candidatesCreated: 2,
        evidenceCreated: 2,
      },
      canonicalWrites: {
        approvalsCreated: 0,
        registryRowsCreated: 0,
        batchesCreated: 0,
        kvBuildsCreated: 0,
      },
      nextActions: {
        reviewCandidatesHref: "/mqchain/candidates?discoveryType=factory_event_scanner&status=pending_review&sort=evidence_count",
        discoveryJobHref: "/mqchain/discovery/jobs/7",
        sourceJobHref: "/mqchain/source-jobs/31",
      },
      policy: {
        discoveryIsNotApproval: true,
        candidatesRequireReview: true,
        batchCommitIsRegistryBoundary: true,
        externalScannerCannotWriteRegistryOrKv: true,
      },
    });
  });

  it("serializes discovery job queue responses for read-only external scanners", () => {
    const now = new Date("2026-07-04T00:00:00.000Z");
    const payload = buildDiscoveryJobListApiResponse({
      query: {
        page: 1,
        pageSize: 25,
        filters: {
          status: "draft",
          sort: "created_at",
        },
      },
      total: 1,
      totalPages: 1,
      rows: [
        {
          job: {
            id: 7,
            discoveryType: "registry_address_provider_scanner",
            status: "draft",
            chainCode: "ethereum",
            seedAddress: "0x0000000000000000000000000000000000000001",
            entityId: 3,
            protocolId: 4,
            config: {
              abi_functions: ["getPool"],
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
            candidatesCreated: 0,
            evidenceCreated: 0,
            error: null,
            logs: [
              "template=Registry evidence=registry_call",
              "runner_task=mqchain-discovery-task-v1",
              "Scanner execution is external; completing a job only stages candidates and evidence.",
            ],
            createdBy: "00000000-0000-0000-0000-000000000001",
            createdAt: now,
            updatedAt: now,
          },
          entity: {
            id: 3,
            entityCode: "aave",
            entityName: "Aave",
            entityType: "defi",
          },
          protocol: {
            id: 4,
            protocolCode: "aave_v3",
            protocolName: "Aave V3",
            protocolType: "lending",
          },
        },
      ],
    });

    expect(payload).toMatchObject({
      ...DISCOVERY_JOB_LIST_API_CONTRACT,
      mutationAllowed: false,
      registryWriteAllowed: false,
      batchWriteAllowed: false,
      kvWriteAllowed: false,
      pagination: {
        totalRows: 1,
        returnedRows: 1,
      },
      rows: [
        {
          id: 7,
          discoveryType: "registry_address_provider_scanner",
          entity: {
            id: 3,
            code: "aave",
          },
          protocol: {
            id: 4,
            code: "aave_v3",
          },
          scannerInterface: {
            template: {
              rootType: "Registry",
              evidenceType: "registry_call",
            },
            operatorConfig: {
              abi_functions: ["getPool"],
            },
            runnerTask: {
              task_version: "mqchain-discovery-task-v1",
            },
          },
          stagedArtifacts: {
            candidatesCreated: 0,
            evidenceCreated: 0,
          },
          diagnostics: {
            logCount: 3,
            logTail: [
              "template=Registry evidence=registry_call",
              "runner_task=mqchain-discovery-task-v1",
              "Scanner execution is external; completing a job only stages candidates and evidence.",
            ],
          },
          hrefs: {
            discoveryJob: "/mqchain/discovery/jobs/7",
            detailApi: "/api/mqchain/discovery/jobs/7",
            completeApi: "/api/mqchain/discovery/jobs/7/complete",
            reviewCandidates: "/mqchain/candidates?discoveryType=registry_address_provider_scanner&status=pending_review&sort=evidence_count",
          },
        },
      ],
      canonicalWrites: {
        approvalsCreated: 0,
        registryRowsCreated: 0,
        batchesCreated: 0,
        kvBuildsCreated: 0,
      },
      policy: {
        discoveryIsNotApproval: true,
        externalScannersReceiveQueueMetadataOnly: true,
        completionStagesCandidatesAndEvidenceOnly: true,
      },
    });
    expect(payload.rows[0]?.scannerInterface.operatorConfig).not.toHaveProperty("runner_task");
  });

  it("serializes discovery job detail responses as redacted read-only staging exports", () => {
    const now = new Date("2026-07-04T00:00:00.000Z");
    const payload = buildDiscoveryJobDetailApiResponse({
      job: {
        id: 7,
        discoveryType: "protocol_root_inventory_scanner",
        status: "completed",
        chainCode: "ethereum",
        seedAddress: "https://docs.example.org/deployments",
        entityId: 3,
        protocolId: 4,
        config: {
          official_url: "https://docs.example.org/deployments",
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
        candidatesCreated: 1,
        evidenceCreated: 1,
        error: null,
        logs: ["completed: rows=1 candidates=1 evidence=1 invalid=0 duplicates=0"],
        createdBy: "00000000-0000-0000-0000-000000000001",
        createdAt: now,
        updatedAt: now,
      },
      sourceJobs: [
        {
          id: 31,
          sourceType: "onchain_discovery",
          sourceName: "Discovery job 7: protocol_root_inventory_scanner",
          sourceUrl: "https://docs.example.org/deployments",
          status: "candidate_created",
          parserVersion: "mqchain-parser-v1",
          metadata: { discoveryJobId: 7, runnerTask: { task_version: "mqchain-discovery-task-v1" } },
          createdAt: now,
          updatedAt: now,
        },
      ],
      documents: [
        {
          id: 41,
          sourceJobId: 31,
          documentType: "json",
          originalName: "discovery-job-7-results.json",
          storageUri: "postgres://mq_discovery_jobs/7/results",
          contentHash: "sha256:abc",
          mimeType: "application/json",
          sizeBytes: 123,
          extractedText: "raw-result-json-that-should-not-be-returned",
          metadata: { discoveryJobId: 7 },
          createdAt: now,
        },
      ],
      candidates: [
        {
          id: 101,
          sourceJobId: 31,
          sourceDocumentId: 41,
          rawAddress: "0x0000000000000000000000000000000000000001",
          normalizedAddress: "0x0000000000000000000000000000000000000001",
          chainCode: "ethereum",
          entityHint: "example",
          protocolHint: "example_protocol",
          roleHint: "protocol_registry",
          suggestedEntityId: 3,
          suggestedProtocolId: 4,
          suggestedRoleId: 12,
          confidenceScore: 80,
          qualityTier: 2,
          candidateStatus: "pending_review",
          duplicateOfCandidateId: null,
          discoveredBy: "protocol_root_inventory_scanner",
          evidenceCount: 1,
          firstSeenBlock: null,
          lastSeenBlock: null,
          metadata: { protocolRootType: "Registry", resultIndex: 1 },
          createdAt: now,
          updatedAt: now,
        },
      ],
      evidence: [
        {
          id: 201,
          candidateId: 101,
          registryId: null,
          batchId: null,
          evidenceType: "official_deployment",
          sourceUrl: "https://docs.example.org/deployments#registry",
          sourceDocumentId: 41,
          evidenceHash: "sha256:def",
          storageUri: null,
          confidenceDelta: 0,
          trustTier: "inferred",
          summary: "Official deployment table",
          payload: { result: { address: "0x1" }, normalized: { chainCode: "ethereum" } },
          createdAt: now,
        },
      ],
      completion: { rows: 1, candidates: 1, evidence: 1, invalid: 0, duplicates: 0 },
      candidateRollup: { totalCandidates: 1, pendingCount: 1 },
      evidenceRollup: { totalEvidence: 1 },
      logDistribution: [{ label: "completed", count: 1 }],
    });

    expect(payload).toMatchObject({
      ...DISCOVERY_JOB_DETAIL_API_CONTRACT,
      mutationAllowed: false,
      approvalAllowed: false,
      registryWriteAllowed: false,
      kvWriteAllowed: false,
      discoveryJob: {
        id: 7,
        discoveryType: "protocol_root_inventory_scanner",
        candidatesCreated: 1,
        evidenceCreated: 1,
        logCount: 1,
      },
      scannerInterface: {
        template: {
          rootType: "ProtocolRootInventory",
          evidenceType: "official_deployment",
        },
        operatorConfig: {
          official_url: "https://docs.example.org/deployments",
        },
      },
      archivedResultSources: [
        {
          id: 31,
          documents: [
            {
              id: 41,
              contentHash: "sha256:abc",
              extractedTextLength: 43,
            },
          ],
        },
      ],
      canonicalWrites: {
        approvalsCreated: 0,
        registryRowsCreated: 0,
        batchesCreated: 0,
        kvBuildsCreated: 0,
      },
      policy: {
        discoveryIsNotApproval: true,
        sourceVerificationRemainsOperatorDriven: true,
        evidencePayloadsExcludedByDefault: true,
      },
    });
    expect(payload.scannerInterface.operatorConfig).not.toHaveProperty("runner_task");
    expect(payload.archivedResultSources[0]?.documents[0]).not.toHaveProperty("extractedText");
    expect(payload.evidence[0]).toMatchObject({ payloadKeys: ["normalized", "result"] });
    expect(payload.evidence[0]).not.toHaveProperty("payload");
    expect(JSON.stringify(payload)).not.toContain("raw-result-json-that-should-not-be-returned");
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
