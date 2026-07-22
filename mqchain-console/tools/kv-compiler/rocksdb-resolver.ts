import { resolveCurrentRecordBatch, resolveMetricRecordBatch, resolveTimelineRecordBatch, type TimelineLookup } from "../../src/lib/mqchain/kv/decoded-record";
import { encodeU1CurrentKey, encodeU1MetricGroupKey, type U1AddressKey, type U1MetricGroupKey } from "../../src/lib/mqchain/kv/u1";
import { readRocksDbRecords, readRocksDbValues } from "./rocksdb-writer";

export class RocksDbResolver {
  constructor(readonly artifactDirectory: string) {}

  async resolveCurrent(keys: readonly U1AddressKey[]) {
    const encoded = keys.map(key => Buffer.from(encodeU1CurrentKey(key)));
    const values = await readRocksDbValues(this.artifactDirectory, "address_label_current", encoded);
    return resolveCurrentRecordBatch(encoded.flatMap(key => {
      const value = values.get(key.toString("hex"));
      return value ? [{ keyBytes: key, valueBytes: value }] : [];
    }), keys);
  }

  async resolveTimeline(lookups: readonly TimelineLookup[]) {
    if (!lookups.length) return [];
    return resolveTimelineRecordBatch(await readRocksDbRecords(this.artifactDirectory, "address_label_timeline"), lookups);
  }

  async resolveMetricGroup(keys: readonly U1MetricGroupKey[]) {
    const encoded = keys.map(key => Buffer.from(encodeU1MetricGroupKey(key)));
    const values = await readRocksDbValues(this.artifactDirectory, "metric_group_membership", encoded);
    return resolveMetricRecordBatch(encoded.flatMap(key => {
      const value = values.get(key.toString("hex"));
      return value ? [{ keyBytes: key, valueBytes: value }] : [];
    }), keys);
  }
}
