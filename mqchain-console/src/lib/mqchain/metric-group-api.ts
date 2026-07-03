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

function serializeMember(row: MetricGroupPreviewRow) {
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
    members: pageSlice(input.members, input.query.page, input.query.pageSize).map(serializeMember),
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
