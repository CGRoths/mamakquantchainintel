import { describe, expect, it } from "vitest";

import {
  entityUpdateSchema,
  keyPrefixUpdateSchema,
  roleUpdateSchema,
} from "@/lib/mqchain/validators/dictionary";

describe("dictionary update validators", () => {
  it("parses editable entity rows with explicit active state", () => {
    const parsed = entityUpdateSchema.parse({
      id: "7",
      entityCode: "binance",
      entityName: "Binance",
      entityType: "cex",
      categoryId: "",
      websiteUrl: "",
      description: "",
      isActive: false,
    });

    expect(parsed).toMatchObject({
      id: 7,
      entityCode: "binance",
      categoryId: "",
      isActive: false,
    });
  });

  it("preserves an explicit zero flag value for role edits", () => {
    const parsed = roleUpdateSchema.parse({
      roleId: "1010",
      roleCode: "cex_cold_wallet",
      roleName: "CEX Cold Wallet",
      categoryId: "",
      roleGroup: "cex",
      metricUsageDefault: "cex_flow",
      boundaryClass: "reserve_boundary",
      defaultQualityTier: "4",
      defaultFlags: "0",
      description: "",
      isActive: true,
    });

    expect(parsed.defaultFlags).toBe(0);
    expect(parsed.isActive).toBe(true);
  });

  it("coerces key prefix numeric fields for updates", () => {
    const parsed = keyPrefixUpdateSchema.parse({
      prefixCode: "257",
      chainCode: "ethereum",
      chainName: "Ethereum",
      chainFamily: "evm",
      addressFamily: "evm20",
      codec: "hex",
      payloadLen: "20",
      evmChainId: "1",
      description: "",
      isActive: true,
    });

    expect(parsed).toMatchObject({
      prefixCode: 257,
      payloadLen: 20,
      evmChainId: 1,
      isActive: true,
    });
  });
});
