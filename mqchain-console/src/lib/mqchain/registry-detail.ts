export function extractRegistryCandidateId(metadata: Record<string, unknown> | null | undefined) {
  const raw = metadata?.candidateId;
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw)) {
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function pickRegistryResolverBlock(input: {
  validFromBlock?: number | null;
  validToBlock?: number | null;
  firstSeenBlock?: number | null;
  lastSeenBlock?: number | null;
}) {
  return input.validFromBlock ?? input.firstSeenBlock ?? input.validToBlock ?? input.lastSeenBlock ?? null;
}

export function buildRegistryResolverHref(input: {
  chainCode: string;
  normalizedAddress: string;
  blockNumber?: number | null;
  metricGroupCode?: string | null;
}) {
  const params = new URLSearchParams({
    chainCode: input.chainCode,
    address: input.normalizedAddress,
  });

  if (input.blockNumber !== undefined && input.blockNumber !== null) {
    params.set("blockNumber", String(input.blockNumber));
  }
  if (input.metricGroupCode) {
    params.set("metricGroupCode", input.metricGroupCode);
  }

  return `/mqchain/resolver?${params.toString()}`;
}
