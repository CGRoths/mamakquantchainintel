import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressCandidates,
  mqAddressCodecs,
  mqAddressNamespaces,
  mqAddressRegistry,
  mqAuditLog,
  mqCategoryDict,
  mqChainAliases,
  mqChainNetworks,
  mqDictionaryVersions,
  mqEntities,
  mqKvKeyPrefixDict,
  mqKvRoleDict,
  mqMetricGroupRules,
  mqMetricGroups,
  mqNameAliases,
  mqProtocolComponents,
  mqProtocols,
  mqTagDict,
  mqUsers,
} from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";
import { buildDictionaryInventory } from "../dictionary-overview";
import { buildDefaultFlags } from "../flags";
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
import { hashJson, optionalNumber } from "./service-utils";

export async function listDictionaries() {
  const db = getDb();
  const [entities, protocols, roles, categories, prefixes, metricGroups, metricGroupRules] = await Promise.all([
    db.select().from(mqEntities).orderBy(asc(mqEntities.entityName)),
    db.select().from(mqProtocols).orderBy(asc(mqProtocols.protocolName)),
    db.select().from(mqKvRoleDict).orderBy(asc(mqKvRoleDict.roleId)),
    db.select().from(mqCategoryDict).orderBy(asc(mqCategoryDict.categoryId)),
    db.select().from(mqKvKeyPrefixDict).orderBy(asc(mqKvKeyPrefixDict.prefixCode)),
    db.select().from(mqMetricGroups).orderBy(asc(mqMetricGroups.metricGroupCode)),
    db.select().from(mqMetricGroupRules).orderBy(asc(mqMetricGroupRules.metricGroupId), asc(mqMetricGroupRules.id)),
  ]);

  return { entities, protocols, roles, categories, prefixes, metricGroups, metricGroupRules };
}

function entityDictionaryOrderBy(sort: EntityDictionaryListFilters["sort"]) {
  if (sort === "code") return asc(mqEntities.entityCode);
  if (sort === "type") return asc(mqEntities.entityType);
  if (sort === "created_at") return desc(mqEntities.createdAt);
  if (sort === "updated_at") return desc(mqEntities.updatedAt);
  return asc(mqEntities.entityName);
}

function categoryDictionaryOrderBy(sort: CategoryDictionaryListFilters["sort"]) {
  if (sort === "code") return asc(mqCategoryDict.categoryCode);
  if (sort === "name") return asc(mqCategoryDict.categoryName);
  if (sort === "domain") return asc(mqCategoryDict.domainCode);
  if (sort === "created_at") return desc(mqCategoryDict.createdAt);
  if (sort === "updated_at") return desc(mqCategoryDict.updatedAt);
  return asc(mqCategoryDict.categoryId);
}

function protocolDictionaryOrderBy(sort: ProtocolDictionaryListFilters["sort"]) {
  if (sort === "code") return asc(mqProtocols.protocolCode);
  if (sort === "type") return asc(mqProtocols.protocolType);
  if (sort === "entity") return asc(mqEntities.entityName);
  if (sort === "created_at") return desc(mqProtocols.createdAt);
  if (sort === "updated_at") return desc(mqProtocols.updatedAt);
  return asc(mqProtocols.protocolName);
}

function roleDictionaryOrderBy(sort: RoleDictionaryListFilters["sort"]) {
  if (sort === "code") return asc(mqKvRoleDict.roleCode);
  if (sort === "name") return asc(mqKvRoleDict.roleName);
  if (sort === "group") return asc(mqKvRoleDict.roleGroup);
  if (sort === "quality") return desc(mqKvRoleDict.defaultQualityTier);
  if (sort === "created_at") return desc(mqKvRoleDict.createdAt);
  if (sort === "updated_at") return desc(mqKvRoleDict.updatedAt);
  return asc(mqKvRoleDict.roleId);
}

function keyPrefixDictionaryOrderBy(sort: KeyPrefixDictionaryListFilters["sort"]) {
  if (sort === "chain") return asc(mqKvKeyPrefixDict.chainCode);
  if (sort === "chain_family") return asc(mqKvKeyPrefixDict.chainFamily);
  if (sort === "address_family") return asc(mqKvKeyPrefixDict.addressFamily);
  if (sort === "codec") return asc(mqKvKeyPrefixDict.codec);
  if (sort === "created_at") return desc(mqKvKeyPrefixDict.createdAt);
  if (sort === "updated_at") return desc(mqKvKeyPrefixDict.updatedAt);
  return asc(mqKvKeyPrefixDict.prefixCode);
}

