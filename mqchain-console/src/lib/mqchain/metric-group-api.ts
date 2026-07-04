import type { MetricGroupPreviewDiagnostics, MetricGroupPreviewGroup, MetricGroupPreviewRow } from "./metric-group-preview";

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
