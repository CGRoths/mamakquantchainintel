import { bytesToHex, decodeBase58Check } from "./base58";
import type { AddressCodec } from "./types";
import { acceptsIdentifierKind, unsupportedIdentifierKind } from "./types";

const codec: AddressCodec = {
  code: "tron_base58check",
  implementationVersion: "u1-tron-v1",
  supportedIdentifierKinds: Object.freeze(["wallet_address"]),
  normalize(rawValue, context) {
    if (!acceptsIdentifierKind(codec, context)) return unsupportedIdentifierKind(context.identifierKind);
    const canonicalText = rawValue.trim();
    const payload = decodeBase58Check(canonicalText);
    if (!payload) return { ok: false, errorCode: "invalid_base58check" };
    if (payload.length !== 21) return { ok: false, errorCode: "invalid_payload_length" };
    if (payload[0] !== 0x41) return { ok: false, errorCode: "invalid_version_byte" };
    return { ok: true, canonicalText, payloadHex: bytesToHex(payload), addressFamily: "tron21" };
  },
};

export const tronBase58CheckCodec = Object.freeze(codec);
