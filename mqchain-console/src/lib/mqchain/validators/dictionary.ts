import { z } from "zod";

export const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const entitySchema = z.object({
  entityCode: z.string().trim().min(1),
  entityName: z.string().trim().min(1),
  entityType: z.string().trim().optional(),
  categoryId: z.coerce.number().int().positive().optional().or(z.literal("")),
  websiteUrl: z.string().trim().url().optional().or(z.literal("")),
  description: z.string().trim().optional(),
});

export const protocolSchema = z.object({
  entityId: z.coerce.number().int().positive(),
  protocolCode: z.string().trim().min(1),
  protocolName: z.string().trim().min(1),
  protocolType: z.string().trim().optional(),
  chainScope: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

export const categorySchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  categoryCode: z.string().trim().min(1),
  categoryName: z.string().trim().min(1),
  parentCategoryId: z.coerce.number().int().positive().optional().or(z.literal("")),
  domainCode: z.string().trim().optional(),
  metricDomain: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

export const roleSchema = z.object({
  roleId: z.coerce.number().int().positive(),
  roleCode: z.string().trim().min(1),
  roleName: z.string().trim().min(1),
  categoryId: z.coerce.number().int().positive().optional().or(z.literal("")),
  roleGroup: z.string().trim().optional(),
  metricUsageDefault: z.string().trim().optional(),
  boundaryClass: z.string().trim().optional(),
  defaultQualityTier: z.coerce.number().int().min(0).max(5).default(1),
  defaultFlags: z.coerce.number().int().min(0).default(0),
  description: z.string().trim().optional(),
});

export const keyPrefixSchema = z.object({
  prefixCode: z.coerce.number().int().positive(),
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
  id: z.coerce.number().int().positive(),
  isActive: z.boolean().default(false),
});

export const protocolUpdateSchema = protocolSchema.extend({
  id: z.coerce.number().int().positive(),
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
