import { bytesToHex } from "./base58";
import { convertBits, decodeBech32 } from "./bech32";
import type { AddressCodec } from "./types";
import { acceptsIdentifierKind, unsupportedIdentifierKind } from "./types";

function createBitcoinSegwitCodec(code: string, witnessClass: "v0" | "v1plus"): AddressCodec {
  const codec: AddressCodec = {
    code,
    implementationVersion: "u1-btc-segwit-v1",
    supportedIdentifierKinds: Object.freeze(["wallet_address"]),
    normalize(rawValue, context) {
      if (!acceptsIdentifierKind(codec, context)) return unsupportedIdentifierKind(context.identifierKind);
      const value = rawValue.trim();
      const decoded = decodeBech32(value);
      if (!decoded || decoded.hrp !== "bc" || decoded.data.length < 1) return { ok: false, errorCode: "invalid_bech32_address" };

      const witnessVersion = decoded.data[0];
      const program = convertBits(decoded.data.slice(1), 5, 8, false);
      if (witnessVersion > 16) return { ok: false, errorCode: "invalid_witness_version" };
      if (!program || program.length < 2 || program.length > 40) return { ok: false, errorCode: "invalid_witness_program" };
      if (witnessVersion === 0 && decoded.encoding !== "bech32") return { ok: false, errorCode: "invalid_bech32_encoding" };
      if (witnessVersion > 0 && decoded.encoding !== "bech32m") return { ok: false, errorCode: "invalid_bech32_encoding" };
      if (witnessVersion === 0 && program.length !== 20 && program.length !== 32) return { ok: false, errorCode: "invalid_witness_program" };
      if (witnessClass === "v0" ? witnessVersion !== 0 : witnessVersion === 0) return { ok: false, errorCode: "unsupported_witness_version" };

      return {
        ok: true,
        canonicalText: value.toLowerCase(),
        payloadHex: bytesToHex(Uint8Array.from([witnessVersion, ...program])),
        addressFamily: witnessVersion === 0 ? "btc_bech32" : "btc_bech32m",
        metadata: { witnessVersion, encoding: decoded.encoding },
      };
    },
  };
  return Object.freeze(codec);
}

export const bitcoinBech32Codec = createBitcoinSegwitCodec("btc_bech32", "v0");
export const bitcoinBech32mCodec = createBitcoinSegwitCodec("btc_bech32m", "v1plus");
