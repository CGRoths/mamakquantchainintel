import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressCandidates,
  mqAddressEvidence,
  mqAddressRegistry,
  mqAuditLog,
  mqEntities,
  mqKvRoleDict,
  mqLabelBatches,
  mqProtocols,
  mqSourceDocuments,
  mqSourceJobs,
} from "@/db/schema";
import { assertPermission } from "@/lib/auth/permissions";
import { parseSourceJobListFilters, type SourceJobListFilters } from "../list-filters";
import {
  buildSourceJobArchiveMetadata,
  buildSourceJobCandidateRollup,
  buildSourceJobDownstreamRollup,
  buildSourceJobEvidenceRollup,
} from "../source-job";
import { sourceJobArchiveSchema } from "../validators/source-job";

function sourceJobOrderBy(sort: SourceJobListFilters["sort"]) {
  if (sort === "updated_at") return desc(mqSourceJobs.updatedAt);
  if (sort === "source_type") return asc(mqSourceJobs.sourceType);
  if (sort === "status") return asc(mqSourceJobs.status);
  return desc(mqSourceJobs.createdAt);
}

function addCondition(conditions: SQL[], condition: SQL | undefined) {
  if (condition) conditions.push(condition);
}

export async function listSourceJobs(input?: unknown) {
  const filters = parseSourceJobListFilters(input ?? {});
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqSourceJobs.sourceName, `%${filters.q}%`),
        ilike(mqSourceJobs.sourceUrl, `%${filters.q}%`),
        ilike(mqSourceJobs.localFileName, `%${filters.q}%`),
        ilike(mqSourceJobs.archiveStorageUri, `%${filters.q}%`),
      ),
    );
  }

  if (filters.sourceType) {
    conditions.push(eq(mqSourceJobs.sourceType, filters.sourceType));
  }

  if (filters.status) {
    conditions.push(eq(mqSourceJobs.status, filters.status));
  }

  if (filters.entity) {
    conditions.push(ilike(mqSourceJobs.entityHint, `%${filters.entity}%`));
  }

  if (filters.protocol) {
    conditions.push(ilike(mqSourceJobs.protocolHint, `%${filters.protocol}%`));
  }

  if (filters.chain) {
    conditions.push(sql`${filters.chain} = any(${mqSourceJobs.chainScope})`);
  }

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(mqSourceJobs).where(where);
  const rows = await db
    .select()
    .from(mqSourceJobs)
    .where(where)
    .orderBy(sourceJobOrderBy(filters.sort), desc(mqSourceJobs.id))
    .limit(filters.pageSize)
    .offset(offset);

  return {
    rows,
    filters,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}

export async function getSourceJob(id: number) {
  const db = getDb();
  const [sourceJob] = await db.select().from(mqSourceJobs).where(eq(mqSourceJobs.id, id)).limit(1);

  if (!sourceJob) {
    return null;
  }

  const [documents, candidates, downstreamBatches, downstreamRegistryRows] = await Promise.all([
    db.select().from(mqSourceDocuments).where(eq(mqSourceDocuments.sourceJobId, id)),
    db.select().from(mqAddressCandidates).where(eq(mqAddressCandidates.sourceJobId, id)).orderBy(desc(mqAddressCandidates.createdAt)),
    db.select().from(mqLabelBatches).where(eq(mqLabelBatches.sourceJobId, id)).orderBy(desc(mqLabelBatches.createdAt)),
    db
      .select({
        registry: mqAddressRegistry,
        entityName: mqEntities.entityName,
        protocolName: mqProtocols.protocolName,
        roleCode: mqKvRoleDict.roleCode,
      })
      .from(mqAddressRegistry)
      .leftJoin(mqEntities, eq(mqAddressRegistry.entityId, mqEntities.id))
      .leftJoin(mqProtocols, eq(mqAddressRegistry.protocolId, mqProtocols.id))
      .leftJoin(mqKvRoleDict, eq(mqAddressRegistry.roleId, mqKvRoleDict.roleId))
      .where(eq(mqAddressRegistry.primarySourceJobId, id))
      .orderBy(desc(mqAddressRegistry.createdAt)),
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
    downstreamBatches,
    downstreamRegistryRows,
    candidateRollup: buildSourceJobCandidateRollup(candidates),
    evidenceRollup: buildSourceJobEvidenceRollup(evidence),
    downstreamRollup: buildSourceJobDownstreamRollup(downstreamBatches, downstreamRegistryRows.map((row) => row.registry)),
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
