import { z } from "zod";

import { SOURCE_TYPES } from "../constants";

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
  qualityTier: z.coerce.number().int().min(0).max(5).default(1),
});

export const csvIntakeSchema = z.object({
  sourceType: z.enum(SOURCE_TYPES).default("csv_upload"),
  sourceName: z.string().trim().min(1, "Source name is required"),
  sourceUrl: z.string().trim().url().optional().or(z.literal("")),
  entityHint: z.string().trim().optional(),
  protocolHint: z.string().trim().optional(),
  csvText: z.string().trim().min(1, "CSV input is required"),
  localFileName: z.string().trim().optional(),
  uploadMimeType: z.string().trim().optional(),
  uploadSizeBytes: z.coerce.number().int().nonnegative().optional(),
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
  qualityTier: z.coerce.number().int().min(0).max(5).default(1),
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
  qualityTier: z.coerce.number().int().min(0).max(5).default(1),
  jsonText: z.string().trim().min(1, "JSON evidence input is required"),
});

export const aiCleanedCsvIntakeSchema = csvIntakeSchema.extend({
  sourceType: z.literal("llm_cleaned_csv").default("llm_cleaned_csv"),
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
    qualityTier: z.coerce.number().int().min(0).max(5).default(2),
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
