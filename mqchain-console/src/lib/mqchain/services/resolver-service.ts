import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqWorkflowAddressEvidence,
  mqRegistryAddressLabels,
  mqDictCategories,
  mqDictEntities,
  mqDictRoles,
  mqWorkflowLabelBatches,
  mqPolicyMetricGroupRules,
  mqDictMetricGroups,
  mqDictProtocols,
} from "@/db/schema";
import { normalizeAddress } from "../address/normalize";
import { isHistoricalLabel, isMetricEligible } from "../flags";
import { matchesMetricGroupRule, metricGroupAppliesToChain } from "../metric-rules";
import { summarizeResolverEvidence } from "../resolver-detail";
import { getMqchainResolverBackend, type MqchainResolverBackend } from "../runtime-env";
import type { MetricGroupRule } from "../types";

export type ResolverOutput = {
  normalized: ReturnType<typeof normalizeAddress>;
  label: ResolverLabel | null;
  currentLabel: ResolverLabel | null;
  metricGroupMatch: boolean | null;
  metricGroupCode?: string | null;
  blockNumber?: number | null;
};

export type ResolverLabel = {
  registry: typeof mqRegistryAddressLabels.$inferSelect;
  entity: typeof mqDictEntities.$inferSelect | null;
  protocol: typeof mqDictProtocols.$inferSelect | null;
  role: typeof mqDictRoles.$inferSelect | null;
  category: typeof mqDictCategories.$inferSelect | null;
  sourceBatch: typeof mqWorkflowLabelBatches.$inferSelect | null;
  evidence: (typeof mqWorkflowAddressEvidence.$inferSelect)[];
  evidenceSummary: ReturnType<typeof summarizeResolverEvidence>;
  status: "active" | "historical" | "inactive";
  metricEligible: boolean;
};

export type AddressResolver = {
  resolveCurrent(chainCode: string, address: string): Promise<ResolverOutput>;
  resolveAt(chainCode: string, address: string, blockNumber?: number | null): Promise<ResolverOutput>;
  checkMetricGroup(chainCode: string, address: string, metricGroupCode: string, blockNumber?: number | null): Promise<ResolverOutput>;
};

async function findRegistryLabel(chainCode: string, normalizedAddress: string, blockNumber?: number | null): Promise<ResolverLabel | null> {
  const db = getDb();
  const isPointInTimeLookup = blockNumber !== undefined && blockNumber !== null;
  const blockConditions =
    !isPointInTimeLookup
      ? []
      : [
          or(isNull(mqRegistryAddressLabels.validFromBlock), lte(mqRegistryAddressLabels.validFromBlock, blockNumber)),
          or(isNull(mqRegistryAddressLabels.validToBlock), gte(mqRegistryAddressLabels.validToBlock, blockNumber)),
        ];
  const activeConditions = isPointInTimeLookup ? [] : [eq(mqRegistryAddressLabels.isActive, true)];

  const [label] = await db
    .select({
      registry: mqRegistryAddressLabels,
      entity: mqDictEntities,
      protocol: mqDictProtocols,
      role: mqDictRoles,
      category: mqDictCategories,
    })
    .from(mqRegistryAddressLabels)
    .leftJoin(mqDictEntities, eq(mqRegistryAddressLabels.entityId, mqDictEntities.id))
    .leftJoin(mqDictProtocols, eq(mqRegistryAddressLabels.protocolId, mqDictProtocols.id))
    .leftJoin(mqDictRoles, eq(mqRegistryAddressLabels.roleId, mqDictRoles.roleId))
        .leftJoin(mqDictCategories, eq(mqDictCategories.categoryId, sql<number>`coalesce(${mqRegistryAddressLabels.categoryId}, ${mqDictRoles.categoryId})`))
    .where(
      and(
        eq(mqRegistryAddressLabels.chainCode, chainCode),
        eq(mqRegistryAddressLabels.normalizedAddress, normalizedAddress),
        ...activeConditions,
        ...blockConditions,
      ),
    )
    .orderBy(desc(mqRegistryAddressLabels.createdAt))
    .limit(1);

  if (!label) {
    return null;
  }

  const [sourceBatch, evidence] = await Promise.all([
    label.registry.approvedBatchId
      ? db.select().from(mqWorkflowLabelBatches).where(eq(mqWorkflowLabelBatches.id, label.registry.approvedBatchId)).limit(1)
      : Promise.resolve([]),
    db.select().from(mqWorkflowAddressEvidence).where(eq(mqWorkflowAddressEvidence.registryId, label.registry.id)).orderBy(desc(mqWorkflowAddressEvidence.createdAt)).limit(25),
  ]);

  const status = label.registry.isActive
    ? "active"
    : isHistoricalLabel(label.registry)
      ? "historical"
      : "inactive";

  return {
    ...label,
    sourceBatch: sourceBatch[0] ?? null,
    evidence,
    evidenceSummary: summarizeResolverEvidence(evidence),
    status,
    metricEligible: isMetricEligible({
      confidenceScore: label.registry.confidenceScore,
      flags: label.registry.flags,
    }),
  };
}

