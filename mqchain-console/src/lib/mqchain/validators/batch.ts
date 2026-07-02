import { z } from "zod";

export const createBatchSchema = z.object({
  candidateIds: z
    .string()
    .trim()
    .min(1)
    .transform((value) =>
      value
        .split(/[,\s]+/)
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
        .filter((item, index, items) => items.indexOf(item) === index),
    ),
  sourceName: z.string().trim().optional(),
});

export const batchIdSchema = z.object({
  batchId: z.coerce.number().int().positive(),
});

export const batchLifecycleSchema = z.object({
  batchId: z.coerce.number().int().positive(),
  reason: z.string().trim().optional(),
});
