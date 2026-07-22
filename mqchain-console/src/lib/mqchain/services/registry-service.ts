import { and, asc, desc, eq, gte, ilike, lte, ne, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqWorkflowAddressCandidates,
  mqWorkflowAddressEvidence,
  mqRegistryAddressLabels,
  mqWorkflowApprovalEvents,
  mqAuditEvents,
  mqDictCategories,
  mqWorkflowDiscoveryJobs,
  mqDictEntities,
  mqDictRoles,
  mqWorkflowLabelBatches,
  mqPolicyMetricGroupRules,
  mqDictMetricGroups,
  mqDictProtocols,
  mqWorkflowSourceDocuments,
  mqWorkflowSourceJobs,
} from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";
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
  if (sort === "confidence") return desc(mqRegistryAddressLabels.confidenceScore);
  if (sort === "quality") return desc(mqRegistryAddressLabels.qualityTier);
  if (sort === "address") return asc(mqRegistryAddressLabels.normalizedAddress);
  return desc(mqRegistryAddressLabels.createdAt);
}

function flagCondition(bit: number, expected = true) {
  const mask = 1 << bit;
  return expected ? sql`(${mqRegistryAddressLabels.flags} & ${mask}) <> 0` : sql`(${mqRegistryAddressLabels.flags} & ${mask}) = 0`;
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
        ilike(mqRegistryAddressLabels.normalizedAddress, `%${filters.q}%`),
        ilike(mqRegistryAddressLabels.rawAddress, `%${filters.q}%`),
        ilike(mqRegistryAddressLabels.notes, `%${filters.q}%`),
      ),
    );
  }

  if (filters.chain) {
    conditions.push(eq(mqRegistryAddressLabels.chainCode, filters.chain));
  }

  if (filters.entity) {
    addCondition(conditions, or(ilike(mqDictEntities.entityCode, `%${filters.entity}%`), ilike(mqDictEntities.entityName, `%${filters.entity}%`)));
  }

  if (filters.protocol) {
    addCondition(
      conditions,
      or(ilike(mqDictProtocols.protocolCode, `%${filters.protocol}%`), ilike(mqDictProtocols.protocolName, `%${filters.protocol}%`)),
    );
  }

  if (filters.role) {
    addCondition(conditions, or(ilike(mqDictRoles.roleCode, `%${filters.role}%`), ilike(mqDictRoles.roleName, `%${filters.role}%`)));
  }

  if (filters.category) {
    addCondition(
      conditions,
      or(ilike(mqDictCategories.categoryCode, `%${filters.category}%`), ilike(mqDictCategories.categoryName, `%${filters.category}%`)),
    );
  }

  if (filters.metricEligible === "true") {
    conditions.push(flagCondition(FLAG_BITS.metricEligible, true));
  } else if (filters.metricEligible === "false") {
    conditions.push(flagCondition(FLAG_BITS.metricEligible, false));
  }

  if (filters.active === "active") {
    conditions.push(eq(mqRegistryAddressLabels.isActive, true));
  } else if (filters.active === "inactive") {
    conditions.push(eq(mqRegistryAddressLabels.isActive, false));
  } else if (filters.active === "historical") {
    addCondition(conditions, or(eq(mqRegistryAddressLabels.labelStatus, LABEL_STATUS.inactiveHistorical), flagCondition(FLAG_BITS.historicalOnly, true)));
  }

  if (filters.minConfidence !== undefined) {
    conditions.push(gte(mqRegistryAddressLabels.confidenceScore, filters.minConfidence));
  }

  if (filters.maxConfidence !== undefined) {
    conditions.push(lte(mqRegistryAddressLabels.confidenceScore, filters.maxConfidence));
  }

  if (filters.qualityTier !== undefined) {
    conditions.push(eq(mqRegistryAddressLabels.qualityTier, filters.qualityTier));
  }

  if (filters.sourceBatch !== undefined) {
    conditions.push(eq(mqRegistryAddressLabels.approvedBatchId, filters.sourceBatch));
  }

  if (filters.conflicts === "true") {
    conditions.push(flagCondition(FLAG_BITS.conflict, true));
  }

  const db = getDb();
  const where = conditions.length ? and(...conditions) : sql`true`;
  const offset = (filters.page - 1) * filters.pageSize;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mqRegistryAddressLabels)
    .leftJoin(mqDictEntities, eq(mqRegistryAddressLabels.entityId, mqDictEntities.id))
    .leftJoin(mqDictProtocols, eq(mqRegistryAddressLabels.protocolId, mqDictProtocols.id))
    .leftJoin(mqDictRoles, eq(mqRegistryAddressLabels.roleId, mqDictRoles.roleId))
        .leftJoin(mqDictCategories, eq(mqDictCategories.categoryId, sql<number>`coalesce(${mqRegistryAddressLabels.categoryId}, ${mqDictRoles.categoryId})`))
    .where(where);

  const rows = await db
    .select({
      registry: mqRegistryAddressLabels,
      entityName: mqDictEntities.entityName,
      entityCode: mqDictEntities.entityCode,
      protocolCode: mqDictProtocols.protocolCode,
      protocolName: mqDictProtocols.protocolName,
      roleCode: mqDictRoles.roleCode,
      categoryCode: mqDictCategories.categoryCode,
    })
    .from(mqRegistryAddressLabels)
    .leftJoin(mqDictEntities, eq(mqRegistryAddressLabels.entityId, mqDictEntities.id))
    .leftJoin(mqDictProtocols, eq(mqRegistryAddressLabels.protocolId, mqDictProtocols.id))
    .leftJoin(mqDictRoles, eq(mqRegistryAddressLabels.roleId, mqDictRoles.roleId))
    .leftJoin(mqDictCategories, eq(mqDictCategories.categoryId, sql<number>`coalesce(${mqRegistryAddressLabels.categoryId}, ${mqDictRoles.categoryId})`))
    .where(where)
    .orderBy(registryOrderBy(filters.sort), asc(mqRegistryAddressLabels.id))
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
      registry: mqRegistryAddressLabels,
      entity: mqDictEntities,
      protocol: mqDictProtocols,
      role: mqDictRoles,
      category: mqDictCategories,
    })
    .from(mqRegistryAddressLabels)
    .leftJoin(mqDictEntities, eq(mqRegistryAddressLabels.entityId, mqDictEntities.id))
    .leftJoin(mqDictProtocols, eq(mqRegistryAddressLabels.protocolId, mqDictProtocols.id))
    .leftJoin(mqDictRoles, eq(mqRegistryAddressLabels.roleId, mqDictRoles.roleId))
    .leftJoin(mqDictCategories, eq(mqDictCategories.categoryId, sql<number>`coalesce(${mqRegistryAddressLabels.categoryId}, ${mqDictRoles.categoryId})`))
    .where(eq(mqRegistryAddressLabels.id, id))
    .limit(1);

  if (!registryDetail) {
    return null;
  }

  const registry = registryDetail.registry;
  const discoveryConditions: SQL[] = [eq(mqWorkflowDiscoveryJobs.seedAddress, registry.normalizedAddress)];
  if (registry.rawAddress && registry.rawAddress !== registry.normalizedAddress) {
    discoveryConditions.push(eq(mqWorkflowDiscoveryJobs.seedAddress, registry.rawAddress));
  }
  if (registry.entityId) {
    discoveryConditions.push(eq(mqWorkflowDiscoveryJobs.entityId, registry.entityId));
  }
  if (registry.protocolId) {
    discoveryConditions.push(eq(mqWorkflowDiscoveryJobs.protocolId, registry.protocolId));
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
    db.select().from(mqWorkflowAddressEvidence).where(eq(mqWorkflowAddressEvidence.registryId, id)).orderBy(desc(mqWorkflowAddressEvidence.createdAt)),
    registry.approvedBatchId
      ? db.select().from(mqWorkflowLabelBatches).where(eq(mqWorkflowLabelBatches.id, registry.approvedBatchId)).limit(1)
      : Promise.resolve([]),
    registry.primarySourceJobId
      ? db.select().from(mqWorkflowSourceJobs).where(eq(mqWorkflowSourceJobs.id, registry.primarySourceJobId)).limit(1)
      : Promise.resolve([]),
    primaryCandidateId
      ? db.select().from(mqWorkflowAddressCandidates).where(eq(mqWorkflowAddressCandidates.id, primaryCandidateId)).limit(1)
      : Promise.resolve([]),
    db
      .select()
      .from(mqWorkflowApprovalEvents)
      .where(
        registry.approvedBatchId
          ? or(eq(mqWorkflowApprovalEvents.registryId, id), eq(mqWorkflowApprovalEvents.batchId, registry.approvedBatchId))
          : eq(mqWorkflowApprovalEvents.registryId, id),
      )
      .orderBy(desc(mqWorkflowApprovalEvents.createdAt))
      .limit(50),
    db
      .select()
      .from(mqWorkflowAddressCandidates)
      .where(and(eq(mqWorkflowAddressCandidates.normalizedAddress, registry.normalizedAddress), eq(mqWorkflowAddressCandidates.chainCode, registry.chainCode)))
      .orderBy(desc(mqWorkflowAddressCandidates.createdAt))
      .limit(20),
    db
      .select()
      .from(mqWorkflowDiscoveryJobs)
      .where(and(eq(mqWorkflowDiscoveryJobs.chainCode, registry.chainCode), or(...discoveryConditions)!))
      .orderBy(desc(mqWorkflowDiscoveryJobs.createdAt))
      .limit(20),
    db
      .select({
        registry: mqRegistryAddressLabels,
        entityName: mqDictEntities.entityName,
        protocolName: mqDictProtocols.protocolName,
        roleCode: mqDictRoles.roleCode,
      })
      .from(mqRegistryAddressLabels)
      .leftJoin(mqDictEntities, eq(mqRegistryAddressLabels.entityId, mqDictEntities.id))
      .leftJoin(mqDictProtocols, eq(mqRegistryAddressLabels.protocolId, mqDictProtocols.id))
      .leftJoin(mqDictRoles, eq(mqRegistryAddressLabels.roleId, mqDictRoles.roleId))
      .where(
        and(
          eq(mqRegistryAddressLabels.chainCode, registry.chainCode),
          eq(mqRegistryAddressLabels.normalizedAddress, registry.normalizedAddress),
          ne(mqRegistryAddressLabels.id, registry.id),
        ),
      )
      .orderBy(desc(mqRegistryAddressLabels.isActive), desc(mqRegistryAddressLabels.createdAt))
      .limit(20),
    db.select().from(mqDictMetricGroups).where(eq(mqDictMetricGroups.isActive, true)).orderBy(desc(mqDictMetricGroups.createdAt)),
    db.select().from(mqPolicyMetricGroupRules),
  ]);
  const provenanceCandidate = primaryCandidate[0] ?? null;
  const sourceDocumentId = provenanceCandidate?.sourceDocumentId ?? sourceBatch[0]?.sourceDocumentId ?? null;
  const [primarySourceDocument] = sourceDocumentId
    ? await db.select().from(mqWorkflowSourceDocuments).where(eq(mqWorkflowSourceDocuments.id, sourceDocumentId)).limit(1)
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
    const [before] = await tx.select().from(mqRegistryAddressLabels).where(eq(mqRegistryAddressLabels.id, parsed.registryId)).limit(1);

    if (!before) {
      throw new Error("Registry row not found.");
    }

    const [updated] = await tx
      .update(mqRegistryAddressLabels)
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
      .where(eq(mqRegistryAddressLabels.id, parsed.registryId))
      .returning();

    await tx.insert(mqWorkflowApprovalEvents).values({
      registryId: parsed.registryId,
      action: "registry_label_updated",
      actorId: actor.id,
      reason: parsed.notes || "Registry label edited.",
      beforeJson: before,
      afterJson: updated,
    });

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "registry_label_updated",
      targetTable: "mq_registry_address_labels",
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
    const [before] = await tx.select().from(mqRegistryAddressLabels).where(eq(mqRegistryAddressLabels.id, parsed.registryId)).limit(1);

    if (!before) {
      throw new Error("Registry row not found.");
    }

    if (before.roleId === parsed.roleId) {
      throw new Error("Primary role is already assigned to this registry label.");
    }

    const [role] = await tx.select().from(mqDictRoles).where(eq(mqDictRoles.roleId, parsed.roleId)).limit(1);
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
      .update(mqRegistryAddressLabels)
      .set({
        flags: setFlag(before.flags, FLAG_BITS.hasSecondaryRoles),
        metadata: {
          ...metadata,
          lastSecondaryRoleAddedBy: actor.email,
          lastSecondaryRoleAddedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(mqRegistryAddressLabels.id, parsed.registryId))
      .returning();

    await tx.insert(mqWorkflowApprovalEvents).values({
      registryId: parsed.registryId,
      action: "registry_secondary_role_added",
      actorId: actor.id,
      reason: parsed.reason || `Secondary role ${role.roleCode} added.`,
      beforeJson: before,
      afterJson: updated,
    });

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "registry_secondary_role_added",
      targetTable: "mq_registry_address_labels",
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
      tx.select().from(mqRegistryAddressLabels).where(eq(mqRegistryAddressLabels.id, parsed.registryId)).limit(1),
      tx.select().from(mqRegistryAddressLabels).where(eq(mqRegistryAddressLabels.id, parsed.replacementRegistryId)).limit(1),
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
      .update(mqRegistryAddressLabels)
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
      .where(eq(mqRegistryAddressLabels.id, before.id))
      .returning();

    await tx.insert(mqWorkflowApprovalEvents).values({
      registryId: before.id,
      action: "registry_label_superseded",
      actorId: actor.id,
      reason: parsed.reason || `Registry label superseded by row ${replacement.id}.`,
      beforeJson: before,
      afterJson: updated,
    });

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "registry_label_superseded",
      targetTable: "mq_registry_address_labels",
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
    const [before] = await tx.select().from(mqRegistryAddressLabels).where(eq(mqRegistryAddressLabels.id, parsed.registryId)).limit(1);

    if (!before) {
      throw new Error("Registry row not found.");
    }

    const [updated] = await tx
      .update(mqRegistryAddressLabels)
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
      .where(eq(mqRegistryAddressLabels.id, parsed.registryId))
      .returning();

    await tx.insert(mqWorkflowApprovalEvents).values({
      registryId: parsed.registryId,
      action: "registry_label_deactivated",
      actorId: actor.id,
      reason: parsed.reason || "Registry label deactivated.",
      beforeJson: before,
      afterJson: updated,
    });

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "registry_label_deactivated",
      targetTable: "mq_registry_address_labels",
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
    const [before] = await tx.select().from(mqRegistryAddressLabels).where(eq(mqRegistryAddressLabels.id, parsed.registryId)).limit(1);

    if (!before) {
      throw new Error("Registry row not found.");
    }

    const [updated] = await tx
      .update(mqRegistryAddressLabels)
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
      .where(eq(mqRegistryAddressLabels.id, parsed.registryId))
      .returning();

    await tx.insert(mqWorkflowApprovalEvents).values({
      registryId: parsed.registryId,
      action: "registry_label_marked_historical",
      actorId: actor.id,
      reason: parsed.reason || "Registry label marked historical.",
      beforeJson: before,
      afterJson: updated,
    });

    await tx.insert(mqAuditEvents).values({
      actorId: actor.id,
      action: "registry_label_marked_historical",
      targetTable: "mq_registry_address_labels",
      targetId: String(parsed.registryId),
      payload: { before, after: updated, reason: parsed.reason },
    });

    return updated;
  });
}
