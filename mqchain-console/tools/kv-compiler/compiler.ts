import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { asc, eq, inArray } from "drizzle-orm";

import { getDb } from "../../src/db/client";
import {
  mqAddressRegistry,
  mqKvBuilds,
  mqKvCompiledEntries,
  mqKvIndexManifests,
  mqKvRoleDict,
  mqKvValidationRuns,
} from "../../src/db/schema";
import {
  COMPILED_INDEX_NAMES,
  compileU1RecordStream,
  semanticHash,
  summarizeCompiledRecordStream,
  type CompiledU1Record,
} from "../../src/lib/mqchain/kv/compiled-records";
import { MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS } from "../../src/lib/mqchain/kv/contract";
import { computeFullKvBuildRequestHash } from "../../src/lib/mqchain/kv-manifest";
import { loadFullKvCompilationSnapshot } from "../../src/lib/mqchain/services/full-kv-build-service";
import { hashJson } from "../../src/lib/mqchain/services/service-utils";
import { promoteRocksDbArtifact, readRocksDbRecords, writeRocksDbStagingArtifact } from "./rocksdb-writer";

type FullRequestManifest = {
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

function requireFullRequest(build: typeof mqKvBuilds.$inferSelect): FullRequestManifest {
  const manifest = build.manifest as Partial<FullRequestManifest>;
  if (build.status !== "pending") throw new Error(`compile_request_not_pending:${build.id}:${build.status}`);
  if (manifest.reason !== "full_registry_compile" || manifest.compileScope !== "full") throw new Error(`compile_request_not_full:${build.id}`);
  if (!manifest.expectedCounts || !Array.isArray(manifest.registryIds)) throw new Error(`compile_request_incomplete:${build.id}`);
  return manifest as FullRequestManifest;
}

function assertRequestMatchesSnapshot(request: FullRequestManifest, snapshot: Awaited<ReturnType<typeof loadFullKvCompilationSnapshot>>) {
  if (request.dictionaryVersion !== snapshot.dictionaryVersion) throw new Error("dictionary_version_mismatch");
  if (request.registrySnapshotHash !== snapshot.registrySnapshotHash) throw new Error("registry_snapshot_hash_mismatch");
  if (JSON.stringify(request.registryIds) !== JSON.stringify(snapshot.registryIds)) throw new Error("registry_id_snapshot_mismatch");
  if (JSON.stringify(request.expectedCounts) !== JSON.stringify(snapshot.expectedCounts)) throw new Error("expected_count_mismatch");
}

function artifactHash(requestHash: string, summaries: ReturnType<typeof summarizeCompiledRecordStream>) {
  const hash = createHash("sha256").update(`MQCHAIN-U1-COMPILED-1\n${requestHash}\n`);
  for (const indexName of COMPILED_INDEX_NAMES) hash.update(`${indexName}:${summaries[indexName].rowCount}:${summaries[indexName].hash}\n`);
  return hash.digest("hex");
}

function compareRecords(expected: readonly Pick<CompiledU1Record, "keyBytes" | "valueBytes">[], actual: readonly { keyBytes: Buffer; valueBytes: Buffer }[]) {
  const expectedByKey = new Map(expected.map(record => [record.keyBytes.toString("hex"), record.valueBytes]));
  const actualByKey = new Map(actual.map(record => [record.keyBytes.toString("hex"), record.valueBytes]));
  let missing = 0, extra = 0, mismatches = 0;
  for (const [key, value] of expectedByKey) {
    const found = actualByKey.get(key);
    if (!found) missing += 1;
    else if (!found.equals(value)) mismatches += 1;
  }
  for (const key of actualByKey.keys()) if (!expectedByKey.has(key)) extra += 1;
  return { missing, extra, mismatches, passed: missing === 0 && extra === 0 && mismatches === 0 };
}

async function insertCompiledEntries(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], buildId: number, records: readonly CompiledU1Record[]) {
  const chunkSize = 500;
  for (let offset = 0; offset < records.length; offset += chunkSize) {
    const chunk = records.slice(offset, offset + chunkSize);
    await tx.insert(mqKvCompiledEntries).values(chunk.map(record => ({ ...record, buildId })));
  }
}

