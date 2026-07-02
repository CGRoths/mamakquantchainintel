export type MqKvAddressKey = {
  prefixCode: number;
  payloadHex: string;
};

export type MqKvAddressValue = {
  entityId: number;
  protocolId: number | null;
  roleId: number;
  categoryId: number | null;
  confidenceScore: number;
  qualityTier: number;
  flags: number;
  validFromBlock: number | null;
  validToBlock: number | null;
  approvedBatchId: number | null;
};

export function buildKvKey({ prefixCode, payloadHex }: MqKvAddressKey) {
  return `${prefixCode.toString(16).padStart(4, "0")}:${payloadHex.toLowerCase()}`;
}
