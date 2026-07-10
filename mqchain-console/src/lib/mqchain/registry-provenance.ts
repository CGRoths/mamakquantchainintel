type JsonRecord = Record<string, unknown>;

const CANONICAL_PROVENANCE_KEYS = [
  ["source_input_type", ["source_input_type", "sourceInputType"]],
  ["contract_name", ["contract_name", "contractName"]],
  ["role_source", ["role_source", "roleSource"]],
  ["source_role_label", ["source_role_label"]],
  ["source_role_labels", ["source_role_labels"]],
  ["source_sheet", ["source_sheet", "sourceSheet"]],
  ["source_url", ["source_url", "sourceUrl"]],
  ["raw_reference", ["raw_reference", "rawReference"]],
  ["source_type_overridden_by_file_extension", ["source_type_overridden_by_file_extension"]],
  ["manual_policy_override", ["manual_policy_override"]],
] as const;

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!value || typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}

export function projectCandidateRegistryProvenance(metadata: JsonRecord | null | undefined) {
  const projected: JsonRecord = {};

  for (const [canonicalKey, sourceKeys] of CANONICAL_PROVENANCE_KEYS) {
    for (const sourceKey of sourceKeys) {
      const value = metadata?.[sourceKey];
      if (value === undefined || !isJsonValue(value)) continue;
      projected[canonicalKey] = value;
      break;
    }
  }

  return projected;
}

export function buildRegistryCommitMetadata(input: {
  candidateMetadata: JsonRecord | null | undefined;
  candidateId: number;
  committedBy: string;
  labelAction: string;
  supersedesRegistryId: number | null;
  historicalOnly: boolean;
}) {
  return {
    ...projectCandidateRegistryProvenance(input.candidateMetadata),
    candidateId: input.candidateId,
    committedBy: input.committedBy,
    labelAction: input.labelAction,
    supersedesRegistryId: input.supersedesRegistryId,
    historicalOnly: input.historicalOnly,
  };
}

export function registrySourceRoleReference(metadata: JsonRecord | null | undefined) {
  const projected = projectCandidateRegistryProvenance(metadata);
  const sourceRoleLabel = projected.source_role_label;
  const sourceRoleLabels = projected.source_role_labels;

  return {
    source_role_label: typeof sourceRoleLabel === "string" ? sourceRoleLabel : null,
    source_role_labels: Array.isArray(sourceRoleLabels)
      ? sourceRoleLabels.filter((value): value is string => typeof value === "string")
      : [],
  };
}
