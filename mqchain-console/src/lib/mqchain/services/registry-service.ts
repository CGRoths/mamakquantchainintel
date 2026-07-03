import { and, asc, desc, eq, gte, ilike, lte, ne, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressCandidates,
  mqAddressEvidence,
  mqAddressRegistry,
  mqApprovalEvents,
  mqAuditLog,
  mqCategoryDict,
  mqDiscoveryJobs,
  mqEntities,
  mqKvRoleDict,
  mqLabelBatches,
  mqMetricGroupRules,
  mqMetricGroups,
  mqProtocols,
  mqSourceDocuments,
  mqSourceJobs,
} from "@/db/schema";
import { assertPermission } from "@/lib/auth/permissions";
import { LABEL_STATUS } from "../constants";
import { FLAG_BITS, markHistoricalOnlyFlags, setFlag } from "../flags";
import { parseRegistryListFilters, type RegistryListFilters } from "../list-filters";
import { matchingMetricGroupsForRow } from "../metric-rules";
import { extractRegistryCandidateId } from "../registry-detail";
import { buildSupersededRegistryMetadata, inferSupersededValidToBlock } from "../registry-lifecycle";
import { addSecondaryRoleToMetadata, parseSecondaryRoles } from "../secondary-roles";
import type { MetricGroupRule } from "../types";
import { addRegistrySecondaryRoleSchema, registryEditSchema, registryIdSchema, registrySupersedeSchema } from "../validators/registry";
import { optionalNumber } from "./service-utils";

function registryOrderBy(sort: RegistryListFilters["sort"]) {
  if (sort === "confidence") return desc(mqAddressRegistry.confidenceScore);
  if (sort === "quality") return desc(mqAddressRegistry.qualityTier);
  if (sort === "address") return asc(mqAddressRegistry.normalizedAddress);
  return desc(mqAddressRegistry.createdAt);
}

function flagCondition(bit: number, expected = true) {
  const mask = 1 << bit;
  return expected ? sql`(${mqAddressRegistry.flags} & ${mask}) <> 0` : sql`(${mqAddressRegistry.flags} & ${mask}) = 0`;
}

function addCondition(conditions: SQL[], condition: SQL | undefined) {
  if (condition) conditions.push(condition);
}

