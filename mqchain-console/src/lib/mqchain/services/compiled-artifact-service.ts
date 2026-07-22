import { asc, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressRegistry,
  mqAuditLog,
  mqKvBuilds,
  mqKvCompiledEntries,
  mqKvIndexManifests,
  mqKvRoleDict,
  mqKvValidationRuns,
} from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";

import { COMPILED_INDEX_NAMES, compileU1RecordStream, semanticHash, type CompiledIndexName, type CompiledU1Record } from "../kv/compiled-records";
import { computeFullKvBuildRequestHash } from "../kv-manifest";
import { hashJson } from "./service-utils";
import { loadFullKvCompilationSnapshot } from "./full-kv-build-service";
import { verifyCompiledArtifactPackage } from "../../../../tools/kv-compiler/artifact-package";
import { assertRequestMatchesSnapshot, compiledArtifactHash, requireFullRequest } from "../../../../tools/kv-compiler/compiler";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class CompiledArtifactError extends Error {
  constructor(readonly status: 400 | 404 | 409, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = "CompiledArtifactError";
  }
}

type ExpectedCounts = Readonly<{
  addressLabelCurrent: number;
  addressLabelTimeline: number;
  metricGroupMembership: number;
}>;

export function assertArtifactExpectedCounts(artifactCounts: ExpectedCounts, snapshotCounts: ExpectedCounts) {
  if (
    artifactCounts.addressLabelCurrent !== snapshotCounts.addressLabelCurrent ||
    artifactCounts.addressLabelTimeline !== snapshotCounts.addressLabelTimeline ||
    artifactCounts.metricGroupMembership !== snapshotCounts.metricGroupMembership
  ) {
    throw new CompiledArtifactError(409, "artifact_expected_count_mismatch", "Artifact index counts do not match the canonical snapshot.");
  }
}

function artifactDirectory(input: unknown) {
  const value = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>).artifactDirectory : null;
  if (typeof value !== "string" || !value.trim()) throw new CompiledArtifactError(400, "artifact_directory_required", "artifactDirectory is required.");
  return value.trim();
}

async function loadCanonicalRecords(tx: Tx, registryIds: readonly number[], snapshot: Awaited<ReturnType<typeof loadFullKvCompilationSnapshot>>) {
  const rows = registryIds.length ? await tx
    .select({ registry: mqAddressRegistry, resolvedCategoryId: mqKvRoleDict.categoryId })
    .from(mqAddressRegistry)
    .leftJoin(mqKvRoleDict, eq(mqAddressRegistry.roleId, mqKvRoleDict.roleId))
    .where(inArray(mqAddressRegistry.id, [...registryIds]))
    .orderBy(asc(mqAddressRegistry.id)) : [];
  return compileU1RecordStream({
    rows: rows.map(row => ({ ...row.registry, resolvedCategoryId: row.resolvedCategoryId })),
    currentRegistryIds: snapshot.currentRegistryIds,
    timelineRegistryIds: snapshot.timelineRegistryIds,
    metricMemberships: snapshot.metricMemberships,
  });
}

function compareRecords(expected: readonly Pick<CompiledU1Record, "keyBytes" | "valueBytes">[], actual: readonly Pick<CompiledU1Record, "keyBytes" | "valueBytes">[]) {
  const expectedByKey = new Map(expected.map(record => [record.keyBytes.toString("hex"), record.valueBytes]));
  const actualByKey = new Map(actual.map(record => [record.keyBytes.toString("hex"), record.valueBytes]));
  let missing = 0;
  let extra = 0;
  let mismatches = 0;
  for (const [key, value] of expectedByKey) {
    const found = actualByKey.get(key);
    if (!found) missing += 1;
    else if (!found.equals(value)) mismatches += 1;
  }
  for (const key of actualByKey.keys()) if (!expectedByKey.has(key)) extra += 1;
  return { missing, extra, mismatches, duplicateKeys: actual.length - actualByKey.size };
}

