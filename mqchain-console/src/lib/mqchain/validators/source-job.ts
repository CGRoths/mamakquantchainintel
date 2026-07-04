import { z } from "zod";

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

export const sourceVerificationSchema = z.object({
  sourceJobId: z.coerce.number().int().positive(),
  sourceDocumentId: optionalPositiveInt(),
  candidateId: optionalPositiveInt(),
  verificationScope: z.enum(["source_job", "source_document", "source_sheet", "source_url"]).default("source_job"),
  sourceSheet: optionalText(),
  sourceUrl: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().url().optional(),
  ),
  sourceTrust: z.enum(["official", "verified_third_party", "inferred", "weak", "conflict"]).default("official"),
  status: z.enum(["verified", "rejected", "revoked"]).default("verified"),
  notes: optionalText(),
  verificationEvidenceJson: z.string().trim().optional(),
});
