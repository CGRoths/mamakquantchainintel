import { hashJson } from "../contracts/hash";

/**
 * Canonical MQCHAIN KV/dictionary contract (U1 generation).
 *
 * This module is the only authoritative definition of:
 * - the frozen schema-version identifiers used by every research preflight,
 *   dictionary bundle, registry commit, KV build handoff and MQNODE resolver;
 * - the canonical governed-dictionary snapshot and its deterministic version;
 * - the stable-ID range and zero/null semantics of the KV value;
 * - the required production serving indexes.
 *
 * Do not define competing schema-version constants, dictionary-version
 * algorithms, or required-index lists anywhere else.
 */

export const MQCHAIN_DICTIONARY_SCHEMA_VERSION = "MQD-U1" as const;
export const MQCHAIN_KEY_SCHEMA_VERSION = "MQK-U1" as const;
export const MQCHAIN_VALUE_SCHEMA_VERSION = "MQV-U1" as const;
export const MQCHAIN_TIMELINE_SCHEMA_VERSION = "MQT-U1" as const;
export const MQCHAIN_METRIC_SCHEMA_VERSION = "MQG-U1" as const;

export const MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS = Object.freeze({
  dictionarySchemaVersion: MQCHAIN_DICTIONARY_SCHEMA_VERSION,
  keySchemaVersion: MQCHAIN_KEY_SCHEMA_VERSION,
  valueSchemaVersion: MQCHAIN_VALUE_SCHEMA_VERSION,
  timelineSchemaVersion: MQCHAIN_TIMELINE_SCHEMA_VERSION,
  metricSchemaVersion: MQCHAIN_METRIC_SCHEMA_VERSION,
});

/**
 * Zero is reserved in every KV value field to mean "not assigned".
 * It is never a valid stable dictionary ID.
 */
export const NULL_DICTIONARY_ID = 0;

/**
 * Frozen supported stable-ID range for the current production generation.
 * The wire format may encode IDs as unsigned 32-bit integers; the current
 * PostgreSQL implementation uses the safe signed positive subset.
 *
 * Stable IDs:
 * - are append-only;
 * - never change semantic meaning;
 * - are never recycled after retirement;
 * - remain resolvable for historical KV artifacts (inactive rows stay in the
 *   canonical snapshot so old values keep decoding);
 * - use zero in the KV value only to represent "not assigned".
 */
export const MIN_STABLE_DICTIONARY_ID = 1;
export const MAX_STABLE_DICTIONARY_ID = 2147483647;

/** Required production serving indexes. Do not duplicate this list elsewhere. */
export const REQUIRED_KV_INDEXES = [
  { key: "addressLabelCurrent", indexName: "address_label_current", label: "Address label current" },
  { key: "addressLabelTimeline", indexName: "address_label_timeline", label: "Address label timeline" },
  { key: "metricGroupMembership", indexName: "metric_group_membership", label: "Metric group membership" },
] as const;

export type RequiredKvIndex = (typeof REQUIRED_KV_INDEXES)[number];
export type RequiredKvIndexKey = RequiredKvIndex["key"];

/**
 * Logical fields of the current KV value with their zero/null semantics.
 * Descriptive contract only — binary layout lives in ./u1.ts.
 */
export const MQCHAIN_KV_VALUE_CONTRACT = Object.freeze({
  entityId: "Required for canonical address labels; never zero on a committed label.",
  protocolId: "Zero when not assigned.",
  categoryId:
    "Approved category override when present, otherwise the approved role's categoryId; zero only when genuinely unavailable and allowed by policy.",
  roleId: "Required; never zero on a committed label.",
  componentId:
    "Resolved active protocol-component ID when assigned; zero when no component is assigned. Unresolved component proposals never invent an ID.",
  tagsetId: "Resolved canonical tagset when assigned; zero while no governed tagset is assigned.",
  confidenceScore: "0-100.",
  qualityTier: "0-7.",
  flags: "Bitfield; see flags.ts.",
  labelStatus: "See LABEL_STATUS in constants.ts.",
  approvedBatchId: "Committed label batch ID.",
  validFromHeight: "Existing timeline semantics preserved; null/zero when open-ended.",
  validToHeight: "Existing timeline semantics preserved; null/zero when open-ended.",
});

