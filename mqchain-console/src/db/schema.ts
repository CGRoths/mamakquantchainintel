import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  BATCH_LABEL_ACTIONS,
  BATCH_STATUSES,
  ADDRESS_IDENTIFIER_KINDS,
  CANDIDATE_STATUSES,
  CHAIN_ALIAS_STATUSES,
  DISCOVERY_JOB_STATUSES,
  DICTIONARY_PROPOSAL_KINDS,
  DICTIONARY_PROPOSAL_STATUSES,
  KV_ARTIFACT_STATUSES,
  MQCHAIN_ROLES,
  NETWORK_CATALOG_STATES,
  NETWORK_CHANGE_STATUSES,
  NETWORK_CHANGE_TYPES,
  NETWORK_READINESS_STATES,
  NAMESPACE_ADDRESS_TYPES,
  SOURCE_JOB_STATUSES,
  SOURCE_TYPES,
  SOURCE_VERIFICATION_SCOPES,
  SOURCE_VERIFICATION_STATUSES,
  TRUST_TIERS,
  U1_BUILD_KINDS,
  U1_CAPABILITY_STATUSES,
  U1_MEMBERSHIP_STATUSES,
} from "@/lib/mqchain/constants";

function sqlStringList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", "));
}

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const mqUsers = pgTable(
  "mq_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull().unique(),
    displayName: text("display_name"),
    passwordHash: text("password_hash"),
    role: text("role").notNull().default("analyst"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("ck_mq_users_role", sql`${table.role} in (${sqlStringList(MQCHAIN_ROLES)})`)],
);

export const mqSourceJobs = pgTable(
  "mq_source_jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceType: text("source_type").notNull(),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    localFileName: text("local_file_name"),
    archiveStorageUri: text("archive_storage_uri"),
    entityHint: text("entity_hint"),
    protocolHint: text("protocol_hint"),
    chainScope: text("chain_scope").array(),
    expectedRoles: text("expected_roles").array(),
    status: text("status").notNull().default("draft"),
    parserVersion: text("parser_version").notNull().default("mqchain-console-v1"),
    submittedBy: uuid("submitted_by").references(() => mqUsers.id),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mq_source_jobs_source_type").on(table.sourceType),
    index("idx_mq_source_jobs_status").on(table.status),
    index("idx_mq_source_jobs_submitted_by").on(table.submittedBy),
    check(
      "ck_mq_source_jobs_source_type",
      sql`${table.sourceType} in (${sqlStringList(SOURCE_TYPES)})`,
    ),
    check(
      "ck_mq_source_jobs_status",
      sql`${table.status} in (${sqlStringList(SOURCE_JOB_STATUSES)})`,
    ),
  ],
);

export const mqSourceDocuments = pgTable(
  "mq_source_documents",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceJobId: bigint("source_job_id", { mode: "number" }).references(() => mqSourceJobs.id),
    documentType: text("document_type").notNull(),
    originalName: text("original_name"),
    storageUri: text("storage_uri"),
    contentHash: text("content_hash").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    extractedText: text("extracted_text"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mq_source_documents_job").on(table.sourceJobId),
    index("idx_mq_source_documents_hash").on(table.contentHash),
  ],
);

export const mqCategoryDict = pgTable(
  "mq_category_dict",
  {
    categoryId: integer("category_id").primaryKey(),
    categoryCode: text("category_code").notNull().unique(),
    categoryName: text("category_name").notNull(),
    parentCategoryId: integer("parent_category_id"),
    domainCode: text("domain_code"),
    metricDomain: text("metric_domain"),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_mq_category_domain").on(table.domainCode)],
);

export const mqEntities = pgTable(
  "mq_entities",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entityCode: text("entity_code").notNull().unique(),
    entityName: text("entity_name").notNull(),
    entityType: text("entity_type"),
    categoryId: integer("category_id").references(() => mqCategoryDict.categoryId),
    websiteUrl: text("website_url"),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mq_entities_type").on(table.entityType),
    index("idx_mq_entities_category").on(table.categoryId),
  ],
);

export const mqProtocols = pgTable(
  "mq_protocols",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entityId: bigint("entity_id", { mode: "number" }).references(() => mqEntities.id),
    protocolCode: text("protocol_code").notNull().unique(),
    protocolName: text("protocol_name").notNull(),
    protocolType: text("protocol_type"),
    chainScope: text("chain_scope").array(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mq_protocols_entity").on(table.entityId),
    index("idx_mq_protocols_type").on(table.protocolType),
  ],
);

export const mqKvKeyPrefixDict = pgTable(
  "mq_kv_key_prefix_dict",
  {
    prefixCode: integer("prefix_code").primaryKey(),
    chainCode: text("chain_code").notNull(),
    chainName: text("chain_name"),
    chainFamily: text("chain_family").notNull(),
    addressFamily: text("address_family").notNull(),
    codec: text("codec").notNull(),
    payloadLen: integer("payload_len"),
    evmChainId: integer("evm_chain_id"),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mq_prefix_chain").on(table.chainCode),
    uniqueIndex("uq_mq_prefix_chain_family").on(table.chainCode, table.addressFamily),
    check("ck_mq_kv_key_prefix_payload_len_positive", sql`${table.payloadLen} is null or ${table.payloadLen} > 0`),
    check("ck_mq_kv_key_prefix_evm_chain_id_positive", sql`${table.evmChainId} is null or ${table.evmChainId} > 0`),
  ],
);

