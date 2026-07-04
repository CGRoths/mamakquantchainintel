import { TRUST_TIERS, type TrustTier } from "./constants";

const TRUST_TIER_SET = new Set<string>(TRUST_TIERS);

export function isTrustTier(value: unknown): value is TrustTier {
  return typeof value === "string" && TRUST_TIER_SET.has(value);
}

export function normalizeEvidenceTrustTier(value: unknown, fallback: TrustTier = "weak"): TrustTier {
  return isTrustTier(value) ? value : fallback;
}

export function defaultEvidenceTrustTierForSource(sourceType: string): TrustTier {
  if (sourceType === "official_url" || sourceType === "github") return "official";
  if (sourceType === "pdf") return "verified_third_party";
  if (sourceType === "ml_discovery" || sourceType === "onchain_discovery") return "inferred";
  return "weak";
}