/**
 * Canonical governed-dictionary snapshot input rows.
 *
 * Every family that can change address normalization, research resolution,
 * KV encoding/decoding, or metric-group membership is included. Inactive and
 * retired rows are included so historical KV artifacts remain decodable;
 * active-only filtering happens at resolution time, never at version time.
 *
 * Excluded by design: generated/retrieval timestamps, database row order,
 * audit events, source jobs/documents, candidates, registry rows, KV builds.
 */
export type CanonicalDictionaryRows = {
  networks: Array<{
    id: number;
    networkCode: string;
    networkName: string;
    chainFamily: string;
    environment: string;
    caip2: string | null;
    evmChainId: number | null;
    slip44: number | null;
    isActive: boolean;
  }>;
  chainAliases: Array<{
    id: number;
    sourceScope: string;
    rawChainName: string;
    chainNetworkId: number | null;
    namespaceId: number | null;
    addressCodecId: number | null;
    addressType: string;
    assetHint: string | null;
    tokenStandardHint: string | null;
    status: string;
  }>;
  namespaces: Array<{
    id: number;
    namespaceCode: string;
    namespaceName: string;
    chainNetworkId: number;
    addressCodecId: number;
    addressType: string;
    legacyPrefixCode: number | null;
    addressHrp: string | null;
    networkDiscriminator: string | null;
    isActive: boolean;
  }>;
  codecs: Array<{
    id: number;
    codecCode: string;
    codecName: string;
    addressFamily: string;
    identifierKind: string;
    acceptedFormats: string;
    canonicalFormat: string;
    payloadRule: string;
    checksumBehavior: string;
    chainFamilyCompatibility: string;
    normalizerVersion: string;
    status: string;
  }>;
  keyPrefixes: Array<{
    prefixCode: number;
    chainCode: string;
    chainName: string | null;
    chainFamily: string;
    addressFamily: string;
    codec: string;
    payloadLen: number | null;
    evmChainId: number | null;
    isActive: boolean;
  }>;
  entities: Array<{
    id: number;
    entityCode: string;
    entityName: string;
    entityType: string | null;
    categoryId: number | null;
    isActive: boolean;
  }>;
  protocols: Array<{
    id: number;
    entityId: number | null;
    protocolCode: string;
    protocolName: string;
    protocolType: string | null;
    chainScope: string[] | null;
    isActive: boolean;
  }>;
  categories: Array<{
    categoryId: number;
    categoryCode: string;
    categoryName: string;
    parentCategoryId: number | null;
    domainCode: string | null;
    metricDomain: string | null;
    isActive: boolean;
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
    isActive: boolean;
  }>;
  components: Array<{
    id: number;
    protocolId: number;
    deploymentId: number | null;
    componentCode: string;
    componentName: string;
    componentType: string;
    namespaceId: number;
    addressCodecId: number;
    normalizedPayloadHex: string;
    roleId: number;
    categoryId: number;
    confidenceScore: number;
    qualityTier: number;
    validFromHeight: number | null;
    isActive: boolean;
  }>;
  nameAliases: Array<{
    id: number;
    subjectKind: string;
    subjectId: number;
    alias: string;
    normalizedAlias: string;
    languageCode: string | null;
    isActive: boolean;
  }>;
  tags: Array<{
    id: number;
    tagCode: string;
    tagName: string;
    tagGroup: string | null;
    isActive: boolean;
  }>;
  tagsets: Array<{
    id: number;
    tagsetCode: string;
    contentHash: string;
    isActive: boolean;
  }>;
  tagsetMembers: Array<{
    tagsetId: number;
    tagId: number;
  }>;
  tokenStandards: Array<{
    id: number;
    standardCode: string;
    standardName: string;
    chainFamily: string;
    isActive: boolean;
  }>;
  metricGroups: Array<{
    id: number;
    metricGroupCode: string;
    metricGroupName: string;
    chainCode: string | null;
    namespaceId: number | null;
    minConfidence: number;
    requireMetricEligible: boolean;
    isActive: boolean;
  }>;
  metricGroupRules: Array<{
    id: number;
    metricGroupId: number;
    ruleVersion: number;
    ruleJson: Record<string, unknown>;
    status: string;
    contentHash: string | null;
  }>;
  labelStatuses?: Array<{
    labelStatusCode: number;
    stableCode: string;
    displayName: string;
    description: string;
    isCurrent: boolean;
    isHistorical: boolean;
    isServing: boolean;
    isActive: boolean;
  }>;
  metricMembershipStatuses?: Array<{
    membershipStatusCode: number;
    stableCode: string;
    displayName: string;
    isMember: boolean;
    description: string;
    isActive: boolean;
  }>;
  assetStatuses?: Array<{
    assetStatusCode: number;
    stableCode: string;
    displayName: string;
    isServing: boolean;
    description: string;
    isActive: boolean;
  }>;
  qualityTiers?: Array<{
    qualityTier: number;
    stableCode: string;
    displayName: string;
    description: string;
    minimumEvidenceExpectation: string;
    isActive: boolean;
  }>;
  flagBits?: Array<{
    bitPosition: number;
    bitMask: number;
    flagCode: string;
    displayName: string;
    appliesTo: string;
    description: string;
    isActive: boolean;
  }>;
};

