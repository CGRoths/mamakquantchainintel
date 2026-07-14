export const MQCHAIN_U1_SCHEMA = {
  schemaVersion: 1,
  currentKey: "MQK-U1",
  currentValue: "MQV-U1",
  timelineKey: "MQT-Key-U1",
  timelineValue: "MQT-U1",
  metricGroupKey: "MQG-Key-U1",
  metricGroupValue: "MQG-U1",
  tokenKey: "MQA-Key-U1",
  tokenValue: "MQA-U1",
  nativeAssetKey: "MQAN-Key-U1",
  nativeAssetValue: "MQAN-U1",
  currentValueBytes: 56,
  timelineValueBytes: 64,
  metricGroupValueBytes: 24,
  tokenValueBytes: 48,
  nativeAssetValueBytes: 16,
} as const;

type Uint64Input = bigint | number | null | undefined;

export type U1AddressKey = {
  namespaceId: number;
  addressCodecId: number;
  payloadHex: string;
};

export type U1TimelineKey = U1AddressKey & { validFromHeight: Uint64Input };
export type U1MetricGroupKey = U1AddressKey & { metricGroupId: number };

export type U1AddressValue = {
  schemaVersion?: number;
  labelStatus: number;
  qualityTier: number;
  confidenceScore: number;
  entityId: number;
  protocolId?: number | null;
  categoryId?: number | null;
  roleId: number;
  componentId?: number | null;
  tagsetId?: number | null;
  flags: number;
  batchId: Uint64Input;
  firstSeenHeight: Uint64Input;
  lastSeenHeight: Uint64Input;
};

export type U1TimelineValue = Omit<U1AddressValue, "firstSeenHeight" | "lastSeenHeight"> & {
  validToHeight: Uint64Input;
  firstSeenHeight: Uint64Input;
  lastSeenHeight: Uint64Input;
};

export type U1MetricGroupValue = {
  schemaVersion?: number;
  membershipStatus: number;
  confidenceScore: number;
  entityId: number;
  categoryId?: number | null;
  roleId: number;
  flags: number;
  tagsetId?: number | null;
};

export type U1TokenValue = {
  schemaVersion?: number;
  labelStatus: number;
  qualityTier: number;
  confidenceScore: number;
  assetId: number;
  issuerEntityId?: number | null;
  standardId: number;
  decimals: number;
  flags: number;
  batchId: Uint64Input;
  firstSeenHeight: Uint64Input;
  lastSeenHeight: Uint64Input;
};

export type U1NativeAssetValue = {
  schemaVersion?: number;
  status: number;
  qualityTier: number;
  confidenceScore: number;
  assetId: number;
  standardId: number;
  flags: number;
};

function assertUint(name: string, value: number, max: number) {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`${name} must be an unsigned integer between 0 and ${max}.`);
  }
  return value;
}

