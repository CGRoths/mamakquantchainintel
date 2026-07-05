export type CandidateTraceWarningInput = {
  candidateStatus: string;
  duplicateOfCandidateId?: number | null;
  duplicateCandidateCount?: number;
  registryMatchCount?: number;
};

export type CandidateTraceWarning = {
  tone: "warning" | "info";
  message: string;
};

type JsonRecord = Record<string, unknown>;

export type CandidateSourceVerificationInput = {
  candidate: {
    id: number;
    sourceJobId?: number | null;
    sourceDocumentId?: number | null;
    metadata?: JsonRecord | null;
  };
  verifications: Array<{
    id: number;
    sourceJobId?: number | null;
    sourceDocumentId?: number | null;
    candidateId?: number | null;
    verificationScope: string;
    sourceSheet?: string | null;
    sourceUrl?: string | null;
    sourceTrust: string;
    status: string;
    notes?: string | null;
    createdAt: Date;
  }>;
};

export type CandidateSourceVerificationContext = {
  sheetNames: string[];
  sourceUrls: string[];
  sheetVerificationRequired: boolean;
  hasVerifiedSourceJob: boolean;
  hasVerifiedSourceDocument: boolean;
  hasVerifiedSourceSheet: boolean;
  hasVerifiedCandidate: boolean;
  hasVerifiedSourceUrl: boolean;
  matchingVerifiedCount: number;
  status:
    | "candidate_verified"
    | "source_sheet_verified"
    | "source_document_verified"
    | "source_job_verified"
    | "source_url_verified"
    | "source_sheet_verification_missing"
    | "source_verification_missing";
  message: string;
};

export type CandidateSourceVerificationStatus = CandidateSourceVerificationContext["status"];

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function addSheetName(values: Set<string>, value: unknown) {
  const clean = cleanString(value);
  if (clean) values.add(clean);
}

function addSourceUrl(values: Set<string>, value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) addSourceUrl(values, item);
    return;
  }
  const clean = cleanString(value);
  if (clean) values.add(clean);
}

function collectSheetNames(value: unknown, values = new Set<string>()) {
  if (!value || typeof value !== "object") return values;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        addSheetName(values, item);
      } else {
        collectSheetNames(item, values);
      }
    }
    return values;
  }

  for (const [key, item] of Object.entries(value)) {
    if (["sheet", "sourceSheet", "source_sheet", "sheetName", "sheet_name", "tab", "tabName", "tab_name"].includes(key)) {
      addSheetName(values, item);
    }
    if (key === "sheet_profiles" || key === "sheetProfiles" || key === "source_evidence" || key === "sourceEvidence" || key === "rawReference") {
      collectSheetNames(item, values);
    }
  }

  return values;
}

function collectSourceUrls(value: unknown, values = new Set<string>()) {
  if (!value || typeof value !== "object") return values;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "object") {
        collectSourceUrls(item, values);
      }
    }
    return values;
  }

  for (const [key, item] of Object.entries(value)) {
    if (["sourceUrl", "source_url", "url", "source", "href"].includes(key)) {
      addSourceUrl(values, item);
    }
    if (key === "source_evidence" || key === "sourceEvidence" || key === "rawReference" || key === "metadata") {
      collectSourceUrls(item, values);
    }
  }

  return values;
}

export function extractCandidateSourceSheetNames(metadata: JsonRecord | null | undefined) {
  return Array.from(collectSheetNames(metadata).values()).sort((left, right) => left.localeCompare(right));
}

export function extractCandidateSourceUrls(metadata: JsonRecord | null | undefined) {
  return Array.from(collectSourceUrls(metadata).values()).sort((left, right) => left.localeCompare(right));
}

export function candidateSourceSheetMatches(metadata: JsonRecord | null | undefined, sourceSheet: string | null | undefined) {
  const sheetNames = extractCandidateSourceSheetNames(metadata);
  const requestedSheet = sourceSheet?.trim().toLowerCase();

  return {
    knownValues: sheetNames,
    matchRequired: sheetNames.length > 0,
    matches: !requestedSheet || sheetNames.length === 0 || sheetNames.some((sheet) => sheet.toLowerCase() === requestedSheet),
  };
}

export function candidateSourceUrlMatches(metadata: JsonRecord | null | undefined, sourceUrl: string | null | undefined) {
  const sourceUrls = extractCandidateSourceUrls(metadata);
  const requestedUrl = sourceUrl?.trim();

  return {
    knownValues: sourceUrls,
    matchRequired: sourceUrls.length > 0,
    matches: !requestedUrl || sourceUrls.length === 0 || sourceUrls.includes(requestedUrl),
  };
}

