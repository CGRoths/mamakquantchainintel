import { type CexFlowSideLabel } from "../../cex-flow";
import { type AddressResolver } from "./resolver-service";
export type CexFlowInput = {
    chainCode: string;
    inputAddresses: string[];
    outputAddresses: string[];
    blockNumber?: number | null;
    metricGroupCode?: string;
};
export declare function parseTransactionAddressSet(value: string): string[];
export declare function classifyCexTransactionFlow(input: CexFlowInput, resolver?: AddressResolver): Promise<{
    chainCode: string;
    metricGroupCode: string;
    blockNumber: number | null;
    classification: import("../../cex-flow").CexFlowClassification;
    metricsSummary: import("../../cex-flow").CexFlowMetricsSummary;
    inputs: CexFlowSideLabel[];
    outputs: CexFlowSideLabel[];
}>;
