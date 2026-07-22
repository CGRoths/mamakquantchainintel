import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import Papa from "papaparse";

import { getDb } from "@/db/client";
import {
  mqWorkflowAddressCandidates,
  mqWorkflowAddressEvidence,
  mqRegistryAddressLabels,
  mqWorkflowApprovalEvents,
  mqAuditEvents,
  mqDictCategories,
  mqWorkflowDiscoveryJobs,
  mqDictEntities,
  mqDictRoles,
  mqDictProtocols,
  mqWorkflowSourceDocuments,
  mqWorkflowSourceJobs,
  mqWorkflowSourceVerifications,
  mqUsers,
} from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";
import { normalizeAddress } from "../address/normalize";
import { buildCandidateSourceVerificationContext } from "../candidate-detail";
import { PARSER_VERSION, QUALITY_TIER_MAX, QUALITY_TIER_MIN } from "../constants";
import { extractAddressRowsFromText, extractDeploymentRowsFromText, parseJsonEvidenceRows, stripHtmlToText } from "../intake-extraction";
import { parseCandidateListFilters, type CandidateListFilters } from "../list-filters";
import { buildSourceJobIntakeAuditPayload, buildSourceJobScopeSummary, type SourceJobScopeInput } from "../source-job";
import { fetchSourceText } from "../source-url";
import { defaultEvidenceTrustTierForSource, normalizeEvidenceTrustTier } from "../trust";
import type { CsvIntakeRow } from "../types";
import type { NormalizedAddress } from "../types";
import {
  aiCleanedCsvIntakeSchema,
  csvIntakeSchema,
  deploymentSourceIntakeSchema,
  jsonEvidenceIntakeSchema,
  manualIntakeSchema,
  urlIntakeSchema,
} from "../validators/intake";
import { hashJson, hashText, optionalNumber } from "./service-utils";
import { getDictionaryMaps } from "./dictionary-service";

export type IntakeSummary = {
  sourceJobId: number;
  totalRows: number;
  validAddresses: number;
  invalidAddresses: number;
  duplicates: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  evidenceCreated: number;
  conflictsFound: number;
  errors: string[];
};

export type PreparedCsvIntakeRow = CsvIntakeRow & {
  preflightNormalization?: NormalizedAddress;
  preflightResolution?: {
    entityId: number | null;
    protocolId: number | null;
    roleId: number | null;
    roleCode: string | null;
    componentId?: number | null;
    categoryId?: number | null;
  };
};

function cleanKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function parseCsv(csvText: string): CsvIntakeRow[] {
  const parsed = Papa.parse<CsvIntakeRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  if (parsed.errors.length) {
    throw new Error(parsed.errors.map((error) => error.message).join("; "));
  }

  return parsed.data;
}

function evidenceTypeForSource(sourceType: string) {
  if (sourceType === "manual_input") return "manual_note";
  if (sourceType === "official_url") return "official_page";
  if (sourceType === "github") return "github_deployment";
  if (sourceType === "pdf") return "proof_of_reserve";
  if (sourceType === "explorer") return "etherscan_verified_contract";
  if (sourceType === "llm_cleaned_csv") return "llm_analysis";
  if (sourceType === "json_evidence") return "manual_note";
  if (sourceType === "onchain_discovery") return "onchain_discovery";
  return "official_csv";
}

function discoveredByForSource(sourceType: string) {
  if (sourceType === "csv_upload") return "csv";
  if (sourceType === "llm_cleaned_csv") return "llm";
  if (sourceType === "official_url") return "url";
  if (sourceType === "github") return "github";
  if (sourceType === "pdf") return "pdf";
  if (sourceType === "json_evidence") return "json";
  return "manual";
}

function mimeTypeForDocument(documentType: string) {
  if (documentType === "csv") return "text/csv";
  if (documentType === "json") return "application/json";
  if (documentType === "html_snapshot") return "text/html";
  if (documentType === "github_file") return "text/plain";
  if (documentType === "pdf") return "application/pdf";
  return "text/plain";
}

async function resolveHints(row: CsvIntakeRow, fallback: { entityHint?: string; protocolHint?: string; roleHint?: string }) {
  const dictionaries = await getDictionaryMaps();
  const entity = dictionaries.entityByKey.get(cleanKey(row.entity || fallback.entityHint));
  const protocol = dictionaries.protocolByKey.get(cleanKey(row.protocol || fallback.protocolHint));
  const role = dictionaries.roleByKey.get(cleanKey(row.role || fallback.roleHint));

  return { entity, protocol, role };
}