export type CanonicalDictionaryFamily = keyof CanonicalDictionaryRows;

export const CANONICAL_DICTIONARY_FAMILIES = [
  "networks",
  "chainAliases",
  "namespaces",
  "codecs",
  "keyPrefixes",
  "entities",
  "protocols",
  "categories",
  "roles",
  "components",
  "nameAliases",
  "tags",
  "tagsets",
  "tagsetMembers",
  "tokenStandards",
  "metricGroups",
  "metricGroupRules",
  "labelStatuses",
  "metricMembershipStatuses",
  "assetStatuses",
  "qualityTiers",
  "flagBits",
] as const satisfies readonly CanonicalDictionaryFamily[];

export type CanonicalDictionarySnapshot = {
  dictionarySchemaVersion: typeof MQCHAIN_DICTIONARY_SCHEMA_VERSION;
  keySchemaVersion: typeof MQCHAIN_KEY_SCHEMA_VERSION;
  valueSchemaVersion: typeof MQCHAIN_VALUE_SCHEMA_VERSION;
  timelineSchemaVersion: typeof MQCHAIN_TIMELINE_SCHEMA_VERSION;
  metricSchemaVersion: typeof MQCHAIN_METRIC_SCHEMA_VERSION;
  components: Record<CanonicalDictionaryFamily, { contentHash: string; rowCount: number }>;
  versionHash: string;
};

function text(value: string | null | undefined) {
  return typeof value === "string" && value.length ? value : null;
}

function num(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: boolean | null | undefined) {
  return value === true;
}

function sortById<T extends { id: number }>(rows: T[]) {
  return [...rows].sort((left, right) => left.id - right.id);
}

/**
 * Normalize every governed family into explicit-column, null-consistent,
 * deterministically sorted rows. Presentation-only timestamps are excluded.
 */
