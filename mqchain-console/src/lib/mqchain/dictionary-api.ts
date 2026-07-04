import { hashJson } from "./services/service-utils";

export const DICTIONARY_SNAPSHOT_API_CONTRACT = {
  apiVersion: "mqchain-dictionary-snapshot-api-v1",
  sourceOfTruth: "postgres_dictionaries",
  servingBackend: "postgres",
  artifactType: "dictionary_snapshot_export",
  mutationAllowed: false,
  dictionaryWriteAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  postgresIsCanonicalTruth: true,
  rocksDbIsCompiledArtifact: true,
} as const;

export const DICTIONARY_VERSION_HISTORY_API_CONTRACT = {
  apiVersion: "mqchain-dictionary-version-history-api-v1",
  sourceOfTruth: "postgres_dictionary_versions",
  servingBackend: "postgres",
  artifactType: "dictionary_version_history_export",
  mutationAllowed: false,
  dictionaryWriteAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
  fullSummaryIncluded: false,
  postgresIsCanonicalTruth: true,
  rocksDbIsCompiledArtifact: true,
} as const;

type JsonRecord = Record<string, unknown>;

export type DictionarySnapshotScope = "active" | "all";

export type DictionarySnapshotInput = {
  scope: DictionarySnapshotScope;
  dictionaries: {
    categories: Array<{
      categoryId: number;
      categoryCode: string;
      categoryName: string;
      parentCategoryId: number | null;
      domainCode: string | null;
      metricDomain: string | null;
      description: string | null;
      isActive: boolean;
      updatedAt: Date;
    }>;
    entities: Array<{
      id: number;
      entityCode: string;
      entityName: string;
      entityType: string | null;
      categoryId: number | null;
      websiteUrl: string | null;
      description: string | null;
      isActive: boolean;
      updatedAt: Date;
    }>;
    protocols: Array<{
      id: number;
      entityId: number | null;
      protocolCode: string;
      protocolName: string;
      protocolType: string | null;
      chainScope: string[] | null;
      description: string | null;
      isActive: boolean;
      updatedAt: Date;
    }>;
    prefixes: Array<{
      prefixCode: number;
      chainCode: string;
      chainName: string | null;
      chainFamily: string;
      addressFamily: string;
      codec: string;
      payloadLen: number | null;
      evmChainId: number | null;
      description: string | null;
      isActive: boolean;
      updatedAt: Date;
    }>;
    roles: Array<{
      roleId: number;
      roleCode: string;
      roleName: string;
      categoryId: number | null;
      roleGroup: string | null;
      metricUsageDefault: string | null;
      boundaryClass: string | null;
      defaultQualityTier: number;
      defaultFlags: number;
      description: string | null;
      isActive: boolean;
      updatedAt: Date;
    }>;
    metricGroups: Array<{
      id: number;
      metricGroupCode: string;
      metricGroupName: string;
      chainCode: string | null;
      minConfidence: number;
      requireMetricEligible: boolean;
      description: string | null;
      isActive: boolean;
      updatedAt: Date;
    }>;
    metricGroupRules: Array<{
      id: number;
      metricGroupId: number | null;
      ruleJson: JsonRecord;
      createdAt: Date;
    }>;
  };
  latestVersion?: {
    versionHash: string;
    summary: JsonRecord;
    createdAt: Date;
  } | null;
};

export type DictionaryVersionHistoryApiInput = {
  query: {
    page: number;
    pageSize: number;
    filters: Record<string, unknown>;
  };
  rows: Array<{
    version: {
      id: number;
      versionHash: string;
      summary: JsonRecord;
      createdBy: string | null;
      createdAt: Date;
    };
    creatorEmail: string | null;
    creatorName: string | null;
  }>;
  total: number;
  totalPages: number;
};

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function filterActive<T extends { isActive: boolean }>(rows: T[], scope: DictionarySnapshotScope) {
  return scope === "active" ? rows.filter((row) => row.isActive) : rows;
}

function activeCount(rows: { isActive: boolean }[]) {
  return rows.filter((row) => row.isActive).length;
}

