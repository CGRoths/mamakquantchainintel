import { z } from "zod";

import { QUALITY_TIER_MAX, QUALITY_TIER_MIN, SOURCE_TYPES } from "../constants";
import { assertCsvTextSignature, CSV_UPLOAD_MAX_BYTES } from "../csv-upload";

export const SOURCE_JOB_INTAKE_API_MAX_BODY_BYTES = CSV_UPLOAD_MAX_BYTES + 32 * 1024;

const boundedCsvText = z
  .string()
  .trim()
  .min(1, "CSV input is required")
  .refine((value) => Buffer.byteLength(value) <= CSV_UPLOAD_MAX_BYTES, {
    message: `CSV input exceeds ${CSV_UPLOAD_MAX_BYTES} bytes.`,
  })
  .refine((value) => {
    try {
      assertCsvTextSignature(value);
      return true;
    } catch {
      return false;
    }
  }, {
    message: "CSV input must be plain CSV text, not a binary, ZIP/XLSX, or PDF file.",
  });

export const manualIntakeSchema = z.object({
  sourceType: z.enum(SOURCE_TYPES).default("manual_input"),
  sourceName: z.string().trim().min(1, "Source name is required"),
  sourceUrl: z.string().trim().url().optional().or(z.literal("")),
  entityHint: z.string().trim().optional(),
  protocolHint: z.string().trim().optional(),
  roleHint: z.string().trim().optional(),
  chainCode: z.string().trim().optional(),
  addresses: z.string().trim().min(1, "At least one address is required"),
  notes: z.string().trim().optional(),
  confidenceScore: z.coerce.number().int().min(0).max(100).default(50),
  qualityTier: z.coerce.number().int().min(QUALITY_TIER_MIN).max(QUALITY_TIER_MAX).default(1),
});

export const csvIntakeSchema = z.object({
  sourceType: z.enum(SOURCE_TYPES).default("csv_upload"),
  sourceName: z.string().trim().min(1, "Source name is required"),
  sourceUrl: z.string().trim().url().optional().or(z.literal("")),
  entityHint: z.string().trim().optional(),
  protocolHint: z.string().trim().optional(),
  csvText: boundedCsvText,
  localFileName: z.string().trim().optional(),
  uploadMimeType: z.string().trim().optional(),
  uploadSizeBytes: z.coerce.number().int().nonnegative().max(CSV_UPLOAD_MAX_BYTES).optional(),
  csvInputMode: z.enum(["file_upload", "pasted_text"]).optional(),
});

export const urlIntakeSchema = z.object({
  sourceName: z.string().trim().min(1, "Source name is required"),
  sourceUrl: z.string().trim().url(),
  entityHint: z.string().trim().optional(),
  protocolHint: z.string().trim().optional(),
  roleHint: z.string().trim().optional(),
  chainCode: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  confidenceScore: z.coerce.number().int().min(0).max(100).default(60),
  qualityTier: z.coerce.number().int().min(QUALITY_TIER_MIN).max(QUALITY_TIER_MAX).default(1),
});

export const jsonEvidenceIntakeSchema = z.object({
  sourceName: z.string().trim().min(1, "Source name is required"),
  sourceUrl: z.string().trim().url().optional().or(z.literal("")),
  entityHint: z.string().trim().optional(),
  protocolHint: z.string().trim().optional(),
  roleHint: z.string().trim().optional(),
  chainCode: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  confidenceScore: z.coerce.number().int().min(0).max(100).default(60),
  qualityTier: z.coerce.number().int().min(QUALITY_TIER_MIN).max(QUALITY_TIER_MAX).default(1),
  jsonText: z.string().trim().min(1, "JSON evidence input is required"),
});

export const aiCleanedCsvIntakeSchema = csvIntakeSchema.extend({
  sourceType: z.literal("llm_cleaned_csv").default("llm_cleaned_csv"),
});

export const researchCsvPreflightSchema = csvIntakeSchema.extend({
  sourceType: z.enum(["csv_upload", "llm_cleaned_csv"]).default("llm_cleaned_csv"),
});

export const researchCsvCreateSchema = researchCsvPreflightSchema.extend({
  expectedDictionaryVersion: z.string().trim().length(64),
  preflightHash: z.string().trim().length(64),
});

export const deploymentSourceIntakeSchema = z
  .object({
    sourceType: z.enum(SOURCE_TYPES).default("official_url"),
    sourceName: z.string().trim().min(1, "Source name is required"),
    sourceUrl: z.string().trim().url().optional().or(z.literal("")),
    sourceText: z.string().trim().optional(),
    entityHint: z.string().trim().optional(),
    protocolHint: z.string().trim().optional(),
    roleHint: z.string().trim().optional(),
    chainCode: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    confidenceScore: z.coerce.number().int().min(0).max(100).default(70),
    qualityTier: z.coerce.number().int().min(QUALITY_TIER_MIN).max(QUALITY_TIER_MAX).default(2),
  })
  .superRefine((value, ctx) => {
    if (!value.sourceUrl && !value.sourceText) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either a source URL or pasted source text.",
        path: ["sourceUrl"],
      });
    }
  });

export const sourceJobIntakeApiRequestSchema = z.object({
  intakeType: z.enum(["manual", "csv", "ai_cleaned_csv", "url", "json_evidence", "deployment_source"]),
  payload: z.record(z.string(), z.unknown()),
});
