import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { COMPILED_INDEX_NAMES, compileU1RecordStream, summarizeCompiledRecordStream } from "@/lib/mqchain/kv/compiled-records";
import { assertArtifactExpectedCounts, buildThreeWayParityReport } from "@/lib/mqchain/services/compiled-artifact-service";
import type { MqAddressRegistryRow } from "@/db/schema";
import { ARTIFACT_RECORDS_FILE, verifyCompiledArtifactPackage, writeCompiledArtifactPackage } from "../../tools/kv-compiler/artifact-package";
import { writeRocksDbStagingArtifact } from "../../tools/kv-compiler/rocksdb-writer";

const cleanup: string[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

function row(): MqAddressRegistryRow {
  return {
    id: 1, normalizedAddress: `0x${"11".repeat(20)}`, rawAddress: null, chainCode: "ethereum_mainnet", prefixCode: 60,
    namespaceId: 2, addressCodecId: 1, payloadHex: "11".repeat(20), entityId: 1, protocolId: null, categoryId: 10,
    roleId: 1020, componentId: null, tagsetId: null, confidenceScore: 90, labelStatus: 1, qualityTier: 3, flags: 1,
    metricUsage: null, validFromBlock: null, validToBlock: null, firstSeenBlock: null, lastSeenBlock: null,
    approvedBatchId: 1, primarySourceJobId: null, isActive: true, notes: null, metadata: {}, createdAt: new Date(0), updatedAt: new Date(0),
  };
}

async function fixtureArtifact() {
  const root = await mkdtemp(path.join(tmpdir(), "mqchain-compiled-artifact-"));
  cleanup.push(root);
  const records = compileU1RecordStream({ rows: [row()], currentRegistryIds: [1], timelineRegistryIds: [], metricMemberships: [] });
  const summaries = summarizeCompiledRecordStream(records);
  const directory = await writeRocksDbStagingArtifact({ artifactRoot: root, compileRequestHash: "a".repeat(64), records });
  await writeCompiledArtifactPackage({
    artifactDirectory: directory,
    records,
    manifest: {
      compileRequestBuildId: 7, compileRequestHash: "a".repeat(64), compileScope: "full", triggeringBatchId: 2, lastCommittedBatchId: 2,
      dictionaryVersion: "b".repeat(64), registrySnapshotHash: "c".repeat(64), artifactHash: "d".repeat(64), artifactType: "rocksdb",
      artifactStatus: "compiled", buildKind: "production", storageUri: "file:///tmp/build", rowCount: 1,
      expectedCounts: { addressLabelCurrent: 1, addressLabelTimeline: 0, metricGroupMembership: 0 },
      dictionarySchemaVersion: "MQD-U1", keySchemaVersion: "MQK-U1", valueSchemaVersion: "MQV-U1", timelineSchemaVersion: "MQT-U1", metricSchemaVersion: "MQG-U1",
      indexes: Object.fromEntries(COMPILED_INDEX_NAMES.map(indexName => [indexName, { indexName, rowCount: summaries[indexName].rowCount, hash: summaries[indexName].hash, storageUri: `file:///tmp/build/${indexName}` }])) as never,
    },
  });
  return { directory, records };
}

describe("compiled artifact lifecycle", () => {
  it("verifies the exact registration package against all real RocksDB indexes", async () => {
    const fixture = await fixtureArtifact();
    const verified = await verifyCompiledArtifactPackage(fixture.directory);
    expect(verified.records.map(record => record.recordHash)).toEqual(fixture.records.map(record => record.recordHash));
    expect(verified.summaries.address_label_current.rowCount).toBe(1);
  });

  it("fails closed when the persisted registration package is tampered", async () => {
    const fixture = await fixtureArtifact();
    const file = path.join(fixture.directory, ARTIFACT_RECORDS_FILE);
    const value = await readFile(file, "utf8");
    await writeFile(file, value.replace(/"valueHex":"[0-9a-f]+"/, '"valueHex":"00"'));
    await expect(verifyCompiledArtifactPackage(fixture.directory)).rejects.toThrow(/artifact_records_hash_mismatch/);
  });

  it("reports PostgreSQL and RocksDB mismatches independently", () => {
    const canonical = compileU1RecordStream({ rows: [row()], currentRegistryIds: [1], timelineRegistryIds: [], metricMemberships: [] });
    const altered = canonical.map(record => ({ ...record, valueBytes: Buffer.alloc(record.valueBytes.length, 9), recordHash: createHash("sha256").update("changed").digest("hex") }));
    const postgresMismatch = buildThreeWayParityReport({ buildId: 8, compileRequestBuildId: 7, canonical, postgres: altered, rocksDb: canonical, dictionaryVersionMatched: true, registrySnapshotHashMatched: true });
    expect(postgresMismatch.indexes.address_label_current.postgresValueMismatches).toBe(1);
    expect(postgresMismatch.indexes.address_label_current.rocksDbValueMismatches).toBe(0);
    expect(postgresMismatch.passed).toBe(false);
    const rocksMismatch = buildThreeWayParityReport({ buildId: 8, compileRequestBuildId: 7, canonical, postgres: canonical, rocksDb: altered, dictionaryVersionMatched: true, registrySnapshotHashMatched: true });
    expect(rocksMismatch.indexes.address_label_current.postgresValueMismatches).toBe(0);
    expect(rocksMismatch.indexes.address_label_current.rocksDbValueMismatches).toBe(1);
  });

  it("fails closed when artifact index counts differ from the canonical snapshot", () => {
    const canonical = { addressLabelCurrent: 11, addressLabelTimeline: 1, metricGroupMembership: 11 };
    expect(() => assertArtifactExpectedCounts(canonical, canonical)).not.toThrow();
    expect(() => assertArtifactExpectedCounts(
      { addressLabelCurrent: 10, addressLabelTimeline: 2, metricGroupMembership: 11 },
      canonical,
    )).toThrowError(expect.objectContaining({ code: "artifact_expected_count_mismatch", status: 409 }));
  });
});
