import { z } from "zod";

import { TRUST_TIERS } from "../constants";

const evidenceFields = {
  evidenceType: z.string().trim().min(1),
  sourceUrl: z.string().trim().url().optional().or(z.literal("")),
  trustTier: z.enum(TRUST_TIERS).default("weak"),
  confidenceDelta: z.coerce.number().int().min(-100).max(100).default(0),
  summary: z.string().trim().min(1),
  payloadJson: z.string().trim().optional(),
};

export const candidateEvidenceSchema = z.object({
  candidateId: z.coerce.number().int().positive(),
  ...evidenceFields,
});

export const registryEvidenceSchema = z.object({
  registryId: z.coerce.number().int().positive(),
  ...evidenceFields,
});
