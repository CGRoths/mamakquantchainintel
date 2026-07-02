import { count, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mqAddressCandidates, mqAddressEvidence } from "@/db/schema";
import { buildReviewCandidateGroups, buildReviewGroupRollups, filterRowsByReviewGroup } from "../review";
import { listCandidates } from "./candidate-service";

type CandidateListRow = Awaited<ReturnType<typeof listCandidates>>["rows"][number];

type ReviewQueueRow = CandidateListRow & {
  latestEvidence: typeof mqAddressEvidence.$inferSelect | null;
};

async function getReviewCounts() {
  const db = getDb();
  const [pending, needsMoreEvidence, conflicts, approvedReady] = await Promise.all([
    db.select({ value: count() }).from(mqAddressCandidates).where(eq(mqAddressCandidates.candidateStatus, "pending_review")),
    db.select({ value: count() }).from(mqAddressCandidates).where(eq(mqAddressCandidates.candidateStatus, "needs_more_evidence")),
    db.select({ value: count() }).from(mqAddressCandidates).where(eq(mqAddressCandidates.candidateStatus, "conflict_pending")),
    db.select({ value: count() }).from(mqAddressCandidates).where(eq(mqAddressCandidates.candidateStatus, "approved")),
  ]);

  return {
    pending: pending[0]?.value ?? 0,
    needsMoreEvidence: needsMoreEvidence[0]?.value ?? 0,
    conflicts: conflicts[0]?.value ?? 0,
    approvedReady: approvedReady[0]?.value ?? 0,
  };
}

async function attachLatestEvidence(rows: CandidateListRow[]): Promise<ReviewQueueRow[]> {
  const candidateIds = rows.map((row) => row.candidate.id);
  if (!candidateIds.length) {
    return [];
  }

  const evidenceRows = await getDb()
    .select()
    .from(mqAddressEvidence)
    .where(inArray(mqAddressEvidence.candidateId, candidateIds))
    .orderBy(desc(mqAddressEvidence.createdAt));

  const latestEvidenceByCandidate = new Map<number, typeof mqAddressEvidence.$inferSelect>();
  for (const evidence of evidenceRows) {
    if (evidence.candidateId && !latestEvidenceByCandidate.has(evidence.candidateId)) {
      latestEvidenceByCandidate.set(evidence.candidateId, evidence);
    }
  }

  return rows.map((row) => ({
    ...row,
    latestEvidence: latestEvidenceByCandidate.get(row.candidate.id) ?? null,
  }));
}

export async function getReviewWorkspace() {
  const [counts, pendingResult, approvedResult] = await Promise.all([
    getReviewCounts(),
    listCandidates({ status: "pending_review", sort: "confidence", pageSize: 50 }),
    listCandidates({ status: "approved", sort: "confidence", pageSize: 50 }),
  ]);
  const pendingRows = await attachLatestEvidence(pendingResult.rows);
  const approvedRows = await attachLatestEvidence(approvedResult.rows);

  return {
    counts,
    pendingRows,
    approvedRows,
    groups: buildReviewCandidateGroups(pendingRows),
  };
}

export async function getReviewGroupsWorkspace() {
  const result = await listCandidates({ status: "pending_review", sort: "confidence", pageSize: 100 });
  const rows = await attachLatestEvidence(result.rows);

  return {
    rows,
    groups: buildReviewCandidateGroups(rows),
  };
}

export async function getReviewGroupDetail(slug: string) {
  const [workspace, approvedResult] = await Promise.all([
    getReviewGroupsWorkspace(),
    listCandidates({ status: "approved", sort: "confidence", pageSize: 500 }),
  ]);
  const approvedQueueRows = await attachLatestEvidence(approvedResult.rows);
  const rows = filterRowsByReviewGroup(workspace.rows, slug);
  const approvedRows = filterRowsByReviewGroup(approvedQueueRows, slug);
  const allRows = [...rows, ...approvedRows];
  const group = workspace.groups.find((item) => item.slug === slug) ?? buildReviewCandidateGroups(allRows)[0] ?? null;

  return {
    group,
    rows,
    approvedRows,
    rollups: buildReviewGroupRollups(allRows),
  };
}
