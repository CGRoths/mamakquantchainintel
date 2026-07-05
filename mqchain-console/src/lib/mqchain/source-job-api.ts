import { buildSourceJobOperationalSummary } from "./source-job";

export const SOURCE_JOB_EXPORT_API_CONTRACT = {
  apiVersion: "mqchain-source-job-provenance-api-v1",
  sourceOfTruth: "postgres_source_archive",
  servingBackend: "postgres",
  artifactType: "source_job_provenance_export",
  mutationAllowed: false,
  candidateWriteAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  rawSourceTextIncluded: false,
  evidencePayloadIncluded: false,
  verificationEvidencePayloadIncluded: false,
  postgresIsCanonicalTruth: true,
  archiveStorageExternal: true,
} as const;

export const SOURCE_JOB_LIST_API_CONTRACT = {
  apiVersion: "mqchain-source-job-list-api-v1",
  sourceOfTruth: "postgres_source_archive",
  servingBackend: "postgres",
  artifactType: "source_job_queue_export",
  mutationAllowed: false,
  candidateWriteAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  rawSourceTextIncluded: false,
  evidencePayloadIncluded: false,
  verificationEvidencePayloadIncluded: false,
  fullMetadataIncluded: false,
  postgresIsCanonicalTruth: true,
  archiveStorageExternal: true,
} as const;

export const SOURCE_JOB_INTAKE_API_CONTRACT = {
  apiVersion: "mqchain-source-job-intake-api-v1",
  sourceOfTruth: "postgres_source_archive",
  servingBackend: "postgres",
  mutationAllowed: true,
  stagingOnly: true,
  canonicalWriteBoundary: "approval_batch_commit",
  writes: "source_job_candidate_staging_rows",
  candidateWriteAllowed: true,
  approvalWriteAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  postgresIsCanonicalTruth: true,
  archiveStorageExternal: true,
} as const;

type JsonRecord = Record<string, unknown>;

export type SourceJobIntakeApiInput = {
  intakeType: "manual" | "csv" | "ai_cleaned_csv" | "url" | "json_evidence" | "deployment_source";
  summary: {
    sourceJobId: number;
    totalRows: number;
    validAddresses: number;
    invalidAddresses: number;
    duplicates: number;
    candidatesCreated: number;
    candidatesUpdated: number;
    evidenceCreated: number;
    conflictsFound: number;
    errors: string[];
  };
};

export type SourceJobListApiRowInput = {
  id: number;
  sourceType: string;
  sourceName: string | null;
  sourceUrl: string | null;
  localFileName: string | null;
  archiveStorageUri: string | null;
  entityHint: string | null;
  protocolHint: string | null;
  chainScope: string[] | null;
  expectedRoles: string[] | null;
  status: string;
  parserVersion: string;
  metadata: JsonRecord;
  createdAt: Date;
  updatedAt: Date;
};

export type SourceJobListApiInput = {
  query: {
    page: number;
    pageSize: number;
    filters: Record<string, unknown>;
  };
  rows: SourceJobListApiRowInput[];
  total: number;
  totalPages: number;
};

export type SourceJobExportInput = {
  sourceJob: {
    id: number;
    sourceType: string;
    sourceName: string | null;
    sourceUrl: string | null;
    localFileName: string | null;
    archiveStorageUri: string | null;
    entityHint: string | null;
    protocolHint: string | null;
    chainScope: string[] | null;
    expectedRoles: string[] | null;
    status: string;
    parserVersion: string;
    metadata: JsonRecord;
    createdAt: Date;
    updatedAt: Date;
  };
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
    sourceDocumentId: number | null;
    normalizedAddress: string;
    chainCode: string | null;
    candidateStatus: string;
    confidenceScore: number;
    qualityTier: number;
    evidenceCount: number;
    discoveredBy: string;
    discoveryJobId: number | null;
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
  verifications: Array<{
    verification: {
      id: number;
      sourceJobId: number | null;
      sourceDocumentId: number | null;
      candidateId: number | null;
      verificationScope: string;
      sourceSheet: string | null;
      sourceUrl: string | null;
      sourceTrust: string;
      status: string;
      notes: string | null;
      verificationEvidence: JsonRecord;
      verifiedBy: string | null;
      createdAt: Date;
    };
    verifierEmail: string | null;
    verifierName: string | null;
  }>;
  downstreamBatches: Array<{
    id: number;
    status: string;
    acceptedCount: number;
    conflictCount: number;
    batchHash: string | null;
    storageUri: string | null;
    dictionaryVersion: string | null;
    committedAt: Date | null;
  }>;
  downstreamRegistryRows: Array<{
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
      isActive: boolean;
      approvedBatchId: number | null;
      updatedAt: Date;
    };
    entityName: string | null;
    protocolName: string | null;
    roleCode: string | null;
  }>;
  documentRollup: unknown;
  candidateRollup: unknown;
  evidenceRollup: unknown;
  verificationRollup: unknown;
  downstreamRollup: unknown;
};

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function metadataKeys(value: JsonRecord | null | undefined) {
  return Object.keys(value ?? {}).sort((left, right) => left.localeCompare(right));
}

