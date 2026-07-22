import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqWorkflowAddressCandidates,
  mqDictAddressCodecs,
  mqDictAddressNamespaces,
  mqRegistryAddressLabels,
  mqAuditEvents,
  mqDictCategories,
  mqDictLabelStatuses,
  mqDictMetricMembershipStatuses,
  mqDictAssetStatuses,
  mqDictQualityTiers,
  mqDictFlagBits,
  mqCatalogChainAliases,
  mqDictChainNetworks,
  mqGovernanceDictionaryVersions,
  mqDictEntities,
  mqDictLegacyKeyPrefixes,
  mqDictRoles,
  mqPolicyRoleApprovalRequirements,
  mqPolicyMetricGroupRules,
  mqDictMetricGroups,
  mqCatalogNameAliases,
  mqDictProtocolComponents,
  mqDictProtocols,
  mqDictTags,
  mqDictTagsets,
  mqMapTagsetMembers,
  mqDictTokenStandards,
  mqUsers,
} from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";
import { buildDictionaryInventory } from "../dictionary-overview";
import { buildDefaultFlags } from "../flags";
import {
  buildCanonicalDictionarySnapshot,
  type CanonicalDictionaryRows,
  type CanonicalDictionarySnapshot,
} from "../kv/contract";
import type { ResearchDictionaryItem, ResearchDictionarySnapshot } from "../research-normalization";
import {
  categorySchema,
  categoryUpdateSchema,
  entitySchema,
  entityUpdateSchema,
  idSchema,
  keyPrefixSchema,
  keyPrefixUpdateSchema,
  protocolSchema,
  protocolUpdateSchema,
  roleSchema,
  roleUpdateSchema,
} from "../validators/dictionary";
import {
  parseCategoryDictionaryListFilters,
  parseDictionaryVersionListFilters,
  parseEntityDictionaryListFilters,
  parseKeyPrefixDictionaryListFilters,
  parseProtocolDictionaryListFilters,
  parseRoleDictionaryListFilters,
  type CategoryDictionaryListFilters,
  type DictionaryVersionListFilters,
  type EntityDictionaryListFilters,
  type KeyPrefixDictionaryListFilters,
  type ProtocolDictionaryListFilters,
  type RoleDictionaryListFilters,
} from "../list-filters";
import { optionalNumber } from "./service-utils";

export async function listDictionaries() {
  const db = getDb();
  const [entities, protocols, roles, categories, prefixes, metricGroups, metricGroupRules] = await Promise.all([
    db.select().from(mqDictEntities).orderBy(asc(mqDictEntities.entityName)),
    db.select().from(mqDictProtocols).orderBy(asc(mqDictProtocols.protocolName)),
    db.select().from(mqDictRoles).orderBy(asc(mqDictRoles.roleId)),
    db.select().from(mqDictCategories).orderBy(asc(mqDictCategories.categoryId)),
    db.select().from(mqDictLegacyKeyPrefixes).orderBy(asc(mqDictLegacyKeyPrefixes.prefixCode)),
    db.select().from(mqDictMetricGroups).orderBy(asc(mqDictMetricGroups.metricGroupCode)),
    db.select().from(mqPolicyMetricGroupRules).orderBy(asc(mqPolicyMetricGroupRules.metricGroupId), asc(mqPolicyMetricGroupRules.id)),
  ]);

  return { entities, protocols, roles, categories, prefixes, metricGroups, metricGroupRules };
}

function entityDictionaryOrderBy(sort: EntityDictionaryListFilters["sort"]) {
  if (sort === "code") return asc(mqDictEntities.entityCode);
  if (sort === "type") return asc(mqDictEntities.entityType);
  if (sort === "created_at") return desc(mqDictEntities.createdAt);
  if (sort === "updated_at") return desc(mqDictEntities.updatedAt);
  return asc(mqDictEntities.entityName);
}

function categoryDictionaryOrderBy(sort: CategoryDictionaryListFilters["sort"]) {
  if (sort === "code") return asc(mqDictCategories.categoryCode);
  if (sort === "name") return asc(mqDictCategories.categoryName);
  if (sort === "domain") return asc(mqDictCategories.domainCode);
  if (sort === "created_at") return desc(mqDictCategories.createdAt);
  if (sort === "updated_at") return desc(mqDictCategories.updatedAt);
  return asc(mqDictCategories.categoryId);
}

function protocolDictionaryOrderBy(sort: ProtocolDictionaryListFilters["sort"]) {
  if (sort === "code") return asc(mqDictProtocols.protocolCode);
  if (sort === "type") return asc(mqDictProtocols.protocolType);
  if (sort === "entity") return asc(mqDictEntities.entityName);
  if (sort === "created_at") return desc(mqDictProtocols.createdAt);
  if (sort === "updated_at") return desc(mqDictProtocols.updatedAt);
  return asc(mqDictProtocols.protocolName);
}

function roleDictionaryOrderBy(sort: RoleDictionaryListFilters["sort"]) {
  if (sort === "code") return asc(mqDictRoles.roleCode);
  if (sort === "name") return asc(mqDictRoles.roleName);
  if (sort === "group") return asc(mqDictRoles.roleGroup);
  if (sort === "quality") return desc(mqDictRoles.defaultQualityTier);
  if (sort === "created_at") return desc(mqDictRoles.createdAt);
  if (sort === "updated_at") return desc(mqDictRoles.updatedAt);
  return asc(mqDictRoles.roleId);
}

function keyPrefixDictionaryOrderBy(sort: KeyPrefixDictionaryListFilters["sort"]) {
  if (sort === "chain") return asc(mqDictLegacyKeyPrefixes.chainCode);
  if (sort === "chain_family") return asc(mqDictLegacyKeyPrefixes.chainFamily);
  if (sort === "address_family") return asc(mqDictLegacyKeyPrefixes.addressFamily);
  if (sort === "codec") return asc(mqDictLegacyKeyPrefixes.codec);
  if (sort === "created_at") return desc(mqDictLegacyKeyPrefixes.createdAt);
  if (sort === "updated_at") return desc(mqDictLegacyKeyPrefixes.updatedAt);
  return asc(mqDictLegacyKeyPrefixes.prefixCode);
}