function dictionaryVersionOrderBy(sort: DictionaryVersionListFilters["sort"]) {
  if (sort === "hash") return asc(mqDictionaryVersions.versionHash);
  if (sort === "reason") return asc(sql`${mqDictionaryVersions.summary}->>'reason'`);
  return desc(mqDictionaryVersions.createdAt);
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
        ilike(mqEntities.entityCode, `%${filters.q}%`),
        ilike(mqEntities.entityName, `%${filters.q}%`),
        ilike(mqEntities.entityType, `%${filters.q}%`),
        ilike(mqEntities.websiteUrl, `%${filters.q}%`),
        ilike(mqEntities.description, `%${filters.q}%`),
        sql`${mqEntities.id}::text ilike ${`%${filters.q}%`}`,
      ),
    );
  }

  if (filters.entityType) conditions.push(ilike(mqEntities.entityType, `%${filters.entityType}%`));
  if (filters.category) {
    addCondition(
      conditions,
      or(
        sql`${mqEntities.categoryId}::text ilike ${`%${filters.category}%`}`,
        ilike(mqCategoryDict.categoryCode, `%${filters.category}%`),
        ilike(mqCategoryDict.categoryName, `%${filters.category}%`),
      ),
    );
  }
  if (filters.active === "active") conditions.push(eq(mqEntities.isActive, true));
  if (filters.active === "inactive") conditions.push(eq(mqEntities.isActive, false));

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqEntities)
    .leftJoin(mqCategoryDict, eq(mqEntities.categoryId, mqCategoryDict.categoryId))
    .where(where);
  const rows = await db
    .select({ entity: mqEntities, category: mqCategoryDict })
    .from(mqEntities)
    .leftJoin(mqCategoryDict, eq(mqEntities.categoryId, mqCategoryDict.categoryId))
    .where(where)
    .orderBy(entityDictionaryOrderBy(filters.sort), asc(mqEntities.id))
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
        sql`${mqKvKeyPrefixDict.prefixCode}::text ilike ${`%${filters.q}%`}`,
        ilike(mqKvKeyPrefixDict.chainCode, `%${filters.q}%`),
        ilike(mqKvKeyPrefixDict.chainName, `%${filters.q}%`),
        ilike(mqKvKeyPrefixDict.chainFamily, `%${filters.q}%`),
        ilike(mqKvKeyPrefixDict.addressFamily, `%${filters.q}%`),
        ilike(mqKvKeyPrefixDict.codec, `%${filters.q}%`),
        ilike(mqKvKeyPrefixDict.description, `%${filters.q}%`),
        sql`${mqKvKeyPrefixDict.payloadLen}::text ilike ${`%${filters.q}%`}`,
        sql`${mqKvKeyPrefixDict.evmChainId}::text ilike ${`%${filters.q}%`}`,
      ),
    );
  }

  if (filters.chain) {
    addCondition(
      conditions,
      or(
        ilike(mqKvKeyPrefixDict.chainCode, `%${filters.chain}%`),
        ilike(mqKvKeyPrefixDict.chainName, `%${filters.chain}%`),
      ),
    );
  }
  if (filters.chainFamily) conditions.push(ilike(mqKvKeyPrefixDict.chainFamily, `%${filters.chainFamily}%`));
  if (filters.addressFamily) conditions.push(ilike(mqKvKeyPrefixDict.addressFamily, `%${filters.addressFamily}%`));
  if (filters.codec) conditions.push(ilike(mqKvKeyPrefixDict.codec, `%${filters.codec}%`));
  if (filters.evmChainId !== undefined) conditions.push(eq(mqKvKeyPrefixDict.evmChainId, filters.evmChainId));
  if (filters.minPayloadLen !== undefined) conditions.push(sql`${mqKvKeyPrefixDict.payloadLen} >= ${filters.minPayloadLen}`);
  if (filters.maxPayloadLen !== undefined) conditions.push(sql`${mqKvKeyPrefixDict.payloadLen} <= ${filters.maxPayloadLen}`);
  if (filters.active === "active") conditions.push(eq(mqKvKeyPrefixDict.isActive, true));
  if (filters.active === "inactive") conditions.push(eq(mqKvKeyPrefixDict.isActive, false));

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqKvKeyPrefixDict)
    .where(where);
  const rows = await db
    .select()
    .from(mqKvKeyPrefixDict)
    .where(where)
    .orderBy(keyPrefixDictionaryOrderBy(filters.sort), asc(mqKvKeyPrefixDict.prefixCode))
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
        sql`${mqKvRoleDict.roleId}::text ilike ${`%${filters.q}%`}`,
        ilike(mqKvRoleDict.roleCode, `%${filters.q}%`),
        ilike(mqKvRoleDict.roleName, `%${filters.q}%`),
        ilike(mqKvRoleDict.roleGroup, `%${filters.q}%`),
        ilike(mqKvRoleDict.metricUsageDefault, `%${filters.q}%`),
        ilike(mqKvRoleDict.boundaryClass, `%${filters.q}%`),
        ilike(mqKvRoleDict.description, `%${filters.q}%`),
        sql`${mqKvRoleDict.defaultFlags}::text ilike ${`%${filters.q}%`}`,
        sql`${mqKvRoleDict.categoryId}::text ilike ${`%${filters.q}%`}`,
        ilike(mqCategoryDict.categoryCode, `%${filters.q}%`),
        ilike(mqCategoryDict.categoryName, `%${filters.q}%`),
      ),
    );
  }

  if (filters.category) {
    addCondition(
      conditions,
      or(
        sql`${mqKvRoleDict.categoryId}::text ilike ${`%${filters.category}%`}`,
        ilike(mqCategoryDict.categoryCode, `%${filters.category}%`),
        ilike(mqCategoryDict.categoryName, `%${filters.category}%`),
      ),
    );
  }
  if (filters.roleGroup) conditions.push(ilike(mqKvRoleDict.roleGroup, `%${filters.roleGroup}%`));
  if (filters.metricUsage) conditions.push(ilike(mqKvRoleDict.metricUsageDefault, `%${filters.metricUsage}%`));
  if (filters.boundary) conditions.push(ilike(mqKvRoleDict.boundaryClass, `%${filters.boundary}%`));
  if (filters.minQuality !== undefined) conditions.push(sql`${mqKvRoleDict.defaultQualityTier} >= ${filters.minQuality}`);
  if (filters.maxQuality !== undefined) conditions.push(sql`${mqKvRoleDict.defaultQualityTier} <= ${filters.maxQuality}`);
  if (filters.active === "active") conditions.push(eq(mqKvRoleDict.isActive, true));
  if (filters.active === "inactive") conditions.push(eq(mqKvRoleDict.isActive, false));

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqKvRoleDict)
    .leftJoin(mqCategoryDict, eq(mqKvRoleDict.categoryId, mqCategoryDict.categoryId))
    .where(where);
  const rows = await db
    .select({ role: mqKvRoleDict, category: mqCategoryDict })
    .from(mqKvRoleDict)
    .leftJoin(mqCategoryDict, eq(mqKvRoleDict.categoryId, mqCategoryDict.categoryId))
    .where(where)
    .orderBy(roleDictionaryOrderBy(filters.sort), asc(mqKvRoleDict.roleId))
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
        sql`${mqProtocols.id}::text ilike ${`%${filters.q}%`}`,
        ilike(mqProtocols.protocolCode, `%${filters.q}%`),
        ilike(mqProtocols.protocolName, `%${filters.q}%`),
        ilike(mqProtocols.protocolType, `%${filters.q}%`),
        ilike(mqProtocols.description, `%${filters.q}%`),
        sql`array_to_string(${mqProtocols.chainScope}, ',') ilike ${`%${filters.q}%`}`,
        sql`${mqProtocols.entityId}::text ilike ${`%${filters.q}%`}`,
        ilike(mqEntities.entityCode, `%${filters.q}%`),
        ilike(mqEntities.entityName, `%${filters.q}%`),
      ),
    );
  }

  if (filters.entity) {
    addCondition(
      conditions,
      or(
        sql`${mqProtocols.entityId}::text ilike ${`%${filters.entity}%`}`,
        ilike(mqEntities.entityCode, `%${filters.entity}%`),
        ilike(mqEntities.entityName, `%${filters.entity}%`),
      ),
    );
  }
  if (filters.protocolType) conditions.push(ilike(mqProtocols.protocolType, `%${filters.protocolType}%`));
  if (filters.chain) {
    addCondition(
      conditions,
      or(
        sql`${filters.chain} = any(${mqProtocols.chainScope})`,
        sql`array_to_string(${mqProtocols.chainScope}, ',') ilike ${`%${filters.chain}%`}`,
      ),
    );
  }
  if (filters.active === "active") conditions.push(eq(mqProtocols.isActive, true));
  if (filters.active === "inactive") conditions.push(eq(mqProtocols.isActive, false));

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqProtocols)
    .leftJoin(mqEntities, eq(mqProtocols.entityId, mqEntities.id))
    .where(where);
  const rows = await db
    .select({ protocol: mqProtocols, entity: mqEntities })
    .from(mqProtocols)
    .leftJoin(mqEntities, eq(mqProtocols.entityId, mqEntities.id))
    .where(where)
    .orderBy(protocolDictionaryOrderBy(filters.sort), asc(mqProtocols.id))
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
        sql`${mqCategoryDict.categoryId}::text ilike ${`%${filters.q}%`}`,
        sql`${mqCategoryDict.parentCategoryId}::text ilike ${`%${filters.q}%`}`,
        ilike(mqCategoryDict.categoryCode, `%${filters.q}%`),
        ilike(mqCategoryDict.categoryName, `%${filters.q}%`),
        ilike(mqCategoryDict.domainCode, `%${filters.q}%`),
        ilike(mqCategoryDict.metricDomain, `%${filters.q}%`),
        ilike(mqCategoryDict.description, `%${filters.q}%`),
      ),
    );
  }

  if (filters.domain) conditions.push(ilike(mqCategoryDict.domainCode, `%${filters.domain}%`));
  if (filters.metricDomain) conditions.push(ilike(mqCategoryDict.metricDomain, `%${filters.metricDomain}%`));
  if (filters.active === "active") conditions.push(eq(mqCategoryDict.isActive, true));
  if (filters.active === "inactive") conditions.push(eq(mqCategoryDict.isActive, false));

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqCategoryDict)
    .where(where);
  const rows = await db
    .select()
    .from(mqCategoryDict)
    .where(where)
    .orderBy(categoryDictionaryOrderBy(filters.sort), asc(mqCategoryDict.categoryId))
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

