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