function dictionaryVersionOrderBy(sort: DictionaryVersionListFilters["sort"]) {
  if (sort === "hash") return asc(mqGovernanceDictionaryVersions.versionHash);
  if (sort === "reason") return asc(sql`${mqGovernanceDictionaryVersions.summary}->>'reason'`);
  return desc(mqGovernanceDictionaryVersions.createdAt);
}

function addCondition(conditions: SQL[], condition: SQL | undefined) {
  if (condition) conditions.push(condition);
}

export async function listEntities(input: unknown = {}) {
  const filters = typeof input === "number" ? parseEntityDictionaryListFilters({ pageSize: input }) : parseEntityDictionaryListFilters(input);
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqDictEntities.entityCode, `%${filters.q}%`),
        ilike(mqDictEntities.entityName, `%${filters.q}%`),
        ilike(mqDictEntities.entityType, `%${filters.q}%`),
        ilike(mqDictEntities.websiteUrl, `%${filters.q}%`),
        ilike(mqDictEntities.description, `%${filters.q}%`),
        sql`${mqDictEntities.id}::text ilike ${`%${filters.q}%`}`,
      ),
    );
  }

  if (filters.entityType) conditions.push(ilike(mqDictEntities.entityType, `%${filters.entityType}%`));
  if (filters.category) {
    addCondition(
      conditions,
      or(
        sql`${mqDictEntities.categoryId}::text ilike ${`%${filters.category}%`}`,
        ilike(mqDictCategories.categoryCode, `%${filters.category}%`),
        ilike(mqDictCategories.categoryName, `%${filters.category}%`),
      ),
    );
  }
  if (filters.active === "active") conditions.push(eq(mqDictEntities.isActive, true));
  if (filters.active === "inactive") conditions.push(eq(mqDictEntities.isActive, false));

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqDictEntities)
    .leftJoin(mqDictCategories, eq(mqDictEntities.categoryId, mqDictCategories.categoryId))
    .where(where);
  const rows = await db
    .select({ entity: mqDictEntities, category: mqDictCategories })
    .from(mqDictEntities)
    .leftJoin(mqDictCategories, eq(mqDictEntities.categoryId, mqDictCategories.categoryId))
    .where(where)
    .orderBy(entityDictionaryOrderBy(filters.sort), asc(mqDictEntities.id))
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

export async function listKeyPrefixes(input: unknown = {}) {
  const filters = typeof input === "number" ? parseKeyPrefixDictionaryListFilters({ pageSize: input }) : parseKeyPrefixDictionaryListFilters(input);
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        sql`${mqDictLegacyKeyPrefixes.prefixCode}::text ilike ${`%${filters.q}%`}`,
        ilike(mqDictLegacyKeyPrefixes.chainCode, `%${filters.q}%`),
        ilike(mqDictLegacyKeyPrefixes.chainName, `%${filters.q}%`),
        ilike(mqDictLegacyKeyPrefixes.chainFamily, `%${filters.q}%`),
        ilike(mqDictLegacyKeyPrefixes.addressFamily, `%${filters.q}%`),
        ilike(mqDictLegacyKeyPrefixes.codec, `%${filters.q}%`),
        ilike(mqDictLegacyKeyPrefixes.description, `%${filters.q}%`),
        sql`${mqDictLegacyKeyPrefixes.payloadLen}::text ilike ${`%${filters.q}%`}`,
        sql`${mqDictLegacyKeyPrefixes.evmChainId}::text ilike ${`%${filters.q}%`}`,
      ),
    );
  }

  if (filters.chain) {
    addCondition(
      conditions,
      or(
        ilike(mqDictLegacyKeyPrefixes.chainCode, `%${filters.chain}%`),
        ilike(mqDictLegacyKeyPrefixes.chainName, `%${filters.chain}%`),
      ),
    );
  }
  if (filters.chainFamily) conditions.push(ilike(mqDictLegacyKeyPrefixes.chainFamily, `%${filters.chainFamily}%`));
  if (filters.addressFamily) conditions.push(ilike(mqDictLegacyKeyPrefixes.addressFamily, `%${filters.addressFamily}%`));
  if (filters.codec) conditions.push(ilike(mqDictLegacyKeyPrefixes.codec, `%${filters.codec}%`));
  if (filters.evmChainId !== undefined) conditions.push(eq(mqDictLegacyKeyPrefixes.evmChainId, filters.evmChainId));
  if (filters.minPayloadLen !== undefined) conditions.push(sql`${mqDictLegacyKeyPrefixes.payloadLen} >= ${filters.minPayloadLen}`);
  if (filters.maxPayloadLen !== undefined) conditions.push(sql`${mqDictLegacyKeyPrefixes.payloadLen} <= ${filters.maxPayloadLen}`);
  if (filters.active === "active") conditions.push(eq(mqDictLegacyKeyPrefixes.isActive, true));
  if (filters.active === "inactive") conditions.push(eq(mqDictLegacyKeyPrefixes.isActive, false));

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqDictLegacyKeyPrefixes)
    .where(where);
  const rows = await db
    .select()
    .from(mqDictLegacyKeyPrefixes)
    .where(where)
    .orderBy(keyPrefixDictionaryOrderBy(filters.sort), asc(mqDictLegacyKeyPrefixes.prefixCode))
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

