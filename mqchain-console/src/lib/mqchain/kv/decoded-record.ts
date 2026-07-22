import type { CompiledIndexName } from "./compiled-records";
import {
  decodeU1CurrentKey,
  decodeU1CurrentValue,
  decodeU1MetricGroupKey,
  decodeU1MetricGroupValue,
  decodeU1TimelineKey,
  decodeU1TimelineValue,
  encodeU1CurrentKey,
  encodeU1MetricGroupKey,
  type U1AddressKey,
  type U1MetricGroupKey,
} from "./u1";

export type DecodedU1Record =
  | Readonly<{ indexName: "address_label_current"; keyBytes: Buffer; valueBytes: Buffer; key: ReturnType<typeof decodeU1CurrentKey>; value: ReturnType<typeof decodeU1CurrentValue> }>
  | Readonly<{ indexName: "address_label_timeline"; keyBytes: Buffer; valueBytes: Buffer; key: ReturnType<typeof decodeU1TimelineKey>; value: ReturnType<typeof decodeU1TimelineValue> }>
  | Readonly<{ indexName: "metric_group_membership"; keyBytes: Buffer; valueBytes: Buffer; key: ReturnType<typeof decodeU1MetricGroupKey>; value: ReturnType<typeof decodeU1MetricGroupValue> }>;

export type TimelineLookup = U1AddressKey & { blockHeight: bigint | number };

export function decodeCompiledU1Record(indexName: CompiledIndexName, keyBytes: Uint8Array, valueBytes: Uint8Array): DecodedU1Record {
  const key = Buffer.from(keyBytes);
  const value = Buffer.from(valueBytes);
  if (indexName === "address_label_current") return Object.freeze({ indexName, keyBytes: key, valueBytes: value, key: decodeU1CurrentKey(key), value: decodeU1CurrentValue(value) });
  if (indexName === "address_label_timeline") return Object.freeze({ indexName, keyBytes: key, valueBytes: value, key: decodeU1TimelineKey(key), value: decodeU1TimelineValue(value) });
  return Object.freeze({ indexName, keyBytes: key, valueBytes: value, key: decodeU1MetricGroupKey(key), value: decodeU1MetricGroupValue(value) });
}

function exactLookup(indexName: "address_label_current" | "metric_group_membership", rows: readonly { keyBytes: Buffer; valueBytes: Buffer }[], keys: readonly Buffer[]) {
  const values = new Map(rows.map(row => [row.keyBytes.toString("hex"), row.valueBytes]));
  return keys.map(key => {
    const value = values.get(key.toString("hex"));
    return value ? decodeCompiledU1Record(indexName, key, value) : null;
  });
}

export function resolveCurrentRecordBatch(rows: readonly { keyBytes: Buffer; valueBytes: Buffer }[], keys: readonly U1AddressKey[]) {
  return exactLookup("address_label_current", rows, keys.map(key => Buffer.from(encodeU1CurrentKey(key))));
}

export function resolveMetricRecordBatch(rows: readonly { keyBytes: Buffer; valueBytes: Buffer }[], keys: readonly U1MetricGroupKey[]) {
  return exactLookup("metric_group_membership", rows, keys.map(key => Buffer.from(encodeU1MetricGroupKey(key))));
}

export function resolveTimelineRecordBatch(rows: readonly { keyBytes: Buffer; valueBytes: Buffer }[], lookups: readonly TimelineLookup[]) {
  const decoded = rows.map(row => decodeCompiledU1Record("address_label_timeline", row.keyBytes, row.valueBytes) as Extract<DecodedU1Record, { indexName: "address_label_timeline" }>);
  return lookups.map(lookup => {
    const height = typeof lookup.blockHeight === "bigint" ? lookup.blockHeight : BigInt(lookup.blockHeight);
    const matches = decoded.filter(record =>
      record.key.namespaceId === lookup.namespaceId &&
      record.key.addressCodecId === lookup.addressCodecId &&
      record.key.payloadHex === lookup.payloadHex.toLowerCase() &&
      BigInt(record.key.validFromHeight ?? 0) <= height &&
      (record.value.validToHeight === 0n || record.value.validToHeight >= height),
    );
    matches.sort((left, right) => {
      const leftHeight = BigInt(left.key.validFromHeight ?? 0);
      const rightHeight = BigInt(right.key.validFromHeight ?? 0);
      return leftHeight === rightHeight ? 0 : leftHeight > rightHeight ? -1 : 1;
    });
    return matches[0] ?? null;
  });
}
