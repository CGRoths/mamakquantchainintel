import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqWorkflowAddressCandidates,
  mqAuditEvents,
  mqWorkflowBulkApprovalOperations,
} from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";

import { summarizeApprovalBlockers, type CandidateApprovalBlocker } from "../candidate-approval";
import { extractCandidateSourceSheetNames } from "../candidate-detail";
import { buildCandidateReviewAuditPayload } from "../review";
import {
  BULK_APPROVAL_MAX_CANDIDATES,
  bulkApprovalExecuteSchema,
  bulkApprovalPreviewSchema,
  type BulkApprovalMode,
} from "../validators/bulk-approval";
import { buildCandidateApprovalEvaluations } from "./candidate-approval-evaluation";
import { getCanonicalDictionarySnapshot } from "./dictionary-service";
import { hashJson } from "./service-utils";
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
  selectionType: "explicit_ids" | "source_sheet" | "source_job";
  sourceJobId: number | null;
  sourceSheet: string | null;
  selectedCount: number;
  eligibleCount: number;
  blockedCount: number;
  candidateIds: number[];
  eligibleCandidateIds: number[];
  blockedCandidates: BulkApprovalBlockedCandidate[];
  blockerSummary: Array<{ blocker: CandidateApprovalBlocker; label: string; count: number }>;
  sourceJobIds: number[];
  dictionaryVersion: string;
  candidateSnapshotHash: string;
  sourceVerificationSnapshotHash: string;
  previewHash: string;
  mode: BulkApprovalMode;
  blockerPage: number;
  blockerPageSize: number;
  blockerTotalPages: number;
};

type BulkSelection = {
  selectionType: "explicit_ids" | "source_sheet" | "source_job";
  candidateIds: number[];
  sourceJobId?: number;
  sourceSheet?: string | null;
};

function selectionScope(selection: BulkSelection) {
  return {
    selectionType: selection.selectionType,
    sourceJobId: selection.sourceJobId ?? null,
    sourceSheet: selection.sourceSheet ?? null,
  } as const;
}

async function expandSelection(reader: Pick<Db, "select">, selection: BulkSelection) {
  if (selection.selectionType === "explicit_ids") return selection.candidateIds;
  const candidates = await reader
    .select({ id: mqWorkflowAddressCandidates.id, metadata: mqWorkflowAddressCandidates.metadata })
    .from(mqWorkflowAddressCandidates)
    .where(eq(mqWorkflowAddressCandidates.sourceJobId, selection.sourceJobId!));
  const ids = candidates
    .filter((candidate) =>
      selection.selectionType !== "source_sheet"
        ? true
        : extractCandidateSourceSheetNames(candidate.metadata).some(
            (sheet) => sheet.toLowerCase() === selection.sourceSheet!.trim().toLowerCase(),
          ),
    )
    .map((candidate) => candidate.id)
    .sort((left, right) => left - right);
  if (ids.length > BULK_APPROVAL_MAX_CANDIDATES) {
    throw new BulkApprovalError(400, "selection_too_large", `Selection exceeds ${BULK_APPROVAL_MAX_CANDIDATES} candidates.`, {
      selectedCount: ids.length,
      maximum: BULK_APPROVAL_MAX_CANDIDATES,
    });
  }
  return ids;
}

function toPreview(
  bundle: Awaited<ReturnType<typeof buildCandidateApprovalEvaluations>>,
  mode: BulkApprovalMode,
  scope: ReturnType<typeof selectionScope>,
  blockerPage = 1,
  blockerPageSize = 100,
): BulkApprovalPreview {
  const eligibleCandidateIds = bundle.evaluations.filter((row) => row.eligible).map((row) => row.candidateId);
  const blockedCandidates = bundle.evaluations
    .filter((row) => !row.eligible)
    .map((row) => ({ candidateId: row.candidateId, blockers: row.blockers }));

  const blockerOffset = (blockerPage - 1) * blockerPageSize;
  return {
    ...scope,
    selectedCount: bundle.candidateIds.length,
    eligibleCount: eligibleCandidateIds.length,
    blockedCount: blockedCandidates.length,
    candidateIds: bundle.candidateIds,
    eligibleCandidateIds,
    blockedCandidates: blockedCandidates.slice(blockerOffset, blockerOffset + blockerPageSize),
    blockerSummary: summarizeApprovalBlockers(bundle.evaluations),
    sourceJobIds: bundle.sourceJobIds,
    dictionaryVersion: bundle.dictionaryVersion,
    candidateSnapshotHash: bundle.candidateSnapshotHash,
    sourceVerificationSnapshotHash: bundle.sourceVerificationSnapshotHash,
    previewHash: bundle.previewHash,
    mode,
    blockerPage,
    blockerPageSize,
    blockerTotalPages: Math.max(1, Math.ceil(blockedCandidates.length / blockerPageSize)),
  };
}

