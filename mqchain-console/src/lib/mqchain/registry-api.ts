import { FLAG_BITS, hasFlag } from "./flags";

export const REGISTRY_EXPORT_API_CONTRACT = {
  apiVersion: "mqchain-registry-export-api-v1",
  sourceOfTruth: "postgres_registry",
  servingBackend: "postgres",
  artifactType: "registry_page_export",
  mutationAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  postgresIsCanonicalTruth: true,
  rocksDbIsCompiledArtifact: true,
} as const;

export const REGISTRY_DETAIL_EXPORT_API_CONTRACT = {
  apiVersion: "mqchain-registry-detail-api-v1",
  sourceOfTruth: "postgres_registry",
  servingBackend: "postgres",
  artifactType: "registry_detail_export",
  mutationAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  evidencePayloadIncluded: false,
  sourceDocumentTextIncluded: false,
  approvalEventPayloadsIncluded: false,
  postgresIsCanonicalTruth: true,
  rocksDbIsCompiledArtifact: true,
} as const;

type JsonRecord = Record<string, unknown>;

export type RegistryExportRowInput = {
  registry: {
    id: number;
    chainCode: string;
    normalizedAddress: string;
    rawAddress: string | null;
    prefixCode: number | null;
    payloadHex: string | null;
    entityId: number | null;
    protocolId: number | null;
    roleId: number | null;
    confidenceScore: number;
    qualityTier: number;
    labelStatus: number;
    flags: number;
    metricUsage: string | null;
    validFromBlock: number | null;
    validToBlock: number | null;
    firstSeenBlock: number | null;
    lastSeenBlock: number | null;
    isActive: boolean;
    primarySourceJobId: number | null;
    approvedBatchId: number | null;
    updatedAt: Date;
  };
  entityCode: string | null;
  entityName: string | null;
  protocolCode?: string | null;
  protocolName: string | null;
  roleCode: string | null;
  categoryCode: string | null;
};

export type RegistryExportApiInput = {
  query: {
    page: number;
    pageSize: number;
    filters: Record<string, unknown>;
  };
  rows: RegistryExportRowInput[];
  total: number;
  totalPages: number;
};

export type RegistryDetailExportInput = {
  registry: RegistryExportRowInput["registry"] & {
    notes: string | null;
    metadata: JsonRecord;
    createdAt: Date;
  };
  entity: { id: number; entityCode: string; entityName: string } | null;
  protocol: { id: number; protocolCode: string; protocolName: string } | null;
  role: { roleId: number; roleCode: string; roleName?: string | null } | null;
  category: { categoryId?: number; categoryCode: string; categoryName?: string } | null;
  evidence: Array<{
    id: number;
    candidateId: number | null;
    registryId: number | null;
    batchId: number | null;
    evidenceType: string;
    sourceUrl: string | null;
    sourceDocumentId: number | null;
    evidenceHash: string | null;
    storageUri: string | null;
    confidenceDelta: number;
    trustTier: string;
    summary: string | null;
    payload: JsonRecord;
    createdAt: Date;
  }>;
  sourceBatch: {
    id: number;
    sourceJobId: number | null;
    sourceDocumentId: number | null;
    sourceType: string | null;
    sourceUrl: string | null;
    sourceName: string | null;
    status: string;
    batchHash: string | null;
    evidenceHash: string | null;
    storageUri: string | null;
    dictionaryVersion: string | null;
    importedCount: number;
    acceptedCount: number;
    rejectedCount: number;
    conflictCount: number;
    committedAt: Date | null;
  } | null;
  primarySourceJob: {
    id: number;
    sourceType: string;
    sourceName: string | null;
    sourceUrl: string | null;
    archiveStorageUri: string | null;
    status: string;
    parserVersion: string;
  } | null;
  primarySourceDocument: {
    id: number;
    documentType: string;
    originalName: string | null;
    storageUri: string | null;
    contentHash: string;
    mimeType: string | null;
    sizeBytes: number | null;
    extractedText: string | null;
    metadata: JsonRecord;
    createdAt: Date;
  } | null;
  provenanceCandidate: {
    id: number;
    sourceJobId: number | null;
    sourceDocumentId: number | null;
    candidateStatus: string;
    confidenceScore: number;
    qualityTier: number;
    evidenceCount: number;
    discoveryJobId: number | null;
  } | null;
  provenanceCandidateId: number | null;
  approvalEvents: Array<{
    id: number;
    action: string;
    actorId: string | null;
    candidateId: number | null;
    registryId: number | null;
    batchId: number | null;
    reason: string | null;
    metadata: JsonRecord;
    beforeJson: JsonRecord | null;
    afterJson: JsonRecord | null;
    createdAt: Date;
  }>;
  relatedCandidates: Array<{
    id: number;
    sourceJobId: number | null;
    sourceDocumentId: number | null;
    candidateStatus: string;
    confidenceScore: number;
    qualityTier: number;
    evidenceCount: number;
    discoveryJobId: number | null;
    createdAt: Date;
  }>;
  relatedDiscoveryJobs: Array<{
    id: number;
    discoveryType: string;
    status: string;
    chainCode: string | null;
    seedAddress: string | null;
    entityId: number | null;
    protocolId: number | null;
    candidatesCreated: number;
    evidenceCreated: number;
    error: string | null;
    createdAt: Date;
  }>;
  relatedRegistryRows: Array<{
    registry: RegistryExportRowInput["registry"];
    entityName: string | null;
    protocolName: string | null;
    roleCode: string | null;
  }>;
  metricGroupMatches: Array<{
    id: number;
    metricGroupCode: string;
    metricGroupName: string;
    chainCode?: string | null;
    minConfidence: number;
    requireMetricEligible: boolean;
  }>;
  secondaryRoles: Array<Record<string, unknown>>;
  resolverPreview: {
    chainCode: string;
    normalizedAddress: string;
    prefixCode: number | null;
    payloadHex: string | null;
    activeLabel: boolean;
    validFromBlock: number | null;
    validToBlock: number | null;
  };
};

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function metadataKeys(value: JsonRecord | null | undefined) {
  return Object.keys(value ?? {}).sort((left, right) => left.localeCompare(right));
}

