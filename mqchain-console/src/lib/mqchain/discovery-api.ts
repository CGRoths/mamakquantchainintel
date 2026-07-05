import { buildDiscoveryRunnerTask, discoveryResultSchemaSummary, discoveryTemplateSummary } from "./discovery-config";

export const DISCOVERY_COMPLETION_API_CONTRACT = {
  apiVersion: "mqchain-discovery-completion-api-v1",
  sourceOfTruth: "postgres_control_plane",
  mutationAllowed: true,
  stagingOnly: true,
  canonicalWriteBoundary: "approval_batch_commit",
  writes: "source_job_source_document_candidates_evidence",
  sourceJobWriteAllowed: true,
  candidateWriteAllowed: true,
  evidenceWriteAllowed: true,
  approvalAllowed: false,
  registryWriteAllowed: false,
  batchWriteAllowed: false,
  kvWriteAllowed: false,
} as const;

export const DISCOVERY_JOB_LIST_API_CONTRACT = {
  apiVersion: "mqchain-discovery-job-list-api-v1",
  sourceOfTruth: "postgres_discovery_control_plane",
  servingBackend: "postgres",
  artifactType: "discovery_job_queue_export",
  mutationAllowed: false,
  approvalAllowed: false,
  registryWriteAllowed: false,
  batchWriteAllowed: false,
  kvWriteAllowed: false,
  rawResultTextIncluded: false,
  discoveryIsApproval: false,
  postgresIsCanonicalTruth: true,
} as const;

export const DISCOVERY_JOB_DETAIL_API_CONTRACT = {
  apiVersion: "mqchain-discovery-job-detail-api-v1",
  sourceOfTruth: "postgres_discovery_control_plane",
  servingBackend: "postgres",
  artifactType: "discovery_job_detail_export",
  mutationAllowed: false,
  approvalAllowed: false,
  registryWriteAllowed: false,
  batchWriteAllowed: false,
  kvWriteAllowed: false,
  rawResultTextIncluded: false,
  evidencePayloadIncluded: false,
  discoveryIsApproval: false,
  postgresIsCanonicalTruth: true,
} as const;

type JsonRecord = Record<string, unknown>;

export type DiscoveryCompletionApiInput = {
  query: {
    jobId: number;
  };
  result: {
    job: {
      id: number;
      discoveryType: string;
      status: string;
      candidatesCreated: number;
      evidenceCreated: number;
    };
    sourceJobId: number;
    sourceDocumentId: number;
    rows: number;
    candidatesCreated: number;
    evidenceCreated: number;
    invalidRows: number;
    duplicates: number;
  };
};

