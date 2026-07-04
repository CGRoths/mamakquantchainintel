export const EVIDENCE_LEDGER_API_CONTRACT = {
  apiVersion: "mqchain-evidence-ledger-api-v1",
  sourceOfTruth: "postgres_evidence_archive",
  servingBackend: "postgres",
  artifactType: "evidence_ledger_export",
  mutationAllowed: false,
  candidateWriteAllowed: false,
  approvalWriteAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  evidencePayloadIncluded: false,
  verificationEvidencePayloadIncluded: false,
  rawSourceTextIncluded: false,
  postgresIsCanonicalTruth: true,
  rocksDbIsCompiledArtifactOnly: true,
} as const;

type JsonRecord = Record<string, unknown>;

type EvidenceRowInput = {
  evidence: {
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
    createdBy: string | null;
    createdAt: Date;
  };
  candidate: {
    id: number;
    sourceJobId: number | null;
    normalizedAddress: string;
    chainCode: string | null;
    candidateStatus: string;
    confidenceScore: number;
    qualityTier: number;
  } | null;
  registry: {
    id: number;
    normalizedAddress: string;
    chainCode: string;
    confidenceScore: number;
    qualityTier: number;
    isActive: boolean;
    approvedBatchId: number | null;
  } | null;
  sourceDocument: {
    id: number;
    sourceJobId: number | null;
    documentType: string;
    storageUri: string | null;
    contentHash: string;
  } | null;
  sourceJob: {
    id: number;
    sourceType: string;
    sourceName: string | null;
    sourceUrl: string | null;
    status: string;
  } | null;
  creatorEmail: string | null;
  creatorName: string | null;
};

type SourceVerificationRowInput = {
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
  candidate: {
    id: number;
    sourceJobId: number | null;
    normalizedAddress: string;
    chainCode: string | null;
    candidateStatus: string;
    confidenceScore: number;
    qualityTier: number;
  } | null;
  sourceDocument: {
    id: number;
    sourceJobId: number | null;
    documentType: string;
    storageUri: string | null;
    contentHash: string;
  } | null;
  sourceJob: {
    id: number;
    sourceType: string;
    sourceName: string | null;
    sourceUrl: string | null;
    status: string;
  } | null;
  verifierEmail: string | null;
  verifierName: string | null;
};

export type EvidenceLedgerApiInput = {
  query: {
    page: number;
    pageSize: number;
    filters: Record<string, unknown>;
  };
  evidenceRows: EvidenceRowInput[];
  evidenceTotal: number;
  evidenceTotalPages: number;
  sourceVerificationRows: SourceVerificationRowInput[];
  sourceVerificationTotal: number;
  sourceVerificationTotalPages: number;
};

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function metadataKeys(value: JsonRecord | null | undefined) {
  return Object.keys(value ?? {}).sort((left, right) => left.localeCompare(right));
}

function serializeCandidate(candidate: EvidenceRowInput["candidate"] | SourceVerificationRowInput["candidate"]) {
  if (!candidate) return null;

  return {
    id: candidate.id,
    sourceJobId: candidate.sourceJobId,
    normalizedAddress: candidate.normalizedAddress,
    chainCode: candidate.chainCode,
    candidateStatus: candidate.candidateStatus,
    confidenceScore: candidate.confidenceScore,
    qualityTier: candidate.qualityTier,
    href: `/mqchain/candidates/${candidate.id}`,
    detailApi: `/api/mqchain/candidates/${candidate.id}`,
  };
}

function serializeSourceDocument(sourceDocument: EvidenceRowInput["sourceDocument"] | SourceVerificationRowInput["sourceDocument"]) {
  if (!sourceDocument) return null;

  return {
    id: sourceDocument.id,
    sourceJobId: sourceDocument.sourceJobId,
    documentType: sourceDocument.documentType,
    storageUri: sourceDocument.storageUri,
    contentHash: sourceDocument.contentHash,
  };
}

