import { encodeCurrentLabelKey } from "./kv/schema";
import { encodeU1CurrentKey } from "./kv/u1";

export type PrefixNamespaceMapping = {
  prefixCode: number;
  namespaceId: number;
  addressCodecId: number;
};

export type LegacyAddressIdentity = {
  subjectKind: "candidate" | "registry" | "metric_member";
  subjectId: number;
  prefixCode: number | null;
  namespaceId: number | null;
  addressCodecId: number | null;
  payloadHex: string | null;
};

export type U1MigrationConflict = LegacyAddressIdentity & {
  reason: "missing_prefix" | "unmapped_prefix" | "missing_payload" | "u1_identity_missing" | "u1_identity_mismatch" | "invalid_payload";
  expectedNamespaceId: number | null;
  expectedAddressCodecId: number | null;
};

export function mapLegacyPrefix(prefixCode: number, mappings: PrefixNamespaceMapping[], payloadHex?: string | null) {
  const matches = mappings.filter((mapping) => mapping.prefixCode === prefixCode);
  if (matches.length > 1 && prefixCode === 0x0012 && payloadHex && /^[0-9a-fA-F]{2}/.test(payloadHex)) {
    const witnessVersion = Number.parseInt(payloadHex.slice(0, 2), 16);
    const codecId = witnessVersion === 0 ? 12 : witnessVersion <= 16 ? 13 : null;
    if (codecId !== null) return matches.find(mapping => mapping.addressCodecId === codecId) ?? null;
  }
  if (matches.length !== 1) return null;
  return matches[0];
}

export function validateU1Backfill(rows: LegacyAddressIdentity[], mappings: PrefixNamespaceMapping[]) {
  const conflicts: U1MigrationConflict[] = [];
  let compatible = 0;
  for (const row of rows) {
    const mapping = row.prefixCode === null ? null : mapLegacyPrefix(row.prefixCode, mappings, row.payloadHex);
    let reason: U1MigrationConflict["reason"] | null = null;
    if (row.prefixCode === null) reason = "missing_prefix";
    else if (!mapping) reason = "unmapped_prefix";
    else if (!row.payloadHex) reason = "missing_payload";
    else if (row.namespaceId === null || row.addressCodecId === null) reason = "u1_identity_missing";
    else if (row.namespaceId !== mapping.namespaceId || row.addressCodecId !== mapping.addressCodecId) reason = "u1_identity_mismatch";
    else {
      try {
        encodeCurrentLabelKey({ prefixCode: row.prefixCode, payloadHex: row.payloadHex });
        encodeU1CurrentKey({ namespaceId: row.namespaceId, addressCodecId: row.addressCodecId, payloadHex: row.payloadHex });
      } catch {
        reason = "invalid_payload";
      }
    }

    if (reason) {
      conflicts.push({ ...row, reason, expectedNamespaceId: mapping?.namespaceId ?? null, expectedAddressCodecId: mapping?.addressCodecId ?? null });
    } else {
      compatible += 1;
    }
  }
  return { total: rows.length, compatible, conflicts };
}
