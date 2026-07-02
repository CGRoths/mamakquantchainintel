import { describe, expect, it } from "vitest";

import { addSecondaryRoleToMetadata, parseSecondaryRoles } from "@/lib/mqchain/secondary-roles";

describe("registry secondary roles", () => {
  it("adds secondary role metadata without dropping existing metadata", () => {
    const metadata = addSecondaryRoleToMetadata(
      { source: "batch_commit" },
      {
        roleId: 42,
        roleCode: "protocol_vault",
        roleName: "Protocol vault",
        categoryId: 7,
        reason: "Vault also acts as asset container.",
        addedBy: "owner@mamakquant.local",
        addedAt: "2026-07-02T00:00:00.000Z",
      },
    );

    expect(metadata["source"]).toBe("batch_commit");
    expect(parseSecondaryRoles(metadata)).toEqual([
      {
        roleId: 42,
        roleCode: "protocol_vault",
        roleName: "Protocol vault",
        categoryId: 7,
        reason: "Vault also acts as asset container.",
        addedBy: "owner@mamakquant.local",
        addedAt: "2026-07-02T00:00:00.000Z",
      },
    ]);
  });

  it("rejects duplicate secondary role IDs", () => {
    const metadata = addSecondaryRoleToMetadata(null, {
      roleId: 42,
      roleCode: "protocol_vault",
      roleName: "Protocol vault",
      addedAt: "2026-07-02T00:00:00.000Z",
    });

    expect(() =>
      addSecondaryRoleToMetadata(metadata, {
        roleId: 42,
        roleCode: "protocol_pool",
        roleName: "Protocol pool",
      }),
    ).toThrow("already exists");
  });
});
