import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mqAddressCandidates, mqApprovalEvents, mqAuditLog } from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";

import { summarizeApprovalBlockers, type CandidateApprovalBlocker } from "../candidate-approval";
import { extractCandidateSourceSheetNames } from "../candidate-detail";
import { buildCandidateReviewAuditPayload } from "../review";
import { bulkApprovalExecuteSchema, bulkApprovalPreviewSchema, type BulkApprovalMode } from "../validators/bulk-approval";
import { buildCandidateApprovalEvaluations } from "./candidate-approval-evaluation";
import { getCanonicalDictionarySnapshot } from "./dictionary-service";
import { idSchema } from "../validators/dictionary";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class BulkApprovalError extends Error {
  constructor(
    readonly status: 400 | 409,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "BulkApprovalError";
  }
}

export type BulkApprovalBlockedCandidate = {
  candidateId: number;
  blockers: CandidateApprovalBlocker[];
};

export type BulkApprovalPreview = {
  selectedCount: number;
  eligibleCount: number;
  blockedCount: number;
  candidateIds: number[];
  eligibleCandidateIds: number[];
  blockedCandidates: BulkApprovalBlockedCandidate[];
  blockerSummary: Array<{ blocker: CandidateApprovalBlocker; label: string; count: number }>;
  sourceJobIds: number[];
  dictionaryVersion: string;
  previewHash: string;
  mode: BulkApprovalMode;
};

function toPreview(
  bundle: Awaited<ReturnType<typeof buildCandidateApprovalEvaluations>>,
  mode: BulkApprovalMode,
): BulkApprovalPreview {
  const eligibleCandidateIds = bundle.evaluations.filter((row) => row.eligible).map((row) => row.candidateId);
  const blockedCandidates = bundle.evaluations
    .filter((row) => !row.eligible)
    .map((row) => ({ candidateId: row.candidateId, blockers: row.blockers }));

  return {
    selectedCount: bundle.candidateIds.length,
    eligibleCount: eligibleCandidateIds.length,
    blockedCount: blockedCandidates.length,
    candidateIds: bundle.candidateIds,
    eligibleCandidateIds,
    blockedCandidates,
    blockerSummary: summarizeApprovalBlockers(bundle.evaluations),
    sourceJobIds: bundle.sourceJobIds,
    dictionaryVersion: bundle.dictionaryVersion,
    previewHash: bundle.previewHash,
    mode,
  };
}

/** Read-only bulk approval preview. Performs no database writes. */
export async function previewBulkCandidateApproval(input: unknown): Promise<BulkApprovalPreview> {
  await assertPermission("candidate:review");
  const parsed = bulkApprovalPreviewSchema.parse(input);
  const db = getDb();
  const snapshot = await getCanonicalDictionarySnapshot(db);
  const bundle = await buildCandidateApprovalEvaluations({
    reader: db,
    candidateIds: parsed.candidateIds,
    dictionaryVersion: snapshot.versionHash,
    lockRows: false,
    mode: parsed.mode,
  });

  return toPreview(bundle, parsed.mode);
}