function metadataKeys(value: JsonRecord | null | undefined) {
  return Object.keys(value ?? {}).sort((left, right) => left.localeCompare(right));
}

function metadataNumber(value: JsonRecord, key: string) {
  const item = value[key];
  return typeof item === "number" && Number.isFinite(item) ? item : null;
}

function metadataRecord(value: JsonRecord, key: string) {
  const item = value[key];
  return item && typeof item === "object" && !Array.isArray(item) ? (item as JsonRecord) : {};
}

function serializeDictionaryVersionRow(row: DictionaryVersionHistoryApiInput["rows"][number]) {
  const counts = metadataRecord(row.version.summary, "counts");

  return {
    id: row.version.id,
    versionHash: row.version.versionHash,
    reason: typeof row.version.summary.reason === "string" ? row.version.summary.reason : null,
    summaryKeys: metadataKeys(row.version.summary),
    counts: {
      categories: metadataNumber(counts, "categories"),
      entities: metadataNumber(counts, "entities"),
      protocols: metadataNumber(counts, "protocols"),
      keyPrefixes: metadataNumber(counts, "prefixes"),
      roles: metadataNumber(counts, "roles"),
      metricGroups: metadataNumber(counts, "metricGroups"),
      metricGroupRules: metadataNumber(counts, "metricGroupRules"),
    },
    createdBy: {
      id: row.version.createdBy,
      email: row.creatorEmail,
      name: row.creatorName,
    },
    createdAt: isoDate(row.version.createdAt),
    currentSnapshotApi: "/api/mqchain/dictionaries?scope=all",
  };
}

export function buildDictionaryVersionHistoryApiResponse(input: DictionaryVersionHistoryApiInput) {
  return {
    ...DICTIONARY_VERSION_HISTORY_API_CONTRACT,
    query: input.query,
    pagination: {
      totalRows: input.total,
      page: input.query.page,
      pageSize: input.query.pageSize,
      totalPages: input.totalPages,
      returnedRows: input.rows.length,
    },
    rows: input.rows.map(serializeDictionaryVersionRow),
    canonicalWrites: {
      dictionaryRowsCreated: 0,
      registryRowsCreated: 0,
      kvBuildsCreated: 0,
    },
    policy: {
      dictionaryVersionsAreReadOnly: true,
      dictionaryVersionHashControlsCompilerHandoff: true,
      dictionaryMutationsCreateNewVersions: true,
      metricGroupRulesArePartOfDictionaryVersion: true,
      fullVersionSummaryExcludedByDefault: true,
      externalWorkersMustUseVersionHashForKvCompileProvenance: true,
      rocksDbMustNotBecomeDictionaryTruth: true,
    },
  };
}

