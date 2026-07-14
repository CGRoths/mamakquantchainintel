import { describe, expect, it } from "vitest";

import {
  decodeU1CurrentKey,
  decodeU1CurrentValue,
  decodeU1MetricGroupKey,
  decodeU1MetricGroupValue,
  decodeU1NativeAssetKey,
  decodeU1NativeAssetValue,
  decodeU1TimelineKey,
  decodeU1TimelineValue,
  decodeU1TokenValue,
  encodeU1CurrentKey,
  encodeU1CurrentValue,
  encodeU1MetricGroupKey,
  encodeU1MetricGroupValue,
  encodeU1NativeAssetKey,
  encodeU1NativeAssetValue,
  encodeU1TimelineKey,
  encodeU1TimelineValue,
  encodeU1TokenValue,
  MQCHAIN_U1_SCHEMA,
} from "@/lib/mqchain/kv/u1";

const payload = "11".repeat(20);
const addressValue = {
  labelStatus: 1,
  qualityTier: 3,
  confidenceScore: 85,
  entityId: 0x01020304,
  protocolId: 0x05060708,
  categoryId: 0x090a0b0c,
  roleId: 0x0d0e0f10,
  componentId: 0x11121314,
  tagsetId: 0x15161718,
  flags: 0x191a1b1c,
  batchId: 0x0102030405060708n,
  firstSeenHeight: 0x1112131415161718n,
  lastSeenHeight: 0x2122232425262728n,
};

describe("U1 binary contracts", () => {
  it("encodes BE address ordering keys byte exactly and round trips", () => {
    const current = encodeU1CurrentKey({ namespaceId: 0x01020304, addressCodecId: 0x0506, payloadHex: payload });
    expect(Buffer.from(current).toString("hex")).toBe(`010203040506${payload}`);
    expect(decodeU1CurrentKey(current)).toEqual({ namespaceId: 0x01020304, addressCodecId: 0x0506, payloadHex: payload });

    const timeline = encodeU1TimelineKey({ namespaceId: 1, addressCodecId: 2, payloadHex: "aabb", validFromHeight: 0x0102030405060708n });
    expect(Buffer.from(timeline).toString("hex")).toBe("000000010002aabb0102030405060708");
    expect(decodeU1TimelineKey(timeline).validFromHeight).toBe(0x0102030405060708n);

    const group = encodeU1MetricGroupKey({ metricGroupId: 0x01020304, namespaceId: 0x05060708, addressCodecId: 0x090a, payloadHex: "bbcc" });
    expect(Buffer.from(group).toString("hex")).toBe("0102030405060708090abbcc");
    expect(decodeU1MetricGroupKey(group).metricGroupId).toBe(0x01020304);
  });

  it("encodes MQV-U1 and MQT-U1 exact lengths and LE values", () => {
    const current = encodeU1CurrentValue(addressValue);
    expect(current).toHaveLength(56);
    expect(Buffer.from(current).toString("hex")).toBe("0101035504030201080706050c0b0a09100f0e0d14131211181716151c1b1a19080706050403020118171615141312112827262524232221");
    expect(decodeU1CurrentValue(current)).toMatchObject({ roleId: 0x0d0e0f10, batchId: 0x0102030405060708n });

    const timeline = encodeU1TimelineValue({ ...addressValue, validToHeight: 0x3132333435363738n });
    expect(timeline).toHaveLength(64);
    expect(decodeU1TimelineValue(timeline)).toMatchObject({ validToHeight: 0x3132333435363738n, lastSeenHeight: addressValue.lastSeenHeight });
  });

  it("encodes metric, token, and native asset values at approved widths", () => {
    const metric = encodeU1MetricGroupValue({ membershipStatus: 1, confidenceScore: 90, entityId: 4, categoryId: 100, roleId: 1020, flags: 0xffffffff, tagsetId: null });
    expect(metric).toHaveLength(24);
    expect(decodeU1MetricGroupValue(metric)).toMatchObject({ confidenceScore: 90, flags: 0xffffffff, tagsetId: 0 });

    const token = encodeU1TokenValue({ labelStatus: 1, qualityTier: 1, confidenceScore: 99, assetId: 3, issuerEntityId: 42, standardId: 2, decimals: 6, flags: 7, batchId: 9n, firstSeenHeight: 10n, lastSeenHeight: 11n });
    expect(token).toHaveLength(48);
    expect(decodeU1TokenValue(token)).toMatchObject({ assetId: 3, issuerEntityId: 42, standardId: 2, decimals: 6 });

    const nativeKey = encodeU1NativeAssetKey(0x01020304);
    expect(Buffer.from(nativeKey).toString("hex")).toBe("01020304");
    expect(decodeU1NativeAssetKey(nativeKey)).toBe(0x01020304);
    const nativeValue = encodeU1NativeAssetValue({ status: 1, qualityTier: 1, confidenceScore: 100, assetId: 1, standardId: 1, flags: 0xffffffff });
    expect(nativeValue).toHaveLength(16);
    expect(decodeU1NativeAssetValue(nativeValue).flags).toBe(0xffffffff);
  });

  it("uses zero sentinels and rejects overflow, unsafe uint64, malformed payload, and bad decode lengths", () => {
    const encoded = encodeU1CurrentValue({ ...addressValue, protocolId: null, categoryId: null, componentId: null, tagsetId: null, firstSeenHeight: null, lastSeenHeight: null });
    expect(decodeU1CurrentValue(encoded)).toMatchObject({ protocolId: 0, categoryId: 0, componentId: 0, tagsetId: 0, firstSeenHeight: 0n, lastSeenHeight: 0n });
    expect(() => encodeU1CurrentKey({ namespaceId: 0x1_0000_0000, addressCodecId: 1, payloadHex: "aa" })).toThrow(/namespaceId/);
    expect(() => encodeU1CurrentKey({ namespaceId: 1, addressCodecId: 0x10000, payloadHex: "aa" })).toThrow(/addressCodecId/);
    expect(() => encodeU1CurrentKey({ namespaceId: 1, addressCodecId: 1, payloadHex: "xyz" })).toThrow(/payloadHex/);
    expect(() => encodeU1CurrentValue({ ...addressValue, batchId: Number.MAX_SAFE_INTEGER + 1 })).toThrow(/safe integer/);
    expect(() => decodeU1CurrentValue(new Uint8Array(MQCHAIN_U1_SCHEMA.currentValueBytes - 1))).toThrow(/exactly 56 bytes/);
  });
});
