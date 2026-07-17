import { getServerSession } from "next-auth";

import { authOptions } from "./options";
import {
  ROLE_PERMISSIONS,
  type MqUserRole,
} from "../mqchain/constants";

type MqchainUserAccessInput = {
  id?: string | null;
  role?: string | null;
  isActive?: boolean | null;
};

export function roleCan(
  role: string | undefined | null,
  permission: string,
) {
  if (!role) {
    return false;
  }

  const permissions =
    ROLE_PERMISSIONS[role as MqUserRole] ?? [];

  return permissions.includes(permission);
}

export function canUseMqchainUser(
  user: MqchainUserAccessInput | null | undefined,
) {
  return Boolean(
    user?.id &&
      user.isActive &&
      roleCan(user.role, "view"),
  );
}

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  /*
   * The MQCHAIN Origin authenticates only active users before
   * NextAuth creates this signed session.
   */
  if (
    !canUseMqchainUser({
      id: user?.id,
      role: user?.role,
      isActive: true,
    }) ||
    !user?.email
  ) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? user.email,
    role: user.role,
  };
}

export async function assertPermission(
  permission: string,
) {
  const user = await getCurrentUser();

  if (
    !user?.id ||
    !roleCan(user.role, permission)
  ) {
    throw new Error(
      "You do not have permission to perform this action.",
    );
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
