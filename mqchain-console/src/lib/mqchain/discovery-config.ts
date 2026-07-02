import { z } from "zod";

import { DISCOVERY_SCANNER_TEMPLATES, getDiscoveryTemplate, type DiscoveryScannerType } from "./discovery-templates";

const blockNumberSchema = z.coerce.number().int().nonnegative();
const optionalPositiveNumberSchema = z.coerce.number().int().positive().optional().or(z.literal(""));
const stringArraySchema = z.array(z.string().trim().min(1)).min(1);
const jsonObjectSchema = z.record(z.string(), z.unknown());

const discoveryConfigSchemas: Record<DiscoveryScannerType, z.ZodType<Record<string, unknown>>> = {
  factory_event_scanner: z
    .object({
      event_signature: z.string().trim().min(1),
      from_block: blockNumberSchema,
      to_block: optionalPositiveNumberSchema,
      expected_child_role: z.string().trim().min(1),
      child_address_arg: z.string().trim().min(1).default("child"),
      protocol_id: optionalPositiveNumberSchema,
    })
    .passthrough(),
  registry_address_provider_scanner: z
    .object({
      view_functions: stringArraySchema,
      expected_roles: stringArraySchema,
      protocol_id: optionalPositiveNumberSchema,
      abi_fragment: z.string().optional(),
    })
    .passthrough(),
  proxy_resolution_scanner: z
    .object({
      proxy_type: z.enum(["eip1967", "transparent", "uups", "beacon", "custom"]),
      include_proxy_admin: z.boolean().default(true),
      implementation_role: z.string().trim().min(1).default("protocol_implementation"),
      admin_role: z.string().trim().min(1).default("protocol_proxy_admin"),
      block_number: optionalPositiveNumberSchema,
    })
    .passthrough(),
  pool_vault_inspector: z
    .object({
      abi_type: z.enum(["uniswap_v2_pair", "uniswap_v3_pool", "erc4626_vault", "lending_pool", "custom"]),
      inspect_assets: z.boolean().default(true),
      inspect_recent_activity: z.boolean().default(true),
      expected_role: z.string().trim().min(1).default("protocol_pool"),
      block_number: optionalPositiveNumberSchema,
    })
    .passthrough(),
  tx_graph_scanner: z
    .object({
      from_block: blockNumberSchema,
      to_block: optionalPositiveNumberSchema,
      thresholds: z
        .object({
          min_transaction_count: z.coerce.number().int().positive().default(5),
          min_total_value: z.coerce.number().nonnegative().default(0),
        })
        .passthrough(),
      known_entity_id: optionalPositiveNumberSchema,
      pattern: z.string().trim().min(1).default("counterparty_cluster"),
    })
    .passthrough(),
  llm_ml_evidence_reviewer: z
    .object({
      reviewer_mode: z.enum(["llm", "ml", "hybrid"]),
      candidate_group_key: z.string().optional(),
      source_document_id: optionalPositiveNumberSchema,
      prompt_profile: z.string().trim().min(1).default("evidence_structuring_v1"),
    })
    .passthrough(),
};

export function parseDiscoveryConfigJson(discoveryType: string, configJson?: string) {
  const template = getDiscoveryTemplate(discoveryType);
  const trimmed = String(configJson ?? "").trim();
  let raw: unknown = template?.defaultConfig ?? {};

  if (trimmed) {
    try {
      raw = JSON.parse(trimmed) as unknown;
    } catch {
      throw new Error("Discovery config must be valid JSON.");
    }
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Discovery config must be a JSON object.");
  }

  if (!template) {
    return jsonObjectSchema.parse(raw);
  }

  return discoveryConfigSchemas[template.type].parse(raw);
}

export function discoveryTemplateSummary(discoveryType: string) {
  const template = getDiscoveryTemplate(discoveryType);
  if (!template) {
    return {
      discoveryType,
      rootType: "Custom",
      evidenceType: "onchain_discovery",
      requiredConfig: [],
      outputFields: [],
    };
  }

  return {
    discoveryType: template.type,
    rootType: template.rootType,
    evidenceType: template.evidenceType,
    requiredConfig: template.requiredConfig,
    outputFields: template.outputFields,
  };
}

export function discoveryTemplateCount() {
  return DISCOVERY_SCANNER_TEMPLATES.length;
}
