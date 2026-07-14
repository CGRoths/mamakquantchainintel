import { describe, expect, it } from "vitest";

import { normalizeAddress } from "@/lib/mqchain/address/normalize";
import { loadAndValidateU1Catalog } from "@/lib/mqchain/catalog/u1";

const CHAIN_HINT_BY_CODEC: Record<string, string> = {
  evm20_hex: "ethereum",
  btc_p2pkh_base58check: "btc",
  btc_p2sh_base58check: "btc",
  btc_bech32: "btc",
  btc_bech32m: "btc",
  solana_base58_32: "solana",
  tron_base58check: "tron",
};

describe("U1 test-ready codec vectors", () => {
  it("accepts every valid vector and rejects every invalid vector", async () => {
    const catalog = await loadAndValidateU1Catalog();
    const codecs = (catalog.rows.get("address_codecs.csv") ?? []).filter(row => row.status === "test_ready");
    expect(codecs).toHaveLength(7);
    for (const codec of codecs) {
      const chainHint = CHAIN_HINT_BY_CODEC[codec.codec_code];
      const valid = JSON.parse(codec.valid_test_vectors_json) as string[];
      const invalid = JSON.parse(codec.invalid_test_vectors_json) as string[];
      expect(valid.length, `${codec.codec_code} valid vectors`).toBeGreaterThan(0);
      expect(invalid.length, `${codec.codec_code} invalid vectors`).toBeGreaterThan(0);
      for (const vector of valid) {
        const normalized = normalizeAddress(vector, chainHint);
        expect(normalized.isValid, `${codec.codec_code} rejected ${vector}`).toBe(true);
        expect(normalized.addressCodecId).toBe(Number(codec.address_codec_id));
      }
      for (const vector of invalid) {
        expect(normalizeAddress(vector, chainHint).isValid, `${codec.codec_code} accepted ${vector}`).toBe(false);
      }
    }
  });
});
