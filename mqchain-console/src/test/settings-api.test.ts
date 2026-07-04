import { describe, expect, it } from "vitest";

import { buildSettingsAccessApiResponse, SETTINGS_ACCESS_API_CONTRACT } from "@/lib/mqchain/settings-api";

const createdAt = new Date("2026-07-04T02:00:00.000Z");
const updatedAt = new Date("2026-07-04T03:00:00.000Z");

describe("settings access API payloads", () => {
  it("exports RBAC state without password hashes or write permissions", () => {
    const payload = buildSettingsAccessApiResponse({
      currentUser: {
        id: "00000000-0000-0000-0000-000000000001",
        email: "owner@mamakquant.local",
        name: "Owner",
        role: "owner",
      },
      users: [
        {
          id: "00000000-0000-0000-0000-000000000001",
          email: "owner@mamakquant.local",
          displayName: "Owner",
          role: "owner",
          isActive: true,
          createdAt,
          updatedAt,
          hasPassword: true,
        },
        {
          id: "00000000-0000-0000-0000-000000000002",
          email: "reviewer@mamakquant.local",
          displayName: "Reviewer",
          role: "reviewer",
          isActive: true,
          createdAt,
          updatedAt,
          hasPassword: false,
        },
        {
          id: "00000000-0000-0000-0000-000000000003",
          email: "readonly@mamakquant.local",
          displayName: null,
          role: "readonly",
          isActive: false,
          createdAt,
          updatedAt,
          hasPassword: true,
        },
      ],
    });

    expect(payload).toMatchObject({
      ...SETTINGS_ACCESS_API_CONTRACT,
      mutationAllowed: false,
      settingsWriteAllowed: false,
      passwordHashIncluded: false,
      credentialMaterialIncluded: false,
      currentUser: {
        role: "owner",
        canManageAccess: true,
      },
      counts: {
        totalUsers: 3,
        activeUsers: 2,
        inactiveUsers: 1,
        activeOwners: 1,
        usersMissingPassword: 1,
      },
      users: [
        {
          email: "owner@mamakquant.local",
          role: "owner",
          isActive: true,
          hasPassword: true,
        },
        {
          email: "reviewer@mamakquant.local",
          role: "reviewer",
          isActive: true,
          hasPassword: false,
        },
        {
          email: "readonly@mamakquant.local",
          role: "readonly",
          isActive: false,
        },
      ],
      invariants: {
        atLeastOneActiveOwnerRequired: true,
        usersCannotDeactivateOwnAccount: true,
        settingsMutationsRequirePermission: "settings:edit",
        passwordHashesRedactedFromApi: true,
      },
      policy: {
        accessControlIsDbBacked: true,
        routeIsReadOnly: true,
        ownerOnlyMutationsUseServerActions: true,
        settingsMutationsAuditLogged: true,
        passwordHashesNeverReturned: true,
        readonlyRoleHasViewOnly: true,
      },
    });
    expect(payload.roles.find((role) => role.role === "reviewer")).toMatchObject({
      role: "reviewer",
      permissions: expect.arrayContaining(["view", "candidate:review", "source:verify"]),
      categories: {
        canReviewCandidates: true,
        canCommitBatches: false,
        canEditRegistry: false,
        canManageSettings: false,
      },
    });
    expect(payload.roles.find((role) => role.role === "readonly")).toMatchObject({
      role: "readonly",
      permissions: ["view"],
      categories: {
        canView: true,
        canCreateIntake: false,
        canReviewCandidates: false,
        canManageSettings: false,
      },
    });
    expect(payload.users[0]).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(payload)).not.toContain("bcrypt");
    expect(JSON.stringify(payload)).not.toContain("$2a$");
    expect(JSON.stringify(payload)).not.toContain("super-secret-password");
  });
});
