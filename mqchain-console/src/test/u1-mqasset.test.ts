import { describe, expect, it } from "vitest";

import { normalizeAddress } from "@/lib/mqchain/address/normalize";
import { loadAndValidateU1Catalog } from "@/lib/mqchain/catalog/u1";
import {
  decodeU1NativeAssetKey,
  decodeU1NativeAssetValue,
  decodeU1TokenKey,
  decodeU1TokenValue,
  encodeU1NativeAssetKey,
  encodeU1NativeAssetValue,
  encodeU1TokenKey,
  encodeU1TokenValue,
} from "@/lib/mqchain/kv/u1";

describe("MQASSET U1 governed baseline", () => {
  it("contains BTC and ETH native namespace mappings", async () => {
    const catalog = await loadAndValidateU1Catalog();
    const mappings = catalog.rows.get("asset_namespaces.csv") ?? [];
    for (const expected of [{ assetId: 1, namespaceId: 1 }, { assetId: 2, namespaceId: 4 }]) {
      const row = mappings.find(item => Number(item.asset_id) === expected.assetId && Number(item.namespace_id) === expected.namespaceId);
      expect(row).toBeDefined();
      const key = encodeU1NativeAssetKey(expected.namespaceId);
      const value = encodeU1NativeAssetValue({ status: 1, qualityTier: 1, confidenceScore: 100, assetId: expected.assetId, standardId: 1, flags: 0 });
      expect(decodeU1NativeAssetKey(key)).toBe(expected.namespaceId);
      expect(decodeU1NativeAssetValue(value)).toMatchObject({ assetId: expected.assetId, standardId: 1 });
    }
  });

  it.each([
    ["Ethereum USDT", "0xdAC17F958D2ee523a2206206994597C13D831ec7", "ethereum", 3, 4, 1, 2],
    ["TRON USDT", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "tron", 3, 11, 21, 9],
    ["Solana USDC", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "solana", 4, 10, 20, 7],
  ])("normalizes and encodes %s", async (_name, address, chain, assetId, namespaceId, codecId, standardId) => {
    const catalog = await loadAndValidateU1Catalog();
    const normalized = normalizeAddress(address, chain);
    expect(normalized.isValid).toBe(true);
    const row = (catalog.rows.get("token_contracts.csv") ?? []).find(item => Number(item.asset_id) === assetId && Number(item.namespace_id) === namespaceId);
    expect(row?.normalized_payload_hex).toBe(normalized.payloadHex);

    const key = encodeU1TokenKey({ namespaceId, addressCodecId: codecId, payloadHex: normalized.payloadHex! });
    const value = encodeU1TokenValue({
      labelStatus: 1,
      qualityTier: 1,
      confidenceScore: 100,
      assetId,
      issuerEntityId: Number(row!.issuer_entity_id),
      standardId,
      decimals: 6,
      flags: 0,
      batchId: null,
      firstSeenHeight: null,
      lastSeenHeight: null,
    });
    expect(decodeU1TokenKey(key)).toEqual({ namespaceId, addressCodecId: codecId, payloadHex: normalized.payloadHex });
    expect(decodeU1TokenValue(value)).toMatchObject({ assetId, standardId, decimals: 6 });
  });
});