export async function getResearchDictionarySnapshot(): Promise<ResearchDictionarySnapshot> {
  const db = getDb();
  const [dictionaries, networks, namespaces, codecs, chainAliases, nameAliases, components, tags] = await Promise.all([
    listDictionaries(),
    db.select().from(mqChainNetworks).orderBy(asc(mqChainNetworks.id)),
    db.select().from(mqAddressNamespaces).orderBy(asc(mqAddressNamespaces.id)),
    db.select().from(mqAddressCodecs).orderBy(asc(mqAddressCodecs.id)),
    db.select().from(mqChainAliases).where(eq(mqChainAliases.status, "approved")).orderBy(asc(mqChainAliases.id)),
    db.select().from(mqNameAliases).where(eq(mqNameAliases.isActive, true)).orderBy(asc(mqNameAliases.id)),
    db.select().from(mqProtocolComponents).orderBy(asc(mqProtocolComponents.id)),
    db.select().from(mqTagDict).orderBy(asc(mqTagDict.id)),
  ]);

  const aliasesFor = (subjectKind: string, subjectId: number) => nameAliases
    .filter(alias => alias.subjectKind === subjectKind && alias.subjectId === subjectId)
    .map(alias => alias.alias)
    .sort();
  const item = (subjectKind: string, id: number, code: string, name: string): ResearchDictionaryItem => ({
    id,
    code,
    name,
    aliases: aliasesFor(subjectKind, id),
  });
  const codecById = new Map(codecs.map(codec => [codec.id, codec]));
  const networkById = new Map(networks.map(network => [network.id, network]));
  const aliasesByNetwork = new Map<number, string[]>();
  for (const alias of chainAliases) {
    if (alias.chainNetworkId === null) continue;
    const values = aliasesByNetwork.get(alias.chainNetworkId) ?? [];
    values.push(alias.rawChainName);
    aliasesByNetwork.set(alias.chainNetworkId, values);
  }

  const networkProfiles = namespaces
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

  const snapshotWithoutVersion = {
    entities: dictionaries.entities.map(value => item("entity", value.id, value.entityCode, value.entityName)),
    protocols: dictionaries.protocols.map(value => item("protocol", value.id, value.protocolCode, value.protocolName)),
    roles: dictionaries.roles.map(value => item("role", value.roleId, value.roleCode, value.roleName)),
    categories: dictionaries.categories.map(value => item("category", value.categoryId, value.categoryCode, value.categoryName)),
    components: components.map(value => item("component", value.id, value.componentCode, value.componentName)),
    tags: tags.map(value => item("tag", value.id, value.tagCode, value.tagName)),
    networkProfiles,
  };

  return {
    dictionaryVersion: hashJson(snapshotWithoutVersion),
    ...snapshotWithoutVersion,
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
    db.select({ value: count() }).from(mqAddressCandidates).where(eq(mqAddressCandidates.candidateStatus, "pending_review")),
    db.select({ value: count() }).from(mqAddressCandidates).where(eq(mqAddressCandidates.candidateStatus, "needs_more_evidence")),
    db
      .select({ value: count() })
      .from(mqAddressCandidates)
      .where(sql`${mqAddressCandidates.candidateStatus} = 'approved' and ${mqAddressCandidates.updatedAt}::date = now()::date`),
    db
      .select({ value: count() })
      .from(mqAddressCandidates)
      .where(sql`${mqAddressCandidates.candidateStatus} = 'rejected' and ${mqAddressCandidates.updatedAt}::date = now()::date`),
    db.select({ value: count() }).from(mqAddressRegistry).where(sql`${mqAddressRegistry.approvedBatchId} is not null`),
    db.select({ value: count() }).from(mqEntities).where(eq(mqEntities.isActive, true)),
    db.select({ value: count() }).from(mqProtocols).where(eq(mqProtocols.isActive, true)),
    db.select({ value: count() }).from(mqAddressRegistry).where(eq(mqAddressRegistry.isActive, true)),
    db.select({ value: count() }).from(mqAddressCandidates).where(eq(mqAddressCandidates.candidateStatus, "conflict_pending")),
    db.select({ value: count() }).from(mqAddressRegistry).where(sql`(${mqAddressRegistry.flags} & 1) = 1`),
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

function versionHash(payload: unknown) {
  return hashJson(payload);
}

type DictionarySnapshotForVersion = Awaited<ReturnType<typeof listDictionaries>>;

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

export async function recordDictionaryVersion(actorId?: string | null, reason = "dictionary_changed") {
  const db = getDb();
  const dictionaries = await listDictionaries();
  const payload = buildDictionaryVersionPayload(dictionaries);
  const hash = versionHash(payload);

  await db
    .insert(mqDictionaryVersions)
    .values({
      versionHash: hash,
      summary: {
        reason,
        counts: {
          categories: dictionaries.categories.length,
          entities: dictionaries.entities.length,
          protocols: dictionaries.protocols.length,
          prefixes: dictionaries.prefixes.length,
          roles: dictionaries.roles.length,
          metricGroups: dictionaries.metricGroups.length,
          metricGroupRules: dictionaries.metricGroupRules.length,
        },
      },
      createdBy: actorId,
    })
    .onConflictDoNothing();

  return hash;
}

async function auditDictionaryChange(actorId: string, action: string, targetTable: string, targetId: string | number, payload: Record<string, unknown>) {
  await getDb().insert(mqAuditLog).values({
    actorId,
    action,
    targetTable,
    targetId: String(targetId),
    payload,
  });
}

export async function listDictionaryVersions(limit = 20) {
  return getDb().select().from(mqDictionaryVersions).orderBy(desc(mqDictionaryVersions.createdAt)).limit(limit);
}

export async function listDictionaryVersionHistory(input: unknown = {}) {
  const filters = parseDictionaryVersionListFilters(input);
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqDictionaryVersions.versionHash, `%${filters.q}%`),
        sql`${mqDictionaryVersions.summary}::text ilike ${`%${filters.q}%`}`,
        ilike(mqUsers.email, `%${filters.q}%`),
        ilike(mqUsers.displayName, `%${filters.q}%`),
      ),
    );
  }

  if (filters.reason) {
    conditions.push(sql`${mqDictionaryVersions.summary}->>'reason' ilike ${`%${filters.reason}%`}`);
  }

  if (filters.actor) {
    addCondition(conditions, or(ilike(mqUsers.email, `%${filters.actor}%`), ilike(mqUsers.displayName, `%${filters.actor}%`)));
  }

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqDictionaryVersions)
    .leftJoin(mqUsers, eq(mqDictionaryVersions.createdBy, mqUsers.id))
    .where(where);
  const rows = await db
    .select({
      version: mqDictionaryVersions,
      creatorEmail: mqUsers.email,
      creatorName: mqUsers.displayName,
    })
    .from(mqDictionaryVersions)
    .leftJoin(mqUsers, eq(mqDictionaryVersions.createdBy, mqUsers.id))
    .where(where)
    .orderBy(dictionaryVersionOrderBy(filters.sort), desc(mqDictionaryVersions.id))
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
    .insert(mqEntities)
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
  await auditDictionaryChange(actor.id, "entity_created", "mq_entities", entity.id, { entity, dictionaryVersion: hash });
  return entity;
}

