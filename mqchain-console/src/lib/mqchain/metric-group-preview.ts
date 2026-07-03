import { FLAG_BITS, hasFlag } from "./flags";
import { matchesMetricGroupRule, metricGroupAppliesToChain } from "./metric-rules";
import type { MetricGroupRule } from "./types";

export type MetricGroupPreviewGroup = {
  id: number;
  metricGroupCode: string;
  metricGroupName: string;
  chainCode?: string | null;
  minConfidence: number;
  requireMetricEligible: boolean;
};

export type MetricGroupPreviewRow = {
  registry: {
    id: number;
    chainCode: string;
    normalizedAddress: string;
    confidenceScore: number;
    qualityTier: number;
    flags: number;
    isActive: boolean;
  };
  entity?: { entityCode: string | null; entityName?: string | null } | null;
  role?: { roleCode: string | null } | null;
  category?: { categoryCode: string | null } | null;
};

export type MetricGroupPreviewDiagnostics = {
  evaluatedRows: number;
  memberRows: number;
  excludedInactive: number;
  excludedOutOfChainScope: number;
  excludedMetricIneligible: number;
  excludedRuleMismatch: number;
};

function countBy(rows: MetricGroupPreviewRow[], value: (row: MetricGroupPreviewRow) => string | null | undefined) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const key = value(row) || "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function effectiveRule(group: MetricGroupPreviewGroup, rule: MetricGroupRule) {
  return {
    ...rule,
    minConfidence: rule.minConfidence ?? group.minConfidence,
    requireMetricEligible: rule.requireMetricEligible ?? group.requireMetricEligible,
  };
}

function rowMatchInput(row: MetricGroupPreviewRow) {
  return {
    roleCode: row.role?.roleCode,
    categoryCode: row.category?.categoryCode,
    entityCode: row.entity?.entityCode,
    confidenceScore: row.registry.confidenceScore,
    flags: row.registry.flags,
  };
}

function failsOnlyMetricEligibility(group: MetricGroupPreviewGroup, rules: MetricGroupRule[], row: MetricGroupPreviewRow) {
  if (hasFlag(row.registry.flags, FLAG_BITS.metricEligible)) {
    return false;
  }

  const matchInput = rowMatchInput(row);
  return rules.some((rule) => {
    const ruleWithDefaults = effectiveRule(group, rule);
    if (ruleWithDefaults.requireMetricEligible === false) {
      return false;
    }

    return matchesMetricGroupRule(matchInput, {
      ...ruleWithDefaults,
      requireMetricEligible: false,
    });
  });
}

export function evaluateMetricGroupPreviewMembers(
  group: MetricGroupPreviewGroup,
  rules: MetricGroupRule[],
  rows: MetricGroupPreviewRow[],
) {
  const members: MetricGroupPreviewRow[] = [];
  const diagnostics: MetricGroupPreviewDiagnostics = {
    evaluatedRows: rows.length,
    memberRows: 0,
    excludedInactive: 0,
    excludedOutOfChainScope: 0,
    excludedMetricIneligible: 0,
    excludedRuleMismatch: 0,
  };

  for (const row of rows) {
    if (!row.registry.isActive) {
      diagnostics.excludedInactive += 1;
      continue;
    }

    if (!metricGroupAppliesToChain(group.chainCode, row.registry.chainCode)) {
      diagnostics.excludedOutOfChainScope += 1;
      continue;
    }

    const matches = rules.some((rule) => matchesMetricGroupRule(rowMatchInput(row), effectiveRule(group, rule)));
    if (matches) {
      members.push(row);
      continue;
    }

    if (failsOnlyMetricEligibility(group, rules, row)) {
      diagnostics.excludedMetricIneligible += 1;
    } else {
      diagnostics.excludedRuleMismatch += 1;
    }
  }

  diagnostics.memberRows = members.length;

  return { members, diagnostics };
}

export function filterMetricGroupPreviewMembers(
  group: MetricGroupPreviewGroup,
  rules: MetricGroupRule[],
  rows: MetricGroupPreviewRow[],
) {
  return evaluateMetricGroupPreviewMembers(group, rules, rows).members;
}

export function buildMetricGroupCompilePreviewManifest(input: {
  group: MetricGroupPreviewGroup;
  rules: MetricGroupRule[];
  members: MetricGroupPreviewRow[];
  diagnostics?: MetricGroupPreviewDiagnostics;
  focusedRegistryId?: number | null;
}) {
  const focusedRegistryId = input.focusedRegistryId ?? null;
  const focusedMember = focusedRegistryId
    ? input.members.find((row) => row.registry.id === focusedRegistryId) ?? null
    : null;

  return {
    artifactType: "metric_group_preview",
    artifactStatus: "preview_only",
    metricGroupId: input.group.id,
    metricGroupCode: input.group.metricGroupCode,
    metricGroupName: input.group.metricGroupName,
    chainCode: input.group.chainCode ?? null,
    rowCount: input.members.length,
    registryIds: input.members.map((row) => row.registry.id).sort((left, right) => left - right),
    focusedRegistryId,
    focusedRegistryIncluded: focusedRegistryId ? Boolean(focusedMember) : null,
    ruleCount: input.rules.length,
    minConfidence: input.group.minConfidence,
    requireMetricEligible: input.group.requireMetricEligible,
    diagnostics: input.diagnostics ?? {
      evaluatedRows: input.members.length,
      memberRows: input.members.length,
      excludedInactive: 0,
      excludedOutOfChainScope: 0,
      excludedMetricIneligible: 0,
      excludedRuleMismatch: 0,
    },
    distributions: {
      roles: countBy(input.members, (row) => row.role?.roleCode),
      entities: countBy(input.members, (row) => row.entity?.entityCode),
      chains: countBy(input.members, (row) => row.registry.chainCode),
    },
    note: "Preview uses active registry rows only and enforces the metric group's chain scope before rule matching.",
  };
}

export function buildPendingMetricGroupKvManifest(input: {
  group: MetricGroupPreviewGroup;
  rules: MetricGroupRule[];
  members: MetricGroupPreviewRow[];
  focusedRegistryId?: number | null;
}) {
  const preview = buildMetricGroupCompilePreviewManifest(input);

  return {
    ...preview,
    reason: "metric_group_compile",
    artifactType: "metric_group_kv",
    artifactStatus: "pending_external_compile",
    source: "metric_group_preview",
    note: "External worker should compile this metric-group member universe into a KV/RocksDB artifact; MQCHAIN Console only tracks the manifest.",
  };
}
