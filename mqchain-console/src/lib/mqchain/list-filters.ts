import { z } from "zod";

import { QUALITY_TIER_MAX, QUALITY_TIER_MIN } from "./constants";

function optionalText() {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().optional(),
  );
}

function optionalInt() {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().optional(),
  );
}

function optionalRangedInt(min: number, max: number) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().min(min).max(max).optional(),
  );
}

const optionalQualityTier = () => optionalRangedInt(QUALITY_TIER_MIN, QUALITY_TIER_MAX);

const pageSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.coerce.number().int().positive().default(1),
);

const pageSizeSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.coerce.number().int().min(10).max(100).default(50),
);

export const candidateListFilterSchema = z.object({
  q: optionalText(),
  chain: optionalText(),
  entity: optionalText(),
  protocol: optionalText(),
  role: optionalText(),
  status: optionalText(),
  sourceType: optionalText(),
  discoveryType: optionalText(),
  conflicts: z.enum(["true", "false"]).optional(),
  minConfidence: optionalInt(),
  maxConfidence: optionalInt(),
  qualityTier: optionalQualityTier(),
  sort: z.enum(["created_at", "confidence", "evidence_count"]).default("created_at"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const registryListFilterSchema = z.object({
  q: optionalText(),
  chain: optionalText(),
  entity: optionalText(),
  protocol: optionalText(),
  role: optionalText(),
  category: optionalText(),
  metricEligible: z.enum(["true", "false"]).optional(),
  active: z.enum(["active", "inactive", "historical", "all"]).default("active"),
  minConfidence: optionalInt(),
  maxConfidence: optionalInt(),
  qualityTier: optionalQualityTier(),
  sourceBatch: optionalInt(),
  conflicts: z.enum(["true", "false"]).optional(),
  sort: z.enum(["created_at", "confidence", "quality", "address"]).default("created_at"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const sourceJobListFilterSchema = z.object({
  q: optionalText(),
  sourceType: optionalText(),
  status: optionalText(),
  entity: optionalText(),
  protocol: optionalText(),
  chain: optionalText(),
  sort: z.enum(["created_at", "updated_at", "source_type", "status"]).default("created_at"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const evidenceLedgerListFilterSchema = z.object({
  q: optionalText(),
  evidenceType: optionalText(),
  trustTier: optionalText(),
  sourceTrust: optionalText(),
  verificationStatus: optionalText(),
  verificationScope: optionalText(),
  sourceType: optionalText(),
  chain: optionalText(),
  candidateId: optionalInt(),
  registryId: optionalInt(),
  sourceJobId: optionalInt(),
  sourceDocumentId: optionalInt(),
  sort: z.enum(["created_at", "type", "trust"]).default("created_at"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const auditListFilterSchema = z.object({
  q: optionalText(),
  source: z.enum(["all", "approval", "system"]).default("all"),
  action: optionalText(),
  actor: optionalText(),
  target: optionalText(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const batchListFilterSchema = z.object({
  q: optionalText(),
  status: optionalText(),
  sourceType: optionalText(),
  entity: optionalText(),
  protocol: optionalText(),
  role: optionalText(),
  labelAction: optionalText(),
  sort: z.enum(["created_at", "updated_at", "status", "accepted_count", "committed_at"]).default("created_at"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const kvBuildListFilterSchema = z.object({
  q: optionalText(),
  status: optionalText(),
  dictionaryVersion: optionalText(),
  storage: optionalText(),
  minRows: optionalInt(),
  maxRows: optionalInt(),
  sort: z.enum(["created_at", "activated_at", "row_count", "status"]).default("created_at"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const discoveryJobListFilterSchema = z.object({
  q: optionalText(),
  discoveryType: optionalText(),
  status: optionalText(),
  chain: optionalText(),
  entity: optionalText(),
  protocol: optionalText(),
  seed: optionalText(),
  minCandidates: optionalInt(),
  minEvidence: optionalInt(),
  sort: z.enum(["created_at", "updated_at", "status", "candidates_created", "evidence_created"]).default("created_at"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const reviewGroupListFilterSchema = z.object({
  q: optionalText(),
  chain: optionalText(),
  entity: optionalText(),
  role: optionalText(),
  sourceType: optionalText(),
  discoveryType: optionalText(),
  minConfidence: optionalInt(),
  minCount: optionalInt(),
  minEvidence: optionalInt(),
  sort: z.enum(["count", "confidence", "evidence", "entity"]).default("count"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const reviewQueueListFilterSchema = z.object({
  q: optionalText(),
  chain: optionalText(),
  entity: optionalText(),
  protocol: optionalText(),
  role: optionalText(),
  sourceType: optionalText(),
  discoveryType: optionalText(),
  minConfidence: optionalInt(),
  maxConfidence: optionalInt(),
  qualityTier: optionalQualityTier(),
  sort: z.enum(["created_at", "confidence", "evidence_count"]).default("confidence"),
  page: pageSchema,
  approvedPage: pageSchema,
  pageSize: pageSizeSchema,
});

export const metricGroupListFilterSchema = z.object({
  q: optionalText(),
  chain: optionalText(),
  active: z.enum(["active", "inactive", "all"]).default("active"),
  metricEligible: z.enum(["true", "false"]).optional(),
  minConfidence: optionalInt(),
  maxConfidence: optionalInt(),
  sort: z.enum(["created_at", "updated_at", "code", "confidence"]).default("created_at"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const entityDictionaryListFilterSchema = z.object({
  q: optionalText(),
  entityType: optionalText(),
  category: optionalText(),
  active: z.enum(["active", "inactive", "all"]).default("active"),
  sort: z.enum(["name", "code", "type", "created_at", "updated_at"]).default("name"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const dictionaryVersionListFilterSchema = z.object({
  q: optionalText(),
  reason: optionalText(),
  actor: optionalText(),
  sort: z.enum(["created_at", "hash", "reason"]).default("created_at"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const categoryDictionaryListFilterSchema = z.object({
  q: optionalText(),
  domain: optionalText(),
  metricDomain: optionalText(),
  active: z.enum(["active", "inactive", "all"]).default("active"),
  sort: z.enum(["id", "code", "name", "domain", "created_at", "updated_at"]).default("id"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const protocolDictionaryListFilterSchema = z.object({
  q: optionalText(),
  entity: optionalText(),
  protocolType: optionalText(),
  chain: optionalText(),
  active: z.enum(["active", "inactive", "all"]).default("active"),
  sort: z.enum(["name", "code", "type", "entity", "created_at", "updated_at"]).default("name"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const roleDictionaryListFilterSchema = z.object({
  q: optionalText(),
  category: optionalText(),
  roleGroup: optionalText(),
  metricUsage: optionalText(),
  boundary: optionalText(),
  minQuality: optionalQualityTier(),
  maxQuality: optionalQualityTier(),
  active: z.enum(["active", "inactive", "all"]).default("active"),
  sort: z.enum(["id", "code", "name", "group", "quality", "created_at", "updated_at"]).default("id"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const keyPrefixDictionaryListFilterSchema = z.object({
  q: optionalText(),
  chain: optionalText(),
  chainFamily: optionalText(),
  addressFamily: optionalText(),
  codec: optionalText(),
  evmChainId: optionalInt(),
  minPayloadLen: optionalInt(),
  maxPayloadLen: optionalInt(),
  active: z.enum(["active", "inactive", "all"]).default("active"),
  sort: z.enum(["prefix", "chain", "chain_family", "address_family", "codec", "created_at", "updated_at"]).default("prefix"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type CandidateListFilters = z.infer<typeof candidateListFilterSchema>;
export type RegistryListFilters = z.infer<typeof registryListFilterSchema>;
export type SourceJobListFilters = z.infer<typeof sourceJobListFilterSchema>;
export type EvidenceLedgerListFilters = z.infer<typeof evidenceLedgerListFilterSchema>;
export type AuditListFilters = z.infer<typeof auditListFilterSchema>;
export type BatchListFilters = z.infer<typeof batchListFilterSchema>;
export type KvBuildListFilters = z.infer<typeof kvBuildListFilterSchema>;
export type DiscoveryJobListFilters = z.infer<typeof discoveryJobListFilterSchema>;
export type ReviewGroupListFilters = z.infer<typeof reviewGroupListFilterSchema>;
export type ReviewQueueListFilters = z.infer<typeof reviewQueueListFilterSchema>;
export type MetricGroupListFilters = z.infer<typeof metricGroupListFilterSchema>;
export type EntityDictionaryListFilters = z.infer<typeof entityDictionaryListFilterSchema>;
export type DictionaryVersionListFilters = z.infer<typeof dictionaryVersionListFilterSchema>;
export type CategoryDictionaryListFilters = z.infer<typeof categoryDictionaryListFilterSchema>;
export type ProtocolDictionaryListFilters = z.infer<typeof protocolDictionaryListFilterSchema>;
export type RoleDictionaryListFilters = z.infer<typeof roleDictionaryListFilterSchema>;
export type KeyPrefixDictionaryListFilters = z.infer<typeof keyPrefixDictionaryListFilterSchema>;

export function parseCandidateListFilters(input: unknown) {
  return candidateListFilterSchema.parse(input);
}

export function parseRegistryListFilters(input: unknown) {
  return registryListFilterSchema.parse(input);
}

export function parseSourceJobListFilters(input: unknown) {
  return sourceJobListFilterSchema.parse(input);
}

export function parseEvidenceLedgerListFilters(input: unknown) {
  return evidenceLedgerListFilterSchema.parse(input);
}

export function parseAuditListFilters(input: unknown) {
  return auditListFilterSchema.parse(input);
}

export function parseBatchListFilters(input: unknown) {
  return batchListFilterSchema.parse(input);
}

export function parseKvBuildListFilters(input: unknown) {
  return kvBuildListFilterSchema.parse(input);
}

export function parseDiscoveryJobListFilters(input: unknown) {
  return discoveryJobListFilterSchema.parse(input);
}

export function parseReviewGroupListFilters(input: unknown) {
  return reviewGroupListFilterSchema.parse(input);
}

export function parseReviewQueueListFilters(input: unknown) {
  return reviewQueueListFilterSchema.parse(input);
}

export function parseMetricGroupListFilters(input: unknown) {
  return metricGroupListFilterSchema.parse(input);
}

export function parseEntityDictionaryListFilters(input: unknown) {
  return entityDictionaryListFilterSchema.parse(input);
}

export function parseDictionaryVersionListFilters(input: unknown) {
  return dictionaryVersionListFilterSchema.parse(input);
}

export function parseCategoryDictionaryListFilters(input: unknown) {
  return categoryDictionaryListFilterSchema.parse(input);
}

export function parseProtocolDictionaryListFilters(input: unknown) {
  return protocolDictionaryListFilterSchema.parse(input);
}

export function parseRoleDictionaryListFilters(input: unknown) {
  return roleDictionaryListFilterSchema.parse(input);
}

export function parseKeyPrefixDictionaryListFilters(input: unknown) {
  return keyPrefixDictionaryListFilterSchema.parse(input);
}
