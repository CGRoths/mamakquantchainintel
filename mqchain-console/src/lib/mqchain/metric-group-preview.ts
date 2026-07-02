import { matchesMetricGroupRule } from "./metric-rules";
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

export function filterMetricGroupPreviewMembers(
  group: MetricGroupPreviewGroup,
  rules: MetricGroupRule[],
  rows: MetricGroupPreviewRow[],
) {
  return rows.filter((row) => {
    if (!row.registry.isActive) {
      return false;
    }

    if (group.chainCode && row.registry.chainCode !== group.chainCode) {
      return false;
    }

    return rules.some((rule) =>
      matchesMetricGroupRule(
        {
          roleCode: row.role?.roleCode,
          categoryCode: row.category?.categoryCode,
          entityCode: row.entity?.entityCode,
          confidenceScore: row.registry.confidenceScore,
          flags: row.registry.flags,
        },
        {
          ...rule,
          minConfidence: rule.minConfidence ?? group.minConfidence,
          requireMetricEligible: rule.requireMetricEligible ?? group.requireMetricEligible,
        },
      ),
    );
  });
}

export function buildMetricGroupCompilePreviewManifest(input: {
  group: MetricGroupPreviewGroup;
  rules: MetricGroupRule[];
  members: MetricGroupPreviewRow[];
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
    distributions: {
      roles: countBy(input.members, (row) => row.role?.roleCode),
      entities: countBy(input.members, (row) => row.entity?.entityCode),
      chains: countBy(input.members, (row) => row.registry.chainCode),
    },
    note: "Preview uses active registry rows only and enforces the metric group's chain scope before rule matching.",
  };
}
