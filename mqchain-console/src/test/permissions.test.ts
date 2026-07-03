import { describe, expect, it } from "vitest";

import { canUseMqchainUser } from "@/lib/auth/permissions";
import { ROLE_PERMISSIONS } from "@/lib/mqchain/constants";

describe("role permissions", () => {
  it("allows operators and analysts to create discovery jobs", () => {
    expect(ROLE_PERMISSIONS.owner).toContain("discovery:create");
    expect(ROLE_PERMISSIONS.admin).toContain("discovery:create");
    expect(ROLE_PERMISSIONS.analyst).toContain("discovery:create");
  });

  it("keeps review-only and readonly roles out of discovery mutation paths", () => {
    expect(ROLE_PERMISSIONS.reviewer).not.toContain("discovery:create");
    expect(ROLE_PERMISSIONS.readonly).not.toContain("discovery:create");
  });

  it("allows intake only for operators and analysts", () => {
    expect(ROLE_PERMISSIONS.owner).toContain("intake:create");
    expect(ROLE_PERMISSIONS.admin).toContain("intake:create");
    expect(ROLE_PERMISSIONS.analyst).toContain("intake:create");
    expect(ROLE_PERMISSIONS.reviewer).not.toContain("intake:create");
    expect(ROLE_PERMISSIONS.readonly).not.toContain("intake:create");
  });

  it("keeps canonical registry edits limited to operators", () => {
    expect(ROLE_PERMISSIONS.owner).toContain("registry:edit");
    expect(ROLE_PERMISSIONS.admin).toContain("registry:edit");
    expect(ROLE_PERMISSIONS.reviewer).not.toContain("registry:edit");
    expect(ROLE_PERMISSIONS.analyst).not.toContain("registry:edit");
    expect(ROLE_PERMISSIONS.readonly).not.toContain("registry:edit");
  });

  it("still lets reviewers decide candidates without editing registry truth directly", () => {
    expect(ROLE_PERMISSIONS.reviewer).toContain("candidate:review");
    expect(ROLE_PERMISSIONS.reviewer).not.toContain("batch:commit");
    expect(ROLE_PERMISSIONS.reviewer).not.toContain("registry:edit");
  });

  it("requires active DB-backed users with view access for console sessions", () => {
    expect(canUseMqchainUser({ id: "user-1", role: "readonly", isActive: true })).toBe(true);
    expect(canUseMqchainUser({ id: "user-1", role: "readonly", isActive: false })).toBe(false);
    expect(canUseMqchainUser({ id: "user-1", role: "unknown", isActive: true })).toBe(false);
    expect(canUseMqchainUser({ id: null, role: "owner", isActive: true })).toBe(false);
  });
});
