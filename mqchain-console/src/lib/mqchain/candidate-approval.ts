import { isCandidateSourceVerificationSatisfied, type CandidateSourceVerificationStatus } from "./candidate-detail";
import { LABEL_STATUS } from "./constants";
import { applyMetricEligibilityToFlags, FLAG_BITS, hasFlag } from "./flags";
import { NULL_DICTIONARY_ID, validateU1AddressKey, type U1AddressKeyContext } from "./kv/contract";
import { validateMetricEligibility } from "./metric-eligibility";
import { effectiveCategoryId } from "./effective-category";

type JsonRecord = Record<string, unknown>;

/**
 * Single source of approval eligibility for "approve as suggested".
 *
 * Used by approveCandidateAsSuggested(), bulk approval preview, and bulk
 * approval execution so the rules can never diverge between the individual
 * and bulk paths. Pure: no database access, no I/O, no clock.
 */
export const CANDIDATE_APPROVAL_BLOCKERS = [
  "candidate_not_found",
  "status_not_pending_review",
  "missing_evidence",
  "missing_source_verification",
  "missing_normalized_address",
  "missing_chain",
  "missing_namespace_id",
  "missing_address_codec_id",
  "namespace_id_out_of_range",
  "address_codec_id_out_of_range",
  "missing_payload_hex",
  "invalid_payload_hex",
  "unknown_namespace",
  "unknown_codec",
  "namespace_codec_mismatch",
  "inactive_namespace",
  "inactive_codec",
  "payload_length_mismatch",
  "unresolved_entity",
  "inactive_entity",
  "unresolved_role",
  "inactive_role",
  "inactive_protocol",
  "inactive_component",
  "duplicate_candidate",
  "invalid_candidate",
  "unsupported_identifier",
  "unresolved_role_proposal",
  "required_component_unresolved",
  "invalid_confidence",
  "invalid_quality_tier",
  "malformed_timeline",
  "role_minimum_confidence_not_met",
  "role_bulk_approval_disabled",
  "normalization_status_unresolved",
  "dictionary_version_mismatch",
  "missing_source_provenance",
  "conflicting_active_registry_label",
] as const;

export type CandidateApprovalBlocker = (typeof CANDIDATE_APPROVAL_BLOCKERS)[number];

export const CANDIDATE_APPROVAL_BLOCKER_LABELS: Record<CandidateApprovalBlocker, string> = {
  candidate_not_found: "Candidate not found",
  status_not_pending_review: "Not pending review",
  missing_evidence: "Missing attached evidence",
  missing_source_verification: "Missing source verification",
  missing_normalized_address: "Missing normalized address",
  missing_chain: "Missing chain",
  missing_namespace_id: "Missing namespace ID",
  missing_address_codec_id: "Missing address codec ID",
  namespace_id_out_of_range: "Namespace ID exceeds the stable-ID maximum",
  address_codec_id_out_of_range: "Address codec ID exceeds the stable-ID maximum",
  missing_payload_hex: "Missing address payload",
  invalid_payload_hex: "Invalid address payload",
  unknown_namespace: "Unknown namespace",
  unknown_codec: "Unknown address codec",
  namespace_codec_mismatch: "Namespace and codec disagree",
  inactive_namespace: "Inactive namespace",
  inactive_codec: "Inactive address codec",
  payload_length_mismatch: "Payload length invalid for codec",
  unresolved_entity: "Unresolved entity",
  inactive_entity: "Inactive entity",
  unresolved_role: "Unresolved role",
  inactive_role: "Inactive role",
  inactive_protocol: "Inactive protocol",
  inactive_component: "Inactive component",
  duplicate_candidate: "Duplicate candidate",
  invalid_candidate: "Invalid candidate",
  unsupported_identifier: "Unsupported identifier kind",
  unresolved_role_proposal: "Unresolved role proposal",
  required_component_unresolved: "Required component unresolved",
  invalid_confidence: "Confidence is outside 0-100",
  invalid_quality_tier: "Quality tier is outside 0-7",
  malformed_timeline: "Timeline heights are malformed",
  role_minimum_confidence_not_met: "Role minimum confidence is not met",
  role_bulk_approval_disabled: "Role policy disallows bulk approval",
  normalization_status_unresolved: "Normalization status not resolved",
  dictionary_version_mismatch: "Dictionary version mismatch",
  missing_source_provenance: "Missing source provenance",
  conflicting_active_registry_label: "Conflicting active registry label",
};