function metadataNumber(metadata: JsonRecord, key: string) {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildImportSummary(metadata: JsonRecord) {
  return {
    totalRows: metadataNumber(metadata, "totalRows"),
    validAddresses: metadataNumber(metadata, "validAddresses"),
    invalidAddresses: metadataNumber(metadata, "invalidAddresses"),
    duplicates: metadataNumber(metadata, "duplicates"),
    candidatesCreated: metadataNumber(metadata, "candidatesCreated"),
    candidatesUpdated: metadataNumber(metadata, "candidatesUpdated"),
    evidenceCreated: metadataNumber(metadata, "evidenceCreated"),
    conflictsFound: metadataNumber(metadata, "conflictsFound"),
    errorCount: Array.isArray(metadata.errors) ? metadata.errors.length : null,
  };
}

function serializeSourceJobListRow(sourceJob: SourceJobListApiRowInput) {
  const operationalSummary = buildSourceJobOperationalSummary({
    status: sourceJob.status,
    archiveStorageUri: sourceJob.archiveStorageUri,
    chainScope: sourceJob.chainScope,
    expectedRoles: sourceJob.expectedRoles,
    metadata: sourceJob.metadata,
  });

  return {
    id: sourceJob.id,
    sourceType: sourceJob.sourceType,
    sourceName: sourceJob.sourceName,
    sourceUrl: sourceJob.sourceUrl,
    localFileName: sourceJob.localFileName,
    archiveStorageUri: operationalSummary.archiveStorageUri,
    entityHint: sourceJob.entityHint,
    protocolHint: sourceJob.protocolHint,
    chainScope: operationalSummary.chainScope,
    expectedRoles: operationalSummary.expectedRoles,
    status: sourceJob.status,
    parserVersion: sourceJob.parserVersion,
    archived: operationalSummary.archived,
    archivedAt: operationalSummary.archivedAt,
    archivedBy: operationalSummary.archivedBy,
    archiveReason: operationalSummary.archiveReason,
    metadataKeys: metadataKeys(sourceJob.metadata),
    importSummary: buildImportSummary(sourceJob.metadata),
    createdAt: isoDate(sourceJob.createdAt),
    updatedAt: isoDate(sourceJob.updatedAt),
    hrefs: {
      sourceJob: `/mqchain/source-jobs/${sourceJob.id}`,
      detailApi: `/api/mqchain/source-jobs/${sourceJob.id}`,
    },
  };
}

export function buildSourceJobListApiResponse(input: SourceJobListApiInput) {
  return {
    ...SOURCE_JOB_LIST_API_CONTRACT,
    query: input.query,
    pagination: {
      totalRows: input.total,
      page: input.query.page,
      pageSize: input.query.pageSize,
      totalPages: input.totalPages,
      returnedRows: input.rows.length,
    },
    rows: input.rows.map(serializeSourceJobListRow),
    canonicalWrites: {
      candidatesCreated: 0,
      approvalsCreated: 0,
      registryRowsCreated: 0,
      kvBuildsCreated: 0,
    },
    policy: {
      sourceArchiveIsProvenanceOnly: true,
      intakeDoesNotApproveCandidates: true,
      candidatesRemainStagedUntilApproval: true,
      registryRowsRequireBatchCommit: true,
      sourceVerificationIsOperatorDriven: true,
      sourceVerificationDoesNotApproveCandidates: true,
      rawTextAndEvidencePayloadsExcludedByDefault: true,
      fullMetadataExcludedByDefault: true,
    },
  };
}

export function buildSourceJobIntakeApiResponse(input: SourceJobIntakeApiInput) {
  return {
    ...SOURCE_JOB_INTAKE_API_CONTRACT,
    intakeType: input.intakeType,
    sourceJob: {
      id: input.summary.sourceJobId,
      href: `/mqchain/source-jobs/${input.summary.sourceJobId}`,
      detailApi: `/api/mqchain/source-jobs/${input.summary.sourceJobId}`,
    },
    importSummary: {
      totalRows: input.summary.totalRows,
      validAddresses: input.summary.validAddresses,
      invalidAddresses: input.summary.invalidAddresses,
      duplicates: input.summary.duplicates,
      candidatesCreated: input.summary.candidatesCreated,
      candidatesUpdated: input.summary.candidatesUpdated,
      evidenceCreated: input.summary.evidenceCreated,
      conflictsFound: input.summary.conflictsFound,
      errorCount: input.summary.errors.length,
      errors: input.summary.errors,
    },
    canonicalWrites: {
      candidatesCreated: input.summary.candidatesCreated,
      evidenceCreated: input.summary.evidenceCreated,
      approvalsCreated: 0,
      registryRowsCreated: 0,
      kvBuildsCreated: 0,
    },
    policy: {
      intakeCreatesStagedCandidatesOnly: true,
      intakeDoesNotApproveCandidates: true,
      candidatesRemainStagedUntilApproval: true,
      registryRowsRequireBatchCommit: true,
      kvBuildsRequireApprovedRegistryRows: true,
      canonicalRegistryAndKvWritesBlocked: true,
      rawRequestPayloadExcludedFromResponse: true,
    },
    nextActions: {
      reviewQueue: "/mqchain/review",
      candidates: "/mqchain/candidates",
      sourceJob: `/mqchain/source-jobs/${input.summary.sourceJobId}`,
    },
  };
}

export function buildSourceJobExportApiResponse(input: SourceJobExportInput) {
  const operationalSummary = buildSourceJobOperationalSummary({
    status: input.sourceJob.status,
    archiveStorageUri: input.sourceJob.archiveStorageUri,
    chainScope: input.sourceJob.chainScope,
    expectedRoles: input.sourceJob.expectedRoles,
    metadata: input.sourceJob.metadata,
  });

  return {
    ...SOURCE_JOB_EXPORT_API_CONTRACT,
    sourceJob: {
      id: input.sourceJob.id,
      sourceType: input.sourceJob.sourceType,
      sourceName: input.sourceJob.sourceName,
      sourceUrl: input.sourceJob.sourceUrl,
      localFileName: input.sourceJob.localFileName,
      archiveStorageUri: operationalSummary.archiveStorageUri,
      entityHint: input.sourceJob.entityHint,
      protocolHint: input.sourceJob.protocolHint,
      chainScope: operationalSummary.chainScope,
      expectedRoles: operationalSummary.expectedRoles,
      status: input.sourceJob.status,
      parserVersion: input.sourceJob.parserVersion,
      archived: operationalSummary.archived,
      archivedAt: operationalSummary.archivedAt,
      archivedBy: operationalSummary.archivedBy,
      archiveReason: operationalSummary.archiveReason,
      metadataKeys: metadataKeys(input.sourceJob.metadata),
      importSummary: buildImportSummary(input.sourceJob.metadata),
      createdAt: isoDate(input.sourceJob.createdAt),
      updatedAt: isoDate(input.sourceJob.updatedAt),
    },
    rollups: {
      documents: input.documentRollup,
      candidates: input.candidateRollup,
      evidence: input.evidenceRollup,
      verifications: input.verificationRollup,
      downstream: input.downstreamRollup,
    },
    documents: input.documents.map((document) => ({
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
    candidates: input.candidates.map((candidate) => ({
      id: candidate.id,
      sourceDocumentId: candidate.sourceDocumentId,
      normalizedAddress: candidate.normalizedAddress,
      chainCode: candidate.chainCode,
      candidateStatus: candidate.candidateStatus,
      confidenceScore: candidate.confidenceScore,
      qualityTier: candidate.qualityTier,
      evidenceCount: candidate.evidenceCount,
      discoveredBy: candidate.discoveredBy,
      discoveryJobId: candidate.discoveryJobId,
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
    sourceVerifications: input.verifications.map((row) => ({
      id: row.verification.id,
      sourceJobId: row.verification.sourceJobId,
      sourceDocumentId: row.verification.sourceDocumentId,
      candidateId: row.verification.candidateId,
      verificationScope: row.verification.verificationScope,
      sourceSheet: row.verification.sourceSheet,
      sourceUrl: row.verification.sourceUrl,
      sourceTrust: row.verification.sourceTrust,
      status: row.verification.status,
      notes: row.verification.notes,
      verifiedBy: {
        id: row.verification.verifiedBy,
        email: row.verifierEmail,
        name: row.verifierName,
      },
      verificationEvidenceKeys: metadataKeys(row.verification.verificationEvidence),
      createdAt: isoDate(row.verification.createdAt),
    })),
    downstream: {
      batches: input.downstreamBatches.map((batch) => ({
        id: batch.id,
        status: batch.status,
        acceptedCount: batch.acceptedCount,
        conflictCount: batch.conflictCount,
        batchHash: batch.batchHash,
        storageUri: batch.storageUri,
        dictionaryVersion: batch.dictionaryVersion,
        committedAt: isoDate(batch.committedAt),
      })),
      registryRows: input.downstreamRegistryRows.map((row) => ({
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
        metricUsage: row.registry.metricUsage,
        isActive: row.registry.isActive,
        approvedBatchId: row.registry.approvedBatchId,
        updatedAt: isoDate(row.registry.updatedAt),
      })),
    },
    policy: {
      sourceArchiveIsProvenanceOnly: true,
      candidatesRemainStagedUntilApproval: true,
      registryRowsRequireBatchCommit: true,
      sourceVerificationIsOperatorDriven: true,
      sourceVerificationDoesNotApproveCandidates: true,
      rawTextAndEvidencePayloadsExcludedByDefault: true,
    },
  };
}
