import { asc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mqRegistryAddressLabels, mqDictRoles } from "@/db/schema";

import { compileU1RecordStream } from "../kv/compiled-records";
import { resolveCurrentRecordBatch, resolveMetricRecordBatch, resolveTimelineRecordBatch, type TimelineLookup } from "../kv/decoded-record";
import type { U1AddressKey, U1MetricGroupKey } from "../kv/u1";
import { loadFullKvCompilationSnapshot } from "./full-kv-build-service";

export class CanonicalPostgresResolver {
  constructor(private readonly db = getDb()) {}

  private async records() {
    return this.db.transaction(async tx => {
      const snapshot = await loadFullKvCompilationSnapshot(tx);
      const rows = snapshot.registryIds.length ? await tx
        .select({ registry: mqRegistryAddressLabels, resolvedCategoryId: mqDictRoles.categoryId })
        .from(mqRegistryAddressLabels)
        .leftJoin(mqDictRoles, eq(mqRegistryAddressLabels.roleId, mqDictRoles.roleId))
        .where(inArray(mqRegistryAddressLabels.id, [...snapshot.registryIds]))
        .orderBy(asc(mqRegistryAddressLabels.id)) : [];
      return compileU1RecordStream({ rows: rows.map(row => ({ ...row.registry, resolvedCategoryId: row.resolvedCategoryId })), currentRegistryIds: snapshot.currentRegistryIds, timelineRegistryIds: snapshot.timelineRegistryIds, metricMemberships: snapshot.metricMemberships });
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }

  async resolveCurrent(keys: readonly U1AddressKey[]) {
    if (!keys.length) return [];
    const records = (await this.records()).filter(record => record.indexName === "address_label_current");
    return resolveCurrentRecordBatch(records, keys);
  }

  async resolveTimeline(lookups: readonly TimelineLookup[]) {
    if (!lookups.length) return [];
    const records = (await this.records()).filter(record => record.indexName === "address_label_timeline");
    return resolveTimelineRecordBatch(records, lookups);
  }

  async resolveMetricGroup(keys: readonly U1MetricGroupKey[]) {
    if (!keys.length) return [];
    const records = (await this.records()).filter(record => record.indexName === "metric_group_membership");
    return resolveMetricRecordBatch(records, keys);
  }
}
