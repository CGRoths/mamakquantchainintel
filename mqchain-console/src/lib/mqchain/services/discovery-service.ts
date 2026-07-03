import { and, asc, desc, eq, gte, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressCandidates,
  mqAddressEvidence,
  mqAddressRegistry,
  mqAuditLog,
  mqDiscoveryJobs,
  mqEntities,
  mqKvRoleDict,
  mqProtocols,
  mqSourceDocuments,
  mqSourceJobs,
} from "@/db/schema";
import { assertPermission } from "@/lib/auth/permissions";
import { normalizeAddress } from "../address/normalize";
import { attachDiscoveryRunnerTask, defaultRoleForProtocolRootType, parseDiscoveryConfigJson, discoveryTemplateSummary } from "../discovery-config";
import { buildDiscoveryJobDetailRollup } from "../discovery-detail";
import { getDiscoveryTemplate } from "../discovery-templates";
import {
  buildDiscoveryJobCompletedAuditPayload,
  buildDiscoveryJobCreatedAuditPayload,
  defaultEvidenceTypeForDiscovery,
  parseDiscoveryResultsJson,
} from "../discovery";
import { parseDiscoveryJobListFilters, type DiscoveryJobListFilters } from "../list-filters";
import { PARSER_VERSION } from "../constants";
import { discoveryJobSchema, discoveryResultsSchema, registryDiscoveryJobSchema } from "../validators/discovery";
import { getDictionaryMaps } from "./dictionary-service";
import { hashJson, hashText, optionalNumber } from "./service-utils";

function discoveryJobOrderBy(sort: DiscoveryJobListFilters["sort"]) {
  if (sort === "updated_at") return desc(mqDiscoveryJobs.updatedAt);
  if (sort === "status") return asc(mqDiscoveryJobs.status);
  if (sort === "candidates_created") return desc(mqDiscoveryJobs.candidatesCreated);
  if (sort === "evidence_created") return desc(mqDiscoveryJobs.evidenceCreated);
  return desc(mqDiscoveryJobs.createdAt);
}

function addCondition(conditions: SQL[], condition: SQL | undefined) {
  if (condition) conditions.push(condition);
}

export async function listDiscoveryJobs(input: unknown = {}) {
  const filters = typeof input === "number" ? parseDiscoveryJobListFilters({ pageSize: input }) : parseDiscoveryJobListFilters(input);
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqDiscoveryJobs.discoveryType, `%${filters.q}%`),
        ilike(mqDiscoveryJobs.seedAddress, `%${filters.q}%`),
        ilike(mqDiscoveryJobs.error, `%${filters.q}%`),
        sql`${mqDiscoveryJobs.config}::text ilike ${`%${filters.q}%`}`,
        sql`${mqDiscoveryJobs.logs}::text ilike ${`%${filters.q}%`}`,
        sql`${mqDiscoveryJobs.id}::text ilike ${`%${filters.q}%`}`,
      ),
    );
  }

  if (filters.discoveryType) conditions.push(ilike(mqDiscoveryJobs.discoveryType, `%${filters.discoveryType}%`));
  if (filters.status) conditions.push(eq(mqDiscoveryJobs.status, filters.status));
  if (filters.chain) conditions.push(eq(mqDiscoveryJobs.chainCode, filters.chain));
  if (filters.seed) conditions.push(ilike(mqDiscoveryJobs.seedAddress, `%${filters.seed}%`));
  if (typeof filters.minCandidates === "number") conditions.push(gte(mqDiscoveryJobs.candidatesCreated, filters.minCandidates));
  if (typeof filters.minEvidence === "number") conditions.push(gte(mqDiscoveryJobs.evidenceCreated, filters.minEvidence));
  if (filters.entity) {
    addCondition(
      conditions,
      or(
        sql`${mqDiscoveryJobs.entityId}::text ilike ${`%${filters.entity}%`}`,
        ilike(mqEntities.entityCode, `%${filters.entity}%`),
        ilike(mqEntities.entityName, `%${filters.entity}%`),
      ),
    );
  }
  if (filters.protocol) {
    addCondition(
      conditions,
      or(
        sql`${mqDiscoveryJobs.protocolId}::text ilike ${`%${filters.protocol}%`}`,
        ilike(mqProtocols.protocolCode, `%${filters.protocol}%`),
        ilike(mqProtocols.protocolName, `%${filters.protocol}%`),
      ),
    );
  }

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqDiscoveryJobs)
    .leftJoin(mqEntities, eq(mqDiscoveryJobs.entityId, mqEntities.id))
    .leftJoin(mqProtocols, eq(mqDiscoveryJobs.protocolId, mqProtocols.id))
    .where(where);
  const rows = await db
    .select({ job: mqDiscoveryJobs, entity: mqEntities, protocol: mqProtocols })
    .from(mqDiscoveryJobs)
    .leftJoin(mqEntities, eq(mqDiscoveryJobs.entityId, mqEntities.id))
    .leftJoin(mqProtocols, eq(mqDiscoveryJobs.protocolId, mqProtocols.id))
    .where(where)
    .orderBy(discoveryJobOrderBy(filters.sort), desc(mqDiscoveryJobs.id))
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

