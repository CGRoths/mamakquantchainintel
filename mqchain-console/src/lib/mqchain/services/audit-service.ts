import { desc, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mqApprovalEvents, mqAuditLog, mqUsers } from "@/db/schema";
import { buildAuditTimeline } from "../audit";

export async function listAuditLog(limit = 200) {
  return getDb().select().from(mqAuditLog).orderBy(desc(mqAuditLog.createdAt)).limit(limit);
}

export async function listAuditTimeline(limit = 200) {
  const db = getDb();
  const [approvalEvents, auditRows] = await Promise.all([
    db.select().from(mqApprovalEvents).orderBy(desc(mqApprovalEvents.createdAt)).limit(limit),
    db.select().from(mqAuditLog).orderBy(desc(mqAuditLog.createdAt)).limit(limit),
  ]);
  const actorIds = Array.from(
    new Set(
      [...approvalEvents.map((event) => event.actorId), ...auditRows.map((row) => row.actorId)].filter(
        (actorId): actorId is string => Boolean(actorId),
      ),
    ),
  );
  const users = actorIds.length
    ? await db
        .select({
          id: mqUsers.id,
          email: mqUsers.email,
          displayName: mqUsers.displayName,
        })
        .from(mqUsers)
        .where(inArray(mqUsers.id, actorIds))
    : [];
  const actorById = new Map(users.map((user) => [user.id, user.displayName || user.email]));

  return buildAuditTimeline(
    [
      ...approvalEvents.map((event) => ({
        id: event.id,
        source: "approval" as const,
        action: event.action,
        actorId: event.actorId,
        actorLabel: event.actorId ? actorById.get(event.actorId) : null,
        candidateId: event.candidateId,
        registryId: event.registryId,
        batchId: event.batchId,
        reason: event.reason,
        createdAt: event.createdAt,
      })),
      ...auditRows.map((row) => ({
        id: row.id,
        source: "system" as const,
        action: row.action,
        actorId: row.actorId,
        actorLabel: row.actorId ? actorById.get(row.actorId) : null,
        targetTable: row.targetTable,
        targetId: row.targetId,
        createdAt: row.createdAt,
      })),
    ],
    limit,
  );
}
