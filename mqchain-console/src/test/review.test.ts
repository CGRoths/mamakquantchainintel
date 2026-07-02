import { describe, expect, it } from "vitest";

import { buildReviewCandidateGroups, buildReviewGroupRollups, filterRowsByReviewGroup } from "@/lib/mqchain/review";

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
});