export async function listRegistry(input?: unknown) {
  const filters = parseRegistryListFilters(input ?? {});
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqAddressRegistry.normalizedAddress, `%${filters.q}%`),
        ilike(mqAddressRegistry.rawAddress, `%${filters.q}%`),
        ilike(mqAddressRegistry.notes, `%${filters.q}%`),
      ),
    );
  }

  if (filters.chain) {
    conditions.push(eq(mqAddressRegistry.chainCode, filters.chain));
  }

  if (filters.entity) {
    addCondition(conditions, or(ilike(mqEntities.entityCode, `%${filters.entity}%`), ilike(mqEntities.entityName, `%${filters.entity}%`)));
  }

  if (filters.protocol) {
    addCondition(
      conditions,
      or(ilike(mqProtocols.protocolCode, `%${filters.protocol}%`), ilike(mqProtocols.protocolName, `%${filters.protocol}%`)),
    );
  }

  if (filters.role) {
    addCondition(conditions, or(ilike(mqKvRoleDict.roleCode, `%${filters.role}%`), ilike(mqKvRoleDict.roleName, `%${filters.role}%`)));
  }

  if (filters.category) {
    addCondition(
      conditions,
      or(ilike(mqCategoryDict.categoryCode, `%${filters.category}%`), ilike(mqCategoryDict.categoryName, `%${filters.category}%`)),
    );
  }

  if (filters.metricEligible === "true") {
    conditions.push(flagCondition(FLAG_BITS.metricEligible, true));
  } else if (filters.metricEligible === "false") {
    conditions.push(flagCondition(FLAG_BITS.metricEligible, false));
  }

  if (filters.active === "active") {
    conditions.push(eq(mqAddressRegistry.isActive, true));
  } else if (filters.active === "inactive") {
    conditions.push(eq(mqAddressRegistry.isActive, false));
  } else if (filters.active === "historical") {
    addCondition(conditions, or(eq(mqAddressRegistry.labelStatus, LABEL_STATUS.inactiveHistorical), flagCondition(FLAG_BITS.historicalOnly, true)));
  }

  if (filters.minConfidence !== undefined) {
    conditions.push(gte(mqAddressRegistry.confidenceScore, filters.minConfidence));
  }

  if (filters.maxConfidence !== undefined) {
    conditions.push(lte(mqAddressRegistry.confidenceScore, filters.maxConfidence));
  }

  if (filters.qualityTier !== undefined) {
    conditions.push(eq(mqAddressRegistry.qualityTier, filters.qualityTier));
  }

  if (filters.sourceBatch !== undefined) {
    conditions.push(eq(mqAddressRegistry.approvedBatchId, filters.sourceBatch));
  }

  if (filters.conflicts === "true") {
    conditions.push(flagCondition(FLAG_BITS.conflict, true));
  }

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqAddressRegistry)
    .leftJoin(mqEntities, eq(mqAddressRegistry.entityId, mqEntities.id))
    .leftJoin(mqProtocols, eq(mqAddressRegistry.protocolId, mqProtocols.id))
    .leftJoin(mqKvRoleDict, eq(mqAddressRegistry.roleId, mqKvRoleDict.roleId))
    .leftJoin(mqCategoryDict, eq(mqKvRoleDict.categoryId, mqCategoryDict.categoryId))
    .where(where);

  const rows = await db
    .select({
      registry: mqAddressRegistry,
      entityName: mqEntities.entityName,
      entityCode: mqEntities.entityCode,
      protocolName: mqProtocols.protocolName,
      roleCode: mqKvRoleDict.roleCode,
      categoryCode: mqCategoryDict.categoryCode,
    })
    .from(mqAddressRegistry)
    .leftJoin(mqEntities, eq(mqAddressRegistry.entityId, mqEntities.id))
    .leftJoin(mqProtocols, eq(mqAddressRegistry.protocolId, mqProtocols.id))
    .leftJoin(mqKvRoleDict, eq(mqAddressRegistry.roleId, mqKvRoleDict.roleId))
    .leftJoin(mqCategoryDict, eq(mqKvRoleDict.categoryId, mqCategoryDict.categoryId))
    .where(where)
    .orderBy(registryOrderBy(filters.sort), asc(mqAddressRegistry.id))
    .limit(filters.pageSize)
    .offset(offset);

  return {
    rows,
    filters,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}

