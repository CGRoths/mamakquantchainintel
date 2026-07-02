import { desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mqAddressCandidates, mqAddressEvidence, mqAuditLog, mqSourceDocuments, mqSourceJobs } from "@/db/schema";
import { assertPermission } from "@/lib/auth/permissions";
import { buildSourceJobArchiveMetadata, buildSourceJobCandidateRollup, buildSourceJobEvidenceRollup } from "../source-job";
import { sourceJobArchiveSchema } from "../validators/source-job";

export async function listSourceJobs(limit = 50) {
  return getDb().select().from(mqSourceJobs).orderBy(desc(mqSourceJobs.createdAt)).limit(limit);
}

export async function getSourceJob(id: number) {
  const db = getDb();
  const [sourceJob] = await db.select().from(mqSourceJobs).where(eq(mqSourceJobs.id, id)).limit(1);

  if (!sourceJob) {
    return null;
  }

  const [documents, candidates] = await Promise.all([
    db.select().from(mqSourceDocuments).where(eq(mqSourceDocuments.sourceJobId, id)),
    db.select().from(mqAddressCandidates).where(eq(mqAddressCandidates.sourceJobId, id)).orderBy(desc(mqAddressCandidates.createdAt)),
  ]);

  const candidateIds = candidates.map((candidate) => candidate.id);
  const evidence = candidateIds.length
    ? await db
        .select()
        .from(mqAddressEvidence)
        .where(inArray(mqAddressEvidence.candidateId, candidateIds))
        .orderBy(desc(mqAddressEvidence.createdAt))
    : [];

  return {
    sourceJob,
    documents,
    candidates,
    evidence,
    candidateRollup: buildSourceJobCandidateRollup(candidates),
    evidenceRollup: buildSourceJobEvidenceRollup(evidence),
  };
}

export async function archiveSourceJob(input: unknown) {
  const actor = await assertPermission("intake:create");
  const parsed = sourceJobArchiveSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(mqSourceJobs).where(eq(mqSourceJobs.id, parsed.sourceJobId)).limit(1);

    if (!before) {
      throw new Error("Source job not found.");
    }

    const metadata = buildSourceJobArchiveMetadata(before.metadata, {
      archiveStorageUri: parsed.archiveStorageUri,
      reason: parsed.reason,
      actorEmail: actor.email,
    });

    const [updated] = await tx
      .update(mqSourceJobs)
      .set({
        status: "archived",
        archiveStorageUri: parsed.archiveStorageUri || before.archiveStorageUri,
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(mqSourceJobs.id, parsed.sourceJobId))
      .returning();

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "source_job_archived",
      targetTable: "mq_source_jobs",
      targetId: String(parsed.sourceJobId),
      payload: {
        beforeStatus: before.status,
        afterStatus: updated.status,
        archiveStorageUri: updated.archiveStorageUri,
        reason: parsed.reason,
      },
    });

    return updated;
  });
}
