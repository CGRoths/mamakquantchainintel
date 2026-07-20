import { z } from "zod";

import { DICTIONARY_PROPOSAL_KINDS } from "../constants";

const jsonObject = z.record(z.string(), z.unknown()).default({});

export const dictionaryProposalCreateSchema = z.object({
  proposalKind: z.enum(DICTIONARY_PROPOSAL_KINDS),
  proposedCode: z.string().trim().min(1).max(160),
  proposedName: z.string().trim().min(1).max(300),
  targetReferences: jsonObject,
  proposedValues: jsonObject,
  sourceJobId: z.coerce.number().int().positive().optional(),
  sourceDocumentId: z.coerce.number().int().positive().optional(),
  candidateId: z.coerce.number().int().positive().optional(),
  affectedRowReferences: z.array(z.unknown()).max(10_000).default([]),
  reason: z.string().trim().min(1).max(4_000),
  evidence: jsonObject,
});

export const dictionaryProposalReviewSchema = z.object({
  proposalId: z.coerce.number().int().positive(),
  action: z.enum(["approve", "reject", "apply"]),
  reviewNotes: z.string().trim().max(4_000).optional(),
});

export const dictionaryReresolutionSchema = z.object({
  sourceJobId: z.coerce.number().int().positive().optional(),
  candidateIds: z.array(z.coerce.number().int().positive()).max(10_000).optional(),
  expectedDictionaryVersion: z.string().trim().length(64).optional(),
}).refine(value => value.sourceJobId || value.candidateIds?.length, {
  message: "Provide a source job or selected candidates.",
});
