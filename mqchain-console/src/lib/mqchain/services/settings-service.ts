import { and, desc, eq } from "drizzle-orm";
import { hash } from "bcryptjs";

import { getDb } from "@/db/client";
import { mqAuditLog, mqUsers, type MqUser } from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";

import {
  createSettingsUserSchema,
  updateSettingsUserAccessSchema,
} from "../validators/settings";

export type SettingsUser = Omit<MqUser, "passwordHash"> & {
  hasPassword: boolean;
};

function sanitizeUser(user: MqUser): SettingsUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  void _passwordHash;
  return {
    ...rest,
    hasPassword: Boolean(user.passwordHash),
  };
}

function auditPayload(user: SettingsUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    hasPassword: user.hasPassword,
  };
}

export async function listSettingsUsers() {
  const rows = await getDb().select().from(mqUsers).orderBy(desc(mqUsers.createdAt));
  return rows.map(sanitizeUser);
}

export async function createSettingsUser(input: unknown) {
  const actor = await assertPermission("settings:edit");
  const parsed = createSettingsUserSchema.parse(input);
  const passwordHash = await hash(parsed.password, 12);
  const db = getDb();

  const [user] = await db
    .insert(mqUsers)
    .values({
      email: parsed.email,
      displayName: parsed.displayName,
      role: parsed.role,
      passwordHash,
      isActive: true,
    })
    .returning();

  if (!user) {
    throw new Error("User creation failed.");
  }

  const sanitized = sanitizeUser(user);
  await db.insert(mqAuditLog).values({
    actorId: actor.id,
    action: "user_created",
    targetTable: "mq_users",
    targetId: sanitized.id,
    payload: {
      user: auditPayload(sanitized),
    },
  });

  return sanitized;
}

async function assertOwnerAccessInvariant(target: MqUser, nextRole: string, nextIsActive: boolean) {
  if (target.role !== "owner" || !target.isActive || (nextRole === "owner" && nextIsActive)) {
    return;
  }

  const activeOwners = await getDb()
    .select({ id: mqUsers.id })
    .from(mqUsers)
    .where(and(eq(mqUsers.role, "owner"), eq(mqUsers.isActive, true)));

  if (activeOwners.length <= 1) {
    throw new Error("At least one active owner account is required.");
  }
}

export async function updateSettingsUserAccess(input: unknown) {
  const actor = await assertPermission("settings:edit");
  const parsed = updateSettingsUserAccessSchema.parse(input);
  const db = getDb();

  const [existing] = await db.select().from(mqUsers).where(eq(mqUsers.id, parsed.userId)).limit(1);
  if (!existing) {
    throw new Error("User not found.");
  }

  if (existing.id === actor.id && !parsed.isActive) {
    throw new Error("You cannot deactivate your own account.");
  }

  await assertOwnerAccessInvariant(existing, parsed.role, parsed.isActive);

  const [updated] = await db
    .update(mqUsers)
    .set({
      role: parsed.role,
      isActive: parsed.isActive,
      updatedAt: new Date(),
    })
    .where(eq(mqUsers.id, parsed.userId))
    .returning();

  if (!updated) {
    throw new Error("User update failed.");
  }

  const sanitizedBefore = sanitizeUser(existing);
  const sanitizedAfter = sanitizeUser(updated);
  await db.insert(mqAuditLog).values({
    actorId: actor.id,
    action: "user_access_updated",
    targetTable: "mq_users",
    targetId: sanitizedAfter.id,
    payload: {
      before: auditPayload(sanitizedBefore),
      after: auditPayload(sanitizedAfter),
    },
  });

  return sanitizedAfter;
}
