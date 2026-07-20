import { z } from "zod";

import { SOURCE_VERIFICATION_SCOPES, SOURCE_VERIFICATION_STATUSES, TRUST_TIERS } from "../constants";

function optionalText() {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().optional(),
  );
}

function optionalPositiveInt() {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().positive().optional(),
  );
}

export const sourceJobArchiveSchema = z.object({
  sourceJobId: z.coerce.number().int().positive(),
  archiveStorageUri: z.string().trim().optional(),
  reason: z.string().trim().optional(),
});

export const sourceJobDeletionSchema = z.object({
  sourceJobId: z.coerce.number().int().positive(),
  confirmation: z.string(),
});

export function sourceJobDeleteConfirmation(sourceJobId: number) {
  return `DELETE ${sourceJobId}`;
}

export function isSourceJobDeleteConfirmation(sourceJobId: number, confirmation: string) {
  return confirmation === sourceJobDeleteConfirmation(sourceJobId);
}

export const sourceVerificationSchema = z.object({
  sourceJobId: z.coerce.number().int().positive(),
  sourceDocumentId: optionalPositiveInt(),
  candidateId: optionalPositiveInt(),
  verificationScope: z.enum(SOURCE_VERIFICATION_SCOPES).default("source_job"),
  sourceSheet: optionalText(),
  sourceUrl: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().url().optional(),
  ),
  sourceTrust: z.enum(TRUST_TIERS).default("official"),
  status: z.enum(SOURCE_VERIFICATION_STATUSES).default("verified"),
  notes: optionalText(),
  verificationEvidenceJson: z.string().trim().optional(),
});
