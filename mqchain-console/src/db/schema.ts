import {
  bigint,
  bigserial,
  boolean,
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

export const mqUsers = pgTable("mq_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("analyst"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  ],
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
  ],
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
    payloadHex: text("payload_hex"),
    entityHint: text("entity_hint"),
    protocolHint: text("protocol_hint"),
    roleHint: text("role_hint"),
    suggestedEntityId: bigint("suggested_entity_id", { mode: "number" }).references(() => mqEntities.id),
    suggestedProtocolId: bigint("suggested_protocol_id", { mode: "number" }).references(() => mqProtocols.id),
    suggestedRoleId: integer("suggested_role_id").references(() => mqKvRoleDict.roleId),
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
    payloadHex: text("payload_hex"),
    entityId: bigint("entity_id", { mode: "number" }).references(() => mqEntities.id),
    protocolId: bigint("protocol_id", { mode: "number" }).references(() => mqProtocols.id),
    roleId: integer("role_id").references(() => mqKvRoleDict.roleId),
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
    index("idx_mq_registry_active").on(table.isActive),
  ],
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
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: uuid("created_by").references(() => mqUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mqMetricGroups = pgTable(
  "mq_metric_groups",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    metricGroupCode: text("metric_group_code").notNull().unique(),
    metricGroupName: text("metric_group_name").notNull(),
    chainCode: text("chain_code"),
    minConfidence: integer("min_confidence").notNull().default(70),
    requireMetricEligible: boolean("require_metric_eligible").notNull().default(true),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_mq_metric_groups_chain").on(table.chainCode)],
);

export const mqMetricGroupRules = pgTable(
  "mq_metric_group_rules",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    metricGroupId: bigint("metric_group_id", { mode: "number" }).references(() => mqMetricGroups.id),
    ruleJson: jsonb("rule_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_mq_metric_group_rules_group").on(table.metricGroupId)],
);

export const mqKvBuilds = pgTable(
  "mq_kv_builds",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    buildHash: text("build_hash").notNull().unique(),
    dictionaryVersion: text("dictionary_version"),
    status: text("status").notNull().default("pending"),
    rowCount: integer("row_count").notNull().default(0),
    storageUri: text("storage_uri"),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => mqUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
  },
  (table) => [index("idx_mq_kv_builds_status").on(table.status)],
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
  ],
);

export type MqUser = typeof mqUsers.$inferSelect;
export type MqAddressCandidate = typeof mqAddressCandidates.$inferSelect;
export type MqAddressRegistryRow = typeof mqAddressRegistry.$inferSelect;
export type MqLabelBatch = typeof mqLabelBatches.$inferSelect;
export type MqSourceVerification = typeof mqSourceVerifications.$inferSelect;
