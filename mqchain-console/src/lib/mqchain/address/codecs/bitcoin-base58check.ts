import { bytesToHex, decodeBase58Check } from "./base58";
import type { AddressCodec } from "./types";
import { acceptsIdentifierKind, unsupportedIdentifierKind } from "./types";

function createBitcoinBase58CheckCodec(code: string, addressFamily: string, version: number): AddressCodec {
  const codec: AddressCodec = {
    code,
    implementationVersion: "u1-btc-base58-v1",
    supportedIdentifierKinds: Object.freeze(["wallet_address"]),
    normalize(rawValue, context) {
      if (!acceptsIdentifierKind(codec, context)) return unsupportedIdentifierKind(context.identifierKind);
      const canonicalText = rawValue.trim();
      const payload = decodeBase58Check(canonicalText);
      if (!payload) return { ok: false, errorCode: "invalid_base58check" };
      if (payload.length !== 21) return { ok: false, errorCode: "invalid_payload_length" };
      if (payload[0] !== version) return { ok: false, errorCode: "invalid_version_byte" };
      return { ok: true, canonicalText, payloadHex: bytesToHex(payload), addressFamily };
    },
  };
  return Object.freeze(codec);
}

export const bitcoinP2pkhCodec = createBitcoinBase58CheckCodec("btc_p2pkh_base58check", "btc_p2pkh", 0x00);
export const bitcoinP2shCodec = createBitcoinBase58CheckCodec("btc_p2sh_base58check", "btc_p2sh", 0x05);
