export function buildBatchSourceProvenance(input: {
  requestedName?: string | null;
  fallbackName: string;
  sourceJob?: {
    sourceType: string;
    sourceName: string | null;
    sourceUrl: string | null;
  } | null;
}) {
  return {
    sourceType: input.sourceJob?.sourceType ?? "candidate_review",
    sourceName: input.requestedName || input.sourceJob?.sourceName || input.fallbackName,
    sourceUrl: input.sourceJob?.sourceUrl ?? null,
  };
}