export type CandidateApprovalSubject = {
  id: number;
  candidateStatus: string;
  chainCode: string | null;
  normalizedAddress: string | null;
  namespaceId: number | null;
  addressCodecId: number | null;
  payloadHex: string | null;
  prefixCode: number | null;
  suggestedEntityId: number | null;
  suggestedProtocolId: number | null;
  suggestedRoleId: number | null;
  suggestedComponentId: number | null;
  confidenceScore: number;
  qualityTier: number;
  firstSeenBlock: number | null;
  lastSeenBlock: number | null;
  metadata: JsonRecord | null;
};

export type CandidateApprovalContext = {
  evidenceCount: number;
  sourceVerificationStatus: CandidateSourceVerificationStatus | null;
  matchingTrustTiers: readonly string[];
  entity: { id: number; isActive: boolean; categoryId: number | null } | null;
  protocol: { id: number; isActive: boolean } | null;
  role: {
    roleId: number;
    roleCode: string;
    isActive: boolean;
    categoryId: number | null;
    defaultFlags: number;
    metricUsageDefault: string | null;
  } | null;
  component: { id: number; isActive: boolean } | null;
  /** Omit to skip namespace/codec cross-checks; supply to fail closed on inactive or mismatched U1 keys. */
  u1Context?: U1AddressKeyContext;
  activeDictionaryVersion: string;
  /** Registry row that would collide with this approval, when knowable. */
  conflictingRegistryLabelId?: number | null;
  /** Policy switch: when true a `pending_component` normalization status blocks approval. */
  componentRequired?: boolean;
  /** Role-policy confidence floor. Defaults to the legacy value of zero. */
  minimumConfidence?: number;
  /** False only blocks the bulk path; individual governed review remains available. */
  allowBulkApproval?: boolean;
  approvalKind?: "individual" | "bulk";
};

export type CandidateApprovalDraft = {
  entityId: number;
  protocolId: number | null;
  roleId: number;
  componentId: number | null;
  categoryId: number | null;
  confidenceScore: number;
  qualityTier: number;
  labelStatus: number;
  flags: number;
  metricEligible: boolean;
  validFromBlock: number | null;
  validToBlock: number | null;
  firstSeenBlock: number | null;
  lastSeenBlock: number | null;
  notes: string;
};

export type CandidateApprovalEvaluation = {
  candidateId: number;
  eligible: boolean;
  blockers: CandidateApprovalBlocker[];
  metricEligible: boolean;
  metricBlockers: string[];
  draft: CandidateApprovalDraft | null;
};

