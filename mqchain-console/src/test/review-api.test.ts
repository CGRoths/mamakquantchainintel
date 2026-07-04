import { describe, expect, it } from "vitest";

import {
  buildReviewGroupDetailApiResponse,
  buildReviewGroupListApiResponse,
  buildReviewWorkspaceApiResponse,
  REVIEW_GROUP_DETAIL_API_CONTRACT,
  REVIEW_GROUP_LIST_API_CONTRACT,
  REVIEW_WORKSPACE_API_CONTRACT,
} from "@/lib/mqchain/review-api";
import type { CandidateSourceVerificationContext } from "@/lib/mqchain/candidate-detail";
import type { CandidateExportRowInput } from "@/lib/mqchain/candidate-api";

const createdAt = new Date("2026-07-04T02:00:00.000Z");
const updatedAt = new Date("2026-07-04T03:00:00.000Z");

const verifiedSourceContext: CandidateSourceVerificationContext = {
  sheetNames: [],
  sourceUrls: [],
  sheetVerificationRequired: false,
  hasVerifiedSourceJob: true,
  hasVerifiedSourceDocument: false,
  hasVerifiedSourceSheet: false,
  hasVerifiedCandidate: false,
  hasVerifiedSourceUrl: false,
  matchingVerifiedCount: 1,
  status: "source_job_verified",
  message: "Source-job verification covers this candidate.",
};

const missingSheetContext: CandidateSourceVerificationContext = {
  sheetNames: ["Cold Wallets"],
  sourceUrls: [],
  sheetVerificationRequired: true,
  hasVerifiedSourceJob: true,
  hasVerifiedSourceDocument: false,
  hasVerifiedSourceSheet: false,
  hasVerifiedCandidate: false,
  hasVerifiedSourceUrl: false,
  matchingVerifiedCount: 1,
  status: "source_sheet_verification_missing",
  message: "This candidate carries sheet-level provenance; source_job verification alone does not satisfy that scope.",
};

function candidateRow(
  overrides: Partial<CandidateExportRowInput["candidate"]> = {},
  sourceVerificationContext = verifiedSourceContext,
) {
  return {
    candidate: {
      id: 30,
      sourceJobId: 12,
      sourceDocumentId: 13,
      rawAddress: "bc1qreview",
      normalizedAddress: "bc1qreview",
      chainCode: "btc",
      addressFamily: "bech32",
      prefixCode: 0x0103,
      payloadHex: "abcd",
      entityHint: "Binance",
      protocolHint: null,
      roleHint: "cex_cold_wallet",
      suggestedEntityId: 7,
      suggestedProtocolId: null,
      suggestedRoleId: 1002,
      confidenceScore: 95,
      qualityTier: 3,
      candidateStatus: "pending_review",
      duplicateOfCandidateId: null,
      discoveredBy: "csv",
      discoveryJobId: null,
      evidenceCount: 1,
      firstSeenBlock: 800000,
      lastSeenBlock: null,
      metadata: { rawReference: "row 7", sheetName: "Cold Wallets" },
      createdAt,
      updatedAt,
      ...overrides,
    },
    entityName: "Binance",
    protocolName: null,
    roleCode: "cex_cold_wallet",
    sourceType: "official_url",
    latestEvidence: {
      id: 40,
      evidenceType: "official_page",
      sourceUrl: "https://example.com/proof",
      evidenceHash: "hash-evidence",
      trustTier: "official",
      summary: "official reserves page",
      createdAt,
    },
    sourceVerificationContext,
  };
}

