import { buildCandidateSourceVerificationContext, buildCandidateTraceWarnings, type CandidateSourceVerificationContext } from "./candidate-detail";
import { buildEditedApprovalReadiness, buildReviewReadiness, REVIEW_READINESS_BLOCKER_LABELS } from "./review";

export const CANDIDATE_EXPORT_API_CONTRACT = {
  apiVersion: "mqchain-candidate-export-api-v1",
  sourceOfTruth: "postgres_candidate_staging",
  servingBackend: "postgres",
  artifactType: "candidate_page_export",
  mutationAllowed: false,
  candidateWriteAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  candidatesAreApprovedTruth: false,
  batchCommitRequiredForRegistryTruth: true,
  postgresIsCanonicalTruth: true,
} as const;

export const CANDIDATE_DETAIL_EXPORT_API_CONTRACT = {
  apiVersion: "mqchain-candidate-detail-api-v1",
  sourceOfTruth: "postgres_candidate_staging",
  servingBackend: "postgres",
  artifactType: "candidate_detail_export",
  mutationAllowed: false,
  candidateWriteAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  candidatesAreApprovedTruth: false,
  evidencePayloadIncluded: false,
  verificationEvidencePayloadIncluded: false,
  approvalEventPayloadsIncluded: false,
  batchCommitRequiredForRegistryTruth: true,
  postgresIsCanonicalTruth: true,
} as const;

type JsonRecord = Record<string, unknown>;

export type CandidateExportRowInput = {
  candidate: {
    id: number;
    sourceJobId: number | null;
    sourceDocumentId: number | null;
    rawAddress: string;
    normalizedAddress: string;
    chainCode: string | null;
    addressFamily: string | null;
    prefixCode: number | null;
    payloadHex: string | null;
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
    discoveryJobId: number | null;
    evidenceCount: number;
    firstSeenBlock: number | null;
    lastSeenBlock: number | null;
    metadata: JsonRecord;
    createdAt: Date;
    updatedAt: Date;
  };
  entityName: string | null;
  protocolName: string | null;
  roleCode: string | null;
  sourceType: string | null;
  sourceVerificationContext?: CandidateSourceVerificationContext | null;
};

export type CandidateExportApiInput = {
  query: {
    page: number;
    pageSize: number;
    filters: Record<string, unknown>;
  };
  rows: CandidateExportRowInput[];
  total: number;
  totalPages: number;
};

