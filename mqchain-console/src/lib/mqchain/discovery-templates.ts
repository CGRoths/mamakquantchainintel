export const DISCOVERY_SCANNER_TEMPLATES = [
  {
    type: "factory_event_scanner",
    label: "Factory event scanner",
    rootType: "Factory",
    evidenceType: "factory_event",
    description: "Scans factory-created child contracts such as pairs, pools, vaults, or clones.",
    defaultChain: "ethereum",
    requiredConfig: ["event_signature", "from_block", "expected_child_role"],
    outputFields: ["child address", "event args", "tx hash", "block", "log index"],
    defaultConfig: {
      event_signature: "PairCreated(address,address,address,uint256)",
      from_block: 0,
      to_block: "",
      expected_child_role: "uniswap_v2_pair",
      child_address_arg: "pair",
      protocol_id: "",
    },
  },
  {
    type: "registry_address_provider_scanner",
    label: "Registry/address provider scanner",
    rootType: "Registry",
    evidenceType: "registry_call",
    description: "Calls registry or address-provider view functions that return protocol root addresses.",
    defaultChain: "ethereum",
    requiredConfig: ["view_functions", "expected_roles"],
    outputFields: ["function name", "return value", "block", "ABI fragment"],
    defaultConfig: {
      view_functions: ["getPool()", "getPoolConfigurator()", "getPriceOracle()"],
      expected_roles: ["aave_pool", "aave_pool_configurator", "aave_oracle"],
      protocol_id: "",
      abi_fragment: "",
    },
  },
  {
    type: "proxy_resolution_scanner",
    label: "Proxy resolution scanner",
    rootType: "Proxy",
    evidenceType: "proxy_resolution",
    description: "Resolves implementation and admin addresses for proxy contracts.",
    defaultChain: "ethereum",
    requiredConfig: ["proxy_type"],
    outputFields: ["implementation address", "proxy admin", "storage slot", "block"],
    defaultConfig: {
      proxy_type: "eip1967",
      include_proxy_admin: true,
      implementation_role: "protocol_implementation",
      admin_role: "protocol_proxy_admin",
      block_number: "",
    },
  },
  {
    type: "pool_vault_inspector",
    label: "Pool/vault inspector",
    rootType: "PoolVault",
    evidenceType: "token_balance",
    description: "Inspects pool or vault assets, reserves, supply, and asset-container metadata.",
    defaultChain: "ethereum",
    requiredConfig: ["abi_type"],
    outputFields: ["token0/token1", "asset", "reserves", "total supply", "activity"],
    defaultConfig: {
      abi_type: "erc4626_vault",
      inspect_assets: true,
      inspect_recent_activity: true,
      expected_role: "protocol_vault",
      block_number: "",
    },
  },
  {
    type: "tx_graph_scanner",
    label: "TX graph scanner",
    rootType: "TxGraph",
    evidenceType: "tx_pattern",
    description: "Finds repeated counterparties, fan-in, consolidation, and internal movement candidates.",
    defaultChain: "btc",
    requiredConfig: ["from_block", "to_block", "thresholds"],
    outputFields: ["counterparty", "flow pattern", "count", "value", "confidence"],
    defaultConfig: {
      from_block: 0,
      to_block: "",
      thresholds: {
        min_transaction_count: 5,
        min_total_value: 0,
      },
      known_entity_id: "",
      pattern: "deposit_fan_in",
    },
  },
  {
    type: "llm_ml_evidence_reviewer",
    label: "LLM/ML evidence reviewer",
    rootType: "EvidenceReview",
    evidenceType: "llm_analysis",
    description: "Structures evidence and proposes labels while keeping candidates in pending review.",
    defaultChain: "ethereum",
    requiredConfig: ["reviewer_mode"],
    outputFields: ["suggested entity", "role", "confidence", "reasoning", "source pointers"],
    defaultConfig: {
      reviewer_mode: "llm",
      candidate_group_key: "",
      source_document_id: "",
      prompt_profile: "evidence_structuring_v1",
    },
  },
] as const;

export type DiscoveryScannerTemplate = (typeof DISCOVERY_SCANNER_TEMPLATES)[number];
export type DiscoveryScannerType = DiscoveryScannerTemplate["type"];

export const DISCOVERY_SCANNER_TYPE_VALUES = DISCOVERY_SCANNER_TEMPLATES.map((template) => template.type);

export function getDiscoveryTemplate(discoveryType: string) {
  return DISCOVERY_SCANNER_TEMPLATES.find((template) => template.type === discoveryType) ?? null;
}

export function isKnownDiscoveryType(discoveryType: string): discoveryType is DiscoveryScannerType {
  return DISCOVERY_SCANNER_TYPE_VALUES.includes(discoveryType as DiscoveryScannerType);
}

export function formatDiscoveryConfigTemplate(discoveryType: string) {
  const template = getDiscoveryTemplate(discoveryType) ?? DISCOVERY_SCANNER_TEMPLATES[0];
  return JSON.stringify(template.defaultConfig, null, 2);
}
