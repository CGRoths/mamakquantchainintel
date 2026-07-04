import { describe, expect, it } from "vitest";

import { seedCategories, seedEntities, seedMetricGroups, seedPrefixes, seedProtocols, seedRoles } from "@/lib/mqchain/data/seed-data";

const REQUIRED_CATEGORY_CODES = [
  "cex",
  "cex_reserve",
  "cex_deposit",
  "cex_hot_cold",
  "defi",
  "defi_dex",
  "defi_lending",
  "defi_yield",
  "bridge",
  "custody",
  "issuer",
  "oracle",
  "governance",
  "treasury",
  "risk",
  "mixer",
  "sanction",
];

const REQUIRED_ENTITY_CATEGORY_IDS = {
  binance: 100,
  okx: 100,
  bybit: 100,
  coinbase: 100,
  kraken: 100,
  bitfinex: 100,
  bitget: 100,
  kucoin: 100,
  gate: 100,
  mexc: 100,
  crypto_com: 100,
  gemini: 100,
  deribit: 100,
  bitstamp: 100,
  upbit: 100,
  bithumb: 100,
  htx: 100,
  indodax: 100,
  luno: 100,
  bitmex: 100,
  aave: 220,
  uniswap: 210,
  morpho: 220,
  curve: 210,
  compound: 220,
  lido: 230,
  sky: 200,
  chainlink: 600,
  layerzero: 300,
  wormhole: 300,
  stargate: 300,
} as const;

const REQUIRED_PROTOCOL_CODES = [
  "aave_v3",
  "uniswap_v2",
  "uniswap_v3",
  "morpho_blue",
  "curve_stableswap",
  "curve_crypto_pools",
  "compound_v3",
  "lido_staking",
  "sky_protocol",
  "chainlink_price_feeds",
  "layerzero_endpoint_v2",
  "wormhole_token_bridge",
  "stargate_v2",
];

const REQUIRED_PREFIX_CHAINS = ["btc", "ethereum", "polygon", "base", "arbitrum", "optimism", "bsc", "solana", "tron"];

const REQUIRED_ROLE_CODES = [
  "cex_por_cold_wallet",
  "cex_cold_wallet",
  "cex_hot_wallet",
  "cex_deposit_wallet",
  "cex_withdrawal_wallet",
  "cex_internal_wallet",
  "cex_gas_wallet",
  "cex_fee_wallet",
  "cex_reserve_wallet",
  "cex_candidate_wallet",
  "protocol_factory",
  "protocol_registry",
  "protocol_router",
  "protocol_pool",
  "protocol_vault",
  "protocol_oracle",
  "protocol_treasury",
  "protocol_multisig",
  "protocol_governance",
  "protocol_timelock",
  "protocol_proxy",
  "protocol_proxy_admin",
  "protocol_implementation",
  "protocol_reward_distributor",
  "protocol_incentives_controller",
  "protocol_data_provider",
  "protocol_keeper",
  "protocol_bridge_adapter",
  "aave_pool_addresses_provider",
  "aave_pool",
  "aave_pool_configurator",
  "aave_oracle",
  "aave_acl_manager",
  "aave_data_provider",
  "aave_atoken",
  "aave_variable_debt_token",
  "aave_stable_debt_token",
  "uniswap_v2_factory",
  "uniswap_v2_pair",
  "uniswap_v2_router",
  "uniswap_v3_factory",
  "uniswap_v3_pool",
  "uniswap_v3_position_manager",
  "bridge_router",
  "bridge_vault",
  "bridge_relayer",
  "bridge_adapter",
  "bridge_messenger",
  "mixer",
  "sanctioned_wallet",
  "scam_wallet",
  "exploit_wallet",
  "darkweb_wallet",
  "gambling_wallet",
];

const REQUIRED_METRIC_GROUP_CODES = [
  "btc_cex_flow_boundary",
  "btc_cex_reserve_boundary",
  "btc_cex_core_hot_cold",
  "btc_cex_deposit_candidates",
  "eth_cex_native_flow_boundary",
  "eth_cex_erc20_flow_boundary",
  "stablecoin_cex_flow_boundary",
  "defi_protocol_asset_container",
  "bridge_flow_boundary",
];