export type CandidateDetailExportInput = {
  candidate: CandidateExportRowInput["candidate"];
  dictionaries: {
    entities: Array<{ id: number; entityCode: string; entityName: string }>;
    protocols: Array<{ id: number; protocolCode: string; protocolName: string }>;
    roles: Array<{ roleId: number; roleCode: string; defaultFlags: number | null }>;
  };
  sourceJob: {
    id: number;
    sourceType: string;
    sourceName: string | null;
    sourceUrl: string | null;
    status: string;
    parserVersion: string;
  } | null;
  sourceDocument: {
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
  registryMatches: Array<{
    registry: {
      id: number;
      chainCode: string;
      normalizedAddress: string;
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
      isActive: boolean;
      approvedBatchId: number | null;
      updatedAt: Date;
    };
    entity: { entityCode: string; entityName: string } | null;
    protocol: { protocolCode: string; protocolName: string } | null;
    role: { roleCode: string } | null;
    category: { categoryCode: string } | null;
  }>;
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
  duplicateOfCandidate: {
    id: number;
    candidateStatus: string;
    normalizedAddress: string;
    chainCode: string | null;
  } | null;
  duplicateCandidates: Array<{
    id: number;
    candidateStatus: string;
    normalizedAddress: string;
    chainCode: string | null;
  }>;
  discoveryJob: {
    id: number;
    discoveryType: string;
    status: string;
    seedAddress: string | null;
  } | null;
  sourceVerifications: Array<{
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
};

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function metadataString(metadata: JsonRecord, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataKeys(metadata: JsonRecord | null | undefined) {
  return Object.keys(metadata ?? {}).sort((left, right) => left.localeCompare(right));
}

function sourceReference(metadata: JsonRecord) {
  return {
    sourceInputType: metadataString(metadata, "sourceInputType"),
    contractName: metadataString(metadata, "contractName"),
    roleSource: metadataString(metadata, "roleSource"),
    rawReference: metadataString(metadata, "rawReference"),
    notes: metadataString(metadata, "notes"),
    metricEligibleHint: metadataString(metadata, "metricEligible"),
  };
}

export function serializeCandidateExportRow(row: CandidateExportRowInput) {
  return {
    candidateId: row.candidate.id,
    sourceJobId: row.candidate.sourceJobId,
    sourceDocumentId: row.candidate.sourceDocumentId,
    sourceType: row.sourceType,
    chainCode: row.candidate.chainCode,
    normalizedAddress: row.candidate.normalizedAddress,
    rawAddress: row.candidate.rawAddress,
    addressFamily: row.candidate.addressFamily,
    prefixCode: row.candidate.prefixCode,
    payloadHex: row.candidate.payloadHex,
    suggestedEntity: row.candidate.suggestedEntityId
      ? {
          id: row.candidate.suggestedEntityId,
          name: row.entityName,
          hint: row.candidate.entityHint,
        }
      : null,
    suggestedProtocol: row.candidate.suggestedProtocolId
      ? {
          id: row.candidate.suggestedProtocolId,
          name: row.protocolName,
          hint: row.candidate.protocolHint,
        }
      : null,
    suggestedRole: row.candidate.suggestedRoleId
      ? {
          id: row.candidate.suggestedRoleId,
          code: row.roleCode,
          hint: row.candidate.roleHint,
        }
      : null,
    entityHint: row.candidate.entityHint,
    protocolHint: row.candidate.protocolHint,
    roleHint: row.candidate.roleHint,
    confidenceScore: row.candidate.confidenceScore,
    qualityTier: row.candidate.qualityTier,
    candidateStatus: row.candidate.candidateStatus,
    evidenceCount: row.candidate.evidenceCount,
    discoveredBy: row.candidate.discoveredBy,
    discoveryJobId: row.candidate.discoveryJobId,
    duplicateOfCandidateId: row.candidate.duplicateOfCandidateId,
    firstSeenBlock: row.candidate.firstSeenBlock,
    lastSeenBlock: row.candidate.lastSeenBlock,
    sourceVerification: row.sourceVerificationContext
      ? {
          status: row.sourceVerificationContext.status,
          message: row.sourceVerificationContext.message,
          matchingVerifiedCount: row.sourceVerificationContext.matchingVerifiedCount,
          sheetVerificationRequired: row.sourceVerificationContext.sheetVerificationRequired,
          sheetNames: row.sourceVerificationContext.sheetNames,
          hasVerifiedCandidate: row.sourceVerificationContext.hasVerifiedCandidate,
          hasVerifiedSourceDocument: row.sourceVerificationContext.hasVerifiedSourceDocument,
          hasVerifiedSourceSheet: row.sourceVerificationContext.hasVerifiedSourceSheet,
          hasVerifiedSourceJob: row.sourceVerificationContext.hasVerifiedSourceJob,
          hasVerifiedSourceUrl: row.sourceVerificationContext.hasVerifiedSourceUrl,
        }
      : null,
    metadataKeys: metadataKeys(row.candidate.metadata),
    sourceReference: sourceReference(row.candidate.metadata),
    createdAt: isoDate(row.candidate.createdAt),
    updatedAt: isoDate(row.candidate.updatedAt),
  };
}

export function buildCandidateExportApiResponse(input: CandidateExportApiInput) {
  return {
    ...CANDIDATE_EXPORT_API_CONTRACT,
    query: input.query,
    pagination: {
      totalRows: input.total,
      page: input.query.page,
      pageSize: input.query.pageSize,
      totalPages: input.totalPages,
      returnedRows: input.rows.length,
    },
    rows: input.rows.map(serializeCandidateExportRow),
    policy: {
      candidateRowsAreStagingOnly: true,
      evidenceRequiredBeforeApproval: true,
      sourceVerificationRequiredBeforeApproval: true,
      sourceVerificationRequiredBeforeBatchCommit: true,
      approvalRequiredBeforeBatch: true,
      batchCommitRequiredBeforeRegistry: true,
      externalWorkersMustNotTreatCandidatesAsProductionLabels: true,
    },
  };
}

export function buildCandidateExportCsv(input: CandidateExportApiInput) {
  const headers = [
    "candidate_id",
    "source_job_id",
    "source_document_id",
    "source_type",
    "chain_code",
    "normalized_address",
    "raw_address",
    "address_family",
    "prefix_code",
    "payload_hex",
    "entity_hint",
    "suggested_entity_id",
    "entity_name",
    "protocol_hint",
    "suggested_protocol_id",
    "protocol_name",
    "role_hint",
    "suggested_role_id",
    "role_code",
    "confidence_score",
    "quality_tier",
    "candidate_status",
    "evidence_count",
    "discovered_by",
    "discovery_job_id",
    "duplicate_of_candidate_id",
    "first_seen_block",
    "last_seen_block",
    "source_verification_status",
    "source_verification_message",
    "source_verification_matching_count",
    "source_verification_sheet_required",
    "source_verification_sheets",
    "source_input_type",
    "contract_name",
    "role_source",
    "raw_reference",
    "notes",
    "metric_eligible_hint",
    "created_at",
    "updated_at",
  ];
  const rows = input.rows.map((row) => {
    const serialized = serializeCandidateExportRow(row);
    return [
      serialized.candidateId,
      serialized.sourceJobId,
      serialized.sourceDocumentId,
      serialized.sourceType,
      serialized.chainCode,
      serialized.normalizedAddress,
      serialized.rawAddress,
      serialized.addressFamily,
      serialized.prefixCode,
      serialized.payloadHex,
      serialized.entityHint,
      serialized.suggestedEntity?.id,
      serialized.suggestedEntity?.name,
      serialized.protocolHint,
      serialized.suggestedProtocol?.id,
      serialized.suggestedProtocol?.name,
      serialized.roleHint,
      serialized.suggestedRole?.id,
      serialized.suggestedRole?.code,
      serialized.confidenceScore,
      serialized.qualityTier,
      serialized.candidateStatus,
      serialized.evidenceCount,
      serialized.discoveredBy,
      serialized.discoveryJobId,
      serialized.duplicateOfCandidateId,
      serialized.firstSeenBlock,
      serialized.lastSeenBlock,
      serialized.sourceVerification?.status,
      serialized.sourceVerification?.message,
      serialized.sourceVerification?.matchingVerifiedCount,
      serialized.sourceVerification?.sheetVerificationRequired,
      serialized.sourceVerification?.sheetNames.join("|"),
      serialized.sourceReference.sourceInputType,
      serialized.sourceReference.contractName,
      serialized.sourceReference.roleSource,
      serialized.sourceReference.rawReference,
      serialized.sourceReference.notes,
      serialized.sourceReference.metricEligibleHint,
      serialized.createdAt,
      serialized.updatedAt,
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function serializeSourceVerificationContext(context: CandidateSourceVerificationContext) {
  return {
    status: context.status,
    message: context.message,
    matchingVerifiedCount: context.matchingVerifiedCount,
    sheetVerificationRequired: context.sheetVerificationRequired,
    sheetNames: context.sheetNames,
    hasVerifiedCandidate: context.hasVerifiedCandidate,
    hasVerifiedSourceDocument: context.hasVerifiedSourceDocument,
    hasVerifiedSourceSheet: context.hasVerifiedSourceSheet,
    hasVerifiedSourceJob: context.hasVerifiedSourceJob,
    hasVerifiedSourceUrl: context.hasVerifiedSourceUrl,
  };
}

export function buildCandidateDetailExportApiResponse(input: CandidateDetailExportInput) {
  const selectedEntity = input.dictionaries.entities.find((entity) => entity.id === input.candidate.suggestedEntityId);
  const selectedProtocol = input.dictionaries.protocols.find((protocol) => protocol.id === input.candidate.suggestedProtocolId);
  const selectedRole = input.dictionaries.roles.find((role) => role.roleId === input.candidate.suggestedRoleId);
  const sourceVerificationContext = buildCandidateSourceVerificationContext({
    candidate: {
      id: input.candidate.id,
      sourceJobId: input.candidate.sourceJobId,
      sourceDocumentId: input.candidate.sourceDocumentId,
      metadata: input.candidate.metadata,
    },
    verifications: input.sourceVerifications.map((row) => row.verification),
  });
  const reviewReadiness = buildReviewReadiness({
    chainCode: input.candidate.chainCode,
    normalizedAddress: input.candidate.normalizedAddress,
    suggestedEntityId: input.candidate.suggestedEntityId,
    suggestedRoleId: input.candidate.suggestedRoleId,
    evidenceCount: input.evidence.length,
    sourceVerificationStatus: sourceVerificationContext.status,
  });
  const editedApprovalReadiness = buildEditedApprovalReadiness(reviewReadiness.blockers);

  return {
    ...CANDIDATE_DETAIL_EXPORT_API_CONTRACT,
    candidate: {
      ...serializeCandidateExportRow({
        candidate: input.candidate,
        entityName: selectedEntity?.entityName ?? null,
        protocolName: selectedProtocol?.protocolName ?? null,
        roleCode: selectedRole?.roleCode ?? null,
        sourceType: input.sourceJob?.sourceType ?? null,
        sourceVerificationContext,
      }),
      suggestedEntity: selectedEntity
        ? {
            id: selectedEntity.id,
            code: selectedEntity.entityCode,
            name: selectedEntity.entityName,
            hint: input.candidate.entityHint,
          }
        : null,
      suggestedProtocol: selectedProtocol
        ? {
            id: selectedProtocol.id,
            code: selectedProtocol.protocolCode,
            name: selectedProtocol.protocolName,
            hint: input.candidate.protocolHint,
          }
        : null,
      suggestedRole: selectedRole
        ? {
            id: selectedRole.roleId,
            code: selectedRole.roleCode,
            hint: input.candidate.roleHint,
            defaultFlags: selectedRole.defaultFlags,
          }
        : null,
    },
    source: {
      sourceJob: input.sourceJob,
      sourceDocument: input.sourceDocument
        ? {
            id: input.sourceDocument.id,
            documentType: input.sourceDocument.documentType,
            originalName: input.sourceDocument.originalName,
            storageUri: input.sourceDocument.storageUri,
            contentHash: input.sourceDocument.contentHash,
            mimeType: input.sourceDocument.mimeType,
            sizeBytes: input.sourceDocument.sizeBytes,
            extractedTextLength: input.sourceDocument.extractedText?.length ?? 0,
            metadataKeys: metadataKeys(input.sourceDocument.metadata),
            createdAt: isoDate(input.sourceDocument.createdAt),
          }
        : null,
    },
    reviewReadiness: {
      blockers: reviewReadiness.blockers.map((blocker) => ({
        code: blocker,
        label: REVIEW_READINESS_BLOCKER_LABELS[blocker],
        hard: editedApprovalReadiness.hardBlockers.includes(blocker),
      })),
      canApproveWithEdits: editedApprovalReadiness.canApproveWithEdits,
    },
    traceWarnings: buildCandidateTraceWarnings({
      candidateStatus: input.candidate.candidateStatus,
      duplicateOfCandidateId: input.candidate.duplicateOfCandidateId,
      duplicateCandidateCount: input.duplicateCandidates.length,
      registryMatchCount: input.registryMatches.length,
    }),
    sourceVerification: {
      context: serializeSourceVerificationContext(sourceVerificationContext),
      records: input.sourceVerifications.map((row) => ({
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
        verifier: {
          id: row.verification.verifiedBy,
          email: row.verifierEmail,
          name: row.verifierName,
        },
        verificationEvidenceKeys: metadataKeys(row.verification.verificationEvidence),
        createdAt: isoDate(row.verification.createdAt),
      })),
    },
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
    registryMatches: input.registryMatches.map((row) => ({
      registryId: row.registry.id,
      chainCode: row.registry.chainCode,
      normalizedAddress: row.registry.normalizedAddress,
      entity: row.registry.entityId
        ? {
            id: row.registry.entityId,
            code: row.entity?.entityCode ?? null,
            name: row.entity?.entityName ?? null,
          }
        : null,
      protocol: row.registry.protocolId
        ? {
            id: row.registry.protocolId,
            code: row.protocol?.protocolCode ?? null,
            name: row.protocol?.protocolName ?? null,
          }
        : null,
      role: row.registry.roleId ? { id: row.registry.roleId, code: row.role?.roleCode ?? null } : null,
      category: row.category?.categoryCode ? { code: row.category.categoryCode } : null,
      confidenceScore: row.registry.confidenceScore,
      qualityTier: row.registry.qualityTier,
      labelStatus: row.registry.labelStatus,
      flags: row.registry.flags,
      metricUsage: row.registry.metricUsage,
      validFromBlock: row.registry.validFromBlock,
      validToBlock: row.registry.validToBlock,
      isActive: row.registry.isActive,
      approvedBatchId: row.registry.approvedBatchId,
      updatedAt: isoDate(row.registry.updatedAt),
    })),
    duplicateContext: {
      duplicateOfCandidate: input.duplicateOfCandidate,
      duplicateCandidates: input.duplicateCandidates,
    },
    discoveryJob: input.discoveryJob,
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
    policy: {
      candidateRowsAreStagingOnly: true,
      evidenceRequiredBeforeApproval: true,
      sourceVerificationRequiredBeforeApproval: true,
      sourceVerificationRequiredBeforeBatchCommit: true,
      approvalRequiredBeforeBatch: true,
      batchCommitRequiredBeforeRegistry: true,
      rawEvidencePayloadsExcludedByDefault: true,
      verificationEvidencePayloadsExcludedByDefault: true,
      approvalEventPayloadsExcludedByDefault: true,
    },
  };
}
