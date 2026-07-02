import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressCandidates,
  mqAddressEvidence,
  mqAddressRegistry,
  mqAuditLog,
  mqDiscoveryJobs,
  mqKvRoleDict,
  mqSourceDocuments,
  mqSourceJobs,
} from "@/db/schema";
import { assertPermission } from "@/lib/auth/permissions";
import { normalizeAddress } from "../address/normalize";
import { parseDiscoveryConfigJson, discoveryTemplateSummary } from "../discovery-config";
import { buildDiscoveryJobDetailRollup } from "../discovery-detail";
import { getDiscoveryTemplate } from "../discovery-templates";
import { defaultEvidenceTypeForDiscovery, parseDiscoveryResultsJson } from "../discovery";
import { PARSER_VERSION } from "../constants";
import { discoveryJobSchema, discoveryResultsSchema, registryDiscoveryJobSchema } from "../validators/discovery";
import { getDictionaryMaps } from "./dictionary-service";
import { hashJson, hashText, optionalNumber } from "./service-utils";

export async function listDiscoveryJobs(limit = 100) {
  return getDb().select().from(mqDiscoveryJobs).orderBy(desc(mqDiscoveryJobs.createdAt)).limit(limit);
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

  const [job] = await getDb()
    .insert(mqDiscoveryJobs)
    .values({
      discoveryType: parsed.discoveryType,
      chainCode,
      seedAddress: parsed.seedAddress,
      entityId: optionalConfigId(config, "entity_id"),
      protocolId: optionalConfigId(config, "protocol_id"),
      config,
      status: "draft",
      createdBy: actor.id,
      logs: [
        `template=${templateSummary.rootType} evidence=${templateSummary.evidenceType}`,
        "Scanner execution is external; completing a job only stages candidates and evidence.",
      ],
    })
    .returning();

  return job;
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

    const [job] = await tx
      .insert(mqDiscoveryJobs)
      .values({
        discoveryType: parsed.discoveryType,
        chainCode: registry.chainCode,
        seedAddress: registry.rawAddress || registry.normalizedAddress,
        entityId: registry.entityId,
        protocolId: registry.protocolId,
        config,
        status: "draft",
        createdBy: actor.id,
        logs: [
          `seeded_from_registry=${registry.id}`,
          `template=${templateSummary.rootType} evidence=${templateSummary.evidenceType}`,
          "Discovery is a feedback loop from approved truth to staged candidates only.",
        ],
      })
      .returning();

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "registry_discovery_job_created",
      targetTable: "mq_discovery_jobs",
      targetId: String(job.id),
      payload: {
        registryId: registry.id,
        discoveryType: parsed.discoveryType,
        chainCode: registry.chainCode,
        seedAddress: job.seedAddress,
        config,
      },
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
        },
      })
      .returning();

    let candidatesCreated = 0;
    let evidenceCreated = 0;
    let invalidRows = 0;
    let duplicates = 0;
    const logs: string[] = [...(job.logs ?? [])];
    const seen = new Set<string>();

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
      const role = dictionaries.roleByKey.get(cleanKey(result.role));
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
          roleHint: result.role,
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
          },
        })
        .returning();

      const evidencePayload = {
        discoveryJobId: job.id,
        discoveryType: job.discoveryType,
        result,
        normalized,
        payload: result.payload ?? {},
      };

      await tx.insert(mqAddressEvidence).values({
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
      });

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
      payload: {
        sourceJobId: sourceJob.id,
        sourceDocumentId: document.id,
        rows: results.length,
        candidatesCreated,
        evidenceCreated,
        invalidRows,
        duplicates,
      },
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
