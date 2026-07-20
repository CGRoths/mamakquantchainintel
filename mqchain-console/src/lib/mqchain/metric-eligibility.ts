export type MetricEligibilityInput = Readonly<{
  requested: boolean;
  roleCode: string | null;
  roleMetricUsageDefault: string | null;
  confidenceScore: number;
  labelStatus: number;
  identifierKind: string;
  sourceVerificationSatisfied: boolean;
  matchingTrustTiers: readonly string[];
}>;

export function validateMetricEligibility(input: MetricEligibilityInput) {
  if (!input.requested) return { eligible: false, blockers: [] as string[] };
  const blockers: string[] = [];
  const role = input.roleCode?.toLowerCase() ?? "";
  const metricDefault = input.roleMetricUsageDefault?.toLowerCase() ?? "";
  if (!role) blockers.push("unresolved_role");
  if (["reference", "validator", "adapter", "unresolved"].some(value => role.includes(value))) blockers.push("reference_or_non_metric_role");
  if (["excluded", "never", "reference_only", "not_eligible"].includes(metricDefault)) blockers.push("role_metric_default_excludes");
  if (!["wallet_address", "wallet_or_public_key"].includes(input.identifierKind)) blockers.push("non_wallet_identifier");
  if (!input.sourceVerificationSatisfied) blockers.push("source_unverified");
  if (!input.matchingTrustTiers.some(value => value === "official" || value === "verified_third_party")) blockers.push("source_trust_too_weak");
  if (input.confidenceScore < 70) blockers.push("confidence_below_metric_threshold");
  if (input.labelStatus !== 1) blockers.push("label_not_active_current");
  return { eligible: blockers.length === 0, blockers };
}
