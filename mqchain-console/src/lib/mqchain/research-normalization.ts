import { createHash } from "node:crypto";

import Papa from "papaparse";

import { codecRegistry } from "./address/codecs";

export const RESEARCH_CSV_SCHEMA_VERSION = "MQCHAIN-RESEARCH-CSV-1";
export const RESEARCH_PREFLIGHT_SCHEMA_VERSION = "MQCHAIN-RESEARCH-PREFLIGHT-1";

export const CANONICAL_RESEARCH_COLUMNS = Object.freeze([
  "schema_version", "dictionary_version", "address", "chain", "source_chain_label", "address_type",
  "entity", "entity_code", "protocol", "protocol_code", "category_code", "role", "role_code",
  "component_code", "component_name", "component_type", "tags", "source_url", "source_name",
  "source_sheet", "source_row", "source_section", "source_document_hash", "retrieved_at", "evidence_type",
  "trust_tier", "confidence", "quality_tier", "metric_eligible", "verification_scope",
  "normalization_status", "proposed_entity_code", "proposed_protocol_code", "proposed_role_code",
  "proposed_component_code", "proposal_reason", "source_role_label", "notes", "raw_reference",
]);

export type ResearchDictionaryItem = Readonly<{
  id: number;
  code: string;
  name: string;
  aliases?: readonly string[];
}>;

export type ResearchNetworkProfile = Readonly<{
  networkId: number;
  networkCode: string;
  networkName: string;
  aliases?: readonly string[];
  namespaceId: number;
  prefixCode: number | null;
  addressCodecId: number;
  codecCode: string;
  identifierKind: string;
  parameters?: Readonly<Record<string, unknown>>;
}>;

export type ResearchDictionarySnapshot = Readonly<{
  dictionaryVersion: string;
  entities: readonly ResearchDictionaryItem[];
  protocols: readonly ResearchDictionaryItem[];
  roles: readonly ResearchDictionaryItem[];
  categories?: readonly ResearchDictionaryItem[];
  components: readonly ResearchDictionaryItem[];
  tags: readonly ResearchDictionaryItem[];
  networkProfiles: readonly ResearchNetworkProfile[];
}>;

export type ResearchRowStatus =
  | "resolved"
  | "review_required"
  | "invalid"
  | "invalid_address"
  | "duplicate"
  | "pending_entity"
  | "pending_protocol"
  | "pending_role"
  | "pending_component"
  | "pending_category"
  | "pending_alias"
  | "pending_network"
  | "pending_codec"
  | "unsupported_identifier_kind"
  | "dictionary_version_mismatch"
  | "source_provenance_missing";

export type ResearchPreflightRecord = Readonly<{
  rowNumber: number;
  status: ResearchRowStatus;
  blockers: readonly string[];
  warnings: readonly string[];
  raw: Readonly<Record<string, string>>;
  address: string;
  normalizedAddress: string | null;
  payloadHex: string | null;
  chain: string;
  chainCode: string | null;
  chainNetworkId: number | null;
  namespaceId: number | null;
  addressCodecId: number | null;
  prefixCode: number | null;
  addressFamily: string | null;
  identifierKind: string;
  entityHint: string | null;
  entityId: number | null;
  protocolHint: string | null;
  protocolId: number | null;
  roleHint: string | null;
  roleId: number | null;
  componentHint: string | null;
  componentId: number | null;
  tagHints: readonly string[];
  tagIds: readonly number[];
  sourceUrl: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  sourceSection: string | null;
  sourceDocumentHash: string | null;
  retrievedAt: string | null;
  rawReference: Readonly<Record<string, unknown>> | null;
  metricEligibleRequested: boolean;
}>;