export async function updateEntity(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = entityUpdateSchema.parse(input);
  const db = getDb();
  const [before] = await db.select().from(mqEntities).where(eq(mqEntities.id, parsed.id)).limit(1);

  if (!before) {
    throw new Error("Entity not found.");
  }

  const [entity] = await db
    .update(mqEntities)
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
    .where(eq(mqEntities.id, parsed.id))
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "entity_updated");
  await auditDictionaryChange(actor.id, "entity_updated", "mq_entities", entity.id, { before, after: entity, dictionaryVersion: hash });
  return entity;
}

export async function deactivateEntity(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = idSchema.parse(input);
  const [entity] = await getDb()
    .update(mqEntities)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mqEntities.id, parsed.id))
    .returning();

  if (!entity) {
    throw new Error("Entity not found.");
  }

  const hash = await recordDictionaryVersion(actor.id, "entity_deactivated");
  await auditDictionaryChange(actor.id, "entity_deactivated", "mq_entities", entity.id, { entity, dictionaryVersion: hash });
  return entity;
}

export async function createProtocol(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = protocolSchema.parse(input);
  const [protocol] = await getDb()
    .insert(mqProtocols)
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
  await auditDictionaryChange(actor.id, "protocol_created", "mq_protocols", protocol.id, { protocol, dictionaryVersion: hash });
  return protocol;
}

