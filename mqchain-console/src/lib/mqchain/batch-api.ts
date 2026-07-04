import { FLAG_BITS, hasFlag } from "./flags";

export const BATCH_EXPORT_API_CONTRACT = {
  apiVersion: "mqchain-batch-provenance-api-v1",
  sourceOfTruth: "postgres_batch_commit_boundary",
  servingBackend: "postgres",
  artifactType: "batch_provenance_export",
  mutationAllowed: false,
  batchWriteAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  batchCommitIsRegistryBoundary: true,
  postgresIsCanonicalTruth: true,
  rocksDbIsCompiledArtifact: true,
  evidencePayloadIncluded: false,
} as const;

export const BATCH_LIST_API_CONTRACT = {
  apiVersion: "mqchain-batch-list-api-v1",
  sourceOfTruth: "postgres_batch_commit_boundary",
  servingBackend: "postgres",
  artifactType: "batch_commit_queue_export",
  mutationAllowed: false,
  batchWriteAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  evidencePayloadIncluded: false,
  postgresIsCanonicalTruth: true,
  rocksDbIsCompiledArtifact: true,
  batchCommitIsRegistryBoundary: true,
} as const;

type JsonRecord = Record<string, unknown>;

export type BatchExportInput = {
  batch: {
    id: number;
    sourceJobId: number | null;
    sourceDocumentId: number | null;
    entityId: number | null;
    protocolId: number | null;
    roleId: number | null;
    sourceType: string | null;
    sourceUrl: string | null;
    sourceName: string | null;
    confidenceDefault: number | null;
    qualityTierDefault: number | null;
    statusDefault: number | null;
    flagsDefault: number | null;
    importedCount: number;
    acceptedCount: number;
    rejectedCount: number;
    conflictCount: number;
    effectiveFromBlock: number | null;
    effectiveToBlock: number | null;
    labelAction: string;
    supersedesBatchId: number | null;
    batchHash: string | null;
    evidenceHash: string | null;
    storageUri: string | null;
    parserVersion: string;
    dictionaryVersion: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    approvedAt: Date | null;
    committedAt: Date | null;
  };
  candidates: Array<{
    id: number;
    sourceJobId: number | null;
    sourceDocumentId: number | null;
    normalizedAddress: string;
    rawAddress: string;
    chainCode: string | null;
    suggestedEntityId: number | null;
    suggestedProtocolId: number | null;
    suggestedRoleId: number | null;
    confidenceScore: number;
    qualityTier: number;
    candidateStatus: string;
    evidenceCount: number;
    discoveredBy: string;
    firstSeenBlock: number | null;
    lastSeenBlock: number | null;
    metadata: JsonRecord;
  }>;
  sourceJob: {
    id: number;
    sourceType: string;
    sourceName: string | null;
    sourceUrl: string | null;
    status: string;
  } | null;
  sourceDocument: {
    id: number;
    documentType: string;
    originalName: string | null;
    storageUri: string | null;
    contentHash: string;
    sizeBytes: number | null;
  } | null;
  entity: { id: number; entityCode: string; entityName: string } | null;
  protocol: { id: number; protocolCode: string; protocolName: string } | null;
  role: { roleId: number; roleCode: string; roleName: string } | null;
  candidateEvidence: Array<{
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
  batchEvidence: Array<{
    id: number;
    evidenceId: number | null;
    evidenceHash: string | null;
    summary: string | null;
    payload: JsonRecord;
    createdAt: Date;
  }>;
  approvalEvents: Array<{
    id: number;
    candidateId: number | null;
    registryId: number | null;
    batchId: number | null;
    action: string;
    reason: string | null;
    metadata: JsonRecord;
    createdAt: Date;
  }>;
  kvBuilds: Array<{
    id: number;
    buildHash: string;
    dictionaryVersion: string | null;
    status: string;
    rowCount: number;
    storageUri: string | null;
    manifest: JsonRecord;
    createdAt: Date;
    activatedAt: Date | null;
  }>;
  registryRows: Array<{
    registry: {
      id: number;
      chainCode: string;
      normalizedAddress: string;
      entityId: number | null;
      protocolId: number | null;
      roleId: number | null;
      confidenceScore: number;
      qualityTier: number;
      flags: number;
      metricUsage: string | null;
      validFromBlock: number | null;
      validToBlock: number | null;
      isActive: boolean;
      primarySourceJobId: number | null;
      approvedBatchId: number | null;
      updatedAt: Date;
    };
    entityName: string | null;
    protocolName: string | null;
    roleCode: string | null;
  }>;
  candidateRollup: unknown;
  evidenceRollup: unknown;
  registryRollup: unknown;
};

export type BatchListApiInput = {
  query: {
    page: number;
    pageSize: number;
    filters: Record<string, unknown>;
  };
  rows: Array<{
    batch: BatchExportInput["batch"];
    entity: { id: number; entityCode: string; entityName: string } | null;
    protocol: { id: number; protocolCode: string; protocolName: string } | null;
    role: { roleId: number; roleCode: string; roleName: string } | null;
  }>;
  total: number;
  totalPages: number;
};

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function metadataKeys(metadata: JsonRecord) {
  return Object.keys(metadata).sort((left, right) => left.localeCompare(right));
}

function metadataString(metadata: JsonRecord, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sourceReference(metadata: JsonRecord) {
  return {
    sourceInputType: metadataString(metadata, "sourceInputType"),
    contractName: metadataString(metadata, "contractName"),
    roleSource: metadataString(metadata, "roleSource"),
    rawReference: metadataString(metadata, "rawReference"),
  };
}

function manifestSummary(manifest: JsonRecord) {
  return {
    artifactType: manifest.artifactType ?? null,
    artifactStatus: manifest.artifactStatus ?? null,
    reason: manifest.reason ?? null,
    batchId: manifest.batchId ?? null,
    registryIds: Array.isArray(manifest.registryIds) ? manifest.registryIds : [],
    indexes: Array.isArray(manifest.indexes) ? manifest.indexes : [],
  };
}

function serializeBatchListRow(row: BatchListApiInput["rows"][number]) {
  const batch = row.batch;

  return {
    id: batch.id,
    sourceJobId: batch.sourceJobId,
    sourceDocumentId: batch.sourceDocumentId,
    sourceType: batch.sourceType,
    sourceUrl: batch.sourceUrl,
    sourceName: batch.sourceName,
    defaults: {
      entityId: batch.entityId,
      entityCode: row.entity?.entityCode ?? null,
      entityName: row.entity?.entityName ?? null,
      protocolId: batch.protocolId,
      protocolCode: row.protocol?.protocolCode ?? null,
      protocolName: row.protocol?.protocolName ?? null,
      roleId: batch.roleId,
      roleCode: row.role?.roleCode ?? null,
      roleName: row.role?.roleName ?? null,
      confidence: batch.confidenceDefault,
      qualityTier: batch.qualityTierDefault,
      labelStatus: batch.statusDefault,
      flags: batch.flagsDefault,
    },
    counts: {
      imported: batch.importedCount,
      accepted: batch.acceptedCount,
      rejected: batch.rejectedCount,
      conflicts: batch.conflictCount,
    },
    timeline: {
      effectiveFromBlock: batch.effectiveFromBlock,
      effectiveToBlock: batch.effectiveToBlock,
    },
    labelAction: batch.labelAction,
    supersedesBatchId: batch.supersedesBatchId,
    batchHash: batch.batchHash,
    evidenceHash: batch.evidenceHash,
    storageUri: batch.storageUri,
    parserVersion: batch.parserVersion,
    dictionaryVersion: batch.dictionaryVersion,
    status: batch.status,
    lifecycle: {
      createdAt: isoDate(batch.createdAt),
      updatedAt: isoDate(batch.updatedAt),
      approvedAt: isoDate(batch.approvedAt),
      committedAt: isoDate(batch.committedAt),
      readyForCommit: batch.status === "approved" || batch.status === "pending_approval",
      committed: batch.status === "committed",
    },
    hrefs: {
      detailApi: `/api/mqchain/batches/${batch.id}`,
      detailPage: `/mqchain/batches/${batch.id}`,
      sourceJob: batch.sourceJobId ? `/mqchain/source-jobs/${batch.sourceJobId}` : null,
    },
  };
}

export function buildBatchListApiResponse(input: BatchListApiInput) {
  return {
    ...BATCH_LIST_API_CONTRACT,
    query: input.query,
    pagination: {
      totalRows: input.total,
      page: input.query.page,
      pageSize: input.query.pageSize,
      totalPages: input.totalPages,
      returnedRows: input.rows.length,
    },
    rows: input.rows.map(serializeBatchListRow),
    canonicalWrites: {
      candidatesApproved: 0,
      registryRowsCreated: 0,
      kvBuildsCreated: 0,
    },
    policy: {
      batchListIsControlPlaneQueueOnly: true,
      batchCommitWritesCanonicalRegistry: true,
      registryRowsRequireBatchCommit: true,
      candidatesRemainStagedUntilCommit: true,
      kvHandoffIsExternalCompileOnly: true,
      evidencePayloadsExcludedByDefault: true,
      detailEndpointContainsExpandedProvenance: true,
    },
  };
}

export function buildBatchExportApiResponse(input: BatchExportInput) {
  return {
    ...BATCH_EXPORT_API_CONTRACT,
    batch: {
      id: input.batch.id,
      sourceJobId: input.batch.sourceJobId,
      sourceDocumentId: input.batch.sourceDocumentId,
      sourceType: input.batch.sourceType,
      sourceUrl: input.batch.sourceUrl,
      sourceName: input.batch.sourceName,
      defaults: {
        entityId: input.batch.entityId,
        protocolId: input.batch.protocolId,
        roleId: input.batch.roleId,
        confidence: input.batch.confidenceDefault,
        qualityTier: input.batch.qualityTierDefault,
        labelStatus: input.batch.statusDefault,
        flags: input.batch.flagsDefault,
      },
      counts: {
        imported: input.batch.importedCount,
        accepted: input.batch.acceptedCount,
        rejected: input.batch.rejectedCount,
        conflicts: input.batch.conflictCount,
      },
      timeline: {
        effectiveFromBlock: input.batch.effectiveFromBlock,
        effectiveToBlock: input.batch.effectiveToBlock,
      },
      labelAction: input.batch.labelAction,
      supersedesBatchId: input.batch.supersedesBatchId,
      batchHash: input.batch.batchHash,
      evidenceHash: input.batch.evidenceHash,
      storageUri: input.batch.storageUri,
      parserVersion: input.batch.parserVersion,
      dictionaryVersion: input.batch.dictionaryVersion,
      status: input.batch.status,
      createdAt: isoDate(input.batch.createdAt),
      updatedAt: isoDate(input.batch.updatedAt),
      approvedAt: isoDate(input.batch.approvedAt),
      committedAt: isoDate(input.batch.committedAt),
    },
    source: {
      sourceJob: input.sourceJob,
      sourceDocument: input.sourceDocument,
      defaultEntity: input.entity,
      defaultProtocol: input.protocol,
      defaultRole: input.role,
    },
    rollups: {
      candidates: input.candidateRollup,
      evidence: input.evidenceRollup,
      registry: input.registryRollup,
    },
    candidates: input.candidates.map((candidate) => ({
      candidateId: candidate.id,
      sourceJobId: candidate.sourceJobId,
      sourceDocumentId: candidate.sourceDocumentId,
      chainCode: candidate.chainCode,
      normalizedAddress: candidate.normalizedAddress,
      rawAddress: candidate.rawAddress,
      suggestedEntityId: candidate.suggestedEntityId,
      suggestedProtocolId: candidate.suggestedProtocolId,
      suggestedRoleId: candidate.suggestedRoleId,
      confidenceScore: candidate.confidenceScore,
      qualityTier: candidate.qualityTier,
      candidateStatus: candidate.candidateStatus,
      evidenceCount: candidate.evidenceCount,
      discoveredBy: candidate.discoveredBy,
      firstSeenBlock: candidate.firstSeenBlock,
      lastSeenBlock: candidate.lastSeenBlock,
      metadataKeys: metadataKeys(candidate.metadata),
      sourceReference: sourceReference(candidate.metadata),
    })),
    evidence: {
      candidateEvidence: input.candidateEvidence.map((evidence) => ({
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
      committedBatchEvidence: input.batchEvidence.map((evidence) => ({
        id: evidence.id,
        evidenceId: evidence.evidenceId,
        evidenceHash: evidence.evidenceHash,
        summary: evidence.summary,
        payloadKeys: metadataKeys(evidence.payload),
        createdAt: isoDate(evidence.createdAt),
      })),
    },
    approvalEvents: input.approvalEvents.map((event) => ({
      id: event.id,
      candidateId: event.candidateId,
      registryId: event.registryId,
      batchId: event.batchId,
      action: event.action,
      reason: event.reason,
      metadataKeys: metadataKeys(event.metadata),
      createdAt: isoDate(event.createdAt),
    })),
    registryRows: input.registryRows.map((row) => ({
      registryId: row.registry.id,
      chainCode: row.registry.chainCode,
      normalizedAddress: row.registry.normalizedAddress,
      entityId: row.registry.entityId,
      entityName: row.entityName,
      protocolId: row.registry.protocolId,
      protocolName: row.protocolName,
      roleId: row.registry.roleId,
      roleCode: row.roleCode,
      confidenceScore: row.registry.confidenceScore,
      qualityTier: row.registry.qualityTier,
      flags: row.registry.flags,
      metricEligible: hasFlag(row.registry.flags, FLAG_BITS.metricEligible),
      metricUsage: row.registry.metricUsage,
      validFromBlock: row.registry.validFromBlock,
      validToBlock: row.registry.validToBlock,
      isActive: row.registry.isActive,
      primarySourceJobId: row.registry.primarySourceJobId,
      approvedBatchId: row.registry.approvedBatchId,
      updatedAt: isoDate(row.registry.updatedAt),
    })),
    kvHandoffs: input.kvBuilds.map((build) => ({
      id: build.id,
      buildHash: build.buildHash,
      dictionaryVersion: build.dictionaryVersion,
      status: build.status,
      rowCount: build.rowCount,
      storageUri: build.storageUri,
      manifest: manifestSummary(build.manifest),
      createdAt: isoDate(build.createdAt),
      activatedAt: isoDate(build.activatedAt),
    })),
    policy: {
      batchCommitWritesCanonicalRegistry: true,
      candidateApprovalStillRequiredBeforeBatch: true,
      evidenceRequiredBeforeRegistryCommit: true,
      kvHandoffIsExternalCompileOnly: true,
      evidencePayloadsExcludedByDefault: true,
    },
  };
}
