import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";

import { preflightResearchCsv, type ResearchPreflightReport } from "../research-normalization";
import { researchCsvCreateSchema, researchCsvPreflightSchema } from "../validators/intake";
import { createCandidatesFromRows, type PreparedCsvIntakeRow } from "./candidate-service";
import { getResearchDictionarySnapshot } from "./dictionary-service";

export class ResearchIntakeError extends Error {
  constructor(
    readonly status: 400 | 409,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ResearchIntakeError";
  }
}

async function buildPreflight(input: ReturnType<typeof researchCsvPreflightSchema.parse>) {
  const dictionary = await getResearchDictionarySnapshot();
  return preflightResearchCsv({ csvText: input.csvText, sourceUrl: input.sourceUrl, dictionary });
}

export async function preflightResearchIntake(input: unknown): Promise<ResearchPreflightReport> {
  await assertPermission("intake:create");
  return buildPreflight(researchCsvPreflightSchema.parse(input));
}

export async function createResearchIntake(input: unknown) {
  await assertPermission("intake:create");
  const parsed = researchCsvCreateSchema.parse(input);
  const dictionary = await getResearchDictionarySnapshot();
  const report = preflightResearchCsv({ csvText: parsed.csvText, sourceUrl: parsed.sourceUrl, dictionary });

  if (parsed.expectedDictionaryVersion !== report.dictionaryVersion) {
    throw new ResearchIntakeError(409, "dictionary_version_changed", "Dictionary state changed after preflight. Run preflight again.", {
      expectedDictionaryVersion: parsed.expectedDictionaryVersion,
      actualDictionaryVersion: report.dictionaryVersion,
    });
  }
  if (parsed.preflightHash !== report.preflightHash) {
    throw new ResearchIntakeError(409, "preflight_hash_mismatch", "CSV content or deterministic preflight output changed. Run preflight again.");
  }
  if (!report.canCreateSourceJob) {
    throw new ResearchIntakeError(400, "preflight_blocked", "Preflight contains hard blockers.", {
      blockers: report.blockers,
      counts: report.counts,
    });
  }

  const entities = new Map(dictionary.entities.map(item => [item.id, item]));
  const protocols = new Map(dictionary.protocols.map(item => [item.id, item]));
  const roles = new Map(dictionary.roles.map(item => [item.id, item]));
  const accepted = report.records.filter(record => record.status === "resolved");
  const rows: PreparedCsvIntakeRow[] = accepted.map(record => ({
    schema_version: report.csvSchemaVersion,
    address: record.normalizedAddress ?? record.address,
    chain: record.chainCode ?? record.chain,
    identifier_kind: record.identifierKind,
    entity: record.entityId ? entities.get(record.entityId)?.code ?? record.entityHint ?? undefined : undefined,
    protocol: record.protocolId ? protocols.get(record.protocolId)?.code ?? record.protocolHint ?? undefined : undefined,
    role: record.roleId ? roles.get(record.roleId)?.code ?? record.roleHint ?? undefined : undefined,
    component: record.componentHint ?? undefined,
    tags: record.tagHints.join("|"),
    source_url: record.sourceUrl ?? undefined,
    source_sheet: record.sourceSheet ?? undefined,
    source_row: record.sourceRow ?? undefined,
    source_section: record.sourceSection ?? undefined,
    source_document_hash: record.sourceDocumentHash ?? undefined,
    retrieved_at: record.retrievedAt ?? undefined,
    source_name: record.raw.source_name || parsed.sourceName,
    confidence: record.raw.confidence,
    quality_tier: record.raw.quality_tier,
    evidence_type: record.raw.evidence_type,
    trust_tier: record.raw.trust_tier,
    verification_scope: record.raw.verification_scope,
    notes: record.raw.notes,
    source_role_label: record.raw.source_role_label,
    raw_reference: record.rawReference ?? undefined,
    raw_row: { ...record.raw },
    dictionary_version: report.dictionaryVersion,
    normalization_status: record.status,
    preflightNormalization: {
      chainCode: record.chainCode,
      addressFamily: record.addressFamily,
      rawAddress: record.address,
      normalizedAddress: record.normalizedAddress ?? record.address,
      prefixCode: record.prefixCode,
      namespaceId: record.namespaceId,
      addressCodecId: record.addressCodecId,
      payloadHex: record.payloadHex,
      isValid: true,
    },
    preflightResolution: {
      entityId: record.entityId,
      protocolId: record.protocolId,
      roleId: record.roleId,
      roleCode: record.roleId ? roles.get(record.roleId)?.code ?? null : null,
      componentId: record.componentId,
      categoryId: record.categoryId,
    },
  }));

  const summary = await createCandidatesFromRows(rows, {
    sourceType: parsed.sourceType,
    sourceName: parsed.sourceName,
    sourceUrl: parsed.sourceUrl || null,
    entityHint: parsed.entityHint,
    protocolHint: parsed.protocolHint,
    documentType: "csv",
    originalName: parsed.localFileName || `${parsed.sourceName}.research.csv`,
    localFileName: parsed.localFileName,
    rawText: parsed.csvText,
    metadata: {
      workflow: "deterministic_research_normalization",
      schemaVersion: report.csvSchemaVersion,
      dictionaryVersion: report.dictionaryVersion,
      preflightHash: report.preflightHash,
      inputHash: report.inputHash,
      preflightCounts: report.counts,
      unresolvedRowsExcluded: report.counts.unresolvedRows,
      duplicateRowsExcluded: report.counts.duplicates,
      warnings: report.warnings,
      csvInputMode: parsed.csvInputMode ?? "pasted_text",
      uploadMimeType: parsed.uploadMimeType,
      uploadSizeBytes: parsed.uploadSizeBytes,
    },
  });

  return {
    ...summary,
    dictionaryVersion: report.dictionaryVersion,
    preflightHash: report.preflightHash,
    acceptedRows: accepted.length,
    unresolvedRowsExcluded: report.counts.unresolvedRows,
    duplicateRowsExcluded: report.counts.duplicates,
  };
}
