import { LABEL_STATUS } from "./constants";

export const KV_CURRENT_LABEL_STATUSES = [LABEL_STATUS.activeCurrent, LABEL_STATUS.sanctionedCurrent] as const;

export const KV_TIMELINE_LABEL_STATUSES = [
  LABEL_STATUS.activeCurrent,
  LABEL_STATUS.inactiveHistorical,
  LABEL_STATUS.migrated,
  LABEL_STATUS.deprecated,
  LABEL_STATUS.sanctionedCurrent,
  LABEL_STATUS.sanctionedHistorical,
] as const;

export const KV_EXCLUDED_LABEL_STATUSES = [
  LABEL_STATUS.unknown,
  LABEL_STATUS.conflict,
  LABEL_STATUS.doNotUse,
  LABEL_STATUS.pendingReview,
] as const;

export type KvCompilerRegistrySourceRow = {
  id?: number;
  approvedBatchId: number | null;
  entityId: number | null;
  roleId: number | null;
  prefixCode: number | null;
  payloadHex: string | null;
  isActive: boolean;
  labelStatus: number;
};

function hasPayloadHex(value: string | null) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isCommittedKvRegistryLabel(row: KvCompilerRegistrySourceRow) {
  return (
    row.approvedBatchId !== null &&
    row.entityId !== null &&
    row.roleId !== null &&
    row.prefixCode !== null &&
    hasPayloadHex(row.payloadHex)
  );
}

export function isKvCurrentLabelSource(row: KvCompilerRegistrySourceRow) {
  return isCommittedKvRegistryLabel(row) && row.isActive && (KV_CURRENT_LABEL_STATUSES as readonly number[]).includes(row.labelStatus);
}

export function isKvTimelineLabelSource(row: KvCompilerRegistrySourceRow) {
  return isCommittedKvRegistryLabel(row) && (KV_TIMELINE_LABEL_STATUSES as readonly number[]).includes(row.labelStatus);
}

export function buildKvRegistrySourceContract(rows: KvCompilerRegistrySourceRow[]) {
  const committedRows = rows.filter(isCommittedKvRegistryLabel);
  return {
    sourceOfTruth: "postgres:mq_registry_address_labels",
    postgresIsCanonicalTruth: true,
    rocksDbIsCompiledArtifactOnly: true,
    registryRowsRequireApprovedBatch: true,
    candidateOrDiscoveryDirectWritesAllowed: false,
    currentLabelStatuses: [...KV_CURRENT_LABEL_STATUSES],
    timelineLabelStatuses: [...KV_TIMELINE_LABEL_STATUSES],
    excludedLabelStatuses: [...KV_EXCLUDED_LABEL_STATUSES],
    totalRegistryRows: rows.length,
    committedCompilableRows: committedRows.length,
    currentLabelRows: committedRows.filter(isKvCurrentLabelSource).length,
    timelineLabelRows: committedRows.filter(isKvTimelineLabelSource).length,
  };
}