export async function updateProtocol(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = protocolUpdateSchema.parse(input);
  const db = getDb();
  const [before] = await db.select().from(mqProtocols).where(eq(mqProtocols.id, parsed.id)).limit(1);

  if (!before) {
    throw new Error("Protocol not found.");
  }

  const [protocol] = await db
    .update(mqProtocols)
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
    .where(eq(mqProtocols.id, parsed.id))
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "protocol_updated");
  await auditDictionaryChange(actor.id, "protocol_updated", "mq_protocols", protocol.id, { before, after: protocol, dictionaryVersion: hash });
  return protocol;
}

export async function deactivateProtocol(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = idSchema.parse(input);
  const [protocol] = await getDb()
    .update(mqProtocols)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mqProtocols.id, parsed.id))
    .returning();

  if (!protocol) {
    throw new Error("Protocol not found.");
  }

  const hash = await recordDictionaryVersion(actor.id, "protocol_deactivated");
  await auditDictionaryChange(actor.id, "protocol_deactivated", "mq_protocols", protocol.id, { protocol, dictionaryVersion: hash });
  return protocol;
}

export async function createCategory(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = categorySchema.parse(input);
  const [category] = await getDb()
    .insert(mqCategoryDict)
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
  await auditDictionaryChange(actor.id, "category_created", "mq_category_dict", category.categoryId, { category, dictionaryVersion: hash });
  return category;
}

