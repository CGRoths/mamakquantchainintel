import { describe, expect, it } from "vitest";

import {
  describeRegistryCommitTarget,
  findRegistryCommitConflict,
  registryCommitFingerprint,
  registryTargetsConflict,
  type RegistryCommitTarget,
} from "@/lib/mqchain/registry-conflicts";

function target(overrides: Partial<RegistryCommitTarget> = {}): RegistryCommitTarget {
  return {
    id: 1,
    candidateId: 10,
    chainCode: "btc",
    normalizedAddress: "bc1qexample",
    roleId: 1001,
    validFromBlock: null,
    isActive: true,
    ...overrides,
  };
}

describe("registry commit conflict helpers", () => {
  it("treats null valid-from active rows as the same commit target", () => {
    expect(registryTargetsConflict(target({ id: 1 }), target({ id: 2, candidateId: 11 }))).toBe(true);
  });

  it("allows distinct timeline starts for the same chain address and role", () => {
    expect(registryTargetsConflict(target({ validFromBlock: 100 }), target({ id: 2, validFromBlock: 200 }))).toBe(false);
  });

  it("ignores inactive historical targets when checking active registry duplicates", () => {
    expect(findRegistryCommitConflict([target({ id: 1 })], target({ id: 2, isActive: false }))).toBeNull();
  });

  it("allows the explicitly superseded row but still blocks other active duplicates", () => {
    const conflict = findRegistryCommitConflict(
      [target({ id: 1 }), target({ id: 2 })],
      target({ id: null, candidateId: 12 }),
      1,
    );

    expect(conflict?.id).toBe(2);
  });

  it("builds stable operator-facing target descriptions", () => {
    const row = target({ chainCode: "BTC", normalizedAddress: "BC1QEXAMPLE", roleId: 1002, validFromBlock: null });

    expect(registryCommitFingerprint(row)).toBe("btc:bc1qexample:1002:unknown_from");
    expect(describeRegistryCommitTarget(row)).toBe("BTC:BC1QEXAMPLE:role=1002:valid_from=unknown");
  });
});