export async function createManualIntake(formInput: unknown): Promise<IntakeSummary> {
  const input = manualIntakeSchema.parse(formInput);
  const rows = input.addresses
    .split(/\r?\n/)
    .map((address) => address.trim())
    .filter(Boolean)
    .map<CsvIntakeRow>((address) => ({
      address,
      chain: input.chainCode,
      entity: input.entityHint,
      protocol: input.protocolHint,
      role: input.roleHint,
      source_url: input.sourceUrl,
      source_name: input.sourceName,
      confidence: input.confidenceScore,
      quality_tier: input.qualityTier,
      notes: input.notes,
    }));

  return createCandidatesFromRows(rows, {
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl || null,
    entityHint: input.entityHint,
    protocolHint: input.protocolHint,
    documentType: "manual_note",
    originalName: `${input.sourceName}.txt`,
    rawText: input.addresses,
  });
}

export async function createCsvIntake(formInput: unknown): Promise<IntakeSummary> {
  const input = csvIntakeSchema.parse(formInput);
  const rows = parseCsv(input.csvText);

  return createCandidatesFromRows(rows, {
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl || null,
    entityHint: input.entityHint,
    protocolHint: input.protocolHint,
    documentType: "csv",
    originalName: input.localFileName || `${input.sourceName}.csv`,
    localFileName: input.localFileName,
    rawText: input.csvText,
    metadata: {
      csvInputMode: input.csvInputMode ?? "pasted_text",
      uploadMimeType: input.uploadMimeType,
      uploadSizeBytes: input.uploadSizeBytes,
    },
  });
}

export async function createAiCleanedCsvIntake(formInput: unknown): Promise<IntakeSummary> {
  const input = aiCleanedCsvIntakeSchema.parse(formInput);
  const rows = parseCsv(input.csvText);

  return createCandidatesFromRows(rows, {
    sourceType: "llm_cleaned_csv",
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl || null,
    entityHint: input.entityHint,
    protocolHint: input.protocolHint,
    documentType: "csv",
    originalName: input.localFileName || `${input.sourceName}.ai-cleaned.csv`,
    localFileName: input.localFileName,
    rawText: input.csvText,
    metadata: {
      csvInputMode: input.csvInputMode ?? "pasted_text",
      uploadMimeType: input.uploadMimeType,
      uploadSizeBytes: input.uploadSizeBytes,
    },
  });
}

export async function createUrlIntake(formInput: unknown): Promise<IntakeSummary> {
  const input = urlIntakeSchema.parse(formInput);
  const { rawText: rawSnapshot, contentType, fetchedUrl } = await fetchSourceText(input.sourceUrl);
  const extractedText = contentType.includes("html") ? stripHtmlToText(rawSnapshot) : rawSnapshot;
  const rows = extractAddressRowsFromText(extractedText, {
    chainCode: input.chainCode,
    entityHint: input.entityHint,
    protocolHint: input.protocolHint,
    roleHint: input.roleHint,
    sourceUrl: input.sourceUrl,
    sourceName: input.sourceName,
    confidenceScore: input.confidenceScore,
    qualityTier: input.qualityTier,
    notes: input.notes,
  });

  return createCandidatesFromRows(rows, {
    sourceType: "official_url",
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl,
    entityHint: input.entityHint,
    protocolHint: input.protocolHint,
    documentType: contentType.includes("html") ? "html_snapshot" : "url_text_snapshot",
    originalName: input.sourceUrl,
    rawText: rawSnapshot,
    metadata: {
      contentType,
      fetchedUrl,
      extractedAddressRows: rows.length,
      notes: input.notes,
    },
  });
}

