import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { MqAddressRegistryRow } from "@/db/schema";
import { compileU1RecordStream } from "@/lib/mqchain/kv/compiled-records";
import { resolveCurrentRecordBatch, resolveMetricRecordBatch, resolveTimelineRecordBatch } from "@/lib/mqchain/kv/decoded-record";
import { RocksDbResolver } from "../../tools/kv-compiler/rocksdb-resolver";
import { writeRocksDbStagingArtifact } from "../../tools/kv-compiler/rocksdb-writer";

const cleanup: string[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

function row(): MqAddressRegistryRow {
  return {
    id: 12, normalizedAddress: `0x${"22".repeat(20)}`, rawAddress: null, chainCode: "ethereum_mainnet", prefixCode: 60,
    namespaceId: 2, addressCodecId: 1, payloadHex: "22".repeat(20), entityId: 4, protocolId: null, categoryId: 100,
    roleId: 1020, componentId: null, tagsetId: null, confidenceScore: 95, labelStatus: 1, qualityTier: 3, flags: 1,
    metricUsage: "cex_flow", validFromBlock: 100, validToBlock: 200, firstSeenBlock: 90, lastSeenBlock: 210,
    approvedBatchId: 2, primarySourceJobId: null, isActive: true, notes: null, metadata: {}, createdAt: new Date(0), updatedAt: new Date(0),
  };
}

const addressKey = { namespaceId: 2, addressCodecId: 1, payloadHex: "22".repeat(20) };

describe("U1 reference resolvers", () => {
  it("returns one common decoded model for current, timeline, and metric records", () => {
    const records = compileU1RecordStream({ rows: [row()], currentRegistryIds: [12], timelineRegistryIds: [12], metricMemberships: [{ metricGroupId: 7, registryId: 12 }] });
    expect(resolveCurrentRecordBatch(records.filter(record => record.indexName === "address_label_current"), [addressKey])[0]).toMatchObject({ indexName: "address_label_current", value: { entityId: 4, roleId: 1020 } });
    expect(resolveTimelineRecordBatch(records.filter(record => record.indexName === "address_label_timeline"), [{ ...addressKey, blockHeight: 150 }])[0]).toMatchObject({ indexName: "address_label_timeline", value: { validToHeight: 200n } });
    expect(resolveTimelineRecordBatch(records.filter(record => record.indexName === "address_label_timeline"), [{ ...addressKey, blockHeight: 250 }])[0]).toBeNull();
    expect(resolveMetricRecordBatch(records.filter(record => record.indexName === "metric_group_membership"), [{ ...addressKey, metricGroupId: 7 }])[0]).toMatchObject({ indexName: "metric_group_membership", value: { membershipStatus: 1 } });
  });

  it("resolves all three models from the exact RocksDB artifact bytes", async () => {
    const records = compileU1RecordStream({ rows: [row()], currentRegistryIds: [12], timelineRegistryIds: [12], metricMemberships: [{ metricGroupId: 7, registryId: 12 }] });
    const root = await mkdtemp(path.join(tmpdir(), "mqchain-resolver-"));
    cleanup.push(root);
    const artifact = await writeRocksDbStagingArtifact({ artifactRoot: root, compileRequestHash: "f".repeat(64), records });
    const resolver = new RocksDbResolver(artifact);
    const [current] = await resolver.resolveCurrent([addressKey]);
    const [timeline] = await resolver.resolveTimeline([{ ...addressKey, blockHeight: 150 }]);
    const [metric] = await resolver.resolveMetricGroup([{ ...addressKey, metricGroupId: 7 }]);
    expect([current?.indexName, timeline?.indexName, metric?.indexName]).toEqual(["address_label_current", "address_label_timeline", "metric_group_membership"]);
    expect(current?.valueBytes.equals(records[0].valueBytes)).toBe(true);
    expect(await resolver.resolveCurrent([{ ...addressKey, payloadHex: "33".repeat(20) }])).toEqual([null]);
  });
});
