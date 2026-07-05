import { describe, expect, it } from "vitest";

import {
  buildCandidateReviewAuditPayload,
  buildEditedApprovalReadiness,
  buildReviewCandidateGroups,
  buildReviewReadiness,
  buildReviewGroupRollups,
  filterReviewCandidateGroups,
  filterRowsByReviewGroup,
  paginateReviewCandidateGroups,
} from "@/lib/mqchain/review";

const rows = [
  {
    candidate: {
      id: 1,
      chainCode: "btc",
      entityHint: "Binance",
      roleHint: "cex_hot_wallet",
      confidenceScore: 90,
      evidenceCount: 2,
    },
    entityName: "Binance",
    roleCode: "cex_hot_wallet",
  },
  {
    candidate: {
      id: 2,
      chainCode: "btc",
      entityHint: "Binance",
      roleHint: "cex_hot_wallet",
      confidenceScore: 70,
      evidenceCount: 1,
    },
    entityName: "Binance",
    roleCode: "cex_hot_wallet",
  },
  {
    candidate: {
      id: 3,
      chainCode: "ethereum",
      entityHint: null,
      roleHint: "protocol_factory",
      confidenceScore: 80,
      evidenceCount: 3,
    },
    entityName: null,
    roleCode: "protocol_factory",
  },
];

describe("review grouping", () => {
  it("reports approval readiness blockers before quick approval", () => {
    expect(
      buildReviewReadiness({
        chainCode: "btc",
        normalizedAddress: "bc1qexample",
        suggestedEntityId: 1,
        suggestedRoleId: 1001,
        evidenceCount: 1,
        sourceVerificationStatus: "source_job_verified",
      }),
    ).toEqual({ canQuickApprove: true, blockers: [] });

    expect(
      buildReviewReadiness({
        chainCode: null,
        normalizedAddress: "",
        suggestedEntityId: null,
        suggestedRoleId: null,
        evidenceCount: 0,
        sourceVerificationStatus: "source_verification_missing",
      }),
    ).toEqual({
      canQuickApprove: false,
      blockers: [
        "missing_chain",
        "missing_normalized_address",
        "missing_entity",
        "missing_role",
        "missing_evidence",
        "missing_source_verification",
      ],
    });
  });

  it("treats absent source verification context as not ready for approval", () => {
    expect(
      buildReviewReadiness({
        chainCode: "btc",
        normalizedAddress: "bc1qexample",
        suggestedEntityId: 1,
        suggestedRoleId: 1001,
        evidenceCount: 1,
      }),
    ).toEqual({
      canQuickApprove: false,
      blockers: ["missing_source_verification"],
    });
  });

  it("separates hard approval blockers from fields that can be fixed in the edit form", () => {
    expect(buildEditedApprovalReadiness(["missing_entity", "missing_role"])).toEqual({
      canApproveWithEdits: true,
      hardBlockers: [],
      editableBlockers: ["missing_entity", "missing_role"],
    });

    expect(buildEditedApprovalReadiness(["missing_entity", "missing_evidence", "missing_source_verification"])).toEqual({
      canApproveWithEdits: false,
      hardBlockers: ["missing_evidence", "missing_source_verification"],
      editableBlockers: ["missing_entity"],
    });
  });

  it("groups candidates by entity, chain, and role", () => {
    expect(buildReviewCandidateGroups(rows)).toEqual([
      {
        key: "Binance / btc / cex_hot_wallet",
        slug: "binance__btc__cex-hot-wallet",
        entity: "Binance",
        chain: "btc",
        role: "cex_hot_wallet",
        count: 2,
        candidateIds: [1, 2],
        averageConfidence: 80,
        evidenceCount: 3,
      },
      {
        key: "unknown / ethereum / protocol_factory",
        slug: "unknown__ethereum__protocol-factory",
        entity: "unknown",
        chain: "ethereum",
        role: "protocol_factory",
        count: 1,
        candidateIds: [3],
        averageConfidence: 80,
        evidenceCount: 3,
      },
    ]);
  });

  it("filters rows by stable group slug", () => {
    expect(filterRowsByReviewGroup(rows, "binance__btc__cex-hot-wallet").map((row) => row.candidate.id)).toEqual([1, 2]);
  });

  it("filters and sorts review groups for the operator list", () => {
    const groups = buildReviewCandidateGroups(rows);
    const filtered = filterReviewCandidateGroups(groups, {
      q: "binance",
      role: "hot",
      minCount: 2,
      minEvidence: 3,
      sort: "confidence",
      page: 1,
      pageSize: 50,
    });

    expect(filtered.map((group) => group.slug)).toEqual(["binance__btc__cex-hot-wallet"]);
  });

  it("paginates review groups without changing group contents", () => {
    const groups = buildReviewCandidateGroups(rows);
    const result = paginateReviewCandidateGroups(groups, {
      sort: "count",
      page: 2,
      pageSize: 1,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(2);
    expect(result.totalPages).toBe(2);
    expect(result.rows[0]?.slug).toBe("unknown__ethereum__protocol-factory");
  });

  it("summarizes group status, source, evidence, and trust composition", () => {
    expect(
      buildReviewGroupRollups([
        {
          ...rows[0],
          candidate: { ...rows[0].candidate, candidateStatus: "pending_review" },
          sourceType: "official_url",
          latestEvidence: { evidenceType: "official_page", trustTier: "official" },
        },
        {
          ...rows[1],
          candidate: { ...rows[1].candidate, candidateStatus: "approved" },
          sourceType: "official_url",
          latestEvidence: { evidenceType: "official_page", trustTier: "official" },
        },
        {
          ...rows[2],
          candidate: { ...rows[2].candidate, candidateStatus: "pending_review" },
          sourceType: "github",
          latestEvidence: { evidenceType: "github_deployment", trustTier: "official" },
        },
      ]),
    ).toEqual({
      statuses: [
        { label: "pending_review", count: 2 },
        { label: "approved", count: 1 },
      ],
      sources: [
        { label: "official_url", count: 2 },
        { label: "github", count: 1 },
      ],
      evidenceTypes: [
        { label: "official_page", count: 2 },
        { label: "github_deployment", count: 1 },
      ],
      trustTiers: [{ label: "official", count: 3 }],
    });
  });

  it("builds candidate review audit payloads for approval decisions", () => {
    expect(
      buildCandidateReviewAuditPayload({
        candidateId: 7,
        action: "candidate_approved",
        beforeStatus: "pending_review",
        afterStatus: "approved",
        reason: "official evidence checked",
        approvalDraft: {
          entityId: 1,
          roleId: 1001,
          confidenceScore: 91,
        },
      }),
    ).toEqual({
      candidateId: 7,
      action: "candidate_approved",
      beforeStatus: "pending_review",
      afterStatus: "approved",
      reason: "official evidence checked",
      approvalDraft: {
        entityId: 1,
        roleId: 1001,
        confidenceScore: 91,
      },
    });
  });
});