function metadataString(metadata: JsonRecord | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataNumber(metadata: JsonRecord | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function candidateIdentifierKind(metadata: JsonRecord | null | undefined) {
  return metadataString(metadata, "identifierKind") ?? "wallet_address";
}

function hasSourceProvenance(metadata: JsonRecord | null | undefined) {
  const evidence = metadata?.sourceEvidence;
  const record = evidence && typeof evidence === "object" && !Array.isArray(evidence) ? (evidence as JsonRecord) : null;
  const sourceUrl = metadataString(record, "sourceUrl") ?? metadataString(metadata, "sourceUrl");
  if (!sourceUrl) return false;
  return Boolean(
    metadataString(record, "sourceSheet") ??
      metadataNumber(record, "sourceRow") ??
      metadataString(record, "sourceSection") ??
      metadataString(record, "sourceDocumentHash") ??
      metadataString(metadata, "sourceSheet") ??
      metadataNumber(metadata, "sourceRow") ??
      metadataString(metadata, "sourceSection") ??
      metadata?.rawReference,
  );
}

/**
 * Map a stored research normalization status onto approval blockers.
 * `resolved` and an absent status (legacy/manual intake) both pass.
 */
function normalizationStatusBlockers(status: string | null, componentRequired: boolean): CandidateApprovalBlocker[] {
  if (!status || status === "resolved") return [];
  if (status === "duplicate") return ["duplicate_candidate"];
  if (status === "invalid" || status === "invalid_address") return ["invalid_candidate"];
  if (status === "unsupported_identifier_kind") return ["unsupported_identifier"];
  if (status === "pending_role") return ["unresolved_role_proposal"];
  if (status === "dictionary_version_mismatch") return ["dictionary_version_mismatch"];
  if (status === "source_provenance_missing") return ["missing_source_provenance"];
  if (status === "pending_component") return componentRequired ? ["required_component_unresolved"] : [];
  return ["normalization_status_unresolved"];
}

/**
 * Category precedence: approved category override, then the approved role's
 * category, then null. Free-text source labels never contribute.
 */
export function resolveApprovalCategoryId(
  metadata: JsonRecord | null | undefined,
  role: CandidateApprovalContext["role"],
) {
  const draft = metadata?.approvalDraft;
  const draftRecord = draft && typeof draft === "object" && !Array.isArray(draft) ? (draft as JsonRecord) : null;
  const override = metadataNumber(draftRecord, "categoryId") ?? metadataNumber(metadata, "suggestedCategoryId");
  return effectiveCategoryId(override !== null && override > NULL_DICTIONARY_ID ? override : null, role?.categoryId);
}

export function evaluateCandidateApproval(
  candidate: CandidateApprovalSubject,
  context: CandidateApprovalContext,
): CandidateApprovalEvaluation {
  const blockers = new Set<CandidateApprovalBlocker>();
  const metadata = candidate.metadata ?? null;
  const componentRequired = context.componentRequired === true;

  if (candidate.candidateStatus !== "pending_review") blockers.add("status_not_pending_review");
  if (!Number.isInteger(candidate.confidenceScore) || candidate.confidenceScore < 0 || candidate.confidenceScore > 100) {
    blockers.add("invalid_confidence");
  }
  if (!Number.isInteger(candidate.qualityTier) || candidate.qualityTier < 0 || candidate.qualityTier > 7) {
    blockers.add("invalid_quality_tier");
  }
  if (
    (candidate.firstSeenBlock !== null && (!Number.isSafeInteger(candidate.firstSeenBlock) || candidate.firstSeenBlock < 0)) ||
    (candidate.lastSeenBlock !== null && (!Number.isSafeInteger(candidate.lastSeenBlock) || candidate.lastSeenBlock < 0)) ||
    (candidate.firstSeenBlock !== null && candidate.lastSeenBlock !== null && candidate.lastSeenBlock < candidate.firstSeenBlock)
  ) {
    blockers.add("malformed_timeline");
  }
  if (context.evidenceCount < 1) blockers.add("missing_evidence");
  if (!isCandidateSourceVerificationSatisfied(context.sourceVerificationStatus)) blockers.add("missing_source_verification");
  if (!candidate.normalizedAddress) blockers.add("missing_normalized_address");
  if (!candidate.chainCode) blockers.add("missing_chain");

  for (const blocker of validateU1AddressKey(candidate, context.u1Context ?? {})) {
    blockers.add(blocker);
  }

  if (!candidate.suggestedEntityId) {
    blockers.add("unresolved_entity");
  } else if (!context.entity) {
    blockers.add("unresolved_entity");
  } else if (!context.entity.isActive) {
    blockers.add("inactive_entity");
  }

  if (!candidate.suggestedRoleId) {
    blockers.add("unresolved_role");
  } else if (!context.role) {
    blockers.add("unresolved_role");
  } else if (!context.role.isActive) {
    blockers.add("inactive_role");
  }
  if (candidate.confidenceScore < (context.minimumConfidence ?? 0)) blockers.add("role_minimum_confidence_not_met");
  if (context.approvalKind === "bulk" && context.allowBulkApproval === false) blockers.add("role_bulk_approval_disabled");

  if (candidate.suggestedProtocolId && context.protocol && !context.protocol.isActive) {
    blockers.add("inactive_protocol");
  }

  if (candidate.suggestedComponentId) {
    if (!context.component || !context.component.isActive) blockers.add("inactive_component");
  }

  for (const blocker of normalizationStatusBlockers(metadataString(metadata, "normalizationStatus"), componentRequired)) {
    blockers.add(blocker);
  }

  const candidateDictionaryVersion = metadataString(metadata, "dictionaryVersion");
  if (candidateDictionaryVersion && candidateDictionaryVersion !== context.activeDictionaryVersion) {
    blockers.add("dictionary_version_mismatch");
  }

  if (!hasSourceProvenance(metadata)) blockers.add("missing_source_provenance");
  if (context.conflictingRegistryLabelId) blockers.add("conflicting_active_registry_label");

  // Metric eligibility is always recalculated, never inherited from intake.
  const requestedMetricEligible = context.role ? hasFlag(context.role.defaultFlags, FLAG_BITS.metricEligible) : false;
  const metricEligibility = validateMetricEligibility({
    requested: requestedMetricEligible,
    roleCode: context.role?.roleCode ?? null,
    roleMetricUsageDefault: context.role?.metricUsageDefault ?? null,
    confidenceScore: candidate.confidenceScore,
    labelStatus: LABEL_STATUS.activeCurrent,
    identifierKind: candidateIdentifierKind(metadata),
    sourceVerificationSatisfied: isCandidateSourceVerificationSatisfied(context.sourceVerificationStatus),
    matchingTrustTiers: context.matchingTrustTiers,
  });

  const orderedBlockers = CANDIDATE_APPROVAL_BLOCKERS.filter((blocker) => blockers.has(blocker));
  const eligible = orderedBlockers.length === 0;

  return {
    candidateId: candidate.id,
    eligible,
    blockers: orderedBlockers,
    metricEligible: metricEligibility.eligible,
    metricBlockers: metricEligibility.blockers,
    draft:
      eligible && context.role && candidate.suggestedEntityId && candidate.suggestedRoleId
        ? {
            entityId: candidate.suggestedEntityId,
            protocolId: candidate.suggestedProtocolId ?? null,
            roleId: candidate.suggestedRoleId,
            componentId: candidate.suggestedComponentId ?? null,
            categoryId: resolveApprovalCategoryId(metadata, context.role),
            confidenceScore: candidate.confidenceScore,
            qualityTier: candidate.qualityTier,
            labelStatus: LABEL_STATUS.activeCurrent,
            flags: applyMetricEligibilityToFlags(context.role.defaultFlags, metricEligibility.eligible),
            metricEligible: metricEligibility.eligible,
            validFromBlock: null,
            validToBlock: null,
            firstSeenBlock: candidate.firstSeenBlock,
            lastSeenBlock: candidate.lastSeenBlock,
            notes: "",
          }
        : null,
  };
}

export function summarizeApprovalBlockers(evaluations: CandidateApprovalEvaluation[]) {
  const counts = new Map<CandidateApprovalBlocker, number>();
  for (const evaluation of evaluations) {
    for (const blocker of evaluation.blockers) {
      counts.set(blocker, (counts.get(blocker) ?? 0) + 1);
    }
  }

  return CANDIDATE_APPROVAL_BLOCKERS.filter((blocker) => counts.has(blocker)).map((blocker) => ({
    blocker,
    label: CANDIDATE_APPROVAL_BLOCKER_LABELS[blocker],
    count: counts.get(blocker) ?? 0,
  }));
}