export function serializeRegistryExportRow(row: RegistryExportRowInput) {
  return {
    registryId: row.registry.id,
    chainCode: row.registry.chainCode,
    normalizedAddress: row.registry.normalizedAddress,
    rawAddress: row.registry.rawAddress,
    prefixCode: row.registry.prefixCode,
    payloadHex: row.registry.payloadHex,
    entity: row.registry.entityId
      ? {
          id: row.registry.entityId,
          code: row.entityCode,
          name: row.entityName,
        }
      : null,
    protocol: row.registry.protocolId
      ? {
          id: row.registry.protocolId,
          code: row.protocolCode ?? null,
          name: row.protocolName,
        }
      : null,
    role: row.registry.roleId
      ? {
          id: row.registry.roleId,
          code: row.roleCode,
        }
      : null,
    category: row.categoryCode ? { code: row.categoryCode } : null,
    confidenceScore: row.registry.confidenceScore,
    qualityTier: row.registry.qualityTier,
    labelStatus: row.registry.labelStatus,
    flags: row.registry.flags,
    metricUsage: row.registry.metricUsage,
    metricEligible: hasFlag(row.registry.flags, FLAG_BITS.metricEligible),
    isActive: row.registry.isActive,
    validFromBlock: row.registry.validFromBlock,
    validToBlock: row.registry.validToBlock,
    firstSeenBlock: row.registry.firstSeenBlock,
    lastSeenBlock: row.registry.lastSeenBlock,
    primarySourceJobId: row.registry.primarySourceJobId,
    approvedBatchId: row.registry.approvedBatchId,
    updatedAt: isoDate(row.registry.updatedAt),
  };
}

export function buildRegistryExportApiResponse(input: RegistryExportApiInput) {
  return {
    ...REGISTRY_EXPORT_API_CONTRACT,
    query: input.query,
    pagination: {
      totalRows: input.total,
      page: input.query.page,
      pageSize: input.query.pageSize,
      totalPages: input.totalPages,
      returnedRows: input.rows.length,
    },
    rows: input.rows.map(serializeRegistryExportRow),
    policy: {
      activeFilterDefaultsToCurrentLabels: true,
      timelineFieldsIncluded: true,
      batchCommitIsRegistryBoundary: true,
      externalWorkersMustNotTreatThisAsKvArtifact: true,
    },
  };
}