function uint64(name: string, value: Uint64Input) {
  if (value === null || value === undefined) return 0n;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer or bigint.`);
    return BigInt(value);
  }
  if (value < 0n || value > 0xffffffffffffffffn) throw new Error(`${name} must fit uint64.`);
  return value;
}

function payloadBytes(payloadHex: string) {
  const normalized = payloadHex.trim().toLowerCase();
  if (!normalized || normalized.length % 2 !== 0 || /[^0-9a-f]/.test(normalized)) {
    throw new Error("payloadHex must be non-empty even-length hexadecimal.");
  }
  return Uint8Array.from(Buffer.from(normalized, "hex"));
}

function bytesToHex(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("hex");
}

function requireLength(name: string, bytes: Uint8Array, length: number) {
  if (bytes.byteLength !== length) throw new Error(`${name} must be exactly ${length} bytes; received ${bytes.byteLength}.`);
}

function schemaVersion(value?: number) {
  return assertUint("schemaVersion", value ?? MQCHAIN_U1_SCHEMA.schemaVersion, 0xff);
}

function nullableUint32(name: string, value?: number | null) {
  return assertUint(name, value ?? 0, 0xffffffff);
}

function encodeAddressPrefix(input: U1AddressKey, leadingBytes = 0, trailingBytes = 0) {
  const payload = payloadBytes(input.payloadHex);
  const bytes = new Uint8Array(leadingBytes + 6 + payload.length + trailingBytes);
  const view = new DataView(bytes.buffer);
  view.setUint32(leadingBytes, assertUint("namespaceId", input.namespaceId, 0xffffffff), false);
  view.setUint16(leadingBytes + 4, assertUint("addressCodecId", input.addressCodecId, 0xffff), false);
  bytes.set(payload, leadingBytes + 6);
  return { bytes, view, payload, payloadOffset: leadingBytes + 6 };
}

export function encodeU1CurrentKey(input: U1AddressKey) {
  return encodeAddressPrefix(input).bytes;
}

export function decodeU1CurrentKey(bytes: Uint8Array): U1AddressKey {
  if (bytes.length < 7) throw new Error("MQK-U1 requires a six-byte prefix and non-empty payload.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { namespaceId: view.getUint32(0, false), addressCodecId: view.getUint16(4, false), payloadHex: bytesToHex(bytes.slice(6)) };
}

export function encodeU1TimelineKey(input: U1TimelineKey) {
  const encoded = encodeAddressPrefix(input, 0, 8);
  encoded.view.setBigUint64(encoded.payloadOffset + encoded.payload.length, uint64("validFromHeight", input.validFromHeight), false);
  return encoded.bytes;
}

export function decodeU1TimelineKey(bytes: Uint8Array): U1TimelineKey {
  if (bytes.length < 15) throw new Error("MQT-Key-U1 requires a six-byte prefix, payload, and uint64 height.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    namespaceId: view.getUint32(0, false),
    addressCodecId: view.getUint16(4, false),
    payloadHex: bytesToHex(bytes.slice(6, -8)),
    validFromHeight: view.getBigUint64(bytes.length - 8, false),
  };
}

export function encodeU1MetricGroupKey(input: U1MetricGroupKey) {
  const encoded = encodeAddressPrefix(input, 4);
  encoded.view.setUint32(0, assertUint("metricGroupId", input.metricGroupId, 0xffffffff), false);
  return encoded.bytes;
}

export function decodeU1MetricGroupKey(bytes: Uint8Array): U1MetricGroupKey {
  if (bytes.length < 11) throw new Error("MQG-Key-U1 requires a ten-byte prefix and non-empty payload.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    metricGroupId: view.getUint32(0, false),
    namespaceId: view.getUint32(4, false),
    addressCodecId: view.getUint16(8, false),
    payloadHex: bytesToHex(bytes.slice(10)),
  };
}

export const encodeU1TokenKey = encodeU1CurrentKey;
export const decodeU1TokenKey = decodeU1CurrentKey;

export function encodeU1NativeAssetKey(namespaceId: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, assertUint("namespaceId", namespaceId, 0xffffffff), false);
  return bytes;
}

export function decodeU1NativeAssetKey(bytes: Uint8Array) {
  requireLength("MQAN-Key-U1", bytes, 4);
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
}

function writeAddressValueHead(view: DataView, input: U1AddressValue | U1TimelineValue) {
  view.setUint8(0, schemaVersion(input.schemaVersion));
  view.setUint8(1, assertUint("labelStatus", input.labelStatus, 0xff));
  view.setUint8(2, assertUint("qualityTier", input.qualityTier, 0xff));
  view.setUint8(3, assertUint("confidenceScore", input.confidenceScore, 0xff));
  view.setUint32(4, assertUint("entityId", input.entityId, 0xffffffff), true);
  view.setUint32(8, nullableUint32("protocolId", input.protocolId), true);
  view.setUint32(12, nullableUint32("categoryId", input.categoryId), true);
  view.setUint32(16, assertUint("roleId", input.roleId, 0xffffffff), true);
  view.setUint32(20, nullableUint32("componentId", input.componentId), true);
  view.setUint32(24, nullableUint32("tagsetId", input.tagsetId), true);
  view.setUint32(28, assertUint("flags", input.flags, 0xffffffff), true);
  view.setBigUint64(32, uint64("batchId", input.batchId), true);
}

function readAddressValueHead(view: DataView) {
  return {
    schemaVersion: view.getUint8(0),
    labelStatus: view.getUint8(1),
    qualityTier: view.getUint8(2),
    confidenceScore: view.getUint8(3),
    entityId: view.getUint32(4, true),
    protocolId: view.getUint32(8, true),
    categoryId: view.getUint32(12, true),
    roleId: view.getUint32(16, true),
    componentId: view.getUint32(20, true),
    tagsetId: view.getUint32(24, true),
    flags: view.getUint32(28, true),
    batchId: view.getBigUint64(32, true),
  };
}

export function encodeU1CurrentValue(input: U1AddressValue) {
  const bytes = new Uint8Array(MQCHAIN_U1_SCHEMA.currentValueBytes);
  const view = new DataView(bytes.buffer);
  writeAddressValueHead(view, input);
  view.setBigUint64(40, uint64("firstSeenHeight", input.firstSeenHeight), true);
  view.setBigUint64(48, uint64("lastSeenHeight", input.lastSeenHeight), true);
  return bytes;
}

export function decodeU1CurrentValue(bytes: Uint8Array) {
  requireLength("MQV-U1", bytes, MQCHAIN_U1_SCHEMA.currentValueBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { ...readAddressValueHead(view), firstSeenHeight: view.getBigUint64(40, true), lastSeenHeight: view.getBigUint64(48, true) };
}

export function encodeU1TimelineValue(input: U1TimelineValue) {
  const bytes = new Uint8Array(MQCHAIN_U1_SCHEMA.timelineValueBytes);
  const view = new DataView(bytes.buffer);
  writeAddressValueHead(view, input);
  view.setBigUint64(40, uint64("validToHeight", input.validToHeight), true);
  view.setBigUint64(48, uint64("firstSeenHeight", input.firstSeenHeight), true);
  view.setBigUint64(56, uint64("lastSeenHeight", input.lastSeenHeight), true);
  return bytes;
}

export function decodeU1TimelineValue(bytes: Uint8Array) {
  requireLength("MQT-U1", bytes, MQCHAIN_U1_SCHEMA.timelineValueBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { ...readAddressValueHead(view), validToHeight: view.getBigUint64(40, true), firstSeenHeight: view.getBigUint64(48, true), lastSeenHeight: view.getBigUint64(56, true) };
}

export function encodeU1MetricGroupValue(input: U1MetricGroupValue) {
  const bytes = new Uint8Array(MQCHAIN_U1_SCHEMA.metricGroupValueBytes);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, schemaVersion(input.schemaVersion));
  view.setUint8(1, assertUint("membershipStatus", input.membershipStatus, 0xff));
  view.setUint8(2, assertUint("confidenceScore", input.confidenceScore, 0xff));
  view.setUint8(3, 0);
  view.setUint32(4, assertUint("entityId", input.entityId, 0xffffffff), true);
  view.setUint32(8, nullableUint32("categoryId", input.categoryId), true);
  view.setUint32(12, assertUint("roleId", input.roleId, 0xffffffff), true);
  view.setUint32(16, assertUint("flags", input.flags, 0xffffffff), true);
  view.setUint32(20, nullableUint32("tagsetId", input.tagsetId), true);
  return bytes;
}

export function decodeU1MetricGroupValue(bytes: Uint8Array) {
  requireLength("MQG-U1", bytes, MQCHAIN_U1_SCHEMA.metricGroupValueBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(3) !== 0) throw new Error("MQG-U1 reserved byte must be zero.");
  return { schemaVersion: view.getUint8(0), membershipStatus: view.getUint8(1), confidenceScore: view.getUint8(2), entityId: view.getUint32(4, true), categoryId: view.getUint32(8, true), roleId: view.getUint32(12, true), flags: view.getUint32(16, true), tagsetId: view.getUint32(20, true) };
}

export function encodeU1TokenValue(input: U1TokenValue) {
  const bytes = new Uint8Array(MQCHAIN_U1_SCHEMA.tokenValueBytes);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, schemaVersion(input.schemaVersion));
  view.setUint8(1, assertUint("labelStatus", input.labelStatus, 0xff));
  view.setUint8(2, assertUint("qualityTier", input.qualityTier, 0xff));
  view.setUint8(3, assertUint("confidenceScore", input.confidenceScore, 0xff));
  view.setUint32(4, assertUint("assetId", input.assetId, 0xffffffff), true);
  view.setUint32(8, nullableUint32("issuerEntityId", input.issuerEntityId), true);
  view.setUint16(12, assertUint("standardId", input.standardId, 0xffff), true);
  view.setUint8(14, assertUint("decimals", input.decimals, 0xff));
  view.setUint8(15, 0);
  view.setUint32(16, assertUint("flags", input.flags, 0xffffffff), true);
  view.setUint32(20, 0, true);
  view.setBigUint64(24, uint64("batchId", input.batchId), true);
  view.setBigUint64(32, uint64("firstSeenHeight", input.firstSeenHeight), true);
  view.setBigUint64(40, uint64("lastSeenHeight", input.lastSeenHeight), true);
  return bytes;
}

export function decodeU1TokenValue(bytes: Uint8Array) {
  requireLength("MQA-U1", bytes, MQCHAIN_U1_SCHEMA.tokenValueBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(15) !== 0 || view.getUint32(20, true) !== 0) throw new Error("MQA-U1 reserved fields must be zero.");
  return { schemaVersion: view.getUint8(0), labelStatus: view.getUint8(1), qualityTier: view.getUint8(2), confidenceScore: view.getUint8(3), assetId: view.getUint32(4, true), issuerEntityId: view.getUint32(8, true), standardId: view.getUint16(12, true), decimals: view.getUint8(14), flags: view.getUint32(16, true), batchId: view.getBigUint64(24, true), firstSeenHeight: view.getBigUint64(32, true), lastSeenHeight: view.getBigUint64(40, true) };
}

export function encodeU1NativeAssetValue(input: U1NativeAssetValue) {
  const bytes = new Uint8Array(MQCHAIN_U1_SCHEMA.nativeAssetValueBytes);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, schemaVersion(input.schemaVersion));
  view.setUint8(1, assertUint("status", input.status, 0xff));
  view.setUint8(2, assertUint("qualityTier", input.qualityTier, 0xff));
  view.setUint8(3, assertUint("confidenceScore", input.confidenceScore, 0xff));
  view.setUint32(4, assertUint("assetId", input.assetId, 0xffffffff), true);
  view.setUint16(8, assertUint("standardId", input.standardId, 0xffff), true);
  view.setUint16(10, 0, true);
  view.setUint32(12, assertUint("flags", input.flags, 0xffffffff), true);
  return bytes;
}

export function decodeU1NativeAssetValue(bytes: Uint8Array) {
  requireLength("MQAN-U1", bytes, MQCHAIN_U1_SCHEMA.nativeAssetValueBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(10, true) !== 0) throw new Error("MQAN-U1 reserved field must be zero.");
  return { schemaVersion: view.getUint8(0), status: view.getUint8(1), qualityTier: view.getUint8(2), confidenceScore: view.getUint8(3), assetId: view.getUint32(4, true), standardId: view.getUint16(8, true), flags: view.getUint32(12, true) };
}
