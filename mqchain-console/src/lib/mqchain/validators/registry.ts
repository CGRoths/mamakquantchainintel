import { z } from "zod";

import { LABEL_STATUS, LABEL_STATUS_MAX, LABEL_STATUS_MIN, QUALITY_TIER_MAX, QUALITY_TIER_MIN } from "../constants";

export const registryExportApiFormatSchema = z.enum(["json", "csv"]).default("json");

export const resolverSchema = z.object({
  chainCode: z.string().trim().min(1),
  address: z.string().trim().min(1),
  blockNumber: z.coerce.number().int().positive().optional().or(z.literal("")),
  metricGroupCode: z.string().trim().optional(),
});

export const registryEditSchema = z.object({
  registryId: z.coerce.number().int().positive(),
  entityId: z.coerce.number().int().positive(),
  protocolId: z.coerce.number().int().positive().optional().or(z.literal("")),
  roleId: z.coerce.number().int().positive(),
  confidenceScore: z.coerce.number().int().min(0).max(100),
  qualityTier: z.coerce.number().int().min(QUALITY_TIER_MIN).max(QUALITY_TIER_MAX),
  labelStatus: z.coerce.number().int().min(LABEL_STATUS_MIN).max(LABEL_STATUS_MAX).default(LABEL_STATUS.activeCurrent),
  flags: z.coerce.number().int().min(0).default(0),
  metricUsage: z.string().trim().optional(),
  validFromBlock: z.coerce.number().int().positive().optional().or(z.literal("")),
  validToBlock: z.coerce.number().int().positive().optional().or(z.literal("")),
  firstSeenBlock: z.coerce.number().int().positive().optional().or(z.literal("")),
  lastSeenBlock: z.coerce.number().int().positive().optional().or(z.literal("")),
  notes: z.string().trim().optional(),
});

export const registryIdSchema = z.object({
  registryId: z.coerce.number().int().positive(),
  reason: z.string().trim().optional(),
});

export const registrySupersedeSchema = z.object({
  registryId: z.coerce.number().int().positive(),
  replacementRegistryId: z.coerce.number().int().positive(),
  validToBlock: z.coerce.number().int().positive().optional().or(z.literal("")),
  reason: z.string().trim().optional(),
});

export const addRegistrySecondaryRoleSchema = z.object({
  registryId: z.coerce.number().int().positive(),
  roleId: z.coerce.number().int().positive(),
  reason: z.string().trim().optional(),
});

export const transactionFlowSchema = z.object({
  txChainCode: z.string().trim().min(1),
  inputAddresses: z.string().trim().min(1),
  outputAddresses: z.string().trim().min(1),
  txBlockNumber: z.coerce.number().int().positive().optional().or(z.literal("")),
  txMetricGroupCode: z.string().trim().min(1).default("btc_cex_flow_boundary"),
});
