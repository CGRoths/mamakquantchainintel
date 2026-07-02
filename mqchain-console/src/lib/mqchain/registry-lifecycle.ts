type RegistryTimelineInput = {
  validFromBlock?: number | null;
  validToBlock?: number | null;
  firstSeenBlock?: number | null;
  lastSeenBlock?: number | null;
};

function objectMetadata(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

export function inferSupersededValidToBlock(
  superseded: RegistryTimelineInput,
  replacement: RegistryTimelineInput,
  explicitValidToBlock?: number | null,
) {
  if (explicitValidToBlock) return explicitValidToBlock;
  if (superseded.validToBlock) return superseded.validToBlock;
  if (replacement.validFromBlock && replacement.validFromBlock > 1) return replacement.validFromBlock - 1;
  return superseded.lastSeenBlock ?? replacement.firstSeenBlock ?? null;
}

export function buildSupersededRegistryMetadata(
  existingMetadata: unknown,
  input: {
    replacementRegistryId: number;
    actorEmail: string;
    nowIso: string;
    reason?: string;
  },
) {
  return {
    ...objectMetadata(existingMetadata),
    supersededByRegistryId: input.replacementRegistryId,
    supersededBy: input.actorEmail,
    supersededAt: input.nowIso,
    supersessionReason: input.reason,
  };
}
