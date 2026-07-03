export type MqKvAddressKey = {
  prefixCode: number;
  payloadHex: string;
};

export type MqKvTimelineKey = MqKvAddressKey & {
  validFromBlock: number | null;
};

export type MqMetricGroupMembershipKey = MqKvAddressKey & {
  metricGroupId: number;
};

export type MqKvAddressValue = {
  entityId: number;
  protocolId: number | null;
  roleId: number;
  categoryId: number | null;
  labelStatus: number;
  confidenceScore: number;
  qualityTier: number;
  flags: number;
  validFromBlock: number | null;
  validToBlock: number | null;
  firstSeenBlock: number | null;
  lastSeenBlock: number | null;
  approvedBatchId: number | null;
};

export type MqMetricGroupMembershipValue = {
  entityId: number;
  roleId: number;
  confidenceScore: number;
  flags: number;
};

export const MQ_KV_SCHEMA = {
  currentLabelKey: "MQK-V1",
  currentLabelValue: "MQV-V1",
  timelineKey: "MQT-Key-V1",
  timelineValue: "MQT-V1",
  metricGroupMembershipKey: "MQG-Key-V1",
  metricGroupMembershipValue: "MQG-V1",
  schemaVersion: 1,
  currentLabelValueBytes: 32,
  timelineValueBytes: 40,
  metricGroupMembershipValueBytes: 9,
} as const;

export function buildKvKey({ prefixCode, payloadHex }: MqKvAddressKey) {
  return `${prefixCode.toString(16).padStart(4, "0")}:${payloadHex.toLowerCase()}`;
}

function assertUint(name: string, value: number, max: number) {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`${name} must be an unsigned integer between 0 and ${max}.`);
  }
}

function nullableUint(value: number | null | undefined) {
  return value ?? 0;
}

function assertNullableUint(name: string, value: number | null | undefined, max: number) {
  const encoded = nullableUint(value);
  assertUint(name, encoded, max);
  return encoded;
}

function uint64(value: number | null | undefined) {
  const encoded = nullableUint(value);
  if (!Number.isSafeInteger(encoded) || encoded < 0) {
    throw new Error("uint64 value must be a non-negative safe integer.");
  }
  return BigInt(encoded);
}

function payloadBytes(payloadHex: string) {
  const normalized = payloadHex.trim().toLowerCase();
  if (!normalized || normalized.length % 2 !== 0 || /[^0-9a-f]/.test(normalized)) {
    throw new Error("payloadHex must be non-empty even-length lowercase hex.");
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

function withPrefix(prefixCode: number, payloadHex: string, extraBytes = 0) {
  assertUint("prefixCode", prefixCode, 0xffff);
  const payload = payloadBytes(payloadHex);
  const bytes = new Uint8Array(2 + payload.length + extraBytes);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, prefixCode, false);
  bytes.set(payload, 2);
  return { bytes, view, payloadOffset: 2 + payload.length };
}

export function encodeCurrentLabelKey(input: MqKvAddressKey) {
  return withPrefix(input.prefixCode, input.payloadHex).bytes;
}

export function encodeTimelineKey(input: MqKvTimelineKey) {
  const { bytes, view, payloadOffset } = withPrefix(input.prefixCode, input.payloadHex, 8);
  view.setBigUint64(payloadOffset, uint64(input.validFromBlock), false);
  return bytes;
}

export function encodeMetricGroupMembershipKey(input: MqMetricGroupMembershipKey) {
  assertUint("metricGroupId", input.metricGroupId, 0xffff);
  assertUint("prefixCode", input.prefixCode, 0xffff);
  const payload = payloadBytes(input.payloadHex);
  const bytes = new Uint8Array(4 + payload.length);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, input.metricGroupId, false);
  view.setUint16(2, input.prefixCode, false);
  bytes.set(payload, 4);
  return bytes;
}

export function encodeCurrentLabelValue(input: MqKvAddressValue) {
  assertUint("confidenceScore", input.confidenceScore, 0xff);
  assertUint("labelStatus", input.labelStatus, 0xff);
  assertUint("qualityTier", input.qualityTier, 0xff);
  assertUint("entityId", input.entityId, 0xffffffff);
  assertUint("roleId", input.roleId, 0xffff);
  assertUint("flags", input.flags, 0xffff);

  const bytes = new Uint8Array(MQ_KV_SCHEMA.currentLabelValueBytes);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, MQ_KV_SCHEMA.schemaVersion);
  view.setUint8(1, input.confidenceScore);
  view.setUint8(2, input.labelStatus);
  view.setUint8(3, input.qualityTier);
  view.setUint32(4, input.entityId, true);
  view.setUint32(8, assertNullableUint("protocolId", input.protocolId, 0xffffffff), true);
  view.setUint16(12, input.roleId, true);
  view.setUint16(14, input.flags, true);
  view.setBigUint64(16, uint64(input.approvedBatchId), true);
  view.setUint32(24, assertNullableUint("firstSeenBlock", input.firstSeenBlock, 0xffffffff), true);
  view.setUint32(28, assertNullableUint("lastSeenBlock", input.lastSeenBlock, 0xffffffff), true);
  return bytes;
}

export function encodeTimelineValue(input: MqKvAddressValue) {
  assertUint("confidenceScore", input.confidenceScore, 0xff);
  assertUint("labelStatus", input.labelStatus, 0xff);
  assertUint("qualityTier", input.qualityTier, 0xff);
  assertUint("entityId", input.entityId, 0xffffffff);
  assertUint("roleId", input.roleId, 0xffff);
  assertUint("flags", input.flags, 0xffff);

  const bytes = new Uint8Array(MQ_KV_SCHEMA.timelineValueBytes);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, MQ_KV_SCHEMA.schemaVersion);
  view.setUint8(1, input.confidenceScore);
  view.setUint8(2, input.labelStatus);
  view.setUint8(3, input.qualityTier);
  view.setUint32(4, input.entityId, true);
  view.setUint32(8, assertNullableUint("protocolId", input.protocolId, 0xffffffff), true);
  view.setUint16(12, input.roleId, true);
  view.setUint16(14, input.flags, true);
  view.setBigUint64(16, uint64(input.approvedBatchId), true);
  view.setBigUint64(24, uint64(input.validToBlock), true);
  view.setUint32(32, assertNullableUint("firstSeenBlock", input.firstSeenBlock, 0xffffffff), true);
  view.setUint32(36, assertNullableUint("lastSeenBlock", input.lastSeenBlock, 0xffffffff), true);
  return bytes;
}

export function encodeMetricGroupMembershipValue(input: MqMetricGroupMembershipValue) {
  assertUint("entityId", input.entityId, 0xffffffff);
  assertUint("roleId", input.roleId, 0xffff);
  assertUint("confidenceScore", input.confidenceScore, 0xff);
  assertUint("flags", input.flags, 0xffff);

  const bytes = new Uint8Array(MQ_KV_SCHEMA.metricGroupMembershipValueBytes);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, input.entityId, true);
  view.setUint16(4, input.roleId, true);
  view.setUint8(6, input.confidenceScore);
  view.setUint16(7, input.flags, true);
  return bytes;
}
