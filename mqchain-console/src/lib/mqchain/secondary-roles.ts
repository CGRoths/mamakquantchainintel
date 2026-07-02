export type RegistrySecondaryRole = {
  roleId: number;
  roleCode: string;
  roleName: string;
  categoryId?: number | null;
  reason?: string;
  addedBy?: string | null;
  addedAt: string;
};

type MetadataWithSecondaryRoles = Record<string, unknown> & {
  secondaryRoles?: unknown;
};

export function parseSecondaryRoles(metadata?: Record<string, unknown> | null): RegistrySecondaryRole[] {
  const raw = (metadata as MetadataWithSecondaryRoles | null | undefined)?.secondaryRoles;
  if (!Array.isArray(raw)) {
    return [];
  }

  const roles: RegistrySecondaryRole[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const roleId = Number(record.roleId);
    if (!Number.isInteger(roleId) || roleId <= 0) {
      continue;
    }

    roles.push({
      roleId,
      roleCode: String(record.roleCode ?? ""),
      roleName: String(record.roleName ?? record.roleCode ?? ""),
      categoryId: typeof record.categoryId === "number" ? record.categoryId : null,
      reason: typeof record.reason === "string" ? record.reason : undefined,
      addedBy: typeof record.addedBy === "string" ? record.addedBy : null,
      addedAt: typeof record.addedAt === "string" ? record.addedAt : new Date(0).toISOString(),
    });
  }

  return roles;
}

export function addSecondaryRoleToMetadata(
  metadata: Record<string, unknown> | null | undefined,
  role: Omit<RegistrySecondaryRole, "addedAt"> & { addedAt?: string },
): Record<string, unknown> & { secondaryRoles: RegistrySecondaryRole[] } {
  const existing = parseSecondaryRoles(metadata);
  if (existing.some((item) => item.roleId === role.roleId)) {
    throw new Error("Secondary role already exists on this registry label.");
  }

  const secondaryRole: RegistrySecondaryRole = {
    ...role,
    addedAt: role.addedAt ?? new Date().toISOString(),
  };

  return {
    ...(metadata ?? {}),
    secondaryRoles: [...existing, secondaryRole],
  };
}
