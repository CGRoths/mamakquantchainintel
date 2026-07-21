import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mqAddressRegistry, mqAuditLog, mqCategoryDict, mqEntities, mqKvRoleDict, mqMetricGroupRules, mqMetricGroups, mqProtocols } from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";
import { buildMetricGroupCompilePreviewManifest, buildPendingMetricGroupKvManifest, evaluateMetricGroupPreviewMembers } from "../metric-group-preview";
import type { MetricGroupRule } from "../types";
import { buildMetricGroupRule, createMetricGroupRuleSchema, createMetricGroupSchema } from "../validators/metric-group";
import { getCanonicalDictionarySnapshot, recordDictionaryVersion } from "./dictionary-service";
import { idSchema } from "../validators/dictionary";
import { parseMetricGroupListFilters, type MetricGroupListFilters } from "../list-filters";

function metricGroupOrderBy(sort: MetricGroupListFilters["sort"]) {
  if (sort === "updated_at") return desc(mqMetricGroups.updatedAt);
  if (sort === "code") return asc(mqMetricGroups.metricGroupCode);
  if (sort === "confidence") return desc(mqMetricGroups.minConfidence);
  return desc(mqMetricGroups.createdAt);
}

function addCondition(conditions: SQL[], condition: SQL | undefined) {
  if (condition) conditions.push(condition);
}

export async function listMetricGroups(input: unknown = {}) {
  const filters = typeof input === "number" ? parseMetricGroupListFilters({ pageSize: input }) : parseMetricGroupListFilters(input);
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqMetricGroups.metricGroupCode, `%${filters.q}%`),
        ilike(mqMetricGroups.metricGroupName, `%${filters.q}%`),
        ilike(mqMetricGroups.description, `%${filters.q}%`),
        sql`${mqMetricGroups.id}::text ilike ${`%${filters.q}%`}`,
      ),
    );
  }

  if (filters.chain) conditions.push(eq(mqMetricGroups.chainCode, filters.chain));
  if (filters.active === "active") conditions.push(eq(mqMetricGroups.isActive, true));
  if (filters.active === "inactive") conditions.push(eq(mqMetricGroups.isActive, false));
  if (filters.metricEligible === "true") conditions.push(eq(mqMetricGroups.requireMetricEligible, true));
  if (filters.metricEligible === "false") conditions.push(eq(mqMetricGroups.requireMetricEligible, false));
  if (typeof filters.minConfidence === "number") conditions.push(gte(mqMetricGroups.minConfidence, filters.minConfidence));
  if (typeof filters.maxConfidence === "number") conditions.push(lte(mqMetricGroups.minConfidence, filters.maxConfidence));

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(mqMetricGroups).where(where);
  const rows = await db
    .select()
    .from(mqMetricGroups)
    .where(where)
    .orderBy(metricGroupOrderBy(filters.sort), desc(mqMetricGroups.id))
    .limit(filters.pageSize)
    .offset(offset);
  const rowIds = rows.map((row) => row.id);
  const ruleRows = rowIds.length
    ? await db
        .select()
        .from(mqMetricGroupRules)
        .where(inArray(mqMetricGroupRules.metricGroupId, rowIds))
        .orderBy(asc(mqMetricGroupRules.metricGroupId), asc(mqMetricGroupRules.id))
    : [];
  const rulesByGroup = new Map<number, typeof ruleRows>();

  for (const rule of ruleRows) {
    if (!rule.metricGroupId) continue;
    rulesByGroup.set(rule.metricGroupId, [...(rulesByGroup.get(rule.metricGroupId) ?? []), rule]);
  }

  const [dictionary, registryRows] = await Promise.all([
    getCanonicalDictionarySnapshot(db),
    db
      .select({ registry: mqAddressRegistry, entity: mqEntities, protocol: mqProtocols, role: mqKvRoleDict, category: mqCategoryDict })
      .from(mqAddressRegistry)
      .leftJoin(mqEntities, eq(mqAddressRegistry.entityId, mqEntities.id))
      .leftJoin(mqProtocols, eq(mqAddressRegistry.protocolId, mqProtocols.id))
      .leftJoin(mqKvRoleDict, eq(mqAddressRegistry.roleId, mqKvRoleDict.roleId))
      .leftJoin(mqCategoryDict, eq(mqKvRoleDict.categoryId, mqCategoryDict.categoryId)),
  ]);
  const previewRows = registryRows.map(row => ({
    ...row,
    entity: row.entity ? { ...row.entity, entityCode: row.entity.entityCode } : null,
    role: row.role ? { ...row.role, roleCode: row.role.roleCode } : null,
    category: row.category ? { ...row.category, categoryCode: row.category.categoryCode } : null,
  }));

  return {
    rows: rows.map((row) => {
      const rules = rulesByGroup.get(row.id) ?? [];
      const activeRules = rules.filter(rule => rule.status === "active").map(rule => rule.ruleJson as MetricGroupRule);
      const diagnostics = row.isActive
        ? evaluateMetricGroupPreviewMembers(row, activeRules, previewRows).diagnostics
        : { evaluatedRows: previewRows.length, memberRows: 0, excludedInactive: previewRows.length, excludedOutOfChainScope: 0, excludedMetricIneligible: 0, excludedRuleMismatch: 0 };
      return { ...row, rules, previewDiagnostics: diagnostics };
    }),
    dictionaryVersion: dictionary.versionHash,
    filters,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
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
    .leftJoin(mqCategoryDict, eq(mqKvRoleDict.categoryId, mqCategoryDict.categoryId));

  const ruleJson = rules.map((rule) => rule.ruleJson as MetricGroupRule);
  const previewRows = rows.map((row) => ({
    ...row,
    entity: row.entity ? { ...row.entity, entityCode: row.entity.entityCode } : null,
    role: row.role ? { ...row.role, roleCode: row.role.roleCode } : null,
    category: row.category ? { ...row.category, categoryCode: row.category.categoryCode } : null,
  }));
  const { members, diagnostics } = evaluateMetricGroupPreviewMembers(
    group,
    ruleJson,
    previewRows,
  );

  const manifestInput = {
    group,
    rules: ruleJson,
    members,
    diagnostics,
    focusedRegistryId,
  };

  return {
    group,
    members,
    diagnostics,
    rules,
    focusedMember: focusedRegistryId ? members.find((member) => member.registry.id === focusedRegistryId) ?? null : null,
    focusedRegistryId: focusedRegistryId ?? null,
    manifest: buildMetricGroupCompilePreviewManifest(manifestInput),
    kvManifest: buildPendingMetricGroupKvManifest(manifestInput),
  };
}

export async function previewMetricGroupMembersByCode(metricGroupCode: string, focusedRegistryId?: number | null) {
  const [group] = await getDb()
    .select({ id: mqMetricGroups.id })
    .from(mqMetricGroups)
    .where(eq(mqMetricGroups.metricGroupCode, metricGroupCode))
    .limit(1);

  if (!group) {
    return null;
  }

  return previewMetricGroupMembers(group.id, focusedRegistryId);
}
