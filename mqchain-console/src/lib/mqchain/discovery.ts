import { z } from "zod";

import { getDiscoveryTemplate } from "./discovery-templates";
import { discoveryResultRowSchema } from "./validators/discovery";

export type DiscoveryResultRow = z.infer<typeof discoveryResultRowSchema>;

export type DiscoveryJobCreatedAuditInput = {
  discoveryJobId: number;
  discoveryType: string;
  chainCode?: string | null;
  seedAddress?: string | null;
  seededFromRegistryId?: number | null;
  entityId?: number | null;
  protocolId?: number | null;
  config: Record<string, unknown>;
};

export type DiscoveryJobCompletedAuditInput = {
  discoveryJobId: number;
  discoveryType: string;
  status: string;
  sourceJobId: number;
  sourceDocumentId: number;
  rows: number;
  candidatesCreated: number;
  evidenceCreated: number;
  invalidRows: number;
  duplicates: number;
  candidateIds: number[];
  evidenceIds: number[];
  config: Record<string, unknown>;
};

export function parseDiscoveryResultsJson(resultsJson: string): DiscoveryResultRow[] {
  const parsed = JSON.parse(resultsJson) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Discovery results must be a JSON array.");
  }

  return z.array(discoveryResultRowSchema).parse(parsed);
}

function runnerTaskVersionFromConfig(config: Record<string, unknown>) {
  const runnerTask = config.runner_task;
  return runnerTask && typeof runnerTask === "object" && "task_version" in runnerTask
    ? String((runnerTask as { task_version?: unknown }).task_version ?? "")
    : null;
}

export function buildDiscoveryJobCreatedAuditPayload(input: DiscoveryJobCreatedAuditInput) {
  return {
    discoveryJobId: input.discoveryJobId,
    discoveryType: input.discoveryType,
    chainCode: input.chainCode ?? null,
    seedAddress: input.seedAddress ?? null,
    seededFromRegistryId: input.seededFromRegistryId ?? null,
    entityId: input.entityId ?? null,
    protocolId: input.protocolId ?? null,
    runnerTaskVersion: runnerTaskVersionFromConfig(input.config),
    safetyPolicy: {
      writes: "candidates_and_evidence_only",
      approvalAllowed: false,
      registryCommitAllowed: false,
      kvWriteAllowed: false,
    },
    config: input.config,
  };
}

export function buildDiscoveryJobCompletedAuditPayload(input: DiscoveryJobCompletedAuditInput) {
  return {
    discoveryJobId: input.discoveryJobId,
    discoveryType: input.discoveryType,
    status: input.status,
    sourceJobId: input.sourceJobId,
    sourceDocumentId: input.sourceDocumentId,
    rows: input.rows,
    candidatesCreated: input.candidatesCreated,
    evidenceCreated: input.evidenceCreated,
    invalidRows: input.invalidRows,
    duplicates: input.duplicates,
    candidateIds: input.candidateIds,
    evidenceIds: input.evidenceIds,
    runnerTaskVersion: runnerTaskVersionFromConfig(input.config),
    safetyPolicy: {
      writes: "candidates_and_evidence_only",
      approvalAllowed: false,
      registryCommitAllowed: false,
      kvWriteAllowed: false,
    },
    stagedArtifacts: {
      sourceJobsCreated: 1,
      sourceDocumentsCreated: 1,
      candidatesCreated: input.candidatesCreated,
      evidenceCreated: input.evidenceCreated,
    },
    canonicalWrites: {
      registryRowsCreated: 0,
      approvalsCreated: 0,
      batchesCreated: 0,
      kvBuildsCreated: 0,
    },
  };
}

export function defaultEvidenceTypeForDiscovery(discoveryType: string) {
  const template = getDiscoveryTemplate(discoveryType);
  if (template) return template.evidenceType;

  if (discoveryType.includes("factory")) return "factory_event";
  if (discoveryType.includes("registry") || discoveryType.includes("address_provider")) return "registry_call";
  if (discoveryType.includes("proxy")) return "proxy_resolution";
  if (discoveryType.includes("pool") || discoveryType.includes("vault")) return "token_balance";
  if (discoveryType.includes("tx_graph")) return "tx_pattern";
  if (discoveryType.includes("llm")) return "llm_analysis";
  if (discoveryType.includes("ml")) return "ml_score";
  return "onchain_discovery";
}