export async function listRoles(input: unknown = {}) {
  const filters = typeof input === "number" ? parseRoleDictionaryListFilters({ pageSize: input }) : parseRoleDictionaryListFilters(input);
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        sql`${mqDictRoles.roleId}::text ilike ${`%${filters.q}%`}`,
        ilike(mqDictRoles.roleCode, `%${filters.q}%`),
        ilike(mqDictRoles.roleName, `%${filters.q}%`),
        ilike(mqDictRoles.roleGroup, `%${filters.q}%`),
        ilike(mqDictRoles.metricUsageDefault, `%${filters.q}%`),
        ilike(mqDictRoles.boundaryClass, `%${filters.q}%`),
        ilike(mqDictRoles.description, `%${filters.q}%`),
        sql`${mqDictRoles.defaultFlags}::text ilike ${`%${filters.q}%`}`,
        sql`${mqDictRoles.categoryId}::text ilike ${`%${filters.q}%`}`,
        ilike(mqDictCategories.categoryCode, `%${filters.q}%`),
        ilike(mqDictCategories.categoryName, `%${filters.q}%`),
      ),
    );
  }

  if (filters.category) {
    addCondition(
      conditions,
      or(
        sql`${mqDictRoles.categoryId}::text ilike ${`%${filters.category}%`}`,
        ilike(mqDictCategories.categoryCode, `%${filters.category}%`),
        ilike(mqDictCategories.categoryName, `%${filters.category}%`),
      ),
    );
  }
  if (filters.roleGroup) conditions.push(ilike(mqDictRoles.roleGroup, `%${filters.roleGroup}%`));
  if (filters.metricUsage) conditions.push(ilike(mqDictRoles.metricUsageDefault, `%${filters.metricUsage}%`));
  if (filters.boundary) conditions.push(ilike(mqDictRoles.boundaryClass, `%${filters.boundary}%`));
  if (filters.minQuality !== undefined) conditions.push(sql`${mqDictRoles.defaultQualityTier} >= ${filters.minQuality}`);
  if (filters.maxQuality !== undefined) conditions.push(sql`${mqDictRoles.defaultQualityTier} <= ${filters.maxQuality}`);
  if (filters.active === "active") conditions.push(eq(mqDictRoles.isActive, true));
  if (filters.active === "inactive") conditions.push(eq(mqDictRoles.isActive, false));

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqDictRoles)
    .leftJoin(mqDictCategories, eq(mqDictRoles.categoryId, mqDictCategories.categoryId))
    .where(where);
  const rows = await db
    .select({ role: mqDictRoles, category: mqDictCategories })
    .from(mqDictRoles)
    .leftJoin(mqDictCategories, eq(mqDictRoles.categoryId, mqDictCategories.categoryId))
    .where(where)
    .orderBy(roleDictionaryOrderBy(filters.sort), asc(mqDictRoles.roleId))
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

export async function listProtocols(input: unknown = {}) {
  const filters = typeof input === "number" ? parseProtocolDictionaryListFilters({ pageSize: input }) : parseProtocolDictionaryListFilters(input);
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        sql`${mqDictProtocols.id}::text ilike ${`%${filters.q}%`}`,
        ilike(mqDictProtocols.protocolCode, `%${filters.q}%`),
        ilike(mqDictProtocols.protocolName, `%${filters.q}%`),
        ilike(mqDictProtocols.protocolType, `%${filters.q}%`),
        ilike(mqDictProtocols.description, `%${filters.q}%`),
        sql`array_to_string(${mqDictProtocols.chainScope}, ',') ilike ${`%${filters.q}%`}`,
        sql`${mqDictProtocols.entityId}::text ilike ${`%${filters.q}%`}`,
        ilike(mqDictEntities.entityCode, `%${filters.q}%`),
        ilike(mqDictEntities.entityName, `%${filters.q}%`),
      ),
    );
  }

  if (filters.entity) {
    addCondition(
      conditions,
      or(
        sql`${mqDictProtocols.entityId}::text ilike ${`%${filters.entity}%`}`,
        ilike(mqDictEntities.entityCode, `%${filters.entity}%`),
        ilike(mqDictEntities.entityName, `%${filters.entity}%`),
      ),
    );
  }
  if (filters.protocolType) conditions.push(ilike(mqDictProtocols.protocolType, `%${filters.protocolType}%`));
  if (filters.chain) {
    addCondition(
      conditions,
      or(
        sql`${filters.chain} = any(${mqDictProtocols.chainScope})`,
        sql`array_to_string(${mqDictProtocols.chainScope}, ',') ilike ${`%${filters.chain}%`}`,
      ),
    );
  }
  if (filters.active === "active") conditions.push(eq(mqDictProtocols.isActive, true));
  if (filters.active === "inactive") conditions.push(eq(mqDictProtocols.isActive, false));

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqDictProtocols)
    .leftJoin(mqDictEntities, eq(mqDictProtocols.entityId, mqDictEntities.id))
    .where(where);
  const rows = await db
    .select({ protocol: mqDictProtocols, entity: mqDictEntities })
    .from(mqDictProtocols)
    .leftJoin(mqDictEntities, eq(mqDictProtocols.entityId, mqDictEntities.id))
    .where(where)
    .orderBy(protocolDictionaryOrderBy(filters.sort), asc(mqDictProtocols.id))
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

export async function listCategories(input: unknown = {}) {
  const filters = typeof input === "number" ? parseCategoryDictionaryListFilters({ pageSize: input }) : parseCategoryDictionaryListFilters(input);
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        sql`${mqDictCategories.categoryId}::text ilike ${`%${filters.q}%`}`,
        sql`${mqDictCategories.parentCategoryId}::text ilike ${`%${filters.q}%`}`,
        ilike(mqDictCategories.categoryCode, `%${filters.q}%`),
        ilike(mqDictCategories.categoryName, `%${filters.q}%`),
        ilike(mqDictCategories.domainCode, `%${filters.q}%`),
        ilike(mqDictCategories.metricDomain, `%${filters.q}%`),
        ilike(mqDictCategories.description, `%${filters.q}%`),
      ),
    );
  }

  if (filters.domain) conditions.push(ilike(mqDictCategories.domainCode, `%${filters.domain}%`));
  if (filters.metricDomain) conditions.push(ilike(mqDictCategories.metricDomain, `%${filters.metricDomain}%`));
  if (filters.active === "active") conditions.push(eq(mqDictCategories.isActive, true));
  if (filters.active === "inactive") conditions.push(eq(mqDictCategories.isActive, false));

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqDictCategories)
    .where(where);
  const rows = await db
    .select()
    .from(mqDictCategories)
    .where(where)
    .orderBy(categoryDictionaryOrderBy(filters.sort), asc(mqDictCategories.categoryId))
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

