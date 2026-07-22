import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { asc, eq, inArray } from "drizzle-orm";

import { getDb } from "../../src/db/client";
import { mqRegistryAddressLabels, mqBuildKvBuilds, mqDictRoles } from "../../src/db/schema";
import { COMPILED_INDEX_NAMES, compileU1RecordStream, summarizeCompiledRecordStream } from "../../src/lib/mqchain/kv/compiled-records";
import { MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS } from "../../src/lib/mqchain/kv/contract";
import { computeFullKvBuildRequestHash } from "../../src/lib/mqchain/kv-manifest";
import { loadFullKvCompilationSnapshot } from "../../src/lib/mqchain/services/full-kv-build-service";
import { writeCompiledArtifactPackage, verifyCompiledArtifactPackage } from "./artifact-package";
import { compiledArtifactDirectory, promoteRocksDbArtifact, writeRocksDbStagingArtifact } from "./rocksdb-writer";

export type FullRequestManifest = {
  reason: "full_registry_compile";
  compileScope: "full";
  triggeringBatchId: number;
  lastCommittedBatchId: number;
  registryIds: number[];
  registrySnapshotHash: string;
  dictionaryVersion: string;
  expectedCounts: { addressLabelCurrent: number; addressLabelTimeline: number; metricGroupMembership: number };
  artifactType: "rocksdb";
} & typeof MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS;

export function requireFullRequest(build: typeof mqBuildKvBuilds.$inferSelect): FullRequestManifest {
  const manifest = build.manifest as Partial<FullRequestManifest>;
  if (build.status !== "pending") throw new Error(`compile_request_not_pending:${build.id}:${build.status}`);
  if (manifest.reason !== "full_registry_compile" || manifest.compileScope !== "full") throw new Error(`compile_request_not_full:${build.id}`);
  if (!manifest.expectedCounts || !Array.isArray(manifest.registryIds)) throw new Error(`compile_request_incomplete:${build.id}`);
  return manifest as FullRequestManifest;
}

export function assertRequestMatchesSnapshot(request: FullRequestManifest, snapshot: Awaited<ReturnType<typeof loadFullKvCompilationSnapshot>>) {
  if (request.dictionaryVersion !== snapshot.dictionaryVersion) throw new Error("dictionary_version_mismatch");
  if (request.registrySnapshotHash !== snapshot.registrySnapshotHash) throw new Error("registry_snapshot_hash_mismatch");
  if (JSON.stringify(request.registryIds) !== JSON.stringify(snapshot.registryIds)) throw new Error("registry_id_snapshot_mismatch");
  if (JSON.stringify(request.expectedCounts) !== JSON.stringify(snapshot.expectedCounts)) throw new Error("expected_count_mismatch");
}

export function compiledArtifactHash(requestHash: string, summaries: ReturnType<typeof summarizeCompiledRecordStream>) {
  const hash = createHash("sha256").update(`MQCHAIN-U1-COMPILED-1\n${requestHash}\n`);
  for (const indexName of COMPILED_INDEX_NAMES) hash.update(`${indexName}:${summaries[indexName].rowCount}:${summaries[indexName].hash}\n`);
  return hash.digest("hex");
}

export async function compilePendingFullBuild(buildId: number, artifactRoot: string) {
  const db = getDb();
  const prepared = await db.transaction(async tx => {
    const [requestBuild] = await tx.select().from(mqBuildKvBuilds).where(eq(mqBuildKvBuilds.id, buildId)).limit(1);
    if (!requestBuild) throw new Error(`compile_request_not_found:${buildId}`);
    const request = requireFullRequest(requestBuild);
    const requestHash = computeFullKvBuildRequestHash(request as never);
    if (requestHash !== requestBuild.buildHash) throw new Error("compile_request_hash_mismatch");
    const snapshot = await loadFullKvCompilationSnapshot(tx);
    assertRequestMatchesSnapshot(request, snapshot);
    const rows = snapshot.registryIds.length ? await tx
      .select({ registry: mqRegistryAddressLabels, resolvedCategoryId: mqDictRoles.categoryId })
      .from(mqRegistryAddressLabels)
      .leftJoin(mqDictRoles, eq(mqRegistryAddressLabels.roleId, mqDictRoles.roleId))
      .where(inArray(mqRegistryAddressLabels.id, [...snapshot.registryIds]))
      .orderBy(asc(mqRegistryAddressLabels.id)) : [];
    const records = compileU1RecordStream({
      rows: rows.map(row => ({ ...row.registry, resolvedCategoryId: row.resolvedCategoryId })),
      currentRegistryIds: snapshot.currentRegistryIds,
      timelineRegistryIds: snapshot.timelineRegistryIds,
      metricMemberships: snapshot.metricMemberships,
    });
    const summaries = summarizeCompiledRecordStream(records);
    return { requestBuild, request, requestHash, snapshot, records, summaries, artifactHash: compiledArtifactHash(requestHash, summaries) };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });

  const destination = compiledArtifactDirectory(artifactRoot, prepared.artifactHash);
  const stagingDirectory = await writeRocksDbStagingArtifact({ artifactRoot, compileRequestHash: prepared.requestHash, records: prepared.records });
  const storageUri = pathToFileURL(destination).href;
  await writeCompiledArtifactPackage({
    artifactDirectory: stagingDirectory,
    records: prepared.records,
    manifest: {
      compileRequestBuildId: prepared.requestBuild.id,
      compileRequestHash: prepared.requestHash,
      compileScope: "full",
      triggeringBatchId: prepared.request.triggeringBatchId,
      lastCommittedBatchId: prepared.request.lastCommittedBatchId,
      dictionaryVersion: prepared.snapshot.dictionaryVersion,
      registrySnapshotHash: prepared.snapshot.registrySnapshotHash,
      artifactHash: prepared.artifactHash,
      artifactType: "rocksdb",
      artifactStatus: "compiled",
      buildKind: "production",
      storageUri,
      rowCount: prepared.snapshot.registryIds.length,
      expectedCounts: prepared.snapshot.expectedCounts,
      ...MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS,
      indexes: Object.fromEntries(COMPILED_INDEX_NAMES.map(indexName => [indexName, {
        indexName,
        rowCount: prepared.summaries[indexName].rowCount,
        hash: prepared.summaries[indexName].hash,
        storageUri: `${storageUri}/${indexName}`,
      }])) as never,
    },
  });
  await verifyCompiledArtifactPackage(stagingDirectory);
  const artifactDirectory = await promoteRocksDbArtifact({ artifactRoot, stagingDirectory, artifactHash: prepared.artifactHash });
  const verified = await verifyCompiledArtifactPackage(artifactDirectory);
  return { artifactDirectory, manifest: verified.manifest, summaries: verified.summaries };
}