export async function createDeploymentSourceIntake(formInput: unknown): Promise<IntakeSummary> {
  const input = deploymentSourceIntakeSchema.parse(formInput);
  const fetched = input.sourceUrl && !input.sourceText ? await fetchSourceText(input.sourceUrl) : null;
  const rawText = input.sourceText || fetched?.rawText || "";
  const sourceUrl = input.sourceUrl || null;
  const rows = extractDeploymentRowsFromText(rawText, {
    sourceType: input.sourceType,
    sourceUrl: sourceUrl ?? undefined,
    sourceName: input.sourceName,
    chainCode: input.chainCode,
    entityHint: input.entityHint,
    protocolHint: input.protocolHint,
    roleHint: input.roleHint,
    confidenceScore: input.confidenceScore,
    qualityTier: input.qualityTier,
    notes: input.notes,
  });

  const documentType = input.sourceType === "github" ? "github_file" : input.sourceType === "pdf" ? "pdf" : fetched?.contentType.includes("html") ? "html_snapshot" : "deployment_text";

  return createCandidatesFromRows(rows, {
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    sourceUrl,
    entityHint: input.entityHint,
    protocolHint: input.protocolHint,
    documentType,
    originalName: sourceUrl ?? `${input.sourceName}.txt`,
    rawText,
    metadata: {
      contentType: fetched?.contentType ?? (input.sourceType === "pdf" ? "application/pdf+extracted-text" : "text/plain"),
      fetchedUrl: fetched?.fetchedUrl,
      ...(fetched?.metadata ?? {}),
      extractedAddressRows: rows.length,
      deploymentExtraction: true,
      notes: input.notes,
    },
  });
}

export async function createJsonEvidenceIntake(formInput: unknown): Promise<IntakeSummary> {
  const input = jsonEvidenceIntakeSchema.parse(formInput);
  const rows = parseJsonEvidenceRows(input.jsonText, {
    chainCode: input.chainCode,
    entityHint: input.entityHint,
    protocolHint: input.protocolHint,
    roleHint: input.roleHint,
    sourceUrl: input.sourceUrl,
    sourceName: input.sourceName,
    confidenceScore: input.confidenceScore,
    qualityTier: input.qualityTier,
    notes: input.notes,
  });

  return createCandidatesFromRows(rows, {
    sourceType: "json_evidence",
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl || null,
    entityHint: input.entityHint,
    protocolHint: input.protocolHint,
    documentType: "json",
    originalName: `${input.sourceName}.json`,
    rawText: input.jsonText,
    metadata: {
      extractedAddressRows: rows.length,
      notes: input.notes,
    },
  });
}

