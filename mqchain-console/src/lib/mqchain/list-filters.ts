import { z } from "zod";

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
  qualityTier: optionalInt(),
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
  active: z.enum(["active", "inactive", "all"]).default("active"),
  minConfidence: optionalInt(),
  maxConfidence: optionalInt(),
  qualityTier: optionalInt(),
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

export type CandidateListFilters = z.infer<typeof candidateListFilterSchema>;
export type RegistryListFilters = z.infer<typeof registryListFilterSchema>;
export type SourceJobListFilters = z.infer<typeof sourceJobListFilterSchema>;
export type AuditListFilters = z.infer<typeof auditListFilterSchema>;
export type BatchListFilters = z.infer<typeof batchListFilterSchema>;
export type KvBuildListFilters = z.infer<typeof kvBuildListFilterSchema>;
export type DiscoveryJobListFilters = z.infer<typeof discoveryJobListFilterSchema>;

export function parseCandidateListFilters(input: unknown) {
  return candidateListFilterSchema.parse(input);
}

export function parseRegistryListFilters(input: unknown) {
  return registryListFilterSchema.parse(input);
}

export function parseSourceJobListFilters(input: unknown) {
  return sourceJobListFilterSchema.parse(input);
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