export function normalizeCanonicalDictionaryRows(rows: CanonicalDictionaryRows) {
  return {
    networks: sortById(rows.networks).map((row) => ({
      id: row.id,
      code: row.networkCode,
      name: row.networkName,
      chainFamily: row.chainFamily,
      environment: row.environment,
      caip2: text(row.caip2),
      evmChainId: num(row.evmChainId),
      slip44: num(row.slip44),
      active: bool(row.isActive),
    })),
    chainAliases: sortById(rows.chainAliases).map((row) => ({
      id: row.id,
      sourceScope: row.sourceScope,
      rawChainName: row.rawChainName,
      chainNetworkId: num(row.chainNetworkId),
      namespaceId: num(row.namespaceId),
      addressCodecId: num(row.addressCodecId),
      addressType: row.addressType,
      assetHint: text(row.assetHint),
      tokenStandardHint: text(row.tokenStandardHint),
      status: row.status,
    })),
    namespaces: sortById(rows.namespaces).map((row) => ({
      id: row.id,
      code: row.namespaceCode,
      name: row.namespaceName,
      chainNetworkId: row.chainNetworkId,
      addressCodecId: row.addressCodecId,
      addressType: row.addressType,
      legacyPrefixCode: num(row.legacyPrefixCode),
      addressHrp: text(row.addressHrp),
      networkDiscriminator: text(row.networkDiscriminator),
      active: bool(row.isActive),
    })),
    codecs: sortById(rows.codecs).map((row) => ({
      id: row.id,
      code: row.codecCode,
      name: row.codecName,
      addressFamily: row.addressFamily,
      identifierKind: row.identifierKind,
      acceptedFormats: row.acceptedFormats,
      canonicalFormat: row.canonicalFormat,
      payloadRule: row.payloadRule,
      checksumBehavior: row.checksumBehavior,
      chainFamilyCompatibility: row.chainFamilyCompatibility,
      normalizerVersion: row.normalizerVersion,
      status: row.status,
    })),
    keyPrefixes: [...rows.keyPrefixes]
      .sort((left, right) => left.prefixCode - right.prefixCode)
      .map((row) => ({
        prefixCode: row.prefixCode,
        chainCode: row.chainCode,
        chainName: text(row.chainName),
        chainFamily: row.chainFamily,
        addressFamily: row.addressFamily,
        codec: row.codec,
        payloadLen: num(row.payloadLen),
        evmChainId: num(row.evmChainId),
        active: bool(row.isActive),
      })),
    entities: sortById(rows.entities).map((row) => ({
      id: row.id,
      code: row.entityCode,
      name: row.entityName,
      type: text(row.entityType),
      categoryId: num(row.categoryId),
      active: bool(row.isActive),
    })),
    protocols: sortById(rows.protocols).map((row) => ({
      id: row.id,
      entityId: num(row.entityId),
      code: row.protocolCode,
      name: row.protocolName,
      type: text(row.protocolType),
      chainScope: [...(row.chainScope ?? [])].sort(),
      active: bool(row.isActive),
    })),
    categories: [...rows.categories]
      .sort((left, right) => left.categoryId - right.categoryId)
      .map((row) => ({
        id: row.categoryId,
        code: row.categoryCode,
        name: row.categoryName,
        parentCategoryId: num(row.parentCategoryId),
        domainCode: text(row.domainCode),
        metricDomain: text(row.metricDomain),
        active: bool(row.isActive),
      })),
    roles: [...rows.roles]
      .sort((left, right) => left.roleId - right.roleId)
      .map((row) => ({
        id: row.roleId,
        code: row.roleCode,
        name: row.roleName,
        categoryId: num(row.categoryId),
        roleGroup: text(row.roleGroup),
        metricUsageDefault: text(row.metricUsageDefault),
        boundaryClass: text(row.boundaryClass),
        defaultQualityTier: row.defaultQualityTier,
        defaultFlags: row.defaultFlags,
        active: bool(row.isActive),
      })),
    components: sortById(rows.components).map((row) => ({
      id: row.id,
      protocolId: row.protocolId,
      deploymentId: num(row.deploymentId),
      code: row.componentCode,
      name: row.componentName,
      componentType: row.componentType,
      namespaceId: row.namespaceId,
      addressCodecId: row.addressCodecId,
      normalizedPayloadHex: row.normalizedPayloadHex,
      roleId: row.roleId,
      categoryId: row.categoryId,
      confidenceScore: row.confidenceScore,
      qualityTier: row.qualityTier,
      validFromHeight: num(row.validFromHeight),
      active: bool(row.isActive),
    })),
    nameAliases: sortById(rows.nameAliases).map((row) => ({
      id: row.id,
      subjectKind: row.subjectKind,
      subjectId: row.subjectId,
      alias: row.alias,
      normalizedAlias: row.normalizedAlias,
      languageCode: text(row.languageCode),
      active: bool(row.isActive),
    })),
    tags: sortById(rows.tags).map((row) => ({
      id: row.id,
      code: row.tagCode,
      name: row.tagName,
      tagGroup: text(row.tagGroup),
      active: bool(row.isActive),
    })),
    tagsets: sortById(rows.tagsets).map((row) => ({
      id: row.id,
      code: row.tagsetCode,
      contentHash: row.contentHash,
      active: bool(row.isActive),
    })),
    tagsetMembers: [...rows.tagsetMembers]
      .sort((left, right) => left.tagsetId - right.tagsetId || left.tagId - right.tagId)
      .map((row) => ({ tagsetId: row.tagsetId, tagId: row.tagId })),
    tokenStandards: sortById(rows.tokenStandards).map((row) => ({
      id: row.id,
      code: row.standardCode,
      name: row.standardName,
      chainFamily: row.chainFamily,
      active: bool(row.isActive),
    })),
    metricGroups: sortById(rows.metricGroups).map((row) => ({
      id: row.id,
      code: row.metricGroupCode,
      name: row.metricGroupName,
      chainCode: text(row.chainCode),
      namespaceId: num(row.namespaceId),
      minConfidence: row.minConfidence,
      requireMetricEligible: bool(row.requireMetricEligible),
      active: bool(row.isActive),
    })),
    metricGroupRules: sortById(rows.metricGroupRules).map((row) => ({
      id: row.id,
      metricGroupId: row.metricGroupId,
      ruleVersion: row.ruleVersion,
      ruleJson: row.ruleJson,
      status: row.status,
      contentHash: text(row.contentHash),
    })),
    labelStatuses: [...(rows.labelStatuses ?? [])].sort((left, right) => left.labelStatusCode - right.labelStatusCode).map((row) => ({
      id: row.labelStatusCode,
      code: row.stableCode,
      name: row.displayName,
      description: row.description,
      current: bool(row.isCurrent),
      historical: bool(row.isHistorical),
      serving: bool(row.isServing),
      active: bool(row.isActive),
    })),
    metricMembershipStatuses: [...(rows.metricMembershipStatuses ?? [])].sort((left, right) => left.membershipStatusCode - right.membershipStatusCode).map((row) => ({
      id: row.membershipStatusCode,
      code: row.stableCode,
      name: row.displayName,
      member: bool(row.isMember),
      description: row.description,
      active: bool(row.isActive),
    })),
    assetStatuses: [...(rows.assetStatuses ?? [])].sort((left, right) => left.assetStatusCode - right.assetStatusCode).map((row) => ({
      id: row.assetStatusCode,
      code: row.stableCode,
      name: row.displayName,
      serving: bool(row.isServing),
      description: row.description,
      active: bool(row.isActive),
    })),
    qualityTiers: [...(rows.qualityTiers ?? [])].sort((left, right) => left.qualityTier - right.qualityTier).map((row) => ({
      id: row.qualityTier,
      code: row.stableCode,
      name: row.displayName,
      description: row.description,
      minimumEvidenceExpectation: row.minimumEvidenceExpectation,
      active: bool(row.isActive),
    })),
    flagBits: [...(rows.flagBits ?? [])].sort((left, right) => left.bitPosition - right.bitPosition).map((row) => ({
      bitPosition: row.bitPosition,
      bitMask: row.bitMask,
      code: row.flagCode,
      name: row.displayName,
      appliesTo: row.appliesTo,
      description: row.description,
      active: bool(row.isActive),
    })),
  };
}

