import { and, desc, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mqApprovalEvents, mqAuditLog, mqUsers } from "@/db/schema";
import { buildAuditTimeline } from "../audit";
import { parseAuditListFilters, type AuditListFilters } from "../list-filters";

function addCondition(conditions: SQL[], condition: SQL | undefined) {
  if (condition) conditions.push(condition);
}

async function matchingActorIds(filters: AuditListFilters) {
  if (!filters.actor) return null;
  const actorRows = await getDb()
    .select({ id: mqUsers.id })
    .from(mqUsers)
    .where(or(ilike(mqUsers.email, `%${filters.actor}%`), ilike(mqUsers.displayName, `%${filters.actor}%`)));
  return actorRows.map((row) => row.id);
}

function approvalConditions(filters: AuditListFilters, actorIds: string[] | null) {
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqApprovalEvents.action, `%${filters.q}%`),
        ilike(mqApprovalEvents.reason, `%${filters.q}%`),
        sql`${mqApprovalEvents.candidateId}::text ilike ${`%${filters.q}%`}`,
        sql`${mqApprovalEvents.registryId}::text ilike ${`%${filters.q}%`}`,
        sql`${mqApprovalEvents.batchId}::text ilike ${`%${filters.q}%`}`,
        sql`${mqApprovalEvents.metadata}::text ilike ${`%${filters.q}%`}`,
      ),
    );
  }

  if (filters.action) conditions.push(ilike(mqApprovalEvents.action, `%${filters.action}%`));
  if (filters.target) {
    addCondition(
      conditions,
      or(
        sql`${mqApprovalEvents.candidateId}::text ilike ${`%${filters.target}%`}`,
        sql`${mqApprovalEvents.registryId}::text ilike ${`%${filters.target}%`}`,
        sql`${mqApprovalEvents.batchId}::text ilike ${`%${filters.target}%`}`,
      ),
    );
  }
  if (actorIds) conditions.push(actorIds.length ? inArray(mqApprovalEvents.actorId, actorIds) : sql`false`);

  return conditions.length ? and(...conditions) : sql`true`;
}

function systemConditions(filters: AuditListFilters, actorIds: string[] | null) {
  const conditions: SQL[] = [];

  if (filters.q) {
    addCondition(
      conditions,
      or(
        ilike(mqAuditLog.action, `%${filters.q}%`),
        ilike(mqAuditLog.targetTable, `%${filters.q}%`),
        ilike(mqAuditLog.targetId, `%${filters.q}%`),
        sql`${mqAuditLog.payload}::text ilike ${`%${filters.q}%`}`,
      ),
    );
  }

  if (filters.action) conditions.push(ilike(mqAuditLog.action, `%${filters.action}%`));
  if (filters.target) {
    addCondition(
      conditions,
      or(ilike(mqAuditLog.targetTable, `%${filters.target}%`), ilike(mqAuditLog.targetId, `%${filters.target}%`)),
    );
  }
  if (actorIds) conditions.push(actorIds.length ? inArray(mqAuditLog.actorId, actorIds) : sql`false`);

  return conditions.length ? and(...conditions) : sql`true`;
}

export async function listAuditLog(input: unknown = {}) {
  const filters = typeof input === "number" ? parseAuditListFilters({ pageSize: input }) : parseAuditListFilters(input);
  return getDb().select().from(mqAuditLog).where(systemConditions(filters, await matchingActorIds(filters))).orderBy(desc(mqAuditLog.createdAt)).limit(filters.pageSize);
}

export async function listAuditTimeline(input: unknown = {}) {
  const filters = typeof input === "number" ? parseAuditListFilters({ pageSize: input }) : parseAuditListFilters(input);
  const db = getDb();
  const actorIds = await matchingActorIds(filters);
  const approvalWhere = approvalConditions(filters, actorIds);
  const systemWhere = systemConditions(filters, actorIds);
  const shouldReadApproval = filters.source !== "system";
  const shouldReadSystem = filters.source !== "approval";
  const readLimit = filters.page * filters.pageSize;

  const [approvalCountRows, systemCountRows, approvalEvents, auditRows] = await Promise.all([
    shouldReadApproval
      ? db.select({ total: sql<number>`count(*)::int` }).from(mqApprovalEvents).where(approvalWhere)
      : Promise.resolve([{ total: 0 }]),
    shouldReadSystem ? db.select({ total: sql<number>`count(*)::int` }).from(mqAuditLog).where(systemWhere) : Promise.resolve([{ total: 0 }]),
    shouldReadApproval
      ? db.select().from(mqApprovalEvents).where(approvalWhere).orderBy(desc(mqApprovalEvents.createdAt)).limit(readLimit)
      : Promise.resolve([]),
    shouldReadSystem
      ? db.select().from(mqAuditLog).where(systemWhere).orderBy(desc(mqAuditLog.createdAt)).limit(readLimit)
      : Promise.resolve([]),
  ]);
  const eventActorIds = Array.from(
    new Set(
      [...approvalEvents.map((event) => event.actorId), ...auditRows.map((row) => row.actorId)].filter(
        (actorId): actorId is string => Boolean(actorId),
      ),
    ),
  );
  const users = eventActorIds.length
    ? await db
        .select({
          id: mqUsers.id,
          email: mqUsers.email,
          displayName: mqUsers.displayName,
        })
        .from(mqUsers)
        .where(inArray(mqUsers.id, eventActorIds))
    : [];
  const actorById = new Map(users.map((user) => [user.id, user.displayName || user.email]));

  const merged = buildAuditTimeline(
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
    readLimit,
  );
  const offset = (filters.page - 1) * filters.pageSize;
  const total = approvalCountRows[0].total + systemCountRows[0].total;

  return {
    rows: merged.slice(offset, offset + filters.pageSize),
    filters,
    total,
    approvalTotal: approvalCountRows[0].total,
    systemTotal: systemCountRows[0].total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    approvalEvents,
    auditRows,
  };
}