function serializeSourceJob(sourceJob: EvidenceRowInput["sourceJob"] | SourceVerificationRowInput["sourceJob"]) {
  if (!sourceJob) return null;

  return {
    id: sourceJob.id,
    sourceType: sourceJob.sourceType,
    sourceName: sourceJob.sourceName,
    sourceUrl: sourceJob.sourceUrl,
    status: sourceJob.status,
    href: `/mqchain/source-jobs/${sourceJob.id}`,
    detailApi: `/api/mqchain/source-jobs/${sourceJob.id}`,
  };
}

function serializeEvidenceRow(row: EvidenceRowInput) {
  return {
    id: row.evidence.id,
    candidateId: row.evidence.candidateId,
    registryId: row.evidence.registryId,
    batchId: row.evidence.batchId,
    evidenceType: row.evidence.evidenceType,
    sourceUrl: row.evidence.sourceUrl,
    sourceDocumentId: row.evidence.sourceDocumentId,
    evidenceHash: row.evidence.evidenceHash,
    storageUri: row.evidence.storageUri,
    confidenceDelta: row.evidence.confidenceDelta,
    trustTier: row.evidence.trustTier,
    summary: row.evidence.summary,
    payloadKeys: metadataKeys(row.evidence.payload),
    createdBy: {
      id: row.evidence.createdBy,
      email: row.creatorEmail,
      name: row.creatorName,
    },
    createdAt: isoDate(row.evidence.createdAt),
    candidate: serializeCandidate(row.candidate),
    registry: row.registry
      ? {
          id: row.registry.id,
          normalizedAddress: row.registry.normalizedAddress,
          chainCode: row.registry.chainCode,
          confidenceScore: row.registry.confidenceScore,
          qualityTier: row.registry.qualityTier,
          isActive: row.registry.isActive,
          approvedBatchId: row.registry.approvedBatchId,
          href: `/mqchain/registry/${row.registry.id}`,
          detailApi: `/api/mqchain/registry/${row.registry.id}`,
        }
      : null,
    source: {
      sourceJob: serializeSourceJob(row.sourceJob),
      sourceDocument: serializeSourceDocument(row.sourceDocument),
    },
  };
}

function serializeSourceVerificationRow(row: SourceVerificationRowInput) {
  return {
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
    verificationEvidenceKeys: metadataKeys(row.verification.verificationEvidence),
    verifiedBy: {
      id: row.verification.verifiedBy,
      email: row.verifierEmail,
      name: row.verifierName,
    },
    createdAt: isoDate(row.verification.createdAt),
    candidate: serializeCandidate(row.candidate),
    source: {
      sourceJob: serializeSourceJob(row.sourceJob),
      sourceDocument: serializeSourceDocument(row.sourceDocument),
    },
  };
}

export function buildEvidenceLedgerApiResponse(input: EvidenceLedgerApiInput) {
  return {
    ...EVIDENCE_LEDGER_API_CONTRACT,
    query: input.query,
    pagination: {
      page: input.query.page,
      pageSize: input.query.pageSize,
      evidence: {
        totalRows: input.evidenceTotal,
        totalPages: input.evidenceTotalPages,
        returnedRows: input.evidenceRows.length,
      },
      sourceVerifications: {
        totalRows: input.sourceVerificationTotal,
        totalPages: input.sourceVerificationTotalPages,
        returnedRows: input.sourceVerificationRows.length,
      },
    },
    evidence: input.evidenceRows.map(serializeEvidenceRow),
    sourceVerifications: input.sourceVerificationRows.map(serializeSourceVerificationRow),
    canonicalWrites: {
      candidatesCreated: 0,
      approvalsCreated: 0,
      registryRowsCreated: 0,
      kvBuildsCreated: 0,
    },
    policy: {
      evidenceIsProvenanceOnly: true,
      evidenceDoesNotApproveCandidates: true,
      sourceVerificationIsOperatorDriven: true,
      sourceVerificationDoesNotApproveCandidates: true,
      sourceJobVerificationDoesNotSatisfySheetScopedCandidates: true,
      approvalRequiredBeforeBatch: true,
      batchCommitRequiredBeforeRegistry: true,
      rawEvidencePayloadsExcludedByDefault: true,
      verificationEvidencePayloadsExcludedByDefault: true,
      rawSourceTextExcludedByDefault: true,
      externalWorkersMustNotTreatEvidenceAsProductionLabels: true,
    },
  };
}
