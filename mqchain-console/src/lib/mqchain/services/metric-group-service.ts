import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mqAddressRegistry, mqAuditLog, mqCategoryDict, mqEntities, mqKvRoleDict, mqMetricGroupRules, mqMetricGroups, mqProtocols } from "@/db/schema";
import { assertPermission } from "@/lib/auth/permissions";
import { buildMetricGroupCompilePreviewManifest, filterMetricGroupPreviewMembers } from "../metric-group-preview";
import type { MetricGroupRule } from "../types";
import { buildMetricGroupRule, createMetricGroupRuleSchema, createMetricGroupSchema } from "../validators/metric-group";
import { recordDictionaryVersion } from "./dictionary-service";
import { idSchema } from "../validators/dictionary";

export async function listMetricGroups() {
  return getDb().select().from(mqMetricGroups).orderBy(desc(mqMetricGroups.createdAt));
}

export async function createMetricGroup(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = createMetricGroupSchema.parse(input);
  const rule = buildMetricGroupRule(parsed);
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const [group] = await tx
      .insert(mqMetricGroups)
      .values({
        metricGroupCode: parsed.metricGroupCode,
        metricGroupName: parsed.metricGroupName,
        chainCode: parsed.chainCode || null,
        minConfidence: parsed.minConfidence,
        requireMetricEligible: parsed.requireMetricEligible,
        description: parsed.description || null,
      })
      .returning();

    const [createdRule] = await tx
      .insert(mqMetricGroupRules)
      .values({
        metricGroupId: group.id,
        ruleJson: rule,
      })
      .returning();

    return { group, rule: createdRule };
  });

  const dictionaryVersion = await recordDictionaryVersion(actor.id, "metric_group_created");

  await db.insert(mqAuditLog).values({
    actorId: actor.id,
    action: "metric_group_created",
    targetTable: "mq_metric_groups",
    targetId: String(result.group.id),
    payload: {
      group: result.group,
      rule: result.rule,
      dictionaryVersion,
    },
  });

  return { ...result, dictionaryVersion };
}

export async function addMetricGroupRule(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = createMetricGroupRuleSchema.parse(input);
  const db = getDb();
  const [group] = await db.select().from(mqMetricGroups).where(eq(mqMetricGroups.id, parsed.metricGroupId)).limit(1);
  if (!group) {
    throw new Error("Metric group not found.");
  }

  const ruleJson = buildMetricGroupRule({
    ...parsed,
    minConfidence: parsed.ruleMinConfidence ?? group.minConfidence,
    ruleRequireMetricEligible: parsed.ruleRequireMetricEligible ?? group.requireMetricEligible,
  });
  const [rule] = await db
    .insert(mqMetricGroupRules)
    .values({
      metricGroupId: group.id,
      ruleJson,
    })
    .returning();

  const dictionaryVersion = await recordDictionaryVersion(actor.id, "metric_group_rule_created");
  await db.insert(mqAuditLog).values({
    actorId: actor.id,
    action: "metric_group_rule_created",
    targetTable: "mq_metric_group_rules",
    targetId: String(rule.id),
    payload: {
      group,
      rule,
      dictionaryVersion,
    },
  });

  return { group, rule, dictionaryVersion };
}

export async function deactivateMetricGroup(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = idSchema.parse(input);
  const db = getDb();
  const [group] = await db
    .update(mqMetricGroups)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mqMetricGroups.id, parsed.id))
    .returning();

  if (!group) {
    throw new Error("Metric group not found.");
  }

  const dictionaryVersion = await recordDictionaryVersion(actor.id, "metric_group_deactivated");
  await db.insert(mqAuditLog).values({
    actorId: actor.id,
    action: "metric_group_deactivated",
    targetTable: "mq_metric_groups",
    targetId: String(group.id),
    payload: {
      group,
      dictionaryVersion,
    },
  });

  return { group, dictionaryVersion };
}

export async function previewMetricGroupMembers(metricGroupId: number, focusedRegistryId?: number | null) {
  const db = getDb();
  const [group] = await db.select().from(mqMetricGroups).where(eq(mqMetricGroups.id, metricGroupId)).limit(1);
  if (!group) {
    return null;
  }

  const rules = await db.select().from(mqMetricGroupRules).where(eq(mqMetricGroupRules.metricGroupId, metricGroupId));
  const rows = await db
    .select({
      registry: mqAddressRegistry,
      entity: mqEntities,
      protocol: mqProtocols,
      role: mqKvRoleDict,
      category: mqCategoryDict,
    })
    .from(mqAddressRegistry)
    .leftJoin(mqEntities, eq(mqAddressRegistry.entityId, mqEntities.id))
    .leftJoin(mqProtocols, eq(mqAddressRegistry.protocolId, mqProtocols.id))
    .leftJoin(mqKvRoleDict, eq(mqAddressRegistry.roleId, mqKvRoleDict.roleId))
    .leftJoin(mqCategoryDict, eq(mqKvRoleDict.categoryId, mqCategoryDict.categoryId))
    .limit(1000);

  const ruleJson = rules.map((rule) => rule.ruleJson as MetricGroupRule);
  const members = filterMetricGroupPreviewMembers(
    group,
    ruleJson,
    rows.map((row) => ({
      ...row,
      entity: row.entity ? { ...row.entity, entityCode: row.entity.entityCode } : null,
      role: row.role ? { ...row.role, roleCode: row.role.roleCode } : null,
      category: row.category ? { ...row.category, categoryCode: row.category.categoryCode } : null,
    })),
  );

  return {
    group,
    members,
    rules,
    focusedMember: focusedRegistryId ? members.find((member) => member.registry.id === focusedRegistryId) ?? null : null,
    focusedRegistryId: focusedRegistryId ?? null,
    manifest: buildMetricGroupCompilePreviewManifest({
      group,
      rules: ruleJson,
      members,
      focusedRegistryId,
    }),
  };
}
