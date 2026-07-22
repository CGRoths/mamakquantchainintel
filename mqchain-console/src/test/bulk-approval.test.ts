import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  mqWorkflowAddressCandidates,
  mqDictAddressCodecs,
  mqWorkflowAddressEvidence,
  mqDictAddressNamespaces,
  mqRegistryAddressLabels,
  mqDictEntities,
  mqDictRoles,
  mqDictProtocolComponents,
  mqDictProtocols,
  mqWorkflowSourceVerifications,
} from "@/db/schema";
import { FLAG_BITS } from "@/lib/mqchain/flags";
import { buildCandidateApprovalEvaluations } from "@/lib/mqchain/services/candidate-approval-evaluation";
import {
  BULK_APPROVAL_MAX_CANDIDATES,
  bulkApprovalExecuteSchema,
  bulkApprovalPreviewSchema,
} from "@/lib/mqchain/validators/bulk-approval";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const DICTIONARY_VERSION = "dict-active";

type TableRows = Map<unknown, Record<string, unknown>[]>;

/**
 * Minimal stand-in for the Drizzle query builder. It records how many queries
 * ran so the N+1 assertion is meaningful, and resolves each table to fixture
 * rows. Filters are intentionally not evaluated; fixtures are already scoped.
 */
function fakeReader(tables: TableRows) {
  let queryCount = 0;

  const reader = {
    select(fields?: Record<string, unknown>) {
      let table: unknown = null;
      const builder = {
        from(value: unknown) {
          table = value;
          return builder;
        },
        where: () => builder,
        groupBy: () => builder,
        orderBy: () => builder,
        for: () => builder,
        then<TResult1, TResult2>(
          onFulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
          onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          queryCount += 1;
          const rows = tables.get(table) ?? [];
          // The only projected query in the evaluator is the evidence count roll-up.
          const result =
            table === mqWorkflowAddressEvidence && fields
              ? Object.entries(
                  rows.reduce<Record<string, number>>((counts, row) => {
                    const key = String(row.candidateId);
                    counts[key] = (counts[key] ?? 0) + 1;
                    return counts;
                  }, {}),
                ).map(([candidateId, value]) => ({ candidateId: Number(candidateId), value }))
              : rows;
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };

  return { reader: reader as never, queryCount: () => queryCount };
}

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    sourceJobId: 500,
    sourceDocumentId: 600,
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
    updatedAt: new Date("2026-07-04T00:00:00.000Z"),
    metadata: {
      normalizationStatus: "resolved",
      dictionaryVersion: DICTIONARY_VERSION,
      identifierKind: "wallet_address",
      sourceEvidence: { sourceUrl: "https://kraken.com/por", sourceSheet: "ETH" },
    },
    ...overrides,
  };
}

function fixtureTables(candidates: Record<string, unknown>[], overrides: Partial<Record<string, unknown[]>> = {}) {
  const tables: TableRows = new Map();
  tables.set(mqWorkflowAddressCandidates, candidates);
  tables.set(
    mqWorkflowAddressEvidence,
    (overrides.evidence as Record<string, unknown>[]) ??
      candidates.map((candidate) => ({ candidateId: candidate.id })),
  );
  tables.set(
    mqWorkflowSourceVerifications,
    // Candidates carry sheet-level provenance, so only a sheet-scoped
    // verification satisfies them; a source_job verification alone does not.
    (overrides.verifications as Record<string, unknown>[]) ?? [
      {
        id: 1,
        sourceJobId: 500,
        sourceDocumentId: null,
        candidateId: null,
        verificationScope: "source_sheet",
        sourceSheet: "ETH",
        sourceUrl: null,
        sourceTrust: "official",
        status: "verified",
        createdAt: new Date("2026-07-03T00:00:00.000Z"),
      },
    ],
  );
  tables.set(mqDictEntities, (overrides.entities as Record<string, unknown>[]) ?? [{ id: 1, isActive: true, categoryId: 100 }]);
  tables.set(mqDictProtocols, (overrides.protocols as Record<string, unknown>[]) ?? []);
  tables.set(
    mqDictRoles,
    (overrides.roles as Record<string, unknown>[]) ?? [
      {
        roleId: 1002,
        roleCode: "cex_reserve_wallet",
        isActive: true,
        categoryId: 100,
        defaultFlags: (1 << FLAG_BITS.metricEligible) | (1 << FLAG_BITS.activeLabel),
        metricUsageDefault: "cex_flow",
      },
    ],
  );
  tables.set(mqDictProtocolComponents, (overrides.components as Record<string, unknown>[]) ?? []);
  tables.set(
    mqDictAddressNamespaces,
    (overrides.namespaces as Record<string, unknown>[]) ?? [{ id: 1, addressCodecId: 1, isActive: true }],
  );
  tables.set(
    mqDictAddressCodecs,
    (overrides.codecs as Record<string, unknown>[]) ?? [{ id: 1, payloadRule: "exact:20", status: "production_ready" }],
  );
  tables.set(mqRegistryAddressLabels, (overrides.registry as Record<string, unknown>[]) ?? []);
  return tables;
}

async function evaluate(candidates: Record<string, unknown>[], overrides: Partial<Record<string, unknown[]>> = {}) {
  const { reader, queryCount } = fakeReader(fixtureTables(candidates, overrides));
  const bundle = await buildCandidateApprovalEvaluations({
    reader,
    candidateIds: candidates.map((candidate) => candidate.id as number).sort((left, right) => left - right),
    dictionaryVersion: DICTIONARY_VERSION,
    lockRows: false,
    mode: "eligible_only",
  });
  return { bundle, queryCount };
}

describe("bulk approval request validation", () => {
  it("sorts and deduplicates the selected candidate IDs", () => {
    expect(bulkApprovalPreviewSchema.parse({ candidateIds: [3, 1, 2, 1, 3] }).candidateIds).toEqual([1, 2, 3]);
  });

  it("defaults to eligible_only and accepts strict", () => {
    expect(bulkApprovalPreviewSchema.parse({ candidateIds: [1] }).mode).toBe("eligible_only");
    expect(bulkApprovalPreviewSchema.parse({ candidateIds: [1], mode: "strict" }).mode).toBe("strict");
    expect(() => bulkApprovalPreviewSchema.parse({ candidateIds: [1], mode: "approve_everything" })).toThrow();
  });

  it("enforces the 10,000-candidate ceiling", () => {
    expect(BULK_APPROVAL_MAX_CANDIDATES).toBe(10_000);
    const atLimit = Array.from({ length: BULK_APPROVAL_MAX_CANDIDATES }, (_, index) => index + 1);
    expect(bulkApprovalPreviewSchema.parse({ candidateIds: atLimit }).candidateIds).toHaveLength(
      BULK_APPROVAL_MAX_CANDIDATES,
    );
    expect(() => bulkApprovalPreviewSchema.parse({ candidateIds: [...atLimit, 10_001] })).toThrow();
    expect(() => bulkApprovalPreviewSchema.parse({ candidateIds: [] })).toThrow();
  });

  it("requires the race-protection fields and a reason on execution", () => {
    expect(() => bulkApprovalExecuteSchema.parse({ candidateIds: [1], reason: "ok", expectedPreviewHash: "h" })).toThrow();
    expect(() => bulkApprovalExecuteSchema.parse({ candidateIds: [1], reason: "ok", expectedDictionaryVersion: "d" })).toThrow();
    expect(() =>
      bulkApprovalExecuteSchema.parse({ candidateIds: [1], expectedDictionaryVersion: "d", expectedPreviewHash: "h" }),
    ).toThrow();
    expect(
      bulkApprovalExecuteSchema.parse({
        candidateIds: [2, 1],
        expectedDictionaryVersion: "d",
        expectedPreviewHash: "h",
        expectedCandidateSnapshotHash: "c".repeat(64),
        expectedSourceVerificationSnapshotHash: "v".repeat(64),
        reason: "Approved official Kraken PoR source",
      }),
    ).toMatchObject({ candidateIds: [1, 2], mode: "eligible_only" });
  });
});

describe("bulk approval evaluation", () => {
  it("detects eligible candidates and returns a deterministic preview hash", async () => {
    const first = await evaluate([candidateRow()]);
    const second = await evaluate([candidateRow()]);

    expect(first.bundle.evaluations[0].eligible).toBe(true);
    expect(first.bundle.previewHash).toBe(second.bundle.previewHash);
    expect(first.bundle.previewHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.bundle.sourceJobIds).toEqual([500]);
  });

  it("changes the preview hash when candidate state changes", async () => {
    const base = await evaluate([candidateRow()]);

    const restaged = await evaluate([candidateRow({ updatedAt: new Date("2026-07-05T00:00:00.000Z") })]);
    expect(restaged.bundle.previewHash).not.toBe(base.bundle.previewHash);

    const reresolved = await evaluate([candidateRow({ suggestedRoleId: 1003 })]);
    expect(reresolved.bundle.previewHash).not.toBe(base.bundle.previewHash);

    const evidenceRemoved = await evaluate([candidateRow()], { evidence: [] });
    expect(evidenceRemoved.bundle.previewHash).not.toBe(base.bundle.previewHash);
  });

  it("reports a missing candidate rather than silently dropping it", async () => {
    const { reader } = fakeReader(fixtureTables([candidateRow()]));
    const bundle = await buildCandidateApprovalEvaluations({
      reader,
      candidateIds: [1, 999],
      dictionaryVersion: DICTIONARY_VERSION,
      lockRows: false,
    });

    expect(bundle.evaluations.map((row) => row.candidateId)).toEqual([1, 999]);
    expect(bundle.evaluations[1].blockers).toEqual(["candidate_not_found"]);
  });

  it("blocks missing evidence, missing verification, duplicates and unresolved roles", async () => {
    const noEvidence = await evaluate([candidateRow()], { evidence: [] });
    expect(noEvidence.bundle.evaluations[0].blockers).toContain("missing_evidence");

    const noVerification = await evaluate([candidateRow()], { verifications: [] });
    expect(noVerification.bundle.evaluations[0].blockers).toContain("missing_source_verification");

    const duplicate = await evaluate([
      candidateRow({ metadata: { ...candidateRow().metadata, normalizationStatus: "duplicate" } }),
    ]);
    expect(duplicate.bundle.evaluations[0].blockers).toContain("duplicate_candidate");

    const unresolvedRole = await evaluate([candidateRow({ suggestedRoleId: null })], { roles: [] });
    expect(unresolvedRole.bundle.evaluations[0].blockers).toContain("unresolved_role");
  });

  it("blocks a candidate whose U1 key fields are missing", async () => {
    const { bundle } = await evaluate([candidateRow({ namespaceId: null, addressCodecId: null, payloadHex: null })]);

    expect(bundle.evaluations[0].blockers).toContain("missing_namespace_id");
    expect(bundle.evaluations[0].blockers).toContain("missing_address_codec_id");
    expect(bundle.evaluations[0].blockers).toContain("missing_payload_hex");
  });

  it("blocks a candidate that would collide with an active registry label", async () => {
    const { bundle } = await evaluate([candidateRow()], {
      registry: [
        {
          id: 77,
          chainCode: "ethereum",
          normalizedAddress: "0x" + "aa".repeat(20),
          roleId: 1002,
          validFromBlock: null,
          isActive: true,
        },
      ],
    });

    expect(bundle.evaluations[0].blockers).toContain("conflicting_active_registry_label");
  });

  it("splits a mixed selection into eligible and blocked without reordering", async () => {
    const { bundle } = await evaluate([
      candidateRow({ id: 1 }),
      candidateRow({ id: 2, suggestedEntityId: null }),
      candidateRow({ id: 3 }),
    ]);

    expect(bundle.evaluations.map((row) => row.candidateId)).toEqual([1, 2, 3]);
    expect(bundle.evaluations.filter((row) => row.eligible).map((row) => row.candidateId)).toEqual([1, 3]);
    expect(bundle.evaluations[1].blockers).toContain("unresolved_entity");
  });

  it("evaluates 1,000 candidates with a bounded number of queries", async () => {
    const candidates = Array.from({ length: 1000 }, (_, index) =>
      candidateRow({ id: index + 1, normalizedAddress: `0x${String(index).padStart(40, "0")}` }),
    );
    const { bundle, queryCount } = await evaluate(candidates);

    expect(bundle.evaluations).toHaveLength(1000);
    expect(bundle.evaluations.every((row) => row.eligible)).toBe(true);
    // One candidate query plus a fixed set of context queries — never per candidate.
    expect(queryCount()).toBeLessThanOrEqual(12);
  });
});

describe("bulk approval lifecycle boundaries", () => {
  const service = read("src/lib/mqchain/services/bulk-approval-service.ts");
  const sourcePage = read("src/app/mqchain/source-jobs/[id]/page.tsx");
  const workflow = read("src/components/mqchain/source-job-approval-workflow.tsx");

  it("never creates a batch, registry row or KV build", () => {
    expect(service).not.toMatch(/insert\(mqWorkflowLabelBatches\)|insert\(mqWorkflowLabelBatchCandidates\)/);
    expect(service).not.toMatch(/insert\(mqRegistryAddressLabels\)/);
    expect(service).not.toMatch(/insert\(mqBuildKvBuilds\)/);
    expect(service).toContain("batchCreated: false");
    expect(service).toContain("registryRowsCreated: 0");
    expect(service).toContain("kvBuildsCreated: 0");
  });

  it("checks the dictionary version and preview hash inside the transaction and locks rows", () => {
    expect(service).toContain("dictionary_version_changed");
    expect(service).toContain("preview_hash_mismatch");
    expect(service).toContain("strict_mode_blocked");
    expect(service).toContain("lockRows: true");
  });

  it("writes one bulk audit record plus one approval event per approved candidate", () => {
    expect(service).toContain("candidates_bulk_approved");
    expect(service).toContain("insert into mq_workflow_approval_events");
    expect(service).toContain("jsonb_to_recordset");
    expect(service).toContain("bulkOperationId");
  });

  it("reuses the shared eligibility rules instead of re-implementing them", () => {
    expect(service).toContain("buildCandidateApprovalEvaluations");
    expect(service).not.toContain("validateMetricEligibility");

    const approvalService = read("src/lib/mqchain/services/approval-service.ts");
    const quickApproval = approvalService.slice(approvalService.indexOf("export async function approveCandidateAsSuggested"));
    expect(quickApproval).toContain("buildCandidateApprovalEvaluations");
  });

  it("exposes both bulk routes on Origin behind candidate:review", () => {
    const origin = read("origin/app.ts");
    expect(origin).toContain('pathname === "/v1/candidates/bulk-approval/preview"');
    expect(origin).toContain('pathname === "/v1/candidates/bulk-approval"');
    expect(origin).toContain('authorized(actor, "candidate:review", () => previewBulkCandidateApproval(body))');
    expect(origin).toContain('authorized(actor, "candidate:review", () => executeBulkCandidateApproval(body))');
    expect(origin).toContain("BODY_LIMITS.bulkApproval");
  });

  it("keeps select-all matching independent from the paginated visible rows", () => {
    expect(service).toContain("select({ id: mqWorkflowAddressCandidates.id, metadata: mqWorkflowAddressCandidates.metadata })");
    expect(service).not.toContain("limit(pagination.pageSize)");
    expect(sourcePage).toContain("rows={bulkApprovalRows}");
    expect(workflow).toContain("sourceJobId");
    expect(workflow).toContain("sourceSheet: sheet.sourceSheet");
    expect(workflow).not.toContain("candidateIds: sheet.candidateIds");
    const panel = read("src/components/mqchain/bulk-approval-panel.tsx");
    expect(panel).toContain('selectionType: group.sourceSheet ? "source_sheet" : "source_job"');
    expect(workflow).toContain("rows={rows}");
  });

  it("keeps the Next.js proxy routes free of database access", () => {
    for (const path of [
      "src/app/api/mqchain/candidates/bulk-approval/route.ts",
      "src/app/api/mqchain/candidates/bulk-approval/preview/route.ts",
    ]) {
      const source = read(path);
      expect(source).not.toMatch(/@\/db|drizzle-orm|getDb/);
      expect(source).toContain("origin-client/client");
      expect(source).toContain('assertPermission("candidate:review")');
      // Internal database errors must never reach the client verbatim.
      expect(source).toContain("500");
      expect(source).not.toContain("error.message, 500");
    }
  });

  it("labels the two bulk modes explicitly in the UI", () => {
    const panel = read("src/components/mqchain/bulk-approval-panel.tsx");
    expect(panel).toContain("Approve all selected atomically");
    expect(panel).toContain("Approve eligible candidates only");
    expect(panel).toContain("Blockers:");
    // A vague "Approve all" must never describe eligible-only behavior.
    expect(panel).not.toMatch(/>\s*Approve all\s*</);
  });
});
