import { getServerSession } from "next-auth";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mqUsers } from "@/db/schema";
import { authOptions } from "./options";
import { ROLE_PERMISSIONS, type MqUserRole } from "../mqchain/constants";

export function canUseMqchainUser(user: { id?: string | null; role?: string | null; isActive?: boolean | null } | null | undefined) {
  return Boolean(user?.id && user.isActive && roleCan(user.role, "view"));
}

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return null;
  }

  const [user] = await getDb().select().from(mqUsers).where(eq(mqUsers.id, session.user.id)).limit(1);
  if (!canUseMqchainUser(user)) {
    return null;
  }

  return {
    ...session.user,
    id: user.id,
    email: user.email,
    name: user.displayName ?? user.email,
    role: user.role,
  };
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