export async function updateCategory(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = categoryUpdateSchema.parse(input);
  const db = getDb();
  const [before] = await db.select().from(mqCategoryDict).where(eq(mqCategoryDict.categoryId, parsed.categoryId)).limit(1);

  if (!before) {
    throw new Error("Category not found.");
  }

  const [category] = await db
    .update(mqCategoryDict)
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
    .where(eq(mqCategoryDict.categoryId, parsed.categoryId))
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "category_updated");
  await auditDictionaryChange(actor.id, "category_updated", "mq_category_dict", category.categoryId, { before, after: category, dictionaryVersion: hash });
  return category;
}

export async function deactivateCategory(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = idSchema.parse(input);
  const [category] = await getDb()
    .update(mqCategoryDict)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mqCategoryDict.categoryId, parsed.id))
    .returning();

  if (!category) {
    throw new Error("Category not found.");
  }

  const hash = await recordDictionaryVersion(actor.id, "category_deactivated");
  await auditDictionaryChange(actor.id, "category_deactivated", "mq_category_dict", category.categoryId, { category, dictionaryVersion: hash });
  return category;
}

export async function createRole(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = roleSchema.parse(input);
  const defaultFlags = parsed.defaultFlags || buildDefaultFlags(parsed.roleCode, parsed.defaultQualityTier, parsed.metricUsageDefault?.includes("cex") ?? false);
  const [role] = await getDb()
    .insert(mqKvRoleDict)
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

  const hash = await recordDictionaryVersion(actor.id, "role_created");
  await auditDictionaryChange(actor.id, "role_created", "mq_kv_role_dict", role.roleId, { role, dictionaryVersion: hash });
  return role;
}

