import { createHash } from "node:crypto";

import Papa from "papaparse";

import { loadAndValidateU1Catalog } from "./catalog/u1";
import { MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS } from "./kv/contract";
import { exportResearchCsv } from "./research-normalization";
import { getResearchDictionarySnapshot, listDictionaries } from "./services/dictionary-service";

export const MQCHAIN_DICTIONARY_BUNDLE_SCHEMA = "MQCHAIN-DICTIONARY-BUNDLE-1";

export type DictionaryBundleFile = Readonly<{
  name: string;
  content: string;
  contentHash: string;
  rowCount: number;
  sourceVersion: string;
}>;

export type DictionaryBundle = Readonly<{
  /** Canonical MQD-U1 governed dictionary version. Use this in CSV `dictionary_version` cells. */
  dictionaryVersion: string;
  /** Integrity hash of the exported bundle packaging. Never valid as a CSV dictionary version. */
  bundleHash: string;
  generatedAt: string;
  files: readonly DictionaryBundleFile[];
  manifest: string;
}>;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function rowCount(content: string) {
  return Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: "greedy" }).data.length;
}

function addFile(files: DictionaryBundleFile[], name: string, content: string, sourceVersion: string) {
  files.push(Object.freeze({ name, content, contentHash: sha256(content), rowCount: rowCount(content), sourceVersion }));
}

export async function buildDictionaryBundle(now = new Date()): Promise<DictionaryBundle> {
  const [snapshot, dictionaries, catalog] = await Promise.all([
    getResearchDictionarySnapshot(),
    listDictionaries(),
    loadAndValidateU1Catalog(),
  ]);
  const files: DictionaryBundleFile[] = [];

  addFile(files, "entities.csv", exportResearchCsv(dictionaries.entities.map(row => ({
    entity_id: row.id, entity_code: row.entityCode, entity_name: row.entityName,
    entity_type: row.entityType, category_id: row.categoryId, active: row.isActive,
  }))), snapshot.dictionaryVersion);
  addFile(files, "protocols.csv", exportResearchCsv(dictionaries.protocols.map(row => ({
    protocol_id: row.id, entity_id: row.entityId, protocol_code: row.protocolCode,
    protocol_name: row.protocolName, protocol_type: row.protocolType,
    chain_scope: row.chainScope?.join("|") ?? "", active: row.isActive,
  }))), snapshot.dictionaryVersion);
  addFile(files, "categories.csv", exportResearchCsv(dictionaries.categories.map(row => ({
    category_id: row.categoryId, category_code: row.categoryCode, category_name: row.categoryName,
    parent_category_id: row.parentCategoryId, domain_code: row.domainCode,
    metric_domain: row.metricDomain, active: row.isActive,
  }))), snapshot.dictionaryVersion);
  addFile(files, "roles.csv", exportResearchCsv(dictionaries.roles.map(row => ({
    role_id: row.roleId, role_code: row.roleCode, role_name: row.roleName,
    category_id: row.categoryId, role_group: row.roleGroup,
    metric_usage_default: row.metricUsageDefault, boundary_class: row.boundaryClass,
    default_quality_tier: row.defaultQualityTier, default_flags: row.defaultFlags, active: row.isActive,
  }))), snapshot.dictionaryVersion);
  addFile(files, "tags.csv", exportResearchCsv(snapshot.tags.map(row => ({
    tag_id: row.id, tag_code: row.code, tag_name: row.name, aliases: row.aliases?.join("|") ?? "",
  }))), snapshot.dictionaryVersion);
  addFile(files, "components.csv", exportResearchCsv(snapshot.components.map(row => ({
    component_id: row.id, component_code: row.code, component_name: row.name, aliases: row.aliases?.join("|") ?? "",
  }))), snapshot.dictionaryVersion);

  for (const name of ["chain_networks.csv", "chain_aliases.csv", "address_codecs.csv", "address_namespaces.csv", "token_standards.csv", "protocol_components.csv"] as const) {
    const rows = catalog.rows.get(name);
    if (rows !== undefined) addFile(files, name, exportResearchCsv(rows), catalog.dictionaryVersion);
  }
  files.sort((left, right) => left.name.localeCompare(right.name));

  // dictionaryVersion is the canonical MQD-U1 governed dictionary version and
  // is what research preflight accepts. bundleHash covers the exported file
  // packaging and changes whenever export content changes; it must never be
  // placed in a CSV dictionary_version cell.
  const dictionaryVersion = snapshot.dictionaryVersion;
  const bundleHash = sha256(JSON.stringify({
    schema: MQCHAIN_DICTIONARY_BUNDLE_SCHEMA,
    dictionaryVersion,
    catalogVersion: catalog.dictionaryVersion,
    files: files.map(file => ({ name: file.name, contentHash: file.contentHash, rowCount: file.rowCount })),
  }));
  const generatedAt = now.toISOString();
  const manifestObject = {
    schemaVersion: MQCHAIN_DICTIONARY_BUNDLE_SCHEMA,
    ...MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS,
    dictionaryVersion,
    bundleHash,
    generatedAt,
    catalogVersion: catalog.dictionaryVersion,
    files: files.map(file => ({
      name: file.name,
      contentHash: file.contentHash,
      rowCount: file.rowCount,
      sourceVersion: file.sourceVersion,
    })),
  };

  return Object.freeze({
    dictionaryVersion,
    bundleHash,
    generatedAt,
    files: Object.freeze(files),
    manifest: `${JSON.stringify(manifestObject, null, 2)}\n`,
  });
}
