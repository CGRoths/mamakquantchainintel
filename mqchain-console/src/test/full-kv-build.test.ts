import { describe, expect, it } from "vitest";

import { FLAG_BITS, setFlag } from "@/lib/mqchain/flags";
import { buildPendingFullKvManifest, computeFullKvBuildRequestHash } from "@/lib/mqchain/kv-manifest";
import { assembleFullKvCompilationSnapshot } from "@/lib/mqchain/services/full-kv-build-service";

type SnapshotInput = Parameters<typeof assembleFullKvCompilationSnapshot>[0];
type JoinedRow = SnapshotInput["joinedRows"][number];
type Group = SnapshotInput["activeGroups"][number];
type Rule = SnapshotInput["activeRules"][number];

function joinedRow(id: number, chainCode = "ethereum_mainnet"): JoinedRow {
  const registry = {
    id,
    chainCode,
    normalizedAddress: `0x${id.toString(16).padStart(40, "0")}`,
    namespaceId: 2,
    addressCodecId: 1,
    payloadHex: id.toString(16).padStart(40, "0"),
    prefixCode: 60,
    entityId: 1,
    protocolId: null,
    categoryId: 10,
    roleId: 1020,
    componentId: null,
    tagsetId: null,
    confidenceScore: 90,
    labelStatus: 1,
    qualityTier: 3,
    flags: setFlag(0, FLAG_BITS.metricEligible),
    validFromBlock: null,
    validToBlock: null,
    isActive: true,
    approvedBatchId: id,
  } as unknown as JoinedRow["registry"];
  return {
    registry,
    entity: { entityCode: "binance", entityName: "Binance" } as JoinedRow["entity"],
    protocol: null,
    role: { roleCode: "cex_hot_wallet" } as JoinedRow["role"],
    category: { categoryCode: "cex_hot_cold" } as JoinedRow["category"],
    namespace: { id: 2, addressCodecId: 1, isActive: true } as JoinedRow["namespace"],
    codec: { id: 1, status: "production_ready", payloadRule: "exact:20" } as JoinedRow["codec"],
  };
}

function group(id: number, chainCode: string | null = null): Group {
  return {
    id,
    metricGroupCode: `group_${id}`,
    metricGroupName: `Group ${id}`,
    chainCode,
    minConfidence: 70,
    requireMetricEligible: true,
    isActive: true,
  } as unknown as Group;
}

function rule(id: number, metricGroupId: number): Rule {
  return {
    id,
    metricGroupId,
    ruleVersion: 1,
    status: "active",
    ruleJson: { includeRoles: ["cex_hot_wallet"], requireMetricEligible: true },
  } as unknown as Rule;
}

function snapshot(activeGroups: Group[] = [], activeRules: Rule[] = [], rows = [joinedRow(1), joinedRow(2)]) {
  return assembleFullKvCompilationSnapshot({
    dictionaryVersion: "d".repeat(64),
    joinedRows: rows,
    activeGroups,
    activeRules,
  });
}

describe("full KV build request", () => {
  it("counts zero memberships when no active metric group exists", () => {
    expect(snapshot().expectedCounts).toEqual({
      addressLabelCurrent: 2,
      addressLabelTimeline: 0,
      metricGroupMembership: 0,
    });
  });

  it("counts unique group/registry memberships across one or two groups", () => {
    expect(snapshot([group(1)], [rule(1, 1)]).expectedCounts.metricGroupMembership).toBe(2);
    expect(snapshot([group(1), group(2)], [rule(1, 1), rule(2, 2)]).expectedCounts.metricGroupMembership).toBe(4);
  });

  it("excludes a group whose chain scope does not match", () => {
    expect(snapshot([group(1, "bitcoin_mainnet")], [rule(1, 1)]).expectedCounts.metricGroupMembership).toBe(0);
  });

  it("includes the complete participating registry universe, including prior batches", () => {
    expect(snapshot([group(1)], [rule(1, 1)], [joinedRow(9), joinedRow(3)]).registryIds).toEqual([3, 9]);
  });

  it("reproduces hashes and binds build identity to dictionary version", () => {
    const first = snapshot([group(1)], [rule(1, 1)]);
    const second = snapshot([group(1)], [rule(1, 1)]);
    expect(second.registrySnapshotHash).toBe(first.registrySnapshotHash);
    const manifest = (dictionaryVersion: string) => buildPendingFullKvManifest({
      triggeringBatchId: 2,
      lastCommittedBatchId: 2,
      registryIds: first.registryIds,
      registrySnapshotHash: first.registrySnapshotHash,
      dictionaryVersion,
      expectedCounts: first.expectedCounts,
    });
    expect(computeFullKvBuildRequestHash(manifest("a".repeat(64)))).toBe(computeFullKvBuildRequestHash(manifest("a".repeat(64))));
    expect(computeFullKvBuildRequestHash(manifest("b".repeat(64)))).not.toBe(computeFullKvBuildRequestHash(manifest("a".repeat(64))));
  });
});
