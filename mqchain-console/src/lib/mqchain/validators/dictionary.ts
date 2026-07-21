import { z } from "zod";

import { QUALITY_TIER_MAX, QUALITY_TIER_MIN } from "../constants";
import { MAX_STABLE_DICTIONARY_ID } from "../kv/contract";

const stableId = z.coerce.number().int().positive().max(MAX_STABLE_DICTIONARY_ID);

export const dictionarySnapshotScopeSchema = z.enum(["active", "all"]).default("active");

export const idSchema = z.object({
  id: stableId,
});

export const entitySchema = z.object({
  entityCode: z.string().trim().min(1),
  entityName: z.string().trim().min(1),
  entityType: z.string().trim().optional(),
  categoryId: stableId.optional().or(z.literal("")),
  websiteUrl: z.string().trim().url().optional().or(z.literal("")),
  description: z.string().trim().optional(),
});

export const protocolSchema = z.object({
  entityId: stableId,
  protocolCode: z.string().trim().min(1),
  protocolName: z.string().trim().min(1),
  protocolType: z.string().trim().optional(),
  chainScope: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

export const categorySchema = z.object({
  categoryId: stableId,
  categoryCode: z.string().trim().min(1),
  categoryName: z.string().trim().min(1),
  parentCategoryId: stableId.optional().or(z.literal("")),
  domainCode: z.string().trim().optional(),
  metricDomain: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

export const roleSchema = z.object({
  roleId: stableId,
  roleCode: z.string().trim().min(1),
  roleName: z.string().trim().min(1),
  categoryId: stableId.optional().or(z.literal("")),
  roleGroup: z.string().trim().optional(),
  metricUsageDefault: z.string().trim().optional(),
  boundaryClass: z.string().trim().optional(),
  defaultQualityTier: z.coerce.number().int().min(QUALITY_TIER_MIN).max(QUALITY_TIER_MAX).default(1),
  defaultFlags: z.coerce.number().int().min(0).default(0),
  description: z.string().trim().optional(),
});

export const keyPrefixSchema = z.object({
  prefixCode: stableId,
  chainCode: z.string().trim().min(1),
  chainName: z.string().trim().optional(),
  chainFamily: z.string().trim().min(1),
  addressFamily: z.string().trim().min(1),
  codec: z.string().trim().min(1),
  payloadLen: z.coerce.number().int().positive().optional().or(z.literal("")),
  evmChainId: z.coerce.number().int().positive().optional().or(z.literal("")),
  description: z.string().trim().optional(),
});

export const entityUpdateSchema = entitySchema.extend({
  id: stableId,
  isActive: z.boolean().default(false),
});

export const protocolUpdateSchema = protocolSchema.extend({
  id: stableId,
  isActive: z.boolean().default(false),
});

export const categoryUpdateSchema = categorySchema.extend({
  isActive: z.boolean().default(false),
});

export const roleUpdateSchema = roleSchema.extend({
  isActive: z.boolean().default(false),
});

export const keyPrefixUpdateSchema = keyPrefixSchema.extend({
  isActive: z.boolean().default(false),
});
