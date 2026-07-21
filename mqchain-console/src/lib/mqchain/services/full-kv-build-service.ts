import { asc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressRegistry,
  mqAddressCodecs,
  mqAddressNamespaces,
  mqCategoryDict,
  mqEntities,
  mqKvRoleDict,
  mqMetricGroupRules,
  mqMetricGroups,
  mqProtocols,
} from "@/db/schema";

import { LABEL_STATUS } from "../constants";
import { computeRegistrySnapshotHash, validateU1AddressKey } from "../kv/contract";
import { buildPendingFullKvManifest, computeFullKvBuildRequestHash } from "../kv-manifest";
import { evaluateMetricGroupPreviewMembers, type MetricGroupPreviewRow } from "../metric-group-preview";
import type { MetricGroupRule } from "../types";
import { getCanonicalDictionarySnapshot } from "./dictionary-service";

type FullKvSnapshotSource = Pick<ReturnType<typeof getDb>, "select">;

export type FullKvMetricMembership = Readonly<{
  metricGroupId: number;
  registryId: number;
}>;

export type FullKvCompilationSnapshot = Readonly<{
  dictionaryVersion: string;
  registrySnapshotHash: string;
  registryIds: readonly number[];
  currentRegistryIds: readonly number[];
  timelineRegistryIds: readonly number[];
  metricMemberships: readonly FullKvMetricMembership[];
  expectedCounts: Readonly<{
    addressLabelCurrent: number;
    addressLabelTimeline: number;
    metricGroupMembership: number;
  }>;
}>;

type FullKvJoinedRow = {
  registry: typeof mqAddressRegistry.$inferSelect;
  entity: typeof mqEntities.$inferSelect | null;
  protocol: typeof mqProtocols.$inferSelect | null;
  role: typeof mqKvRoleDict.$inferSelect | null;
  category: typeof mqCategoryDict.$inferSelect | null;
  namespace: typeof mqAddressNamespaces.$inferSelect | null;
  codec: typeof mqAddressCodecs.$inferSelect | null;
};

function hasCompilableU1Identity(row: FullKvJoinedRow) {
  return validateU1AddressKey(row.registry, { namespace: row.namespace, codec: row.codec }).length === 0 && row.registry.entityId !== null && row.registry.roleId !== null;
}

function isCurrentServingRow(row: typeof mqAddressRegistry.$inferSelect) {
  return row.isActive && (row.labelStatus === LABEL_STATUS.activeCurrent || row.labelStatus === LABEL_STATUS.sanctionedCurrent);
}

function isTimelineServingRow(row: typeof mqAddressRegistry.$inferSelect) {
  // Frozen U1 policy: timeline records exist only for explicit validity bounds.
  return row.validFromBlock !== null || row.validToBlock !== null;
}