function ruleList(rule: unknown, key: string) {
  if (!rule || typeof rule !== "object") {
    return [];
  }

  const value = (rule as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : [];
}

describe("mqchain seed data", () => {
  it("covers the required category, entity, protocol, prefix, and role taxonomy", () => {
    const categoryCodes = new Set(seedCategories.map(([, categoryCode]) => categoryCode));
    const entityByCode = new Map<string, { entityName: string; entityType: string; categoryId: number }>(
      seedEntities.map(([entityCode, entityName, entityType, categoryId]) => [entityCode, { entityName, entityType, categoryId }]),
    );
    const protocolCodes = new Set(seedProtocols.map(([, protocolCode]) => protocolCode));
    const prefixChains = new Set(seedPrefixes.map(([, chainCode]) => chainCode));
    const roleCodes = new Set(seedRoles.map((role) => role.roleCode));

    expect([...categoryCodes]).toEqual(expect.arrayContaining(REQUIRED_CATEGORY_CODES));
    expect([...protocolCodes]).toEqual(expect.arrayContaining(REQUIRED_PROTOCOL_CODES));
    expect([...prefixChains]).toEqual(expect.arrayContaining(REQUIRED_PREFIX_CHAINS));
    expect([...roleCodes]).toEqual(expect.arrayContaining(REQUIRED_ROLE_CODES));

    for (const [entityCode, categoryId] of Object.entries(REQUIRED_ENTITY_CATEGORY_IDS)) {
      expect(entityByCode.get(entityCode)).toMatchObject({ categoryId });
    }
  });

  it("keeps protocol seeds attached to known protocol entities", () => {
    const entityCodes = new Set(seedEntities.map(([entityCode]) => entityCode));
    const protocolEntityCodes = new Set(seedProtocols.map(([entityCode]) => entityCode));

    expect([...protocolEntityCodes]).toEqual(
      expect.arrayContaining(["aave", "uniswap", "morpho", "curve", "compound", "lido", "sky", "chainlink", "layerzero", "wormhole", "stargate"]),
    );

    for (const entityCode of protocolEntityCodes) {
      expect(entityCodes.has(entityCode)).toBe(true);
    }
  });

  it("defines the required metric group universe with explicit include rules", () => {
    const groupsByCode = new Map<string, (typeof seedMetricGroups)[number]>(seedMetricGroups.map((group) => [group.metricGroupCode, group]));

    expect([...groupsByCode.keys()]).toEqual(expect.arrayContaining(REQUIRED_METRIC_GROUP_CODES));

    for (const metricGroupCode of REQUIRED_METRIC_GROUP_CODES) {
      const group = groupsByCode.get(metricGroupCode);
      const includeRoles = ruleList(group?.ruleJson, "includeRoles");
      const includeCategories = ruleList(group?.ruleJson, "includeCategories");
      const includeEntities = ruleList(group?.ruleJson, "includeEntities");

      expect(group, metricGroupCode).toBeDefined();
      expect([...includeRoles, ...includeCategories, ...includeEntities].length, metricGroupCode).toBeGreaterThan(0);
      expect(group?.ruleJson.minConfidence, metricGroupCode).toBe(group?.minConfidence);
      expect(group?.ruleJson.requireMetricEligible, metricGroupCode).toBe(group?.requireMetricEligible);
    }
  });

  it("keeps BTC CEX production metric groups role-scoped instead of broad category shortcuts", () => {
    const groupsByCode = new Map<string, (typeof seedMetricGroups)[number]>(seedMetricGroups.map((group) => [group.metricGroupCode, group]));

    for (const metricGroupCode of ["btc_cex_flow_boundary", "btc_cex_reserve_boundary"]) {
      const group = groupsByCode.get(metricGroupCode);

      expect(group).toMatchObject({
        chainCode: "btc",
        requireMetricEligible: true,
      });
      expect(ruleList(group?.ruleJson, "includeRoles").length).toBeGreaterThan(0);
      expect(ruleList(group?.ruleJson, "excludeRoles").length).toBeGreaterThan(0);
      expect(Object.hasOwn(group?.ruleJson ?? {}, "includeCategories")).toBe(false);
      expect(Object.hasOwn(group?.ruleJson ?? {}, "excludeCategories")).toBe(false);
    }
  });
});
