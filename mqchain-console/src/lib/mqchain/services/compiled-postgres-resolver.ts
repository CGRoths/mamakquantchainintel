import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mqKvCompiledEntries } from "@/db/schema";

import type { CompiledIndexName } from "../kv/compiled-records";

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