export type ResearchPreflightReport = Readonly<{
  schemaVersion: typeof RESEARCH_PREFLIGHT_SCHEMA_VERSION;
  csvSchemaVersion: string;
  dictionaryVersion: string;
  suppliedDictionaryVersion: string | null;
  activeDictionaryVersion: string;
  dictionaryVersionMatches: boolean;
  generatedAt: string;
  inputHash: string;
  preflightHash: string;
  legacySchema: boolean;
  canCreateSourceJob: boolean;
  counts: Readonly<{
    totalRows: number;
    resolvedRows: number;
    unresolvedRows: number;
    invalidRows: number;
    duplicates: number;
  }>;
  chains: readonly string[];
  entities: readonly string[];
  roles: readonly string[];
  sourceSheets: readonly string[];
  sourceUrls: readonly string[];
  blockers: readonly string[];
  warnings: readonly string[];
  records: readonly ResearchPreflightRecord[];
  normalizedCsv: string;
  unresolvedCsv: string;
}>;

const HEADER_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  chain_code: "chain", network: "chain", network_code: "chain",
  entity_name: "entity", protocol_name: "protocol", role_name: "role",
  sourceurl: "source_url", sourcesheet: "source_sheet", sourcerow: "source_row",
  sourcesection: "source_section", rawreference: "raw_reference",
  address_type: "identifier_kind", identifier_type: "identifier_kind",
});

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function key(value: unknown) {
  return clean(value).toLowerCase().replace(/[_\s]+/g, "-");
}

