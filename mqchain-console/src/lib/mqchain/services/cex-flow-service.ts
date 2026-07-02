import { classifyCexFlowSides, type CexFlowSideLabel } from "../cex-flow";
import { checkMetricGroup } from "./resolver-service";

export type CexFlowInput = {
  chainCode: string;
  inputAddresses: string[];
  outputAddresses: string[];
  blockNumber?: number | null;
  metricGroupCode?: string;
};

function parseAddressLines(value: string) {
  return value
    .split(/[\r\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseTransactionAddressSet(value: string) {
  return parseAddressLines(value);
}

async function resolveSide(chainCode: string, addresses: string[], metricGroupCode: string, blockNumber?: number | null): Promise<CexFlowSideLabel[]> {
  return Promise.all(
    addresses.map(async (address) => {
      const resolved = await checkMetricGroup(chainCode, address, metricGroupCode, blockNumber);
      return {
        address,
        normalizedAddress: resolved.normalized.isValid ? resolved.normalized.normalizedAddress : null,
        matched: resolved.metricGroupMatch === true,
        entityId: resolved.metricGroupMatch && resolved.label?.entity ? resolved.label.entity.id : null,
        entityCode: resolved.metricGroupMatch && resolved.label?.entity ? resolved.label.entity.entityCode : null,
        entityName: resolved.metricGroupMatch && resolved.label?.entity ? resolved.label.entity.entityName : null,
        roleCode: resolved.metricGroupMatch && resolved.label?.role ? resolved.label.role.roleCode : null,
      };
    }),
  );
}

export async function classifyCexTransactionFlow(input: CexFlowInput) {
  const metricGroupCode = input.metricGroupCode || "btc_cex_flow_boundary";
  const [inputs, outputs] = await Promise.all([
    resolveSide(input.chainCode, input.inputAddresses, metricGroupCode, input.blockNumber),
    resolveSide(input.chainCode, input.outputAddresses, metricGroupCode, input.blockNumber),
  ]);

  return {
    chainCode: input.chainCode,
    metricGroupCode,
    blockNumber: input.blockNumber ?? null,
    classification: classifyCexFlowSides(inputs, outputs),
    inputs,
    outputs,
  };
}
