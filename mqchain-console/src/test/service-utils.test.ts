import { describe, expect, it } from "vitest";

import { hashJson, stableJsonStringify } from "@/lib/mqchain/services/service-utils";

describe("service utility JSON hashing", () => {
  it("serializes nested object keys deterministically", () => {
    const left = {
      evidenceType: "official_page",
      payload: {
        source: { url: "https://example.com/proof", block: 120 },
        roles: ["cex_cold_wallet", "cex_reserve_wallet"],
      },
    };
    const right = {
      payload: {
        roles: ["cex_cold_wallet", "cex_reserve_wallet"],
        source: { block: 120, url: "https://example.com/proof" },
      },
      evidenceType: "official_page",
    };

    expect(stableJsonStringify(left)).toBe(stableJsonStringify(right));
    expect(hashJson(left)).toBe(hashJson(right));
  });

  it("hashes nested evidence payload changes distinctly", () => {
    const base = {
      candidateId: 11,
      payload: {
        source: {
          url: "https://example.com/proof",
          block: 120,
        },
      },
    };
    const changed = {
      candidateId: 11,
      payload: {
        source: {
          url: "https://example.com/proof",
          block: 121,
        },
      },
    };

    expect(hashJson(base)).not.toBe(hashJson(changed));
  });

  it("preserves array order for audit payloads", () => {
    expect(hashJson({ registryIds: [1, 2, 3] })).not.toBe(hashJson({ registryIds: [3, 2, 1] }));
  });

  it("rejects circular payloads", () => {
    const payload: { self?: unknown } = {};
    payload.self = payload;

    expect(() => hashJson(payload)).toThrow("circular JSON");
  });
});