class PostgresAddressResolverImpl implements AddressResolver {
  async resolveCurrent(chainCode: string, address: string): Promise<ResolverOutput> {
    const normalized = normalizeAddress(address, chainCode);
    if (!normalized.isValid || !normalized.chainCode) {
      return { normalized, label: null, currentLabel: null, metricGroupMatch: null };
    }

    const label = await findRegistryLabel(normalized.chainCode, normalized.normalizedAddress);
    return { normalized, label, currentLabel: label, metricGroupMatch: null };
  }

  async resolveAt(chainCode: string, address: string, blockNumber?: number | null): Promise<ResolverOutput> {
    const normalized = normalizeAddress(address, chainCode);
    if (!normalized.isValid || !normalized.chainCode) {
      return { normalized, label: null, currentLabel: null, metricGroupMatch: null, blockNumber };
    }

    const [label, currentLabel] = await Promise.all([
      findRegistryLabel(normalized.chainCode, normalized.normalizedAddress, blockNumber),
      blockNumber === undefined || blockNumber === null
        ? Promise.resolve(null)
        : findRegistryLabel(normalized.chainCode, normalized.normalizedAddress),
    ]);

    return {
      normalized,
      label,
      currentLabel: currentLabel ?? label,
      metricGroupMatch: null,
      blockNumber,
    };
  }

  async checkMetricGroup(chainCode: string, address: string, metricGroupCode: string, blockNumber?: number | null): Promise<ResolverOutput> {
    const resolved = await this.resolveAt(chainCode, address, blockNumber);
    if (!resolved.label) {
      return { ...resolved, metricGroupMatch: false, metricGroupCode };
    }

    const db = getDb();
    const [group] = await db
      .select()
      .from(mqDictMetricGroups)
      .where(and(eq(mqDictMetricGroups.metricGroupCode, metricGroupCode), eq(mqDictMetricGroups.isActive, true)))
      .limit(1);
    if (!group) {
      return { ...resolved, metricGroupMatch: false, metricGroupCode };
    }

    if (!metricGroupAppliesToChain(group.chainCode, resolved.normalized.chainCode)) {
      return { ...resolved, metricGroupMatch: false, metricGroupCode };
    }

    const rules = await db.select().from(mqPolicyMetricGroupRules).where(eq(mqPolicyMetricGroupRules.metricGroupId, group.id));
    const row = {
      roleCode: resolved.label.role?.roleCode,
      categoryCode: resolved.label.category?.categoryCode,
      entityCode: resolved.label.entity?.entityCode,
      confidenceScore: resolved.label.registry.confidenceScore,
      flags: resolved.label.registry.flags,
    };

    const metricGroupMatch = rules.some((rule) =>
      matchesMetricGroupRule(row, {
        ...(rule.ruleJson as MetricGroupRule),
        minConfidence: (rule.ruleJson as MetricGroupRule).minConfidence ?? group.minConfidence,
        requireMetricEligible: (rule.ruleJson as MetricGroupRule).requireMetricEligible ?? group.requireMetricEligible,
      }),
    );

    return { ...resolved, metricGroupMatch, metricGroupCode };
  }
}

export const PostgresAddressResolver: AddressResolver = new PostgresAddressResolverImpl();

export function getAddressResolver(backend: MqchainResolverBackend = getMqchainResolverBackend()): AddressResolver {
  if (backend === "postgres") {
    return PostgresAddressResolver;
  }

  throw new Error("RocksDB resolver backend is external to Vercel and is not wired into MQCHAIN Console yet.");
}

export async function resolveCurrent(chainCode: string, address: string): Promise<ResolverOutput> {
  return getAddressResolver().resolveCurrent(chainCode, address);
}

export async function resolveAt(chainCode: string, address: string, blockNumber?: number | null): Promise<ResolverOutput> {
  return getAddressResolver().resolveAt(chainCode, address, blockNumber);
}

export async function checkMetricGroup(chainCode: string, address: string, metricGroupCode: string, blockNumber?: number | null): Promise<ResolverOutput> {
  return getAddressResolver().checkMetricGroup(chainCode, address, metricGroupCode, blockNumber);
}
