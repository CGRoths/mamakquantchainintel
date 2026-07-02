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

export type CandidateListFilters = z.infer<typeof candidateListFilterSchema>;
export type RegistryListFilters = z.infer<typeof registryListFilterSchema>;

export function parseCandidateListFilters(input: unknown) {
  return candidateListFilterSchema.parse(input);
}

export function parseRegistryListFilters(input: unknown) {
  return registryListFilterSchema.parse(input);
}