export async function getDiscoveryJob(id: number) {
  const [job] = await getDb().select().from(mqDiscoveryJobs).where(eq(mqDiscoveryJobs.id, id)).limit(1);
  return job ?? null;
}

export async function getDiscoveryJobDetail(id: number) {
  const db = getDb();
  const [job] = await db.select().from(mqDiscoveryJobs).where(eq(mqDiscoveryJobs.id, id)).limit(1);

  if (!job) {
    return null;
  }

  const [candidates, sourceJobs] = await Promise.all([
    db.select().from(mqAddressCandidates).where(eq(mqAddressCandidates.discoveryJobId, id)).orderBy(desc(mqAddressCandidates.createdAt)),
    db
      .select()
      .from(mqSourceJobs)
      .where(sql`${mqSourceJobs.metadata}->>'discoveryJobId' = ${String(id)}`)
      .orderBy(desc(mqSourceJobs.createdAt)),
  ]);

  const candidateIds = candidates.map((candidate) => candidate.id);
  const sourceJobIds = sourceJobs.map((sourceJob) => sourceJob.id);
  const [evidence, documents] = await Promise.all([
    candidateIds.length
      ? db
          .select()
          .from(mqAddressEvidence)
          .where(inArray(mqAddressEvidence.candidateId, candidateIds))
          .orderBy(desc(mqAddressEvidence.createdAt))
      : Promise.resolve([]),
    sourceJobIds.length
      ? db
          .select()
          .from(mqSourceDocuments)
          .where(inArray(mqSourceDocuments.sourceJobId, sourceJobIds))
          .orderBy(desc(mqSourceDocuments.createdAt))
      : Promise.resolve([]),
  ]);

  return {
    job,
    sourceJobs,
    documents,
    candidates,
    evidence,
    ...buildDiscoveryJobDetailRollup({
      logs: job.logs ?? [],
      candidates,
      evidence,
    }),
  };
}

export async function createDiscoveryJob(input: unknown) {
  const actor = await assertPermission("discovery:create");
  const parsed = discoveryJobSchema.parse(input);
  const config = parseDiscoveryConfigJson(parsed.discoveryType, parsed.configJson);
  const template = getDiscoveryTemplate(parsed.discoveryType);
  const templateSummary = discoveryTemplateSummary(parsed.discoveryType);
  const chainCode = parsed.chainCode || template?.defaultChain;
  const jobConfig = attachDiscoveryRunnerTask({
    discoveryType: parsed.discoveryType,
    chainCode,
    seedAddress: parsed.seedAddress,
    config,
  });

  const db = getDb();

  return db.transaction(async (tx) => {
    const [job] = await tx
      .insert(mqDiscoveryJobs)
      .values({
        discoveryType: parsed.discoveryType,
        chainCode,
        seedAddress: parsed.seedAddress,
        entityId: optionalConfigId(config, "entity_id"),
        protocolId: optionalConfigId(config, "protocol_id"),
        config: jobConfig,
        status: "draft",
        createdBy: actor.id,
        logs: [
          `template=${templateSummary.rootType} evidence=${templateSummary.evidenceType}`,
          "runner_task=mqchain-discovery-task-v1",
          "Scanner execution is external; completing a job only stages candidates and evidence.",
        ],
      })
      .returning();

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "discovery_job_created",
      targetTable: "mq_discovery_jobs",
      targetId: String(job.id),
      payload: buildDiscoveryJobCreatedAuditPayload({
        discoveryJobId: job.id,
        discoveryType: job.discoveryType,
        chainCode: job.chainCode,
        seedAddress: job.seedAddress,
        entityId: job.entityId,
        protocolId: job.protocolId,
        config: jobConfig,
      }),
    });

    return job;
  });
}

