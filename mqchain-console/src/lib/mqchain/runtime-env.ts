import { z } from "zod";

export const resolverBackendSchema = z.enum(["postgres", "rocksdb"]).default("postgres");

export type MqchainResolverBackend = z.infer<typeof resolverBackendSchema>;

export function getMqchainResolverBackend(value = process.env.MQCHAIN_RESOLVER_BACKEND): MqchainResolverBackend {
  return resolverBackendSchema.parse(value?.trim() || undefined);
}

export function getMqchainKvArtifactRoot(value = process.env.MQCHAIN_KV_ARTIFACT_ROOT) {
  const trimmed = value?.trim();
  return trimmed || "build/mqchain-kv";
}
