import type { MetricGroupPreviewDiagnostics, MetricGroupPreviewGroup, MetricGroupPreviewRow } from "./metric-group-preview";
import { metricGroupRuleSections } from "./metric-rules";
import type { MetricGroupRule } from "./types";

export const METRIC_GROUP_MEMBERSHIP_API_CONTRACT = {
  apiVersion: "mqchain-metric-group-membership-api-v1",
  sourceOfTruth: "postgres_registry",
  servingBackend: "postgres",
  artifactType: "metric_group_membership_preview",
  artifactStatus: "preview_only",
  rocksDbStatus: "external_compiled_artifact",
  mutationAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  externalCompileRequired: true,
} as const;

export const METRIC_GROUP_LIST_API_CONTRACT = {
  apiVersion: "mqchain-metric-group-list-api-v1",
  sourceOfTruth: "postgres_dictionary_and_registry_rules",
  servingBackend: "postgres",
  artifactType: "metric_group_catalog_export",
  artifactStatus: "preview_only",
  mutationAllowed: false,
  dictionaryWriteAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  fullRuleJsonIncluded: false,
  externalCompileRequired: true,
  postgresIsCanonicalTruth: true,
  rocksDbIsCompiledArtifact: true,
} as const;

type JsonRecord = Record<string, unknown>;

type MetricGroupListRow = {
  id: number;
  metricGroupCode: string;
  metricGroupName: string;
  chainCode: string | null;
  minConfidence: number;
  requireMetricEligible: boolean;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  rules: Array<{
    id: number;
    metricGroupId: number | null;
    ruleJson: JsonRecord;
    createdAt: Date;
  }>;
};

export type MetricGroupListApiInput = {
  query: {
    page: number;
    pageSize: number;
    filters: Record<string, unknown>;
  };
  rows: MetricGroupListRow[];
  total: number;
  totalPages: number;
};

