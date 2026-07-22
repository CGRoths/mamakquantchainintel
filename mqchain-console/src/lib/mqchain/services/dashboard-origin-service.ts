import { count, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqWorkflowAddressCandidates,
  mqRegistryAddressLabels,
  mqWorkflowApprovalEvents,
  mqWorkflowDiscoveryJobs,
  mqDictEntities,
  mqBuildKvBuilds,
  mqWorkflowLabelBatches,
  mqDictMetricGroups,
  mqDictProtocols,
  mqWorkflowSourceJobs,
} from "@/db/schema";
import { FLAG_BITS } from "../flags";
import { buildConfidenceDistribution, buildDashboardLatestKvBuildSummary, normalizeDistributionRows } from "../dashboard";

const metricEligibleMask = 1 << FLAG_BITS.metricEligible;

function firstCount(rows: { value: number }[]) {
  return rows[0]?.value ?? 0;
}

export async function getDashboardOverviewFromDatabase() {
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
    db.select({ value: count() }).from(mqWorkflowAddressCandidates).where(eq(mqWorkflowAddressCandidates.candidateStatus, "pending_review")),
    db.select({ value: count() }).from(mqWorkflowAddressCandidates).where(eq(mqWorkflowAddressCandidates.candidateStatus, "needs_more_evidence")),
    db
      .select({ value: count() })
      .from(mqWorkflowAddressCandidates)
      .where(sql`${mqWorkflowAddressCandidates.candidateStatus} = 'approved' and ${mqWorkflowAddressCandidates.updatedAt}::date = now()::date`),
    db
      .select({ value: count() })
      .from(mqWorkflowAddressCandidates)
      .where(sql`${mqWorkflowAddressCandidates.candidateStatus} = 'rejected' and ${mqWorkflowAddressCandidates.updatedAt}::date = now()::date`),
    db.select({ value: count() }).from(mqWorkflowLabelBatches).where(eq(mqWorkflowLabelBatches.status, "committed")),
    db.select({ value: count() }).from(mqDictEntities).where(eq(mqDictEntities.isActive, true)),
    db.select({ value: count() }).from(mqDictProtocols).where(eq(mqDictProtocols.isActive, true)),
    db.select({ value: count() }).from(mqRegistryAddressLabels).where(eq(mqRegistryAddressLabels.isActive, true)),
    db.select({ value: count() }).from(mqWorkflowAddressCandidates).where(eq(mqWorkflowAddressCandidates.candidateStatus, "conflict_pending")),
    db
      .select({ value: count() })
      .from(mqRegistryAddressLabels)
      .where(sql`${mqRegistryAddressLabels.isActive} = true and (${mqRegistryAddressLabels.flags} & ${metricEligibleMask}) <> 0 and ${mqRegistryAddressLabels.confidenceScore} >= 70`),
    db.select({ value: count() }).from(mqDictMetricGroups).where(eq(mqDictMetricGroups.isActive, true)),
    db.select().from(mqWorkflowLabelBatches).where(eq(mqWorkflowLabelBatches.status, "committed")).orderBy(desc(mqWorkflowLabelBatches.committedAt)).limit(1),
    db.select().from(mqBuildKvBuilds).orderBy(desc(mqBuildKvBuilds.createdAt)).limit(1),
    db
      .select({ label: mqWorkflowDiscoveryJobs.status, count: sql<number>`count(*)::int` })
      .from(mqWorkflowDiscoveryJobs)
      .groupBy(mqWorkflowDiscoveryJobs.status)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({
        label: sql<string>`coalesce(${mqWorkflowSourceJobs.sourceType}, ${mqWorkflowAddressCandidates.discoveredBy}, 'unknown')`,
        count: sql<number>`count(*)::int`,
      })
      .from(mqWorkflowAddressCandidates)
      .leftJoin(mqWorkflowSourceJobs, eq(mqWorkflowAddressCandidates.sourceJobId, mqWorkflowSourceJobs.id))
      .groupBy(sql`coalesce(${mqWorkflowSourceJobs.sourceType}, ${mqWorkflowAddressCandidates.discoveredBy}, 'unknown')`)
      .orderBy(desc(sql`count(*)`))
      .limit(8),
    db
      .select({ label: sql<string>`concat('tier ', ${mqRegistryAddressLabels.qualityTier})`, count: sql<number>`count(*)::int` })
      .from(mqRegistryAddressLabels)
      .where(eq(mqRegistryAddressLabels.isActive, true))
      .groupBy(mqRegistryAddressLabels.qualityTier)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({ confidenceScore: mqRegistryAddressLabels.confidenceScore })
      .from(mqRegistryAddressLabels)
      .where(eq(mqRegistryAddressLabels.isActive, true)),
    db
      .select({ label: sql<string>`coalesce(${mqDictEntities.entityName}, 'unassigned')`, count: sql<number>`count(*)::int` })
      .from(mqRegistryAddressLabels)
      .leftJoin(mqDictEntities, eq(mqRegistryAddressLabels.entityId, mqDictEntities.id))
      .where(eq(mqRegistryAddressLabels.isActive, true))
      .groupBy(sql`coalesce(${mqDictEntities.entityName}, 'unassigned')`)
      .orderBy(desc(sql`count(*)`))
      .limit(8),
    db.select().from(mqWorkflowApprovalEvents).orderBy(desc(mqWorkflowApprovalEvents.createdAt)).limit(8),
    db.select().from(mqWorkflowSourceJobs).orderBy(desc(mqWorkflowSourceJobs.createdAt)).limit(8),
    db.select().from(mqWorkflowDiscoveryJobs).orderBy(desc(mqWorkflowDiscoveryJobs.createdAt)).limit(8),
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
    latestKvBuildSummary: buildDashboardLatestKvBuildSummary(latestKvBuild[0] ?? null),
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

