export type CexFlowSideLabel = {
  address: string;
  normalizedAddress: string | null;
  matched: boolean;
  entityId: number | null;
  entityCode: string | null;
  entityName: string | null;
  roleCode: string | null;
};

export type CexFlowClassification =
  | "cex_inflow"
  | "cex_outflow"
  | "internal_movement"
  | "inter_exchange_flow"
  | "ignore";

export type CexFlowSideSummary = {
  totalAddresses: number;
  matchedAddresses: number;
  unmatchedAddresses: number;
  entityCount: number;
  entities: string[];
  roles: Record<string, number>;
};

export type CexFlowMetricsSummary = {
  classification: CexFlowClassification;
  input: CexFlowSideSummary;
  output: CexFlowSideSummary;
  countableBoundaryAddresses: number;
  externalAddresses: number;
  entityCount: number;
  entityCodes: string[];
  metricPolicy: {
    usesMetricGroupMembership: true;
    countsMatchedBoundaryAddressesOnly: true;
  };
};

function matchedEntities(labels: CexFlowSideLabel[]) {
  const entities = new Map<number, CexFlowSideLabel>();

  for (const label of labels) {
    if (label.matched && label.entityId !== null) {
      entities.set(label.entityId, label);
    }
  }

  return entities;
}

export function classifyCexFlowSides(inputLabels: CexFlowSideLabel[], outputLabels: CexFlowSideLabel[]): CexFlowClassification {
  const inputEntities = matchedEntities(inputLabels);
  const outputEntities = matchedEntities(outputLabels);

  if (!inputEntities.size && !outputEntities.size) {
    return "ignore";
  }

  if (!inputEntities.size && outputEntities.size) {
    return "cex_inflow";
  }

  if (inputEntities.size && !outputEntities.size) {
    return "cex_outflow";
  }

  const inputEntityIds = [...inputEntities.keys()];
  const outputEntityIds = [...outputEntities.keys()];
  const union = new Set([...inputEntityIds, ...outputEntityIds]);

  if (union.size === 1) {
    return "internal_movement";
  }

  return "inter_exchange_flow";
}

function incrementRole(counts: Record<string, number>, roleCode: string | null) {
  const key = roleCode || "unknown";
  counts[key] = (counts[key] ?? 0) + 1;
}

function summarizeSide(labels: CexFlowSideLabel[]): CexFlowSideSummary {
  const entityCodes = new Set<string>();
  const roles: Record<string, number> = {};
  let matchedAddresses = 0;

  for (const label of labels) {
    if (!label.matched) {
      continue;
    }

    matchedAddresses += 1;
    if (label.entityCode) {
      entityCodes.add(label.entityCode);
    }
    incrementRole(roles, label.roleCode);
  }

  return {
    totalAddresses: labels.length,
    matchedAddresses,
    unmatchedAddresses: labels.length - matchedAddresses,
    entityCount: entityCodes.size,
    entities: Array.from(entityCodes).sort((left, right) => left.localeCompare(right)),
    roles,
  };
}

function matchedAddressKey(label: CexFlowSideLabel) {
  return label.normalizedAddress ?? label.address;
}

export function buildCexFlowMetricsSummary(
  inputLabels: CexFlowSideLabel[],
  outputLabels: CexFlowSideLabel[],
  classification = classifyCexFlowSides(inputLabels, outputLabels),
): CexFlowMetricsSummary {
  const matchedAddresses = new Set<string>();
  const entityCodes = new Set<string>();
  let externalAddresses = 0;

  for (const label of [...inputLabels, ...outputLabels]) {
    if (!label.matched) {
      externalAddresses += 1;
      continue;
    }

    matchedAddresses.add(matchedAddressKey(label));
    if (label.entityCode) {
      entityCodes.add(label.entityCode);
    }
  }

  return {
    classification,
    input: summarizeSide(inputLabels),
    output: summarizeSide(outputLabels),
    countableBoundaryAddresses: matchedAddresses.size,
    externalAddresses,
    entityCount: entityCodes.size,
    entityCodes: Array.from(entityCodes).sort((left, right) => left.localeCompare(right)),
    metricPolicy: {
      usesMetricGroupMembership: true,
      countsMatchedBoundaryAddressesOnly: true,
    },
  };
}