export async function getRegistryDetail(id: number) {
  const db = getDb();
  const [registryDetail] = await db
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
    .where(eq(mqAddressRegistry.id, id))
    .limit(1);

  if (!registryDetail) {
    return null;
  }

  const registry = registryDetail.registry;
  const discoveryConditions: SQL[] = [eq(mqDiscoveryJobs.seedAddress, registry.normalizedAddress)];
  if (registry.rawAddress && registry.rawAddress !== registry.normalizedAddress) {
    discoveryConditions.push(eq(mqDiscoveryJobs.seedAddress, registry.rawAddress));
  }
  if (registry.entityId) {
    discoveryConditions.push(eq(mqDiscoveryJobs.entityId, registry.entityId));
  }
  if (registry.protocolId) {
    discoveryConditions.push(eq(mqDiscoveryJobs.protocolId, registry.protocolId));
  }
  const primaryCandidateId = extractRegistryCandidateId(registry.metadata);

  const [
    evidence,
    sourceBatch,
    primarySourceJob,
    primaryCandidate,
    approvalEvents,
    relatedCandidates,
    relatedDiscoveryJobs,
    relatedRegistryRows,
    metricGroups,
    metricGroupRules,
  ] = await Promise.all([
    db.select().from(mqAddressEvidence).where(eq(mqAddressEvidence.registryId, id)).orderBy(desc(mqAddressEvidence.createdAt)),
    registry.approvedBatchId
      ? db.select().from(mqLabelBatches).where(eq(mqLabelBatches.id, registry.approvedBatchId)).limit(1)
      : Promise.resolve([]),
    registry.primarySourceJobId
      ? db.select().from(mqSourceJobs).where(eq(mqSourceJobs.id, registry.primarySourceJobId)).limit(1)
      : Promise.resolve([]),
    primaryCandidateId
      ? db.select().from(mqAddressCandidates).where(eq(mqAddressCandidates.id, primaryCandidateId)).limit(1)
      : Promise.resolve([]),
    db
      .select()
      .from(mqApprovalEvents)
      .where(
        registry.approvedBatchId
          ? or(eq(mqApprovalEvents.registryId, id), eq(mqApprovalEvents.batchId, registry.approvedBatchId))
          : eq(mqApprovalEvents.registryId, id),
      )
      .orderBy(desc(mqApprovalEvents.createdAt))
      .limit(50),
    db
      .select()
      .from(mqAddressCandidates)
      .where(and(eq(mqAddressCandidates.normalizedAddress, registry.normalizedAddress), eq(mqAddressCandidates.chainCode, registry.chainCode)))
      .orderBy(desc(mqAddressCandidates.createdAt))
      .limit(20),
    db
      .select()
      .from(mqDiscoveryJobs)
      .where(and(eq(mqDiscoveryJobs.chainCode, registry.chainCode), or(...discoveryConditions)!))
      .orderBy(desc(mqDiscoveryJobs.createdAt))
      .limit(20),
    db
      .select({
        registry: mqAddressRegistry,
        entityName: mqEntities.entityName,
        protocolName: mqProtocols.protocolName,
        roleCode: mqKvRoleDict.roleCode,
      })
      .from(mqAddressRegistry)
      .leftJoin(mqEntities, eq(mqAddressRegistry.entityId, mqEntities.id))
      .leftJoin(mqProtocols, eq(mqAddressRegistry.protocolId, mqProtocols.id))
      .leftJoin(mqKvRoleDict, eq(mqAddressRegistry.roleId, mqKvRoleDict.roleId))
      .where(
        and(
          eq(mqAddressRegistry.chainCode, registry.chainCode),
          eq(mqAddressRegistry.normalizedAddress, registry.normalizedAddress),
          ne(mqAddressRegistry.id, registry.id),
        ),
      )
      .orderBy(desc(mqAddressRegistry.isActive), desc(mqAddressRegistry.createdAt))
      .limit(20),
    db.select().from(mqMetricGroups).where(eq(mqMetricGroups.isActive, true)).orderBy(desc(mqMetricGroups.createdAt)),
    db.select().from(mqMetricGroupRules),
  ]);
  const provenanceCandidate = primaryCandidate[0] ?? null;
  const sourceDocumentId = provenanceCandidate?.sourceDocumentId ?? sourceBatch[0]?.sourceDocumentId ?? null;
  const [primarySourceDocument] = sourceDocumentId
    ? await db.select().from(mqSourceDocuments).where(eq(mqSourceDocuments.id, sourceDocumentId)).limit(1)
    : [];

  const metricGroupMatches = matchingMetricGroupsForRow(
    {
      chainCode: registry.chainCode,
      roleCode: registryDetail.role?.roleCode,
      categoryCode: registryDetail.category?.categoryCode,
      entityCode: registryDetail.entity?.entityCode,
      confidenceScore: registry.confidenceScore,
      flags: registry.flags,
    },
    metricGroups.map((group) => ({
      id: group.id,
      metricGroupCode: group.metricGroupCode,
      metricGroupName: group.metricGroupName,
      chainCode: group.chainCode,
      minConfidence: group.minConfidence,
      requireMetricEligible: group.requireMetricEligible,
      rules: metricGroupRules
        .filter((rule) => rule.metricGroupId === group.id)
        .map((rule) => rule.ruleJson as MetricGroupRule),
    })),
  );

  return {
    ...registryDetail,
    evidence,
    sourceBatch: sourceBatch[0] ?? null,
    primarySourceJob: primarySourceJob[0] ?? null,
    primarySourceDocument: primarySourceDocument ?? null,
    provenanceCandidate,
    provenanceCandidateId: primaryCandidateId,
    approvalEvents,
    relatedCandidates,
    relatedDiscoveryJobs,
    relatedRegistryRows,
    metricGroupMatches,
    secondaryRoles: parseSecondaryRoles(registry.metadata),
    resolverPreview: {
      chainCode: registry.chainCode,
      normalizedAddress: registry.normalizedAddress,
      prefixCode: registry.prefixCode,
      payloadHex: registry.payloadHex,
      activeLabel: registry.isActive,
      validFromBlock: registry.validFromBlock,
      validToBlock: registry.validToBlock,
    },
  };
}

