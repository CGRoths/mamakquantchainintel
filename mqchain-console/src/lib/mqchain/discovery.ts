import { z } from "zod";

import { getDiscoveryTemplate } from "./discovery-templates";
import { discoveryResultRowSchema } from "./validators/discovery";

export type DiscoveryResultRow = z.infer<typeof discoveryResultRowSchema>;

export function parseDiscoveryResultsJson(resultsJson: string): DiscoveryResultRow[] {
  const parsed = JSON.parse(resultsJson) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Discovery results must be a JSON array.");
  }

  return z.array(discoveryResultRowSchema).parse(parsed);
}

export function defaultEvidenceTypeForDiscovery(discoveryType: string) {
  const template = getDiscoveryTemplate(discoveryType);
  if (template) return template.evidenceType;

  if (discoveryType.includes("factory")) return "factory_event";
  if (discoveryType.includes("registry") || discoveryType.includes("address_provider")) return "registry_call";
  if (discoveryType.includes("proxy")) return "proxy_resolution";
  if (discoveryType.includes("pool") || discoveryType.includes("vault")) return "token_balance";
  if (discoveryType.includes("tx_graph")) return "tx_pattern";
  if (discoveryType.includes("llm")) return "llm_analysis";
  if (discoveryType.includes("ml")) return "ml_score";
  return "onchain_discovery";
}