export function buildThreeWayParityReport(input: {
  buildId: number;
  compileRequestBuildId: number;
  canonical: readonly CompiledU1Record[];
  postgres: readonly CompiledU1Record[];
  rocksDb: readonly CompiledU1Record[];
  dictionaryVersionMatched: boolean;
  registrySnapshotHashMatched: boolean;
}) {
  const indexes = Object.fromEntries(COMPILED_INDEX_NAMES.map(indexName => {
    const canonical = input.canonical.filter(record => record.indexName === indexName);
    const postgres = input.postgres.filter(record => record.indexName === indexName);
    const rocksDb = input.rocksDb.filter(record => record.indexName === indexName);
    const pg = compareRecords(canonical, postgres);
    const rocks = compareRecords(canonical, rocksDb);
    const expectedHash = semanticHash(canonical);
    const semanticHashMatched = semanticHash(postgres) === expectedHash && semanticHash(rocksDb) === expectedHash;
    const report = {
      canonicalRows: canonical.length,
      postgresCompiledRows: postgres.length,
      rocksDbRows: rocksDb.length,
      missingInPostgresCompiled: pg.missing,
      extraInPostgresCompiled: pg.extra,
      postgresValueMismatches: pg.mismatches,
      missingInRocksDb: rocks.missing,
      extraInRocksDb: rocks.extra,
      rocksDbValueMismatches: rocks.mismatches,
      duplicateKeys: pg.duplicateKeys + rocks.duplicateKeys,
      semanticHashMatched,
      passed: pg.missing === 0 && pg.extra === 0 && pg.mismatches === 0 && rocks.missing === 0 && rocks.extra === 0 && rocks.mismatches === 0 && pg.duplicateKeys === 0 && rocks.duplicateKeys === 0 && semanticHashMatched,
    };
    return [indexName, report];
  })) as Record<CompiledIndexName, {
    canonicalRows: number; postgresCompiledRows: number; rocksDbRows: number;
    missingInPostgresCompiled: number; extraInPostgresCompiled: number; postgresValueMismatches: number;
    missingInRocksDb: number; extraInRocksDb: number; rocksDbValueMismatches: number;
    duplicateKeys: number; semanticHashMatched: boolean; passed: boolean;
  }>;
  return {
    buildId: input.buildId,
    compileRequestBuildId: input.compileRequestBuildId,
    dictionaryVersionMatched: input.dictionaryVersionMatched,
    registrySnapshotHashMatched: input.registrySnapshotHashMatched,
    indexes,
    passed: input.dictionaryVersionMatched && input.registrySnapshotHashMatched && Object.values(indexes).every(report => report.passed),
  };
}

async function insertCompiledEntries(tx: Tx, buildId: number, records: readonly CompiledU1Record[]) {
  for (let offset = 0; offset < records.length; offset += 500) {
    await tx.insert(mqKvCompiledEntries).values(records.slice(offset, offset + 500).map(record => ({ ...record, buildId })));
  }
}

function totals(report: ReturnType<typeof buildThreeWayParityReport>) {
  const rows = Object.values(report.indexes);
  return {
    canonicalRowCount: rows.reduce((sum, row) => sum + row.canonicalRows, 0),
    postgresCompiledRowCount: rows.reduce((sum, row) => sum + row.postgresCompiledRows, 0),
    rocksDbRowCount: rows.reduce((sum, row) => sum + row.rocksDbRows, 0),
    missingInPostgresCompiled: rows.reduce((sum, row) => sum + row.missingInPostgresCompiled, 0),
    extraInPostgresCompiled: rows.reduce((sum, row) => sum + row.extraInPostgresCompiled, 0),
    postgresValueMismatchCount: rows.reduce((sum, row) => sum + row.postgresValueMismatches, 0),
    missingInRocksDb: rows.reduce((sum, row) => sum + row.missingInRocksDb, 0),
    extraInRocksDb: rows.reduce((sum, row) => sum + row.extraInRocksDb, 0),
    rocksDbValueMismatchCount: rows.reduce((sum, row) => sum + row.rocksDbValueMismatches, 0),
    duplicateKeyCount: rows.reduce((sum, row) => sum + row.duplicateKeys, 0),
    semanticHashMismatchCount: rows.filter(row => !row.semanticHashMatched).length,
  };
}