export function assembleFullKvCompilationSnapshot(input: {
  dictionaryVersion: string;
  joinedRows: FullKvJoinedRow[];
  activeGroups: Array<typeof mqMetricGroups.$inferSelect>;
  activeRules: Array<typeof mqMetricGroupRules.$inferSelect>;
}): FullKvCompilationSnapshot {
  const compilableRows = input.joinedRows.filter(hasCompilableU1Identity);
  const currentRows = compilableRows.filter(row => isCurrentServingRow(row.registry));
  const timelineRows = compilableRows.filter(row => isTimelineServingRow(row.registry));
  const rulesByGroup = new Map<number, MetricGroupRule[]>();
  for (const rule of input.activeRules) {
    if (rule.status !== "active") continue;
    rulesByGroup.set(rule.metricGroupId, [
      ...(rulesByGroup.get(rule.metricGroupId) ?? []),
      rule.ruleJson as MetricGroupRule,
    ]);
  }

  const previewRows: MetricGroupPreviewRow[] = currentRows.map(row => ({
    registry: row.registry,
    entity: row.entity ? { entityCode: row.entity.entityCode, entityName: row.entity.entityName } : null,
    protocol: row.protocol ? { protocolCode: row.protocol.protocolCode, protocolName: row.protocol.protocolName } : null,
    role: row.role ? { roleCode: row.role.roleCode } : null,
    category: row.category ? { categoryCode: row.category.categoryCode } : null,
  }));
  const metricMemberships = input.activeGroups.flatMap(group =>
    evaluateMetricGroupPreviewMembers(group, rulesByGroup.get(group.id) ?? [], previewRows).members.map(row => ({
      metricGroupId: group.id,
      registryId: row.registry.id,
    })),
  ).sort((left, right) => left.metricGroupId - right.metricGroupId || left.registryId - right.registryId);

  const participatingIds = new Set<number>([
    ...currentRows.map(row => row.registry.id),
    ...timelineRows.map(row => row.registry.id),
    ...metricMemberships.map(row => row.registryId),
  ]);
  const registryRows = compilableRows
    .map(row => row.registry)
    .filter(row => participatingIds.has(row.id));
  const registryIds = registryRows.map(row => row.id).sort((left, right) => left - right);
  const currentRegistryIds = currentRows.map(row => row.registry.id).sort((left, right) => left - right);
  const timelineRegistryIds = timelineRows.map(row => row.registry.id).sort((left, right) => left - right);

  return Object.freeze({
    dictionaryVersion: input.dictionaryVersion,
    registrySnapshotHash: computeRegistrySnapshotHash(registryRows),
    registryIds: Object.freeze(registryIds),
    currentRegistryIds: Object.freeze(currentRegistryIds),
    timelineRegistryIds: Object.freeze(timelineRegistryIds),
    metricMemberships: Object.freeze(metricMemberships),
    expectedCounts: Object.freeze({
      addressLabelCurrent: currentRegistryIds.length,
      addressLabelTimeline: timelineRegistryIds.length,
      metricGroupMembership: metricMemberships.length,
    }),
  });
}

export async function loadFullKvCompilationSnapshot(source: FullKvSnapshotSource): Promise<FullKvCompilationSnapshot> {
  const [dictionary, joinedRows, activeGroups] = await Promise.all([
    getCanonicalDictionarySnapshot(source),
    source
      .select({
        registry: mqAddressRegistry,
        entity: mqEntities,
        protocol: mqProtocols,
        role: mqKvRoleDict,
        category: mqCategoryDict,
        namespace: mqAddressNamespaces,
        codec: mqAddressCodecs,
      })
      .from(mqAddressRegistry)
      .leftJoin(mqEntities, eq(mqAddressRegistry.entityId, mqEntities.id))
      .leftJoin(mqProtocols, eq(mqAddressRegistry.protocolId, mqProtocols.id))
      .leftJoin(mqKvRoleDict, eq(mqAddressRegistry.roleId, mqKvRoleDict.roleId))
      .leftJoin(mqCategoryDict, eq(mqKvRoleDict.categoryId, mqCategoryDict.categoryId))
      .leftJoin(mqAddressNamespaces, eq(mqAddressRegistry.namespaceId, mqAddressNamespaces.id))
      .leftJoin(mqAddressCodecs, eq(mqAddressRegistry.addressCodecId, mqAddressCodecs.id))
      .orderBy(asc(mqAddressRegistry.id)),
    source.select().from(mqMetricGroups).where(eq(mqMetricGroups.isActive, true)).orderBy(asc(mqMetricGroups.id)),
  ]);

  const groupIds = activeGroups.map(group => group.id);
  const activeRules = groupIds.length
    ? await source
        .select()
        .from(mqMetricGroupRules)
        .where(inArray(mqMetricGroupRules.metricGroupId, groupIds))
        .orderBy(asc(mqMetricGroupRules.metricGroupId), asc(mqMetricGroupRules.id))
    : [];
  return assembleFullKvCompilationSnapshot({
    dictionaryVersion: dictionary.versionHash,
    joinedRows,
    activeGroups,
    activeRules,
  });
}

export async function createFullKvBuildRequest(
  source: FullKvSnapshotSource,
  input: { triggeringBatchId: number; lastCommittedBatchId: number },
) {
  const snapshot = await loadFullKvCompilationSnapshot(source);
  const manifest = buildPendingFullKvManifest({
    ...input,
    registryIds: snapshot.registryIds,
    registrySnapshotHash: snapshot.registrySnapshotHash,
    dictionaryVersion: snapshot.dictionaryVersion,
    expectedCounts: snapshot.expectedCounts,
  });
  return Object.freeze({ snapshot, manifest, buildHash: computeFullKvBuildRequestHash(manifest) });
}
