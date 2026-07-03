import { describe, expect, it } from "vitest";

import { MQCHAIN_ROLES } from "@/lib/mqchain/constants";
import {
  buildRolePermissionMatrix,
  createSettingsUserSchema,
  updateSettingsUserAccessSchema,
} from "@/lib/mqchain/validators/settings";

describe("settings validation", () => {
  it("normalizes new users and enforces production password length", () => {
    const parsed = createSettingsUserSchema.parse({
      email: " OWNER@MAMAKQUANT.LOCAL ",
      displayName: "  Owner  ",
      role: "owner",
      password: "change-me-now",
    });

    expect(parsed.email).toBe("owner@mamakquant.local");
    expect(parsed.displayName).toBe("Owner");
    expect(parsed.role).toBe("owner");
    expect(() => createSettingsUserSchema.parse({ email: "a@b.com", password: "short" })).toThrow();
  });

  it("parses form checkbox state for access updates", () => {
    expect(updateSettingsUserAccessSchema.parse({
      userId: "00000000-0000-0000-0000-000000000000",
      role: "readonly",
      isActive: "on",
    }).isActive).toBe(true);

    expect(updateSettingsUserAccessSchema.parse({
      userId: "00000000-0000-0000-0000-000000000000",
      role: "readonly",
      isActive: undefined,
    }).isActive).toBe(true);
  });

  it("builds a complete role-permission matrix", () => {
    const matrix = buildRolePermissionMatrix();
    expect(matrix.map((row) => row.role)).toEqual([...MQCHAIN_ROLES]);
    expect(matrix.find((row) => row.role === "admin")?.permissions.find((item) => item.permission === "registry:edit")?.allowed).toBe(true);
    expect(matrix.find((row) => row.role === "reviewer")?.permissions.find((item) => item.permission === "registry:edit")?.allowed).toBe(false);
    expect(matrix.find((row) => row.role === "owner")?.permissions.find((item) => item.permission === "settings:edit")?.allowed).toBe(true);
    expect(matrix.find((row) => row.role === "readonly")?.permissions.find((item) => item.permission === "settings:edit")?.allowed).toBe(false);
  });
});
