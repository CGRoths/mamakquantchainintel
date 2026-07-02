import { createHash } from "crypto";
import { asc, count, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressCandidates,
  mqAddressRegistry,
  mqAuditLog,
  mqCategoryDict,
  mqDictionaryVersions,
  mqEntities,
  mqKvKeyPrefixDict,
  mqKvRoleDict,
  mqMetricGroupRules,
  mqMetricGroups,
  mqProtocols,
} from "@/db/schema";
import { assertPermission } from "@/lib/auth/permissions";
import { buildDefaultFlags } from "../flags";
import {
  categorySchema,
  entitySchema,
  idSchema,
  keyPrefixSchema,
  protocolSchema,
  roleSchema,
} from "../validators/dictionary";
import { optionalNumber } from "./service-utils";

export async function listDictionaries() {
  const db = getDb();
  const [entities, protocols, roles, categories, prefixes, metricGroups, metricGroupRules] = await Promise.all([
    db.select().from(mqEntities).orderBy(asc(mqEntities.entityName)),
    db.select().from(mqProtocols).orderBy(asc(mqProtocols.protocolName)),
    db.select().from(mqKvRoleDict).orderBy(asc(mqKvRoleDict.roleId)),
    db.select().from(mqCategoryDict).orderBy(asc(mqCategoryDict.categoryId)),
    db.select().from(mqKvKeyPrefixDict).orderBy(asc(mqKvKeyPrefixDict.prefixCode)),
    db.select().from(mqMetricGroups).orderBy(asc(mqMetricGroups.metricGroupCode)),
    db.select().from(mqMetricGroupRules).orderBy(asc(mqMetricGroupRules.metricGroupId), asc(mqMetricGroupRules.id)),
  ]);

  return { entities, protocols, roles, categories, prefixes, metricGroups, metricGroupRules };
}

export async function getDictionaryMaps() {
  const dictionaries = await listDictionaries();

  const entityByKey = new Map<string, (typeof dictionaries.entities)[number]>();
  for (const entity of dictionaries.entities) {
    entityByKey.set(entity.entityCode.toLowerCase(), entity);
    entityByKey.set(entity.entityName.toLowerCase(), entity);
  }

  const protocolByKey = new Map<string, (typeof dictionaries.protocols)[number]>();
  for (const protocol of dictionaries.protocols) {
    protocolByKey.set(protocol.protocolCode.toLowerCase(), protocol);
    protocolByKey.set(protocol.protocolName.toLowerCase(), protocol);
  }

  const roleByKey = new Map<string, (typeof dictionaries.roles)[number]>();
  for (const role of dictionaries.roles) {
    roleByKey.set(role.roleCode.toLowerCase(), role);
    roleByKey.set(role.roleName.toLowerCase(), role);
  }

  return { ...dictionaries, entityByKey, protocolByKey, roleByKey };
}

export async function getDashboardStats() {
  const db = getDb();
  const [
    pendingCandidates,
    needsReview,
    approvedToday,
    rejectedToday,
    committedBatches,
    activeEntities,
    activeProtocols,
    activeLabels,
    unresolvedConflicts,
    metricEligibleCount,
  ] = await Promise.all([
    db.select({ value: count() }).from(mqAddressCandidates).where(eq(mqAddressCandidates.candidateStatus, "pending_review")),
    db.select({ value: count() }).from(mqAddressCandidates).where(eq(mqAddressCandidates.candidateStatus, "needs_more_evidence")),
    db
      .select({ value: count() })
      .from(mqAddressCandidates)
      .where(sql`${mqAddressCandidates.candidateStatus} = 'approved' and ${mqAddressCandidates.updatedAt}::date = now()::date`),
    db
      .select({ value: count() })
      .from(mqAddressCandidates)
      .where(sql`${mqAddressCandidates.candidateStatus} = 'rejected' and ${mqAddressCandidates.updatedAt}::date = now()::date`),
    db.select({ value: count() }).from(mqAddressRegistry).where(sql`${mqAddressRegistry.approvedBatchId} is not null`),
    db.select({ value: count() }).from(mqEntities).where(eq(mqEntities.isActive, true)),
    db.select({ value: count() }).from(mqProtocols).where(eq(mqProtocols.isActive, true)),
    db.select({ value: count() }).from(mqAddressRegistry).where(eq(mqAddressRegistry.isActive, true)),
    db.select({ value: count() }).from(mqAddressCandidates).where(eq(mqAddressCandidates.candidateStatus, "conflict_pending")),
    db.select({ value: count() }).from(mqAddressRegistry).where(sql`(${mqAddressRegistry.flags} & 1) = 1`),
  ]);

  return {
    pendingCandidates: pendingCandidates[0]?.value ?? 0,
    needsReview: needsReview[0]?.value ?? 0,
    approvedToday: approvedToday[0]?.value ?? 0,
    rejectedToday: rejectedToday[0]?.value ?? 0,
    committedBatches: committedBatches[0]?.value ?? 0,
    activeEntities: activeEntities[0]?.value ?? 0,
    activeProtocols: activeProtocols[0]?.value ?? 0,
    activeLabels: activeLabels[0]?.value ?? 0,
    unresolvedConflicts: unresolvedConflicts[0]?.value ?? 0,
    metricEligibleCount: metricEligibleCount[0]?.value ?? 0,
  };
}