export const mqCatalogSources = pgTable(
  "mq_catalog_sources",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    sourceCode: text("source_code").notNull().unique(),
    sourceName: text("source_name").notNull(),
    sourceType: text("source_type").notNull(),
    url: text("url"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_mq_catalog_sources_type").on(table.sourceType), index("idx_mq_catalog_sources_status").on(table.status)],
);

export const mqChainNetworks = pgTable(
  "mq_chain_networks",
  {
    id: bigint("chain_network_id", { mode: "number" }).primaryKey(),
    networkCode: text("network_code").notNull().unique(),
    networkName: text("network_name").notNull(),
    chainFamily: text("chain_family").notNull(),
    environment: text("environment").notNull().default("mainnet"),
    caip2: text("caip2").unique(),
    evmChainId: bigint("evm_chain_id", { mode: "number" }),
    slip44: integer("slip44"),
    isActive: boolean("is_active").notNull().default(true),
    sourceId: bigint("source_id", { mode: "number" }).references(() => mqCatalogSources.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mq_chain_networks_family").on(table.chainFamily),
    index("idx_mq_chain_networks_environment").on(table.environment),
    check("ck_mq_chain_networks_id_uint32", sql`${table.id} between 1 and 4294967295`),
    check("ck_mq_chain_networks_evm_chain_id", sql`${table.evmChainId} is null or ${table.evmChainId} > 0`),
  ],
);

export const mqAddressCodecs = pgTable(
  "mq_address_codecs",
  {
    id: integer("address_codec_id").primaryKey(),
    codecCode: text("codec_code").notNull().unique(),
    codecName: text("codec_name").notNull(),
    addressFamily: text("address_family").notNull(),
    identifierKind: text("identifier_kind").notNull().default("wallet_address"),
    acceptedFormats: text("accepted_formats").notNull(),
    canonicalFormat: text("canonical_format").notNull(),
    payloadRule: text("payload_rule").notNull(),
    checksumBehavior: text("checksum_behavior").notNull(),
    chainFamilyCompatibility: text("chain_family_compatibility").notNull(),
    normalizerVersion: text("normalizer_version").notNull(),
    testVectors: jsonb("test_vectors").$type<{ valid: string[]; invalid: string[] }>().notNull().default({ valid: [], invalid: [] }),
    status: text("status").notNull().default("catalogued"),
    sourceId: bigint("source_id", { mode: "number" }).references(() => mqCatalogSources.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mq_address_codecs_family").on(table.addressFamily),
    check("ck_mq_address_codecs_id_uint16", sql`${table.id} between 1 and 65535`),
    check("ck_mq_address_codecs_status", sql`${table.status} in (${sqlStringList(U1_CAPABILITY_STATUSES)})`),
    check("ck_mq_address_codecs_identifier_kind", sql`${table.identifierKind} in (${sqlStringList(ADDRESS_IDENTIFIER_KINDS)})`),
  ],
);

export const mqAddressNamespaces = pgTable(
  "mq_address_namespaces",
  {
    id: bigint("namespace_id", { mode: "number" }).primaryKey(),
    namespaceCode: text("namespace_code").notNull().unique(),
    namespaceName: text("namespace_name").notNull(),
    chainNetworkId: bigint("chain_network_id", { mode: "number" }).notNull().references(() => mqChainNetworks.id),
    addressCodecId: integer("address_codec_id").notNull().references(() => mqAddressCodecs.id),
    addressType: text("address_type").notNull().default("wallet_address"),
    legacyPrefixCode: integer("legacy_prefix_code").references(() => mqKvKeyPrefixDict.prefixCode),
    addressHrp: text("address_hrp"),
    networkDiscriminator: text("network_discriminator"),
    isActive: boolean("is_active").notNull().default(true),
    sourceId: bigint("source_id", { mode: "number" }).references(() => mqCatalogSources.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_mq_address_namespaces_network_codec_hrp").on(table.chainNetworkId, table.addressCodecId, table.addressHrp),
    index("idx_mq_address_namespaces_legacy_prefix").on(table.legacyPrefixCode),
    index("idx_mq_address_namespaces_network").on(table.chainNetworkId),
    index("idx_mq_address_namespaces_codec").on(table.addressCodecId),
    uniqueIndex("uq_mq_address_namespaces_mapping").on(table.id, table.chainNetworkId, table.addressCodecId),
    check("ck_mq_address_namespaces_id_uint32", sql`${table.id} between 1 and 4294967295`),
    check("ck_mq_address_namespaces_address_type", sql`${table.addressType} in (${sqlStringList(NAMESPACE_ADDRESS_TYPES)})`),
  ],
);

export const mqChainAliases = pgTable(
  "mq_chain_aliases",
  {
    id: bigint("alias_id", { mode: "number" }).primaryKey(),
    sourceScope: text("source_scope").notNull(),
    rawChainName: text("raw_chain_name").notNull(),
    chainNetworkId: bigint("chain_network_id", { mode: "number" }),
    namespaceId: bigint("namespace_id", { mode: "number" }),
    addressCodecId: integer("address_codec_id"),
    addressType: text("address_type").notNull(),
    assetHint: text("asset_hint"),
    tokenStandardHint: text("token_standard_hint"),
    status: text("status").notNull(),
    evidenceRef: text("evidence_ref").notNull(),
    sourceId: bigint("source_id", { mode: "number" }).notNull().references(() => mqCatalogSources.id),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalNotes: text("approval_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_mq_chain_aliases_scope_raw_type").on(table.sourceScope, table.rawChainName, table.addressType),
    index("idx_mq_chain_aliases_lookup").on(table.rawChainName, table.status),
    index("idx_mq_chain_aliases_network").on(table.chainNetworkId),
    foreignKey({
      name: "fk_mq_chain_aliases_namespace_mapping",
      columns: [table.namespaceId, table.chainNetworkId, table.addressCodecId],
      foreignColumns: [mqAddressNamespaces.id, mqAddressNamespaces.chainNetworkId, mqAddressNamespaces.addressCodecId],
    }),
    check("ck_mq_chain_aliases_id_uint32", sql`${table.id} between 1 and 4294967295`),
    check("ck_mq_chain_aliases_status", sql`${table.status} in (${sqlStringList(CHAIN_ALIAS_STATUSES)})`),
    check("ck_mq_chain_aliases_address_type", sql`${table.addressType} in ('wallet_address', 'validator_public_key', 'staking_delegator_address', 'staking_identifier', 'consensus_identifier')`),
    check("ck_mq_chain_aliases_approved_mapping", sql`${table.status} <> 'approved' or (${table.chainNetworkId} is not null and ${table.namespaceId} is not null and ${table.addressCodecId} is not null)`),
    check("ck_mq_chain_aliases_pending_unmapped", sql`${table.status} not in ('pending_mapping', 'pending_network') or (${table.chainNetworkId} is null and ${table.namespaceId} is null and ${table.addressCodecId} is null)`),
    check("ck_mq_chain_aliases_approval_metadata", sql`${table.status} in ('pending_mapping', 'pending_network') or (${table.approvedBy} is not null and ${table.approvedAt} is not null)`),
  ],
);

export const mqChainCapabilities = pgTable(
  "mq_chain_capabilities",
  {
    chainNetworkId: bigint("chain_network_id", { mode: "number" }).primaryKey().references(() => mqChainNetworks.id),
    supportTier: integer("support_tier"),
    catalogState: text("catalog_state").notNull().default("catalogued"),
    labelReadiness: text("label_readiness").notNull().default("not_ready"),
    runtimeReadiness: text("runtime_readiness").notNull().default("not_ready"),
    catalogStatus: text("catalog_status").notNull(),
    normalizerStatus: text("normalizer_status").notNull(),
    mqnodeParserStatus: text("mqnode_parser_status").notNull(),
    assetResolverStatus: text("asset_resolver_status").notNull(),
    currentLabelStatus: text("current_label_status").notNull(),
    timelineStatus: text("timeline_status").notNull(),
    metricStatus: text("metric_status").notNull(),
    mqnodeIntegrationTestRef: text("mqnode_integration_test_ref"),
    metricIntegrationTestRef: text("metric_integration_test_ref"),
    notes: text("notes"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("ck_mq_chain_capabilities_support_tier", sql`${table.supportTier} is null or ${table.supportTier} in (1, 2)`),
    check("ck_mq_chain_capabilities_catalog_state", sql`${table.catalogState} in (${sqlStringList(NETWORK_CATALOG_STATES)})`),
    check("ck_mq_chain_capabilities_label_readiness", sql`${table.labelReadiness} in (${sqlStringList(NETWORK_READINESS_STATES)})`),
    check("ck_mq_chain_capabilities_runtime_readiness", sql`${table.runtimeReadiness} in (${sqlStringList(NETWORK_READINESS_STATES)})`),
    check("ck_mq_chain_capabilities_catalog", sql`${table.catalogStatus} in (${sqlStringList(U1_CAPABILITY_STATUSES)})`),
    check("ck_mq_chain_capabilities_normalizer", sql`${table.normalizerStatus} in (${sqlStringList(U1_CAPABILITY_STATUSES)})`),
    check("ck_mq_chain_capabilities_mqnode", sql`${table.mqnodeParserStatus} in (${sqlStringList(U1_CAPABILITY_STATUSES)})`),
    check("ck_mq_chain_capabilities_asset", sql`${table.assetResolverStatus} in (${sqlStringList(U1_CAPABILITY_STATUSES)})`),
    check("ck_mq_chain_capabilities_current", sql`${table.currentLabelStatus} in (${sqlStringList(U1_CAPABILITY_STATUSES)})`),
    check("ck_mq_chain_capabilities_timeline", sql`${table.timelineStatus} in (${sqlStringList(U1_CAPABILITY_STATUSES)})`),
    check("ck_mq_chain_capabilities_metric", sql`${table.metricStatus} in (${sqlStringList(U1_CAPABILITY_STATUSES)})`),
    check("ck_mq_chain_capabilities_mqnode_evidence", sql`${table.mqnodeParserStatus} not in ('test_ready', 'production_ready') or ${table.mqnodeIntegrationTestRef} is not null`),
    check("ck_mq_chain_capabilities_metric_evidence", sql`${table.metricStatus} not in ('test_ready', 'production_ready') or ${table.metricIntegrationTestRef} is not null`),
  ],
);

export const mqNetworkChangeProposals = pgTable(
  "mq_network_change_proposals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    changeType: text("change_type").notNull(),
    networkId: bigint("network_id", { mode: "number" }),
    proposedValues: jsonb("proposed_values").$type<Record<string, unknown>>().notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    requestedBy: uuid("requested_by").notNull().references(() => mqUsers.id),
    reviewedBy: uuid("reviewed_by").references(() => mqUsers.id),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_mq_network_change_proposals_status").on(table.status),
    index("idx_mq_network_change_proposals_network").on(table.networkId),
    check("ck_mq_network_change_proposals_type", sql`${table.changeType} in (${sqlStringList(NETWORK_CHANGE_TYPES)})`),
    check("ck_mq_network_change_proposals_status", sql`${table.status} in (${sqlStringList(NETWORK_CHANGE_STATUSES)})`),
  ],
);

export const mqDictionaryProposals = pgTable(
  "mq_dictionary_proposals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    proposalKind: text("proposal_kind").notNull(),
    proposedCode: text("proposed_code").notNull(),
    proposedName: text("proposed_name").notNull(),
    targetReferences: jsonb("target_references").$type<Record<string, unknown>>().notNull().default({}),
    proposedValues: jsonb("proposed_values").$type<Record<string, unknown>>().notNull().default({}),
    sourceJobId: bigint("source_job_id", { mode: "number" }).references(() => mqSourceJobs.id),
    sourceDocumentId: bigint("source_document_id", { mode: "number" }).references(() => mqSourceDocuments.id),
    candidateId: bigint("candidate_id", { mode: "number" }).references(() => mqAddressCandidates.id),
    affectedRowReferences: jsonb("affected_row_references").$type<unknown[]>().notNull().default([]),
    reason: text("reason").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("pending"),
    requestedBy: uuid("requested_by").notNull().references(() => mqUsers.id),
    reviewedBy: uuid("reviewed_by").references(() => mqUsers.id),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_mq_dictionary_proposals_status").on(table.status),
    index("idx_mq_dictionary_proposals_kind").on(table.proposalKind),
    index("idx_mq_dictionary_proposals_source_job").on(table.sourceJobId),
    check("ck_mq_dictionary_proposals_kind", sql`${table.proposalKind} in (${sqlStringList(DICTIONARY_PROPOSAL_KINDS)})`),
    check("ck_mq_dictionary_proposals_status", sql`${table.status} in (${sqlStringList(DICTIONARY_PROPOSAL_STATUSES)})`),
  ],
);

export const mqDictionaryIdRanges = pgTable(
  "mq_dictionary_id_ranges",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    dictionaryKind: text("dictionary_kind").notNull(),
    rangeCode: text("range_code").notNull().unique(),
    startId: bigint("start_id", { mode: "number" }).notNull(),
    endId: bigint("end_id", { mode: "number" }).notNull(),
    nextId: bigint("next_id", { mode: "number" }).notNull(),
    ownerDomain: text("owner_domain").notNull(),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_mq_dictionary_ranges_kind_code").on(table.dictionaryKind, table.rangeCode),
    check("ck_mq_dictionary_ranges_bounds", sql`${table.startId} > 0 and ${table.endId} >= ${table.startId} and ${table.nextId} between ${table.startId} and ${table.endId} + 1`),
  ],
);

export const mqExternalIdentifiers = pgTable(
  "mq_external_identifiers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    subjectKind: text("subject_kind").notNull(),
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    identifierType: text("identifier_type").notNull(),
    identifierValue: text("identifier_value").notNull(),
    sourceId: bigint("source_id", { mode: "number" }).references(() => mqCatalogSources.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_mq_external_identifiers_subject_type_value").on(table.subjectKind, table.subjectId, table.identifierType, table.identifierValue),
    index("idx_mq_external_identifiers_lookup").on(table.identifierType, table.identifierValue),
  ],
);

export const mqNameAliases = pgTable(
  "mq_name_aliases",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    subjectKind: text("subject_kind").notNull(),
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    languageCode: text("language_code"),
    sourceId: bigint("source_id", { mode: "number" }).references(() => mqCatalogSources.id),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uq_mq_name_alias_subject_alias").on(table.subjectKind, table.subjectId, table.normalizedAlias), index("idx_mq_name_alias_lookup").on(table.normalizedAlias)],
);

export const mqKvRoleDict = pgTable(
  "mq_kv_role_dict",
  {
    roleId: integer("role_id").primaryKey(),
    roleCode: text("role_code").notNull().unique(),
    roleName: text("role_name").notNull(),
    categoryId: integer("category_id").references(() => mqCategoryDict.categoryId),
    roleGroup: text("role_group"),
    metricUsageDefault: text("metric_usage_default"),
    boundaryClass: text("boundary_class"),
    defaultQualityTier: integer("default_quality_tier").notNull().default(1),
    defaultFlags: integer("default_flags").notNull().default(0),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mq_roles_category").on(table.categoryId),
    index("idx_mq_roles_group").on(table.roleGroup),
    check("ck_mq_kv_role_default_quality_tier_range", sql`${table.defaultQualityTier} between 0 and 7`),
    check("ck_mq_kv_role_default_flags_non_negative", sql`${table.defaultFlags} >= 0`),
  ],
);

export const mqTagDict = pgTable(
  "mq_tag_dict",
  {
    id: bigint("tag_id", { mode: "number" }).primaryKey(),
    tagCode: text("tag_code").notNull().unique(),
    tagName: text("tag_name").notNull(),
    tagGroup: text("tag_group"),
    isActive: boolean("is_active").notNull().default(true),
    sourceId: bigint("source_id", { mode: "number" }).references(() => mqCatalogSources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("ck_mq_tag_dict_id_uint32", sql`${table.id} between 1 and 4294967295`), index("idx_mq_tag_dict_group").on(table.tagGroup)],
);

export const mqTagsetDict = pgTable(
  "mq_tagset_dict",
  {
    id: bigint("tagset_id", { mode: "number" }).primaryKey(),
    tagsetCode: text("tagset_code").notNull().unique(),
    contentHash: text("content_hash").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("ck_mq_tagset_dict_id_uint32", sql`${table.id} between 1 and 4294967295`)],
);

export const mqTagsetMembers = pgTable(
  "mq_tagset_members",
  {
    tagsetId: bigint("tagset_id", { mode: "number" }).notNull().references(() => mqTagsetDict.id),
    tagId: bigint("tag_id", { mode: "number" }).notNull().references(() => mqTagDict.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tagsetId, table.tagId] }), index("idx_mq_tagset_members_tag").on(table.tagId)],
);

export const mqProtocolDeployments = pgTable(
  "mq_protocol_deployments",
  {
    id: bigint("deployment_id", { mode: "number" }).primaryKey(),
    protocolId: bigint("protocol_id", { mode: "number" }).notNull().references(() => mqProtocols.id),
    namespaceId: bigint("namespace_id", { mode: "number" }).notNull().references(() => mqAddressNamespaces.id),
    deploymentCode: text("deployment_code").notNull().unique(),
    deploymentName: text("deployment_name").notNull(),
    status: text("status").notNull().default("active"),
    sourceId: bigint("source_id", { mode: "number" }).references(() => mqCatalogSources.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_mq_protocol_deployments_protocol").on(table.protocolId), index("idx_mq_protocol_deployments_namespace").on(table.namespaceId), check("ck_mq_protocol_deployments_id_uint32", sql`${table.id} between 1 and 4294967295`)],
);

export const mqProtocolComponents = pgTable(
  "mq_protocol_components",
  {
    id: bigint("component_id", { mode: "number" }).primaryKey(),
    protocolId: bigint("protocol_id", { mode: "number" }).notNull().references(() => mqProtocols.id),
    deploymentId: bigint("deployment_id", { mode: "number" }).references(() => mqProtocolDeployments.id),
    componentCode: text("component_code").notNull().unique(),
    componentName: text("component_name").notNull(),
    componentType: text("component_type").notNull(),
    namespaceId: bigint("namespace_id", { mode: "number" }).notNull().references(() => mqAddressNamespaces.id),
    addressCodecId: integer("address_codec_id").notNull().references(() => mqAddressCodecs.id),
    normalizedPayloadHex: text("normalized_payload_hex").notNull(),
    roleId: integer("role_id").notNull().references(() => mqKvRoleDict.roleId),
    categoryId: integer("category_id").notNull().references(() => mqCategoryDict.categoryId),
    confidenceScore: integer("confidence_score").notNull(),
    qualityTier: integer("quality_tier").notNull(),
    validFromHeight: bigint("valid_from_height", { mode: "number" }),
    isActive: boolean("is_active").notNull().default(true),
    sourceId: bigint("source_id", { mode: "number" }).notNull().references(() => mqCatalogSources.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_mq_protocol_components_u1_key").on(table.namespaceId, table.addressCodecId, table.normalizedPayloadHex),
    index("idx_mq_protocol_components_protocol").on(table.protocolId),
    check("ck_mq_protocol_components_id_uint32", sql`${table.id} between 1 and 4294967295`),
    check("ck_mq_protocol_components_confidence", sql`${table.confidenceScore} between 0 and 100`),
    check("ck_mq_protocol_components_quality", sql`${table.qualityTier} between 0 and 7`),
    check("ck_mq_protocol_components_payload_hex", sql`${table.normalizedPayloadHex} ~ '^[0-9a-f]+$' and length(${table.normalizedPayloadHex}) % 2 = 0`),
  ],
);

export const mqAssets = pgTable(
  "mq_assets",
  {
    id: bigint("asset_id", { mode: "number" }).primaryKey(),
    assetCode: text("asset_code").notNull().unique(),
    assetName: text("asset_name").notNull(),
    assetType: text("asset_type").notNull(),
    symbol: text("symbol").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sourceId: bigint("source_id", { mode: "number" }).references(() => mqCatalogSources.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("ck_mq_assets_id_uint32", sql`${table.id} between 1 and 4294967295`), index("idx_mq_assets_type").on(table.assetType)],
);

export const mqTokenStandards = pgTable(
  "mq_token_standards",
  {
    id: integer("standard_id").primaryKey(),
    standardCode: text("standard_code").notNull().unique(),
    standardName: text("standard_name").notNull(),
    chainFamily: text("chain_family").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sourceId: bigint("source_id", { mode: "number" }).references(() => mqCatalogSources.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("ck_mq_token_standards_id_uint16", sql`${table.id} between 1 and 65535`), index("idx_mq_token_standards_family").on(table.chainFamily)],
);

export const mqTokenContracts = pgTable(
  "mq_token_contracts",
  {
    id: bigint("token_contract_id", { mode: "number" }).primaryKey(),
    assetId: bigint("asset_id", { mode: "number" }).notNull().references(() => mqAssets.id),
    namespaceId: bigint("namespace_id", { mode: "number" }).notNull().references(() => mqAddressNamespaces.id),
    addressCodecId: integer("address_codec_id").notNull().references(() => mqAddressCodecs.id),
    normalizedPayloadHex: text("normalized_payload_hex").notNull(),
    standardId: integer("standard_id").notNull().references(() => mqTokenStandards.id),
    decimals: integer("decimals").notNull(),
    issuerEntityId: bigint("issuer_entity_id", { mode: "number" }).references(() => mqEntities.id),
    status: text("status").notNull().default("active"),
    sourceId: bigint("source_id", { mode: "number" }).notNull().references(() => mqCatalogSources.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_mq_token_contracts_u1_key").on(table.namespaceId, table.addressCodecId, table.normalizedPayloadHex),
    index("idx_mq_token_contracts_asset").on(table.assetId),
    check("ck_mq_token_contracts_id_uint32", sql`${table.id} between 1 and 4294967295`),
    check("ck_mq_token_contracts_decimals_uint8", sql`${table.decimals} between 0 and 255`),
    check("ck_mq_token_contracts_payload_hex", sql`${table.normalizedPayloadHex} ~ '^[0-9a-f]+$' and length(${table.normalizedPayloadHex}) % 2 = 0`),
  ],
);

export const mqAssetNamespaces = pgTable(
  "mq_asset_namespaces",
  {
    id: bigint("asset_namespace_id", { mode: "number" }).primaryKey(),
    assetId: bigint("asset_id", { mode: "number" }).notNull().references(() => mqAssets.id),
    namespaceId: bigint("namespace_id", { mode: "number" }).notNull().references(() => mqAddressNamespaces.id),
    standardId: integer("standard_id").notNull().references(() => mqTokenStandards.id),
    status: text("status").notNull().default("active"),
    sourceId: bigint("source_id", { mode: "number" }).notNull().references(() => mqCatalogSources.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uq_mq_asset_namespaces_asset_namespace").on(table.assetId, table.namespaceId), check("ck_mq_asset_namespaces_id_uint32", sql`${table.id} between 1 and 4294967295`)],
);

export const mqDiscoveryJobs = pgTable(
  "mq_discovery_jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    discoveryType: text("discovery_type").notNull(),
    status: text("status").notNull().default("draft"),
    chainCode: text("chain_code"),
    seedAddress: text("seed_address"),
    entityId: bigint("entity_id", { mode: "number" }).references(() => mqEntities.id),
    protocolId: bigint("protocol_id", { mode: "number" }).references(() => mqProtocols.id),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    candidatesCreated: integer("candidates_created").notNull().default(0),
    evidenceCreated: integer("evidence_created").notNull().default(0),
    error: text("error"),
    logs: jsonb("logs").$type<string[]>().notNull().default([]),
    createdBy: uuid("created_by").references(() => mqUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mq_discovery_jobs_type").on(table.discoveryType),
    index("idx_mq_discovery_jobs_status").on(table.status),
    check("ck_mq_discovery_jobs_status", sql`${table.status} in (${sqlStringList(DISCOVERY_JOB_STATUSES)})`),
    check(
      "ck_mq_discovery_jobs_counts_non_negative",
      sql`${table.candidatesCreated} >= 0 and ${table.evidenceCreated} >= 0`,
    ),
  ],
);

export const mqAddressCandidates = pgTable(
  "mq_address_candidates",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceJobId: bigint("source_job_id", { mode: "number" }).references(() => mqSourceJobs.id),
    sourceDocumentId: bigint("source_document_id", { mode: "number" }).references(() => mqSourceDocuments.id),
    rawAddress: text("raw_address").notNull(),
    normalizedAddress: text("normalized_address").notNull(),
    chainCode: text("chain_code"),
    addressFamily: text("address_family"),
    prefixCode: integer("prefix_code").references(() => mqKvKeyPrefixDict.prefixCode),
    namespaceId: bigint("namespace_id", { mode: "number" }).references(() => mqAddressNamespaces.id),
    addressCodecId: integer("address_codec_id").references(() => mqAddressCodecs.id),
    payloadHex: text("payload_hex"),
    entityHint: text("entity_hint"),
    protocolHint: text("protocol_hint"),
    roleHint: text("role_hint"),
    suggestedEntityId: bigint("suggested_entity_id", { mode: "number" }).references(() => mqEntities.id),
    suggestedProtocolId: bigint("suggested_protocol_id", { mode: "number" }).references(() => mqProtocols.id),
    suggestedRoleId: integer("suggested_role_id").references(() => mqKvRoleDict.roleId),
    suggestedComponentId: bigint("suggested_component_id", { mode: "number" }).references(() => mqProtocolComponents.id),
    confidenceScore: integer("confidence_score").notNull().default(0),
    qualityTier: integer("quality_tier").notNull().default(0),
    candidateStatus: text("candidate_status").notNull().default("pending_review"),
    duplicateOfCandidateId: bigint("duplicate_of_candidate_id", { mode: "number" }),
    discoveredBy: text("discovered_by").notNull().default("manual"),
    discoveryJobId: bigint("discovery_job_id", { mode: "number" }).references(() => mqDiscoveryJobs.id),
    evidenceCount: integer("evidence_count").notNull().default(0),
    lastSeenBlock: bigint("last_seen_block", { mode: "number" }),
    firstSeenBlock: bigint("first_seen_block", { mode: "number" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mq_candidates_address_chain").on(table.normalizedAddress, table.chainCode),
    index("idx_mq_candidates_status").on(table.candidateStatus),
    index("idx_mq_candidates_source_job").on(table.sourceJobId),
    index("idx_mq_candidates_entity").on(table.suggestedEntityId),
    index("idx_mq_candidates_role").on(table.suggestedRoleId),
    index("idx_mq_candidates_component").on(table.suggestedComponentId),
    index("idx_mq_candidates_u1_key").on(table.namespaceId, table.addressCodecId, table.payloadHex),
    check("ck_mq_address_candidates_confidence_range", sql`${table.confidenceScore} between 0 and 100`),
    check("ck_mq_address_candidates_quality_tier_range", sql`${table.qualityTier} between 0 and 7`),
    check(
      "ck_mq_address_candidates_status",
      sql`${table.candidateStatus} in (${sqlStringList(CANDIDATE_STATUSES)})`,
    ),
    check("ck_mq_address_candidates_evidence_count_non_negative", sql`${table.evidenceCount} >= 0`),
  ],
);

export const mqLabelBatches = pgTable(
  "mq_label_batches",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceJobId: bigint("source_job_id", { mode: "number" }).references(() => mqSourceJobs.id),
    sourceDocumentId: bigint("source_document_id", { mode: "number" }).references(() => mqSourceDocuments.id),
    entityId: bigint("entity_id", { mode: "number" }).references(() => mqEntities.id),
    protocolId: bigint("protocol_id", { mode: "number" }).references(() => mqProtocols.id),
    roleId: integer("role_id").references(() => mqKvRoleDict.roleId),
    sourceType: text("source_type"),
    sourceUrl: text("source_url"),
    sourceName: text("source_name"),
    confidenceDefault: integer("confidence_default"),
    qualityTierDefault: integer("quality_tier_default"),
    statusDefault: integer("status_default"),
    flagsDefault: integer("flags_default"),
    importedCount: integer("imported_count").notNull().default(0),
    acceptedCount: integer("accepted_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    conflictCount: integer("conflict_count").notNull().default(0),
    effectiveFromBlock: bigint("effective_from_block", { mode: "number" }),
    effectiveToBlock: bigint("effective_to_block", { mode: "number" }),
    labelAction: text("label_action").notNull().default("create"),
    supersedesBatchId: bigint("supersedes_batch_id", { mode: "number" }),
    batchHash: text("batch_hash"),
    evidenceHash: text("evidence_hash"),
    storageUri: text("storage_uri"),
    parserVersion: text("parser_version").notNull().default("mqchain-console-v1"),
    dictionaryVersion: text("dictionary_version"),
    status: text("status").notNull().default("draft"),
    createdBy: uuid("created_by").references(() => mqUsers.id),
    approvedBy: uuid("approved_by").references(() => mqUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    committedAt: timestamp("committed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_mq_batches_status").on(table.status),
    index("idx_mq_batches_source_job").on(table.sourceJobId),
    index("idx_mq_batches_entity").on(table.entityId),
    check(
      "ck_mq_label_batches_confidence_default_range",
      sql`${table.confidenceDefault} is null or ${table.confidenceDefault} between 0 and 100`,
    ),
    check(
      "ck_mq_label_batches_quality_tier_default_range",
      sql`${table.qualityTierDefault} is null or ${table.qualityTierDefault} between 0 and 7`,
    ),
    check(
      "ck_mq_label_batches_status_default_range",
      sql`${table.statusDefault} is null or ${table.statusDefault} between 0 and 9`,
    ),
    check(
      "ck_mq_label_batches_counts_non_negative",
      sql`${table.importedCount} >= 0 and ${table.acceptedCount} >= 0 and ${table.rejectedCount} >= 0 and ${table.conflictCount} >= 0`,
    ),
    check(
      "ck_mq_label_batches_label_action",
      sql`${table.labelAction} in (${sqlStringList(BATCH_LABEL_ACTIONS)})`,
    ),
    check(
      "ck_mq_label_batches_status",
      sql`${table.status} in (${sqlStringList(BATCH_STATUSES)})`,
    ),
  ],
);

export const mqLabelBatchCandidates = pgTable(
  "mq_label_batch_candidates",
  {
    batchId: bigint("batch_id", { mode: "number" }).notNull().references(() => mqLabelBatches.id),
    candidateId: bigint("candidate_id", { mode: "number" }).notNull().references(() => mqAddressCandidates.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.batchId, table.candidateId] }),
    index("idx_mq_batch_candidates_candidate").on(table.candidateId),
  ],
);

export const mqAddressRegistry = pgTable(
  "mq_address_registry",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    normalizedAddress: text("normalized_address").notNull(),
    rawAddress: text("raw_address"),
    chainCode: text("chain_code").notNull(),
    prefixCode: integer("prefix_code").references(() => mqKvKeyPrefixDict.prefixCode),
    namespaceId: bigint("namespace_id", { mode: "number" }).references(() => mqAddressNamespaces.id),
    addressCodecId: integer("address_codec_id").references(() => mqAddressCodecs.id),
    payloadHex: text("payload_hex"),
    entityId: bigint("entity_id", { mode: "number" }).references(() => mqEntities.id),
    protocolId: bigint("protocol_id", { mode: "number" }).references(() => mqProtocols.id),
    categoryId: integer("category_id").references(() => mqCategoryDict.categoryId),
    roleId: integer("role_id").references(() => mqKvRoleDict.roleId),
    componentId: bigint("component_id", { mode: "number" }).references(() => mqProtocolComponents.id),
    tagsetId: bigint("tagset_id", { mode: "number" }).references(() => mqTagsetDict.id),
    confidenceScore: integer("confidence_score").notNull(),
    labelStatus: integer("label_status").notNull().default(1),
    qualityTier: integer("quality_tier").notNull(),
    flags: integer("flags").notNull().default(0),
    metricUsage: text("metric_usage"),
    validFromBlock: bigint("valid_from_block", { mode: "number" }),
    validToBlock: bigint("valid_to_block", { mode: "number" }),
    firstSeenBlock: bigint("first_seen_block", { mode: "number" }),
    lastSeenBlock: bigint("last_seen_block", { mode: "number" }),
    isActive: boolean("is_active").notNull().default(true),
    primarySourceJobId: bigint("primary_source_job_id", { mode: "number" }).references(() => mqSourceJobs.id),
    approvedBatchId: bigint("approved_batch_id", { mode: "number" }).references(() => mqLabelBatches.id),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_mq_registry_chain_address_role_from").on(
      table.chainCode,
      table.normalizedAddress,
      table.roleId,
      table.validFromBlock,
    ),
    index("idx_mq_registry_address_chain").on(table.normalizedAddress, table.chainCode),
    index("idx_mq_registry_entity").on(table.entityId),
    index("idx_mq_registry_protocol").on(table.protocolId),
    index("idx_mq_registry_role").on(table.roleId),
    index("idx_mq_registry_u1_key").on(table.namespaceId, table.addressCodecId, table.payloadHex),
    index("idx_mq_registry_active").on(table.isActive),
    check("ck_mq_address_registry_confidence_range", sql`${table.confidenceScore} between 0 and 100`),
    check("ck_mq_address_registry_label_status_range", sql`${table.labelStatus} between 0 and 9`),
    check("ck_mq_address_registry_quality_tier_range", sql`${table.qualityTier} between 0 and 7`),
    check("ck_mq_address_registry_flags_non_negative", sql`${table.flags} >= 0`),
    check(
      "ck_mq_address_registry_block_ranges",
      sql`(${table.validFromBlock} is null or ${table.validFromBlock} > 0)
        and (${table.validToBlock} is null or ${table.validToBlock} > 0)
        and (${table.firstSeenBlock} is null or ${table.firstSeenBlock} > 0)
        and (${table.lastSeenBlock} is null or ${table.lastSeenBlock} > 0)
        and (${table.validFromBlock} is null or ${table.validToBlock} is null or ${table.validToBlock} >= ${table.validFromBlock})
        and (${table.firstSeenBlock} is null or ${table.lastSeenBlock} is null or ${table.lastSeenBlock} >= ${table.firstSeenBlock})`,
    ),
  ],
);

export const mqAddressTags = pgTable(
  "mq_address_tags",
  {
    registryId: bigint("registry_id", { mode: "number" }).notNull().references(() => mqAddressRegistry.id),
    tagId: bigint("tag_id", { mode: "number" }).notNull().references(() => mqTagDict.id),
    sourceId: bigint("source_id", { mode: "number" }).references(() => mqCatalogSources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.registryId, table.tagId] }), index("idx_mq_address_tags_tag").on(table.tagId)],
);

export const mqAddressEvidence = pgTable(
  "mq_address_evidence",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    candidateId: bigint("candidate_id", { mode: "number" }).references(() => mqAddressCandidates.id),
    registryId: bigint("registry_id", { mode: "number" }).references(() => mqAddressRegistry.id),
    batchId: bigint("batch_id", { mode: "number" }).references(() => mqLabelBatches.id),
    evidenceType: text("evidence_type").notNull(),
    sourceUrl: text("source_url"),
    sourceDocumentId: bigint("source_document_id", { mode: "number" }).references(() => mqSourceDocuments.id),
    evidenceHash: text("evidence_hash"),
    storageUri: text("storage_uri"),
    confidenceDelta: integer("confidence_delta").notNull().default(0),
    trustTier: text("trust_tier").notNull().default("weak"),
    summary: text("summary"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => mqUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mq_evidence_candidate").on(table.candidateId),
    index("idx_mq_evidence_registry").on(table.registryId),
    index("idx_mq_evidence_batch").on(table.batchId),
    index("idx_mq_evidence_type").on(table.evidenceType),
    check("ck_mq_address_evidence_confidence_delta_range", sql`${table.confidenceDelta} between -100 and 100`),
    check(
      "ck_mq_address_evidence_trust_tier",
      sql`${table.trustTier} in (${sqlStringList(TRUST_TIERS)})`,
    ),
  ],
);

export const mqSourceVerifications = pgTable(
  "mq_source_verifications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceJobId: bigint("source_job_id", { mode: "number" }).references(() => mqSourceJobs.id),
    sourceDocumentId: bigint("source_document_id", { mode: "number" }).references(() => mqSourceDocuments.id),
    candidateId: bigint("candidate_id", { mode: "number" }).references(() => mqAddressCandidates.id),
    verificationScope: text("verification_scope").notNull().default("source_job"),
    sourceSheet: text("source_sheet"),
    sourceUrl: text("source_url"),
    sourceTrust: text("source_trust").notNull(),
    status: text("status").notNull().default("verified"),
    notes: text("notes"),
    verificationEvidence: jsonb("verification_evidence").$type<Record<string, unknown>>().notNull().default({}),
    verifiedBy: uuid("verified_by").references(() => mqUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mq_source_verifications_job").on(table.sourceJobId),
    index("idx_mq_source_verifications_document").on(table.sourceDocumentId),
    index("idx_mq_source_verifications_candidate").on(table.candidateId),
    index("idx_mq_source_verifications_scope").on(table.verificationScope),
    index("idx_mq_source_verifications_trust").on(table.sourceTrust),
    check(
      "ck_mq_source_verifications_scope",
      sql`${table.verificationScope} in (${sqlStringList(SOURCE_VERIFICATION_SCOPES)})`,
    ),
    check(
      "ck_mq_source_verifications_trust",
      sql`${table.sourceTrust} in (${sqlStringList(TRUST_TIERS)})`,
    ),
    check("ck_mq_source_verifications_status", sql`${table.status} in (${sqlStringList(SOURCE_VERIFICATION_STATUSES)})`),
  ],
);

export const mqLabelBatchEvidence = pgTable(
  "mq_label_batch_evidence",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    batchId: bigint("batch_id", { mode: "number" }).references(() => mqLabelBatches.id),
    evidenceId: bigint("evidence_id", { mode: "number" }).references(() => mqAddressEvidence.id),
    evidenceHash: text("evidence_hash"),
    summary: text("summary"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_mq_batch_evidence_batch").on(table.batchId)],
);

export const mqApprovalEvents = pgTable(
  "mq_approval_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    candidateId: bigint("candidate_id", { mode: "number" }).references(() => mqAddressCandidates.id),
    registryId: bigint("registry_id", { mode: "number" }).references(() => mqAddressRegistry.id),
    batchId: bigint("batch_id", { mode: "number" }).references(() => mqLabelBatches.id),
    action: text("action").notNull(),
    actorId: uuid("actor_id").references(() => mqUsers.id),
    reason: text("reason"),
    beforeJson: jsonb("before_json").$type<Record<string, unknown>>(),
    afterJson: jsonb("after_json").$type<Record<string, unknown>>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mq_approval_events_candidate").on(table.candidateId),
    index("idx_mq_approval_events_batch").on(table.batchId),
    index("idx_mq_approval_events_action").on(table.action),
  ],
);

export const mqAuditLog = pgTable(
  "mq_audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => mqUsers.id),
    action: text("action").notNull(),
    targetTable: text("target_table").notNull(),
    targetId: text("target_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_mq_audit_action").on(table.action), index("idx_mq_audit_target").on(table.targetTable, table.targetId)],
);

export const mqDictionaryVersions = pgTable("mq_dictionary_versions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  versionHash: text("version_hash").notNull().unique(),
  catalogHash: text("catalog_hash"),
  catalogPath: text("catalog_path"),
  status: text("status").notNull().default("active"),
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: uuid("created_by").references(() => mqUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
});

export const mqMetricGroups = pgTable(
  "mq_metric_groups",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    metricGroupCode: text("metric_group_code").notNull().unique(),
    metricGroupName: text("metric_group_name").notNull(),
    chainCode: text("chain_code"),
    namespaceId: bigint("namespace_id", { mode: "number" }).references(() => mqAddressNamespaces.id),
    minConfidence: integer("min_confidence").notNull().default(70),
    requireMetricEligible: boolean("require_metric_eligible").notNull().default(true),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mq_metric_groups_chain").on(table.chainCode),
    check("ck_mq_metric_groups_min_confidence_range", sql`${table.minConfidence} between 0 and 100`),
  ],
);

export const mqMetricGroupRules = pgTable(
  "mq_metric_group_rules",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    metricGroupId: bigint("metric_group_id", { mode: "number" }).notNull().references(() => mqMetricGroups.id),
    ruleVersion: integer("rule_version").notNull().default(1),
    ruleJson: jsonb("rule_json").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("active"),
    sourceId: bigint("source_id", { mode: "number" }).references(() => mqCatalogSources.id),
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_mq_metric_group_rules_group_version").on(table.metricGroupId, table.ruleVersion),
    index("idx_mq_metric_group_rules_group").on(table.metricGroupId),
    check("ck_mq_metric_group_rules_version", sql`${table.ruleVersion} > 0`),
    check("ck_mq_metric_group_rules_status", sql`${table.status} in ('draft', 'active', 'retired', 'disabled')`),
  ],
);

export const mqKvBuilds = pgTable(
  "mq_kv_builds",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    buildHash: text("build_hash").notNull().unique(),
    dictionaryVersion: text("dictionary_version"),
    buildKind: text("build_kind").notNull().default("base"),
    baseBuildId: bigint("base_build_id", { mode: "number" }),
    deltaParentBuildId: bigint("delta_parent_build_id", { mode: "number" }),
    compileRequestBuildId: bigint("compile_request_build_id", { mode: "number" }),
    lastCommittedBatchId: bigint("last_committed_batch_id", { mode: "number" }).references(() => mqLabelBatches.id),
    status: text("status").notNull().default("pending"),
    rowCount: integer("row_count").notNull().default(0),
    storageUri: text("storage_uri"),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => mqUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_mq_kv_builds_status").on(table.status),
    index("idx_mq_kv_builds_compile_request").on(table.compileRequestBuildId),
    uniqueIndex("uq_mq_kv_builds_one_active").on(table.status).where(sql`${table.status} = 'active'`),
    foreignKey({ columns: [table.baseBuildId], foreignColumns: [table.id], name: "fk_mq_kv_builds_base" }),
    foreignKey({ columns: [table.deltaParentBuildId], foreignColumns: [table.id], name: "fk_mq_kv_builds_delta_parent" }),
    foreignKey({ columns: [table.compileRequestBuildId], foreignColumns: [table.id], name: "fk_mq_kv_builds_compile_request" }),
    check("ck_mq_kv_builds_status", sql`${table.status} in (${sqlStringList(KV_ARTIFACT_STATUSES)})`),
    check("ck_mq_kv_builds_row_count_non_negative", sql`${table.rowCount} >= 0`),
    check("ck_mq_kv_builds_kind", sql`${table.buildKind} in (${sqlStringList(U1_BUILD_KINDS)})`),
    check("ck_mq_kv_builds_parent_shape", sql`(${table.buildKind} = 'base' and ${table.baseBuildId} is null and ${table.deltaParentBuildId} is null) or (${table.buildKind} = 'delta' and ((${table.baseBuildId} is not null)::int + (${table.deltaParentBuildId} is not null)::int) = 1)`),
  ],
);

export const mqKvCompiledEntries = pgTable(
  "mq_kv_compiled_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    buildId: bigint("build_id", { mode: "number" }).notNull().references(() => mqKvBuilds.id),
    indexName: text("index_name").notNull(),
    ordinal: integer("ordinal").notNull(),
    keyBytes: bytea("key_bytes").notNull(),
    valueBytes: bytea("value_bytes").notNull(),
    keyHash: text("key_hash").notNull(),
    recordHash: text("record_hash").notNull(),
    registryId: bigint("registry_id", { mode: "number" }).references(() => mqAddressRegistry.id),
    metricGroupId: bigint("metric_group_id", { mode: "number" }).references(() => mqMetricGroups.id),
    namespaceId: bigint("namespace_id", { mode: "number" }).references(() => mqAddressNamespaces.id),
    addressCodecId: integer("address_codec_id").references(() => mqAddressCodecs.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_mq_kv_compiled_entries_build_index_key").on(table.buildId, table.indexName, table.keyBytes),
    uniqueIndex("uq_mq_kv_compiled_entries_build_index_ordinal").on(table.buildId, table.indexName, table.ordinal),
    index("idx_mq_kv_compiled_entries_build_index_hash").on(table.buildId, table.indexName, table.keyHash),
    index("idx_mq_kv_compiled_entries_registry").on(table.registryId),
    index("idx_mq_kv_compiled_entries_metric_group").on(table.metricGroupId),
    index("idx_mq_kv_compiled_entries_namespace_codec").on(table.namespaceId, table.addressCodecId),
    check("ck_mq_kv_compiled_entries_index", sql`${table.indexName} in ('address_label_current', 'address_label_timeline', 'metric_group_membership')`),
    check("ck_mq_kv_compiled_entries_ordinal", sql`${table.ordinal} >= 0`),
    check("ck_mq_kv_compiled_entries_key_nonempty", sql`octet_length(${table.keyBytes}) > 0`),
    check("ck_mq_kv_compiled_entries_value_nonempty", sql`octet_length(${table.valueBytes}) > 0`),
    check("ck_mq_kv_compiled_entries_key_hash", sql`${table.keyHash} ~ '^[0-9a-f]{64}$'`),
    check("ck_mq_kv_compiled_entries_record_hash", sql`${table.recordHash} ~ '^[0-9a-f]{64}$'`),
    check("ck_mq_kv_compiled_entries_value_length", sql`(${table.indexName} = 'address_label_current' and octet_length(${table.valueBytes}) = 56) or (${table.indexName} = 'address_label_timeline' and octet_length(${table.valueBytes}) = 64) or (${table.indexName} = 'metric_group_membership' and octet_length(${table.valueBytes}) = 24)`),
  ],
);

export const mqKvValidationRuns = pgTable(
  "mq_kv_validation_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    buildId: bigint("build_id", { mode: "number" }).notNull().references(() => mqKvBuilds.id),
    compileRequestBuildId: bigint("compile_request_build_id", { mode: "number" }).notNull().references(() => mqKvBuilds.id),
    validationType: text("validation_type").notNull(),
    status: text("status").notNull(),
    dictionaryVersion: text("dictionary_version").notNull(),
    registrySnapshotHash: text("registry_snapshot_hash").notNull(),
    canonicalRowCount: integer("canonical_row_count").notNull(),
    postgresCompiledRowCount: integer("postgres_compiled_row_count").notNull(),
    rocksDbRowCount: integer("rocksdb_row_count").notNull(),
    missingInPostgresCompiled: integer("missing_in_postgres_compiled").notNull().default(0),
    extraInPostgresCompiled: integer("extra_in_postgres_compiled").notNull().default(0),
    postgresValueMismatchCount: integer("postgres_value_mismatch_count").notNull().default(0),
    missingInRocksDb: integer("missing_in_rocksdb").notNull().default(0),
    extraInRocksDb: integer("extra_in_rocksdb").notNull().default(0),
    rocksDbValueMismatchCount: integer("rocksdb_value_mismatch_count").notNull().default(0),
    duplicateKeyCount: integer("duplicate_key_count").notNull().default(0),
    semanticHashMismatchCount: integer("semantic_hash_mismatch_count").notNull().default(0),
    reportHash: text("report_hash").notNull(),
    report: jsonb("report").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mq_kv_validation_runs_build").on(table.buildId, table.createdAt),
    index("idx_mq_kv_validation_runs_request").on(table.compileRequestBuildId, table.createdAt),
    index("idx_mq_kv_validation_runs_status").on(table.status),
    check("ck_mq_kv_validation_runs_status", sql`${table.status} in ('running', 'passed', 'failed')`),
    check("ck_mq_kv_validation_runs_report_hash", sql`${table.reportHash} ~ '^[0-9a-f]{64}$'`),
    check("ck_mq_kv_validation_runs_counts", sql`${table.canonicalRowCount} >= 0 and ${table.postgresCompiledRowCount} >= 0 and ${table.rocksDbRowCount} >= 0 and ${table.missingInPostgresCompiled} >= 0 and ${table.extraInPostgresCompiled} >= 0 and ${table.postgresValueMismatchCount} >= 0 and ${table.missingInRocksDb} >= 0 and ${table.extraInRocksDb} >= 0 and ${table.rocksDbValueMismatchCount} >= 0 and ${table.duplicateKeyCount} >= 0 and ${table.semanticHashMismatchCount} >= 0`),
  ],
);

