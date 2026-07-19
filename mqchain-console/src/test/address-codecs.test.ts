import { describe, expect, it } from "vitest";

import {
  codecRegistry,
  createCodecRegistry,
  evm20Codec,
  REGISTERED_ADDRESS_CODECS,
} from "@/lib/mqchain/address/codecs";

const validInputs: Record<string, string> = {
  evm20_hex: "0x000000000000000000000000000000000000dEaD",
  btc_p2pkh_base58check: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  btc_p2sh_base58check: "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
  btc_bech32: "BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4",
  btc_bech32m: "bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kt5nd6y",
  solana_base58_32: "11111111111111111111111111111111",
  tron_base58check: "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj",
};

function contextFor(code: string) {
  return Object.freeze({
    parameters: Object.freeze({}),
    identifierKind: code === "solana_base58_32" ? "wallet_or_public_key" : "wallet_address",
  });
}

describe("address codecs", () => {
  it("registers the exact existing runtime codec inventory deterministically", () => {
    expect(codecRegistry.listRegisteredCodecs().map(codec => codec.code)).toEqual([
      "btc_bech32",
      "btc_bech32m",
      "btc_p2pkh_base58check",
      "btc_p2sh_base58check",
      "evm20_hex",
      "solana_base58_32",
      "tron_base58check",
    ]);
    expect(Object.isFrozen(REGISTERED_ADDRESS_CODECS)).toBe(true);
    expect(Object.isFrozen(codecRegistry.listRegisteredCodecs())).toBe(true);
  });

  it.each(REGISTERED_ADDRESS_CODECS)("normalizes deterministically with valid payload hex: $code", codec => {
    const input = validInputs[codec.code];
    const context = contextFor(codec.code);
    const first = codec.normalize(input, context);
    const second = codec.normalize(input, context);

    expect(first).toEqual(second);
    expect(input).toBe(validInputs[codec.code]);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.payloadHex).toMatch(/^(?:[0-9a-f]{2})+$/);
    expect(first.canonicalText).toBe(first.canonicalText.trim());
  });

  it("keeps EVM parsing independent from network identity", () => {
    const result = evm20Codec.normalize(validInputs.evm20_hex, contextFor("evm20_hex"));
    expect(result).toEqual({
      ok: true,
      canonicalText: "0x000000000000000000000000000000000000dead",
      payloadHex: "000000000000000000000000000000000000dead",
      addressFamily: "evm20",
    });
    expect(result).not.toHaveProperty("chainCode");
    expect(result).not.toHaveProperty("namespaceId");
    expect(result).not.toHaveProperty("prefixCode");
    expect(result).not.toHaveProperty("addressCodecId");
  });

  it.each(REGISTERED_ADDRESS_CODECS)("returns a stable identifier-kind failure: $code", codec => {
    expect(codec.normalize(validInputs[codec.code], { parameters: {}, identifierKind: "consensus_identifier" })).toEqual({
      ok: false,
      errorCode: "unsupported_identifier_kind",
      metadata: { identifierKind: "consensus_identifier" },
    });
  });

  it("returns stable ordinary-input failures without throwing", () => {
    for (const codec of REGISTERED_ADDRESS_CODECS) {
      const result = codec.normalize("not an address", contextFor(codec.code));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errorCode).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

describe("codec registry", () => {
  it("supports isolated lookup and rejects duplicate codes", () => {
    const isolated = createCodecRegistry([evm20Codec]);
    expect(isolated.hasCodec("evm20_hex")).toBe(true);
    expect(isolated.getCodec("evm20_hex")).toBe(evm20Codec);
    expect(isolated.getCodec("missing")).toBeUndefined();
    expect(() => isolated.requireCodec("missing")).toThrow("codec_not_registered:missing");
    expect(() => createCodecRegistry([evm20Codec, evm20Codec])).toThrow("duplicate_codec_code:evm20_hex");
  });
});
