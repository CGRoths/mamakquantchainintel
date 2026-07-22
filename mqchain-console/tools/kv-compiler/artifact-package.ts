import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  COMPILED_INDEX_NAMES,
  frameCompiledRecord,
  semanticHash,
  summarizeCompiledRecordStream,
  type CompiledIndexName,
  type CompiledU1Record,
} from "../../src/lib/mqchain/kv/compiled-records";
import { stableJsonStringify } from "../../src/lib/mqchain/contracts/hash";
import { readRocksDbRecords } from "./rocksdb-writer";

export const COMPILED_ARTIFACT_SCHEMA_VERSION = "MQCHAIN-U1-ROCKSDB-ARTIFACT-1";
export const ARTIFACT_MANIFEST_FILE = "manifest.json";
export const ARTIFACT_RECORDS_FILE = "compiled-records.json";

export type CompiledArtifactManifest = Readonly<{
  schemaVersion: typeof COMPILED_ARTIFACT_SCHEMA_VERSION;
  compileRequestBuildId: number;
  compileRequestHash: string;
  compileScope: "full";
  triggeringBatchId: number;
  lastCommittedBatchId: number;
  dictionaryVersion: string;
  registrySnapshotHash: string;
  artifactHash: string;
  artifactType: "rocksdb";
  artifactStatus: "compiled";
  buildKind: "production";
  storageUri: string;
  rowCount: number;
  expectedCounts: Readonly<{ addressLabelCurrent: number; addressLabelTimeline: number; metricGroupMembership: number }>;
  dictionarySchemaVersion: string;
  keySchemaVersion: string;
  valueSchemaVersion: string;
  timelineSchemaVersion: string;
  metricSchemaVersion: string;
  recordsFile: typeof ARTIFACT_RECORDS_FILE;
  recordsHash: string;
  indexes: Readonly<Record<CompiledIndexName, Readonly<{ indexName: CompiledIndexName; rowCount: number; hash: string; storageUri: string }>>>;
}>;

type SerializedRecord = Readonly<{
  indexName: CompiledIndexName;
  ordinal: number;
  keyHex: string;
  valueHex: string;
  keyHash: string;
  recordHash: string;
  registryId: number | null;
  metricGroupId: number | null;
  namespaceId: number | null;
  addressCodecId: number | null;
}>;

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function serializeRecord(record: CompiledU1Record): SerializedRecord {
  return {
    indexName: record.indexName,
    ordinal: record.ordinal,
    keyHex: record.keyBytes.toString("hex"),
    valueHex: record.valueBytes.toString("hex"),
    keyHash: record.keyHash,
    recordHash: record.recordHash,
    registryId: record.registryId,
    metricGroupId: record.metricGroupId,
    namespaceId: record.namespaceId,
    addressCodecId: record.addressCodecId,
  };
}

function deserializeRecord(record: SerializedRecord): CompiledU1Record {
  if (!COMPILED_INDEX_NAMES.includes(record.indexName)) throw new Error(`artifact_record_index_invalid:${String(record.indexName)}`);
  if (!Number.isSafeInteger(record.ordinal) || record.ordinal < 0) throw new Error("artifact_record_ordinal_invalid");
  if (!/^(?:[0-9a-f]{2})+$/.test(record.keyHex) || !/^(?:[0-9a-f]{2})+$/.test(record.valueHex)) throw new Error("artifact_record_hex_invalid");
  const keyBytes = Buffer.from(record.keyHex, "hex");
  const valueBytes = Buffer.from(record.valueHex, "hex");
  if (sha256(keyBytes) !== record.keyHash) throw new Error("artifact_record_key_hash_mismatch");
  if (sha256(frameCompiledRecord(keyBytes, valueBytes)) !== record.recordHash) throw new Error("artifact_record_hash_mismatch");
  return Object.freeze({ ...record, keyBytes, valueBytes });
}

function recordsHash(records: readonly SerializedRecord[]) {
  return sha256(stableJsonStringify(records));
}

export async function writeCompiledArtifactPackage(input: {
  artifactDirectory: string;
  manifest: Omit<CompiledArtifactManifest, "schemaVersion" | "recordsFile" | "recordsHash">;
  records: readonly CompiledU1Record[];
}) {
  const serialized = input.records.map(serializeRecord);
  const manifest: CompiledArtifactManifest = Object.freeze({
    ...input.manifest,
    schemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
    recordsFile: ARTIFACT_RECORDS_FILE,
    recordsHash: recordsHash(serialized),
  });
  await writeFile(path.join(input.artifactDirectory, ARTIFACT_RECORDS_FILE), `${stableJsonStringify(serialized)}\n`, { encoding: "utf8", flag: "wx" });
  await writeFile(path.join(input.artifactDirectory, ARTIFACT_MANIFEST_FILE), `${stableJsonStringify(manifest)}\n`, { encoding: "utf8", flag: "wx" });
  return manifest;
}

export async function readCompiledArtifactPackage(artifactDirectory: string) {
  const manifest = JSON.parse(await readFile(path.join(artifactDirectory, ARTIFACT_MANIFEST_FILE), "utf8")) as CompiledArtifactManifest;
  if (manifest.schemaVersion !== COMPILED_ARTIFACT_SCHEMA_VERSION || manifest.recordsFile !== ARTIFACT_RECORDS_FILE) throw new Error("artifact_manifest_schema_invalid");
  const serialized = JSON.parse(await readFile(path.join(artifactDirectory, manifest.recordsFile), "utf8")) as SerializedRecord[];
  if (!Array.isArray(serialized) || recordsHash(serialized) !== manifest.recordsHash) throw new Error("artifact_records_hash_mismatch");
  return { manifest, records: Object.freeze(serialized.map(deserializeRecord)) };
}

function compareRecords(expected: readonly Pick<CompiledU1Record, "keyBytes" | "valueBytes">[], actual: readonly { keyBytes: Buffer; valueBytes: Buffer }[]) {
  if (expected.length !== actual.length) return false;
  return expected.every((record, index) => record.keyBytes.equals(actual[index].keyBytes) && record.valueBytes.equals(actual[index].valueBytes));
}

export async function verifyCompiledArtifactPackage(artifactDirectory: string) {
  const artifact = await readCompiledArtifactPackage(artifactDirectory);
  const summaries = summarizeCompiledRecordStream(artifact.records);
  for (const indexName of COMPILED_INDEX_NAMES) {
    const records = artifact.records.filter(record => record.indexName === indexName);
    if (records.some((record, ordinal) => record.ordinal !== ordinal)) throw new Error(`artifact_ordinal_mismatch:${indexName}`);
    if (records.some((record, ordinal) => ordinal > 0 && Buffer.compare(records[ordinal - 1].keyBytes, record.keyBytes) >= 0)) throw new Error(`artifact_key_order_invalid:${indexName}`);
    const rocksRows = await readRocksDbRecords(artifactDirectory, indexName);
    if (!compareRecords(records, rocksRows)) throw new Error(`artifact_rocksdb_record_mismatch:${indexName}`);
    const expected = artifact.manifest.indexes[indexName];
    if (!expected || expected.indexName !== indexName || expected.rowCount !== records.length || expected.hash !== summaries[indexName].hash || semanticHash(rocksRows) !== expected.hash) {
      throw new Error(`artifact_index_manifest_mismatch:${indexName}`);
    }
  }
  const expectedTotal = Object.values(artifact.manifest.expectedCounts).reduce((sum, count) => sum + count, 0);
  if (expectedTotal !== artifact.records.length) throw new Error("artifact_expected_count_mismatch");
  return { ...artifact, summaries };
}
