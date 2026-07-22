import { z } from "zod";

/** Hard ceiling on a single bulk approval selection. */
export const BULK_APPROVAL_MAX_CANDIDATES = 10_000;

export const BULK_APPROVAL_MODES = ["strict", "eligible_only"] as const;
export const BULK_APPROVAL_SELECTION_TYPES = ["explicit_ids", "source_sheet", "source_job"] as const;

export type BulkApprovalMode = (typeof BULK_APPROVAL_MODES)[number];

const candidateIdList = z
  .array(z.coerce.number().int().positive())
  .min(1, "Select at least one candidate.")
  .max(BULK_APPROVAL_MAX_CANDIDATES, `Select at most ${BULK_APPROVAL_MAX_CANDIDATES} candidates.`)
  // Sort and deduplicate at the edge so preview and execution always agree.
  .transform((ids) => Array.from(new Set(ids)).sort((left, right) => left - right));

const selectionSchema = z.object({
  selectionType: z.enum(BULK_APPROVAL_SELECTION_TYPES).default("explicit_ids"),
  candidateIds: candidateIdList.optional().default([]),
  sourceJobId: z.coerce.number().int().positive().optional(),
  sourceSheet: z.string().trim().min(1).max(500).nullable().optional(),
}).superRefine((selection, context) => {
  if (selection.selectionType === "explicit_ids" && selection.candidateIds.length === 0) {
    context.addIssue({ code: "custom", path: ["candidateIds"], message: "Select at least one candidate." });
  }
  if (selection.selectionType !== "explicit_ids" && !selection.sourceJobId) {
    context.addIssue({ code: "custom", path: ["sourceJobId"], message: "Source job is required for server-scoped selection." });
  }
  if (selection.selectionType === "source_sheet" && !selection.sourceSheet) {
    context.addIssue({ code: "custom", path: ["sourceSheet"], message: "Source sheet is required for sheet selection." });
  }
});

export const bulkApprovalPreviewSchema = selectionSchema.extend({
  mode: z.enum(BULK_APPROVAL_MODES).default("eligible_only"),
  blockerPage: z.coerce.number().int().positive().default(1),
  blockerPageSize: z.coerce.number().int().min(1).max(250).default(100),
});

export const bulkApprovalExecuteSchema = selectionSchema.extend({
  mode: z.enum(BULK_APPROVAL_MODES).default("eligible_only"),
  expectedDictionaryVersion: z.string().trim().min(1, "Expected dictionary version is required."),
  expectedPreviewHash: z.string().trim().min(1, "Expected preview hash is required."),
  expectedCandidateSnapshotHash: z.string().trim().length(64, "Expected candidate snapshot hash is required."),
  expectedSourceVerificationSnapshotHash: z.string().trim().length(64, "Expected source verification snapshot hash is required."),
  reason: z.string().trim().min(1, "A reason is required.").max(2000),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});
