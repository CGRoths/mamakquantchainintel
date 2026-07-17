import { createHash } from "crypto";
import { readFile } from "fs/promises";
import path from "path";

import Papa from "papaparse";

export const U1_CATALOG_FILES = [
  "chain_networks.csv",
  "address_codecs.csv",
  "address_namespaces.csv",
  "chain_capabilities.csv",
  "chain_aliases.csv",
  "categories.csv",
  "roles.csv",
  "tags.csv",
  "entities.csv",
  "protocols.csv",
  "protocol_deployments.csv",
  "protocol_components.csv",
  "metric_groups.csv",
  "metric_group_rules.jsonl",
  "assets.csv",
  "token_standards.csv",
  "token_contracts.csv",
  "asset_namespaces.csv",
  "catalog_sources.csv",
  "external_identifiers.csv",
  "id_ranges.csv",
] as const;

export type U1CatalogFile = (typeof U1_CATALOG_FILES)[number];
export type U1CatalogRow = Record<string, string>;
export type U1MetricGroupRule = Record<string, unknown> & {
  metric_group_id: number;
  metric_group_code: string;
  rule_version: number;
  status: string;
  source_id: number;
};

export function assertStableCatalogIds(
  kind: string,
  catalogRows: Array<{ id: number; code: string }>,
  existingRows: Array<{ id: number; code: string }>,
) {
  const existingById = new Map(existingRows.map((row) => [row.id, row.code]));
  const existingByCode = new Map(existingRows.map((row) => [row.code, row.id]));
  for (const row of catalogRows) {
    const codeAtId = existingById.get(row.id);
    const idForCode = existingByCode.get(row.code);
    if (codeAtId !== undefined && codeAtId !== row.code) {
      throw new Error(`${kind} ID ${row.id} is already assigned to ${codeAtId}, not ${row.code}.`);
    }
    if (idForCode !== undefined && idForCode !== row.id) {
      throw new Error(`${kind} code ${row.code} is already assigned ID ${idForCode}, not ${row.id}.`);
    }
  }
}

type CsvContract = {
  idColumn?: string;
  codeColumn?: string;
  maxId?: bigint;
  requiredColumns: readonly string[];
};

const UINT16_MAX = 65_535n;
const UINT32_MAX = 4_294_967_295n;

