export type ResolverEvidenceInput = {
  evidenceType: string;
  trustTier: string;
  confidenceDelta: number;
};

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function mapToObject(map: Map<string, number>) {
  return Object.fromEntries(Array.from(map.entries()).sort(([left], [right]) => left.localeCompare(right)));
}

export function summarizeResolverEvidence(evidence: ResolverEvidenceInput[]) {
  const byType = new Map<string, number>();
  const byTrust = new Map<string, number>();
  let netConfidenceDelta = 0;

  for (const item of evidence) {
    increment(byType, item.evidenceType);
    increment(byTrust, item.trustTier);
    netConfidenceDelta += item.confidenceDelta;
  }

  return {
    count: evidence.length,
    netConfidenceDelta,
    byType: mapToObject(byType),
    byTrust: mapToObject(byTrust),
  };
}
