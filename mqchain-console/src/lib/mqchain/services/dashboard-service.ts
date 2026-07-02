import { count, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressCandidates,
  mqAddressRegistry,
  mqApprovalEvents,
  mqDiscoveryJobs,
  mqEntities,
  mqKvBuilds,
  mqLabelBatches,
  mqMetricGroups,
  mqProtocols,
  mqSourceJobs,
} from "@/db/schema";
import { FLAG_BITS } from "../flags";
import { buildConfidenceDistribution, normalizeDistributionRows } from "../dashboard";

const metricEligibleMask = 1 << FLAG_BITS.metricEligible;

function firstCount(rows: { value: number }[]) {
  return rows[0]?.value ?? 0;
}

export async function getDashboardOverview() {
  const db = getDb();

  const [
    pendingCandidates,
    needsReview,
    approvedToday,
    rejectedToday,
    committedBatches,
    activeEntities,
    activeProtocols,
    activeLabels,
    unresolvedConflicts,
    metricEligibleCount,
    activeMetricGroups,
    latestBatch,
    latestKvBuild,
    discoveryStatusRows,
    sourceTypeRows,
    qualityTierRows,
    registryConfidenceRows,
    labelsByEntityRows,
    recentApprovalEvents,
    recentSourceJobs,
    recentDiscoveryJobs,
  ] = await Promise.all([
    db.select({ value: count() }).from(mqAddressCandidates).where(eq(mqAddressCandidates.candidateStatus, "pending_review")),
    db.select({ value: count() }).from(mqAddressCandidates).where(eq(mqAddressCandidates.candidateStatus, "needs_more_evidence")),
    db
      .select({ value: count() })
      .from(mqAddressCandidates)
      .where(sql`${mqAddressCandidates.candidateStatus} = 'approved' and ${mqAddressCandidates.updatedAt}::date = now()::date`),
    db
      .select({ value: count() })
      .from(mqAddressCandidates)
      .where(sql`${mqAddressCandidates.candidateStatus} = 'rejected' and ${mqAddressCandidates.updatedAt}::date = now()::date`),
    db.select({ value: count() }).from(mqLabelBatches).where(eq(mqLabelBatches.status, "committed")),
    db.select({ value: count() }).from(mqEntities).where(eq(mqEntities.isActive, true)),
    db.select({ value: count() }).from(mqProtocols).where(eq(mqProtocols.isActive, true)),
    db.select({ value: count() }).from(mqAddressRegistry).where(eq(mqAddressRegistry.isActive, true)),
    db.select({ value: count() }).from(mqAddressCandidates).where(eq(mqAddressCandidates.candidateStatus, "conflict_pending")),
    db
      .select({ value: count() })
      .from(mqAddressRegistry)
      .where(sql`${mqAddressRegistry.isActive} = true and (${mqAddressRegistry.flags} & ${metricEligibleMask}) <> 0 and ${mqAddressRegistry.confidenceScore} >= 70`),
    db.select({ value: count() }).from(mqMetricGroups).where(eq(mqMetricGroups.isActive, true)),
    db.select().from(mqLabelBatches).where(eq(mqLabelBatches.status, "committed")).orderBy(desc(mqLabelBatches.committedAt)).limit(1),
    db.select().from(mqKvBuilds).orderBy(desc(mqKvBuilds.createdAt)).limit(1),
    db
      .select({ label: mqDiscoveryJobs.status, count: sql<number>`count(*)::int` })
      .from(mqDiscoveryJobs)
      .groupBy(mqDiscoveryJobs.status)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({
        label: sql<string>`coalesce(${mqSourceJobs.sourceType}, ${mqAddressCandidates.discoveredBy}, 'unknown')`,
        count: sql<number>`count(*)::int`,
      })
      .from(mqAddressCandidates)
      .leftJoin(mqSourceJobs, eq(mqAddressCandidates.sourceJobId, mqSourceJobs.id))
      .groupBy(sql`coalesce(${mqSourceJobs.sourceType}, ${mqAddressCandidates.discoveredBy}, 'unknown')`)
      .orderBy(desc(sql`count(*)`))
      .limit(8),
    db
      .select({ label: sql<string>`concat('tier ', ${mqAddressRegistry.qualityTier})`, count: sql<number>`count(*)::int` })
      .from(mqAddressRegistry)
      .where(eq(mqAddressRegistry.isActive, true))
      .groupBy(mqAddressRegistry.qualityTier)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({ confidenceScore: mqAddressRegistry.confidenceScore })
      .from(mqAddressRegistry)
      .where(eq(mqAddressRegistry.isActive, true)),
    db
      .select({ label: sql<string>`coalesce(${mqEntities.entityName}, 'unassigned')`, count: sql<number>`count(*)::int` })
      .from(mqAddressRegistry)
      .leftJoin(mqEntities, eq(mqAddressRegistry.entityId, mqEntities.id))
      .where(eq(mqAddressRegistry.isActive, true))
      .groupBy(sql`coalesce(${mqEntities.entityName}, 'unassigned')`)
      .orderBy(desc(sql`count(*)`))
      .limit(8),
    db.select().from(mqApprovalEvents).orderBy(desc(mqApprovalEvents.createdAt)).limit(8),
    db.select().from(mqSourceJobs).orderBy(desc(mqSourceJobs.createdAt)).limit(8),
    db.select().from(mqDiscoveryJobs).orderBy(desc(mqDiscoveryJobs.createdAt)).limit(8),
  ]);

  return {
    stats: {
      pendingCandidates: firstCount(pendingCandidates),
      needsReview: firstCount(needsReview),
      approvedToday: firstCount(approvedToday),
      rejectedToday: firstCount(rejectedToday),
      committedBatches: firstCount(committedBatches),
      activeEntities: firstCount(activeEntities),
      activeProtocols: firstCount(activeProtocols),
      activeLabels: firstCount(activeLabels),
      unresolvedConflicts: firstCount(unresolvedConflicts),
      metricEligibleCount: firstCount(metricEligibleCount),
      activeMetricGroups: firstCount(activeMetricGroups),
    },
    latestBatch: latestBatch[0] ?? null,
    latestKvBuild: latestKvBuild[0] ?? null,
    discoveryStatus: normalizeDistributionRows(discoveryStatusRows),
    sourceTypes: normalizeDistributionRows(sourceTypeRows),
    qualityTiers: normalizeDistributionRows(qualityTierRows),
    confidenceDistribution: buildConfidenceDistribution(registryConfidenceRows),
    labelsByEntity: normalizeDistributionRows(labelsByEntityRows),
    recentApprovalEvents,
    recentSourceJobs,
    recentDiscoveryJobs,
  };
}
