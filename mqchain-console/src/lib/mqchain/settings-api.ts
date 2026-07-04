import { roleCan } from "@/lib/auth/permissions";

import { MQCHAIN_ROLES, ROLE_PERMISSIONS, type MqUserRole } from "./constants";
import type { SettingsUser } from "./services/settings-service";
import { buildRolePermissionMatrix, SETTINGS_PERMISSION_LABELS } from "./validators/settings";

export const SETTINGS_ACCESS_API_CONTRACT = {
  apiVersion: "mqchain-settings-access-api-v1",
  sourceOfTruth: "postgres_access_control",
  servingBackend: "postgres",
  artifactType: "settings_access_export",
  mutationAllowed: false,
  settingsWriteAllowed: false,
  passwordHashIncluded: false,
  credentialMaterialIncluded: false,
  postgresIsCanonicalTruth: true,
} as const;

export type SettingsAccessApiInput = {
  currentUser: {
    id: string;
    email?: string | null;
    name?: string | null;
    role?: string | null;
  } | null;
  users: SettingsUser[];
};

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function permissionCategories(role: MqUserRole) {
  const permissions = new Set(ROLE_PERMISSIONS[role]);

  return {
    canView: permissions.has("view"),
    canCreateIntake: permissions.has("intake:create"),
    canCreateDiscovery: permissions.has("discovery:create"),
    canReviewCandidates: permissions.has("candidate:review"),
    canVerifySources: permissions.has("source:verify"),
    canCommitBatches: permissions.has("batch:commit"),
    canEditRegistry: permissions.has("registry:edit"),
    canEditDictionaries: permissions.has("dictionary:edit"),
    canManageSettings: permissions.has("settings:edit"),
  };
}

function serializeUser(user: SettingsUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    hasPassword: user.hasPassword,
    createdAt: isoDate(user.createdAt),
    updatedAt: isoDate(user.updatedAt),
  };
}

export function buildSettingsAccessApiResponse(input: SettingsAccessApiInput) {
  const activeUsers = input.users.filter((user) => user.isActive);
  const activeOwners = activeUsers.filter((user) => user.role === "owner");

  return {
    ...SETTINGS_ACCESS_API_CONTRACT,
    currentUser: input.currentUser
      ? {
          id: input.currentUser.id,
          email: input.currentUser.email ?? null,
          name: input.currentUser.name ?? null,
          role: input.currentUser.role ?? null,
          canManageAccess: roleCan(input.currentUser.role, "settings:edit"),
        }
      : null,
    users: input.users.map(serializeUser),
    counts: {
      totalUsers: input.users.length,
      activeUsers: activeUsers.length,
      inactiveUsers: input.users.length - activeUsers.length,
      activeOwners: activeOwners.length,
      usersMissingPassword: input.users.filter((user) => !user.hasPassword).length,
    },
    roles: MQCHAIN_ROLES.map((role) => ({
      role,
      permissions: ROLE_PERMISSIONS[role],
      categories: permissionCategories(role),
    })),
    permissionLabels: SETTINGS_PERMISSION_LABELS,
    permissionMatrix: buildRolePermissionMatrix(),
    invariants: {
      atLeastOneActiveOwnerRequired: true,
      usersCannotDeactivateOwnAccount: true,
      settingsMutationsRequirePermission: "settings:edit",
      passwordsStoredAsHashesOnly: true,
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
  };
}