export async function getDictionaryMaps() {
  const dictionaries = await listDictionaries();

  const entityByKey = new Map<string, (typeof dictionaries.entities)[number]>();
  for (const entity of dictionaries.entities) {
    entityByKey.set(entity.entityCode.toLowerCase(), entity);
    entityByKey.set(entity.entityName.toLowerCase(), entity);
  }

  const protocolByKey = new Map<string, (typeof dictionaries.protocols)[number]>();
  for (const protocol of dictionaries.protocols) {
    protocolByKey.set(protocol.protocolCode.toLowerCase(), protocol);
    protocolByKey.set(protocol.protocolName.toLowerCase(), protocol);
  }

  const roleByKey = new Map<string, (typeof dictionaries.roles)[number]>();
  for (const role of dictionaries.roles) {
    roleByKey.set(role.roleCode.toLowerCase(), role);
    roleByKey.set(role.roleName.toLowerCase(), role);
  }

  return { ...dictionaries, entityByKey, protocolByKey, roleByKey };
}

type CanonicalRowsSource = Pick<ReturnType<typeof getDb>, "select">;

/**
 * Load every governed dictionary family, including inactive/retired rows, so
 * the canonical MQD-U1 version covers historical decoding. Active-only
 * filtering happens at resolution time only.
 */
export async function loadCanonicalDictionaryRows(source?: CanonicalRowsSource): Promise<CanonicalDictionaryRows> {
  const db = source ?? getDb();
  const [
    networks,
    chainAliases,
    namespaces,
    codecs,
    keyPrefixes,
    entities,
    protocols,
    categories,
    roles,
    components,
    nameAliases,
    tags,
    tagsets,
    tagsetMembers,
    tokenStandards,
    metricGroups,
    metricGroupRules,
    labelStatuses,
    metricMembershipStatuses,
    assetStatuses,
    qualityTiers,
    flagBits,
  ] = await Promise.all([
    db.select().from(mqDictChainNetworks).orderBy(asc(mqDictChainNetworks.id)),
    db.select().from(mqCatalogChainAliases).orderBy(asc(mqCatalogChainAliases.id)),
    db.select().from(mqDictAddressNamespaces).orderBy(asc(mqDictAddressNamespaces.id)),
    db.select().from(mqDictAddressCodecs).orderBy(asc(mqDictAddressCodecs.id)),
    db.select().from(mqDictLegacyKeyPrefixes).orderBy(asc(mqDictLegacyKeyPrefixes.prefixCode)),
    db.select().from(mqDictEntities).orderBy(asc(mqDictEntities.id)),
    db.select().from(mqDictProtocols).orderBy(asc(mqDictProtocols.id)),
    db.select().from(mqDictCategories).orderBy(asc(mqDictCategories.categoryId)),
    db.select().from(mqDictRoles).orderBy(asc(mqDictRoles.roleId)),
    db.select().from(mqDictProtocolComponents).orderBy(asc(mqDictProtocolComponents.id)),
    db.select().from(mqCatalogNameAliases).orderBy(asc(mqCatalogNameAliases.id)),
    db.select().from(mqDictTags).orderBy(asc(mqDictTags.id)),
    db.select().from(mqDictTagsets).orderBy(asc(mqDictTagsets.id)),
    db.select().from(mqMapTagsetMembers).orderBy(asc(mqMapTagsetMembers.tagsetId), asc(mqMapTagsetMembers.tagId)),
    db.select().from(mqDictTokenStandards).orderBy(asc(mqDictTokenStandards.id)),
    db.select().from(mqDictMetricGroups).orderBy(asc(mqDictMetricGroups.id)),
    db.select().from(mqPolicyMetricGroupRules).orderBy(asc(mqPolicyMetricGroupRules.id)),
    db.select().from(mqDictLabelStatuses).orderBy(asc(mqDictLabelStatuses.labelStatusCode)),
    db.select().from(mqDictMetricMembershipStatuses).orderBy(asc(mqDictMetricMembershipStatuses.membershipStatusCode)),
    db.select().from(mqDictAssetStatuses).orderBy(asc(mqDictAssetStatuses.assetStatusCode)),
    db.select().from(mqDictQualityTiers).orderBy(asc(mqDictQualityTiers.qualityTier)),
    db.select().from(mqDictFlagBits).orderBy(asc(mqDictFlagBits.bitPosition)),
  ]);

  return {
    networks,
    chainAliases,
    namespaces,
    codecs,
    keyPrefixes,
    entities,
    protocols,
    categories,
    roles,
    components,
    nameAliases,
    tags,
    tagsets,
    tagsetMembers,
    tokenStandards,
    metricGroups,
    metricGroupRules,
    labelStatuses,
    metricMembershipStatuses,
    assetStatuses,
    qualityTiers,
    flagBits,
  };
}

/** Canonical MQD-U1 dictionary snapshot for the current database state. */
export async function getCanonicalDictionarySnapshot(source?: CanonicalRowsSource): Promise<CanonicalDictionarySnapshot> {
  return buildCanonicalDictionarySnapshot(await loadCanonicalDictionaryRows(source));
}

