export type ResolverEvidenceInput = {
  evidenceType: string;
  trustTier: string;
  confidenceDelta: number;
};

export type ResolverLookupSummaryInput = {
  isValid: boolean;
  hasLabel: boolean;
  blockNumber?: number | null;
  labelStatus?: "active" | "historical" | "inactive" | null;
  labelRegistryId?: number | null;
  currentRegistryId?: number | null;
  metricGroupCode?: string | null;
  metricGroupMatch?: boolean | null;
};

export type ResolverLookupMode = "current" | "point_in_time";
export type ResolverLookupOutcome = "invalid_address" | "no_label" | "active_label" | "historical_label" | "inactive_label";
export type ResolverMetricGroupOutcome = "not_requested" | "not_checked" | "member" | "not_member";

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

export function buildResolverLookupSummary(input: ResolverLookupSummaryInput) {
  const mode: ResolverLookupMode = typeof input.blockNumber === "number" ? "point_in_time" : "current";
  const timelineDiverged =
    mode === "point_in_time" &&
    typeof input.labelRegistryId === "number" &&
    typeof input.currentRegistryId === "number" &&
    input.labelRegistryId !== input.currentRegistryId;

  let outcome: ResolverLookupOutcome = "no_label";
  if (!input.isValid) {
    outcome = "invalid_address";
  } else if (!input.hasLabel) {
    outcome = "no_label";
  } else if (input.labelStatus === "historical") {
    outcome = "historical_label";
  } else if (input.labelStatus === "inactive") {
    outcome = "inactive_label";
  } else {
    outcome = "active_label";
  }

  let metricGroupOutcome: ResolverMetricGroupOutcome = "not_requested";
  if (input.metricGroupCode) {
    if (input.metricGroupMatch === true) {
      metricGroupOutcome = "member";
    } else if (input.metricGroupMatch === false) {
      metricGroupOutcome = "not_member";
    } else {
      metricGroupOutcome = "not_checked";
    }
  }

  return {
    mode,
    outcome,
    timelineDiverged,
    metricGroupOutcome,
  };
}
