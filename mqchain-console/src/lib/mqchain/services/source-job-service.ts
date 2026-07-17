import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressCandidates,
  mqAddressEvidence,
  mqAddressRegistry,
  mqApprovalEvents,
  mqAuditLog,
  mqEntities,
  mqKvRoleDict,
  mqLabelBatches,
  mqProtocols,
  mqSourceDocuments,
  mqSourceJobs,
  mqSourceVerifications,
  mqUsers,
} from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";
import { parseSourceJobListFilters, type SourceJobListFilters } from "../list-filters";
import {
  buildSourceJobArchiveMetadata,
  buildSourceJobCandidateRollup,
  buildSourceJobDocumentRollup,
  buildSourceJobDownstreamRollup,
  buildSourceJobEvidenceRollup,
  buildSourceVerificationDecisionPayload,
  buildSourceJobVerificationRollup,
} from "../source-job";
import { candidateSourceSheetMatches, candidateSourceUrlMatches } from "../candidate-detail";
import { sourceJobArchiveSchema, sourceVerificationSchema } from "../validators/source-job";

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

  const [documents, candidates, downstreamBatches, verifications, downstreamRegistryRows] = await Promise.all([
    db.select().from(mqSourceDocuments).where(eq(mqSourceDocuments.sourceJobId, id)),
    db.select().from(mqAddressCandidates).where(eq(mqAddressCandidates.sourceJobId, id)).orderBy(desc(mqAddressCandidates.createdAt)),
    db.select().from(mqLabelBatches).where(eq(mqLabelBatches.sourceJobId, id)).orderBy(desc(mqLabelBatches.createdAt)),
    db
      .select({
        verification: mqSourceVerifications,
        verifierEmail: mqUsers.email,
        verifierName: mqUsers.displayName,
      })
      .from(mqSourceVerifications)
      .leftJoin(mqUsers, eq(mqSourceVerifications.verifiedBy, mqUsers.id))
      .where(eq(mqSourceVerifications.sourceJobId, id))
      .orderBy(desc(mqSourceVerifications.createdAt)),
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
    verifications,
    evidence,
    downstreamBatches,
    downstreamRegistryRows,
    documentRollup: buildSourceJobDocumentRollup(documents),
    candidateRollup: buildSourceJobCandidateRollup(candidates),
    evidenceRollup: buildSourceJobEvidenceRollup(evidence),
    verificationRollup: buildSourceJobVerificationRollup(verifications.map((row) => row.verification)),
    downstreamRollup: buildSourceJobDownstreamRollup(downstreamBatches, downstreamRegistryRows.map((row) => row.registry)),
  };
}

