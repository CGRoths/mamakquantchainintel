import { z } from "zod";

/** Hard ceiling on a single bulk approval selection. */
export const BULK_APPROVAL_MAX_CANDIDATES = 10_000;

export const BULK_APPROVAL_MODES = ["strict", "eligible_only"] as const;

export type BulkApprovalMode = (typeof BULK_APPROVAL_MODES)[number];

const candidateIdList = z
  .array(z.coerce.number().int().positive())
  .min(1, "Select at least one candidate.")
  .max(BULK_APPROVAL_MAX_CANDIDATES, `Select at most ${BULK_APPROVAL_MAX_CANDIDATES} candidates.`)
  // Sort and deduplicate at the edge so preview and execution always agree.
  .transform((ids) => Array.from(new Set(ids)).sort((left, right) => left - right));

export const bulkApprovalPreviewSchema = z.object({
  candidateIds: candidateIdList,
  sourceJobId: z.coerce.number().int().positive().optional(),
  mode: z.enum(BULK_APPROVAL_MODES).default("eligible_only"),
});

export const bulkApprovalExecuteSchema = z.object({
  candidateIds: candidateIdList,
  mode: z.enum(BULK_APPROVAL_MODES).default("eligible_only"),
  expectedDictionaryVersion: z.string().trim().min(1, "Expected dictionary version is required."),
  expectedPreviewHash: z.string().trim().min(1, "Expected preview hash is required."),
  reason: z.string().trim().min(1, "A reason is required.").max(2000),
});