export async function getResearchDictionarySnapshot(): Promise<ResearchDictionarySnapshot> {
  const rows = await loadCanonicalDictionaryRows();
  const snapshot = buildCanonicalDictionarySnapshot(rows);

  // Research resolution matches active records only. Inactive/retired rows
  // stay in the canonical snapshot (and its version) for historical decoding,
  // but must never resolve a new research row.
  const activeNameAliases = rows.nameAliases.filter(alias => alias.isActive);
  const approvedChainAliases = rows.chainAliases.filter(alias => alias.status === "approved");

  const aliasesFor = (subjectKind: string, subjectId: number) => activeNameAliases
    .filter(alias => alias.subjectKind === subjectKind && alias.subjectId === subjectId)
    .map(alias => alias.alias)
    .sort();
  const item = (subjectKind: string, id: number, code: string, name: string): ResearchDictionaryItem => ({
    id,
    code,
    name,
    aliases: aliasesFor(subjectKind, id),
  });
  const codecById = new Map(rows.codecs.map(codec => [codec.id, codec]));
  const networkById = new Map(rows.networks.map(network => [network.id, network]));
  const aliasesByNetwork = new Map<number, string[]>();
  for (const alias of approvedChainAliases) {
    if (alias.chainNetworkId === null) continue;
    const values = aliasesByNetwork.get(alias.chainNetworkId) ?? [];
    values.push(alias.rawChainName);
    aliasesByNetwork.set(alias.chainNetworkId, values);
  }

  const networkProfiles = rows.namespaces
    .filter(namespace => namespace.isActive)
    .flatMap(namespace => {
      const network = networkById.get(namespace.chainNetworkId);
      const codec = codecById.get(namespace.addressCodecId);
      if (!network || !codec || !network.isActive) return [];
      return [{
        networkId: network.id,
        networkCode: network.networkCode,
        networkName: network.networkName,
        aliases: [...new Set(aliasesByNetwork.get(network.id) ?? [])].sort(),
        namespaceId: namespace.id,
        prefixCode: namespace.legacyPrefixCode,
        addressCodecId: codec.id,
        codecCode: codec.codecCode,
        identifierKind: codec.identifierKind,
        parameters: {
          addressHrp: namespace.addressHrp,
          networkDiscriminator: namespace.networkDiscriminator,
        },
      }];
    });

  return {
    dictionaryVersion: snapshot.versionHash,
    entities: rows.entities.filter(value => value.isActive).map(value => item("entity", value.id, value.entityCode, value.entityName)),
    protocols: rows.protocols.filter(value => value.isActive).map(value => item("protocol", value.id, value.protocolCode, value.protocolName)),
    roles: rows.roles.filter(value => value.isActive).map(value => item("role", value.roleId, value.roleCode, value.roleName)),
    categories: rows.categories.filter(value => value.isActive).map(value => item("category", value.categoryId, value.categoryCode, value.categoryName)),
    components: rows.components.filter(value => value.isActive).map(value => item("component", value.id, value.componentCode, value.componentName)),
    tags: rows.tags.filter(value => value.isActive).map(value => item("tag", value.id, value.tagCode, value.tagName)),
    networkProfiles,
  };
}

export async function getRuntimeDictionaryDashboard() {
  const rows = await loadCanonicalDictionaryRows();
  const snapshot = buildCanonicalDictionarySnapshot(rows);
  const protocolById = new Map(rows.protocols.map(protocol => [protocol.id, protocol]));
  const componentAliases = new Map<number, string[]>();
  for (const alias of rows.nameAliases) {
    if (alias.subjectKind !== "component" || !alias.isActive) continue;
    componentAliases.set(alias.subjectId, [...(componentAliases.get(alias.subjectId) ?? []), alias.alias]);
  }

  return {
    dictionaryVersion: snapshot.versionHash,
    networks: rows.networks.map(network => ({ ...network })),
    namespaces: rows.namespaces.map(namespace => ({ ...namespace })),
    codecs: rows.codecs.map(codec => ({ ...codec })),
    components: rows.components.map(component => ({
      ...component,
      protocolCode: protocolById.get(component.protocolId)?.protocolCode ?? null,
      protocolName: protocolById.get(component.protocolId)?.protocolName ?? null,
      aliases: [...(componentAliases.get(component.id) ?? [])].sort(),
    })),
  };
}

export async function getDashboardStats() {
  const db = getDb();
  const [
    pendingCandidates,
    needsReview,
    approvedToday,
    rejectedToday,
    committedBatches,
    activeEntities,
    activeProtocols,
    activeLabels,
    unresolvedConflicts,
    metricEligibleCount,
  ] = await Promise.all([
    db.select({ value: count() }).from(mqWorkflowAddressCandidates).where(eq(mqWorkflowAddressCandidates.candidateStatus, "pending_review")),
    db.select({ value: count() }).from(mqWorkflowAddressCandidates).where(eq(mqWorkflowAddressCandidates.candidateStatus, "needs_more_evidence")),
    db
      .select({ value: count() })
      .from(mqWorkflowAddressCandidates)
      .where(sql`${mqWorkflowAddressCandidates.candidateStatus} = 'approved' and ${mqWorkflowAddressCandidates.updatedAt}::date = now()::date`),
    db
      .select({ value: count() })
      .from(mqWorkflowAddressCandidates)
      .where(sql`${mqWorkflowAddressCandidates.candidateStatus} = 'rejected' and ${mqWorkflowAddressCandidates.updatedAt}::date = now()::date`),
    db.select({ value: count() }).from(mqRegistryAddressLabels).where(sql`${mqRegistryAddressLabels.approvedBatchId} is not null`),
    db.select({ value: count() }).from(mqDictEntities).where(eq(mqDictEntities.isActive, true)),
    db.select({ value: count() }).from(mqDictProtocols).where(eq(mqDictProtocols.isActive, true)),
    db.select({ value: count() }).from(mqRegistryAddressLabels).where(eq(mqRegistryAddressLabels.isActive, true)),
    db.select({ value: count() }).from(mqWorkflowAddressCandidates).where(eq(mqWorkflowAddressCandidates.candidateStatus, "conflict_pending")),
    db.select({ value: count() }).from(mqRegistryAddressLabels).where(sql`(${mqRegistryAddressLabels.flags} & 1) = 1`),
  ]);

  return {
    pendingCandidates: pendingCandidates[0]?.value ?? 0,
    needsReview: needsReview[0]?.value ?? 0,
    approvedToday: approvedToday[0]?.value ?? 0,
    rejectedToday: rejectedToday[0]?.value ?? 0,
    committedBatches: committedBatches[0]?.value ?? 0,
    activeEntities: activeEntities[0]?.value ?? 0,
    activeProtocols: activeProtocols[0]?.value ?? 0,
    activeLabels: activeLabels[0]?.value ?? 0,
    unresolvedConflicts: unresolvedConflicts[0]?.value ?? 0,
    metricEligibleCount: metricEligibleCount[0]?.value ?? 0,
  };
}

