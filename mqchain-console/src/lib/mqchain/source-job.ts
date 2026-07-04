import { confidenceBucket, type DistributionRow } from "./batch-detail";

export type SourceJobCandidateRollupInput = {
  candidateStatus: string;
  chainCode?: string | null;
  confidenceScore: number;
  evidenceCount: number;
};

export type SourceJobEvidenceRollupInput = {
  evidenceType: string;
  trustTier?: string | null;
};

export type SourceJobDocumentRollupInput = {
  documentType: string;
  storageUri?: string | null;
  contentHash?: string | null;
  sizeBytes?: number | null;
  extractedText?: string | null;
};

export type SourceJobVerificationRollupInput = {
  verificationScope: string;
  sourceTrust: string;
  status: string;
};

export type SourceJobScopeInput = {
  chainCode?: string | null;
  roleHint?: string | null;
  suggestedRoleCode?: string | null;
};

export type SourceJobOperationalSummaryInput = {
  status?: string | null;
  archiveStorageUri?: string | null;
  chainScope?: string[] | null;
  expectedRoles?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

export type SourceJobDownstreamBatchInput = {
  status: string;
};

export type SourceJobDownstreamRegistryInput = {
  isActive: boolean;
};

export type SourceJobIntakeAuditInput = {
  sourceJobId: number;
  sourceDocumentId: number;
  sourceType: string;
  sourceName: string;
  sourceUrl?: string | null;
  documentType: string;
  status: string;
  chainScope: string[];
  expectedRoles: string[];
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

export type SourceVerificationDecisionInput = {
  sourceVerificationId: number;
  sourceJobId: number;
  sourceDocumentId?: number | null;
  candidateId?: number | null;
  verificationScope: string;
  sourceSheet?: string | null;
  sourceUrl?: string | null;
  sourceTrust: string;
  status: string;
  evidenceKeys: string[];
};

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toDistribution(map: Map<string, number>): DistributionRow[] {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function addCleanValue(values: Set<string>, value: string | null | undefined) {
  const clean = value?.trim();
  if (clean) {
    values.add(clean);
  }
}

function toCleanSortedStrings(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const values = new Set<string>();
  for (const item of value) {
    if (typeof item === "string") {
      addCleanValue(values, item);
    }
  }
  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildSourceJobCandidateRollup(candidates: SourceJobCandidateRollupInput[]) {
  const statusCounts = new Map<string, number>();
  const chainCounts = new Map<string, number>();
  const confidenceCounts = new Map<string, number>();
  let evidenceCount = 0;

  for (const candidate of candidates) {
    increment(statusCounts, candidate.candidateStatus);
    increment(chainCounts, candidate.chainCode || "unknown");
    increment(confidenceCounts, confidenceBucket(candidate.confidenceScore));
    evidenceCount += candidate.evidenceCount;
  }

  return {
    totalCandidates: candidates.length,
    evidenceCount,
    approvedCount: statusCounts.get("approved") ?? 0,
    pendingCount: statusCounts.get("pending_review") ?? 0,
    duplicateCount: statusCounts.get("duplicate") ?? 0,
    conflictCount: statusCounts.get("conflict_pending") ?? 0,
    statusDistribution: toDistribution(statusCounts),
    chainDistribution: toDistribution(chainCounts),
    confidenceDistribution: toDistribution(confidenceCounts),
  };
}

export function buildSourceJobScopeSummary(rows: SourceJobScopeInput[]) {
  const chainScope = new Set<string>();
  const expectedRoles = new Set<string>();

  for (const row of rows) {
    addCleanValue(chainScope, row.chainCode);
    addCleanValue(expectedRoles, row.suggestedRoleCode ?? row.roleHint);
  }

  return {
    chainScope: Array.from(chainScope).sort((left, right) => left.localeCompare(right)),
    expectedRoles: Array.from(expectedRoles).sort((left, right) => left.localeCompare(right)),
  };
}

export function buildSourceJobOperationalSummary(input: SourceJobOperationalSummaryInput) {
  const metadata = input.metadata ?? {};
  const chainScope = toCleanSortedStrings(input.chainScope?.length ? input.chainScope : metadata.chainScope);
  const expectedRoles = toCleanSortedStrings(input.expectedRoles?.length ? input.expectedRoles : metadata.expectedRoles);
  const archiveStorageUri = cleanString(input.archiveStorageUri) ?? cleanString(metadata.archiveStorageUri);

  return {
    chainScope,
    expectedRoles,
    archived: input.status === "archived",
    archiveStorageUri,
    archivedAt: cleanString(metadata.archivedAt),
    archivedBy: cleanString(metadata.archivedBy),
    archiveReason: cleanString(metadata.archiveReason),
  };
}

export function buildSourceJobEvidenceRollup(evidence: SourceJobEvidenceRollupInput[]) {
  const typeCounts = new Map<string, number>();
  const trustCounts = new Map<string, number>();

  for (const row of evidence) {
    increment(typeCounts, row.evidenceType);
    increment(trustCounts, row.trustTier || "unknown");
  }

  return {
    totalEvidence: evidence.length,
    typeDistribution: toDistribution(typeCounts),
    trustDistribution: toDistribution(trustCounts),
  };
}

export function buildSourceJobDocumentRollup(documents: SourceJobDocumentRollupInput[]) {
  const typeCounts = new Map<string, number>();
  let withStorageUri = 0;
  let withContentHash = 0;
  let withExtractedText = 0;
  let totalSizeBytes = 0;

  for (const document of documents) {
    increment(typeCounts, document.documentType || "unknown");
    if (cleanString(document.storageUri)) withStorageUri += 1;
    if (cleanString(document.contentHash)) withContentHash += 1;
    if (cleanString(document.extractedText)) withExtractedText += 1;
    if (typeof document.sizeBytes === "number" && Number.isFinite(document.sizeBytes) && document.sizeBytes > 0) {
      totalSizeBytes += document.sizeBytes;
    }
  }

  return {
    totalDocuments: documents.length,
    withStorageUri,
    missingStorageUri: documents.length - withStorageUri,
    withContentHash,
    missingContentHash: documents.length - withContentHash,
    withExtractedText,
    totalSizeBytes,
    typeDistribution: toDistribution(typeCounts),
  };
}

export function buildSourceJobVerificationRollup(verifications: SourceJobVerificationRollupInput[]) {
  const scopeCounts = new Map<string, number>();
  const trustCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  let verifiedCount = 0;

  for (const verification of verifications) {
    increment(scopeCounts, verification.verificationScope || "unknown");
    increment(trustCounts, verification.sourceTrust || "unknown");
    increment(statusCounts, verification.status || "unknown");
    if (verification.status === "verified") {
      verifiedCount += 1;
    }
  }

  return {
    totalVerifications: verifications.length,
    verifiedCount,
    nonVerifiedCount: verifications.length - verifiedCount,
    scopeDistribution: toDistribution(scopeCounts),
    trustDistribution: toDistribution(trustCounts),
    statusDistribution: toDistribution(statusCounts),
  };
}

export function buildSourceJobDownstreamRollup(
  batches: SourceJobDownstreamBatchInput[],
  registryRows: SourceJobDownstreamRegistryInput[],
) {
  const batchStatusCounts = new Map<string, number>();
  let activeRegistryRows = 0;

  for (const batch of batches) {
    increment(batchStatusCounts, batch.status);
  }

  for (const row of registryRows) {
    if (row.isActive) {
      activeRegistryRows += 1;
    }
  }

  return {
    totalBatches: batches.length,
    committedBatches: batchStatusCounts.get("committed") ?? 0,
    totalRegistryRows: registryRows.length,
    activeRegistryRows,
    inactiveRegistryRows: registryRows.length - activeRegistryRows,
    batchStatusDistribution: toDistribution(batchStatusCounts),
  };
}

export function buildSourceJobIntakeAuditPayload(input: SourceJobIntakeAuditInput) {
  return {
    sourceJobId: input.sourceJobId,
    sourceDocumentId: input.sourceDocumentId,
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl ?? null,
    documentType: input.documentType,
    status: input.status,
    chainScope: [...input.chainScope],
    expectedRoles: [...input.expectedRoles],
    summary: {
      totalRows: input.totalRows,
      validAddresses: input.validAddresses,
      invalidAddresses: input.invalidAddresses,
      duplicates: input.duplicates,
      candidatesCreated: input.candidatesCreated,
      candidatesUpdated: input.candidatesUpdated,
      evidenceCreated: input.evidenceCreated,
      conflictsFound: input.conflictsFound,
      errorCount: input.errors.length,
    },
    errors: input.errors,
  };
}

export function buildSourceVerificationDecisionPayload(input: SourceVerificationDecisionInput) {
  return {
    sourceVerificationId: input.sourceVerificationId,
    sourceJobId: input.sourceJobId,
    sourceDocumentId: input.sourceDocumentId ?? null,
    candidateId: input.candidateId ?? null,
    verificationScope: input.verificationScope,
    sourceSheet: input.sourceSheet ?? null,
    sourceUrl: input.sourceUrl ?? null,
    sourceTrust: input.sourceTrust,
    status: input.status,
    evidenceKeys: [...input.evidenceKeys].sort((left, right) => left.localeCompare(right)),
    policy: {
      verificationIsOperatorDriven: true,
      registryWriteAllowed: false,
      kvWriteAllowed: false,
      candidateApprovalStillRequired: true,
      batchCommitStillRequired: true,
    },
  };
}

export function buildSourceJobArchiveMetadata(
  metadata: Record<string, unknown> | null | undefined,
  input: { archiveStorageUri?: string | null; reason?: string | null; actorEmail?: string | null },
) {
  const currentMetadata = metadata ?? {};
  const archiveStorageUri = input.archiveStorageUri || cleanString(currentMetadata.archiveStorageUri);

  return {
    ...currentMetadata,
    archivedAt: new Date().toISOString(),
    archivedBy: input.actorEmail ?? null,
    archiveReason: input.reason || "Source job archived by operator.",
    archiveStorageUri,
  };
}