export type DiscoveryJobListApiRowInput = {
  job: {
    id: number;
    discoveryType: string;
    status: string;
    chainCode: string | null;
    seedAddress: string | null;
    entityId: number | null;
    protocolId: number | null;
    config: JsonRecord;
    candidatesCreated: number;
    evidenceCreated: number;
    error: string | null;
    logs: string[];
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  entity: {
    id: number;
    entityCode: string;
    entityName: string;
    entityType: string | null;
  } | null;
  protocol: {
    id: number;
    protocolCode: string;
    protocolName: string;
    protocolType: string | null;
  } | null;
};

export type DiscoveryJobListApiInput = {
  query: {
    page: number;
    pageSize: number;
    filters: Record<string, unknown>;
  };
  rows: DiscoveryJobListApiRowInput[];
  total: number;
  totalPages: number;
};

export type DiscoveryJobDetailApiInput = {
  job: {
    id: number;
    discoveryType: string;
    status: string;
    chainCode: string | null;
    seedAddress: string | null;
    entityId: number | null;
    protocolId: number | null;
    config: JsonRecord;
    candidatesCreated: number;
    evidenceCreated: number;
    error: string | null;
    logs: string[];
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  sourceJobs: Array<{
    id: number;
    sourceType: string;
    sourceName: string | null;
    sourceUrl: string | null;
    status: string;
    parserVersion: string;
    metadata: JsonRecord;
    createdAt: Date;
    updatedAt: Date;
  }>;
  documents: Array<{
    id: number;
    sourceJobId: number | null;
    documentType: string;
    originalName: string | null;
    storageUri: string | null;
    contentHash: string;
    mimeType: string | null;
    sizeBytes: number | null;
    extractedText: string | null;
    metadata: JsonRecord;
    createdAt: Date;
  }>;
  candidates: Array<{
    id: number;
    sourceJobId: number | null;
    sourceDocumentId: number | null;
    rawAddress: string;
    normalizedAddress: string;
    chainCode: string | null;
    entityHint: string | null;
    protocolHint: string | null;
    roleHint: string | null;
    suggestedEntityId: number | null;
    suggestedProtocolId: number | null;
    suggestedRoleId: number | null;
    confidenceScore: number;
    qualityTier: number;
    candidateStatus: string;
    duplicateOfCandidateId: number | null;
    discoveredBy: string;
    evidenceCount: number;
    firstSeenBlock: number | null;
    lastSeenBlock: number | null;
    metadata: JsonRecord;
    createdAt: Date;
    updatedAt: Date;
  }>;
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
  completion: unknown;
  candidateRollup: unknown;
  evidenceRollup: unknown;
  logDistribution: unknown;
};

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function metadataKeys(value: JsonRecord | null | undefined) {
  return Object.keys(value ?? {}).sort((left, right) => left.localeCompare(right));
}

function operatorConfig(config: JsonRecord) {
  const copy = { ...config };
  delete copy.runner_task;
  return copy;
}

function runnerTaskFromConfig(input: {
  discoveryType: string;
  chainCode: string | null;
  seedAddress: string | null;
  config: JsonRecord;
}) {
  const runnerTask = input.config.runner_task;

  if (runnerTask && typeof runnerTask === "object" && !Array.isArray(runnerTask)) {
    return runnerTask;
  }

  return buildDiscoveryRunnerTask({
    discoveryType: input.discoveryType,
    chainCode: input.chainCode,
    seedAddress: input.seedAddress,
    config: input.config,
  });
}

function serializeDiscoveryJobListRow(row: DiscoveryJobListApiRowInput) {
  const template = discoveryTemplateSummary(row.job.discoveryType);

  return {
    id: row.job.id,
    discoveryType: row.job.discoveryType,
    status: row.job.status,
    chainCode: row.job.chainCode,
    seedAddress: row.job.seedAddress,
    entity: row.entity
      ? {
          id: row.entity.id,
          code: row.entity.entityCode,
          name: row.entity.entityName,
          type: row.entity.entityType,
        }
      : row.job.entityId
        ? { id: row.job.entityId, code: null, name: null, type: null }
        : null,
    protocol: row.protocol
      ? {
          id: row.protocol.id,
          code: row.protocol.protocolCode,
          name: row.protocol.protocolName,
          type: row.protocol.protocolType,
        }
      : row.job.protocolId
        ? { id: row.job.protocolId, code: null, name: null, type: null }
        : null,
    scannerInterface: {
      template,
      operatorConfig: operatorConfig(row.job.config),
      runnerTask: runnerTaskFromConfig(row.job),
    },
    stagedArtifacts: {
      candidatesCreated: row.job.candidatesCreated,
      evidenceCreated: row.job.evidenceCreated,
    },
    diagnostics: {
      error: row.job.error,
      logCount: row.job.logs.length,
      logTail: row.job.logs.slice(-5),
    },
    timestamps: {
      createdAt: isoDate(row.job.createdAt),
      updatedAt: isoDate(row.job.updatedAt),
    },
    hrefs: {
      discoveryJob: `/mqchain/discovery/jobs/${row.job.id}`,
      detailApi: `/api/mqchain/discovery/jobs/${row.job.id}`,
      completeApi: `/api/mqchain/discovery/jobs/${row.job.id}/complete`,
      reviewCandidates: `/mqchain/candidates?discoveryType=${encodeURIComponent(row.job.discoveryType)}&status=pending_review&sort=evidence_count`,
    },
  };
}

export function buildDiscoveryCompletionApiResponse(input: DiscoveryCompletionApiInput) {
  return {
    ...DISCOVERY_COMPLETION_API_CONTRACT,
    query: {
      jobId: input.query.jobId,
    },
    discoveryJob: {
      id: input.result.job.id,
      discoveryType: input.result.job.discoveryType,
      status: input.result.job.status,
      candidatesCreated: input.result.job.candidatesCreated,
      evidenceCreated: input.result.job.evidenceCreated,
    },
    stagedArtifacts: {
      sourceJobId: input.result.sourceJobId,
      sourceDocumentId: input.result.sourceDocumentId,
      rows: input.result.rows,
      candidatesCreated: input.result.candidatesCreated,
      evidenceCreated: input.result.evidenceCreated,
      invalidRows: input.result.invalidRows,
      duplicates: input.result.duplicates,
    },
    canonicalWrites: {
      approvalsCreated: 0,
      registryRowsCreated: 0,
      batchesCreated: 0,
      kvBuildsCreated: 0,
    },
    nextActions: {
      reviewCandidatesHref: `/mqchain/candidates?discoveryType=${encodeURIComponent(input.result.job.discoveryType)}&status=pending_review&sort=evidence_count`,
      discoveryJobHref: `/mqchain/discovery/jobs/${input.result.job.id}`,
      sourceJobHref: `/mqchain/source-jobs/${input.result.sourceJobId}`,
    },
    policy: {
      discoveryIsNotApproval: true,
      candidatesRequireReview: true,
      batchCommitIsRegistryBoundary: true,
      externalScannerCannotWriteRegistryOrKv: true,
      canonicalRegistryAndKvWritesBlocked: true,
    },
  };
}

export function buildDiscoveryJobListApiResponse(input: DiscoveryJobListApiInput) {
  return {
    ...DISCOVERY_JOB_LIST_API_CONTRACT,
    query: input.query,
    pagination: {
      totalRows: input.total,
      page: input.query.page,
      pageSize: input.query.pageSize,
      totalPages: input.totalPages,
      returnedRows: input.rows.length,
    },
    rows: input.rows.map(serializeDiscoveryJobListRow),
    canonicalWrites: {
      approvalsCreated: 0,
      registryRowsCreated: 0,
      batchesCreated: 0,
      kvBuildsCreated: 0,
    },
    policy: {
      discoveryIsNotApproval: true,
      externalScannersReceiveQueueMetadataOnly: true,
      completionStagesCandidatesAndEvidenceOnly: true,
      candidatesRequireReview: true,
      batchCommitIsRegistryBoundary: true,
      externalScannerCannotWriteRegistryOrKv: true,
      rawResultTextExcludedByDefault: true,
    },
  };
}

export function buildDiscoveryJobDetailApiResponse(input: DiscoveryJobDetailApiInput) {
  const template = discoveryTemplateSummary(input.job.discoveryType);

  return {
    ...DISCOVERY_JOB_DETAIL_API_CONTRACT,
    discoveryJob: {
      id: input.job.id,
      discoveryType: input.job.discoveryType,
      status: input.job.status,
      chainCode: input.job.chainCode,
      seedAddress: input.job.seedAddress,
      entityId: input.job.entityId,
      protocolId: input.job.protocolId,
      createdBy: input.job.createdBy,
      candidatesCreated: input.job.candidatesCreated,
      evidenceCreated: input.job.evidenceCreated,
      error: input.job.error,
      logCount: input.job.logs.length,
      createdAt: isoDate(input.job.createdAt),
      updatedAt: isoDate(input.job.updatedAt),
    },
    scannerInterface: {
      template,
      operatorConfig: operatorConfig(input.job.config),
      runnerTask: runnerTaskFromConfig(input.job),
      resultSchema: discoveryResultSchemaSummary(input.job.discoveryType),
    },
    rollups: {
      completion: input.completion,
      candidates: input.candidateRollup,
      evidence: input.evidenceRollup,
      logs: input.logDistribution,
    },
    archivedResultSources: input.sourceJobs.map((sourceJob) => ({
      id: sourceJob.id,
      sourceType: sourceJob.sourceType,
      sourceName: sourceJob.sourceName,
      sourceUrl: sourceJob.sourceUrl,
      status: sourceJob.status,
      parserVersion: sourceJob.parserVersion,
      metadataKeys: metadataKeys(sourceJob.metadata),
      documents: input.documents
        .filter((document) => document.sourceJobId === sourceJob.id)
        .map((document) => ({
          id: document.id,
          sourceJobId: document.sourceJobId,
          documentType: document.documentType,
          originalName: document.originalName,
          storageUri: document.storageUri,
          contentHash: document.contentHash,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          extractedTextLength: document.extractedText?.length ?? 0,
          metadataKeys: metadataKeys(document.metadata),
          createdAt: isoDate(document.createdAt),
        })),
      createdAt: isoDate(sourceJob.createdAt),
      updatedAt: isoDate(sourceJob.updatedAt),
    })),
    candidates: input.candidates.map((candidate) => ({
      id: candidate.id,
      sourceJobId: candidate.sourceJobId,
      sourceDocumentId: candidate.sourceDocumentId,
      rawAddress: candidate.rawAddress,
      normalizedAddress: candidate.normalizedAddress,
      chainCode: candidate.chainCode,
      entityHint: candidate.entityHint,
      protocolHint: candidate.protocolHint,
      roleHint: candidate.roleHint,
      suggestedEntityId: candidate.suggestedEntityId,
      suggestedProtocolId: candidate.suggestedProtocolId,
      suggestedRoleId: candidate.suggestedRoleId,
      confidenceScore: candidate.confidenceScore,
      qualityTier: candidate.qualityTier,
      candidateStatus: candidate.candidateStatus,
      duplicateOfCandidateId: candidate.duplicateOfCandidateId,
      discoveredBy: candidate.discoveredBy,
      evidenceCount: candidate.evidenceCount,
      firstSeenBlock: candidate.firstSeenBlock,
      lastSeenBlock: candidate.lastSeenBlock,
      metadataKeys: metadataKeys(candidate.metadata),
      createdAt: isoDate(candidate.createdAt),
      updatedAt: isoDate(candidate.updatedAt),
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
    canonicalWrites: {
      approvalsCreated: 0,
      registryRowsCreated: 0,
      batchesCreated: 0,
      kvBuildsCreated: 0,
    },
    nextActions: {
      completeJobHref: `/api/mqchain/discovery/jobs/${input.job.id}/complete`,
      reviewCandidatesHref: `/mqchain/candidates?discoveryType=${encodeURIComponent(input.job.discoveryType)}&status=pending_review&sort=evidence_count`,
      discoveryJobHref: `/mqchain/discovery/jobs/${input.job.id}`,
    },
    policy: {
      discoveryIsNotApproval: true,
      candidatesRequireReview: true,
      sourceVerificationRemainsOperatorDriven: true,
      batchCommitIsRegistryBoundary: true,
      externalScannerCannotWriteRegistryOrKv: true,
      rawResultTextExcludedByDefault: true,
      evidencePayloadsExcludedByDefault: true,
    },
  };
}
