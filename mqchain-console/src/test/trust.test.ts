import { describe, expect, it } from "vitest";

import { TRUST_TIERS } from "@/lib/mqchain/constants";
import { defaultEvidenceTrustTierForSource, normalizeEvidenceTrustTier } from "@/lib/mqchain/trust";
import { candidateEvidenceSchema } from "@/lib/mqchain/validators/evidence";
import { sourceVerificationSchema } from "@/lib/mqchain/validators/source-job";

describe("trust tier contract", () => {
  it("centralizes the supported evidence and source trust tiers", () => {
    expect(TRUST_TIERS).toEqual(["official", "verified_third_party", "inferred", "weak", "conflict"]);
    expect(candidateEvidenceSchema.parse({ candidateId: 1, evidenceType: "manual_note", summary: "checked" }).trustTier).toBe("weak");
    expect(
      sourceVerificationSchema.parse({
        sourceJobId: 1,
        sourceTrust: "verified_third_party",
      }).sourceTrust,
    ).toBe("verified_third_party");
  });

  it("normalizes unsupported source-provided trust to the safe fallback", () => {
    expect(normalizeEvidenceTrustTier("exchange_reported", "weak")).toBe("weak");
    expect(normalizeEvidenceTrustTier("official")).toBe("official");
  });

  it("uses source-type defaults without trusting arbitrary strings", () => {
    expect(defaultEvidenceTrustTierForSource("official_url")).toBe("official");
    expect(defaultEvidenceTrustTierForSource("github")).toBe("official");
    expect(defaultEvidenceTrustTierForSource("pdf")).toBe("verified_third_party");
    expect(defaultEvidenceTrustTierForSource("onchain_discovery")).toBe("inferred");
    expect(defaultEvidenceTrustTierForSource("csv_upload")).toBe("weak");
  });
});
