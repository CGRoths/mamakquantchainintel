import { describe, expect, it } from "vitest";

import { getMqchainKvArtifactRoot, getMqchainResolverBackend } from "@/lib/mqchain/runtime-env";

describe("MQCHAIN runtime env helpers", () => {
  it("defaults the resolver backend to postgres", () => {
    expect(getMqchainResolverBackend(undefined)).toBe("postgres");
    expect(getMqchainResolverBackend("")).toBe("postgres");
  });

  it("accepts only supported resolver backends", () => {
    expect(getMqchainResolverBackend("rocksdb")).toBe("rocksdb");
    expect(() => getMqchainResolverBackend("redis")).toThrow();
  });

  it("normalizes the KV artifact root", () => {
    expect(getMqchainKvArtifactRoot(undefined)).toBe("build/mqchain-kv");
    expect(getMqchainKvArtifactRoot(" D:/mqchain-artifacts/kv ")).toBe("D:/mqchain-artifacts/kv");
  });
});