/**
 * Build the canonical dictionary snapshot. Deterministic: identical governed
 * content in any input order yields an identical versionHash; any semantic
 * change to any family changes it. Timestamps never participate.
 */
export function buildCanonicalDictionarySnapshot(rows: CanonicalDictionaryRows): CanonicalDictionarySnapshot {
  const normalized = normalizeCanonicalDictionaryRows(rows);
  const components = Object.fromEntries(
    CANONICAL_DICTIONARY_FAMILIES.map((family) => [
      family,
      { contentHash: hashJson(normalized[family]), rowCount: normalized[family].length },
    ]),
  ) as CanonicalDictionarySnapshot["components"];

  const versionHash = hashJson({
    ...MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS,
    components,
  });

  return {
    ...MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS,
    components,
    versionHash,
  };
}

/** Canonical MQD-U1 dictionary version for the given governed rows. */
export function computeCanonicalDictionaryVersion(rows: CanonicalDictionaryRows) {
  return buildCanonicalDictionarySnapshot(rows).versionHash;
}

/**
 * Canonical U1 address key: namespace_id + address_codec_id + canonical
 * address payload bytes. Legacy prefixCode may travel alongside for
 * compatibility and display, but never replaces this identity.
 */
export type U1AddressKeyInput = {
  namespaceId: number | null | undefined;
  addressCodecId: number | null | undefined;
  payloadHex: string | null | undefined;
};

export type U1AddressKeyContext = {
  namespace?: { id: number; addressCodecId: number; isActive: boolean } | null;
  codec?: { id: number; payloadRule: string; status: string } | null;
};

export type U1AddressKeyBlocker =
  | "missing_namespace_id"
  | "missing_address_codec_id"
  | "namespace_id_out_of_range"
  | "address_codec_id_out_of_range"
  | "missing_payload_hex"
  | "invalid_payload_hex"
  | "unknown_namespace"
  | "unknown_codec"
  | "namespace_codec_mismatch"
  | "inactive_namespace"
  | "inactive_codec"
  | "payload_length_mismatch";

