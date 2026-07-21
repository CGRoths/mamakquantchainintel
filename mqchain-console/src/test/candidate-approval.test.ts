import { describe, expect, it } from "vitest";

import {
  evaluateCandidateApproval,
  resolveApprovalCategoryId,
  summarizeApprovalBlockers,
  type CandidateApprovalContext,
  type CandidateApprovalSubject,
} from "@/lib/mqchain/candidate-approval";
import { LABEL_STATUS } from "@/lib/mqchain/constants";
import { FLAG_BITS, hasFlag } from "@/lib/mqchain/flags";

const DICTIONARY_VERSION = "dict-active";

function candidate(overrides: Partial<CandidateApprovalSubject> = {}): CandidateApprovalSubject {
  return {
    id: 1,
    candidateStatus: "pending_review",
    chainCode: "ethereum",
    normalizedAddress: "0x" + "aa".repeat(20),
    namespaceId: 1,
    addressCodecId: 1,
    payloadHex: "aa".repeat(20),
    prefixCode: 10,
    suggestedEntityId: 1,
    suggestedProtocolId: null,
    suggestedRoleId: 1002,
    suggestedComponentId: null,
    confidenceScore: 95,
    qualityTier: 1,
    firstSeenBlock: null,
    lastSeenBlock: null,
    metadata: {
      normalizationStatus: "resolved",
      dictionaryVersion: DICTIONARY_VERSION,
      identifierKind: "wallet_address",
      sourceEvidence: { sourceUrl: "https://kraken.com/por", sourceSheet: "ETH" },
    },
    ...overrides,
  };
}

function context(overrides: Partial<CandidateApprovalContext> = {}): CandidateApprovalContext {
  return {
    evidenceCount: 1,
    sourceVerificationStatus: "source_job_verified",
    matchingTrustTiers: ["official"],
    entity: { id: 1, isActive: true, categoryId: 100 },
    protocol: null,
    role: {
      roleId: 1002,
      roleCode: "cex_reserve_wallet",
      isActive: true,
      categoryId: 100,
      // metricEligible + activeLabel
      defaultFlags: (1 << FLAG_BITS.metricEligible) | (1 << FLAG_BITS.activeLabel),
      metricUsageDefault: "cex_flow",
    },
    component: null,
    u1Context: {
      namespace: { id: 1, addressCodecId: 1, isActive: true },
      codec: { id: 1, payloadRule: "exact:20", status: "production_ready" },
    },
    activeDictionaryVersion: DICTIONARY_VERSION,
    conflictingRegistryLabelId: null,
    ...overrides,
  };
}

