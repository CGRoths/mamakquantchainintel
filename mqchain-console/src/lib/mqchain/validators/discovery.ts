import { z } from "zod";

export const discoveryJobSchema = z.object({
  discoveryType: z.string().trim().min(1),
  chainCode: z.string().trim().optional(),
  seedAddress: z.string().trim().optional(),
  configJson: z.string().trim().optional(),
});

export const discoveryResultRowSchema = z.object({
  address: z.string().trim().min(1),
  chain: z.string().trim().optional(),
  entity: z.string().trim().optional(),
  protocol: z.string().trim().optional(),
  role: z.string().trim().optional(),
  root_type: z.string().trim().optional(),
  evidence_type: z.string().trim().optional(),
  source_url: z.string().trim().url().optional().or(z.literal("")),
  confidence: z.coerce.number().int().min(0).max(100).optional(),
  quality_tier: z.coerce.number().int().min(0).max(5).optional(),
  first_seen_block: z.coerce.number().int().positive().optional().or(z.literal("")),
  last_seen_block: z.coerce.number().int().positive().optional().or(z.literal("")),
  summary: z.string().trim().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const discoveryResultsSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  resultsJson: z.string().trim().min(2),
});

export const DISCOVERY_RESULTS_API_MAX_BODY_BYTES = 1024 * 1024;

export const discoveryResultsApiRequestSchema = z
  .object({
    results: z.array(discoveryResultRowSchema).optional(),
    resultsJson: z.string().trim().min(2).optional(),
  })
  .refine((value) => value.results || value.resultsJson, {
    message: "Provide either results or resultsJson.",
    path: ["results"],
  });

export const registryDiscoveryJobSchema = z.object({
  registryId: z.coerce.number().int().positive(),
  discoveryType: z.string().trim().min(1),
  configJson: z.string().trim().optional(),
});
