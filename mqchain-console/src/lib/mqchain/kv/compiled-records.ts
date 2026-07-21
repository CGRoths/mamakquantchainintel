import { createHash } from "node:crypto";

import type { MqAddressRegistryRow } from "@/db/schema";

import {
  encodeU1CurrentKey,
  encodeU1CurrentValue,
  encodeU1MetricGroupKey,
  encodeU1MetricGroupValue,
  encodeU1TimelineKey,
  encodeU1TimelineValue,
} from "./u1";

export const COMPILED_INDEX_NAMES = [
  "address_label_current",
  "address_label_timeline",
  "metric_group_membership",
] as const;

export type CompiledIndexName = (typeof COMPILED_INDEX_NAMES)[number];

export type CompiledU1Record = Readonly<{
  indexName: CompiledIndexName;
  ordinal: number;
  keyBytes: Buffer;
  valueBytes: Buffer;
  keyHash: string;
  recordHash: string;
  registryId: number | null;
  metricGroupId: number | null;
  namespaceId: number | null;
  addressCodecId: number | null;
}>;

export type CompilableRegistryRow = MqAddressRegistryRow & { resolvedCategoryId?: number | null };

export function frameCompiledRecord(keyBytes: Uint8Array, valueBytes: Uint8Array) {
  const frame = Buffer.allocUnsafe(8 + keyBytes.byteLength + valueBytes.byteLength);
  frame.writeUInt32BE(keyBytes.byteLength, 0);
  Buffer.from(keyBytes).copy(frame, 4);
  frame.writeUInt32BE(valueBytes.byteLength, 4 + keyBytes.byteLength);
  Buffer.from(valueBytes).copy(frame, 8 + keyBytes.byteLength);
  return frame;
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function addressValue(row: CompilableRegistryRow) {
  if (row.entityId === null || row.roleId === null) throw new Error(`registry_row_missing_label_identity:${row.id}`);
  return {
    labelStatus: row.labelStatus,
    qualityTier: row.qualityTier,
    confidenceScore: row.confidenceScore,
    entityId: row.entityId,
    protocolId: row.protocolId,
    categoryId: row.categoryId ?? row.resolvedCategoryId ?? null,
    roleId: row.roleId,
    componentId: row.componentId,
    tagsetId: row.tagsetId,
    flags: row.flags,
    batchId: row.approvedBatchId,
  };
}

function addressKey(row: CompilableRegistryRow) {
  if (row.namespaceId === null || row.addressCodecId === null || row.payloadHex === null) {
    throw new Error(`registry_row_missing_u1_key:${row.id}`);
  }
  return { namespaceId: row.namespaceId, addressCodecId: row.addressCodecId, payloadHex: row.payloadHex };
}

function finalize(indexName: CompiledIndexName, entries: Array<Omit<CompiledU1Record, "ordinal" | "keyHash" | "recordHash">>) {
  entries.sort((left, right) => Buffer.compare(left.keyBytes, right.keyBytes));
  return Object.freeze(entries.map((entry, ordinal) => {
    if (ordinal > 0 && Buffer.compare(entries[ordinal - 1].keyBytes, entry.keyBytes) === 0) {
      throw new Error(`duplicate_compiled_key:${indexName}:${entry.keyBytes.toString("hex")}`);
    }
    return Object.freeze({
      ...entry,
      ordinal,
      keyHash: sha256(entry.keyBytes),
      recordHash: sha256(frameCompiledRecord(entry.keyBytes, entry.valueBytes)),
    });
  }));
}

export function compileU1RecordStream(input: {
  rows: readonly CompilableRegistryRow[];
  currentRegistryIds: readonly number[];
  timelineRegistryIds: readonly number[];
  metricMemberships: readonly { metricGroupId: number; registryId: number }[];
}): readonly CompiledU1Record[] {
  const rowsById = new Map(input.rows.map(row => [row.id, row]));
  const requireRow = (id: number) => {
    const row = rowsById.get(id);
    if (!row) throw new Error(`compile_snapshot_registry_row_missing:${id}`);
    return row;
  };
  const current = input.currentRegistryIds.map(registryId => {
    const row = requireRow(registryId);
    return {
      indexName: "address_label_current" as const,
      keyBytes: Buffer.from(encodeU1CurrentKey(addressKey(row))),
      valueBytes: Buffer.from(encodeU1CurrentValue({ ...addressValue(row), firstSeenHeight: row.firstSeenBlock, lastSeenHeight: row.lastSeenBlock })),
      registryId, metricGroupId: null, namespaceId: row.namespaceId, addressCodecId: row.addressCodecId,
    };
  });
  const timeline = input.timelineRegistryIds.map(registryId => {
    const row = requireRow(registryId);
    return {
      indexName: "address_label_timeline" as const,
      keyBytes: Buffer.from(encodeU1TimelineKey({ ...addressKey(row), validFromHeight: row.validFromBlock })),
      valueBytes: Buffer.from(encodeU1TimelineValue({ ...addressValue(row), validToHeight: row.validToBlock, firstSeenHeight: row.firstSeenBlock, lastSeenHeight: row.lastSeenBlock })),
      registryId, metricGroupId: null, namespaceId: row.namespaceId, addressCodecId: row.addressCodecId,
    };
  });
  const metric = input.metricMemberships.map(({ metricGroupId, registryId }) => {
    const row = requireRow(registryId);
    if (row.entityId === null || row.roleId === null) throw new Error(`registry_row_missing_label_identity:${row.id}`);
    return {
      indexName: "metric_group_membership" as const,
      keyBytes: Buffer.from(encodeU1MetricGroupKey({ ...addressKey(row), metricGroupId })),
      valueBytes: Buffer.from(encodeU1MetricGroupValue({ membershipStatus: 1, confidenceScore: row.confidenceScore, entityId: row.entityId, categoryId: row.categoryId ?? row.resolvedCategoryId ?? null, roleId: row.roleId, flags: row.flags, tagsetId: row.tagsetId })),
      registryId, metricGroupId, namespaceId: row.namespaceId, addressCodecId: row.addressCodecId,
    };
  });
  return Object.freeze([
    ...finalize("address_label_current", current),
    ...finalize("address_label_timeline", timeline),
    ...finalize("metric_group_membership", metric),
  ]);
}

export function semanticHash(records: readonly Pick<CompiledU1Record, "keyBytes" | "valueBytes">[]) {
  const hash = createHash("sha256");
  for (const record of records) hash.update(frameCompiledRecord(record.keyBytes, record.valueBytes));
  return hash.digest("hex");
}

export function summarizeCompiledRecordStream(records: readonly CompiledU1Record[]) {
  return Object.fromEntries(COMPILED_INDEX_NAMES.map(indexName => {
    const indexRecords = records.filter(record => record.indexName === indexName);
    return [indexName, { rowCount: indexRecords.length, hash: semanticHash(indexRecords) }];
  })) as Record<CompiledIndexName, { rowCount: number; hash: string }>;
}