export async function updateRegistryLabel(input: unknown) {
  const actor = await assertPermission("registry:edit");
  const parsed = registryEditSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(mqAddressRegistry).where(eq(mqAddressRegistry.id, parsed.registryId)).limit(1);

    if (!before) {
      throw new Error("Registry row not found.");
    }

    const [updated] = await tx
      .update(mqAddressRegistry)
      .set({
        entityId: parsed.entityId,
        protocolId: optionalNumber(parsed.protocolId),
        roleId: parsed.roleId,
        confidenceScore: parsed.confidenceScore,
        qualityTier: parsed.qualityTier,
        labelStatus: parsed.labelStatus,
        flags: parsed.flags,
        metricUsage: parsed.metricUsage || null,
        validFromBlock: optionalNumber(parsed.validFromBlock),
        validToBlock: optionalNumber(parsed.validToBlock),
        firstSeenBlock: optionalNumber(parsed.firstSeenBlock),
        lastSeenBlock: optionalNumber(parsed.lastSeenBlock),
        notes: parsed.notes || null,
        metadata: {
          ...(before.metadata ?? {}),
          lastEditedBy: actor.email,
          lastEditedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(mqAddressRegistry.id, parsed.registryId))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      registryId: parsed.registryId,
      action: "registry_label_updated",
      actorId: actor.id,
      reason: parsed.notes || "Registry label edited.",
      beforeJson: before,
      afterJson: updated,
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "registry_label_updated",
      targetTable: "mq_address_registry",
      targetId: String(parsed.registryId),
      payload: { before, after: updated },
    });

    return updated;
  });
}

export async function addRegistrySecondaryRole(input: unknown) {
  const actor = await assertPermission("registry:edit");
  const parsed = addRegistrySecondaryRoleSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(mqAddressRegistry).where(eq(mqAddressRegistry.id, parsed.registryId)).limit(1);

    if (!before) {
      throw new Error("Registry row not found.");
    }

    if (before.roleId === parsed.roleId) {
      throw new Error("Primary role is already assigned to this registry label.");
    }

    const [role] = await tx.select().from(mqKvRoleDict).where(eq(mqKvRoleDict.roleId, parsed.roleId)).limit(1);
    if (!role) {
      throw new Error("Secondary role not found.");
    }

    const metadata = addSecondaryRoleToMetadata(before.metadata, {
      roleId: role.roleId,
      roleCode: role.roleCode,
      roleName: role.roleName,
      categoryId: role.categoryId,
      reason: parsed.reason,
      addedBy: actor.email,
    });

    const [updated] = await tx
      .update(mqAddressRegistry)
      .set({
        flags: setFlag(before.flags, FLAG_BITS.hasSecondaryRoles),
        metadata: {
          ...metadata,
          lastSecondaryRoleAddedBy: actor.email,
          lastSecondaryRoleAddedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(mqAddressRegistry.id, parsed.registryId))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      registryId: parsed.registryId,
      action: "registry_secondary_role_added",
      actorId: actor.id,
      reason: parsed.reason || `Secondary role ${role.roleCode} added.`,
      beforeJson: before,
      afterJson: updated,
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "registry_secondary_role_added",
      targetTable: "mq_address_registry",
      targetId: String(parsed.registryId),
      payload: { before, after: updated, secondaryRole: { roleId: role.roleId, roleCode: role.roleCode }, reason: parsed.reason },
    });

    return updated;
  });
}

