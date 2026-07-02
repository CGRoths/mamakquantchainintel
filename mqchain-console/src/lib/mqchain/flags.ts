import type { RegistryMatchInput } from "./types";

export const FLAG_BITS = {
  metricEligible: 0,
  historicalOnly: 1,
  activeLabel: 2,
  conflict: 3,
  deprecated: 4,
  manuallyCurated: 5,
  officialSource: 6,
  inferred: 7,
  manualReviewed: 8,
  clusterLabel: 9,
  protocolRoot: 10,
  assetContainer: 11,
  hasSecondaryRoles: 12,
  hasAuditPtr: 13,
} as const;

export type FlagKey = keyof typeof FLAG_BITS;

export type FlagDefinition = {
  key: FlagKey;
  bit: number;
  label: string;
  description: string;
  tone: "positive" | "neutral" | "warning" | "danger";
};

export const FLAG_DEFINITIONS: FlagDefinition[] = [
  {
    key: "metricEligible",
    bit: FLAG_BITS.metricEligible,
    label: "metric eligible",
    description: "Included in metric-group candidate universes when confidence and rules also pass.",
    tone: "positive",
  },
  {
    key: "historicalOnly",
    bit: FLAG_BITS.historicalOnly,
    label: "historical only",
    description: "Kept for point-in-time resolution but not treated as a current active label.",
    tone: "warning",
  },
  {
    key: "activeLabel",
    bit: FLAG_BITS.activeLabel,
    label: "active label",
    description: "Represents a current canonical label unless superseded or deactivated.",
    tone: "positive",
  },
  {
    key: "conflict",
    bit: FLAG_BITS.conflict,
    label: "conflict",
    description: "Has known conflicting evidence or review state.",
    tone: "danger",
  },
  {
    key: "deprecated",
    bit: FLAG_BITS.deprecated,
    label: "deprecated",
    description: "Should be phased out in favor of a newer registry label.",
    tone: "warning",
  },
  {
    key: "manuallyCurated",
    bit: FLAG_BITS.manuallyCurated,
    label: "manual curated",
    description: "Curated directly by an operator.",
    tone: "neutral",
  },
  {
    key: "officialSource",
    bit: FLAG_BITS.officialSource,
    label: "official source",
    description: "Backed by official or first-party evidence.",
    tone: "positive",
  },
  {
    key: "inferred",
    bit: FLAG_BITS.inferred,
    label: "inferred",
    description: "Derived from patterns, discovery, ML, or non-official evidence.",
    tone: "warning",
  },
  {
    key: "manualReviewed",
    bit: FLAG_BITS.manualReviewed,
    label: "reviewed",
    description: "Reviewed by a human operator.",
    tone: "positive",
  },
  {
    key: "clusterLabel",
    bit: FLAG_BITS.clusterLabel,
    label: "cluster",
    description: "Represents a clustered address label.",
    tone: "neutral",
  },
  {
    key: "protocolRoot",
    bit: FLAG_BITS.protocolRoot,
    label: "protocol root",
    description: "Protocol root contract such as factory, router, registry, oracle, governance, or admin.",
    tone: "neutral",
  },
  {
    key: "assetContainer",
    bit: FLAG_BITS.assetContainer,
    label: "asset container",
    description: "Pool, vault, reserve, bridge, or other asset-holding contract.",
    tone: "neutral",
  },
  {
    key: "hasSecondaryRoles",
    bit: FLAG_BITS.hasSecondaryRoles,
    label: "secondary roles",
    description: "Carries additional approved roles in registry metadata.",
    tone: "neutral",
  },
  {
    key: "hasAuditPtr",
    bit: FLAG_BITS.hasAuditPtr,
    label: "audit ptr",
    description: "Has an external or structured audit pointer.",
    tone: "neutral",
  },
];

export function hasFlag(flags: number, bit: number) {
  return (flags & (1 << bit)) !== 0;
}

export function setFlag(flags: number, bit: number) {
  return flags | (1 << bit);
}

export function clearFlag(flags: number, bit: number) {
  return flags & ~(1 << bit);
}

export function buildDefaultFlags(roleCode?: string | null, qualityTier = 1, metricEligible = false) {
  let flags = 0;

  if (metricEligible) {
    flags = setFlag(flags, FLAG_BITS.metricEligible);
  }

  flags = setFlag(flags, FLAG_BITS.activeLabel);

  if (qualityTier >= 3) {
    flags = setFlag(flags, FLAG_BITS.manualReviewed);
  }

  if (roleCode?.startsWith("protocol_") || roleCode?.startsWith("aave_") || roleCode?.startsWith("uniswap_")) {
    flags = setFlag(flags, FLAG_BITS.protocolRoot);
  }

  if (roleCode?.includes("pool") || roleCode?.includes("vault")) {
    flags = setFlag(flags, FLAG_BITS.assetContainer);
  }

  return flags;
}

export function markHistoricalOnlyFlags(flags: number) {
  return clearFlag(clearFlag(setFlag(flags, FLAG_BITS.historicalOnly), FLAG_BITS.metricEligible), FLAG_BITS.activeLabel);
}

export function applyMetricEligibilityToFlags(flags: number, metricEligible: boolean) {
  return metricEligible ? setFlag(flags, FLAG_BITS.metricEligible) : clearFlag(flags, FLAG_BITS.metricEligible);
}

export function activeFlagDefinitions(flags: number) {
  return FLAG_DEFINITIONS.filter((definition) => hasFlag(flags, definition.bit));
}

export function isMetricEligible(input: RegistryMatchInput) {
  return hasFlag(input.flags, FLAG_BITS.metricEligible) && input.confidenceScore >= 70;
}