export const mqMetricGroupMembershipSnapshots = pgTable(
  "mq_metric_group_membership_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    metricGroupId: bigint("metric_group_id", { mode: "number" }).references(() => mqMetricGroups.id),
    kvBuildId: bigint("kv_build_id", { mode: "number" }).references(() => mqKvBuilds.id),
    metricGroupCode: text("metric_group_code").notNull(),
    dictionaryVersion: text("dictionary_version"),
    status: text("status").notNull().default("pending"),
    memberCount: integer("member_count").notNull().default(0),
    manifestHash: text("manifest_hash"),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => mqUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_mq_metric_member_snapshot_group").on(table.metricGroupId),
    index("idx_mq_metric_member_snapshot_build").on(table.kvBuildId),
    index("idx_mq_metric_member_snapshot_status").on(table.status),
    check(
      "ck_mq_metric_group_membership_snapshots_status",
      sql`${table.status} in (${sqlStringList(KV_ARTIFACT_STATUSES)})`,
    ),
    check("ck_mq_metric_group_membership_snapshots_member_count_non_negative", sql`${table.memberCount} >= 0`),
  ],
);

export const mqMetricGroupMembers = pgTable(
  "mq_metric_group_members",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    snapshotId: bigint("snapshot_id", { mode: "number" }).references(() => mqMetricGroupMembershipSnapshots.id),
    metricGroupId: bigint("metric_group_id", { mode: "number" }).references(() => mqMetricGroups.id),
    registryId: bigint("registry_id", { mode: "number" }).references(() => mqAddressRegistry.id),
    chainCode: text("chain_code").notNull(),
    normalizedAddress: text("normalized_address").notNull(),
    namespaceId: bigint("namespace_id", { mode: "number" }).references(() => mqAddressNamespaces.id),
    addressCodecId: integer("address_codec_id").references(() => mqAddressCodecs.id),
    payloadHex: text("payload_hex"),
    membershipStatus: text("membership_status").notNull().default("active"),
    entityId: bigint("entity_id", { mode: "number" }).references(() => mqEntities.id),
    roleId: integer("role_id").references(() => mqKvRoleDict.roleId),
    confidenceScore: integer("confidence_score").notNull(),
    flags: integer("flags").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_mq_metric_group_members_snapshot_registry").on(table.snapshotId, table.registryId),
    index("idx_mq_metric_group_members_group").on(table.metricGroupId),
    index("idx_mq_metric_group_members_registry").on(table.registryId),
    index("idx_mq_metric_group_members_address").on(table.chainCode, table.normalizedAddress),
    index("idx_mq_metric_group_members_u1_key").on(table.metricGroupId, table.namespaceId, table.addressCodecId, table.payloadHex),
    check("ck_mq_metric_group_members_confidence_range", sql`${table.confidenceScore} between 0 and 100`),
    check("ck_mq_metric_group_members_flags_non_negative", sql`${table.flags} >= 0`),
    check("ck_mq_metric_group_members_status", sql`${table.membershipStatus} in (${sqlStringList(U1_MEMBERSHIP_STATUSES)})`),
  ],
);

