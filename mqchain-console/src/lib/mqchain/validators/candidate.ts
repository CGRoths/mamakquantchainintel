import { z } from "zod";

export const candidateFilterSchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  chain: z.string().optional(),
  entity: z.string().optional(),
  role: z.string().optional(),
});