describe("review API payloads", () => {
  it("exports the review workspace without approving candidates or hiding readiness blockers", () => {
    const readyRow = candidateRow();
    const blockedRow = candidateRow(
      {
        id: 31,
        normalizedAddress: "bc1qblocked",
        suggestedEntityId: null,
        suggestedRoleId: null,
        evidenceCount: 0,
      },
      missingSheetContext,
    );
    const payload = buildReviewWorkspaceApiResponse({
      query: {
        page: 1,
        approvedPage: 1,
        pageSize: 25,
        filters: { chain: "btc", sort: "confidence" },
      },
      counts: {
        pending: 2,
        needsMoreEvidence: 1,
        conflicts: 0,
        approvedReady: 1,
      },
      pending: {
        total: 2,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      },
      pendingRows: [readyRow, blockedRow],
      approved: {
        total: 1,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      },
      approvedRows: [candidateRow({ id: 32, candidateStatus: "approved" })],
      groups: [
        {
          key: "Binance / btc / cex_cold_wallet",
          slug: "binance__btc__cex-cold-wallet",
          entity: "Binance",
          chain: "btc",
          role: "cex_cold_wallet",
          count: 2,
          candidateIds: [30, 31],
          averageConfidence: 90,
          evidenceCount: 1,
        },
      ],
    });

    expect(payload).toMatchObject({
      ...REVIEW_WORKSPACE_API_CONTRACT,
      mutationAllowed: false,
      candidateWriteAllowed: false,
      approvalWriteAllowed: false,
      registryWriteAllowed: false,
      kvWriteAllowed: false,
      counts: {
        pending: 2,
        approvedReady: 1,
      },
      pending: {
        total: 2,
        returnedRows: 2,
        rows: [
          {
            candidateId: 30,
            candidateStatus: "pending_review",
            reviewReadiness: {
              canQuickApprove: true,
              canApproveWithEdits: true,
              blockers: [],
            },
            latestEvidence: {
              evidenceType: "official_page",
              evidenceHash: "hash-evidence",
              summary: "official reserves page",
            },
          },
          {
            candidateId: 31,
            sourceVerification: {
              status: "source_sheet_verification_missing",
              sheetVerificationRequired: true,
              sheetNames: ["Cold Wallets"],
            },
            reviewReadiness: {
              canQuickApprove: false,
              canApproveWithEdits: false,
              blockers: expect.arrayContaining([
                { code: "missing_entity", label: "Missing entity", hard: false },
                { code: "missing_role", label: "Missing role", hard: false },
                { code: "missing_evidence", label: "Missing attached evidence", hard: true },
                { code: "missing_source_verification", label: "Missing source verification", hard: true },
              ]),
            },
          },
        ],
      },
      approvedForBatch: {
        total: 1,
        returnedRows: 1,
        rows: [{ candidateId: 32, candidateStatus: "approved" }],
      },
      groups: [
        {
          slug: "binance__btc__cex-cold-wallet",
          candidateIds: [30, 31],
          hrefs: {
            detailApi: "/api/mqchain/review/groups/binance__btc__cex-cold-wallet",
          },
        },
      ],
      policy: {
        reviewApiIsReadOnly: true,
        approvalStillRequiresServerAction: true,
        sourceVerificationRequiredBeforeApproval: true,
        sourceSheetVerificationNotSatisfiedBySourceJobOnly: true,
        batchCommitRequiredBeforeRegistry: true,
        registryRowsNeverWrittenFromReviewExports: true,
      },
    });
  });

  it("exports review group list and detail payloads as staging-only queues", () => {
    const group = {
      key: "Binance / btc / cex_cold_wallet",
      slug: "binance__btc__cex-cold-wallet",
      entity: "Binance",
      chain: "btc",
      role: "cex_cold_wallet",
      count: 2,
      candidateIds: [30, 31],
      averageConfidence: 90,
      evidenceCount: 2,
    };
    const listPayload = buildReviewGroupListApiResponse({
      query: {
        page: 1,
        pageSize: 25,
        filters: { minCount: 2 },
      },
      totalPendingCandidates: 2,
      totalGroupsBeforeFilters: 1,
      total: 1,
      totalPages: 1,
      rows: [group],
    });
    const detailPayload = buildReviewGroupDetailApiResponse({
      slug: group.slug,
      group,
      rows: [candidateRow()],
      approvedRows: [candidateRow({ id: 32, candidateStatus: "approved" })],
      rollups: {
        statuses: [
          { label: "pending_review", count: 1 },
          { label: "approved", count: 1 },
        ],
        sources: [{ label: "official_url", count: 2 }],
        evidenceTypes: [{ label: "official_page", count: 2 }],
        trustTiers: [{ label: "official", count: 2 }],
      },
    });

    expect(listPayload).toMatchObject({
      ...REVIEW_GROUP_LIST_API_CONTRACT,
      mutationAllowed: false,
      pagination: { totalRows: 1, returnedRows: 1 },
      totals: {
        pendingCandidates: 2,
        groupsBeforeFilters: 1,
        groupsAfterFilters: 1,
      },
      rows: [{ slug: group.slug, count: 2 }],
      policy: {
        registryRowsNeverWrittenFromReviewExports: true,
      },
    });
    expect(detailPayload).toMatchObject({
      ...REVIEW_GROUP_DETAIL_API_CONTRACT,
      slug: group.slug,
      group: { slug: group.slug, candidateIds: [30, 31] },
      rollups: {
        statuses: [
          { label: "pending_review", count: 1 },
          { label: "approved", count: 1 },
        ],
      },
      pending: {
        totalRows: 1,
        rows: [{ candidateId: 30 }],
      },
      approvedForBatch: {
        totalRows: 1,
        rows: [{ candidateId: 32, candidateStatus: "approved" }],
      },
      policy: {
        reviewApiIsReadOnly: true,
        batchCommitRequiredBeforeRegistry: true,
      },
    });
  });
});
