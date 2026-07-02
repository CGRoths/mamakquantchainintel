export type RegistryCommitTarget = {
  id?: number | null;
  candidateId?: number | null;
  chainCode: string;
  normalizedAddress: string;
  roleId: number;
  validFromBlock: number | null;
  isActive: boolean;
};

function normalizeValidFrom(value: number | null | undefined) {
  return value ?? null;
}

export function registryCommitFingerprint(target: RegistryCommitTarget) {
  return [
    target.chainCode.toLowerCase(),
    target.normalizedAddress.toLowerCase(),
    target.roleId,
    normalizeValidFrom(target.validFromBlock) ?? "unknown_from",
  ].join(":");
}

export function registryTargetsConflict(left: RegistryCommitTarget, right: RegistryCommitTarget) {
  return (
    left.isActive &&
    right.isActive &&
    left.chainCode.toLowerCase() === right.chainCode.toLowerCase() &&
    left.normalizedAddress.toLowerCase() === right.normalizedAddress.toLowerCase() &&
    left.roleId === right.roleId &&
    normalizeValidFrom(left.validFromBlock) === normalizeValidFrom(right.validFromBlock)
  );
}

export function findRegistryCommitConflict(
  existingRows: RegistryCommitTarget[],
  target: RegistryCommitTarget,
  allowedReplacementId?: number | null,
) {
  if (!target.isActive) {
    return null;
  }

  return (
    existingRows.find((row) => {
      if (allowedReplacementId && row.id === allowedReplacementId) {
        return false;
      }
      return registryTargetsConflict(row, target);
    }) ?? null
  );
}

export function describeRegistryCommitTarget(target: RegistryCommitTarget) {
  return `${target.chainCode}:${target.normalizedAddress}:role=${target.roleId}:valid_from=${target.validFromBlock ?? "unknown"}`;
}
