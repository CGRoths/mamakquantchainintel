import { describe, expect, it } from "vitest";

import { LABEL_STATUS } from "@/lib/mqchain/constants";
import {
  buildKvRegistrySourceContract,
  isCommittedKvRegistryLabel,
  isKvCurrentLabelSource,
  isKvTimelineLabelSource,
  type KvCompilerRegistrySourceRow,
} from "@/lib/mqchain/kv-compiler";

function registryRow(overrides: Partial<KvCompilerRegistrySourceRow> = {}): KvCompilerRegistrySourceRow {
  return {
    id: 1,
    approvedBatchId: 7,
    entityId: 11,
    roleId: 1010,
    prefixCode: 257,
    payloadHex: "abcdef",
    isActive: true,
    labelStatus: LABEL_STATUS.activeCurrent,
    ...overrides,
  };
}

describe("KV compiler source contract", () => {
  it("requires committed registry identity before a row can enter serving artifacts", () => {
    expect(isCommittedKvRegistryLabel(registryRow())).toBe(true);
    expect(isCommittedKvRegistryLabel(registryRow({ approvedBatchId: null }))).toBe(false);
    expect(isCommittedKvRegistryLabel(registryRow({ entityId: null }))).toBe(false);
    expect(isCommittedKvRegistryLabel(registryRow({ roleId: null }))).toBe(false);
    expect(isCommittedKvRegistryLabel(registryRow({ prefixCode: null }))).toBe(false);
    expect(isCommittedKvRegistryLabel(registryRow({ payloadHex: " " }))).toBe(false);
  });

  it("keeps current-serving labels limited to active current statuses", () => {
    expect(isKvCurrentLabelSource(registryRow({ labelStatus: LABEL_STATUS.activeCurrent }))).toBe(true);
    expect(isKvCurrentLabelSource(registryRow({ labelStatus: LABEL_STATUS.sanctionedCurrent }))).toBe(true);
    expect(isKvCurrentLabelSource(registryRow({ labelStatus: LABEL_STATUS.inactiveHistorical }))).toBe(false);
    expect(isKvCurrentLabelSource(registryRow({ labelStatus: LABEL_STATUS.activeCurrent, isActive: false }))).toBe(false);
    expect(isKvCurrentLabelSource(registryRow({ labelStatus: LABEL_STATUS.conflict }))).toBe(false);
    expect(isKvCurrentLabelSource(registryRow({ labelStatus: LABEL_STATUS.pendingReview }))).toBe(false);
  });

  it("allows committed historical truth into timeline artifacts but excludes non-serving statuses", () => {
    expect(isKvTimelineLabelSource(registryRow({ labelStatus: LABEL_STATUS.activeCurrent }))).toBe(true);
    expect(isKvTimelineLabelSource(registryRow({ labelStatus: LABEL_STATUS.inactiveHistorical, isActive: false }))).toBe(true);
    expect(isKvTimelineLabelSource(registryRow({ labelStatus: LABEL_STATUS.deprecated, isActive: false }))).toBe(true);
    expect(isKvTimelineLabelSource(registryRow({ labelStatus: LABEL_STATUS.sanctionedHistorical, isActive: false }))).toBe(true);
    expect(isKvTimelineLabelSource(registryRow({ labelStatus: LABEL_STATUS.unknown }))).toBe(false);
    expect(isKvTimelineLabelSource(registryRow({ labelStatus: LABEL_STATUS.doNotUse }))).toBe(false);
    expect(isKvTimelineLabelSource(registryRow({ labelStatus: LABEL_STATUS.pendingReview }))).toBe(false);
  });

  it("summarizes the Postgres truth boundary in compiler manifests", () => {
    expect(
      buildKvRegistrySourceContract([
        registryRow({ id: 1, labelStatus: LABEL_STATUS.activeCurrent }),
        registryRow({ id: 2, labelStatus: LABEL_STATUS.inactiveHistorical, isActive: false }),
        registryRow({ id: 3, labelStatus: LABEL_STATUS.pendingReview }),
        registryRow({ id: 4, approvedBatchId: null }),
      ]),
    ).toMatchObject({
      sourceOfTruth: "postgres:mq_address_registry",
      postgresIsCanonicalTruth: true,
      rocksDbIsCompiledArtifactOnly: true,
      registryRowsRequireApprovedBatch: true,
      candidateOrDiscoveryDirectWritesAllowed: false,
      totalRegistryRows: 4,
      committedCompilableRows: 3,
      currentLabelRows: 1,
      timelineLabelRows: 2,
    });
  });
});