export async function updateRole(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = roleUpdateSchema.parse(input);
  const db = getDb();
  const [before] = await db.select().from(mqKvRoleDict).where(eq(mqKvRoleDict.roleId, parsed.roleId)).limit(1);

  if (!before) {
    throw new Error("Role not found.");
  }

  const [role] = await db
    .update(mqKvRoleDict)
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
    .where(eq(mqKvRoleDict.roleId, parsed.roleId))
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "role_updated");
  await auditDictionaryChange(actor.id, "role_updated", "mq_kv_role_dict", role.roleId, { before, after: role, dictionaryVersion: hash });
  return role;
}

export async function deactivateRole(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = idSchema.parse(input);
  const [role] = await getDb()
    .update(mqKvRoleDict)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mqKvRoleDict.roleId, parsed.id))
    .returning();

  if (!role) {
    throw new Error("Role not found.");
  }

  const hash = await recordDictionaryVersion(actor.id, "role_deactivated");
  await auditDictionaryChange(actor.id, "role_deactivated", "mq_kv_role_dict", role.roleId, { role, dictionaryVersion: hash });
  return role;
}

export async function createKeyPrefix(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = keyPrefixSchema.parse(input);
  const [prefix] = await getDb()
    .insert(mqKvKeyPrefixDict)
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
  await auditDictionaryChange(actor.id, "key_prefix_created", "mq_kv_key_prefix_dict", prefix.prefixCode, { prefix, dictionaryVersion: hash });
  return prefix;
}

export async function updateKeyPrefix(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = keyPrefixUpdateSchema.parse(input);
  const db = getDb();
  const [before] = await db.select().from(mqKvKeyPrefixDict).where(eq(mqKvKeyPrefixDict.prefixCode, parsed.prefixCode)).limit(1);

  if (!before) {
    throw new Error("Key prefix not found.");
  }

  const [prefix] = await db
    .update(mqKvKeyPrefixDict)
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
    .where(eq(mqKvKeyPrefixDict.prefixCode, parsed.prefixCode))
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "key_prefix_updated");
  await auditDictionaryChange(actor.id, "key_prefix_updated", "mq_kv_key_prefix_dict", prefix.prefixCode, { before, after: prefix, dictionaryVersion: hash });
  return prefix;
}

export async function deactivateKeyPrefix(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = idSchema.parse(input);
  const [prefix] = await getDb()
    .update(mqKvKeyPrefixDict)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mqKvKeyPrefixDict.prefixCode, parsed.id))
    .returning();

  if (!prefix) {
    throw new Error("Key prefix not found.");
  }

  const hash = await recordDictionaryVersion(actor.id, "key_prefix_deactivated");
  await auditDictionaryChange(actor.id, "key_prefix_deactivated", "mq_kv_key_prefix_dict", prefix.prefixCode, { prefix, dictionaryVersion: hash });
  return prefix;
}