export type MetricGroupMembershipApiInput = {
  query: {
    metricGroupCode: string;
    page: number;
    pageSize: number;
  };
  group: MetricGroupPreviewGroup & {
    isActive?: boolean | null;
  };
  members: MetricGroupPreviewRow[];
  diagnostics: MetricGroupPreviewDiagnostics;
  manifest: Record<string, unknown>;
  kvManifest: Record<string, unknown>;
};

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function pageSlice<T>(rows: T[], page: number, pageSize: number) {
  const offset = (page - 1) * pageSize;
  return rows.slice(offset, offset + pageSize);
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeMetricGroupMember(row: MetricGroupPreviewRow) {
  return {
    registryId: row.registry.id,
    chainCode: row.registry.chainCode,
    normalizedAddress: row.registry.normalizedAddress,
    confidenceScore: row.registry.confidenceScore,
    qualityTier: row.registry.qualityTier,
    flags: row.registry.flags,
    entity: row.entity
      ? {
          code: row.entity.entityCode,
          name: row.entity.entityName ?? null,
        }
      : null,
    protocol: row.protocol
      ? {
          code: row.protocol.protocolCode,
          name: row.protocol.protocolName ?? null,
        }
      : null,
    role: row.role
      ? {
          code: row.role.roleCode,
        }
      : null,
    category: row.category
      ? {
          code: row.category.categoryCode,
        }
      : null,
  };
}

export function buildMetricGroupMembershipExportRows(input: MetricGroupMembershipApiInput) {
  return pageSlice(input.members, input.query.page, input.query.pageSize).map((row) => ({
    metricGroupCode: input.group.metricGroupCode,
    registryId: row.registry.id,
    chainCode: row.registry.chainCode,
    normalizedAddress: row.registry.normalizedAddress,
    entityCode: row.entity?.entityCode ?? "",
    entityName: row.entity?.entityName ?? "",
    protocolCode: row.protocol?.protocolCode ?? "",
    protocolName: row.protocol?.protocolName ?? "",
    roleCode: row.role?.roleCode ?? "",
    categoryCode: row.category?.categoryCode ?? "",
    confidenceScore: row.registry.confidenceScore,
    qualityTier: row.registry.qualityTier,
    flags: row.registry.flags,
    sourceOfTruth: METRIC_GROUP_MEMBERSHIP_API_CONTRACT.sourceOfTruth,
    artifactStatus: METRIC_GROUP_MEMBERSHIP_API_CONTRACT.artifactStatus,
    externalCompileRequired: METRIC_GROUP_MEMBERSHIP_API_CONTRACT.externalCompileRequired,
  }));
}

export function buildMetricGroupMembershipCsv(input: MetricGroupMembershipApiInput) {
  const headers = [
    "metric_group_code",
    "registry_id",
    "chain_code",
    "normalized_address",
    "entity_code",
    "entity_name",
    "protocol_code",
    "protocol_name",
    "role_code",
    "category_code",
    "confidence_score",
    "quality_tier",
    "flags",
    "source_of_truth",
    "artifact_status",
    "external_compile_required",
  ];
  const rows = buildMetricGroupMembershipExportRows(input).map((row) => [
    row.metricGroupCode,
    row.registryId,
    row.chainCode,
    row.normalizedAddress,
    row.entityCode,
    row.entityName,
    row.protocolCode,
    row.protocolName,
    row.roleCode,
    row.categoryCode,
    row.confidenceScore,
    row.qualityTier,
    row.flags,
    row.sourceOfTruth,
    row.artifactStatus,
    row.externalCompileRequired,
  ]);

  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function serializeMetricGroupListRow(group: MetricGroupListRow) {
  return {
    id: group.id,
    code: group.metricGroupCode,
    name: group.metricGroupName,
    chainCode: group.chainCode,
    minConfidence: group.minConfidence,
    requireMetricEligible: group.requireMetricEligible,
    description: group.description,
    isActive: group.isActive,
    ruleCount: group.rules.length,
    rules: group.rules.map((rule) => {
      const ruleJson = rule.ruleJson as MetricGroupRule;

      return {
        id: rule.id,
        metricGroupId: rule.metricGroupId,
        ruleKeys: Object.keys(rule.ruleJson).sort((left, right) => left.localeCompare(right)),
        sections: metricGroupRuleSections(ruleJson),
        createdAt: isoDate(rule.createdAt),
      };
    }),
    createdAt: isoDate(group.createdAt),
    updatedAt: isoDate(group.updatedAt),
    hrefs: {
      membersApi: `/api/mqchain/metric-groups/${encodeURIComponent(group.metricGroupCode)}/members`,
      membersCsv: `/api/mqchain/metric-groups/${encodeURIComponent(group.metricGroupCode)}/members?format=csv`,
      page: `/mqchain/metric-groups?group=${encodeURIComponent(group.metricGroupCode)}`,
    },
  };
}

export function buildMetricGroupListApiResponse(input: MetricGroupListApiInput) {
  return {
    ...METRIC_GROUP_LIST_API_CONTRACT,
    query: input.query,
    pagination: {
      totalRows: input.total,
      page: input.query.page,
      pageSize: input.query.pageSize,
      totalPages: input.totalPages,
      returnedRows: input.rows.length,
    },
    rows: input.rows.map(serializeMetricGroupListRow),
    policy: {
      catalogOnly: true,
      membershipRowsLiveOnMembersEndpoint: true,
      rulesAreOperatorMaintainedDictionaryState: true,
      previewDoesNotWriteRegistryOrKv: true,
      externalWorkerMustCompileKvArtifact: true,
      fullRuleJsonExcludedByDefault: true,
    },
  };
}

export function buildMetricGroupMembershipApiResponse(input: MetricGroupMembershipApiInput) {
  const totalMembers = input.members.length;
  const totalPages = Math.max(1, Math.ceil(totalMembers / input.query.pageSize));

  return {
    ...METRIC_GROUP_MEMBERSHIP_API_CONTRACT,
    query: {
      metricGroupCode: input.query.metricGroupCode,
      page: input.query.page,
      pageSize: input.query.pageSize,
    },
    metricGroup: {
      id: input.group.id,
      code: input.group.metricGroupCode,
      name: input.group.metricGroupName,
      chainCode: input.group.chainCode ?? null,
      minConfidence: input.group.minConfidence,
      requireMetricEligible: input.group.requireMetricEligible,
      isActive: input.group.isActive ?? null,
    },
    pagination: {
      totalMembers,
      page: input.query.page,
      pageSize: input.query.pageSize,
      totalPages,
      returnedMembers: pageSlice(input.members, input.query.page, input.query.pageSize).length,
    },
    diagnostics: input.diagnostics,
    members: pageSlice(input.members, input.query.page, input.query.pageSize).map(serializeMetricGroupMember),
    manifest: input.manifest,
    kvManifest: input.kvManifest,
    policy: {
      postgresIsCanonicalTruth: true,
      membershipIsDerivedFromActiveRegistryRows: true,
      countsMetricGroupMembersOnly: true,
      externalWorkerMustCompileKvArtifact: true,
    },
  };
}