export function buildCandidateSourceVerificationContext(
  input: CandidateSourceVerificationInput,
): CandidateSourceVerificationContext {
  const sheetNames = extractCandidateSourceSheetNames(input.candidate.metadata);
  const sourceUrls = extractCandidateSourceUrls(input.candidate.metadata);
  const matchingSheets = new Set(sheetNames.map((sheet) => sheet.toLowerCase()));
  const matchingSourceUrls = new Set(sourceUrls);
  const verified = input.verifications.filter((verification) => verification.status === "verified");

  const hasVerifiedCandidate = verified.some((verification) => verification.candidateId === input.candidate.id);
  const hasVerifiedSourceDocument = verified.some(
    (verification) =>
      Boolean(input.candidate.sourceDocumentId) && verification.sourceDocumentId === input.candidate.sourceDocumentId,
  );
  const hasVerifiedSourceSheet = verified.some((verification) => {
    const sheet = verification.sourceSheet?.trim().toLowerCase();
    return verification.verificationScope === "source_sheet" && Boolean(sheet && matchingSheets.has(sheet));
  });
  const hasVerifiedSourceUrl = verified.some(
    (verification) =>
      verification.verificationScope === "source_url" &&
      verification.sourceJobId === input.candidate.sourceJobId &&
      Boolean(verification.sourceUrl && matchingSourceUrls.has(verification.sourceUrl)),
  );
  const hasVerifiedSourceJob = verified.some(
    (verification) => verification.verificationScope === "source_job" && verification.sourceJobId === input.candidate.sourceJobId,
  );
  const matchingVerifiedCount = verified.filter((verification) => {
    if (verification.candidateId === input.candidate.id) return true;
    if (input.candidate.sourceDocumentId && verification.sourceDocumentId === input.candidate.sourceDocumentId) return true;
    if (verification.verificationScope === "source_sheet") {
      const sheet = verification.sourceSheet?.trim().toLowerCase();
      return Boolean(sheet && matchingSheets.has(sheet));
    }
    if (verification.verificationScope === "source_url") {
      return Boolean(verification.sourceJobId === input.candidate.sourceJobId && verification.sourceUrl && matchingSourceUrls.has(verification.sourceUrl));
    }
    return verification.sourceJobId === input.candidate.sourceJobId;
  }).length;

  if (hasVerifiedCandidate) {
    return {
      sheetNames,
      sourceUrls,
      sheetVerificationRequired: sheetNames.length > 0,
      hasVerifiedSourceJob,
      hasVerifiedSourceDocument,
      hasVerifiedSourceSheet,
      hasVerifiedCandidate,
      hasVerifiedSourceUrl,
      matchingVerifiedCount,
      status: "candidate_verified",
      message: "Candidate-specific source verification is recorded.",
    };
  }

  if (sheetNames.length > 0) {
    return {
      sheetNames,
      sourceUrls,
      sheetVerificationRequired: true,
      hasVerifiedSourceJob,
      hasVerifiedSourceDocument,
      hasVerifiedSourceSheet,
      hasVerifiedCandidate,
      hasVerifiedSourceUrl,
      matchingVerifiedCount,
      status: hasVerifiedSourceSheet ? "source_sheet_verified" : "source_sheet_verification_missing",
      message: hasVerifiedSourceSheet
        ? "Sheet-scoped source verification matches this candidate."
        : "This candidate carries sheet-level provenance; source_job verification alone does not satisfy that scope.",
    };
  }

  if (hasVerifiedSourceDocument) {
    return {
      sheetNames,
      sourceUrls,
      sheetVerificationRequired: false,
      hasVerifiedSourceJob,
      hasVerifiedSourceDocument,
      hasVerifiedSourceSheet,
      hasVerifiedCandidate,
      hasVerifiedSourceUrl,
      matchingVerifiedCount,
      status: "source_document_verified",
      message: "Source-document verification covers this candidate.",
    };
  }

  if (hasVerifiedSourceJob) {
    return {
      sheetNames,
      sourceUrls,
      sheetVerificationRequired: false,
      hasVerifiedSourceJob,
      hasVerifiedSourceDocument,
      hasVerifiedSourceSheet,
      hasVerifiedCandidate,
      hasVerifiedSourceUrl,
      matchingVerifiedCount,
      status: "source_job_verified",
      message: "Source-job verification covers this candidate.",
    };
  }

  if (hasVerifiedSourceUrl) {
    return {
      sheetNames,
      sourceUrls,
      sheetVerificationRequired: false,
      hasVerifiedSourceJob,
      hasVerifiedSourceDocument,
      hasVerifiedSourceSheet,
      hasVerifiedCandidate,
      hasVerifiedSourceUrl,
      matchingVerifiedCount,
      status: "source_url_verified",
      message: "Source-URL verification matches this candidate's source URL.",
    };
  }

  return {
    sheetNames,
    sourceUrls,
    sheetVerificationRequired: false,
    hasVerifiedSourceJob,
    hasVerifiedSourceDocument,
    hasVerifiedSourceSheet,
    hasVerifiedCandidate,
    hasVerifiedSourceUrl,
    matchingVerifiedCount,
    status: "source_verification_missing",
    message: "No matching verified source record is linked to this candidate yet.",
  };
}

export function isCandidateSourceVerificationSatisfied(status: CandidateSourceVerificationStatus | null | undefined) {
  return Boolean(status && !status.includes("missing"));
}

export function buildCandidateTraceWarnings(input: CandidateTraceWarningInput): CandidateTraceWarning[] {
  const warnings: CandidateTraceWarning[] = [];

  if (input.candidateStatus === "conflict_pending") {
    warnings.push({
      tone: "warning",
      message: "Marked conflict; inspect evidence and approval history before batch inclusion.",
    });
  }

  if (input.candidateStatus === "needs_more_evidence") {
    warnings.push({
      tone: "warning",
      message: "Needs more evidence before approval or batch creation.",
    });
  }

  if (input.candidateStatus === "duplicate") {
    warnings.push({
      tone: "warning",
      message: input.duplicateOfCandidateId
        ? `Duplicate of candidate ${input.duplicateOfCandidateId}; avoid approving both records.`
        : "Marked duplicate without a linked duplicate target.",
    });
  }

  if ((input.duplicateCandidateCount ?? 0) > 0) {
    warnings.push({
      tone: "info",
      message: `${input.duplicateCandidateCount} candidate(s) point to this record as their duplicate target.`,
    });
  }

  if ((input.registryMatchCount ?? 0) > 0) {
    warnings.push({
      tone: "info",
      message: `${input.registryMatchCount} registry label(s) already exist for this chain/address.`,
    });
  }

  return warnings;
}