export async function createCandidatesFromRows(
  rows: PreparedCsvIntakeRow[],
  source: {
    sourceType: string;
    sourceName: string;
    sourceUrl: string | null;
    entityHint?: string;
    protocolHint?: string;
    documentType: string;
    originalName: string;
    localFileName?: string;
    rawText: string;
    metadata?: Record<string, unknown>;
  },
): Promise<IntakeSummary> {
  const user = await assertPermission("intake:create");
  const db = getDb();
  const seen = new Set<string>();
  const errors: string[] = [];
  let validAddresses = 0;
  let invalidAddresses = 0;
  let duplicates = 0;
  let candidatesCreated = 0;
  let evidenceCreated = 0;
  const conflictsFound = 0;
  const sourceScopeRows: SourceJobScopeInput[] = [];

  const result = await db.transaction(async (tx) => {
    const [sourceJob] = await tx
      .insert(mqWorkflowSourceJobs)
      .values({
        sourceType: source.sourceType,
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl,
        localFileName: source.localFileName,
        entityHint: source.entityHint,
        protocolHint: source.protocolHint,
        status: "normalized",
        parserVersion: PARSER_VERSION,
        submittedBy: user?.id,
        metadata: { intakeMode: source.documentType, localFileName: source.localFileName, ...(source.metadata ?? {}) },
      })
      .returning();

    const [document] = await tx
      .insert(mqWorkflowSourceDocuments)
      .values({
        sourceJobId: sourceJob.id,
        documentType: source.documentType,
        originalName: source.originalName,
        storageUri: `postgres://mq_workflow_source_documents/${sourceJob.id}`,
        contentHash: hashText(source.rawText),
        mimeType: mimeTypeForDocument(source.documentType),
        sizeBytes: Buffer.byteLength(source.rawText),
        extractedText: source.rawText.slice(0, 200000),
        metadata: { sourceName: source.sourceName, sourceUrl: source.sourceUrl, localFileName: source.localFileName, ...(source.metadata ?? {}) },
      })
      .returning();

    for (const [rowIndex, row] of rows.entries()) {
      const rawAddress = row.address ?? "";
      const normalized = row.preflightNormalization ?? normalizeAddress(rawAddress, row.chain);

      if (!normalized.isValid) {
        invalidAddresses += 1;
        errors.push(`row ${rowIndex + 1}: ${normalized.error}`);
        continue;
      }

      if (!normalized.chainCode) {
        invalidAddresses += 1;
        errors.push(`row ${rowIndex + 1}: missing_chain_code`);
        continue;
      }

      validAddresses += 1;
      const duplicateKey = `${normalized.chainCode}:${normalized.normalizedAddress}`;
      if (seen.has(duplicateKey)) {
        duplicates += 1;
        continue;
      }
      seen.add(duplicateKey);

      const existing = await tx
        .select({ id: mqWorkflowAddressCandidates.id })
        .from(mqWorkflowAddressCandidates)
        .where(
            and(
              eq(mqWorkflowAddressCandidates.normalizedAddress, normalized.normalizedAddress),
            eq(mqWorkflowAddressCandidates.chainCode, normalized.chainCode),
          ),
        )
        .limit(1);

      const hints = row.preflightResolution ? null : await resolveHints(row, {
        entityHint: source.entityHint,
        protocolHint: source.protocolHint,
        roleHint: row.role,
      });
      const suggestedEntityId = row.preflightResolution?.entityId ?? hints?.entity?.id;
      const suggestedProtocolId = row.preflightResolution?.protocolId ?? hints?.protocol?.id;
      const suggestedRoleId = row.preflightResolution?.roleId ?? hints?.role?.roleId;
      const suggestedRoleCode = row.preflightResolution?.roleCode ?? hints?.role?.roleCode;
      const suggestedComponentId = row.preflightResolution?.componentId ?? null;
      const suggestedCategoryId = row.preflightResolution?.categoryId ?? null;

      const confidenceScore = Math.max(0, Math.min(100, Number(row.confidence ?? 50) || 50));
      const qualityTier = Math.max(QUALITY_TIER_MIN, Math.min(QUALITY_TIER_MAX, Number(row.quality_tier ?? 1) || 1));
      const candidateStatus = existing.length ? "duplicate" : "pending_review";
      if (existing.length) {
        duplicates += 1;
      }

      const [candidate] = await tx
        .insert(mqWorkflowAddressCandidates)
        .values({
          sourceJobId: sourceJob.id,
          sourceDocumentId: document.id,
          rawAddress,
          normalizedAddress: normalized.normalizedAddress,
          chainCode: normalized.chainCode,
          addressFamily: normalized.addressFamily,
          prefixCode: normalized.prefixCode,
          namespaceId: normalized.namespaceId,
          addressCodecId: normalized.addressCodecId,
          payloadHex: normalized.payloadHex,
          entityHint: row.entity || source.entityHint,
          protocolHint: row.protocol || source.protocolHint,
          roleHint: row.role,
          suggestedEntityId,
          suggestedProtocolId,
          suggestedRoleId,
          suggestedComponentId,
          confidenceScore,
          qualityTier,
          candidateStatus,
          duplicateOfCandidateId: existing[0]?.id,
          discoveredBy: discoveredByForSource(source.sourceType),
          evidenceCount: 1,
          firstSeenBlock: optionalNumber(row.first_seen_block),
          lastSeenBlock: optionalNumber(row.last_seen_block),
          metadata: {
            rowIndex: rowIndex + 1,
            sourceSheet: row.source_sheet,
            sourceRow: optionalNumber(row.source_row),
            sourceUrl: row.source_url || source.sourceUrl,
            sourceSection: row.source_section,
            sourceDocumentHash: row.source_document_hash,
            retrievedAt: row.retrieved_at,
            dictionaryVersion: row.dictionary_version,
            normalizationStatus: row.normalization_status,
            identifierKind: row.identifier_kind,
            componentHint: row.component,
            suggestedCategoryId,
            tagHints: row.tags,
            notes: row.notes,
            metricEligible: row.metric_eligible,
            normalizerError: normalized.error,
            sourceInputType: row.source_input_type,
            contractName: row.contract_name,
            roleSource: row.role_source,
            source_role_label: row.source_role_label ?? row.role_source ?? row.role,
            source_role_labels:
              row.source_role_labels ?? (row.source_role_label ?? row.role_source ?? row.role ? [row.source_role_label ?? row.role_source ?? row.role] : undefined),
            rawReference: row.raw_reference,
            rawRow: row.raw_row,
            sourceEvidence: {
              sourceName: row.source_name || source.sourceName,
              sourceUrl: row.source_url || source.sourceUrl,
              sourceSheet: row.source_sheet,
              sourceRow: optionalNumber(row.source_row),
              sourceSection: row.source_section,
              sourceDocumentHash: row.source_document_hash,
              retrievedAt: row.retrieved_at,
            },
            normalization: {
              schemaVersion: row.schema_version,
              dictionaryVersion: row.dictionary_version,
              status: row.normalization_status,
            },
          },
        })
        .returning();

      const evidencePayload = {
        row,
        normalized,
        sourceName: source.sourceName,
        notes: row.notes,
        source_role_label: row.source_role_label ?? row.role_source ?? row.role,
        source_role_labels:
          row.source_role_labels ?? (row.source_role_label ?? row.role_source ?? row.role ? [row.source_role_label ?? row.role_source ?? row.role] : undefined),
        rawReference: row.raw_reference,
      };

      await tx.insert(mqWorkflowAddressEvidence).values({
        candidateId: candidate.id,
        sourceDocumentId: document.id,
        evidenceType: row.evidence_type || evidenceTypeForSource(source.sourceType),
        sourceUrl: row.source_url || source.sourceUrl,
        evidenceHash: hashJson(evidencePayload),
        trustTier: normalizeEvidenceTrustTier(row.trust_tier, defaultEvidenceTrustTierForSource(source.sourceType)),
        confidenceDelta: 0,
        summary: row.notes || `Imported from ${source.sourceName}`,
        payload: evidencePayload,
        createdBy: user?.id,
      });

      candidatesCreated += 1;
      evidenceCreated += 1;
      sourceScopeRows.push({
        chainCode: normalized.chainCode,
        roleHint: row.role,
        suggestedRoleCode,
      });
    }

    const sourceScope = buildSourceJobScopeSummary(sourceScopeRows);
    const finalStatus = candidatesCreated ? "candidate_created" : "failed";
    const summaryMetadata = {
      intakeMode: source.documentType,
      localFileName: source.localFileName,
      ...(source.metadata ?? {}),
      chainScope: sourceScope.chainScope,
      expectedRoles: sourceScope.expectedRoles,
      totalRows: rows.length,
      validAddresses,
      invalidAddresses,
      duplicates,
      candidatesCreated,
      candidatesUpdated: 0,
      evidenceCreated,
      conflictsFound,
      errors,
    };

    await tx
      .update(mqWorkflowSourceJobs)
      .set({
        status: finalStatus,
        chainScope: sourceScope.chainScope,
        expectedRoles: sourceScope.expectedRoles,
        metadata: summaryMetadata,
      })
      .where(eq(mqWorkflowSourceJobs.id, sourceJob.id));

    await tx.insert(mqAuditEvents).values({
      actorId: user.id,
      action: "source_job_intake_created",
      targetTable: "mq_workflow_source_jobs",
      targetId: String(sourceJob.id),
      payload: buildSourceJobIntakeAuditPayload({
        sourceJobId: sourceJob.id,
        sourceDocumentId: document.id,
        sourceType: source.sourceType,
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl,
        documentType: source.documentType,
        status: finalStatus,
        chainScope: sourceScope.chainScope,
        expectedRoles: sourceScope.expectedRoles,
        totalRows: rows.length,
        validAddresses,
        invalidAddresses,
        duplicates,
        candidatesCreated,
        candidatesUpdated: 0,
        evidenceCreated,
        conflictsFound,
        errors,
      }),
    });

    return sourceJob.id;
  });

  return {
    sourceJobId: result,
    totalRows: rows.length,
    validAddresses,
    invalidAddresses,
    duplicates,
    candidatesCreated,
    candidatesUpdated: 0,
    evidenceCreated,
    conflictsFound,
    errors,
  };
}