function versionHash(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function parseList(value?: string) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function recordDictionaryVersion(actorId?: string | null, reason = "dictionary_changed") {
  const db = getDb();
  const dictionaries = await listDictionaries();
  const payload = {
    categories: dictionaries.categories.map((item) => ({
      id: item.categoryId,
      code: item.categoryCode,
      name: item.categoryName,
      parent: item.parentCategoryId,
      domain: item.domainCode,
      metricDomain: item.metricDomain,
      active: item.isActive,
    })),
    entities: dictionaries.entities.map((item) => ({
      id: item.id,
      code: item.entityCode,
      name: item.entityName,
      type: item.entityType,
      categoryId: item.categoryId,
      active: item.isActive,
    })),
    protocols: dictionaries.protocols.map((item) => ({
      id: item.id,
      entityId: item.entityId,
      code: item.protocolCode,
      name: item.protocolName,
      type: item.protocolType,
      chains: item.chainScope,
      active: item.isActive,
    })),
    prefixes: dictionaries.prefixes.map((item) => ({
      prefixCode: item.prefixCode,
      chainCode: item.chainCode,
      family: item.chainFamily,
      addressFamily: item.addressFamily,
      codec: item.codec,
      payloadLen: item.payloadLen,
      active: item.isActive,
    })),
    roles: dictionaries.roles.map((item) => ({
      roleId: item.roleId,
      code: item.roleCode,
      categoryId: item.categoryId,
      group: item.roleGroup,
      metricUsage: item.metricUsageDefault,
      boundary: item.boundaryClass,
      flags: item.defaultFlags,
      active: item.isActive,
    })),
    metricGroups: dictionaries.metricGroups.map((item) => ({
      id: item.id,
      code: item.metricGroupCode,
      chainCode: item.chainCode,
      minConfidence: item.minConfidence,
      requireMetricEligible: item.requireMetricEligible,
      active: item.isActive,
    })),
    metricGroupRules: dictionaries.metricGroupRules.map((item) => ({
      id: item.id,
      metricGroupId: item.metricGroupId,
      ruleJson: item.ruleJson,
    })),
  };
  const hash = versionHash(payload);

  await db
    .insert(mqDictionaryVersions)
    .values({
      versionHash: hash,
      summary: {
        reason,
        counts: {
          categories: dictionaries.categories.length,
          entities: dictionaries.entities.length,
          protocols: dictionaries.protocols.length,
          prefixes: dictionaries.prefixes.length,
          roles: dictionaries.roles.length,
          metricGroups: dictionaries.metricGroups.length,
        },
      },
      createdBy: actorId,
    })
    .onConflictDoNothing();

  return hash;
}

async function auditDictionaryChange(actorId: string, action: string, targetTable: string, targetId: string | number, payload: Record<string, unknown>) {
  await getDb().insert(mqAuditLog).values({
    actorId,
    action,
    targetTable,
    targetId: String(targetId),
    payload,
  });
}

export async function listDictionaryVersions(limit = 20) {
  return getDb().select().from(mqDictionaryVersions).orderBy(desc(mqDictionaryVersions.createdAt)).limit(limit);
}

export async function createEntity(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = entitySchema.parse(input);
  const db = getDb();
  const [entity] = await db
    .insert(mqEntities)
    .values({
      entityCode: parsed.entityCode,
      entityName: parsed.entityName,
      entityType: parsed.entityType || null,
      categoryId: optionalNumber(parsed.categoryId),
      websiteUrl: parsed.websiteUrl || null,
      description: parsed.description || null,
    })
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "entity_created");
  await auditDictionaryChange(actor.id, "entity_created", "mq_entities", entity.id, { entity, dictionaryVersion: hash });
  return entity;
}

export async function deactivateEntity(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = idSchema.parse(input);
  const [entity] = await getDb()
    .update(mqEntities)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mqEntities.id, parsed.id))
    .returning();

  if (!entity) {
    throw new Error("Entity not found.");
  }

  const hash = await recordDictionaryVersion(actor.id, "entity_deactivated");
  await auditDictionaryChange(actor.id, "entity_deactivated", "mq_entities", entity.id, { entity, dictionaryVersion: hash });
  return entity;
}

