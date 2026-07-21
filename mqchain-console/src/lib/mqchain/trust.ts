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

const TRUST_RANK: Record<TrustTier, number> = { conflict: -1, weak: 0, inferred: 1, verified_third_party: 2, official: 3 };

export function buildEvidenceTrustDisplay(input: {
  sourceType: string;
  importedTrust: string;
  verificationStatus: string;
  verificationTrustTiers: readonly string[];
}) {
  const imported = normalizeEvidenceTrustTier(input.importedTrust);
  const verifiedTiers = input.verificationTrustTiers.filter(isTrustTier);
  const blocked = input.verificationStatus === "source_verification_blocked" || verifiedTiers.includes("conflict");
  const mqchainTrust = blocked
    ? "conflict"
    : [...verifiedTiers].sort((left, right) => TRUST_RANK[right] - TRUST_RANK[left])[0] ?? null;
  const effectiveTrust = blocked
    ? "conflict"
    : mqchainTrust && TRUST_RANK[mqchainTrust] > TRUST_RANK[imported]
      ? mqchainTrust
      : imported;
  return {
    importedTrust: imported,
    importedTrustLabel: input.sourceType === "llm_cleaned_csv" && imported === "weak" ? "Unverified input (weak default)" : imported.replace(/_/g, " "),
    mqchainVerificationTrust: mqchainTrust,
    effectiveTrust,
  };
}
