import { describe, expect, it } from "vitest";

import type { MqAddressRegistryRow } from "@/db/schema";
import { compileU1RecordStream, frameCompiledRecord, semanticHash, summarizeCompiledRecordStream } from "@/lib/mqchain/kv/compiled-records";

function row(id: number, payloadHex = id.toString(16).padStart(40, "0")): MqAddressRegistryRow {
  return {
    id, normalizedAddress: `0x${payloadHex}`, rawAddress: null, chainCode: "ethereum_mainnet", prefixCode: 60,
    namespaceId: 2, addressCodecId: 1, payloadHex, entityId: 1, protocolId: null,
    categoryId: 10, roleId: 1020, componentId: null, tagsetId: null, confidenceScore: 90,
    labelStatus: 1, qualityTier: 3, flags: 1, metricUsage: null, validFromBlock: null, validToBlock: null,
    firstSeenBlock: null, lastSeenBlock: null, approvedBatchId: 1, primarySourceJobId: null,
    isActive: true, notes: null, metadata: {}, createdAt: new Date(0), updatedAt: new Date(0),
  };
}

describe("compiled U1 record stream", () => {
  it("encodes once, sorts binary keys and assigns deterministic ordinals", () => {
    const records = compileU1RecordStream({
      rows: [row(2), row(1)], currentRegistryIds: [2, 1], timelineRegistryIds: [], metricMemberships: [],
    });
    expect(records.map(record => record.registryId)).toEqual([1, 2]);
    expect(records.map(record => record.ordinal)).toEqual([0, 1]);
    expect(records.every(record => record.valueBytes.length === 56)).toBe(true);
    expect(semanticHash(records)).toBe(semanticHash(compileU1RecordStream({ rows: [row(1), row(2)], currentRegistryIds: [1, 2], timelineRegistryIds: [], metricMemberships: [] })));
  });

  it("persists the frozen value sizes for all production indexes", () => {
    const timeline = { ...row(1), validFromBlock: 5, validToBlock: 10 };
    const records = compileU1RecordStream({ rows: [timeline], currentRegistryIds: [1], timelineRegistryIds: [1], metricMemberships: [{ metricGroupId: 9, registryId: 1 }] });
    expect(summarizeCompiledRecordStream(records)).toMatchObject({
      address_label_current: { rowCount: 1 }, address_label_timeline: { rowCount: 1 }, metric_group_membership: { rowCount: 1 },
    });
    expect(records.map(record => record.valueBytes.length)).toEqual([56, 64, 24]);
    expect(frameCompiledRecord(Buffer.from([1]), Buffer.from([2])).toString("hex")).toBe("00000001010000000102");
  });

  it("rejects duplicate exact binary keys", () => {
    expect(() => compileU1RecordStream({ rows: [row(1), row(2, row(1).payloadHex!)], currentRegistryIds: [1, 2], timelineRegistryIds: [], metricMemberships: [] })).toThrow(/duplicate_compiled_key/);
  });

  it("defines the SHA-256 empty-index semantic hash", () => {
    expect(semanticHash([])).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});
