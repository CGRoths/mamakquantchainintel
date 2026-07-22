import { desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mqAuditLog, mqKvBuilds, mqKvCompiledEntries, mqKvValidationRuns } from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";

import { CompiledArtifactError } from "./compiled-artifact-service";
import { hashJson } from "./service-utils";

type RetentionBuild = Readonly<{ id: number; status: string; activatedAt: Date | null }>;

export function buildCompiledEntryRetentionPlan(input: {
  builds: readonly RetentionBuild[];
  passedBuildIds: ReadonlySet<number>;
  rowCounts: ReadonlyMap<number, number>;
}) {
  const activeBuildIds = input.builds.filter(build => build.status === "active").map(build => build.id).sort((a, b) => a - b);
  const newestSuccessfulBuildId = input.builds
    .filter(build => input.passedBuildIds.has(build.id) && ["compiled", "active", "superseded"].includes(build.status))
    .sort((left, right) => right.id - left.id)[0]?.id ?? null;
  const previousActiveBuildId = input.builds
    .filter(build => build.status === "superseded" && build.activatedAt)
    .sort((left, right) => (right.activatedAt?.getTime() ?? 0) - (left.activatedAt?.getTime() ?? 0) || right.id - left.id)[0]?.id ?? null;
  const protectedBuildIds = [...new Set([...activeBuildIds, newestSuccessfulBuildId, previousActiveBuildId].filter((id): id is number => id !== null))].sort((a, b) => a - b);
  const protectedSet = new Set(protectedBuildIds);
  const removable = input.builds
    .filter(build => build.status === "superseded" && !protectedSet.has(build.id) && (input.rowCounts.get(build.id) ?? 0) > 0)
    .map(build => ({ buildId: build.id, compiledEntryCount: input.rowCounts.get(build.id) ?? 0 }))
    .sort((left, right) => left.buildId - right.buildId);
  const plan = {
    activeBuildIds,
    newestSuccessfulBuildId,
    previousActiveBuildId,
    protectedBuildIds,
    removable,
    removableBuildIds: removable.map(row => row.buildId),
    removableCompiledEntryCount: removable.reduce((sum, row) => sum + row.compiledEntryCount, 0),
  };
  return Object.freeze({ ...plan, planHash: hashJson(plan) });
}

function normalizeBuildIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b);
}

export async function retainCompiledEntries(input: unknown) {
  const actor = await assertPermission("batch:commit");
  const record = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const apply = record.apply === true;
  const db = getDb();
  return db.transaction(async tx => {
    const [builds, validations, counts] = await Promise.all([
      tx.select({ id: mqKvBuilds.id, status: mqKvBuilds.status, activatedAt: mqKvBuilds.activatedAt }).from(mqKvBuilds).orderBy(desc(mqKvBuilds.id)).for("update"),
      tx.select({ buildId: mqKvValidationRuns.buildId }).from(mqKvValidationRuns).where(eq(mqKvValidationRuns.status, "passed")),
      tx.select({ buildId: mqKvCompiledEntries.buildId, count: sql<number>`count(*)::int` }).from(mqKvCompiledEntries).groupBy(mqKvCompiledEntries.buildId),
    ]);
    const plan = buildCompiledEntryRetentionPlan({
      builds,
      passedBuildIds: new Set(validations.map(row => row.buildId)),
      rowCounts: new Map(counts.map(row => [row.buildId, row.count])),
    });
    if (!apply) return { mode: "dry_run" as const, ...plan, deletedCompiledEntryCount: 0 };
    const requestedBuildIds = normalizeBuildIds(record.buildIds);
    if (record.expectedPlanHash !== plan.planHash) throw new CompiledArtifactError(409, "retention_plan_changed", "Retention plan changed; run a new dry-run.");
    if (JSON.stringify(requestedBuildIds) !== JSON.stringify(plan.removableBuildIds)) throw new CompiledArtifactError(409, "retention_build_scope_mismatch", "Apply must use the exact build IDs returned by dry-run.");
    if (requestedBuildIds.some(id => plan.protectedBuildIds.includes(id))) throw new CompiledArtifactError(409, "retention_protected_build", "Retention cannot delete active, newest successful, or rollback build entries.");
    let deletedCompiledEntryCount = 0;
    if (requestedBuildIds.length) {
      const deleted = await tx.delete(mqKvCompiledEntries).where(inArray(mqKvCompiledEntries.buildId, requestedBuildIds)).returning({ id: mqKvCompiledEntries.id });
      deletedCompiledEntryCount = deleted.length;
    }
    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "kv_compiled_entries_retained",
      targetTable: "mq_kv_compiled_entries",
      targetId: plan.planHash,
      payload: { buildIds: requestedBuildIds, deletedCompiledEntryCount, protectedBuildIds: plan.protectedBuildIds, planHash: plan.planHash },
    });
    return { mode: "apply" as const, ...plan, deletedCompiledEntryCount };
  });
}
