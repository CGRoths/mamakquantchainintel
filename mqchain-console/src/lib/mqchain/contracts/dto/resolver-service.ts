/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MqchainResolverBackend } from "../../runtime-env";

type ResolverRow = Record<string, any>;

export type ResolverLabel = {
  registry: ResolverRow;
  entity: ResolverRow | null;
  protocol: ResolverRow | null;
  role: ResolverRow | null;
  category: ResolverRow | null;
  sourceBatch: ResolverRow | null;
  evidence: ResolverRow[];
  evidenceSummary: any;
  status: "active" | "historical" | "inactive";
  metricEligible: boolean;
};

export type ResolverOutput = {
  normalized: {
    isValid: boolean;
    normalizedAddress: string | null;
    payloadHex?: string | null;
    [key: string]: any;
  };
  label: ResolverLabel | null;
  currentLabel: ResolverLabel | null;
  metricGroupMatch: boolean | null;
  metricGroupCode?: string | null;
  blockNumber?: number | null;
};

export type AddressResolver = {
  resolveCurrent(chainCode: string, address: string): Promise<ResolverOutput>;
  resolveAt(chainCode: string, address: string, blockNumber?: number | null): Promise<ResolverOutput>;
  checkMetricGroup(chainCode: string, address: string, metricGroupCode: string, blockNumber?: number | null): Promise<ResolverOutput>;
};

export declare const PostgresAddressResolver: AddressResolver;
export declare function getAddressResolver(backend?: MqchainResolverBackend): AddressResolver;
export declare function resolveCurrent(chainCode: string, address: string): Promise<ResolverOutput>;
export declare function resolveAt(chainCode: string, address: string, blockNumber?: number | null): Promise<ResolverOutput>;
export declare function checkMetricGroup(chainCode: string, address: string, metricGroupCode: string, blockNumber?: number | null): Promise<ResolverOutput>;
