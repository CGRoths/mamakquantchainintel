import { fileURLToPath } from "node:url";

import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mqKvBuilds } from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";

import type { CompiledIndexName } from "../kv/compiled-records";
import { CompiledArtifactError } from "./compiled-artifact-service";
import { RocksDbResolver } from "../../../../tools/kv-compiler/rocksdb-resolver";

function positiveInteger(value: unknown, name: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new CompiledArtifactError(400, "mqnode_lookup_invalid", `${name} must be a positive integer.`);
  return parsed;
}

function nonNegativeInteger(value: unknown, name: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new CompiledArtifactError(400, "mqnode_lookup_invalid", `${name} must be a non-negative integer.`);
  return parsed;
}

function parseLookup(input: unknown) {
  const record = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const indexName = String(record.indexName ?? "") as CompiledIndexName;
  if (!["address_label_current", "address_label_timeline", "metric_group_membership"].includes(indexName)) throw new CompiledArtifactError(400, "mqnode_lookup_invalid", "indexName is invalid.");
  const payloadHex = String(record.payloadHex ?? "").trim().toLowerCase();
  if (!/^(?:[0-9a-f]{2})+$/.test(payloadHex)) throw new CompiledArtifactError(400, "mqnode_lookup_invalid", "payloadHex must be non-empty even-length lowercase hexadecimal.");
  const base = { namespaceId: positiveInteger(record.namespaceId, "namespaceId"), addressCodecId: positiveInteger(record.addressCodecId, "addressCodecId"), payloadHex };
  if (indexName === "address_label_timeline") return { ...base, indexName: "address_label_timeline" as const, blockHeight: nonNegativeInteger(record.blockHeight, "blockHeight") };
  if (indexName === "metric_group_membership") return { ...base, indexName: "metric_group_membership" as const, metricGroupId: positiveInteger(record.metricGroupId, "metricGroupId") };
  return { ...base, indexName: "address_label_current" as const };
}

export async function resolveActivatedArtifactU1(input: unknown) {
  await assertPermission("view");
  const lookup = parseLookup(input);
  const [build] = await getDb().select().from(mqKvBuilds).where(eq(mqKvBuilds.status, "active")).orderBy(desc(mqKvBuilds.activatedAt), desc(mqKvBuilds.id)).limit(1);
  if (!build) throw new CompiledArtifactError(404, "active_artifact_not_found", "No active MQCHAIN U1 artifact exists.");
  const manifest = build.manifest as Record<string, unknown>;
  if (manifest.artifactType !== "rocksdb" || !build.storageUri?.startsWith("file:")) throw new CompiledArtifactError(409, "active_artifact_not_servable", "Active build is not a local immutable RocksDB artifact.");
  const resolver = new RocksDbResolver(fileURLToPath(build.storageUri));
  const record = lookup.indexName === "address_label_current"
    ? (await resolver.resolveCurrent([lookup]))[0]
    : lookup.indexName === "address_label_timeline"
      ? (await resolver.resolveTimeline([lookup]))[0]
      : (await resolver.resolveMetricGroup([lookup]))[0];
  return {
    buildId: build.id,
    buildHash: build.buildHash,
    dictionaryVersion: build.dictionaryVersion,
    storageBackend: "rocksdb" as const,
    indexName: lookup.indexName,
    matched: Boolean(record),
    record: record ?? null,
  };
}
