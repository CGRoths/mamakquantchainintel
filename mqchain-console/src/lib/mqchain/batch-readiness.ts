export type BatchCandidateReadinessRow = {
  id: number;
  candidateStatus: string;
};

export function assertSelectedCandidatesApproved(selectedIds: number[], candidates: BatchCandidateReadinessRow[]) {
  const selected = Array.from(new Set(selectedIds));
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const missingIds = selected.filter((id) => !candidatesById.has(id));
  const notApproved = candidates.filter((candidate) => selected.includes(candidate.id) && candidate.candidateStatus !== "approved");

  if (missingIds.length || notApproved.length) {
    const parts: string[] = [];
    if (missingIds.length) {
      parts.push(`missing candidate IDs: ${missingIds.join(", ")}`);
    }
    if (notApproved.length) {
      parts.push(
        `not approved: ${notApproved.map((candidate) => `${candidate.id} (${candidate.candidateStatus})`).join(", ")}`,
      );
    }

    throw new Error(`Only approved candidates can be added to a label batch; ${parts.join("; ")}.`);
  }
}

export function assertBatchCandidatesStillApproved(candidates: BatchCandidateReadinessRow[]) {
  const notApproved = candidates.filter((candidate) => candidate.candidateStatus !== "approved");

  if (notApproved.length) {
    throw new Error(
      `Batch candidate readiness changed; only approved candidates can be committed. Not approved: ${notApproved
        .map((candidate) => `${candidate.id} (${candidate.candidateStatus})`)
        .join(", ")}.`,
    );
  }
}