export const U1_CSV_CONTRACTS: Partial<Record<U1CatalogFile, CsvContract>> = {
  "chain_networks.csv": {
    idColumn: "chain_network_id",
    codeColumn: "network_code",
    maxId: UINT32_MAX,
    requiredColumns: ["chain_network_id", "network_code", "network_name", "chain_family", "environment", "is_active", "source_id"],
  },
  "address_codecs.csv": {
    idColumn: "address_codec_id",
    codeColumn: "codec_code",
    maxId: UINT16_MAX,
    requiredColumns: ["address_codec_id", "codec_code", "codec_name", "identifier_kind", "payload_rule", "status", "source_id"],
  },
  "address_namespaces.csv": {
    idColumn: "namespace_id",
    codeColumn: "namespace_code",
    maxId: UINT32_MAX,
    requiredColumns: ["namespace_id", "namespace_code", "namespace_name", "chain_network_id", "address_codec_id", "address_type", "is_active", "source_id"],
  },
  "chain_capabilities.csv": {
    idColumn: "chain_network_id",
    maxId: UINT32_MAX,
    requiredColumns: ["chain_network_id", "support_tier", "catalog_state", "label_readiness", "runtime_readiness", "catalog_status", "normalizer_status", "mqnode_parser_status", "asset_resolver_status", "current_label_status", "timeline_status", "metric_status", "mqnode_integration_test_ref", "metric_integration_test_ref"],
  },
  "chain_aliases.csv": {
    idColumn: "alias_id",
    maxId: UINT32_MAX,
    requiredColumns: ["alias_id", "source_scope", "raw_chain_name", "chain_network_id", "namespace_id", "address_codec_id", "address_type", "asset_hint", "token_standard_hint", "status", "evidence_ref", "source_id", "approved_by", "approved_at", "approval_notes"],
  },
  "catalog_sources.csv": {
    idColumn: "source_id",
    codeColumn: "source_code",
    maxId: UINT32_MAX,
    requiredColumns: ["source_id", "source_code", "source_name", "source_type", "status", "content_hash"],
  },
  "categories.csv": {
    idColumn: "category_id",
    codeColumn: "category_code",
    maxId: UINT32_MAX,
    requiredColumns: ["category_id", "category_code", "category_name", "is_active", "source_id"],
  },
  "roles.csv": {
    idColumn: "role_id",
    codeColumn: "role_code",
    maxId: UINT32_MAX,
    requiredColumns: ["role_id", "role_code", "role_name", "category_id", "default_quality_tier", "default_flags", "is_active", "source_id"],
  },
  "tags.csv": {
    idColumn: "tag_id",
    codeColumn: "tag_code",
    maxId: UINT32_MAX,
    requiredColumns: ["tag_id", "tag_code", "tag_name", "is_active", "source_id"],
  },
  "entities.csv": {
    idColumn: "entity_id",
    codeColumn: "entity_code",
    maxId: UINT32_MAX,
    requiredColumns: ["entity_id", "entity_code", "entity_name", "category_id", "is_active", "source_id"],
  },
  "protocols.csv": {
    idColumn: "protocol_id",
    codeColumn: "protocol_code",
    maxId: UINT32_MAX,
    requiredColumns: ["protocol_id", "protocol_code", "protocol_name", "entity_id", "is_active", "source_id"],
  },
  "protocol_deployments.csv": {
    idColumn: "deployment_id",
    codeColumn: "deployment_code",
    maxId: UINT32_MAX,
    requiredColumns: ["deployment_id", "protocol_id", "namespace_id", "deployment_code", "status", "source_id"],
  },
  "protocol_components.csv": {
    idColumn: "component_id",
    codeColumn: "component_code",
    maxId: UINT32_MAX,
    requiredColumns: ["component_id", "protocol_id", "component_code", "component_type", "namespace_id", "address_codec_id", "role_id", "category_id", "is_active", "source_id"],
  },
  "metric_groups.csv": {
    idColumn: "metric_group_id",
    codeColumn: "metric_group_code",
    maxId: UINT32_MAX,
    requiredColumns: ["metric_group_id", "metric_group_code", "metric_group_name", "min_confidence", "require_metric_eligible", "is_active", "source_id"],
  },
  "assets.csv": {
    idColumn: "asset_id",
    codeColumn: "asset_code",
    maxId: UINT32_MAX,
    requiredColumns: ["asset_id", "asset_code", "asset_name", "asset_type", "is_active", "source_id"],
  },
  "token_standards.csv": {
    idColumn: "standard_id",
    codeColumn: "standard_code",
    maxId: UINT16_MAX,
    requiredColumns: ["standard_id", "standard_code", "standard_name", "chain_family", "is_active", "source_id"],
  },
  "token_contracts.csv": {
    idColumn: "token_contract_id",
    maxId: UINT32_MAX,
    requiredColumns: ["token_contract_id", "asset_id", "namespace_id", "address_codec_id", "normalized_payload_hex", "standard_id", "decimals", "status", "source_id"],
  },
  "asset_namespaces.csv": {
    idColumn: "asset_namespace_id",
    maxId: UINT32_MAX,
    requiredColumns: ["asset_namespace_id", "asset_id", "namespace_id", "standard_id", "status", "source_id"],
  },
  "id_ranges.csv": {
    idColumn: "range_id",
    codeColumn: "range_code",
    maxId: UINT32_MAX,
    requiredColumns: ["range_id", "dictionary_kind", "range_code", "start_id", "end_id", "next_id", "owner_domain", "status"],
  },
};