type DictionarySnapshotForVersion = Awaited<ReturnType<typeof listDictionaries>>;

/** @deprecated Superseded by the canonical MQD-U1 snapshot in kv/contract.ts. Kept only for inventory display payloads. */
export function buildDictionaryVersionPayload(dictionaries: DictionarySnapshotForVersion) {
  return {
    categories: dictionaries.categories.map((item) => ({
      id: item.categoryId,
      code: item.categoryCode,
      name: item.categoryName,
      parent: item.parentCategoryId,
      domain: item.domainCode,
      metricDomain: item.metricDomain,
      description: item.description,
      active: item.isActive,
    })),
    entities: dictionaries.entities.map((item) => ({
      id: item.id,
      code: item.entityCode,
      name: item.entityName,
      type: item.entityType,
      categoryId: item.categoryId,
      websiteUrl: item.websiteUrl,
      description: item.description,
      active: item.isActive,
    })),
    protocols: dictionaries.protocols.map((item) => ({
      id: item.id,
      entityId: item.entityId,
      code: item.protocolCode,
      name: item.protocolName,
      type: item.protocolType,
      chains: item.chainScope,
      description: item.description,
      active: item.isActive,
    })),
    prefixes: dictionaries.prefixes.map((item) => ({
      prefixCode: item.prefixCode,
      chainCode: item.chainCode,
      chainName: item.chainName,
      family: item.chainFamily,
      addressFamily: item.addressFamily,
      codec: item.codec,
      payloadLen: item.payloadLen,
      evmChainId: item.evmChainId,
      description: item.description,
      active: item.isActive,
    })),
    roles: dictionaries.roles.map((item) => ({
      roleId: item.roleId,
      code: item.roleCode,
      name: item.roleName,
      categoryId: item.categoryId,
      group: item.roleGroup,
      metricUsage: item.metricUsageDefault,
      boundary: item.boundaryClass,
      qualityTier: item.defaultQualityTier,
      flags: item.defaultFlags,
      description: item.description,
      active: item.isActive,
    })),
    metricGroups: dictionaries.metricGroups.map((item) => ({
      id: item.id,
      code: item.metricGroupCode,
      name: item.metricGroupName,
      chainCode: item.chainCode,
      minConfidence: item.minConfidence,
      requireMetricEligible: item.requireMetricEligible,
      description: item.description,
      active: item.isActive,
    })),
    metricGroupRules: dictionaries.metricGroupRules.map((item) => ({
      id: item.id,
      metricGroupId: item.metricGroupId,
      ruleJson: item.ruleJson,
    })),
  };
}

function parseList(value?: string) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

type DictionaryVersionWriter = Pick<ReturnType<typeof getDb>, "select" | "insert">;

/**
 * Record the canonical MQD-U1 dictionary version for the current governed
 * dictionary state. This is the single dictionary-version algorithm shared by
 * research preflight, dictionary bundles, proposal application, batch commit
 * and KV build handoff. Historical version rows are never rewritten.
 */
export async function recordDictionaryVersion(
  actorId?: string | null,
  reason = "dictionary_changed",
  writer?: DictionaryVersionWriter,
) {
  const db = writer ?? getDb();
  const snapshot = await getCanonicalDictionarySnapshot(db);

  await db
    .insert(mqGovernanceDictionaryVersions)
    .values({
      versionHash: snapshot.versionHash,
      summary: {
        reason,
        dictionarySchemaVersion: snapshot.dictionarySchemaVersion,
        keySchemaVersion: snapshot.keySchemaVersion,
        valueSchemaVersion: snapshot.valueSchemaVersion,
        timelineSchemaVersion: snapshot.timelineSchemaVersion,
        metricSchemaVersion: snapshot.metricSchemaVersion,
        components: snapshot.components,
      },
      createdBy: actorId,
    })
    .onConflictDoNothing();

  return snapshot.versionHash;
}

async function auditDictionaryChange(actorId: string, action: string, targetTable: string, targetId: string | number, payload: Record<string, unknown>) {
  await getDb().insert(mqAuditEvents).values({
    actorId,
    action,
    targetTable,
    targetId: String(targetId),
    payload,
  });
}

export async function listDictionaryVersions(limit = 20) {
  return getDb().select().from(mqGovernanceDictionaryVersions).orderBy(desc(mqGovernanceDictionaryVersions.createdAt)).limit(limit);
}

export async function listDictionaryVersionHistory(input: unknown = {}) {
  const filters = parseDictionaryVersionListFilters(input);
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqGovernanceDictionaryVersions.versionHash, `%${filters.q}%`),
        sql`${mqGovernanceDictionaryVersions.summary}::text ilike ${`%${filters.q}%`}`,
        ilike(mqUsers.email, `%${filters.q}%`),
        ilike(mqUsers.displayName, `%${filters.q}%`),
      ),
    );
  }

  if (filters.reason) {
    conditions.push(sql`${mqGovernanceDictionaryVersions.summary}->>'reason' ilike ${`%${filters.reason}%`}`);
  }

  if (filters.actor) {
    addCondition(conditions, or(ilike(mqUsers.email, `%${filters.actor}%`), ilike(mqUsers.displayName, `%${filters.actor}%`)));
  }

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqGovernanceDictionaryVersions)
    .leftJoin(mqUsers, eq(mqGovernanceDictionaryVersions.createdBy, mqUsers.id))
    .where(where);
  const rows = await db
    .select({
      version: mqGovernanceDictionaryVersions,
      creatorEmail: mqUsers.email,
      creatorName: mqUsers.displayName,
    })
    .from(mqGovernanceDictionaryVersions)
    .leftJoin(mqUsers, eq(mqGovernanceDictionaryVersions.createdBy, mqUsers.id))
    .where(where)
    .orderBy(dictionaryVersionOrderBy(filters.sort), desc(mqGovernanceDictionaryVersions.id))
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