const PRODUCTION_READY_CODEC_STATUS = "production_ready";

/**
 * Validate a candidate/registry U1 identity. Returns every blocker found;
 * an empty array means the key is complete and internally consistent.
 * This never reconstructs or guesses a missing component of the key.
 */
export function validateU1AddressKey(
  input: U1AddressKeyInput,
  context: U1AddressKeyContext = {},
): U1AddressKeyBlocker[] {
  const blockers: U1AddressKeyBlocker[] = [];
  const namespaceId = num(input.namespaceId ?? null);
  const addressCodecId = num(input.addressCodecId ?? null);
  const payloadHex = text(input.payloadHex ?? null);

  if (namespaceId === null || namespaceId < MIN_STABLE_DICTIONARY_ID) blockers.push("missing_namespace_id");
  if (addressCodecId === null || addressCodecId < MIN_STABLE_DICTIONARY_ID) blockers.push("missing_address_codec_id");
  if (namespaceId !== null && namespaceId > MAX_STABLE_DICTIONARY_ID) blockers.push("namespace_id_out_of_range");
  if (addressCodecId !== null && addressCodecId > MAX_STABLE_DICTIONARY_ID) blockers.push("address_codec_id_out_of_range");
  if (payloadHex === null) {
    blockers.push("missing_payload_hex");
  } else if (!/^[0-9a-f]+$/.test(payloadHex) || payloadHex.length % 2 !== 0) {
    blockers.push("invalid_payload_hex");
  }

  if (namespaceId !== null && context.namespace !== undefined) {
    if (!context.namespace) {
      blockers.push("unknown_namespace");
    } else {
      if (!context.namespace.isActive) blockers.push("inactive_namespace");
      if (addressCodecId !== null && context.namespace.addressCodecId !== addressCodecId) {
        blockers.push("namespace_codec_mismatch");
      }
    }
  }

  if (addressCodecId !== null && context.codec !== undefined) {
    if (!context.codec) {
      blockers.push("unknown_codec");
    } else {
      if (context.codec.status !== PRODUCTION_READY_CODEC_STATUS) blockers.push("inactive_codec");
      const exactBytes = /^exact:(\d+)$/.exec(context.codec.payloadRule)?.[1];
      if (exactBytes && payloadHex !== null && payloadHex.length !== Number(exactBytes) * 2) {
        blockers.push("payload_length_mismatch");
      }
    }
  }

  return blockers;
}

export type RegistrySnapshotRow = {
  id: number;
  chainCode: string;
  normalizedAddress: string;
  namespaceId: number | null;
  addressCodecId: number | null;
  payloadHex: string | null;
  prefixCode: number | null;
  entityId: number | null;
  protocolId: number | null;
  categoryId: number | null;
  roleId: number | null;
  componentId: number | null;
  tagsetId: number | null;
  confidenceScore: number;
  labelStatus: number;
  qualityTier: number;
  flags: number;
  validFromBlock: number | null;
  validToBlock: number | null;
  isActive: boolean;
  approvedBatchId: number | null;
};

/**
 * Deterministic hash over the immutable content of committed registry rows.
 * Sorted by registry ID; no timestamps.
 */
export function computeRegistrySnapshotHash(rows: RegistrySnapshotRow[]) {
  const normalized = [...rows]
    .sort((left, right) => left.id - right.id)
    .map((row) => ({
      id: row.id,
      chainCode: row.chainCode,
      normalizedAddress: row.normalizedAddress,
      namespaceId: num(row.namespaceId),
      addressCodecId: num(row.addressCodecId),
      payloadHex: text(row.payloadHex),
      prefixCode: num(row.prefixCode),
      entityId: num(row.entityId),
      protocolId: num(row.protocolId),
      categoryId: num(row.categoryId),
      roleId: num(row.roleId),
      componentId: num(row.componentId),
      tagsetId: num(row.tagsetId),
      confidenceScore: row.confidenceScore,
      labelStatus: row.labelStatus,
      qualityTier: row.qualityTier,
      flags: row.flags,
      validFromBlock: num(row.validFromBlock),
      validToBlock: num(row.validToBlock),
      isActive: bool(row.isActive),
      approvedBatchId: num(row.approvedBatchId),
    }));
  return hashJson({ registrySnapshot: normalized });
}
