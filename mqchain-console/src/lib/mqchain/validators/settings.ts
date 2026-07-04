import { z } from "zod";

import { MQCHAIN_ROLES, ROLE_PERMISSIONS, type MqUserRole } from "../constants";

function optionalText() {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().optional(),
  );
}

function checkbox(defaultValue = false) {
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return defaultValue;
    if (value === true || value === "true" || value === "on" || value === "1") return true;
    return false;
  }, z.boolean());
}

export const roleSchema = z.enum(MQCHAIN_ROLES);

export const createSettingsUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: optionalText(),
  role: roleSchema.default("analyst"),
  password: z.string().min(12, "Password must be at least 12 characters."),
});

export const updateSettingsUserAccessSchema = z.object({
  userId: z.string().uuid(),
  role: roleSchema,
  isActive: checkbox(true),
});

export type CreateSettingsUserInput = z.infer<typeof createSettingsUserSchema>;
export type UpdateSettingsUserAccessInput = z.infer<typeof updateSettingsUserAccessSchema>;

export const SETTINGS_PERMISSION_LABELS = [
  { permission: "view", label: "View console" },
  { permission: "intake:create", label: "Create intake" },
  { permission: "candidate:propose", label: "Propose labels" },
  { permission: "candidate:evidence", label: "Add evidence" },
  { permission: "source:verify", label: "Verify sources" },
  { permission: "candidate:review", label: "Review candidates" },
  { permission: "batch:commit", label: "Commit batches" },
  { permission: "registry:edit", label: "Edit registry" },
  { permission: "dictionary:edit", label: "Edit dictionaries" },
  { permission: "discovery:create", label: "Create discovery" },
  { permission: "settings:edit", label: "Manage access" },
] as const;

export function buildRolePermissionMatrix() {
  return MQCHAIN_ROLES.map((role) => ({
    role,
    permissions: SETTINGS_PERMISSION_LABELS.map(({ permission, label }) => ({
      permission,
      label,
      allowed: ROLE_PERMISSIONS[role as MqUserRole].includes(permission),
    })),
  }));
}