export async function getDictionaryOverview() {
  const [dictionaries, versions] = await Promise.all([
    listDictionaries(),
    listDictionaryVersions(20),
  ]);

  return {
    inventory: buildDictionaryInventory(dictionaries),
    versions,
    latestVersion: versions[0] ?? null,
  };
}

export async function createEntity(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = entitySchema.parse(input);
  const db = getDb();
  const [entity] = await db
    .insert(mqDictEntities)
    .values({
      entityCode: parsed.entityCode,
      entityName: parsed.entityName,
      entityType: parsed.entityType || null,
      categoryId: optionalNumber(parsed.categoryId),
      websiteUrl: parsed.websiteUrl || null,
      description: parsed.description || null,
    })
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "entity_created");
  await auditDictionaryChange(actor.id, "entity_created", "mq_dict_entities", entity.id, { entity, dictionaryVersion: hash });
  return entity;
}

export async function updateEntity(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = entityUpdateSchema.parse(input);
  const db = getDb();
  const [before] = await db.select().from(mqDictEntities).where(eq(mqDictEntities.id, parsed.id)).limit(1);

  if (!before) {
    throw new Error("Entity not found.");
  }

  const [entity] = await db
    .update(mqDictEntities)
    .set({
      entityCode: parsed.entityCode,
      entityName: parsed.entityName,
      entityType: parsed.entityType || null,
      categoryId: optionalNumber(parsed.categoryId),
      websiteUrl: parsed.websiteUrl || null,
      description: parsed.description || null,
      isActive: parsed.isActive,
      updatedAt: new Date(),
    })
    .where(eq(mqDictEntities.id, parsed.id))
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "entity_updated");
  await auditDictionaryChange(actor.id, "entity_updated", "mq_dict_entities", entity.id, { before, after: entity, dictionaryVersion: hash });
  return entity;
}

export async function deactivateEntity(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = idSchema.parse(input);
  const [entity] = await getDb()
    .update(mqDictEntities)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mqDictEntities.id, parsed.id))
    .returning();

  if (!entity) {
    throw new Error("Entity not found.");
  }

  const hash = await recordDictionaryVersion(actor.id, "entity_deactivated");
  await auditDictionaryChange(actor.id, "entity_deactivated", "mq_dict_entities", entity.id, { entity, dictionaryVersion: hash });
  return entity;
}

export async function createProtocol(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = protocolSchema.parse(input);
  const [protocol] = await getDb()
    .insert(mqDictProtocols)
    .values({
      entityId: parsed.entityId,
      protocolCode: parsed.protocolCode,
      protocolName: parsed.protocolName,
      protocolType: parsed.protocolType || null,
      chainScope: parseList(parsed.chainScope),
      description: parsed.description || null,
    })
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "protocol_created");
  await auditDictionaryChange(actor.id, "protocol_created", "mq_dict_protocols", protocol.id, { protocol, dictionaryVersion: hash });
  return protocol;
}

export async function updateProtocol(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = protocolUpdateSchema.parse(input);
  const db = getDb();
  const [before] = await db.select().from(mqDictProtocols).where(eq(mqDictProtocols.id, parsed.id)).limit(1);

  if (!before) {
    throw new Error("Protocol not found.");
  }

  const [protocol] = await db
    .update(mqDictProtocols)
    .set({
      entityId: parsed.entityId,
      protocolCode: parsed.protocolCode,
      protocolName: parsed.protocolName,
      protocolType: parsed.protocolType || null,
      chainScope: parseList(parsed.chainScope),
      description: parsed.description || null,
      isActive: parsed.isActive,
      updatedAt: new Date(),
    })
    .where(eq(mqDictProtocols.id, parsed.id))
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "protocol_updated");
  await auditDictionaryChange(actor.id, "protocol_updated", "mq_dict_protocols", protocol.id, { before, after: protocol, dictionaryVersion: hash });
  return protocol;
}

export async function deactivateProtocol(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = idSchema.parse(input);
  const [protocol] = await getDb()
    .update(mqDictProtocols)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mqDictProtocols.id, parsed.id))
    .returning();

  if (!protocol) {
    throw new Error("Protocol not found.");
  }

  const hash = await recordDictionaryVersion(actor.id, "protocol_deactivated");
  await auditDictionaryChange(actor.id, "protocol_deactivated", "mq_dict_protocols", protocol.id, { protocol, dictionaryVersion: hash });
  return protocol;
}

export async function createCategory(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = categorySchema.parse(input);
  const [category] = await getDb()
    .insert(mqDictCategories)
    .values({
      categoryId: parsed.categoryId,
      categoryCode: parsed.categoryCode,
      categoryName: parsed.categoryName,
      parentCategoryId: optionalNumber(parsed.parentCategoryId),
      domainCode: parsed.domainCode || null,
      metricDomain: parsed.metricDomain || null,
      description: parsed.description || null,
    })
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "category_created");
  await auditDictionaryChange(actor.id, "category_created", "mq_dict_categories", category.categoryId, { category, dictionaryVersion: hash });
  return category;
}

export async function updateCategory(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = categoryUpdateSchema.parse(input);
  const db = getDb();
  const [before] = await db.select().from(mqDictCategories).where(eq(mqDictCategories.categoryId, parsed.categoryId)).limit(1);

  if (!before) {
    throw new Error("Category not found.");
  }

  const [category] = await db
    .update(mqDictCategories)
    .set({
      categoryCode: parsed.categoryCode,
      categoryName: parsed.categoryName,
      parentCategoryId: optionalNumber(parsed.parentCategoryId),
      domainCode: parsed.domainCode || null,
      metricDomain: parsed.metricDomain || null,
      description: parsed.description || null,
      isActive: parsed.isActive,
      updatedAt: new Date(),
    })
    .where(eq(mqDictCategories.categoryId, parsed.categoryId))
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "category_updated");
  await auditDictionaryChange(actor.id, "category_updated", "mq_dict_categories", category.categoryId, { before, after: category, dictionaryVersion: hash });
  return category;
}

