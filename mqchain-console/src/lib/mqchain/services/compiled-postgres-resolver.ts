import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";

import type { CompiledIndexName } from "../kv/compiled-records";
import { resolveCurrentRecordBatch, resolveMetricRecordBatch, resolveTimelineRecordBatch, type TimelineLookup } from "../kv/decoded-record";
import { encodeU1CurrentKey, encodeU1MetricGroupKey, type U1AddressKey, type U1MetricGroupKey } from "../kv/u1";

export async function lookupCompiledPostgresValues(input: {
  buildId: number;
  indexName: CompiledIndexName;
  keyBytes: readonly Buffer[];
}) {
  if (!input.keyBytes.length) return new Map<string, Buffer>();
  const keyHexes = input.keyBytes.map((key) => key.toString("hex"));
  const rows = await getDb().execute(sql`
    with input as (
      select decode(value #>> '{}', 'hex') as key_bytes
      from jsonb_array_elements(${JSON.stringify(keyHexes)}::jsonb)
    )
    select entry.key_bytes as "keyBytes", entry.value_bytes as "valueBytes"
    from mq_build_compiled_entries entry
    join input using (key_bytes)
    where entry.build_id = ${input.buildId} and entry.index_name = ${input.indexName}
  `);
  return new Map(binaryRows(rows).map(row => [row.keyBytes.toString("hex"), row.valueBytes]));
}

function binaryRows(rows: Iterable<Record<string, unknown>>) {
  return Array.from(rows, (row) => {
    if (!Buffer.isBuffer(row.keyBytes) || !Buffer.isBuffer(row.valueBytes)) {
      throw new Error("compiled_postgres_binary_row_invalid");
    }
    return { keyBytes: row.keyBytes, valueBytes: row.valueBytes };
  });
}

export class CompiledPostgresResolver {
  constructor(readonly buildId: number, private readonly db = getDb()) {}

  private async timelineRows(keys: readonly U1AddressKey[]) {
    const prefixes = keys.map((key) => Buffer.from(encodeU1CurrentKey(key)).toString("hex"));
    const rows = await this.db.execute(sql`
      with input as (
        select decode(value #>> '{}', 'hex') as key_prefix
        from jsonb_array_elements(${JSON.stringify(prefixes)}::jsonb)
      )
      select distinct entry.key_bytes as "keyBytes", entry.value_bytes as "valueBytes"
      from mq_build_compiled_entries entry
      join input on substring(entry.key_bytes from 1 for octet_length(input.key_prefix)) = input.key_prefix
      where entry.build_id = ${this.buildId} and entry.index_name = 'address_label_timeline'
      order by entry.key_bytes
    `);
    return binaryRows(rows);
  }

  async resolveCurrent(keys: readonly U1AddressKey[]) {
    if (!keys.length) return [];
    const encoded = keys.map((key) => Buffer.from(encodeU1CurrentKey(key)));
    const values = await lookupCompiledPostgresValues({ buildId: this.buildId, indexName: "address_label_current", keyBytes: encoded });
    return resolveCurrentRecordBatch(encoded.flatMap((key) => {
      const valueBytes = values.get(key.toString("hex"));
      return valueBytes ? [{ keyBytes: key, valueBytes }] : [];
    }), keys);
  }

  async resolveTimeline(lookups: readonly TimelineLookup[]) {
    if (!lookups.length) return [];
    return resolveTimelineRecordBatch(await this.timelineRows(lookups), lookups);
  }

  async resolveMetricGroup(keys: readonly U1MetricGroupKey[]) {
    if (!keys.length) return [];
    const encoded = keys.map((key) => Buffer.from(encodeU1MetricGroupKey(key)));
    const values = await lookupCompiledPostgresValues({ buildId: this.buildId, indexName: "metric_group_membership", keyBytes: encoded });
    return resolveMetricRecordBatch(encoded.flatMap((key) => {
      const valueBytes = values.get(key.toString("hex"));
      return valueBytes ? [{ keyBytes: key, valueBytes }] : [];
    }), keys);
  }
}
