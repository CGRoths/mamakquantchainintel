import { describe, expect, it } from "vitest";

import { LABEL_STATUS } from "@/lib/mqchain/constants";
import {
  buildKvKey,
  encodeCurrentLabelKey,
  encodeCurrentLabelValue,
  encodeMetricGroupMembershipKey,
  encodeMetricGroupMembershipValue,
  encodeTimelineKey,
  encodeTimelineValue,
  MQ_KV_SCHEMA,
  type MqKvAddressValue,
} from "@/lib/mqchain/kv/schema";

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("KV schema contracts", () => {
  const value: MqKvAddressValue = {
    entityId: 1,
    protocolId: null,
    roleId: 1010,
    categoryId: 100,
    labelStatus: LABEL_STATUS.inactiveHistorical,
    confidenceScore: 95,
    qualityTier: 1,
    flags: 0x1234,
    validFromBlock: 100,
    validToBlock: 200,
    firstSeenBlock: 100,
    lastSeenBlock: 200,
    approvedBatchId: 7,
  };

  it("keeps label status in compact address values", () => {
    expect(value.labelStatus).toBe(2);
  });

  it("builds deterministic prefix/payload keys for external KV workers", () => {
    expect(buildKvKey({ prefixCode: 0x0101, payloadHex: "ABCDEF" })).toBe("0101:abcdef");
  });

  it("encodes current label keys and MQV-V1 values", () => {
    expect(hex(encodeCurrentLabelKey({ prefixCode: 0x0101, payloadHex: "abcdef" }))).toBe("0101abcdef");
    expect(encodeCurrentLabelValue(value)).toHaveLength(MQ_KV_SCHEMA.currentLabelValueBytes);
    expect(hex(encodeCurrentLabelValue(value))).toBe(
      "015f0201" +
      "01000000" +
      "00000000" +
      "f203" +
      "3412" +
      "0700000000000000" +
      "64000000" +
      "c8000000",
    );
  });

  it("encodes timeline keys and MQT-V1 values", () => {
    expect(hex(encodeTimelineKey({ prefixCode: 0x0101, payloadHex: "abcdef", validFromBlock: 100 }))).toBe("0101abcdef0000000000000064");
    expect(encodeTimelineValue(value)).toHaveLength(MQ_KV_SCHEMA.timelineValueBytes);
    expect(hex(encodeTimelineValue(value))).toBe(
      "015f0201" +
      "01000000" +
      "00000000" +
      "f203" +
      "3412" +
      "0700000000000000" +
      "c800000000000000" +
      "64000000" +
      "c8000000",
    );
  });

  it("encodes metric-group membership keys and values", () => {
    expect(hex(encodeMetricGroupMembershipKey({ metricGroupId: 2, prefixCode: 0x0101, payloadHex: "abcdef" }))).toBe("00020101abcdef");
    expect(hex(encodeMetricGroupMembershipValue({
      entityId: 1,
      roleId: 1010,
      confidenceScore: 95,
      flags: 0x1234,
    }))).toBe("01000000f2035f3412");
  });

  it("rejects invalid compact payloads before compiler output wraps values", () => {
    expect(() => encodeCurrentLabelKey({ prefixCode: 0x0101, payloadHex: "abc" })).toThrow(/payloadHex/);
    expect(() => encodeCurrentLabelValue({ ...value, confidenceScore: 300 })).toThrow(/confidenceScore/);
    expect(() => encodeMetricGroupMembershipKey({ metricGroupId: 70000, prefixCode: 0x0101, payloadHex: "abcdef" })).toThrow(/metricGroupId/);
  });
});