export async function supersedeRegistryLabel(input: unknown) {
  const actor = await assertPermission("registry:edit");
  const parsed = registrySupersedeSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [[before], [replacement]] = await Promise.all([
      tx.select().from(mqAddressRegistry).where(eq(mqAddressRegistry.id, parsed.registryId)).limit(1),
      tx.select().from(mqAddressRegistry).where(eq(mqAddressRegistry.id, parsed.replacementRegistryId)).limit(1),
    ]);

    if (!before) {
      throw new Error("Registry row not found.");
    }

    if (!replacement) {
      throw new Error("Replacement registry row not found.");
    }

    if (before.id === replacement.id) {
      throw new Error("A registry row cannot supersede itself.");
    }

    if (before.chainCode !== replacement.chainCode || before.normalizedAddress !== replacement.normalizedAddress) {
      throw new Error("Registry supersede requires the same chain and normalized address.");
    }

    if (!replacement.isActive) {
      throw new Error("Replacement registry row must be active.");
    }

    const nowIso = new Date().toISOString();
    const validToBlock = inferSupersededValidToBlock(before, replacement, optionalNumber(parsed.validToBlock));
    const [updated] = await tx
      .update(mqAddressRegistry)
      .set({
        isActive: false,
        flags: markHistoricalOnlyFlags(before.flags),
        validToBlock,
        metadata: buildSupersededRegistryMetadata(before.metadata, {
          replacementRegistryId: replacement.id,
          actorEmail: actor.email ?? String(actor.id),
          nowIso,
          reason: parsed.reason,
        }),
        updatedAt: new Date(),
      })
      .where(eq(mqAddressRegistry.id, before.id))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      registryId: before.id,
      action: "registry_label_superseded",
      actorId: actor.id,
      reason: parsed.reason || `Registry label superseded by row ${replacement.id}.`,
      beforeJson: before,
      afterJson: updated,
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "registry_label_superseded",
      targetTable: "mq_address_registry",
      targetId: String(before.id),
      payload: { before, after: updated, replacementRegistryId: replacement.id, reason: parsed.reason },
    });

    return updated;
  });
}

export async function deactivateRegistryLabel(input: unknown) {
  const actor = await assertPermission("registry:edit");
  const parsed = registryIdSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(mqAddressRegistry).where(eq(mqAddressRegistry.id, parsed.registryId)).limit(1);

    if (!before) {
      throw new Error("Registry row not found.");
    }

    const [updated] = await tx
      .update(mqAddressRegistry)
      .set({
        isActive: false,
        metadata: {
          ...(before.metadata ?? {}),
          deactivatedBy: actor.email,
          deactivatedAt: new Date().toISOString(),
          deactivationReason: parsed.reason,
        },
        updatedAt: new Date(),
      })
      .where(eq(mqAddressRegistry.id, parsed.registryId))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      registryId: parsed.registryId,
      action: "registry_label_deactivated",
      actorId: actor.id,
      reason: parsed.reason || "Registry label deactivated.",
      beforeJson: before,
      afterJson: updated,
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "registry_label_deactivated",
      targetTable: "mq_address_registry",
      targetId: String(parsed.registryId),
      payload: { before, after: updated, reason: parsed.reason },
    });

    return updated;
  });
}

export async function markRegistryHistorical(input: unknown) {
  const actor = await assertPermission("registry:edit");
  const parsed = registryIdSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(mqAddressRegistry).where(eq(mqAddressRegistry.id, parsed.registryId)).limit(1);

    if (!before) {
      throw new Error("Registry row not found.");
    }

    const [updated] = await tx
      .update(mqAddressRegistry)
      .set({
        isActive: false,
        labelStatus: LABEL_STATUS.inactiveHistorical,
        flags: markHistoricalOnlyFlags(before.flags),
        validToBlock: before.validToBlock ?? before.lastSeenBlock,
        metadata: {
          ...(before.metadata ?? {}),
          markedHistoricalBy: actor.email,
          markedHistoricalAt: new Date().toISOString(),
          historicalReason: parsed.reason,
        },
        updatedAt: new Date(),
      })
      .where(eq(mqAddressRegistry.id, parsed.registryId))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      registryId: parsed.registryId,
      action: "registry_label_marked_historical",
      actorId: actor.id,
      reason: parsed.reason || "Registry label marked historical.",
      beforeJson: before,
      afterJson: updated,
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "registry_label_marked_historical",
      targetTable: "mq_address_registry",
      targetId: String(parsed.registryId),
      payload: { before, after: updated, reason: parsed.reason },
    });

    return updated;
  });
}
