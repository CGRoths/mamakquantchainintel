import { describe, expect, it } from "vitest";

import { QUALITY_TIER, QUALITY_TIER_MAX, QUALITY_TIER_MIN } from "@/lib/mqchain/constants";
import { approvalEditSchema } from "@/lib/mqchain/validators/approval";
import { discoveryResultRowSchema } from "@/lib/mqchain/validators/discovery";
import { manualIntakeSchema } from "@/lib/mqchain/validators/intake";
import { registryEditSchema } from "@/lib/mqchain/validators/registry";
import { roleSchema } from "@/lib/mqchain/validators/dictionary";

describe("quality tier contract", () => {
  it("matches the required 0 through 7 tier range", () => {
    expect(QUALITY_TIER_MIN).toBe(QUALITY_TIER.unknown);
    expect(QUALITY_TIER_MAX).toBe(QUALITY_TIER.conflictPending);
  });

  it("accepts tier 7 in operator mutation validators", () => {
    expect(
      manualIntakeSchema.parse({
        sourceName: "Manual source",
        addresses: "0x1111111111111111111111111111111111111111",
        qualityTier: "7",
      }).qualityTier,
    ).toBe(7);

    expect(
      approvalEditSchema.parse({
        candidateId: "1",
        entityId: "2",
        roleId: "1000",
        confidenceScore: "85",
        qualityTier: "7",
      }).qualityTier,
    ).toBe(7);

    expect(
      registryEditSchema.parse({
        registryId: "1",
        entityId: "2",
        roleId: "1000",
        confidenceScore: "85",
        qualityTier: "7",
      }).qualityTier,
    ).toBe(7);

    expect(
      discoveryResultRowSchema.parse({
        address: "0x1111111111111111111111111111111111111111",
        quality_tier: "7",
      }).quality_tier,
    ).toBe(7);

    expect(
      roleSchema.parse({
        roleId: "1000",
        roleCode: "cex_hot_wallet",
        roleName: "CEX Hot Wallet",
        defaultQualityTier: "7",
      }).defaultQualityTier,
    ).toBe(7);
  });

  it("rejects tiers outside the required range", () => {
    expect(() =>
      manualIntakeSchema.parse({
        sourceName: "Manual source",
        addresses: "0x1111111111111111111111111111111111111111",
        qualityTier: "8",
      }),
    ).toThrow();
    expect(() =>
      approvalEditSchema.parse({
        candidateId: "1",
        entityId: "2",
        roleId: "1000",
        confidenceScore: "85",
        qualityTier: "-1",
      }),
    ).toThrow();
  });
});
