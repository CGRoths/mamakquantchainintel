import { z } from "zod";

import { NETWORK_CHANGE_TYPES } from "@/lib/mqchain/constants";

export const NETWORK_PROPOSAL_API_MAX_BODY_BYTES = 64 * 1024;

export const networkChangeProposalSchema = z.object({
  changeType: z.enum(NETWORK_CHANGE_TYPES),
  networkId: z.coerce.number().int().positive().max(4_294_967_295).nullable().optional(),
  proposedValues: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().trim().min(10).max(2_000),
}).superRefine((value, context) => {
  if (value.changeType !== "create" && !value.networkId) {
    context.addIssue({ code: "custom", path: ["networkId"], message: "Existing-network changes require a network ID." });
  }
  if (value.changeType === "create" && value.networkId) {
    context.addIssue({ code: "custom", path: ["networkId"], message: "Create proposals allocate the next stable ID when applied." });
  }
});

export const networkChangeReviewSchema = z.object({
  proposalId: z.coerce.number().int().positive(),
  action: z.enum(["approve", "reject", "apply"]),
  reviewNotes: z.string().trim().max(2_000).optional().default(""),
});

export type NetworkChangeProposalInput = z.infer<typeof networkChangeProposalSchema>;