export async function compilePendingFullBuild(buildId: number, artifactRoot: string) {
  const db = getDb();
  const prepared = await db.transaction(async tx => {
    const [requestBuild] = await tx.select().from(mqKvBuilds).where(eq(mqKvBuilds.id, buildId)).limit(1).for("update");
    if (!requestBuild) throw new Error(`compile_request_not_found:${buildId}`);
    const request = requireFullRequest(requestBuild);
    const requestHash = computeFullKvBuildRequestHash(request as never);
    if (requestHash !== requestBuild.buildHash) throw new Error("compile_request_hash_mismatch");
    const snapshot = await loadFullKvCompilationSnapshot(tx);
    assertRequestMatchesSnapshot(request, snapshot);
    const rows = snapshot.registryIds.length ? await tx
      .select({ registry: mqAddressRegistry, resolvedCategoryId: mqKvRoleDict.categoryId })
      .from(mqAddressRegistry)
      .leftJoin(mqKvRoleDict, eq(mqAddressRegistry.roleId, mqKvRoleDict.roleId))
      .where(inArray(mqAddressRegistry.id, [...snapshot.registryIds]))
      .orderBy(asc(mqAddressRegistry.id)) : [];
    const records = compileU1RecordStream({
      rows: rows.map(row => ({ ...row.registry, resolvedCategoryId: row.resolvedCategoryId })),
      currentRegistryIds: snapshot.currentRegistryIds,
      timelineRegistryIds: snapshot.timelineRegistryIds,
      metricMemberships: snapshot.metricMemberships,
    });
    const summaries = summarizeCompiledRecordStream(records);
    const compiledHash = artifactHash(requestHash, summaries);
    let [compiledBuild] = await tx.select().from(mqKvBuilds).where(eq(mqKvBuilds.buildHash, compiledHash)).limit(1).for("update");
    if (compiledBuild?.status === "active" || compiledBuild?.status === "superseded") throw new Error(`immutable_compiled_build:${compiledBuild.id}`);
    if (!compiledBuild) {
      [compiledBuild] = await tx.insert(mqKvBuilds).values({
        buildHash: compiledHash, dictionaryVersion: snapshot.dictionaryVersion, buildKind: "base", compileRequestBuildId: requestBuild.id,
        lastCommittedBatchId: request.lastCommittedBatchId, status: "pending", rowCount: records.length,
        manifest: { artifactStatus: "compiling", compileScope: "full", compileRequestBuildId: requestBuild.id, compileRequestHash: requestHash },
      }).returning();
    }
    if (compiledBuild.compileRequestBuildId !== requestBuild.id) throw new Error("compiled_build_request_lineage_mismatch");
    await tx.delete(mqKvCompiledEntries).where(eq(mqKvCompiledEntries.buildId, compiledBuild.id));
    await insertCompiledEntries(tx, compiledBuild.id, records);
    return { requestBuild, request, requestHash, snapshot, records, summaries, compiledHash, compiledBuild };
  }, { isolationLevel: "repeatable read" });

  const stagingDirectory = await writeRocksDbStagingArtifact({ artifactRoot, compileRequestHash: prepared.requestHash, records: prepared.records });
  const postgresRows = await db.select({ indexName: mqKvCompiledEntries.indexName, keyBytes: mqKvCompiledEntries.keyBytes, valueBytes: mqKvCompiledEntries.valueBytes })
    .from(mqKvCompiledEntries)
    .where(eq(mqKvCompiledEntries.buildId, prepared.compiledBuild.id))
    .orderBy(asc(mqKvCompiledEntries.indexName), asc(mqKvCompiledEntries.ordinal));
  const indexReports: Record<string, unknown> = {};
  let rocksDbRows = 0;
  let missingInRocksDb = 0;
  let extraInRocksDb = 0;
  let rocksDbValueMismatchCount = 0;
  let missingInPostgresCompiled = 0;
  let extraInPostgresCompiled = 0;
  let postgresValueMismatchCount = 0;
  for (const indexName of COMPILED_INDEX_NAMES) {
    const expected = prepared.records.filter(record => record.indexName === indexName);
    const postgres = postgresRows.filter(record => record.indexName === indexName);
    const postgresParity = compareRecords(expected, postgres);
    const actual = await readRocksDbRecords(stagingDirectory, indexName);
    const parity = compareRecords(expected, actual);
    const rocksHash = semanticHash(actual);
    const postgresHash = semanticHash(postgres);
    const semanticHashMatched = rocksHash === prepared.summaries[indexName].hash && postgresHash === prepared.summaries[indexName].hash;
    indexReports[indexName] = { canonicalRows: expected.length, postgresCompiledRows: postgres.length, rocksDbRows: actual.length, missingInPostgresCompiled: postgresParity.missing, extraInPostgresCompiled: postgresParity.extra, postgresValueMismatches: postgresParity.mismatches, missingInRocksDb: parity.missing, extraInRocksDb: parity.extra, rocksDbValueMismatches: parity.mismatches, duplicateKeys: 0, semanticHashMatched, passed: postgresParity.passed && parity.passed && semanticHashMatched };
    missingInPostgresCompiled += postgresParity.missing;
    extraInPostgresCompiled += postgresParity.extra;
    postgresValueMismatchCount += postgresParity.mismatches;
    rocksDbRows += actual.length;
    missingInRocksDb += parity.missing;
    extraInRocksDb += parity.extra;
    rocksDbValueMismatchCount += parity.mismatches;
  }
  const passed = Object.values(indexReports).every(report => (report as { passed: boolean }).passed);
  if (!passed) throw new Error("rocksdb_artifact_parity_failed");
  const artifactDirectory = await promoteRocksDbArtifact({ artifactRoot, stagingDirectory, artifactHash: prepared.compiledHash });
  const storageUri = pathToFileURL(artifactDirectory).href;
  const report = { buildId: prepared.compiledBuild.id, compileRequestBuildId: prepared.requestBuild.id, dictionaryVersionMatched: true, registrySnapshotHashMatched: true, indexes: indexReports, passed };
  const reportHash = hashJson(report);

  const finalized = await db.transaction(async tx => {
    const [validation] = await tx.insert(mqKvValidationRuns).values({
      buildId: prepared.compiledBuild.id, compileRequestBuildId: prepared.requestBuild.id, validationType: "three_way_u1_parity", status: "passed",
      dictionaryVersion: prepared.snapshot.dictionaryVersion, registrySnapshotHash: prepared.snapshot.registrySnapshotHash,
      canonicalRowCount: prepared.records.length, postgresCompiledRowCount: postgresRows.length, rocksDbRowCount: rocksDbRows,
      missingInPostgresCompiled, extraInPostgresCompiled, postgresValueMismatchCount,
      missingInRocksDb, extraInRocksDb, rocksDbValueMismatchCount, duplicateKeyCount: 0, semanticHashMismatchCount: 0,
      reportHash, report, completedAt: new Date(),
    }).returning();
    const manifest = {
      compileRequestBuildId: prepared.requestBuild.id, compileRequestHash: prepared.requestHash, compileScope: "full",
      triggeringBatchId: prepared.request.triggeringBatchId, lastCommittedBatchId: prepared.request.lastCommittedBatchId,
      dictionaryVersion: prepared.snapshot.dictionaryVersion, registrySnapshotHash: prepared.snapshot.registrySnapshotHash,
      artifactType: "rocksdb", artifactStatus: "compiled", buildKind: "production", storageUri,
      rowCount: prepared.snapshot.registryIds.length, expectedCounts: prepared.snapshot.expectedCounts,
      ...MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS,
      indexes: Object.fromEntries(COMPILED_INDEX_NAMES.map(indexName => [indexName, { indexName, rowCount: prepared.summaries[indexName].rowCount, hash: prepared.summaries[indexName].hash, storageUri: `${storageUri}/${indexName}` }])),
      postgresCompiledReference: { table: "mq_kv_compiled_entries", buildId: prepared.compiledBuild.id, rowCount: prepared.records.length },
      validation: { validationRunId: validation.id, status: validation.status, reportHash },
    };
    for (const indexName of COMPILED_INDEX_NAMES) await tx.insert(mqKvIndexManifests).values({
      buildId: prepared.compiledBuild.id, indexName, dictionaryVersion: prepared.snapshot.dictionaryVersion, status: "compiled",
      rowCount: prepared.summaries[indexName].rowCount, keySchemaVersion: indexName === "address_label_current" ? "MQK-U1" : indexName === "address_label_timeline" ? "MQT-Key-U1" : "MQG-Key-U1",
      valueSchemaVersion: indexName === "address_label_current" ? "MQV-U1" : indexName === "address_label_timeline" ? "MQT-U1" : "MQG-U1",
      contentHash: prepared.summaries[indexName].hash, storageUri: `${storageUri}/${indexName}`, manifestHash: prepared.summaries[indexName].hash,
      lastCommittedBatchId: prepared.request.lastCommittedBatchId, metadata: { compileRequestBuildId: prepared.requestBuild.id },
    }).onConflictDoNothing();
    const [build] = await tx.update(mqKvBuilds).set({ status: "compiled", storageUri, manifest }).where(eq(mqKvBuilds.id, prepared.compiledBuild.id)).returning();
    return { build, validation, manifest };
  });
  return { ...finalized, report, artifactDirectory };
}
