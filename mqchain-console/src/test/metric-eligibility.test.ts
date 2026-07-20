import { describe, expect, it } from "vitest";

import { validateMetricEligibility } from "@/lib/mqchain/metric-eligibility";

const eligible = {
  requested: true,
  roleCode: "cex_hot_wallet",
  roleMetricUsageDefault: "eligible",
  confidenceScore: 90,
  labelStatus: 1,
  identifierKind: "wallet_address",
  sourceVerificationSatisfied: true,
  matchingTrustTiers: ["official"],
} as const;

describe("metric eligibility policy", () => {
  it("allows a verified high-confidence CEX wallet role", () => expect(validateMetricEligibility(eligible).eligible).toBe(true));
  it.each([
    ["unresolved role", { roleCode: null }],
    ["validator key", { identifierKind: "validator_public_key" }],
    ["reference role", { roleCode: "cex_wallet_reference" }],
    ["unverified source", { sourceVerificationSatisfied: false }],
    ["weak trust", { matchingTrustTiers: ["weak"] }],
  ])("blocks %s", (_name, patch) => expect(validateMetricEligibility({ ...eligible, ...patch }).eligible).toBe(false));
});
