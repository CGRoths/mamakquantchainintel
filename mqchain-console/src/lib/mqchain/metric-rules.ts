import { FLAG_BITS, hasFlag } from "./flags";
import type { MetricGroupRule, RegistryMatchInput } from "./types";

export type MetricGroupMatchDefinition = {
  id: number;
  metricGroupCode: string;
  metricGroupName: string;
  chainCode?: string | null;
  minConfidence: number;
  requireMetricEligible: boolean;
  rules: MetricGroupRule[];
};

export type MetricGroupRuleSection = {
  key: keyof MetricGroupRule | "policy";
  label: string;
  values: string[];
  intent: "include" | "exclude" | "policy";
};

function includesAny(list: string[] | undefined, value?: string | null) {
  if (!list?.length || !value) {
    return false;
  }

  return list.includes(value);
}

function missesRequired(list: string[] | undefined, value?: string | null) {
  return Boolean(list?.length) && !includesAny(list, value);
}

export function metricGroupAppliesToChain(groupChainCode?: string | null, rowChainCode?: string | null) {
  return !groupChainCode || groupChainCode === rowChainCode;
}

export function matchesMetricGroupRule(row: RegistryMatchInput, rule: MetricGroupRule) {
  if (rule.minConfidence !== undefined && row.confidenceScore < rule.minConfidence) {
    return false;
  }

  if (rule.requireMetricEligible !== false && !hasFlag(row.flags, FLAG_BITS.metricEligible)) {
    return false;
  }

  if (missesRequired(rule.includeRoles, row.roleCode)) {
    return false;
  }

  if (missesRequired(rule.includeCategories, row.categoryCode)) {
    return false;
  }

  if (missesRequired(rule.includeEntities, row.entityCode)) {
    return false;
  }

  if (includesAny(rule.excludeRoles, row.roleCode)) {
    return false;
  }

  if (includesAny(rule.excludeCategories, row.categoryCode)) {
    return false;
  }

  if (includesAny(rule.excludeEntities, row.entityCode)) {
    return false;
  }

  return true;
}

export function metricGroupRuleSections(rule: MetricGroupRule): MetricGroupRuleSection[] {
  const sections: MetricGroupRuleSection[] = ([
    { key: "includeRoles", label: "Include roles", values: rule.includeRoles ?? [], intent: "include" },
    { key: "includeCategories", label: "Include categories", values: rule.includeCategories ?? [], intent: "include" },
    { key: "includeEntities", label: "Include entities", values: rule.includeEntities ?? [], intent: "include" },
    { key: "excludeRoles", label: "Exclude roles", values: rule.excludeRoles ?? [], intent: "exclude" },
    { key: "excludeCategories", label: "Exclude categories", values: rule.excludeCategories ?? [], intent: "exclude" },
    { key: "excludeEntities", label: "Exclude entities", values: rule.excludeEntities ?? [], intent: "exclude" },
  ] satisfies MetricGroupRuleSection[]).filter((section) => section.values.length > 0);

  const policyValues = [
    rule.minConfidence !== undefined ? `min confidence ${rule.minConfidence}` : undefined,
    rule.requireMetricEligible === false ? "metric eligible not required" : "metric eligible required",
  ].filter(Boolean) as string[];

  return [...sections, { key: "policy", label: "Policy", values: policyValues, intent: "policy" }];
}

export function matchingMetricGroupsForRow(row: RegistryMatchInput, groups: MetricGroupMatchDefinition[]) {
  return groups.filter((group) =>
    metricGroupAppliesToChain(group.chainCode, row.chainCode) &&
    group.rules.some((rule) =>
      matchesMetricGroupRule(row, {
        ...rule,
        minConfidence: rule.minConfidence ?? group.minConfidence,
        requireMetricEligible: rule.requireMetricEligible ?? group.requireMetricEligible,
      }),
    ),
  );
}