export async function runCompiledArtifactParity(input: unknown) {
  const actor = await assertPermission("batch:commit");
  const directory = artifactDirectory(input);
  const artifact = await verifyCompiledArtifactPackage(directory).catch(error => {
    throw new CompiledArtifactError(409, "artifact_verification_failed", error instanceof Error ? error.message : "Artifact verification failed.");
  });
  const db = getDb();
  return db.transaction(async tx => {
    const [requestBuild] = await tx.select().from(mqKvBuilds).where(eq(mqKvBuilds.id, artifact.manifest.compileRequestBuildId)).limit(1).for("update");
    if (!requestBuild) throw new CompiledArtifactError(404, "compile_request_not_found", "Compile request was not found.");
    const request = requireFullRequest(requestBuild);
    const requestHash = computeFullKvBuildRequestHash(request as never);
    if (requestHash !== requestBuild.buildHash || requestHash !== artifact.manifest.compileRequestHash) throw new CompiledArtifactError(409, "compile_request_hash_mismatch", "Compile request hash does not match the artifact.");
    const snapshot = await loadFullKvCompilationSnapshot(tx);
    try { assertRequestMatchesSnapshot(request, snapshot); }
    catch (error) { throw new CompiledArtifactError(409, "compile_snapshot_mismatch", error instanceof Error ? error.message : "Compilation snapshot changed."); }
    assertArtifactExpectedCounts(artifact.manifest.expectedCounts, snapshot.expectedCounts);
    const canonical = await loadCanonicalRecords(tx, snapshot.registryIds, snapshot);
    const expectedArtifactHash = compiledArtifactHash(requestHash, artifact.summaries);
    if (expectedArtifactHash !== artifact.manifest.artifactHash || snapshot.dictionaryVersion !== artifact.manifest.dictionaryVersion || snapshot.registrySnapshotHash !== artifact.manifest.registrySnapshotHash) {
      throw new CompiledArtifactError(409, "artifact_snapshot_mismatch", "Artifact lineage does not match the canonical snapshot.");
    }
    let [build] = await tx.select().from(mqKvBuilds).where(eq(mqKvBuilds.buildHash, artifact.manifest.artifactHash)).limit(1).for("update");
    if (!build) {
      [build] = await tx.insert(mqKvBuilds).values({
        buildHash: artifact.manifest.artifactHash,
        dictionaryVersion: artifact.manifest.dictionaryVersion,
        buildKind: "base",
        compileRequestBuildId: requestBuild.id,
        lastCommittedBatchId: artifact.manifest.lastCommittedBatchId,
        status: "pending",
        rowCount: artifact.manifest.rowCount,
        storageUri: artifact.manifest.storageUri,
        manifest: { ...artifact.manifest, artifactStatus: "parity_pending" },
        createdBy: actor.id,
      }).returning();
    }
    if (build.compileRequestBuildId !== requestBuild.id) throw new CompiledArtifactError(409, "compiled_build_lineage_mismatch", "Compiled build belongs to another request.");
    if (build.status === "pending") {
      await tx.delete(mqKvCompiledEntries).where(eq(mqKvCompiledEntries.buildId, build.id));
      await insertCompiledEntries(tx, build.id, artifact.records);
    }
    const postgresRows = await tx.select().from(mqKvCompiledEntries).where(eq(mqKvCompiledEntries.buildId, build.id)).orderBy(asc(mqKvCompiledEntries.indexName), asc(mqKvCompiledEntries.ordinal));
    const postgres = postgresRows.map(row => ({ ...row, indexName: row.indexName as CompiledIndexName }));
    const report = buildThreeWayParityReport({
      buildId: build.id,
      compileRequestBuildId: requestBuild.id,
      canonical,
      postgres,
      rocksDb: artifact.records,
      dictionaryVersionMatched: build.dictionaryVersion === snapshot.dictionaryVersion,
      registrySnapshotHashMatched: artifact.manifest.registrySnapshotHash === snapshot.registrySnapshotHash,
    });
    const reportHash = hashJson(report);
    const countTotals = totals(report);
    const [validation] = await tx.insert(mqKvValidationRuns).values({
      buildId: build.id,
      compileRequestBuildId: requestBuild.id,
      validationType: "three_way_u1_parity",
      status: report.passed ? "passed" : "failed",
      dictionaryVersion: snapshot.dictionaryVersion,
      registrySnapshotHash: snapshot.registrySnapshotHash,
      ...countTotals,
      reportHash,
      report,
      completedAt: new Date(),
    }).returning();
    if (build.status === "pending") {
      [build] = await tx.update(mqKvBuilds).set({
        storageUri: artifact.manifest.storageUri,
        manifest: {
          ...artifact.manifest,
          artifactStatus: report.passed ? "parity_passed" : "parity_failed",
          postgresCompiledReference: { table: "mq_kv_compiled_entries", buildId: build.id, rowCount: postgres.length },
          validation: { validationRunId: validation.id, status: validation.status, reportHash },
        },
      }).where(eq(mqKvBuilds.id, build.id)).returning();
    }
    await tx.insert(mqAuditLog).values({ actorId: actor.id, action: "kv_compiled_artifact_parity", targetTable: "mq_kv_builds", targetId: String(build.id), payload: { compileRequestBuildId: requestBuild.id, validationRunId: validation.id, status: validation.status, reportHash } });
    return { build, validation, report };
  }, { isolationLevel: "repeatable read" });
}

