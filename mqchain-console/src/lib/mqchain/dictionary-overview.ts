export type DictionaryInventoryInput = {
  entities: { isActive: boolean }[];
  protocols: { isActive: boolean }[];
  roles: { isActive: boolean }[];
  categories: { isActive: boolean }[];
  prefixes: { isActive: boolean }[];
  metricGroups: { isActive: boolean }[];
  metricGroupRules: unknown[];
};

export type DictionaryInventoryRow = {
  key: "entities" | "protocols" | "roles" | "categories" | "key_prefixes" | "metric_groups";
  label: string;
  href: string;
  total: number;
  active: number;
  ruleCount?: number;
  description: string;
};

function activeCount(rows: { isActive: boolean }[]) {
  return rows.filter((row) => row.isActive).length;
}

export function buildDictionaryInventory(input: DictionaryInventoryInput): DictionaryInventoryRow[] {
  return [
    {
      key: "entities",
      label: "Entities",
      href: "/mqchain/dictionaries/entities",
      total: input.entities.length,
      active: activeCount(input.entities),
      description: "Owners and controllers for approved address truth.",
    },
    {
      key: "protocols",
      label: "Protocols",
      href: "/mqchain/dictionaries/protocols",
      total: input.protocols.length,
      active: activeCount(input.protocols),
      description: "Products and subsystems under entities.",
    },
    {
      key: "roles",
      label: "Roles",
      href: "/mqchain/dictionaries/roles",
      total: input.roles.length,
      active: activeCount(input.roles),
      description: "Address functions, default flags, and metric behavior.",
    },
    {
      key: "categories",
      label: "Categories",
      href: "/mqchain/dictionaries/categories",
      total: input.categories.length,
      active: activeCount(input.categories),
      description: "Taxonomy domains for exchange, DeFi, custody, risk, and protocol labels.",
    },
    {
      key: "key_prefixes",
      label: "Key Prefixes",
      href: "/mqchain/dictionaries/key-prefixes",
      total: input.prefixes.length,
      active: activeCount(input.prefixes),
      description: "Compact chain/address encoding used by resolver and KV artifacts.",
    },
    {
      key: "metric_groups",
      label: "Metric Groups",
      href: "/mqchain/metric-groups",
      total: input.metricGroups.length,
      active: activeCount(input.metricGroups),
      ruleCount: input.metricGroupRules.length,
      description: "Countable universes for CEX flow, reserve, and protocol graph metrics.",
    },
  ];
}