function parseVerificationEvidence(value: string | undefined) {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Verification evidence JSON must be an object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Verification evidence JSON is invalid: ${error.message}`);
    }
    throw new Error("Verification evidence JSON is invalid.");
  }
}

function assertCandidateVerificationScopeMatches(
  candidate: typeof mqAddressCandidates.$inferSelect | null,
  verification: {
    verificationScope: string;
    sourceSheet?: string;
    sourceUrl?: string;
  },
) {
  if (!candidate) return;

  if (verification.verificationScope === "source_sheet") {
    const sheetMatch = candidateSourceSheetMatches(candidate.metadata, verification.sourceSheet);
    if (sheetMatch.matchRequired && !sheetMatch.matches) {
      throw new Error(
        `Source sheet verification does not match candidate provenance. Expected one of: ${sheetMatch.knownValues.join(", ")}.`,
      );
    }
  }

  if (verification.verificationScope === "source_url") {
    const urlMatch = candidateSourceUrlMatches(candidate.metadata, verification.sourceUrl);
    if (urlMatch.matchRequired && !urlMatch.matches) {
      throw new Error(
        `Source URL verification does not match candidate provenance. Expected one of: ${urlMatch.knownValues.join(", ")}.`,
      );
    }
  }
}

export async function recordSourceVerification(input: unknown) {
  const actor = await assertPermission("source:verify");
  const parsed = sourceVerificationSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [sourceJob] = await tx.select().from(mqSourceJobs).where(eq(mqSourceJobs.id, parsed.sourceJobId)).limit(1);
    let candidateForScope: typeof mqAddressCandidates.$inferSelect | null = null;
    if (!sourceJob) {
      throw new Error("Source job not found.");
    }

    if (parsed.sourceDocumentId) {
      const [document] = await tx
        .select()
        .from(mqSourceDocuments)
        .where(and(eq(mqSourceDocuments.id, parsed.sourceDocumentId), eq(mqSourceDocuments.sourceJobId, parsed.sourceJobId)))
        .limit(1);
      if (!document) {
        throw new Error("Source document does not belong to this source job.");
      }
    }

    if (parsed.candidateId) {
      const [candidate] = await tx
        .select()
        .from(mqAddressCandidates)
        .where(and(eq(mqAddressCandidates.id, parsed.candidateId), eq(mqAddressCandidates.sourceJobId, parsed.sourceJobId)))
        .limit(1);
      if (!candidate) {
        throw new Error("Candidate does not belong to this source job.");
      }
      candidateForScope = candidate;
    }

    if (parsed.verificationScope === "source_document" && !parsed.sourceDocumentId) {
      throw new Error("Source document verification requires a source document id.");
    }
    if (parsed.verificationScope === "source_sheet" && !parsed.sourceSheet) {
      throw new Error("Source sheet verification requires a sheet or tab name.");
    }
    if (parsed.verificationScope === "source_url" && !parsed.sourceUrl) {
      throw new Error("Source URL verification requires a source URL.");
    }
    assertCandidateVerificationScopeMatches(candidateForScope, parsed);

    const verificationEvidence = parseVerificationEvidence(parsed.verificationEvidenceJson);
    const evidenceKeys = Object.keys(verificationEvidence).sort((left, right) => left.localeCompare(right));
    const [verification] = await tx
      .insert(mqSourceVerifications)
      .values({
        sourceJobId: parsed.sourceJobId,
        sourceDocumentId: parsed.sourceDocumentId ?? null,
        candidateId: parsed.candidateId ?? null,
        verificationScope: parsed.verificationScope,
        sourceSheet: parsed.sourceSheet || null,
        sourceUrl: parsed.sourceUrl || null,
        sourceTrust: parsed.sourceTrust,
        status: parsed.status,
        notes: parsed.notes || null,
        verificationEvidence,
        verifiedBy: actor.id,
      })
      .returning();
    const decisionPayload = buildSourceVerificationDecisionPayload({
      sourceVerificationId: verification.id,
      sourceJobId: parsed.sourceJobId,
      sourceDocumentId: parsed.sourceDocumentId ?? null,
      candidateId: parsed.candidateId ?? null,
      verificationScope: parsed.verificationScope,
      sourceSheet: parsed.sourceSheet ?? null,
      sourceUrl: parsed.sourceUrl ?? null,
      sourceTrust: parsed.sourceTrust,
      status: parsed.status,
      evidenceKeys,
    });

    await tx.insert(mqApprovalEvents).values({
      candidateId: parsed.candidateId ?? null,
      action: "source_verification_recorded",
      actorId: actor.id,
      reason: parsed.notes || `${parsed.verificationScope} ${parsed.status}`,
      beforeJson: sourceJob,
      afterJson: verification,
      metadata: decisionPayload,
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "source_verification_recorded",
      targetTable: "mq_source_verifications",
      targetId: String(verification.id),
      payload: decisionPayload,
    });

    return verification;
  });
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

    const archiveStorageUri = parsed.archiveStorageUri || before.archiveStorageUri;
    if (!archiveStorageUri) {
      throw new Error("Archive storage URI is required before archiving a source job.");
    }

    const metadata = buildSourceJobArchiveMetadata(before.metadata, {
      archiveStorageUri,
      reason: parsed.reason,
      actorEmail: actor.email,
    });

    const [updated] = await tx
      .update(mqSourceJobs)
      .set({
        status: "archived",
        archiveStorageUri,
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
        snapshotPolicy: {
          archivedSourceSnapshotRequired: true,
          sourceDocumentsImmutable: true,
          registryWriteAllowed: false,
          kvWriteAllowed: false,
        },
      },
    });

    return updated;
  });
}
