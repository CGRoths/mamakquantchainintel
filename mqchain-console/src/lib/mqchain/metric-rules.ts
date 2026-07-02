import { FLAG_BITS, hasFlag } from "./flags";
import type { MetricGroupRule, RegistryMatchInput } from "./types";

export type MetricGroupMatchDefinition = {
  id: number;
  metricGroupCode: string;
  metricGroupName: string;
  minConfidence: number;
  requireMetricEligible: boolean;
  rules: MetricGroupRule[];
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

export function matchingMetricGroupsForRow(row: RegistryMatchInput, groups: MetricGroupMatchDefinition[]) {
  return groups.filter((group) =>
    group.rules.some((rule) =>
      matchesMetricGroupRule(row, {
        ...rule,
        minConfidence: rule.minConfidence ?? group.minConfidence,
        requireMetricEligible: rule.requireMetricEligible ?? group.requireMetricEligible,
      }),
    ),
  );
}
