import { describe, expect, it } from "vitest";

import { normalizeAddress } from "@/lib/mqchain/address/normalize";
import goldenFixture from "@/test/fixtures/address-normalization-golden-v1.json";

type GoldenRecord = {
  caseName: string;
  rawInput: string;
  chainHint: string | null;
  isValid: boolean;
  error: string | null;
  chainCode: string | null;
  addressFamily: string | null;
  rawAddress: string;
  normalizedAddress: string;
  prefixCode: number | null;
  namespaceId: number | null;
  addressCodecId: number | null;
  payloadHex: string | null;
};

function toGoldenRecord(input: Pick<GoldenRecord, "caseName" | "rawInput" | "chainHint">): GoldenRecord {
  const result = normalizeAddress(input.rawInput, input.chainHint);
  return {
    caseName: input.caseName,
    rawInput: input.rawInput,
    chainHint: input.chainHint,
    isValid: result.isValid,
    error: result.error ?? null,
    chainCode: result.chainCode,
    addressFamily: result.addressFamily,
    rawAddress: result.rawAddress,
    normalizedAddress: result.normalizedAddress,
    prefixCode: result.prefixCode,
    namespaceId: result.namespaceId,
    addressCodecId: result.addressCodecId,
    payloadHex: result.payloadHex,
  };
}

describe("normalizeAddress", () => {
  it("matches the frozen pre-codec-platform golden fixture", () => {
    expect(goldenFixture.schemaVersion).toBe("MQCHAIN-NORMALIZATION-GOLDEN-1");
    expect(goldenFixture.generatedFrom).toBe("pre-codec-platform-normalizer");
    expect(goldenFixture.cases.map(testCase => toGoldenRecord(testCase as GoldenRecord))).toEqual(goldenFixture.cases);
  });

  it("normalizes EVM addresses", () => {
    const result = normalizeAddress("0x000000000000000000000000000000000000dEaD", "ethereum");

    expect(result.isValid).toBe(true);
    expect(result.chainCode).toBe("ethereum");
    expect(result.normalizedAddress).toBe("0x000000000000000000000000000000000000dead");
    expect(result.prefixCode).toBe(0x0101);
    expect(result.payloadHex).toBe("000000000000000000000000000000000000dead");
  });

  it.each([
    ["ethereum_mainnet", "ethereum", 4, 0x0101],
    ["base_mainnet", "base", 6, 0x0103],
    ["bnb_smart_chain_mainnet", "bsc", 9, 0x0106],
    ["polygon_pos_mainnet", "polygon", 5, 0x0102],
    ["arbitrum_one", "arbitrum", 7, 0x0104],
    ["op_mainnet", "optimism", 8, 0x0105],
    ["avalanche_c_chain", "avalanche", 12, null],
  ])("reuses EVM20 for %s", (hint, chainCode, namespaceId, prefixCode) => {
    const result = normalizeAddress("0x1111111111111111111111111111111111111111", hint);

    expect(result).toMatchObject({
      isValid: true,
      addressCodecId: 1,
      addressFamily: "evm20",
      chainCode,
      namespaceId,
      prefixCode,
    });
  });

  it("recognizes BTC bech32 addresses", () => {
    const result = normalizeAddress("BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4", "btc");

    expect(result.isValid).toBe(true);
    expect(result.chainCode).toBe("btc");
    expect(result.addressFamily).toBe("btc_bech32");
    expect(result.normalizedAddress).toBe("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");
    expect(result.prefixCode).toBe(0x0012);
    expect(result.payloadHex).toBe("00751e76e8199196d454941c45d1b3a323f1433bd6");
  });

  it("recognizes BTC bech32m witness addresses", () => {
    const result = normalizeAddress(
      "bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kt5nd6y",
      "btc",
    );

    expect(result.isValid).toBe(true);
    expect(result.chainCode).toBe("btc");
    expect(result.addressFamily).toBe("btc_bech32m");
    expect(result.prefixCode).toBe(0x0012);
    expect(result.namespaceId).toBe(47);
    expect(result.addressCodecId).toBe(13);
    expect(result.payloadHex).toBe(
      "01751e76e8199196d454941c45d1b3a323f1433bd6751e76e8199196d454941c45d1b3a323f1433bd6",
    );
  });

  it("recognizes BTC base58check families", () => {
    const p2pkh = normalizeAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "btc");
    const p2sh = normalizeAddress("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", "btc");

    expect(p2pkh.isValid).toBe(true);
    expect(p2pkh.addressFamily).toBe("btc_p2pkh");
    expect(p2pkh.prefixCode).toBe(0x0010);
    expect(p2pkh.payloadHex).toBe("0062e907b15cbf27d5425399ebf6f0fb50ebb88f18");

    expect(p2sh.isValid).toBe(true);
    expect(p2sh.addressFamily).toBe("btc_p2sh");
    expect(p2sh.prefixCode).toBe(0x0011);
    expect(p2sh.payloadHex).toBe("05b472a266d0bd89c13706a4132ccfb16f7c3b9fcb");
  });

  it("recognizes Solana and Tron base58 families", () => {
    const solana = normalizeAddress("11111111111111111111111111111111", "solana");
    const tron = normalizeAddress("TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj", "tron");

    expect(solana.isValid).toBe(true);
    expect(solana.addressFamily).toBe("solana32");
    expect(solana.prefixCode).toBe(0x0301);
    expect(solana.payloadHex).toBe("0000000000000000000000000000000000000000000000000000000000000000");

    expect(tron.isValid).toBe(true);
    expect(tron.addressFamily).toBe("tron21");
    expect(tron.prefixCode).toBe(0x0401);
    expect(tron.payloadHex).toBe("41ea51342dabbb928ae1e576bd39eff8aaf070a8c6");
  });

  it("rejects invalid BTC bech32 checksums and mixed case", () => {
    const invalidChecksum = normalizeAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080", "btc");
    const mixedCase = normalizeAddress("bc1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4", "btc");

    expect(invalidChecksum.isValid).toBe(false);
    expect(invalidChecksum.error).toBe("invalid_btc_address");
    expect(mixedCase.isValid).toBe(false);
    expect(mixedCase.error).toBe("invalid_btc_address");
  });

  it("does not throw on invalid input", () => {
    const result = normalizeAddress("not an address");

    expect(result.isValid).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
