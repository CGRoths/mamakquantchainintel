import { z } from "zod";

export const sourceJobArchiveSchema = z.object({
  sourceJobId: z.coerce.number().int().positive(),
  archiveStorageUri: z.string().trim().optional(),
  reason: z.string().trim().optional(),
});