export function buildRegistryExportCsv(input: RegistryExportApiInput) {
  const headers = [
    "registry_id",
    "chain_code",
    "normalized_address",
    "raw_address",
    "prefix_code",
    "payload_hex",
    "entity_id",
    "entity_code",
    "entity_name",
    "protocol_id",
    "protocol_code",
    "protocol_name",
    "role_id",
    "role_code",
    "category_code",
    "confidence_score",
    "quality_tier",
    "label_status",
    "flags",
    "metric_usage",
    "metric_eligible",
    "is_active",
    "valid_from_block",
    "valid_to_block",
    "first_seen_block",
    "last_seen_block",
    "primary_source_job_id",
    "approved_batch_id",
    "updated_at",
  ];
  const rows = input.rows.map((row) => {
    const serialized = serializeRegistryExportRow(row);
    return [
      serialized.registryId,
      serialized.chainCode,
      serialized.normalizedAddress,
      serialized.rawAddress,
      serialized.prefixCode,
      serialized.payloadHex,
      serialized.entity?.id,
      serialized.entity?.code,
      serialized.entity?.name,
      serialized.protocol?.id,
      serialized.protocol?.code,
      serialized.protocol?.name,
      serialized.role?.id,
      serialized.role?.code,
      serialized.category?.code,
      serialized.confidenceScore,
      serialized.qualityTier,
      serialized.labelStatus,
      serialized.flags,
      serialized.metricUsage,
      serialized.metricEligible,
      serialized.isActive,
      serialized.validFromBlock,
      serialized.validToBlock,
      serialized.firstSeenBlock,
      serialized.lastSeenBlock,
      serialized.primarySourceJobId,
      serialized.approvedBatchId,
      serialized.updatedAt,
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function buildRegistryDetailExportApiResponse(input: RegistryDetailExportInput) {
  const row = serializeRegistryExportRow({
    registry: input.registry,
    entityCode: input.entity?.entityCode ?? null,
    entityName: input.entity?.entityName ?? null,
    protocolCode: input.protocol?.protocolCode ?? null,
    protocolName: input.protocol?.protocolName ?? null,
    roleCode: input.role?.roleCode ?? null,
    categoryCode: input.category?.categoryCode ?? null,
  });

  return {
    ...REGISTRY_DETAIL_EXPORT_API_CONTRACT,
    registry: {
      ...row,
      notes: input.registry.notes,
      metadataKeys: metadataKeys(input.registry.metadata),
      createdAt: isoDate(input.registry.createdAt),
    },
    dictionary: {
      entity: input.entity
        ? {
            id: input.entity.id,
            code: input.entity.entityCode,
            name: input.entity.entityName,
          }
        : null,
      protocol: input.protocol
        ? {
            id: input.protocol.id,
            code: input.protocol.protocolCode,
            name: input.protocol.protocolName,
          }
        : null,
      role: input.role
        ? {
            id: input.role.roleId,
            code: input.role.roleCode,
            name: input.role.roleName ?? null,
          }
        : null,
      category: input.category
        ? {
            id: input.category.categoryId ?? null,
            code: input.category.categoryCode,
            name: input.category.categoryName ?? null,
          }
        : null,
    },
    provenance: {
      sourceBatch: input.sourceBatch
        ? {
            id: input.sourceBatch.id,
            sourceJobId: input.sourceBatch.sourceJobId,
            sourceDocumentId: input.sourceBatch.sourceDocumentId,
            sourceType: input.sourceBatch.sourceType,
            sourceUrl: input.sourceBatch.sourceUrl,
            sourceName: input.sourceBatch.sourceName,
            status: input.sourceBatch.status,
            batchHash: input.sourceBatch.batchHash,
            evidenceHash: input.sourceBatch.evidenceHash,
            storageUri: input.sourceBatch.storageUri,
            dictionaryVersion: input.sourceBatch.dictionaryVersion,
            importedCount: input.sourceBatch.importedCount,
            acceptedCount: input.sourceBatch.acceptedCount,
            rejectedCount: input.sourceBatch.rejectedCount,
            conflictCount: input.sourceBatch.conflictCount,
            committedAt: isoDate(input.sourceBatch.committedAt),
          }
        : null,
      primarySourceJob: input.primarySourceJob
        ? {
            id: input.primarySourceJob.id,
            sourceType: input.primarySourceJob.sourceType,
            sourceName: input.primarySourceJob.sourceName,
            sourceUrl: input.primarySourceJob.sourceUrl,
            archiveStorageUri: input.primarySourceJob.archiveStorageUri,
            status: input.primarySourceJob.status,
            parserVersion: input.primarySourceJob.parserVersion,
          }
        : null,
      primarySourceDocument: input.primarySourceDocument
        ? {
            id: input.primarySourceDocument.id,
            documentType: input.primarySourceDocument.documentType,
            originalName: input.primarySourceDocument.originalName,
            storageUri: input.primarySourceDocument.storageUri,
            contentHash: input.primarySourceDocument.contentHash,
            mimeType: input.primarySourceDocument.mimeType,
            sizeBytes: input.primarySourceDocument.sizeBytes,
            extractedTextLength: input.primarySourceDocument.extractedText?.length ?? 0,
            metadataKeys: metadataKeys(input.primarySourceDocument.metadata),
            createdAt: isoDate(input.primarySourceDocument.createdAt),
          }
        : null,
      provenanceCandidateId: input.provenanceCandidateId,
      provenanceCandidate: input.provenanceCandidate,
    },
    resolverPreview: input.resolverPreview,
    secondaryRoles: input.secondaryRoles,
    metricGroupMatches: input.metricGroupMatches.map((group) => ({
      id: group.id,
      code: group.metricGroupCode,
      name: group.metricGroupName,
      chainCode: group.chainCode ?? null,
      minConfidence: group.minConfidence,
      requireMetricEligible: group.requireMetricEligible,
    })),
    evidence: input.evidence.map((evidence) => ({
      id: evidence.id,
      candidateId: evidence.candidateId,
      registryId: evidence.registryId,
      batchId: evidence.batchId,
      evidenceType: evidence.evidenceType,
      sourceUrl: evidence.sourceUrl,
      sourceDocumentId: evidence.sourceDocumentId,
      evidenceHash: evidence.evidenceHash,
      storageUri: evidence.storageUri,
      confidenceDelta: evidence.confidenceDelta,
      trustTier: evidence.trustTier,
      summary: evidence.summary,
      payloadKeys: metadataKeys(evidence.payload),
      createdAt: isoDate(evidence.createdAt),
    })),
    approvalEvents: input.approvalEvents.map((event) => ({
      id: event.id,
      action: event.action,
      actorId: event.actorId,
      candidateId: event.candidateId,
      registryId: event.registryId,
      batchId: event.batchId,
      reason: event.reason,
      metadataKeys: metadataKeys(event.metadata),
      beforeKeys: metadataKeys(event.beforeJson),
      afterKeys: metadataKeys(event.afterJson),
      createdAt: isoDate(event.createdAt),
    })),
    related: {
      candidates: input.relatedCandidates.map((candidate) => ({
        id: candidate.id,
        sourceJobId: candidate.sourceJobId,
        sourceDocumentId: candidate.sourceDocumentId,
        candidateStatus: candidate.candidateStatus,
        confidenceScore: candidate.confidenceScore,
        qualityTier: candidate.qualityTier,
        evidenceCount: candidate.evidenceCount,
        discoveryJobId: candidate.discoveryJobId,
        createdAt: isoDate(candidate.createdAt),
      })),
      discoveryJobs: input.relatedDiscoveryJobs.map((job) => ({
        id: job.id,
        discoveryType: job.discoveryType,
        status: job.status,
        chainCode: job.chainCode,
        seedAddress: job.seedAddress,
        entityId: job.entityId,
        protocolId: job.protocolId,
        candidatesCreated: job.candidatesCreated,
        evidenceCreated: job.evidenceCreated,
        error: job.error,
        createdAt: isoDate(job.createdAt),
      })),
      registryRows: input.relatedRegistryRows.map((related) => ({
        ...serializeRegistryExportRow({
          registry: related.registry,
          entityCode: null,
          entityName: related.entityName,
          protocolName: related.protocolName,
          roleCode: related.roleCode,
          categoryCode: null,
        }),
      })),
    },
    policy: {
      registryRowsAreCanonicalPostgresTruth: true,
      rocksDbIsCompiledArtifactOnly: true,
      timelineFieldsIncluded: true,
      metricGroupMatchesArePreviewOnly: true,
      rawEvidencePayloadsExcludedByDefault: true,
      sourceDocumentTextExcludedByDefault: true,
      approvalEventPayloadsExcludedByDefault: true,
      mutationsMustUseServerActions: true,
    },
  };
}
