import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mqKvCompiledEntries } from "@/db/schema";

import type { CompiledIndexName } from "../kv/compiled-records";
import { resolveCurrentRecordBatch, resolveMetricRecordBatch, resolveTimelineRecordBatch, type TimelineLookup } from "../kv/decoded-record";
import type { U1AddressKey, U1MetricGroupKey } from "../kv/u1";

export async function lookupCompiledPostgresValues(input: {
  buildId: number;
  indexName: CompiledIndexName;
  keyBytes: readonly Buffer[];
}) {
  if (!input.keyBytes.length) return new Map<string, Buffer>();
  const rows = await getDb().select({ keyBytes: mqKvCompiledEntries.keyBytes, valueBytes: mqKvCompiledEntries.valueBytes })
    .from(mqKvCompiledEntries)
    .where(and(
      eq(mqKvCompiledEntries.buildId, input.buildId),
      eq(mqKvCompiledEntries.indexName, input.indexName),
      inArray(mqKvCompiledEntries.keyBytes, [...input.keyBytes]),
    ));
  return new Map(rows.map(row => [row.keyBytes.toString("hex"), row.valueBytes]));
}

export class CompiledPostgresResolver {
  constructor(readonly buildId: number, private readonly db = getDb()) {}

  private async indexRows(indexName: CompiledIndexName) {
    return this.db.select({ keyBytes: mqKvCompiledEntries.keyBytes, valueBytes: mqKvCompiledEntries.valueBytes })
      .from(mqKvCompiledEntries)
      .where(and(eq(mqKvCompiledEntries.buildId, this.buildId), eq(mqKvCompiledEntries.indexName, indexName)));
  }

  async resolveCurrent(keys: readonly U1AddressKey[]) {
    if (!keys.length) return [];
    return resolveCurrentRecordBatch(await this.indexRows("address_label_current"), keys);
  }

  async resolveTimeline(lookups: readonly TimelineLookup[]) {
    if (!lookups.length) return [];
    return resolveTimelineRecordBatch(await this.indexRows("address_label_timeline"), lookups);
  }

  async resolveMetricGroup(keys: readonly U1MetricGroupKey[]) {
    if (!keys.length) return [];
    return resolveMetricRecordBatch(await this.indexRows("metric_group_membership"), keys);
  }
}