export const mqKvIndexManifests = pgTable(
  "mq_kv_index_manifest",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    buildId: bigint("build_id", { mode: "number" }).references(() => mqKvBuilds.id),
    indexName: text("index_name").notNull(),
    dictionaryVersion: text("dictionary_version"),
    status: text("status").notNull().default("pending"),
    rowCount: integer("row_count").notNull().default(0),
    keySchemaVersion: text("key_schema_version"),
    valueSchemaVersion: text("value_schema_version"),
    namespaceId: bigint("namespace_id", { mode: "number" }).references(() => mqAddressNamespaces.id),
    metricGroupId: bigint("metric_group_id", { mode: "number" }).references(() => mqMetricGroups.id),
    contentHash: text("content_hash"),
    storageUri: text("storage_uri"),
    manifestHash: text("manifest_hash"),
    lastCommittedBatchId: bigint("last_committed_batch_id", { mode: "number" }).references(() => mqLabelBatches.id),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => mqUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_mq_kv_index_manifest_build_index").on(table.buildId, table.indexName),
    index("idx_mq_kv_index_manifest_index").on(table.indexName),
    index("idx_mq_kv_index_manifest_status").on(table.status),
    index("idx_mq_kv_index_manifest_batch").on(table.lastCommittedBatchId),
    check(
      "ck_mq_kv_index_manifest_status",
      sql`${table.status} in (${sqlStringList(KV_ARTIFACT_STATUSES)})`,
    ),
    check("ck_mq_kv_index_manifest_row_count_non_negative", sql`${table.rowCount} >= 0`),
  ],
);