export const CAPABILITY_STATUSES = [
  "unsupported",
  "catalogued",
  "planned",
  "partial",
  "test_ready",
  "production_ready",
  "disabled",
] as const;
const NETWORK_CATALOG_STATES = ["catalogued", "disabled"] as const;
const NETWORK_READINESS_STATES = ["not_ready", "prepared", "test_ready", "production_ready"] as const;
const CHAIN_ALIAS_STATUSES = ["approved", "pending_mapping", "pending_network", "not_a_network", "unsupported"] as const;
const CODEC_IDENTIFIER_KINDS = ["wallet_address", "wallet_or_public_key", "wallet_or_staking_identifier", "validator_public_key", "staking_identifier", "consensus_identifier"] as const;
const NAMESPACE_ADDRESS_TYPES = ["wallet_address", "validator_public_key", "staking_identifier", "consensus_identifier"] as const;

function canonicalText(text: string) {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+$/g, "")).join("\n");
}

function parseUnsigned(value: string, name: string, max: bigint) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be an unsigned decimal integer.`);
  }
  const parsed = BigInt(value);
  if (parsed > max) {
    throw new Error(`${name} exceeds ${max}.`);
  }
  return parsed;
}

export function parseU1Csv(file: U1CatalogFile, text: string) {
  const canonical = canonicalText(text);
  const parsed = Papa.parse<U1CatalogRow>(canonical, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    throw new Error(`${file}: ${parsed.errors.map((error) => error.message).join("; ")}`);
  }

  const contract = U1_CSV_CONTRACTS[file];
  if (!contract) {
    return parsed.data;
  }

  const fields = new Set(parsed.meta.fields ?? []);
  for (const column of contract.requiredColumns) {
    if (!fields.has(column)) throw new Error(`${file}: missing required column ${column}.`);
  }

  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();
  let previousId = -1n;
  for (const [index, row] of parsed.data.entries()) {
    if (contract.idColumn) {
      const idText = row[contract.idColumn];
      const id = parseUnsigned(idText, `${file} row ${index + 2} ${contract.idColumn}`, contract.maxId ?? UINT32_MAX);
      if (id === 0n) throw new Error(`${file}: zero is reserved and cannot be an explicit row ID.`);
      if (seenIds.has(idText)) throw new Error(`${file}: duplicate ${contract.idColumn} ${idText}.`);
      if (id < previousId) throw new Error(`${file}: rows must be sorted by ${contract.idColumn}.`);
      seenIds.add(idText);
      previousId = id;
    }
    if (contract.codeColumn) {
      const code = row[contract.codeColumn];
      if (!/^[a-z0-9][a-z0-9_]*$/.test(code)) throw new Error(`${file}: invalid lowercase canonical code ${code}.`);
      if (seenCodes.has(code)) throw new Error(`${file}: duplicate ${contract.codeColumn} ${code}.`);
      seenCodes.add(code);
    }
  }
  return parsed.data;
}

function assertUniqueNonEmpty(rows: U1CatalogRow[], column: string, label: string) {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const value = row[column]?.trim();
    if (!value) continue;
    const previous = seen.get(value);
    if (previous) throw new Error(`Duplicate ${label} ${value} on networks ${previous} and ${row.chain_network_id}.`);
    seen.set(value, row.chain_network_id);
  }
}

export function validateCanonicalNetworkRows(networks: U1CatalogRow[]) {
  assertUniqueNonEmpty(networks, "caip2", "CAIP-2 ID");
  assertUniqueNonEmpty(networks, "evm_chain_id", "EVM chain ID");
  const seenNames = new Map<string, string>();
  for (const row of networks) {
    const canonicalName = `${row.network_name.trim().toLowerCase()}\u0000${row.environment.trim().toLowerCase()}`;
    const previous = seenNames.get(canonicalName);
    if (previous) throw new Error(`Duplicate canonical network ${row.network_name} on IDs ${previous} and ${row.chain_network_id}.`);
    seenNames.set(canonicalName, row.chain_network_id);
    if (Number(row.chain_network_id) > 48 && row.is_active !== "false") throw new Error(`New canonical network ${row.network_code} must remain inactive until a manual proposal is approved.`);
  }
}

export function validateNamespaceCodecCompatibility(networks: U1CatalogRow[], codecs: U1CatalogRow[], namespaces: U1CatalogRow[]) {
  const networkById = new Map(networks.map((row) => [row.chain_network_id, row]));
  const codecById = new Map(codecs.map((row) => [row.address_codec_id, row]));
  const allowedKinds: Record<string, Set<string>> = {
    wallet_address: new Set(["wallet_address", "wallet_or_public_key", "wallet_or_staking_identifier"]),
    validator_public_key: new Set(["validator_public_key", "wallet_or_public_key"]),
    staking_identifier: new Set(["staking_identifier", "wallet_or_staking_identifier"]),
    consensus_identifier: new Set(["consensus_identifier"]),
  };
  const networksWithNamespaces = new Set(namespaces.map((row) => row.chain_network_id));
  for (const network of networks) if (!networksWithNamespaces.has(network.chain_network_id)) throw new Error(`Network ${network.chain_network_id} has no address namespace.`);
  for (const codec of codecs) {
    if (!(CODEC_IDENTIFIER_KINDS as readonly string[]).includes(codec.identifier_kind)) throw new Error(`Invalid identifier_kind ${codec.identifier_kind} for codec ${codec.codec_code}.`);
  }
  for (const namespace of namespaces) {
    const network = networkById.get(namespace.chain_network_id);
    const codec = codecById.get(namespace.address_codec_id);
    if (!network) throw new Error(`Namespace ${namespace.namespace_code} references unknown network ${namespace.chain_network_id}.`);
    if (!codec) throw new Error(`Namespace ${namespace.namespace_code} references unknown codec ${namespace.address_codec_id}.`);
    if (!(NAMESPACE_ADDRESS_TYPES as readonly string[]).includes(namespace.address_type)) throw new Error(`Invalid address_type ${namespace.address_type} for namespace ${namespace.namespace_code}.`);
    const compatibleFamilies = codec.chain_family_compatibility.split(",").map((value) => value.trim()).filter(Boolean);
    if (!compatibleFamilies.includes(network.chain_family)) throw new Error(`Namespace ${namespace.namespace_code} uses codec ${codec.codec_code}, which is incompatible with ${network.chain_family}.`);
    if (!allowedKinds[namespace.address_type]?.has(codec.identifier_kind)) throw new Error(`Namespace ${namespace.namespace_code} routes ${namespace.address_type} through incompatible ${codec.identifier_kind} codec ${codec.codec_code}.`);
    if (namespace.is_active === "true" && codec.status === "disabled") throw new Error(`Active namespace ${namespace.namespace_code} uses a disabled codec.`);
  }
}

export function validateCapabilityCoverage(networks: U1CatalogRow[], capabilities: U1CatalogRow[]) {
  const networkIds = new Set(networks.map((row) => row.chain_network_id));
  const capabilityIds = new Set(capabilities.map((row) => row.chain_network_id));
  for (const networkId of networkIds) if (!capabilityIds.has(networkId)) throw new Error(`Network ${networkId} has no capability row.`);
  for (const capabilityId of capabilityIds) if (!networkIds.has(capabilityId)) throw new Error(`Capabilities reference unknown network ${capabilityId}.`);
}

export function validateChainAliasRows(aliases: U1CatalogRow[], networks: U1CatalogRow[], namespaces: U1CatalogRow[], codecs: U1CatalogRow[], sources: U1CatalogRow[]) {
  const networkIds = new Set(networks.map((row) => row.chain_network_id));
  const namespaceById = new Map(namespaces.map((row) => [row.namespace_id, row]));
  const codecIds = new Set(codecs.map((row) => row.address_codec_id));
  const sourceIds = new Set(sources.map((row) => row.source_id));
  const seenScopedAliases = new Set<string>();
  for (const alias of aliases) {
    const identity = `${alias.source_scope}\u0000${alias.raw_chain_name}\u0000${alias.address_type}`;
    if (seenScopedAliases.has(identity)) throw new Error(`Duplicate scoped chain alias ${alias.source_scope}: ${alias.raw_chain_name} (${alias.address_type}).`);
    seenScopedAliases.add(identity);
    if (!(CHAIN_ALIAS_STATUSES as readonly string[]).includes(alias.status)) throw new Error(`Invalid chain alias status ${alias.status}.`);
    if (!sourceIds.has(alias.source_id)) throw new Error(`Chain alias ${alias.alias_id} references unknown source ${alias.source_id}.`);
    const hasAnyMapping = Boolean(alias.chain_network_id || alias.namespace_id || alias.address_codec_id);
    const hasCompleteMapping = Boolean(alias.chain_network_id && alias.namespace_id && alias.address_codec_id);
    if (["pending_mapping", "pending_network"].includes(alias.status) && hasAnyMapping) throw new Error(`Pending chain alias ${alias.alias_id} must remain unmapped.`);
    if (alias.status === "approved" && !hasCompleteMapping) throw new Error(`Approved chain alias ${alias.alias_id} has an incomplete mapping.`);
    if (hasAnyMapping && !hasCompleteMapping) throw new Error(`Chain alias ${alias.alias_id} has a partial canonical mapping.`);
    if (hasCompleteMapping) {
      const namespace = namespaceById.get(alias.namespace_id);
      if (!networkIds.has(alias.chain_network_id) || !codecIds.has(alias.address_codec_id) || !namespace || namespace.chain_network_id !== alias.chain_network_id || namespace.address_codec_id !== alias.address_codec_id) {
        throw new Error(`Chain alias ${alias.alias_id} has an invalid network/namespace/codec mapping.`);
      }
      if (alias.address_type === "validator_public_key" && namespace.address_type !== "validator_public_key") throw new Error(`Validator public key alias ${alias.alias_id} is routed into a wallet namespace.`);
    }
    if (["approved", "not_a_network", "unsupported"].includes(alias.status) && (!alias.approved_by || !alias.approved_at)) throw new Error(`Reviewed chain alias ${alias.alias_id} is missing approval metadata.`);
  }
}

export function validateIdRangeAllocators(idRanges: U1CatalogRow[], occupancy: Map<string, [U1CatalogRow[], string]>) {
  for (const range of idRanges) {
    const definition = occupancy.get(range.range_code);
    if (!definition) {
      if (range.range_code === "u1_tagsets" && Number(range.next_id) > 0) continue;
      throw new Error(`ID range ${range.range_code} has no catalog occupancy definition.`);
    }
    const start = Number(range.start_id);
    const end = Number(range.end_id);
    const occupiedIds = definition[0].map((row) => Number(row[definition[1]])).filter((id) => id >= start && id <= end);
    const maximumOccupiedId = occupiedIds.length ? Math.max(...occupiedIds) : start - 1;
    if (Number(range.next_id) <= maximumOccupiedId) throw new Error(`${range.range_code} next_id collides with occupied ID ${maximumOccupiedId}.`);
  }
}

export async function loadAndValidateU1Catalog(root = path.join(process.cwd(), "data", "catalog", "u1")) {
  const contents = new Map<U1CatalogFile, string>();
  const rows = new Map<U1CatalogFile, U1CatalogRow[]>();
  const metricRules: U1MetricGroupRule[] = [];

  for (const file of U1_CATALOG_FILES) {
    const canonical = canonicalText(await readFile(path.join(root, file), "utf8"));
    contents.set(file, canonical);
    if (file.endsWith(".csv")) rows.set(file, parseU1Csv(file, canonical));
  }

  const networks = rows.get("chain_networks.csv") ?? [];
  const codecs = rows.get("address_codecs.csv") ?? [];
  const namespaces = rows.get("address_namespaces.csv") ?? [];
  const capabilities = rows.get("chain_capabilities.csv") ?? [];
  const aliases = rows.get("chain_aliases.csv") ?? [];
  const sources = rows.get("catalog_sources.csv") ?? [];
  const categories = rows.get("categories.csv") ?? [];
  const roles = rows.get("roles.csv") ?? [];
  const entities = rows.get("entities.csv") ?? [];
  const protocols = rows.get("protocols.csv") ?? [];
  const deployments = rows.get("protocol_deployments.csv") ?? [];
  const components = rows.get("protocol_components.csv") ?? [];
  const metricGroups = rows.get("metric_groups.csv") ?? [];
  const assets = rows.get("assets.csv") ?? [];
  const standards = rows.get("token_standards.csv") ?? [];
  const tokenContracts = rows.get("token_contracts.csv") ?? [];
  const assetNamespaces = rows.get("asset_namespaces.csv") ?? [];
  const idRanges = rows.get("id_ranges.csv") ?? [];
  const codecById = new Map(codecs.map((row) => [row.address_codec_id, row]));
  const namespaceById = new Map(namespaces.map((row) => [row.namespace_id, row]));
  const sourceIds = new Set(sources.map((row) => row.source_id));
  const categoryIds = new Set(categories.map((row) => row.category_id));
  const entityIds = new Set(entities.map((row) => row.entity_id));
  const protocolIds = new Set(protocols.map((row) => row.protocol_id));
  const deploymentById = new Map(deployments.map((row) => [row.deployment_id, row]));
  const roleIds = new Set(roles.map((row) => row.role_id));
  const namespaceIds = new Set(namespaces.map((row) => row.namespace_id));
  const assetIds = new Set(assets.map((row) => row.asset_id));
  const standardIds = new Set(standards.map((row) => row.standard_id));

  validateCanonicalNetworkRows(networks);
  validateNamespaceCodecCompatibility(networks, codecs, namespaces);
  validateCapabilityCoverage(networks, capabilities);
  validateChainAliasRows(aliases, networks, namespaces, codecs, sources);

  for (const row of [...networks, ...codecs, ...namespaces, ...aliases, ...deployments, ...components, ...assets, ...standards, ...tokenContracts, ...assetNamespaces, ...idRanges]) {
    if (row.source_id && !sourceIds.has(row.source_id)) throw new Error(`Unknown catalog source ${row.source_id}.`);
  }
  for (const row of capabilities) {
    for (const column of ["catalog_status", "normalizer_status", "mqnode_parser_status", "asset_resolver_status", "current_label_status", "timeline_status", "metric_status"]) {
      if (!(CAPABILITY_STATUSES as readonly string[]).includes(row[column])) throw new Error(`Invalid ${column} ${row[column]} for network ${row.chain_network_id}.`);
    }
    if (!(NETWORK_CATALOG_STATES as readonly string[]).includes(row.catalog_state)) throw new Error(`Invalid catalog_state ${row.catalog_state} for network ${row.chain_network_id}.`);
    for (const column of ["label_readiness", "runtime_readiness"]) {
      if (!(NETWORK_READINESS_STATES as readonly string[]).includes(row[column])) throw new Error(`Invalid ${column} ${row[column]} for network ${row.chain_network_id}.`);
    }
    if (row.support_tier && !["1", "2"].includes(row.support_tier)) throw new Error(`Invalid support_tier ${row.support_tier} for network ${row.chain_network_id}.`);
    if (["test_ready", "production_ready"].includes(row.mqnode_parser_status) && !row.mqnode_integration_test_ref) throw new Error(`Network ${row.chain_network_id} MQNODE readiness has no integration test reference.`);
    if (["test_ready", "production_ready"].includes(row.metric_status) && !row.metric_integration_test_ref) throw new Error(`Network ${row.chain_network_id} metric readiness has no integration test reference.`);
    if (row.runtime_readiness !== "not_ready" && (row.mqnode_parser_status === "unsupported" || row.metric_status === "unsupported")) throw new Error(`Network ${row.chain_network_id} cannot be runtime ready with unsupported runtime dependencies.`);
    if (row.metric_status === "production_ready" && [row.normalizer_status, row.current_label_status, row.mqnode_parser_status].includes("unsupported")) {
      throw new Error(`Unsupported network ${row.chain_network_id} cannot be metric production ready.`);
    }
  }
  const allocatorOccupancy = new Map<string, [U1CatalogRow[], string]>([
    ["legacy_categories", [categories, "category_id"]], ["u1_categories", [categories, "category_id"]],
    ["legacy_entities", [entities, "entity_id"]], ["legacy_protocols", [protocols, "protocol_id"]],
    ["legacy_roles", [roles, "role_id"]], ["u1_roles", [roles, "role_id"]],
    ["u1_networks", [networks, "chain_network_id"]], ["u1_codecs", [codecs, "address_codec_id"]],
    ["u1_namespaces", [namespaces, "namespace_id"]], ["u1_tags", [rows.get("tags.csv") ?? [], "tag_id"]],
    ["u1_components", [components, "component_id"]], ["u1_metric_groups", [metricGroups, "metric_group_id"]],
    ["u1_assets", [assets, "asset_id"]], ["u1_token_standards", [standards, "standard_id"]],
    ["u1_token_contracts", [tokenContracts, "token_contract_id"]], ["u1_protocol_deployments", [deployments, "deployment_id"]],
    ["u1_chain_aliases", [aliases, "alias_id"]],
  ]);
  validateIdRangeAllocators(idRanges, allocatorOccupancy);
  for (const row of categories) {
    if (row.parent_category_id && !categoryIds.has(row.parent_category_id)) throw new Error(`Category ${row.category_code} references unknown parent ${row.parent_category_id}.`);
  }
  for (const row of roles) {
    if (!categoryIds.has(row.category_id)) throw new Error(`Role ${row.role_code} references unknown category ${row.category_id}.`);
  }
  for (const row of entities) {
    if (!categoryIds.has(row.category_id)) throw new Error(`Entity ${row.entity_code} references unknown category ${row.category_id}.`);
  }
  for (const row of protocols) {
    if (!entityIds.has(row.entity_id)) throw new Error(`Protocol ${row.protocol_code} references unknown entity ${row.entity_id}.`);
  }
  for (const row of deployments) {
    if (!protocolIds.has(row.protocol_id)) throw new Error(`Deployment ${row.deployment_code} references unknown protocol ${row.protocol_id}.`);
    if (!namespaceIds.has(row.namespace_id)) throw new Error(`Deployment ${row.deployment_code} references unknown namespace ${row.namespace_id}.`);
  }
  for (const row of components) {
    if (!protocolIds.has(row.protocol_id)) throw new Error(`Component ${row.component_code} references unknown protocol ${row.protocol_id}.`);
    const deployment = row.deployment_id ? deploymentById.get(row.deployment_id) : null;
    if (row.deployment_id && !deployment) throw new Error(`Component ${row.component_code} references unknown deployment ${row.deployment_id}.`);
    if (deployment && deployment.protocol_id !== row.protocol_id) throw new Error(`Component ${row.component_code} protocol does not match its deployment.`);
    const namespace = namespaceById.get(row.namespace_id);
    if (!namespace || namespace.address_codec_id !== row.address_codec_id) throw new Error(`Component ${row.component_code} has an invalid namespace/codec pair.`);
    if (!roleIds.has(row.role_id)) throw new Error(`Component ${row.component_code} references unknown role ${row.role_id}.`);
    if (!categoryIds.has(row.category_id)) throw new Error(`Component ${row.component_code} references unknown category ${row.category_id}.`);
    if (!/^[0-9a-f]+$/.test(row.normalized_payload_hex) || row.normalized_payload_hex.length % 2 !== 0) throw new Error(`Component ${row.component_code} has invalid payload hex.`);
    const codec = codecById.get(row.address_codec_id)!;
    const exactLength = /^exact:(\d+)$/.exec(codec.payload_rule)?.[1];
    if (exactLength && row.normalized_payload_hex.length !== Number(exactLength) * 2) throw new Error(`Component ${row.component_code} payload length does not match ${codec.codec_code}.`);
  }
  for (const row of assetNamespaces) {
    if (!assetIds.has(row.asset_id)) throw new Error(`Asset namespace ${row.asset_namespace_id} references unknown asset ${row.asset_id}.`);
    if (!namespaceIds.has(row.namespace_id)) throw new Error(`Asset namespace ${row.asset_namespace_id} references unknown namespace ${row.namespace_id}.`);
    if (!standardIds.has(row.standard_id)) throw new Error(`Asset namespace ${row.asset_namespace_id} references unknown standard ${row.standard_id}.`);
  }
  for (const row of tokenContracts) {
    if (!assetIds.has(row.asset_id)) throw new Error(`Token contract ${row.token_contract_id} references unknown asset ${row.asset_id}.`);
    if (!standardIds.has(row.standard_id)) throw new Error(`Token contract ${row.token_contract_id} references unknown standard ${row.standard_id}.`);
    if (row.issuer_entity_id && !entityIds.has(row.issuer_entity_id)) throw new Error(`Token contract ${row.token_contract_id} references unknown issuer ${row.issuer_entity_id}.`);
    const namespace = namespaceById.get(row.namespace_id);
    if (!namespace) throw new Error(`Token contract ${row.token_contract_id} references unknown namespace ${row.namespace_id}.`);
    if (namespace.address_codec_id !== row.address_codec_id) throw new Error(`Token contract ${row.token_contract_id} has an invalid namespace/codec pair.`);
    if (!/^[0-9a-f]+$/.test(row.normalized_payload_hex) || row.normalized_payload_hex.length % 2 !== 0) throw new Error(`Token contract ${row.token_contract_id} has invalid payload hex.`);
    const codec = codecById.get(row.address_codec_id)!;
    const exactLength = /^exact:(\d+)$/.exec(codec.payload_rule)?.[1];
    if (exactLength && row.normalized_payload_hex.length !== Number(exactLength) * 2) throw new Error(`Token contract ${row.token_contract_id} payload length does not match ${codec.codec_code}.`);
  }

  const ruleLines = (contents.get("metric_group_rules.jsonl") ?? "").split("\n").filter(Boolean);
  const metricGroupById = new Map(metricGroups.map((row) => [Number(row.metric_group_id), row.metric_group_code]));
  const seenRuleGroups = new Set<number>();
  for (const [index, line] of ruleLines.entries()) {
    let rule: Record<string, unknown>;
    try {
      rule = JSON.parse(line) as Record<string, unknown>;
    } catch {
      throw new Error(`metric_group_rules.jsonl line ${index + 1} is not valid JSON.`);
    }
    const groupId = Number(rule.metric_group_id);
    if (metricGroupById.get(groupId) !== rule.metric_group_code) throw new Error(`Metric rule line ${index + 1} does not match its group ID/code.`);
    if (!Number.isInteger(rule.rule_version) || Number(rule.rule_version) < 1) throw new Error(`Metric rule line ${index + 1} has an invalid rule_version.`);
    if (!Number.isInteger(rule.source_id) || !sourceIds.has(String(rule.source_id))) throw new Error(`Metric rule line ${index + 1} references an unknown source_id.`);
    if (typeof rule.status !== "string" || !rule.status) throw new Error(`Metric rule line ${index + 1} has no status.`);
    if (seenRuleGroups.has(groupId)) throw new Error(`Metric group ${groupId} has duplicate active catalog rules.`);
    seenRuleGroups.add(groupId);
    metricRules.push(rule as U1MetricGroupRule);
  }
  for (const row of metricGroups) {
    if (!seenRuleGroups.has(Number(row.metric_group_id))) throw new Error(`Metric group ${row.metric_group_code} has no rule.`);
  }

  const hash = createHash("sha256");
  for (const file of [...U1_CATALOG_FILES].sort()) hash.update(`${file}\n${contents.get(file)}\n`);
  return { root, rows, metricRules, dictionaryVersion: hash.digest("hex") };
}
