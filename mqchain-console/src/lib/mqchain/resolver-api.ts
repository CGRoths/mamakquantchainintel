import { buildResolverLookupSummary } from "./resolver-detail";
import type { ResolverOutput } from "./contracts/dto/resolver-service";

export const RESOLVER_API_CONTRACT = {
  apiVersion: "mqchain-resolver-api-v1",
  sourceOfTruth: "postgres_registry",
  servingBackend: "postgres",
  rocksDbStatus: "external_compiled_artifact",
  mutationAllowed: false,
  registryWriteAllowed: false,
  kvWriteAllowed: false,
} as const;

export type ResolverApiResponseInput = {
  query: {
    chainCode: string;
    address: string;
    blockNumber?: number | null;
    metricGroupCode?: string | null;
  };
  result: ResolverOutput;
};

export type CexFlowApiResponseInput<TFlowResult> = {
  query: {
    chainCode: string;
    blockNumber?: number | null;
    metricGroupCode: string;
    inputAddressCount: number;
    outputAddressCount: number;
  };
  result: TFlowResult;
};

function serializeDate(value: Date | string | null | undefined) {
  return value instanceof Date ? value.toISOString() : (value ?? null);
}

function serializeResolverLabel(label: ResolverOutput["label"]) {
  if (!label) {
    return null;
  }

  return {
    registryId: label.registry.id,
    status: label.status,
    chainCode: label.registry.chainCode,
    normalizedAddress: label.registry.normalizedAddress,
    rawAddress: label.registry.rawAddress,
    entity: label.entity
      ? {
          id: label.entity.id,
          code: label.entity.entityCode,
          name: label.entity.entityName,
          type: label.entity.entityType,
        }
      : null,
    protocol: label.protocol
      ? {
          id: label.protocol.id,
          code: label.protocol.protocolCode,
          name: label.protocol.protocolName,
          type: label.protocol.protocolType,
        }
      : null,
    role: label.role
      ? {
          id: label.role.roleId,
          code: label.role.roleCode,
          name: label.role.roleName,
          metricUsageDefault: label.role.metricUsageDefault,
          boundaryClass: label.role.boundaryClass,
        }
      : null,
    category: label.category
      ? {
          id: label.category.categoryId,
          code: label.category.categoryCode,
          name: label.category.categoryName,
          metricDomain: label.category.metricDomain,
        }
      : null,
    metricEligible: label.metricEligible,
    metricUsage: label.registry.metricUsage,
    confidenceScore: label.registry.confidenceScore,
    qualityTier: label.registry.qualityTier,
    flags: label.registry.flags,
    validFromBlock: label.registry.validFromBlock,
    validToBlock: label.registry.validToBlock,
    firstSeenBlock: label.registry.firstSeenBlock,
    lastSeenBlock: label.registry.lastSeenBlock,
    approvedBatchId: label.registry.approvedBatchId,
    sourceBatch: label.sourceBatch
      ? {
          id: label.sourceBatch.id,
          status: label.sourceBatch.status,
          dictionaryVersion: label.sourceBatch.dictionaryVersion,
          committedAt: serializeDate(label.sourceBatch.committedAt),
        }
      : null,
    evidenceSummary: label.evidenceSummary,
  };
}

export function buildResolverApiResponse(input: ResolverApiResponseInput) {
  const { result } = input;
  const lookupSummary = buildResolverLookupSummary({
    isValid: result.normalized.isValid,
    hasLabel: Boolean(result.label),
    blockNumber: result.blockNumber,
    labelStatus: result.label?.status ?? null,
    labelRegistryId: result.label?.registry.id ?? null,
    currentRegistryId: result.currentLabel?.registry.id ?? null,
    metricGroupCode: result.metricGroupCode,
    metricGroupMatch: result.metricGroupMatch,
  });

  return {
    ...RESOLVER_API_CONTRACT,
    query: {
      chainCode: input.query.chainCode,
      address: input.query.address,
      blockNumber: input.query.blockNumber ?? null,
      metricGroupCode: input.query.metricGroupCode ?? null,
    },
    normalized: {
      isValid: result.normalized.isValid,
      error: result.normalized.error ?? null,
      chainCode: result.normalized.chainCode ?? null,
      normalizedAddress: result.normalized.normalizedAddress ?? null,
      addressFamily: result.normalized.addressFamily ?? null,
      prefixCode: result.normalized.prefixCode ?? null,
      payloadHex: result.normalized.payloadHex ?? null,
    },
    summary: lookupSummary,
    label: serializeResolverLabel(result.label),
    currentLabel: serializeResolverLabel(result.currentLabel),
    metricGroup: {
      code: result.metricGroupCode ?? input.query.metricGroupCode ?? null,
      match: result.metricGroupMatch,
    },
  };
}

export function buildCexFlowApiResponse<TFlowResult>(input: CexFlowApiResponseInput<TFlowResult>) {
  return {
    ...RESOLVER_API_CONTRACT,
    query: {
      chainCode: input.query.chainCode,
      blockNumber: input.query.blockNumber ?? null,
      metricGroupCode: input.query.metricGroupCode,
      inputAddressCount: input.query.inputAddressCount,
      outputAddressCount: input.query.outputAddressCount,
    },
    flow: input.result,
  };
}
