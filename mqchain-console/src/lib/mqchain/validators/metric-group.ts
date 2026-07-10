import { z } from "zod";

import type { MetricGroupRule } from "../types";

function optionalText() {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().optional(),
  );
}

function optionalConfidence() {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().min(0).max(100).optional(),
  );
}

function checkbox(defaultValue = false) {
  return z.preprocess((value) => {
    if (value === undefined) return defaultValue;
    if (value === true || value === "true" || value === "on" || value === "1") return true;
    return false;
  }, z.boolean());
}

export function parseMetricGroupRuleList(value?: string) {
  return value
    ?.split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export const createMetricGroupSchema = z
  .object({
    metricGroupCode: z.string().trim().min(1).regex(/^[a-z0-9_]+$/),
    metricGroupName: z.string().trim().min(1),
    chainCode: optionalText(),
    minConfidence: z.coerce.number().int().min(0).max(100).default(70),
    requireMetricEligible: checkbox(true),
    description: optionalText(),
    includeRoles: optionalText(),
    excludeRoles: optionalText(),
    includeCategories: optionalText(),
    excludeCategories: optionalText(),
    includeEntities: optionalText(),
    excludeEntities: optionalText(),
    ruleMinConfidence: optionalConfidence(),
    ruleRequireMetricEligible: checkbox(true),
  })
  .superRefine((value, ctx) => {
    const hasIncludeSelector = [
      value.includeRoles,
      value.includeCategories,
      value.includeEntities,
    ].some((item) => Boolean(parseMetricGroupRuleList(item)?.length));

    if (!hasIncludeSelector) {
      ctx.addIssue({
        code: "custom",
        message: "At least one include role, category, or entity is required.",
        path: ["includeRoles"],
      });
    }
  });

export type CreateMetricGroupInput = z.infer<typeof createMetricGroupSchema>;

export const createMetricGroupRuleSchema = z
  .object({
    metricGroupId: z.coerce.number().int().positive(),
    includeRoles: optionalText(),
    excludeRoles: optionalText(),
    includeCategories: optionalText(),
    excludeCategories: optionalText(),
    includeEntities: optionalText(),
    excludeEntities: optionalText(),
    ruleMinConfidence: optionalConfidence(),
    ruleRequireMetricEligible: checkbox(true),
  })
  .superRefine((value, ctx) => {
    const hasIncludeSelector = [
      value.includeRoles,
      value.includeCategories,
      value.includeEntities,
    ].some((item) => Boolean(parseMetricGroupRuleList(item)?.length));

    if (!hasIncludeSelector) {
      ctx.addIssue({
        code: "custom",
        message: "At least one include role, category, or entity is required.",
        path: ["includeRoles"],
      });
    }
  });

export type CreateMetricGroupRuleInput = z.infer<typeof createMetricGroupRuleSchema>;

type BuildMetricGroupRuleInput = {
  includeRoles?: string;
  excludeRoles?: string;
  includeCategories?: string;
  excludeCategories?: string;
  includeEntities?: string;
  excludeEntities?: string;
  minConfidence: number;
  ruleMinConfidence?: number;
  ruleRequireMetricEligible: boolean;
};

export function buildMetricGroupRule(input: BuildMetricGroupRuleInput): MetricGroupRule {
  const rule: MetricGroupRule = {
    includeRoles: parseMetricGroupRuleList(input.includeRoles),
    excludeRoles: parseMetricGroupRuleList(input.excludeRoles),
    includeCategories: parseMetricGroupRuleList(input.includeCategories),
    excludeCategories: parseMetricGroupRuleList(input.excludeCategories),
    includeEntities: parseMetricGroupRuleList(input.includeEntities),
    excludeEntities: parseMetricGroupRuleList(input.excludeEntities),
    minConfidence: input.ruleMinConfidence ?? input.minConfidence,
    requireMetricEligible: input.ruleRequireMetricEligible,
  };

  return Object.fromEntries(Object.entries(rule).filter(([, value]) => (Array.isArray(value) ? value.length > 0 : value !== undefined))) as MetricGroupRule;
}