export async function deactivateCategory(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = idSchema.parse(input);
  const [category] = await getDb()
    .update(mqDictCategories)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mqDictCategories.categoryId, parsed.id))
    .returning();

  if (!category) {
    throw new Error("Category not found.");
  }

  const hash = await recordDictionaryVersion(actor.id, "category_deactivated");
  await auditDictionaryChange(actor.id, "category_deactivated", "mq_dict_categories", category.categoryId, { category, dictionaryVersion: hash });
  return category;
}

export async function createRole(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = roleSchema.parse(input);
  const defaultFlags = parsed.defaultFlags || buildDefaultFlags(parsed.roleCode, parsed.defaultQualityTier, parsed.metricUsageDefault?.includes("cex") ?? false);
  const [role] = await getDb()
    .insert(mqDictRoles)
    .values({
      roleId: parsed.roleId,
      roleCode: parsed.roleCode,
      roleName: parsed.roleName,
      categoryId: optionalNumber(parsed.categoryId),
      roleGroup: parsed.roleGroup || null,
      metricUsageDefault: parsed.metricUsageDefault || null,
      boundaryClass: parsed.boundaryClass || null,
      defaultQualityTier: parsed.defaultQualityTier,
      defaultFlags,
      description: parsed.description || null,
    })
    .returning();
  await getDb().insert(mqPolicyRoleApprovalRequirements).values({ roleId: role.roleId });

  const hash = await recordDictionaryVersion(actor.id, "role_created");
  await auditDictionaryChange(actor.id, "role_created", "mq_dict_roles", role.roleId, { role, dictionaryVersion: hash });
  return role;
}

export async function updateRole(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = roleUpdateSchema.parse(input);
  const db = getDb();
  const [before] = await db.select().from(mqDictRoles).where(eq(mqDictRoles.roleId, parsed.roleId)).limit(1);

  if (!before) {
    throw new Error("Role not found.");
  }

  const [role] = await db
    .update(mqDictRoles)
    .set({
      roleCode: parsed.roleCode,
      roleName: parsed.roleName,
      categoryId: optionalNumber(parsed.categoryId),
      roleGroup: parsed.roleGroup || null,
      metricUsageDefault: parsed.metricUsageDefault || null,
      boundaryClass: parsed.boundaryClass || null,
      defaultQualityTier: parsed.defaultQualityTier,
      defaultFlags: parsed.defaultFlags,
      description: parsed.description || null,
      isActive: parsed.isActive,
      updatedAt: new Date(),
    })
    .where(eq(mqDictRoles.roleId, parsed.roleId))
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "role_updated");
  await auditDictionaryChange(actor.id, "role_updated", "mq_dict_roles", role.roleId, { before, after: role, dictionaryVersion: hash });
  return role;
}

export async function deactivateRole(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = idSchema.parse(input);
  const [role] = await getDb()
    .update(mqDictRoles)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mqDictRoles.roleId, parsed.id))
    .returning();

  if (!role) {
    throw new Error("Role not found.");
  }

  const hash = await recordDictionaryVersion(actor.id, "role_deactivated");
  await auditDictionaryChange(actor.id, "role_deactivated", "mq_dict_roles", role.roleId, { role, dictionaryVersion: hash });
  return role;
}

export async function createKeyPrefix(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = keyPrefixSchema.parse(input);
  const [prefix] = await getDb()
    .insert(mqDictLegacyKeyPrefixes)
    .values({
      prefixCode: parsed.prefixCode,
      chainCode: parsed.chainCode,
      chainName: parsed.chainName || null,
      chainFamily: parsed.chainFamily,
      addressFamily: parsed.addressFamily,
      codec: parsed.codec,
      payloadLen: optionalNumber(parsed.payloadLen),
      evmChainId: optionalNumber(parsed.evmChainId),
      description: parsed.description || null,
    })
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "key_prefix_created");
  await auditDictionaryChange(actor.id, "key_prefix_created", "mq_dict_legacy_key_prefixes", prefix.prefixCode, { prefix, dictionaryVersion: hash });
  return prefix;
}

export async function updateKeyPrefix(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = keyPrefixUpdateSchema.parse(input);
  const db = getDb();
  const [before] = await db.select().from(mqDictLegacyKeyPrefixes).where(eq(mqDictLegacyKeyPrefixes.prefixCode, parsed.prefixCode)).limit(1);

  if (!before) {
    throw new Error("Key prefix not found.");
  }

  const [prefix] = await db
    .update(mqDictLegacyKeyPrefixes)
    .set({
      chainCode: parsed.chainCode,
      chainName: parsed.chainName || null,
      chainFamily: parsed.chainFamily,
      addressFamily: parsed.addressFamily,
      codec: parsed.codec,
      payloadLen: optionalNumber(parsed.payloadLen),
      evmChainId: optionalNumber(parsed.evmChainId),
      description: parsed.description || null,
      isActive: parsed.isActive,
      updatedAt: new Date(),
    })
    .where(eq(mqDictLegacyKeyPrefixes.prefixCode, parsed.prefixCode))
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "key_prefix_updated");
  await auditDictionaryChange(actor.id, "key_prefix_updated", "mq_dict_legacy_key_prefixes", prefix.prefixCode, { before, after: prefix, dictionaryVersion: hash });
  return prefix;
}

export async function deactivateKeyPrefix(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = idSchema.parse(input);
  const [prefix] = await getDb()
    .update(mqDictLegacyKeyPrefixes)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mqDictLegacyKeyPrefixes.prefixCode, parsed.id))
    .returning();

  if (!prefix) {
    throw new Error("Key prefix not found.");
  }

  const hash = await recordDictionaryVersion(actor.id, "key_prefix_deactivated");
  await auditDictionaryChange(actor.id, "key_prefix_deactivated", "mq_dict_legacy_key_prefixes", prefix.prefixCode, { prefix, dictionaryVersion: hash });
  return prefix;
}