function candidateOrderBy(sort: CandidateListFilters["sort"]) {
  if (sort === "confidence") return desc(mqWorkflowAddressCandidates.confidenceScore);
  if (sort === "evidence_count") return desc(mqWorkflowAddressCandidates.evidenceCount);
  return desc(mqWorkflowAddressCandidates.createdAt);
}

function addCondition(conditions: SQL[], condition: SQL | undefined) {
  if (condition) conditions.push(condition);
}

async function buildCandidateSourceVerificationContextMap(
  tx: Pick<ReturnType<typeof getDb>, "select">,
  candidates: (typeof mqWorkflowAddressCandidates.$inferSelect)[],
) {
  const candidateIds = candidates.map((candidate) => candidate.id);
  if (!candidateIds.length) {
    return new Map<number, ReturnType<typeof buildCandidateSourceVerificationContext>>();
  }

  const sourceJobIds = Array.from(
    new Set(candidates.map((candidate) => candidate.sourceJobId).filter((id): id is number => typeof id === "number")),
  );
  const sourceDocumentIds = Array.from(
    new Set(candidates.map((candidate) => candidate.sourceDocumentId).filter((id): id is number => typeof id === "number")),
  );
  const verificationRowsById = new Map<number, typeof mqWorkflowSourceVerifications.$inferSelect>();
  const verificationQueries = [
    tx.select().from(mqWorkflowSourceVerifications).where(inArray(mqWorkflowSourceVerifications.candidateId, candidateIds)),
    sourceJobIds.length
      ? tx.select().from(mqWorkflowSourceVerifications).where(inArray(mqWorkflowSourceVerifications.sourceJobId, sourceJobIds))
      : Promise.resolve([]),
    sourceDocumentIds.length
      ? tx.select().from(mqWorkflowSourceVerifications).where(inArray(mqWorkflowSourceVerifications.sourceDocumentId, sourceDocumentIds))
      : Promise.resolve([]),
  ];

  for (const verifications of await Promise.all(verificationQueries)) {
    for (const verification of verifications) {
      verificationRowsById.set(verification.id, verification);
    }
  }

  const verificationRows = Array.from(verificationRowsById.values());
  return new Map(
    candidates.map((candidate) => [
      candidate.id,
      buildCandidateSourceVerificationContext({
        candidate: {
          id: candidate.id,
          sourceJobId: candidate.sourceJobId,
          sourceDocumentId: candidate.sourceDocumentId,
          metadata: candidate.metadata,
        },
        verifications: verificationRows.filter((verification) => {
          if (verification.candidateId === candidate.id) return true;
          if (candidate.sourceDocumentId && verification.sourceDocumentId === candidate.sourceDocumentId) return true;
          return Boolean(candidate.sourceJobId && verification.sourceJobId === candidate.sourceJobId);
        }),
      }),
    ]),
  );
}

