import { asc, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressNamespaces,
  mqAuditLog,
  mqChainCapabilities,
  mqChainNetworks,
  mqDictionaryIdRanges,
  mqNetworkChangeProposals,
} from "@/db/schema";
import { assertPermission } from "@/lib/auth/permissions";
import { loadAndValidateU1Catalog } from "@/lib/mqchain/catalog/u1";
import { networkChangeProposalSchema, networkChangeReviewSchema } from "@/lib/mqchain/validators/network-support";

function requiredString(values: Record<string, unknown>, key: string) {
  const value = values[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value.trim();
}

function optionalString(values: Record<string, unknown>, key: string) {
  const value = values[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(values: Record<string, unknown>, key: string) {
  const value = values[key];
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${key} must be a non-negative integer.`);
  return parsed;
}

export async function listNetworkSupportMatrix() {
  const db = getDb();
  const [networks, capabilities, namespaces, proposals] = await Promise.all([
    db.select().from(mqChainNetworks).orderBy(asc(mqChainNetworks.id)),
    db.select().from(mqChainCapabilities).orderBy(asc(mqChainCapabilities.chainNetworkId)),
    db.select().from(mqAddressNamespaces).orderBy(asc(mqAddressNamespaces.id)),
    db.select().from(mqNetworkChangeProposals).orderBy(desc(mqNetworkChangeProposals.createdAt)).limit(100),
  ]);
  const capabilityByNetwork = new Map(capabilities.map(row => [row.chainNetworkId, row]));
  const namespaceCounts = new Map<number, number>();
  for (const namespace of namespaces) namespaceCounts.set(namespace.chainNetworkId, (namespaceCounts.get(namespace.chainNetworkId) ?? 0) + 1);
  const rows = networks.map(network => ({
    network,
    capability: capabilityByNetwork.get(network.id) ?? null,
    namespaceCount: namespaceCounts.get(network.id) ?? 0,
  }));
  return {
    rows,
    proposals,
    summary: {
      total: rows.length,
      tier1: rows.filter(row => row.capability?.supportTier === 1).length,
      tier2: rows.filter(row => row.capability?.supportTier === 2).length,
      labelReady: rows.filter(row => ["test_ready", "production_ready"].includes(row.capability?.labelReadiness ?? "")).length,
      runtimeReady: rows.filter(row => ["test_ready", "production_ready"].includes(row.capability?.runtimeReadiness ?? "")).length,
      pendingProposals: proposals.filter(proposal => proposal.status === "pending").length,
    },
  };
}

export type NetworkCatalogDrift = {
  scope: "network" | "capability" | "allocation";
  key: string;
  field: string;
  catalogValue: unknown;
  databaseValue: unknown;
  severity: "error" | "warning";
};

export async function getNetworkCatalogDrift() {
  const [catalog, matrix, ranges] = await Promise.all([
    loadAndValidateU1Catalog(),
    listNetworkSupportMatrix(),
    getDb().select().from(mqDictionaryIdRanges).orderBy(asc(mqDictionaryIdRanges.id)),
  ]);
  const drift: NetworkCatalogDrift[] = [];
  const databaseById = new Map(matrix.rows.map(row => [String(row.network.id), row]));
  const networkFields: Array<[string, (row: (typeof matrix.rows)[number]) => unknown]> = [
    ["network_code", row => row.network.networkCode],
    ["network_name", row => row.network.networkName],
    ["chain_family", row => row.network.chainFamily],
    ["environment", row => row.network.environment],
    ["caip2", row => row.network.caip2 ?? ""],
    ["evm_chain_id", row => row.network.evmChainId?.toString() ?? ""],
    ["slip44", row => row.network.slip44?.toString() ?? ""],
    ["is_active", row => String(row.network.isActive)],
  ];
  for (const catalogRow of catalog.rows.get("chain_networks.csv") ?? []) {
    const databaseRow = databaseById.get(catalogRow.chain_network_id);
    if (!databaseRow) {
      drift.push({ scope: "network", key: catalogRow.chain_network_id, field: "row", catalogValue: "present", databaseValue: "missing", severity: "error" });
      continue;
    }
    for (const [field, read] of networkFields) {
      const databaseValue = read(databaseRow);
      if (catalogRow[field] !== databaseValue) drift.push({ scope: "network", key: catalogRow.chain_network_id, field, catalogValue: catalogRow[field], databaseValue, severity: "error" });
    }
  }
  const capabilityFields: Array<[string, keyof NonNullable<(typeof matrix.rows)[number]["capability"]>]> = [
    ["support_tier", "supportTier"], ["catalog_state", "catalogState"], ["label_readiness", "labelReadiness"], ["runtime_readiness", "runtimeReadiness"],
    ["catalog_status", "catalogStatus"], ["normalizer_status", "normalizerStatus"], ["mqnode_parser_status", "mqnodeParserStatus"], ["asset_resolver_status", "assetResolverStatus"],
    ["current_label_status", "currentLabelStatus"], ["timeline_status", "timelineStatus"], ["metric_status", "metricStatus"],
    ["mqnode_integration_test_ref", "mqnodeIntegrationTestRef"], ["metric_integration_test_ref", "metricIntegrationTestRef"],
  ];
  for (const catalogRow of catalog.rows.get("chain_capabilities.csv") ?? []) {
    const databaseRow = databaseById.get(catalogRow.chain_network_id)?.capability;
    if (!databaseRow) {
      drift.push({ scope: "capability", key: catalogRow.chain_network_id, field: "row", catalogValue: "present", databaseValue: "missing", severity: "error" });
      continue;
    }
    for (const [field, databaseField] of capabilityFields) {
      const raw = databaseRow[databaseField];
      const databaseValue = raw === null || raw === undefined ? "" : String(raw);
      if (catalogRow[field] !== databaseValue) drift.push({ scope: "capability", key: catalogRow.chain_network_id, field, catalogValue: catalogRow[field], databaseValue, severity: "warning" });
    }
  }
  const namespaceRange = (catalog.rows.get("id_ranges.csv") ?? []).find(row => row.range_code === "u1_namespaces");
  const databaseRange = ranges.find(row => row.rangeCode === "u1_namespaces");
  if (!namespaceRange || !databaseRange || namespaceRange.next_id !== String(databaseRange.nextId)) {
    drift.push({ scope: "allocation", key: "u1_namespaces", field: "next_id", catalogValue: namespaceRange?.next_id ?? "missing", databaseValue: databaseRange?.nextId ?? "missing", severity: "error" });
  }
  return { dictionaryVersion: catalog.dictionaryVersion, generatedAt: new Date().toISOString(), drift, summary: { total: drift.length, errors: drift.filter(row => row.severity === "error").length, warnings: drift.filter(row => row.severity === "warning").length } };
}

export async function createNetworkChangeProposal(input: unknown) {
  const actor = await assertPermission("network:propose");
  const parsed = networkChangeProposalSchema.parse(input);
  const [proposal] = await getDb().insert(mqNetworkChangeProposals).values({
    changeType: parsed.changeType,
    networkId: parsed.networkId ?? null,
    proposedValues: parsed.proposedValues,
    reason: parsed.reason,
    requestedBy: actor.id,
  }).returning();
  await getDb().insert(mqAuditLog).values({ actorId: actor.id, action: "network_change_proposed", targetTable: "mq_network_change_proposals", targetId: String(proposal.id), payload: { proposal } });
  return proposal;
}

export async function reviewNetworkChangeProposal(input: unknown) {
  const actor = await assertPermission("network:review");
  const parsed = networkChangeReviewSchema.parse(input);
  const db = getDb();
  return db.transaction(async tx => {
    const [proposal] = await tx.select().from(mqNetworkChangeProposals).where(eq(mqNetworkChangeProposals.id, parsed.proposalId)).limit(1);
    if (!proposal) throw new Error("Network change proposal not found.");
    if (parsed.action === "approve" || parsed.action === "reject") {
      if (proposal.status !== "pending") throw new Error("Only pending proposals can be reviewed.");
      const status = parsed.action === "approve" ? "approved" : "rejected";
      const [reviewed] = await tx.update(mqNetworkChangeProposals).set({ status, reviewedBy: actor.id, reviewNotes: parsed.reviewNotes || null, reviewedAt: new Date() }).where(eq(mqNetworkChangeProposals.id, proposal.id)).returning();
      await tx.insert(mqAuditLog).values({ actorId: actor.id, action: `network_change_${status}`, targetTable: "mq_network_change_proposals", targetId: String(proposal.id), payload: { before: proposal, after: reviewed } });
      return reviewed;
    }
    if (proposal.status !== "approved") throw new Error("Only approved proposals can be applied.");
    const values = proposal.proposedValues;
    let networkId = proposal.networkId;
    if (proposal.changeType === "create") {
      const [range] = await tx.select().from(mqDictionaryIdRanges).where(eq(mqDictionaryIdRanges.rangeCode, "u1_networks")).limit(1);
      if (!range) throw new Error("Network allocation range is missing.");
      networkId = range.nextId;
      const networkCode = requiredString(values, "networkCode");
      if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(networkCode)) throw new Error("networkCode must be lowercase snake_case.");
      await tx.insert(mqChainNetworks).values({
        id: networkId,
        networkCode,
        networkName: requiredString(values, "networkName"),
        chainFamily: requiredString(values, "chainFamily"),
        environment: optionalString(values, "environment") ?? "mainnet",
        caip2: optionalString(values, "caip2"),
        evmChainId: optionalNumber(values, "evmChainId"),
        slip44: optionalNumber(values, "slip44"),
        sourceId: optionalNumber(values, "sourceId"),
        notes: optionalString(values, "notes"),
        isActive: false,
      });
      await tx.insert(mqChainCapabilities).values({ chainNetworkId: networkId, catalogState: "catalogued", labelReadiness: "not_ready", runtimeReadiness: "not_ready", catalogStatus: "catalogued", normalizerStatus: "planned", mqnodeParserStatus: "unsupported", assetResolverStatus: "planned", currentLabelStatus: "planned", timelineStatus: "planned", metricStatus: "unsupported" });
      await tx.update(mqDictionaryIdRanges).set({ nextId: networkId + 1, updatedAt: new Date() }).where(eq(mqDictionaryIdRanges.id, range.id));
    } else {
      if (!networkId) throw new Error("Proposal has no network ID.");
      const [network] = await tx.select().from(mqChainNetworks).where(eq(mqChainNetworks.id, networkId)).limit(1);
      if (!network) throw new Error("Network not found.");
      if (proposal.changeType === "activate") {
        await tx.execute(sql`select set_config('mqchain.network_change_proposal_id', ${String(proposal.id)}, true)`);
        await tx.update(mqChainNetworks).set({ isActive: true, updatedAt: new Date() }).where(eq(mqChainNetworks.id, networkId));
      } else if (proposal.changeType === "deactivate") {
        await tx.update(mqChainNetworks).set({ isActive: false, updatedAt: new Date() }).where(eq(mqChainNetworks.id, networkId));
      } else if (proposal.changeType === "update") {
        await tx.update(mqChainNetworks).set({
          networkName: optionalString(values, "networkName") ?? network.networkName,
          caip2: Object.hasOwn(values, "caip2") ? optionalString(values, "caip2") : network.caip2,
          evmChainId: Object.hasOwn(values, "evmChainId") ? optionalNumber(values, "evmChainId") : network.evmChainId,
          slip44: Object.hasOwn(values, "slip44") ? optionalNumber(values, "slip44") : network.slip44,
          sourceId: Object.hasOwn(values, "sourceId") ? optionalNumber(values, "sourceId") : network.sourceId,
          notes: Object.hasOwn(values, "notes") ? optionalString(values, "notes") : network.notes,
          updatedAt: new Date(),
        }).where(eq(mqChainNetworks.id, networkId));
      } else if (proposal.changeType === "capability_update") {
        const allowed = ["supportTier", "catalogState", "labelReadiness", "runtimeReadiness", "catalogStatus", "normalizerStatus", "mqnodeParserStatus", "assetResolverStatus", "currentLabelStatus", "timelineStatus", "metricStatus", "mqnodeIntegrationTestRef", "metricIntegrationTestRef", "notes"] as const;
        const updates = Object.fromEntries(allowed.filter(key => Object.hasOwn(values, key)).map(key => [key, values[key]]));
        await tx.update(mqChainCapabilities).set({ ...updates, updatedAt: new Date() }).where(eq(mqChainCapabilities.chainNetworkId, networkId));
      }
    }
    const [applied] = await tx.update(mqNetworkChangeProposals).set({ networkId, status: "applied", reviewedBy: proposal.reviewedBy ?? actor.id, appliedAt: new Date() }).where(eq(mqNetworkChangeProposals.id, proposal.id)).returning();
    await tx.insert(mqAuditLog).values({ actorId: actor.id, action: "network_change_applied", targetTable: "mq_network_change_proposals", targetId: String(proposal.id), payload: { proposal: applied } });
    return applied;
  });
}