export async function getSourceJobApprovalCoverage(input: unknown) {
  await assertPermission("candidate:review");
  const { id: sourceJobId } = idSchema.parse(input);
  const db = getDb();
  const candidateRows = await db
    .select({ id: mqAddressCandidates.id })
    .from(mqAddressCandidates)
    .where(eq(mqAddressCandidates.sourceJobId, sourceJobId));
  const candidateIds = candidateRows.map(candidate => candidate.id).sort((left, right) => left - right);
  const snapshot = await getCanonicalDictionarySnapshot(db);
  const bundle = candidateIds.length
    ? await buildCandidateApprovalEvaluations({
        reader: db,
        candidateIds,
        dictionaryVersion: snapshot.versionHash,
        lockRows: false,
        mode: "eligible_only",
      })
    : null;
  const evaluationById = new Map(bundle?.evaluations.map(evaluation => [evaluation.candidateId, evaluation]) ?? []);
  const groups = new Map<string, number[]>();
  for (const candidate of bundle?.candidatesById.values() ?? []) {
    const sheets = extractCandidateSourceSheetNames(candidate.metadata);
    for (const sheet of sheets.length ? sheets : ["(unscoped)"]) {
      groups.set(sheet, [...(groups.get(sheet) ?? []), candidate.id]);
    }
  }

  return {
    sourceJobId,
    dictionaryVersion: snapshot.versionHash,
    sheets: [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([sourceSheet, ids]) => {
      const sortedIds = [...ids].sort((left, right) => left - right);
      const eligibleCandidateIds = sortedIds.filter(id => evaluationById.get(id)?.eligible);
      const blockedCandidateIds = sortedIds.filter(id => !evaluationById.get(id)?.eligible);
      const verificationStatuses = new Set(sortedIds.map(id => bundle?.sourceVerificationStatusById.get(id) ?? "source_verification_missing"));
      return {
        sourceSheet,
        candidateCount: sortedIds.length,
        verification: verificationStatuses.size === 1 ? [...verificationStatuses][0] : "mixed",
        eligibleCount: eligibleCandidateIds.length,
        blockedCount: blockedCandidateIds.length,
        candidateIds: sortedIds,
        eligibleCandidateIds,
        blockedCandidateIds,
        selectionAllowed: sortedIds.length <= 10_000,
      };
    }),
  };
}

export type BulkApprovalResult = {
  bulkOperationId: string;
  mode: BulkApprovalMode;
  selectedCount: number;
  eligibleCount: number;
  approvedCount: number;
  blockedCount: number;
  approvedCandidateIds: number[];
  blockedCandidates: BulkApprovalBlockedCandidate[];
  blockerSummary: BulkApprovalPreview["blockerSummary"];
  sourceJobIds: number[];
  dictionaryVersion: string;
  previewHash: string;
  reason: string;
  batchCreated: false;
  registryRowsCreated: 0;
  kvBuildsCreated: 0;
};

/**
 * Execute bulk "approve as suggested".
 *
 * Never creates a label batch, never writes registry rows, never queues or
 * activates a KV build. Those remain separate governed lifecycle steps.
 */