export async function listCandidatesFromDatabase(input?: unknown) {
  const filters = parseCandidateListFilters(input ?? {});
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqWorkflowAddressCandidates.normalizedAddress, `%${filters.q}%`),
        ilike(mqWorkflowAddressCandidates.rawAddress, `%${filters.q}%`),
        ilike(mqWorkflowAddressCandidates.entityHint, `%${filters.q}%`),
        ilike(mqWorkflowAddressCandidates.protocolHint, `%${filters.q}%`),
        ilike(mqWorkflowAddressCandidates.roleHint, `%${filters.q}%`),
      ),
    );
  }

  if (filters.status) {
    conditions.push(eq(mqWorkflowAddressCandidates.candidateStatus, filters.status));
  }

  if (filters.chain) {
    conditions.push(eq(mqWorkflowAddressCandidates.chainCode, filters.chain));
  }

  if (filters.entity) {
    addCondition(
      conditions,
      or(
        ilike(mqWorkflowAddressCandidates.entityHint, `%${filters.entity}%`),
        ilike(mqDictEntities.entityCode, `%${filters.entity}%`),
        ilike(mqDictEntities.entityName, `%${filters.entity}%`),
      ),
    );
  }

  if (filters.protocol) {
    addCondition(
      conditions,
      or(
        ilike(mqWorkflowAddressCandidates.protocolHint, `%${filters.protocol}%`),
        ilike(mqDictProtocols.protocolCode, `%${filters.protocol}%`),
        ilike(mqDictProtocols.protocolName, `%${filters.protocol}%`),
      ),
    );
  }

  if (filters.role) {
    addCondition(
      conditions,
      or(
        ilike(mqWorkflowAddressCandidates.roleHint, `%${filters.role}%`),
        ilike(mqDictRoles.roleCode, `%${filters.role}%`),
        ilike(mqDictRoles.roleName, `%${filters.role}%`),
      ),
    );
  }

  if (filters.sourceType) {
    conditions.push(eq(mqWorkflowSourceJobs.sourceType, filters.sourceType));
  }

  if (filters.discoveryType) {
    conditions.push(eq(mqWorkflowAddressCandidates.discoveredBy, filters.discoveryType));
  }

  if (filters.conflicts === "true") {
    conditions.push(eq(mqWorkflowAddressCandidates.candidateStatus, "conflict_pending"));
  }

  if (filters.minConfidence !== undefined) {
    conditions.push(gte(mqWorkflowAddressCandidates.confidenceScore, filters.minConfidence));
  }

  if (filters.maxConfidence !== undefined) {
    conditions.push(lte(mqWorkflowAddressCandidates.confidenceScore, filters.maxConfidence));
  }

  if (filters.qualityTier !== undefined) {
    conditions.push(eq(mqWorkflowAddressCandidates.qualityTier, filters.qualityTier));
  }

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqWorkflowAddressCandidates)
    .leftJoin(mqDictEntities, eq(mqWorkflowAddressCandidates.suggestedEntityId, mqDictEntities.id))
    .leftJoin(mqDictProtocols, eq(mqWorkflowAddressCandidates.suggestedProtocolId, mqDictProtocols.id))
    .leftJoin(mqDictRoles, eq(mqWorkflowAddressCandidates.suggestedRoleId, mqDictRoles.roleId))
    .leftJoin(mqWorkflowSourceJobs, eq(mqWorkflowAddressCandidates.sourceJobId, mqWorkflowSourceJobs.id))
    .where(where);

  const rows = await db
    .select({
      candidate: mqWorkflowAddressCandidates,
      entityName: mqDictEntities.entityName,
      protocolName: mqDictProtocols.protocolName,
      roleCode: mqDictRoles.roleCode,
      sourceType: mqWorkflowSourceJobs.sourceType,
    })
    .from(mqWorkflowAddressCandidates)
    .leftJoin(mqDictEntities, eq(mqWorkflowAddressCandidates.suggestedEntityId, mqDictEntities.id))
    .leftJoin(mqDictProtocols, eq(mqWorkflowAddressCandidates.suggestedProtocolId, mqDictProtocols.id))
    .leftJoin(mqDictRoles, eq(mqWorkflowAddressCandidates.suggestedRoleId, mqDictRoles.roleId))
    .leftJoin(mqWorkflowSourceJobs, eq(mqWorkflowAddressCandidates.sourceJobId, mqWorkflowSourceJobs.id))
    .where(where)
    .orderBy(candidateOrderBy(filters.sort), asc(mqWorkflowAddressCandidates.id))
    .limit(filters.pageSize)
    .offset(offset);
  const sourceVerificationContextByCandidateId = await buildCandidateSourceVerificationContextMap(
    db,
    rows.map((row) => row.candidate),
  );

  return {
    rows: rows.map((row) => ({
      ...row,
      sourceVerificationContext: sourceVerificationContextByCandidateId.get(row.candidate.id) ?? null,
    })),
    filters,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}


