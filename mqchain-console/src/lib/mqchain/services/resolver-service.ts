import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressEvidence,
  mqAddressRegistry,
  mqCategoryDict,
  mqEntities,
  mqKvRoleDict,
  mqLabelBatches,
  mqMetricGroupRules,
  mqMetricGroups,
  mqProtocols,
} from "@/db/schema";
import { normalizeAddress } from "../address/normalize";
import { FLAG_BITS, hasFlag, isMetricEligible } from "../flags";
import { matchesMetricGroupRule } from "../metric-rules";
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
  registry: typeof mqAddressRegistry.$inferSelect;
  entity: typeof mqEntities.$inferSelect | null;
  protocol: typeof mqProtocols.$inferSelect | null;
  role: typeof mqKvRoleDict.$inferSelect | null;
  category: typeof mqCategoryDict.$inferSelect | null;
  sourceBatch: typeof mqLabelBatches.$inferSelect | null;
  evidence: (typeof mqAddressEvidence.$inferSelect)[];
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
          or(isNull(mqAddressRegistry.validFromBlock), lte(mqAddressRegistry.validFromBlock, blockNumber)),
          or(isNull(mqAddressRegistry.validToBlock), gte(mqAddressRegistry.validToBlock, blockNumber)),
        ];
  const activeConditions = isPointInTimeLookup ? [] : [eq(mqAddressRegistry.isActive, true)];

  const [label] = await db
    .select({
      registry: mqAddressRegistry,
      entity: mqEntities,
      protocol: mqProtocols,
      role: mqKvRoleDict,
      category: mqCategoryDict,
    })
    .from(mqAddressRegistry)
    .leftJoin(mqEntities, eq(mqAddressRegistry.entityId, mqEntities.id))
    .leftJoin(mqProtocols, eq(mqAddressRegistry.protocolId, mqProtocols.id))
    .leftJoin(mqKvRoleDict, eq(mqAddressRegistry.roleId, mqKvRoleDict.roleId))
    .leftJoin(mqCategoryDict, eq(mqKvRoleDict.categoryId, mqCategoryDict.categoryId))
    .where(
      and(
        eq(mqAddressRegistry.chainCode, chainCode),
        eq(mqAddressRegistry.normalizedAddress, normalizedAddress),
        ...activeConditions,
        ...blockConditions,
      ),
    )
    .orderBy(desc(mqAddressRegistry.createdAt))
    .limit(1);

  if (!label) {
    return null;
  }

  const [sourceBatch, evidence] = await Promise.all([
    label.registry.approvedBatchId
      ? db.select().from(mqLabelBatches).where(eq(mqLabelBatches.id, label.registry.approvedBatchId)).limit(1)
      : Promise.resolve([]),
    db.select().from(mqAddressEvidence).where(eq(mqAddressEvidence.registryId, label.registry.id)).orderBy(desc(mqAddressEvidence.createdAt)).limit(25),
  ]);

  const status = label.registry.isActive
    ? "active"
    : hasFlag(label.registry.flags, FLAG_BITS.historicalOnly)
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
      .from(mqMetricGroups)
      .where(and(eq(mqMetricGroups.metricGroupCode, metricGroupCode), eq(mqMetricGroups.isActive, true)))
      .limit(1);
    if (!group) {
      return { ...resolved, metricGroupMatch: false, metricGroupCode };
    }

    const rules = await db.select().from(mqMetricGroupRules).where(eq(mqMetricGroupRules.metricGroupId, group.id));
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