export async function createDiscoveryJobFromRegistry(input: unknown) {
  const actor = await assertPermission("discovery:create");
  const parsed = registryDiscoveryJobSchema.parse(input);
  const baseConfig = parseDiscoveryConfigJson(parsed.discoveryType, parsed.configJson);
  const templateSummary = discoveryTemplateSummary(parsed.discoveryType);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [registryRow] = await tx
      .select({
        registry: mqAddressRegistry,
        roleCode: mqKvRoleDict.roleCode,
      })
      .from(mqAddressRegistry)
      .leftJoin(mqKvRoleDict, eq(mqAddressRegistry.roleId, mqKvRoleDict.roleId))
      .where(eq(mqAddressRegistry.id, parsed.registryId))
      .limit(1);

    if (!registryRow) {
      throw new Error("Registry row not found.");
    }

    const registry = registryRow.registry;
    const config = {
      ...baseConfig,
      entity_id: registry.entityId,
      protocol_id: registry.protocolId,
      registry_id: registry.id,
      registry_role_id: registry.roleId,
      registry_role_code: registryRow.roleCode,
      registry_confidence_score: registry.confidenceScore,
      registry_quality_tier: registry.qualityTier,
      registry_flags: registry.flags,
      source: "registry_detail_action",
    };
    const jobConfig = attachDiscoveryRunnerTask({
      discoveryType: parsed.discoveryType,
      chainCode: registry.chainCode,
      seedAddress: registry.rawAddress || registry.normalizedAddress,
      config,
    });

    const [job] = await tx
      .insert(mqDiscoveryJobs)
      .values({
        discoveryType: parsed.discoveryType,
        chainCode: registry.chainCode,
        seedAddress: registry.rawAddress || registry.normalizedAddress,
        entityId: registry.entityId,
        protocolId: registry.protocolId,
        config: jobConfig,
        status: "draft",
        createdBy: actor.id,
        logs: [
          `seeded_from_registry=${registry.id}`,
          `template=${templateSummary.rootType} evidence=${templateSummary.evidenceType}`,
          "runner_task=mqchain-discovery-task-v1",
          "Discovery is a feedback loop from approved truth to staged candidates only.",
        ],
      })
      .returning();

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "registry_discovery_job_created",
      targetTable: "mq_discovery_jobs",
      targetId: String(job.id),
      payload: buildDiscoveryJobCreatedAuditPayload({
        discoveryJobId: job.id,
        discoveryType: job.discoveryType,
        chainCode: job.chainCode,
        seedAddress: job.seedAddress,
        seededFromRegistryId: registry.id,
        entityId: job.entityId,
        protocolId: job.protocolId,
        config: jobConfig,
      }),
    });

    return job;
  });
}

function cleanKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function optionalConfigId(config: Record<string, unknown>, key: "entity_id" | "protocol_id") {
  const value = config[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

export async function completeDiscoveryJob(input: unknown) {
  const actor = await assertPermission("discovery:create");
  const parsed = discoveryResultsSchema.parse(input);
  const results = parseDiscoveryResultsJson(parsed.resultsJson);
  const dictionaries = await getDictionaryMaps();
  const db = getDb();

  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(mqDiscoveryJobs).where(eq(mqDiscoveryJobs.id, parsed.jobId)).limit(1);

    if (!job) {
      throw new Error("Discovery job not found.");
    }

    const runnerTask = job.config?.runner_task ?? null;

    const [sourceJob] = await tx
      .insert(mqSourceJobs)
      .values({
        sourceType: "onchain_discovery",
        sourceName: `Discovery job ${job.id}: ${job.discoveryType}`,
        sourceUrl: job.seedAddress ?? null,
        chainScope: job.chainCode ? [job.chainCode] : null,
        status: "candidate_created",
        parserVersion: PARSER_VERSION,
        submittedBy: actor.id,
        metadata: {
          discoveryJobId: job.id,
          discoveryType: job.discoveryType,
          seedAddress: job.seedAddress,
          config: job.config,
          runnerTask,
        },
      })
      .returning();

    const [document] = await tx
      .insert(mqSourceDocuments)
      .values({
        sourceJobId: sourceJob.id,
        documentType: "json",
        originalName: `discovery-job-${job.id}-results.json`,
        storageUri: `postgres://mq_discovery_jobs/${job.id}/results`,
        contentHash: hashText(parsed.resultsJson),
        mimeType: "application/json",
        sizeBytes: Buffer.byteLength(parsed.resultsJson),
        extractedText: parsed.resultsJson.slice(0, 200000),
        metadata: {
          discoveryJobId: job.id,
          discoveryType: job.discoveryType,
          runnerTask,
        },
      })
      .returning();

    let candidatesCreated = 0;
    let evidenceCreated = 0;
    let invalidRows = 0;
    let duplicates = 0;
    const logs: string[] = [...(job.logs ?? [])];
    const seen = new Set<string>();
    const candidateIds: number[] = [];
    const evidenceIds: number[] = [];

    for (const [index, result] of results.entries()) {
      const normalized = normalizeAddress(result.address, result.chain || job.chainCode);

      if (!normalized.isValid || !normalized.chainCode) {
        invalidRows += 1;
        logs.push(`row ${index + 1}: ${normalized.error ?? "missing_chain_code"}`);
        continue;
      }

      const duplicateKey = `${normalized.chainCode}:${normalized.normalizedAddress}`;
      if (seen.has(duplicateKey)) {
        duplicates += 1;
        logs.push(`row ${index + 1}: duplicate_in_result_set`);
        continue;
      }
      seen.add(duplicateKey);

      const existing = await tx
        .select({ id: mqAddressCandidates.id })
        .from(mqAddressCandidates)
        .where(
          and(
            eq(mqAddressCandidates.normalizedAddress, normalized.normalizedAddress),
            eq(mqAddressCandidates.chainCode, normalized.chainCode),
          ),
        )
        .limit(1);

      const entity = dictionaries.entityByKey.get(cleanKey(result.entity));
      const protocol = dictionaries.protocolByKey.get(cleanKey(result.protocol));
      const roleHint = result.role || defaultRoleForProtocolRootType(result.root_type);
      const role = dictionaries.roleByKey.get(cleanKey(roleHint));
      const candidateStatus = existing.length ? "duplicate" : "pending_review";
      if (existing.length) {
        duplicates += 1;
      }

      const [candidate] = await tx
        .insert(mqAddressCandidates)
        .values({
          sourceJobId: sourceJob.id,
          sourceDocumentId: document.id,
          rawAddress: result.address,
          normalizedAddress: normalized.normalizedAddress,
          chainCode: normalized.chainCode,
          addressFamily: normalized.addressFamily,
          prefixCode: normalized.prefixCode,
          payloadHex: normalized.payloadHex,
          entityHint: result.entity,
          protocolHint: result.protocol,
          roleHint,
          suggestedEntityId: entity?.id,
          suggestedProtocolId: protocol?.id,
          suggestedRoleId: role?.roleId,
          confidenceScore: result.confidence ?? 40,
          qualityTier: result.quality_tier ?? 1,
          candidateStatus,
          duplicateOfCandidateId: existing[0]?.id,
          discoveredBy: job.discoveryType,
          discoveryJobId: job.id,
          evidenceCount: 1,
          firstSeenBlock: optionalNumber(result.first_seen_block),
          lastSeenBlock: optionalNumber(result.last_seen_block),
          metadata: {
            discoveryJobId: job.id,
            discoveryType: job.discoveryType,
            resultIndex: index + 1,
            protocolRootType: result.root_type ?? null,
          },
        })
        .returning();
      candidateIds.push(candidate.id);

      const evidencePayload = {
        discoveryJobId: job.id,
        discoveryType: job.discoveryType,
        runnerTaskVersion:
          runnerTask && typeof runnerTask === "object" && "task_version" in runnerTask ? runnerTask.task_version : null,
        result,
        normalized,
        protocolRootType: result.root_type ?? null,
        roleHint,
        payload: result.payload ?? {},
      };

      const [evidence] = await tx
        .insert(mqAddressEvidence)
        .values({
          candidateId: candidate.id,
          sourceDocumentId: document.id,
          evidenceType: result.evidence_type || defaultEvidenceTypeForDiscovery(job.discoveryType),
          sourceUrl: result.source_url || job.seedAddress,
          evidenceHash: hashJson(evidencePayload),
          trustTier: "inferred",
          confidenceDelta: 0,
          summary: result.summary || `Discovered by ${job.discoveryType}`,
          payload: evidencePayload,
          createdBy: actor.id,
        })
        .returning({ id: mqAddressEvidence.id });
      if (evidence) evidenceIds.push(evidence.id);

      candidatesCreated += 1;
      evidenceCreated += 1;
    }

    const [updatedJob] = await tx
      .update(mqDiscoveryJobs)
      .set({
        status: invalidRows && !candidatesCreated ? "failed" : "completed",
        candidatesCreated,
        evidenceCreated,
        logs: [
          ...logs,
          `completed: rows=${results.length} candidates=${candidatesCreated} evidence=${evidenceCreated} invalid=${invalidRows} duplicates=${duplicates}`,
        ],
        updatedAt: new Date(),
      })
      .where(eq(mqDiscoveryJobs.id, job.id))
      .returning();

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "discovery_job_completed",
      targetTable: "mq_discovery_jobs",
      targetId: String(job.id),
      payload: buildDiscoveryJobCompletedAuditPayload({
        discoveryJobId: job.id,
        discoveryType: job.discoveryType,
        status: updatedJob.status,
        sourceJobId: sourceJob.id,
        sourceDocumentId: document.id,
        rows: results.length,
        candidatesCreated,
        evidenceCreated,
        invalidRows,
        duplicates,
        candidateIds,
        evidenceIds,
        config: job.config ?? {},
      }),
    });

    return {
      job: updatedJob,
      sourceJobId: sourceJob.id,
      sourceDocumentId: document.id,
      rows: results.length,
      candidatesCreated,
      evidenceCreated,
      invalidRows,
      duplicates,
    };
  });
}
