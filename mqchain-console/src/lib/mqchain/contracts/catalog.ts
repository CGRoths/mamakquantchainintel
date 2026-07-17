export const ORIGIN_CATALOG_KEYS = [
  "networks",
  "codecs",
  "components",
  "assets",
  "token-standards",
  "coverage",
] as const;

export type OriginCatalogKey = (typeof ORIGIN_CATALOG_KEYS)[number];

export const CATALOG_KEY_TO_FILE = {
  networks: "chain_networks.csv",
  codecs: "address_codecs.csv",
  components: "protocol_components.csv",
  assets: "assets.csv",
  "token-standards": "token_standards.csv",
} as const;

export type OriginCatalogFile = (typeof CATALOG_KEY_TO_FILE)[OriginCatalogKey & keyof typeof CATALOG_KEY_TO_FILE];

export type OriginCatalogResponse = {
  catalogKey: OriginCatalogKey;
  file: string | null;
  dictionaryVersion: string;
  rows: Array<Record<string, string>>;
  capabilities?: Array<Record<string, string>>;
};

