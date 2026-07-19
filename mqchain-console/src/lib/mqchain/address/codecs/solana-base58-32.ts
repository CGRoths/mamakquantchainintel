import { bytesToHex, decodeBase58 } from "./base58";
import type { AddressCodec } from "./types";
import { acceptsIdentifierKind, unsupportedIdentifierKind } from "./types";

const codec: AddressCodec = {
  code: "solana_base58_32",
  implementationVersion: "u1-solana-v1",
  supportedIdentifierKinds: Object.freeze(["wallet_or_public_key"]),
  normalize(rawValue, context) {
    if (!acceptsIdentifierKind(codec, context)) return unsupportedIdentifierKind(context.identifierKind);
    const canonicalText = rawValue.trim();
    const decoded = decodeBase58(canonicalText);
    if (!decoded) return { ok: false, errorCode: "invalid_base58" };
    if (decoded.length !== 32) return { ok: false, errorCode: "invalid_payload_length" };
    return { ok: true, canonicalText, payloadHex: bytesToHex(decoded), addressFamily: "solana32" };
  },
};

export const solanaBase58Codec = Object.freeze(codec);