/** Read-only bulk approval preview. Performs no database writes. */
export async function previewBulkCandidateApproval(input: unknown): Promise<BulkApprovalPreview> {
  await assertPermission("candidate:review");
  const parsed = bulkApprovalPreviewSchema.parse(input);
  const db = getDb();
  const candidateIds = await expandSelection(db, parsed);
  const scope = selectionScope(parsed);
  const snapshot = await getCanonicalDictionarySnapshot(db);
  const bundle = await buildCandidateApprovalEvaluations({
    reader: db,
    candidateIds,
    dictionaryVersion: snapshot.versionHash,
    lockRows: false,
    mode: parsed.mode,
    selectionScope: scope,
    approvalKind: "bulk",
  });

  return toPreview(bundle, parsed.mode, scope, parsed.blockerPage, parsed.blockerPageSize);
}

export async function getSourceJobApprovalCoverage(input: unknown) {
  await assertPermission("candidate:review");
  const { id: sourceJobId } = idSchema.parse(input);
  const db = getDb();
  const candidateRows = await db
    .select({ id: mqWorkflowAddressCandidates.id })
    .from(mqWorkflowAddressCandidates)
    .where(eq(mqWorkflowAddressCandidates.sourceJobId, sourceJobId));
  const candidateIds = candidateRows.map(candidate => candidate.id).sort((left, right) => left - right);
  const snapshot = await getCanonicalDictionarySnapshot(db);
  const bundle = candidateIds.length
    ? await buildCandidateApprovalEvaluations({
        reader: db,
        candidateIds,
        dictionaryVersion: snapshot.versionHash,
        lockRows: false,
        mode: "eligible_only",
        selectionScope: { selectionType: "source_job", sourceJobId },
        approvalKind: "bulk",
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
    candidateCount: candidateIds.length,
    eligibleCount: bundle?.evaluations.filter((evaluation) => evaluation.eligible).length ?? 0,
    blockedCount: bundle?.evaluations.filter((evaluation) => !evaluation.eligible).length ?? 0,
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
  selectionType: BulkApprovalPreview["selectionType"];
  sourceJobId: number | null;
  sourceSheet: string | null;
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
  candidateSnapshotHash: string;
  sourceVerificationSnapshotHash: string;
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
    const requestHash = hashJson({ contract: "MQCHAIN-BULK-APPROVAL-EXECUTION-1", ...parsed });
    if (parsed.idempotencyKey) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${parsed.idempotencyKey}, 0))`);
      const [existingOperation] = await tx
        .select()
        .from(mqWorkflowBulkApprovalOperations)
        .where(eq(mqWorkflowBulkApprovalOperations.idempotencyKey, parsed.idempotencyKey))
        .limit(1)
        .for("update");
      if (existingOperation) {
        if (existingOperation.requestHash !== requestHash) {
          throw new BulkApprovalError(409, "idempotency_key_reused", "Idempotency key was already used for a different request.");
        }
        if (existingOperation.status === "completed" && existingOperation.result) {
          return existingOperation.result as BulkApprovalResult;
        }
      } else {
        await tx.insert(mqWorkflowBulkApprovalOperations).values({
          id: bulkOperationId,
          idempotencyKey: parsed.idempotencyKey,
          actorId: actor.id,
          requestHash,
        });
      }
    }

    const candidateIds = await expandSelection(tx, parsed);
    const scope = selectionScope(parsed);
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
      candidateIds,
      dictionaryVersion: snapshot.versionHash,
      lockRows: true,
      mode: parsed.mode,
      selectionScope: scope,
      approvalKind: "bulk",
    });
    const preview = toPreview(bundle, parsed.mode, scope, 1, BULK_APPROVAL_MAX_CANDIDATES);

    if (preview.previewHash !== parsed.expectedPreviewHash) {
      throw new BulkApprovalError(409, "preview_hash_mismatch", "Candidate state changed after preview. Run preview again.", {
        expectedPreviewHash: parsed.expectedPreviewHash,
        actualPreviewHash: preview.previewHash,
      });
    }
    if (preview.candidateSnapshotHash !== parsed.expectedCandidateSnapshotHash) {
      throw new BulkApprovalError(409, "candidate_snapshot_hash_mismatch", "Candidate state changed after preview. Run preview again.", {
        expected: parsed.expectedCandidateSnapshotHash,
        actual: preview.candidateSnapshotHash,
      });
    }
    if (preview.sourceVerificationSnapshotHash !== parsed.expectedSourceVerificationSnapshotHash) {
      throw new BulkApprovalError(409, "source_verification_snapshot_hash_mismatch", "Source verification changed after preview. Run preview again.", {
        expected: parsed.expectedSourceVerificationSnapshotHash,
        actual: preview.sourceVerificationSnapshotHash,
      });
    }

    if (parsed.mode === "strict" && preview.blockedCount > 0) {
      throw new BulkApprovalError(409, "strict_mode_blocked", "Strict mode approves all selected candidates or none.", {
        blockedCount: preview.blockedCount,
        blockedCandidates: preview.blockedCandidates,
        blockerSummary: preview.blockerSummary,
      });
    }

    const mutationRows = bundle.evaluations.flatMap((evaluation) => {
      const candidate = bundle.candidatesById.get(evaluation.candidateId);
      if (!evaluation.eligible || !evaluation.draft || !candidate) return [];
      return [{ candidate, approvalDraft: { ...evaluation.draft, notes: parsed.reason } }];
    });
    const mutationPayload = mutationRows.map(({ candidate, approvalDraft }) => ({
      candidate_id: candidate.id,
      approval_draft: approvalDraft,
    }));
    const updatedRows = mutationPayload.length
      ? await tx.execute(sql`
          with input as (
            select * from jsonb_to_recordset(${JSON.stringify(mutationPayload)}::jsonb)
              as x(candidate_id bigint, approval_draft jsonb)
          )
          update mq_workflow_address_candidates as candidate
          set candidate_status = 'approved',
              metadata = candidate.metadata || jsonb_build_object(
                'approvalDraft', input.approval_draft,
                'bulkOperationId', ${bulkOperationId}::text
              ),
              updated_at = now()
          from input
          where candidate.id = input.candidate_id
            and candidate.candidate_status = 'pending_review'
          returning candidate.*
        `)
      : [];
    if (updatedRows.length !== mutationRows.length) {
      throw new BulkApprovalError(409, "candidate_status_race", "A candidate changed status during bulk execution. Run preview again.");
    }
    const updatedById = new Map(updatedRows.map((row) => [Number(row.id), row]));
    const approvedCandidateIds = [...updatedById.keys()].sort((left, right) => left - right);
    const approvalEventRows = mutationRows.map(({ candidate, approvalDraft }) => ({
      candidate_id: candidate.id,
      before_json: candidate,
      after_json: updatedById.get(candidate.id),
      metadata: {
          bulkOperationId,
          mode: parsed.mode,
          beforeStatus: candidate.candidateStatus,
          afterStatus: "approved",
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
            afterStatus: "approved",
            reason: parsed.reason,
            approvalDraft,
          }),
        },
    }));

    if (approvalEventRows.length) {
      await tx.execute(sql`
        insert into mq_workflow_approval_events
          (candidate_id, action, actor_id, reason, before_json, after_json, metadata)
        select input.candidate_id,
               'candidate_approved_as_suggested',
               ${actor.id}::uuid,
               ${parsed.reason},
               input.before_json,
               input.after_json,
               input.metadata
        from jsonb_to_recordset(${JSON.stringify(approvalEventRows)}::jsonb)
          as input(candidate_id bigint, before_json jsonb, after_json jsonb, metadata jsonb)
      `);
    }

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "candidates_bulk_approved",
      targetTable: "mq_workflow_address_candidates",
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

    const result: BulkApprovalResult = {
      bulkOperationId,
      selectionType: preview.selectionType,
      sourceJobId: preview.sourceJobId,
      sourceSheet: preview.sourceSheet,
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
      candidateSnapshotHash: preview.candidateSnapshotHash,
      sourceVerificationSnapshotHash: preview.sourceVerificationSnapshotHash,
      previewHash: preview.previewHash,
      reason: parsed.reason,
      batchCreated: false as const,
      registryRowsCreated: 0 as const,
      kvBuildsCreated: 0 as const,
    };
    if (parsed.idempotencyKey) {
      await tx
        .update(mqWorkflowBulkApprovalOperations)
        .set({ status: "completed", result, completedAt: new Date() })
        .where(eq(mqWorkflowBulkApprovalOperations.idempotencyKey, parsed.idempotencyKey));
    }
    return result;
  });
}