export const mqKvIndexShards = pgTable(
  "mq_kv_index_shards",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    manifestId: bigint("manifest_id", { mode: "number" }).references(() => mqKvIndexManifests.id),
    shardId: text("shard_id").notNull(),
    shardKey: text("shard_key").notNull(),
    shardHash: text("shard_hash"),
    storageUri: text("storage_uri"),
    rowCount: integer("row_count").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_mq_kv_index_shards_manifest_shard").on(table.manifestId, table.shardId),
    index("idx_mq_kv_index_shards_manifest").on(table.manifestId),
    index("idx_mq_kv_index_shards_key").on(table.shardKey),
    check("ck_mq_kv_index_shards_row_count_non_negative", sql`${table.rowCount} >= 0`),
  ],
);

export const mqKvFilterManifests = pgTable(
  "mq_kv_filter_manifest",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    buildId: bigint("build_id", { mode: "number" }).notNull().references(() => mqKvBuilds.id),
    indexManifestId: bigint("index_manifest_id", { mode: "number" }).references(() => mqKvIndexManifests.id),
    indexName: text("index_name").notNull(),
    filterSchemaVersion: text("filter_schema_version").notNull(),
    implementation: text("implementation").notNull(),
    implementationVersion: text("implementation_version").notNull(),
    deterministicHashSeed: text("deterministic_hash_seed").notNull(),
    itemCount: integer("item_count").notNull(),
    falsePositiveTargetPpm: integer("false_positive_target_ppm").notNull().default(1000),
    observedFalsePositivePpm: integer("observed_false_positive_ppm"),
    namespaceId: bigint("namespace_id", { mode: "number" }).references(() => mqAddressNamespaces.id),
    metricGroupId: bigint("metric_group_id", { mode: "number" }).references(() => mqMetricGroups.id),
    contentHash: text("content_hash").notNull(),
    storageUri: text("storage_uri").notNull(),
    status: text("status").notNull().default("pending"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_mq_kv_filter_manifest_build_index_scope").on(table.buildId, table.indexName, table.namespaceId, table.metricGroupId),
    uniqueIndex("uq_mq_kv_filter_manifest_global").on(table.buildId, table.indexName).where(sql`${table.namespaceId} is null and ${table.metricGroupId} is null`),
    uniqueIndex("uq_mq_kv_filter_manifest_namespace").on(table.buildId, table.indexName, table.namespaceId).where(sql`${table.namespaceId} is not null and ${table.metricGroupId} is null`),
    uniqueIndex("uq_mq_kv_filter_manifest_metric").on(table.buildId, table.indexName, table.metricGroupId).where(sql`${table.metricGroupId} is not null and ${table.namespaceId} is null`),
    index("idx_mq_kv_filter_manifest_build").on(table.buildId),
    index("idx_mq_kv_filter_manifest_status").on(table.status),
    check("ck_mq_kv_filter_manifest_status", sql`${table.status} in (${sqlStringList(KV_ARTIFACT_STATUSES)})`),
    check("ck_mq_kv_filter_manifest_counts", sql`${table.itemCount} >= 0 and ${table.falsePositiveTargetPpm} between 1 and 1000000 and (${table.observedFalsePositivePpm} is null or ${table.observedFalsePositivePpm} between 0 and 1000000)`),
  ],
);

export type MqUser = typeof mqUsers.$inferSelect;
export type MqAddressCandidate = typeof mqAddressCandidates.$inferSelect;
export type MqAddressRegistryRow = typeof mqAddressRegistry.$inferSelect;
export type MqLabelBatch = typeof mqLabelBatches.$inferSelect;
export type MqSourceVerification = typeof mqSourceVerifications.$inferSelect;
