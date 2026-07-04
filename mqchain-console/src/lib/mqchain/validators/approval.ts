import { z } from "zod";

import { LABEL_STATUS, LABEL_STATUS_MAX, LABEL_STATUS_MIN, QUALITY_TIER_MAX, QUALITY_TIER_MIN } from "../constants";

export const approvalEditSchema = z.object({
  candidateId: z.coerce.number().int().positive(),
  entityId: z.coerce.number().int().positive(),
  protocolId: z.coerce.number().int().positive().optional().or(z.literal("")),
  roleId: z.coerce.number().int().positive(),
  confidenceScore: z.coerce.number().int().min(0).max(100),
  qualityTier: z.coerce.number().int().min(QUALITY_TIER_MIN).max(QUALITY_TIER_MAX),
  labelStatus: z.coerce.number().int().min(LABEL_STATUS_MIN).max(LABEL_STATUS_MAX).default(LABEL_STATUS.activeCurrent),
  flags: z.coerce.number().int().min(0).default(0),
  metricEligible: z.enum(["true", "false"]).default("false"),
  validFromBlock: z.coerce.number().int().positive().optional().or(z.literal("")),
  validToBlock: z.coerce.number().int().positive().optional().or(z.literal("")),
  firstSeenBlock: z.coerce.number().int().positive().optional().or(z.literal("")),
  lastSeenBlock: z.coerce.number().int().positive().optional().or(z.literal("")),
  notes: z.string().trim().optional(),
});

export const rejectCandidateSchema = z.object({
  candidateId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1, "Rejection reason is required"),
});

export const candidateReviewStatusSchema = z.object({
  candidateId: z.coerce.number().int().positive(),
  reason: z.string().trim().optional(),
});

export const candidateHistoricalOnlySchema = z.object({
  candidateId: z.coerce.number().int().positive(),
  validFromBlock: z.coerce.number().int().positive().optional().or(z.literal("")),
  validToBlock: z.coerce.number().int().positive().optional().or(z.literal("")),
  reason: z.string().trim().optional(),
});

export const candidateSupersedeRegistrySchema = z.object({
  candidateId: z.coerce.number().int().positive(),
  supersedesRegistryId: z.coerce.number().int().positive(),
  validFromBlock: z.coerce.number().int().positive().optional().or(z.literal("")),
  reason: z.string().trim().optional(),
});

export const duplicateCandidateSchema = z.object({
  candidateId: z.coerce.number().int().positive(),
  duplicateOfCandidateId: z.coerce.number().int().positive(),
  reason: z.string().trim().optional(),
});