function normalizeHeader(header: string) {
  const normalized = header.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return HEADER_ALIASES[normalized] ?? normalized;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function itemMap(items: readonly ResearchDictionaryItem[]) {
  const result = new Map<string, ResearchDictionaryItem>();
  for (const item of items) {
    for (const value of [item.code, item.name, ...(item.aliases ?? [])]) result.set(key(value), item);
  }
  return result;
}

function parseBoolean(value: string) {
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

function optionalInteger(value?: string) {
  if (!value?.trim()) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function inspectJson(value: unknown, depth = 0): void {
  if (depth > 8) throw new Error("raw_reference_too_deep");
  if (!value || typeof value !== "object") return;
  for (const [name, child] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(name)) throw new Error("raw_reference_forbidden_key");
    inspectJson(child, depth + 1);
  }
}

export function parseRawReference(value: string): Readonly<Record<string, unknown>> | null {
  if (!value.trim()) return null;
  if (Buffer.byteLength(value) > 32 * 1024) throw new Error("raw_reference_too_large");
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("raw_reference_must_be_object");
  inspectJson(parsed);
  return parsed as Readonly<Record<string, unknown>>;
}

function csvSafe(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function exportResearchCsv(rows: readonly Readonly<Record<string, unknown>>[]) {
  return Papa.unparse(rows.map(row => Object.fromEntries(Object.entries(row).map(([name, value]) => [name, csvSafe(value)]))), {
    newline: "\n",
    quotes: true,
  });
}

function parseCsv(csvText: string) {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
    transform: value => value.trim(),
  });
  if (parsed.errors.length) throw new Error(`malformed_csv:${parsed.errors.map(error => error.message).join(";")}`);
  return parsed.data;
}

function canonicalExportRow(record: ResearchPreflightRecord, dictionaryVersion: string) {
  return {
    schema_version: RESEARCH_CSV_SCHEMA_VERSION,
    dictionary_version: dictionaryVersion,
    address: record.normalizedAddress ?? record.address,
    chain: record.chainCode ?? record.chain,
    source_chain_label: record.chain,
    address_type: record.identifierKind,
    entity: record.entityHint ?? "",
    entity_code: record.raw.entity_code ?? "",
    protocol: record.protocolHint ?? "",
    protocol_code: record.raw.protocol_code ?? "",
    category_code: record.raw.category_code ?? "",
    role: record.roleHint ?? "",
    role_code: record.raw.role_code ?? "",
    component_code: record.raw.component_code ?? record.componentHint ?? "",
    component_name: record.raw.component_name ?? "",
    component_type: record.raw.component_type ?? "",
    tags: record.tagHints.join("|"),
    source_url: record.sourceUrl ?? "",
    source_name: record.raw.source_name ?? "",
    source_sheet: record.sourceSheet ?? "",
    source_row: record.sourceRow ?? "",
    source_section: record.sourceSection ?? "",
    source_document_hash: record.sourceDocumentHash ?? "",
    retrieved_at: record.retrievedAt ?? "",
    evidence_type: record.raw.evidence_type ?? "",
    trust_tier: record.raw.trust_tier ?? "",
    confidence: record.raw.confidence ?? "",
    quality_tier: record.raw.quality_tier ?? "",
    verification_scope: record.raw.verification_scope ?? "",
    normalization_status: record.status,
    proposed_entity_code: record.raw.proposed_entity_code ?? "",
    proposed_protocol_code: record.raw.proposed_protocol_code ?? "",
    proposed_role_code: record.raw.proposed_role_code ?? "",
    proposed_component_code: record.raw.proposed_component_code ?? "",
    proposal_reason: record.raw.proposal_reason ?? "",
    source_role_label: record.raw.source_role_label ?? "",
    notes: record.raw.notes ?? "",
    raw_reference: record.rawReference ?? "",
    metric_eligible: record.metricEligibleRequested,
    blockers: record.blockers.join("|"),
    warnings: record.warnings.join("|"),
  };
}

export function preflightResearchCsv(input: {
  csvText: string;
  dictionary: ResearchDictionarySnapshot;
  sourceUrl?: string | null;
  now?: Date;
}): ResearchPreflightReport {
  const rows = parseCsv(input.csvText);
  const entityByKey = itemMap(input.dictionary.entities);
  const protocolByKey = itemMap(input.dictionary.protocols);
  const roleByKey = itemMap(input.dictionary.roles);
  const categoryByKey = itemMap(input.dictionary.categories ?? []);
  const componentByKey = itemMap(input.dictionary.components);
  const tagByKey = itemMap(input.dictionary.tags);
  const profileByKey = new Map<string, ResearchNetworkProfile[]>();
  for (const profile of input.dictionary.networkProfiles) {
    for (const value of [profile.networkCode, profile.networkName, ...(profile.aliases ?? [])]) {
      const profiles = profileByKey.get(key(value)) ?? [];
      if (!profiles.includes(profile)) profiles.push(profile);
      profileByKey.set(key(value), profiles);
    }
  }

  const seen = new Set<string>();
  const records: ResearchPreflightRecord[] = [];
  const reportWarnings = new Set<string>();
  const reportBlockers = new Set<string>();
  const legacySchema = rows.some(row => !row.schema_version || !row.dictionary_version || !("normalization_status" in row));
  const suppliedDictionaryVersion = clean(rows.find(row => clean(row.dictionary_version))?.dictionary_version) || null;
  if (legacySchema) reportWarnings.add("legacy_schema");

  for (const [index, row] of rows.entries()) {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const address = clean(row.address);
    const chain = clean(row.chain);
    const identifierKind = clean(row.identifier_kind) || "wallet_address";
    const sourceUrl = clean(row.source_url) || clean(input.sourceUrl) || null;
    const sourceSheet = clean(row.source_sheet) || null;
    const sourceSection = clean(row.source_section) || null;
    const sourceDocumentHash = clean(row.source_document_hash) || null;
    const retrievedAt = clean(row.retrieved_at) || null;
    const sourceRow = optionalInteger(row.source_row);
    const entityHint = clean(row.entity_code) || clean(row.entity) || null;
    const protocolHint = clean(row.protocol_code) || clean(row.protocol) || null;
    const roleHint = clean(row.role_code) || clean(row.role) || null;
    const componentHint = clean(row.component_code) || clean(row.component_name) || clean(row.component) || null;
    const categoryHint = clean(row.category_code) || null;
    const tagHints = clean(row.tags).split(/[|,;]/).map(value => value.trim()).filter(Boolean);
    const entity = entityHint ? entityByKey.get(key(entityHint)) : undefined;
    const protocol = protocolHint ? protocolByKey.get(key(protocolHint)) : undefined;
    const role = roleHint ? roleByKey.get(key(roleHint)) : undefined;
    const component = componentHint ? componentByKey.get(key(componentHint)) : undefined;
    const category = categoryHint ? categoryByKey.get(key(categoryHint)) : undefined;
    const tags = tagHints.map(tag => tagByKey.get(key(tag))).filter((tag): tag is ResearchDictionaryItem => Boolean(tag));
    let rawReference: Readonly<Record<string, unknown>> | null = null;
    let rawReferenceError: string | null = null;
    try { rawReference = parseRawReference(clean(row.raw_reference)); }
    catch (error) { rawReferenceError = error instanceof Error ? error.message : "malformed_raw_reference"; }

    const profiles = profileByKey.get(key(chain)) ?? [];
    const candidateProfiles = profiles.filter(candidate => candidate.identifierKind === identifierKind);
    const runtimeProfiles = candidateProfiles.filter(candidate => codecRegistry.hasCodec(candidate.codecCode));
    let profile: ResearchNetworkProfile | undefined;
    let status: ResearchRowStatus = "resolved";
    let normalizedAddress: string | null = null;
    let payloadHex: string | null = null;
    let addressFamily: string | null = null;

    if (!sourceUrl || (!sourceSheet && !sourceSection && !sourceRow && !rawReference)) {
      status = "source_provenance_missing";
      blockers.push("source_provenance_missing");
      reportBlockers.add("source_provenance_missing");
    } else if (!address || rawReferenceError) {
      status = "invalid";
      blockers.push(rawReferenceError ?? "missing_address");
      reportBlockers.add("invalid_rows");
    } else if (!chain) {
      status = "pending_network";
      blockers.push("missing_chain");
    } else if (!profiles.length) {
      status = "pending_alias";
      blockers.push("unknown_chain_alias");
    } else if (!candidateProfiles.length) {
      status = "unsupported_identifier_kind";
      blockers.push("identifier_profile_unavailable");
    } else if (!runtimeProfiles.length) {
      status = "pending_codec";
      blockers.push("runtime_codec_unavailable");
    } else {
      const normalizedMatch = runtimeProfiles
        .map(candidate => ({
          profile: candidate,
          result: codecRegistry.requireCodec(candidate.codecCode).normalize(address, {
            parameters: candidate.parameters ?? {},
            identifierKind,
          }),
        }))
        .find(candidate => candidate.result.ok);
      if (!normalizedMatch || !normalizedMatch.result.ok) {
        status = "invalid_address";
        blockers.push("invalid_address_for_network");
        reportBlockers.add("invalid_rows");
      } else {
        profile = normalizedMatch.profile;
        normalizedAddress = normalizedMatch.result.canonicalText;
        payloadHex = normalizedMatch.result.payloadHex;
        addressFamily = normalizedMatch.result.addressFamily;
        const duplicateKey = `${profile.networkId}:${identifierKind}:${payloadHex}`;
        if (seen.has(duplicateKey)) {
          status = "duplicate";
          blockers.push("duplicate_in_input");
        } else {
          seen.add(duplicateKey);
          if (entityHint && !entity) {
            status = "pending_entity";
            blockers.push("unknown_entity");
          } else if (protocolHint && !protocol) {
            status = "pending_protocol";
            blockers.push("unknown_protocol");
          } else if (!roleHint || !role) {
            status = "pending_role";
            blockers.push(roleHint ? "unknown_role" : "missing_role");
          } else if (categoryHint && !category) {
            status = "pending_category";
            blockers.push("unknown_category");
          } else if (componentHint && !component) {
            status = "pending_component";
            blockers.push("unknown_component");
            warnings.push("component_not_promoted_to_role");
          }
        }
      }
    }

    const rowDictionaryVersion = clean(row.dictionary_version);
    if (rowDictionaryVersion && rowDictionaryVersion !== input.dictionary.dictionaryVersion) {
      status = "dictionary_version_mismatch";
      blockers.push("dictionary_version_mismatch");
      reportBlockers.add("dictionary_version_mismatch");
    }
    if (tagHints.length !== tags.length) warnings.push("unresolved_tags");

    records.push(Object.freeze({
      rowNumber: index + 2, status, blockers: Object.freeze(blockers), warnings: Object.freeze(warnings), raw: Object.freeze({ ...row }),
      address, normalizedAddress, payloadHex, chain, chainCode: profile?.networkCode ?? null,
      chainNetworkId: profile?.networkId ?? null, namespaceId: profile?.namespaceId ?? null,
      addressCodecId: profile?.addressCodecId ?? null, prefixCode: profile?.prefixCode ?? null,
      addressFamily, identifierKind, entityHint, entityId: entity?.id ?? null,
      protocolHint, protocolId: protocol?.id ?? null, roleHint, roleId: role?.id ?? null,
      componentHint, componentId: component?.id ?? null, tagHints: Object.freeze(tagHints),
      tagIds: Object.freeze(tags.map(tag => tag.id)), sourceUrl, sourceSheet, sourceRow,
      sourceSection, sourceDocumentHash, retrievedAt, rawReference, metricEligibleRequested: parseBoolean(clean(row.metric_eligible)),
    }));
  }

  const stableRecords = records.map(record => ({ rowNumber: record.rowNumber, status: record.status, chainNetworkId: record.chainNetworkId, namespaceId: record.namespaceId, addressCodecId: record.addressCodecId, payloadHex: record.payloadHex, entityId: record.entityId, protocolId: record.protocolId, roleId: record.roleId, componentId: record.componentId, tagIds: record.tagIds, blockers: record.blockers }));
  const inputHash = sha256(input.csvText);
  const preflightHash = sha256(JSON.stringify({ schema: RESEARCH_PREFLIGHT_SCHEMA_VERSION, inputHash, dictionaryVersion: input.dictionary.dictionaryVersion, records: stableRecords }));
  const resolved = records.filter(record => record.status === "resolved");
  const unresolved = records.filter(record => !["resolved", "invalid", "invalid_address", "dictionary_version_mismatch", "duplicate", "source_provenance_missing"].includes(record.status));
  const invalid = records.filter(record => ["invalid", "invalid_address", "dictionary_version_mismatch", "source_provenance_missing"].includes(record.status));
  const duplicates = records.filter(record => record.status === "duplicate");

  return Object.freeze({
    schemaVersion: RESEARCH_PREFLIGHT_SCHEMA_VERSION,
    csvSchemaVersion: rows.find(row => clean(row.schema_version))?.schema_version ?? "legacy",
    dictionaryVersion: input.dictionary.dictionaryVersion,
    suppliedDictionaryVersion,
    activeDictionaryVersion: input.dictionary.dictionaryVersion,
    dictionaryVersionMatches: suppliedDictionaryVersion === input.dictionary.dictionaryVersion,
    generatedAt: (input.now ?? new Date()).toISOString(), inputHash, preflightHash, legacySchema,
    canCreateSourceJob: reportBlockers.size === 0 && resolved.length > 0,
    counts: Object.freeze({ totalRows: records.length, resolvedRows: resolved.length, unresolvedRows: unresolved.length, invalidRows: invalid.length, duplicates: duplicates.length }),
    chains: Object.freeze([...new Set(records.map(record => record.chainCode ?? record.chain).filter(Boolean))].sort()),
    entities: Object.freeze([...new Set(records.map(record => record.entityHint).filter((value): value is string => Boolean(value)))].sort()),
    roles: Object.freeze([...new Set(records.map(record => record.roleHint).filter((value): value is string => Boolean(value)))].sort()),
    sourceSheets: Object.freeze([...new Set(records.map(record => record.sourceSheet).filter((value): value is string => Boolean(value)))].sort()),
    sourceUrls: Object.freeze([...new Set(records.map(record => record.sourceUrl).filter((value): value is string => Boolean(value)))].sort()),
    blockers: Object.freeze([...reportBlockers].sort()), warnings: Object.freeze([...reportWarnings].sort()), records: Object.freeze(records),
    normalizedCsv: exportResearchCsv(resolved.map(record => canonicalExportRow(record, input.dictionary.dictionaryVersion))),
    unresolvedCsv: exportResearchCsv([...unresolved, ...invalid, ...duplicates].map(record => canonicalExportRow(record, input.dictionary.dictionaryVersion))),
  });
}