export async function registerCompiledArtifact(input: unknown) {
  const actor = await assertPermission("batch:commit");
  const directory = artifactDirectory(input);
  const artifact = await verifyCompiledArtifactPackage(directory).catch(error => {
    throw new CompiledArtifactError(409, "artifact_verification_failed", error instanceof Error ? error.message : "Artifact verification failed.");
  });
  const db = getDb();
  return db.transaction(async tx => {
    let [build] = await tx.select().from(mqKvBuilds).where(eq(mqKvBuilds.buildHash, artifact.manifest.artifactHash)).limit(1).for("update");
    if (!build) throw new CompiledArtifactError(409, "artifact_parity_required", "Run three-way parity before registration.");
    if (build.status === "active" || build.status === "superseded") throw new CompiledArtifactError(409, "immutable_compiled_build", "Activated or superseded builds are immutable.");
    const [validation] = await tx.select().from(mqKvValidationRuns).where(eq(mqKvValidationRuns.buildId, build.id)).orderBy(desc(mqKvValidationRuns.createdAt), desc(mqKvValidationRuns.id)).limit(1).for("update");
    if (!validation || validation.status !== "passed" || validation.validationType !== "three_way_u1_parity") throw new CompiledArtifactError(409, "artifact_parity_required", "Latest three-way parity validation must pass before registration.");
    const compiledRows = await tx.select({ id: mqKvCompiledEntries.id }).from(mqKvCompiledEntries).where(eq(mqKvCompiledEntries.buildId, build.id));
    if (compiledRows.length !== artifact.records.length) throw new CompiledArtifactError(409, "compiled_entry_count_mismatch", "PostgreSQL compiled-entry count does not match the artifact.");
    if (build.status === "compiled") return { build, validation, manifest: build.manifest, idempotent: true };
    for (const indexName of COMPILED_INDEX_NAMES) {
      const index = artifact.manifest.indexes[indexName];
      await tx.insert(mqKvIndexManifests).values({
        buildId: build.id,
        indexName,
        dictionaryVersion: artifact.manifest.dictionaryVersion,
        status: "compiled",
        rowCount: index.rowCount,
        keySchemaVersion: indexName === "address_label_current" ? "MQK-U1" : indexName === "address_label_timeline" ? "MQT-Key-U1" : "MQG-Key-U1",
        valueSchemaVersion: indexName === "address_label_current" ? "MQV-U1" : indexName === "address_label_timeline" ? "MQT-U1" : "MQG-U1",
        contentHash: index.hash,
        storageUri: index.storageUri,
        manifestHash: index.hash,
        lastCommittedBatchId: artifact.manifest.lastCommittedBatchId,
        metadata: { compileRequestBuildId: artifact.manifest.compileRequestBuildId },
        createdBy: actor.id,
      }).onConflictDoNothing();
    }
    const manifest = {
      ...artifact.manifest,
      artifactStatus: "compiled",
      postgresCompiledReference: { table: "mq_kv_compiled_entries", buildId: build.id, rowCount: artifact.records.length },
      validation: { validationRunId: validation.id, status: validation.status, reportHash: validation.reportHash },
    };
    [build] = await tx.update(mqKvBuilds).set({ status: "compiled", storageUri: artifact.manifest.storageUri, manifest }).where(eq(mqKvBuilds.id, build.id)).returning();
    await tx.insert(mqAuditLog).values({ actorId: actor.id, action: "kv_compiled_artifact_registered", targetTable: "mq_kv_builds", targetId: String(build.id), payload: { compileRequestBuildId: artifact.manifest.compileRequestBuildId, validationRunId: validation.id, artifactHash: artifact.manifest.artifactHash } });
    return { build, validation, manifest, idempotent: false };
  });
}