describe("candidate approval eligibility", () => {
  it("approves a fully resolved, verified candidate and freezes the draft", () => {
    const evaluation = evaluateCandidateApproval(candidate(), context());

    expect(evaluation.blockers).toEqual([]);
    expect(evaluation.eligible).toBe(true);
    expect(evaluation.draft).toMatchObject({
      entityId: 1,
      protocolId: null,
      roleId: 1002,
      componentId: null,
      categoryId: 100,
      confidenceScore: 95,
      qualityTier: 1,
      labelStatus: LABEL_STATUS.activeCurrent,
      metricEligible: true,
    });
    expect(hasFlag(evaluation.draft!.flags, FLAG_BITS.metricEligible)).toBe(true);
  });

  it("blocks a candidate that is not pending review", () => {
    expect(evaluateCandidateApproval(candidate({ candidateStatus: "approved" }), context()).blockers).toContain(
      "status_not_pending_review",
    );
  });

  it("blocks missing evidence and missing source verification", () => {
    expect(evaluateCandidateApproval(candidate(), context({ evidenceCount: 0 })).blockers).toContain("missing_evidence");
    expect(
      evaluateCandidateApproval(candidate(), context({ sourceVerificationStatus: "source_verification_missing" })).blockers,
    ).toContain("missing_source_verification");
  });

  it("blocks unresolved and inactive dictionary references", () => {
    expect(evaluateCandidateApproval(candidate({ suggestedEntityId: null }), context({ entity: null })).blockers).toContain(
      "unresolved_entity",
    );
    expect(
      evaluateCandidateApproval(candidate(), context({ entity: { id: 1, isActive: false, categoryId: 100 } })).blockers,
    ).toContain("inactive_entity");
    expect(evaluateCandidateApproval(candidate({ suggestedRoleId: null }), context({ role: null })).blockers).toContain(
      "unresolved_role",
    );
    expect(
      evaluateCandidateApproval(candidate(), context({ role: { ...context().role!, isActive: false } })).blockers,
    ).toContain("inactive_role");
  });

  it("blocks an inactive component when one is assigned", () => {
    expect(
      evaluateCandidateApproval(
        candidate({ suggestedComponentId: 5 }),
        context({ component: { id: 5, isActive: false } }),
      ).blockers,
    ).toContain("inactive_component");

    expect(
      evaluateCandidateApproval(
        candidate({ suggestedComponentId: 5 }),
        context({ component: { id: 5, isActive: true } }),
      ).draft?.componentId,
    ).toBe(5);
  });

  it("blocks every missing component of the U1 address key", () => {
    const blockers = evaluateCandidateApproval(
      candidate({ namespaceId: null, addressCodecId: null, payloadHex: null }),
      context({ u1Context: {} }),
    ).blockers;

    expect(blockers).toContain("missing_namespace_id");
    expect(blockers).toContain("missing_address_codec_id");
    expect(blockers).toContain("missing_payload_hex");
  });

  it("maps research normalization statuses onto explicit blockers", () => {
    const withStatus = (normalizationStatus: string) =>
      evaluateCandidateApproval(
        candidate({ metadata: { ...candidate().metadata, normalizationStatus } }),
        context(),
      ).blockers;

    expect(withStatus("duplicate")).toContain("duplicate_candidate");
    expect(withStatus("invalid_address")).toContain("invalid_candidate");
    expect(withStatus("unsupported_identifier_kind")).toContain("unsupported_identifier");
    expect(withStatus("pending_role")).toContain("unresolved_role_proposal");
    expect(withStatus("pending_entity")).toContain("normalization_status_unresolved");
  });

  it("blocks pending_component only when policy marks the component required", () => {
    const pendingComponent = candidate({ metadata: { ...candidate().metadata, normalizationStatus: "pending_component" } });

    expect(evaluateCandidateApproval(pendingComponent, context()).blockers).not.toContain("required_component_unresolved");
    expect(evaluateCandidateApproval(pendingComponent, context({ componentRequired: true })).blockers).toContain(
      "required_component_unresolved",
    );
  });

  it("blocks a candidate whose recorded dictionary version drifted from the active one", () => {
    expect(
      evaluateCandidateApproval(
        candidate({ metadata: { ...candidate().metadata, dictionaryVersion: "dict-stale" } }),
        context(),
      ).blockers,
    ).toContain("dictionary_version_mismatch");
  });

  it("blocks a candidate with no source provenance", () => {
    expect(
      evaluateCandidateApproval(candidate({ metadata: { normalizationStatus: "resolved" } }), context()).blockers,
    ).toContain("missing_source_provenance");
  });

  it("blocks when a conflicting active registry label already exists", () => {
    expect(evaluateCandidateApproval(candidate(), context({ conflictingRegistryLabelId: 42 })).blockers).toContain(
      "conflicting_active_registry_label",
    );
  });

  it("recalculates metric eligibility rather than trusting intake", () => {
    // Weak source trust must strip metric eligibility even though the role defaults to it.
    const evaluation = evaluateCandidateApproval(candidate(), context({ matchingTrustTiers: ["weak"] }));

    expect(evaluation.eligible).toBe(true);
    expect(evaluation.metricEligible).toBe(false);
    expect(evaluation.metricBlockers).toContain("source_trust_too_weak");
    expect(hasFlag(evaluation.draft!.flags, FLAG_BITS.metricEligible)).toBe(false);

    // Low confidence is an independent reason to drop metric eligibility.
    const lowConfidence = evaluateCandidateApproval(candidate({ confidenceScore: 40 }), context());
    expect(lowConfidence.metricEligible).toBe(false);
    expect(lowConfidence.metricBlockers).toContain("confidence_below_metric_threshold");
  });

  it("returns blockers in a stable, deterministic order", () => {
    const first = evaluateCandidateApproval(
      candidate({ candidateStatus: "duplicate", suggestedEntityId: null }),
      context({ evidenceCount: 0, entity: null }),
    ).blockers;
    const second = evaluateCandidateApproval(
      candidate({ candidateStatus: "duplicate", suggestedEntityId: null }),
      context({ evidenceCount: 0, entity: null }),
    ).blockers;

    expect(first).toEqual(second);
    expect(first.indexOf("status_not_pending_review")).toBeLessThan(first.indexOf("missing_evidence"));
  });
});

describe("approval category precedence", () => {
  const role = { roleId: 1002, roleCode: "r", isActive: true, categoryId: 100, defaultFlags: 0, metricUsageDefault: null };

  it("prefers an approved category override over the role category", () => {
    expect(resolveApprovalCategoryId({ approvalDraft: { categoryId: 200 } }, role)).toBe(200);
    expect(resolveApprovalCategoryId({ suggestedCategoryId: 300 }, role)).toBe(300);
  });

  it("falls back to the approved role category, then null", () => {
    expect(resolveApprovalCategoryId({}, role)).toBe(100);
    expect(resolveApprovalCategoryId({}, { ...role, categoryId: null })).toBeNull();
    expect(resolveApprovalCategoryId(null, null)).toBeNull();
  });

  it("never treats a zero category as an assignment", () => {
    expect(resolveApprovalCategoryId({ suggestedCategoryId: 0 }, role)).toBe(100);
  });
});

describe("blocker summary", () => {
  it("groups blockers with counts in contract order", () => {
    const summary = summarizeApprovalBlockers([
      { candidateId: 1, eligible: false, blockers: ["missing_evidence"], metricEligible: false, metricBlockers: [], draft: null },
      { candidateId: 2, eligible: false, blockers: ["missing_evidence", "unresolved_role"], metricEligible: false, metricBlockers: [], draft: null },
      { candidateId: 3, eligible: true, blockers: [], metricEligible: true, metricBlockers: [], draft: null },
    ]);

    expect(summary).toEqual([
      { blocker: "missing_evidence", label: "Missing attached evidence", count: 2 },
      { blocker: "unresolved_role", label: "Unresolved role", count: 1 },
    ]);
  });
});
