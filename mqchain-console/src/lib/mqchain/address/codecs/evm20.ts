import type { AddressCodec } from "./types";
import { acceptsIdentifierKind, unsupportedIdentifierKind } from "./types";

const codec: AddressCodec = {
  code: "evm20_hex",
  implementationVersion: "u1-evm20-v1",
  supportedIdentifierKinds: Object.freeze(["wallet_address"]),
  normalize(rawValue, context) {
    if (!acceptsIdentifierKind(codec, context)) return unsupportedIdentifierKind(context.identifierKind);
    const value = rawValue.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(value)) return { ok: false, errorCode: "invalid_evm_address" };
    const canonicalText = value.toLowerCase();
    return {
      ok: true,
      canonicalText,
      payloadHex: canonicalText.slice(2),
      addressFamily: "evm20",
    };
  },
};

export const evm20Codec = Object.freeze(codec);