export async function createProtocol(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = protocolSchema.parse(input);
  const [protocol] = await getDb()
    .insert(mqProtocols)
    .values({
      entityId: parsed.entityId,
      protocolCode: parsed.protocolCode,
      protocolName: parsed.protocolName,
      protocolType: parsed.protocolType || null,
      chainScope: parseList(parsed.chainScope),
      description: parsed.description || null,
    })
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "protocol_created");
  await auditDictionaryChange(actor.id, "protocol_created", "mq_protocols", protocol.id, { protocol, dictionaryVersion: hash });
  return protocol;
}

export async function deactivateProtocol(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = idSchema.parse(input);
  const [protocol] = await getDb()
    .update(mqProtocols)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mqProtocols.id, parsed.id))
    .returning();

  if (!protocol) {
    throw new Error("Protocol not found.");
  }

  const hash = await recordDictionaryVersion(actor.id, "protocol_deactivated");
  await auditDictionaryChange(actor.id, "protocol_deactivated", "mq_protocols", protocol.id, { protocol, dictionaryVersion: hash });
  return protocol;
}

export async function createCategory(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = categorySchema.parse(input);
  const [category] = await getDb()
    .insert(mqCategoryDict)
    .values({
      categoryId: parsed.categoryId,
      categoryCode: parsed.categoryCode,
      categoryName: parsed.categoryName,
      parentCategoryId: optionalNumber(parsed.parentCategoryId),
      domainCode: parsed.domainCode || null,
      metricDomain: parsed.metricDomain || null,
      description: parsed.description || null,
    })
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "category_created");
  await auditDictionaryChange(actor.id, "category_created", "mq_category_dict", category.categoryId, { category, dictionaryVersion: hash });
  return category;
}

export async function deactivateCategory(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = idSchema.parse(input);
  const [category] = await getDb()
    .update(mqCategoryDict)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mqCategoryDict.categoryId, parsed.id))
    .returning();

  if (!category) {
    throw new Error("Category not found.");
  }

  const hash = await recordDictionaryVersion(actor.id, "category_deactivated");
  await auditDictionaryChange(actor.id, "category_deactivated", "mq_category_dict", category.categoryId, { category, dictionaryVersion: hash });
  return category;
}

export async function createRole(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = roleSchema.parse(input);
  const defaultFlags = parsed.defaultFlags || buildDefaultFlags(parsed.roleCode, parsed.defaultQualityTier, parsed.metricUsageDefault?.includes("cex") ?? false);
  const [role] = await getDb()
    .insert(mqKvRoleDict)
    .values({
      roleId: parsed.roleId,
      roleCode: parsed.roleCode,
      roleName: parsed.roleName,
      categoryId: optionalNumber(parsed.categoryId),
      roleGroup: parsed.roleGroup || null,
      metricUsageDefault: parsed.metricUsageDefault || null,
      boundaryClass: parsed.boundaryClass || null,
      defaultQualityTier: parsed.defaultQualityTier,
      defaultFlags,
      description: parsed.description || null,
    })
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "role_created");
  await auditDictionaryChange(actor.id, "role_created", "mq_kv_role_dict", role.roleId, { role, dictionaryVersion: hash });
  return role;
}

export async function deactivateRole(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = idSchema.parse(input);
  const [role] = await getDb()
    .update(mqKvRoleDict)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mqKvRoleDict.roleId, parsed.id))
    .returning();

  if (!role) {
    throw new Error("Role not found.");
  }

  const hash = await recordDictionaryVersion(actor.id, "role_deactivated");
  await auditDictionaryChange(actor.id, "role_deactivated", "mq_kv_role_dict", role.roleId, { role, dictionaryVersion: hash });
  return role;
}

export async function createKeyPrefix(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = keyPrefixSchema.parse(input);
  const [prefix] = await getDb()
    .insert(mqKvKeyPrefixDict)
    .values({
      prefixCode: parsed.prefixCode,
      chainCode: parsed.chainCode,
      chainName: parsed.chainName || null,
      chainFamily: parsed.chainFamily,
      addressFamily: parsed.addressFamily,
      codec: parsed.codec,
      payloadLen: optionalNumber(parsed.payloadLen),
      evmChainId: optionalNumber(parsed.evmChainId),
      description: parsed.description || null,
    })
    .returning();

  const hash = await recordDictionaryVersion(actor.id, "key_prefix_created");
  await auditDictionaryChange(actor.id, "key_prefix_created", "mq_kv_key_prefix_dict", prefix.prefixCode, { prefix, dictionaryVersion: hash });
  return prefix;
}

export async function deactivateKeyPrefix(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = idSchema.parse(input);
  const [prefix] = await getDb()
    .update(mqKvKeyPrefixDict)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(mqKvKeyPrefixDict.prefixCode, parsed.id))
    .returning();

  if (!prefix) {
    throw new Error("Key prefix not found.");
  }

  const hash = await recordDictionaryVersion(actor.id, "key_prefix_deactivated");
  await auditDictionaryChange(actor.id, "key_prefix_deactivated", "mq_kv_key_prefix_dict", prefix.prefixCode, { prefix, dictionaryVersion: hash });
  return prefix;
}
