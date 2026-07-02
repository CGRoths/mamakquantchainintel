import { getServerSession } from "next-auth";

import { authOptions } from "./options";
import { ROLE_PERMISSIONS, type MqUserRole } from "../mqchain/constants";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

export function roleCan(role: string | undefined | null, permission: string) {
  if (!role) {
    return false;
  }

  const permissions = ROLE_PERMISSIONS[role as MqUserRole] ?? [];
  return permissions.includes(permission);
}

export async function assertPermission(permission: string) {
  const user = await getCurrentUser();

  if (!user?.id || !roleCan(user.role, permission)) {
    throw new Error("You do not have permission to perform this action.");
  }

  return user;
}

export async function requireSignedIn() {
  const user = await getCurrentUser();

  if (!user?.id) {
    throw new Error("Authentication required.");
  }

  return user;
}