export async function executeBulkCandidateApproval(input: unknown): Promise<BulkApprovalResult> {
  const actor = await assertPermission("candidate:review");
  const parsed = bulkApprovalExecuteSchema.parse(input);
  const db = getDb();
  const bulkOperationId = randomUUID();

  return db.transaction(async (tx: Tx) => {
    const snapshot = await getCanonicalDictionarySnapshot(tx);
    if (snapshot.versionHash !== parsed.expectedDictionaryVersion) {
      throw new BulkApprovalError(409, "dictionary_version_changed", "Dictionary state changed after preview. Run preview again.", {
        expectedDictionaryVersion: parsed.expectedDictionaryVersion,
        actualDictionaryVersion: snapshot.versionHash,
      });
    }

    // Recalculate the entire preview inside the transaction with rows locked.
    const bundle = await buildCandidateApprovalEvaluations({
      reader: tx,
      candidateIds: parsed.candidateIds,
      dictionaryVersion: snapshot.versionHash,
      lockRows: true,
      mode: parsed.mode,
    });
    const preview = toPreview(bundle, parsed.mode);

    if (preview.previewHash !== parsed.expectedPreviewHash) {
      throw new BulkApprovalError(409, "preview_hash_mismatch", "Candidate state changed after preview. Run preview again.", {
        expectedPreviewHash: parsed.expectedPreviewHash,
        actualPreviewHash: preview.previewHash,
      });
    }

    if (parsed.mode === "strict" && preview.blockedCount > 0) {
      throw new BulkApprovalError(409, "strict_mode_blocked", "Strict mode approves all selected candidates or none.", {
        blockedCount: preview.blockedCount,
        blockedCandidates: preview.blockedCandidates,
        blockerSummary: preview.blockerSummary,
      });
    }

    const approvedCandidateIds: number[] = [];
    const approvalEventRows: (typeof mqApprovalEvents.$inferInsert)[] = [];

    for (const evaluation of bundle.evaluations) {
      if (!evaluation.eligible || !evaluation.draft) continue;
      const candidate = bundle.candidatesById.get(evaluation.candidateId);
      if (!candidate) continue;

      const approvalDraft = { ...evaluation.draft, notes: parsed.reason };
      const [updated] = await tx
        .update(mqAddressCandidates)
        .set({
          candidateStatus: "approved",
          metadata: {
            ...(candidate.metadata ?? {}),
            approvalDraft,
            bulkOperationId,
          },
          updatedAt: new Date(),
        })
        .where(eq(mqAddressCandidates.id, candidate.id))
        .returning();

      approvedCandidateIds.push(candidate.id);
      approvalEventRows.push({
        candidateId: candidate.id,
        action: "candidate_approved_as_suggested",
        actorId: actor.id,
        reason: parsed.reason,
        beforeJson: candidate,
        afterJson: updated,
        metadata: {
          bulkOperationId,
          mode: parsed.mode,
          beforeStatus: candidate.candidateStatus,
          afterStatus: updated.candidateStatus,
          entityId: approvalDraft.entityId,
          protocolId: approvalDraft.protocolId,
          roleId: approvalDraft.roleId,
          componentId: approvalDraft.componentId,
          categoryId: approvalDraft.categoryId,
          confidenceScore: approvalDraft.confidenceScore,
          qualityTier: approvalDraft.qualityTier,
          flags: approvalDraft.flags,
          metricEligible: approvalDraft.metricEligible,
          sourceVerificationStatus: bundle.sourceVerificationStatusById.get(candidate.id) ?? null,
          dictionaryVersion: snapshot.versionHash,
          approvalDraft,
          candidateAudit: buildCandidateReviewAuditPayload({
            candidateId: candidate.id,
            action: "candidate_approved_as_suggested",
            beforeStatus: candidate.candidateStatus,
            afterStatus: updated.candidateStatus,
            reason: parsed.reason,
            approvalDraft,
          }),
        },
      });
    }

    if (approvalEventRows.length) {
      await tx.insert(mqApprovalEvents).values(approvalEventRows);
    }

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "candidates_bulk_approved",
      targetTable: "mq_address_candidates",
      targetId: bulkOperationId,
      payload: {
        bulkOperationId,
        mode: parsed.mode,
        selectedCount: preview.selectedCount,
        eligibleCount: preview.eligibleCount,
        approvedCount: approvedCandidateIds.length,
        blockedCount: preview.blockedCount,
        sourceJobIds: preview.sourceJobIds,
        dictionaryVersion: snapshot.versionHash,
        previewHash: preview.previewHash,
        reason: parsed.reason,
        approvedCandidateIds,
        blockedCandidates: preview.blockedCandidates,
        blockerSummary: preview.blockerSummary,
        batchCreated: false,
        registryRowsCreated: 0,
        kvBuildsCreated: 0,
      },
    });

    return {
      bulkOperationId,
      mode: parsed.mode,
      selectedCount: preview.selectedCount,
      eligibleCount: preview.eligibleCount,
      approvedCount: approvedCandidateIds.length,
      blockedCount: preview.blockedCount,
      approvedCandidateIds,
      blockedCandidates: preview.blockedCandidates,
      blockerSummary: preview.blockerSummary,
      sourceJobIds: preview.sourceJobIds,
      dictionaryVersion: snapshot.versionHash,
      previewHash: preview.previewHash,
      reason: parsed.reason,
      batchCreated: false as const,
      registryRowsCreated: 0 as const,
      kvBuildsCreated: 0 as const,
    };
  });
}