export async function getCandidateDetail(id: number) {
  const db = getDb();
  const [candidate] = await db.select().from(mqWorkflowAddressCandidates).where(eq(mqWorkflowAddressCandidates.id, id)).limit(1);

  if (!candidate) {
    return null;
  }

  const registryMatchQuery = candidate.chainCode
    ? db
        .select({
          registry: mqRegistryAddressLabels,
          entity: mqDictEntities,
          protocol: mqDictProtocols,
          role: mqDictRoles,
          category: mqDictCategories,
        })
        .from(mqRegistryAddressLabels)
        .leftJoin(mqDictEntities, eq(mqRegistryAddressLabels.entityId, mqDictEntities.id))
        .leftJoin(mqDictProtocols, eq(mqRegistryAddressLabels.protocolId, mqDictProtocols.id))
        .leftJoin(mqDictRoles, eq(mqRegistryAddressLabels.roleId, mqDictRoles.roleId))
        .leftJoin(mqDictCategories, eq(mqDictCategories.categoryId, sql<number>`coalesce(${mqRegistryAddressLabels.categoryId}, ${mqDictRoles.categoryId})`))
        .where(and(eq(mqRegistryAddressLabels.normalizedAddress, candidate.normalizedAddress), eq(mqRegistryAddressLabels.chainCode, candidate.chainCode)))
        .orderBy(desc(mqRegistryAddressLabels.isActive), desc(mqRegistryAddressLabels.createdAt))
        .limit(20)
    : Promise.resolve([]);

  const sourceVerificationConditions: SQL[] = [eq(mqWorkflowSourceVerifications.candidateId, id)];
  if (candidate.sourceJobId) {
    sourceVerificationConditions.push(eq(mqWorkflowSourceVerifications.sourceJobId, candidate.sourceJobId));
  }
  if (candidate.sourceDocumentId) {
    sourceVerificationConditions.push(eq(mqWorkflowSourceVerifications.sourceDocumentId, candidate.sourceDocumentId));
  }

  const [evidence, dictionaries, sourceJob, sourceDocument, registryMatches, approvalEvents, duplicateOfCandidate, duplicateCandidates, discoveryJob, sourceVerifications] =
    await Promise.all([
    db.select().from(mqWorkflowAddressEvidence).where(eq(mqWorkflowAddressEvidence.candidateId, id)).orderBy(desc(mqWorkflowAddressEvidence.createdAt)),
    getDictionaryMaps(),
    candidate.sourceJobId
      ? db.select().from(mqWorkflowSourceJobs).where(eq(mqWorkflowSourceJobs.id, candidate.sourceJobId)).limit(1)
      : Promise.resolve([]),
    candidate.sourceDocumentId
      ? db.select().from(mqWorkflowSourceDocuments).where(eq(mqWorkflowSourceDocuments.id, candidate.sourceDocumentId)).limit(1)
      : Promise.resolve([]),
    registryMatchQuery,
    db.select().from(mqWorkflowApprovalEvents).where(eq(mqWorkflowApprovalEvents.candidateId, id)).orderBy(desc(mqWorkflowApprovalEvents.createdAt)).limit(50),
    candidate.duplicateOfCandidateId
      ? db.select().from(mqWorkflowAddressCandidates).where(eq(mqWorkflowAddressCandidates.id, candidate.duplicateOfCandidateId)).limit(1)
      : Promise.resolve([]),
    db
      .select()
      .from(mqWorkflowAddressCandidates)
      .where(eq(mqWorkflowAddressCandidates.duplicateOfCandidateId, id))
      .orderBy(desc(mqWorkflowAddressCandidates.createdAt))
      .limit(20),
    candidate.discoveryJobId
      ? db.select().from(mqWorkflowDiscoveryJobs).where(eq(mqWorkflowDiscoveryJobs.id, candidate.discoveryJobId)).limit(1)
      : Promise.resolve([]),
    db
      .select({
        verification: mqWorkflowSourceVerifications,
        verifierEmail: mqUsers.email,
        verifierName: mqUsers.displayName,
      })
      .from(mqWorkflowSourceVerifications)
      .leftJoin(mqUsers, eq(mqWorkflowSourceVerifications.verifiedBy, mqUsers.id))
      .where(or(...sourceVerificationConditions))
      .orderBy(desc(mqWorkflowSourceVerifications.createdAt))
      .limit(100),
  ]);

  return {
    candidate,
    evidence,
    dictionaries,
    sourceJob: sourceJob[0] ?? null,
    sourceDocument: sourceDocument[0] ?? null,
    registryMatches,
    approvalEvents,
    duplicateOfCandidate: duplicateOfCandidate[0] ?? null,
    duplicateCandidates,
    discoveryJob: discoveryJob[0] ?? null,
    sourceVerifications,
  };
}

export async function listApprovedCandidateIds() {
  return getDb()
    .select({ id: mqWorkflowAddressCandidates.id })
    .from(mqWorkflowAddressCandidates)
    .where(eq(mqWorkflowAddressCandidates.candidateStatus, "approved"))
    .orderBy(desc(mqWorkflowAddressCandidates.updatedAt))
    .limit(500);
}

export async function getCandidatesByIds(candidateIds: number[]) {
  if (!candidateIds.length) {
    return [];
  }

  return getDb().select().from(mqWorkflowAddressCandidates).where(inArray(mqWorkflowAddressCandidates.id, candidateIds));
}