export function buildDictionarySnapshotApiResponse(input: DictionarySnapshotInput) {
  const categories = filterActive(input.dictionaries.categories, input.scope).map((category) => ({
    categoryId: category.categoryId,
    categoryCode: category.categoryCode,
    categoryName: category.categoryName,
    parentCategoryId: category.parentCategoryId,
    domainCode: category.domainCode,
    metricDomain: category.metricDomain,
    description: category.description,
    isActive: category.isActive,
    updatedAt: isoDate(category.updatedAt),
  }));
  const entities = filterActive(input.dictionaries.entities, input.scope).map((entity) => ({
    id: entity.id,
    entityCode: entity.entityCode,
    entityName: entity.entityName,
    entityType: entity.entityType,
    categoryId: entity.categoryId,
    websiteUrl: entity.websiteUrl,
    description: entity.description,
    isActive: entity.isActive,
    updatedAt: isoDate(entity.updatedAt),
  }));
  const protocols = filterActive(input.dictionaries.protocols, input.scope).map((protocol) => ({
    id: protocol.id,
    entityId: protocol.entityId,
    protocolCode: protocol.protocolCode,
    protocolName: protocol.protocolName,
    protocolType: protocol.protocolType,
    chainScope: protocol.chainScope ?? [],
    description: protocol.description,
    isActive: protocol.isActive,
    updatedAt: isoDate(protocol.updatedAt),
  }));
  const keyPrefixes = filterActive(input.dictionaries.prefixes, input.scope).map((prefix) => ({
    prefixCode: prefix.prefixCode,
    chainCode: prefix.chainCode,
    chainName: prefix.chainName,
    chainFamily: prefix.chainFamily,
    addressFamily: prefix.addressFamily,
    codec: prefix.codec,
    payloadLen: prefix.payloadLen,
    evmChainId: prefix.evmChainId,
    description: prefix.description,
    isActive: prefix.isActive,
    updatedAt: isoDate(prefix.updatedAt),
  }));
  const roles = filterActive(input.dictionaries.roles, input.scope).map((role) => ({
    roleId: role.roleId,
    roleCode: role.roleCode,
    roleName: role.roleName,
    categoryId: role.categoryId,
    roleGroup: role.roleGroup,
    metricUsageDefault: role.metricUsageDefault,
    boundaryClass: role.boundaryClass,
    defaultQualityTier: role.defaultQualityTier,
    defaultFlags: role.defaultFlags,
    description: role.description,
    isActive: role.isActive,
    updatedAt: isoDate(role.updatedAt),
  }));
  const metricGroups = filterActive(input.dictionaries.metricGroups, input.scope).map((group) => ({
    id: group.id,
    metricGroupCode: group.metricGroupCode,
    metricGroupName: group.metricGroupName,
    chainCode: group.chainCode,
    minConfidence: group.minConfidence,
    requireMetricEligible: group.requireMetricEligible,
    description: group.description,
    isActive: group.isActive,
    updatedAt: isoDate(group.updatedAt),
  }));
  const activeMetricGroupIds = new Set(metricGroups.map((group) => group.id));
  const metricGroupRules = input.dictionaries.metricGroupRules
    .filter((rule) => input.scope === "all" || (rule.metricGroupId !== null && activeMetricGroupIds.has(rule.metricGroupId)))
    .map((rule) => ({
      id: rule.id,
      metricGroupId: rule.metricGroupId,
      ruleJson: rule.ruleJson,
      createdAt: isoDate(rule.createdAt),
    }));

  const snapshot = {
    categories,
    entities,
    protocols,
    keyPrefixes,
    roles,
    metricGroups,
    metricGroupRules,
  };

  return {
    ...DICTIONARY_SNAPSHOT_API_CONTRACT,
    scope: input.scope,
    latestRecordedVersion: input.latestVersion
      ? {
          versionHash: input.latestVersion.versionHash,
          summary: input.latestVersion.summary,
          createdAt: isoDate(input.latestVersion.createdAt),
        }
      : null,
    exportHash: hashJson({ scope: input.scope, snapshot }),
    counts: {
      categories: categories.length,
      entities: entities.length,
      protocols: protocols.length,
      keyPrefixes: keyPrefixes.length,
      roles: roles.length,
      metricGroups: metricGroups.length,
      metricGroupRules: metricGroupRules.length,
      totalRows:
        categories.length +
        entities.length +
        protocols.length +
        keyPrefixes.length +
        roles.length +
        metricGroups.length +
        metricGroupRules.length,
    },
    sourceCounts: {
      categories: { total: input.dictionaries.categories.length, active: activeCount(input.dictionaries.categories) },
      entities: { total: input.dictionaries.entities.length, active: activeCount(input.dictionaries.entities) },
      protocols: { total: input.dictionaries.protocols.length, active: activeCount(input.dictionaries.protocols) },
      keyPrefixes: { total: input.dictionaries.prefixes.length, active: activeCount(input.dictionaries.prefixes) },
      roles: { total: input.dictionaries.roles.length, active: activeCount(input.dictionaries.roles) },
      metricGroups: { total: input.dictionaries.metricGroups.length, active: activeCount(input.dictionaries.metricGroups) },
      metricGroupRules: { total: input.dictionaries.metricGroupRules.length },
    },
    snapshot,
    policy: {
      dictionarySnapshotIsReadOnly: true,
      dictionaryVersionHashControlsCompilerHandoff: true,
      rolesDefineAddressFunction: true,
      categoriesDefineTaxonomy: true,
      metricGroupsAreSeparateFromCategories: true,
      keyPrefixesDefineCompactResolverEncoding: true,
    },
  };
}
