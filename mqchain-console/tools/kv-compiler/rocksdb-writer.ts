import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import rocksdb from "rocksdb";

import { COMPILED_INDEX_NAMES, type CompiledIndexName, type CompiledU1Record } from "../../src/lib/mqchain/kv/compiled-records";

function call<T = void>(invoke: (callback: (error?: Error | null, value?: T) => void) => void) {
  return new Promise<T>((resolve, reject) => invoke((error, value) => error ? reject(error) : resolve(value as T)));
}

function assertChild(root: string, target: string) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`unsafe_artifact_path:${target}`);
}

export function indexDirectory(root: string, indexName: CompiledIndexName) {
  return path.join(root, indexName);
}

export function compiledArtifactDirectory(artifactRoot: string, artifactHash: string) {
  const buildsRoot = path.join(path.resolve(artifactRoot), "builds");
  const destination = path.join(buildsRoot, artifactHash);
  assertChild(buildsRoot, destination);
  return destination;
}

export async function writeRocksDbStagingArtifact(input: {
  artifactRoot: string;
  compileRequestHash: string;
  records: readonly CompiledU1Record[];
  chunkSize?: number;
}) {
  const stagingRoot = path.join(path.resolve(input.artifactRoot), "staging");
  const stagingDirectory = path.join(stagingRoot, input.compileRequestHash);
  assertChild(stagingRoot, stagingDirectory);
  await rm(stagingDirectory, { recursive: true, force: true });
  await mkdir(stagingDirectory, { recursive: true });
  const chunkSize = input.chunkSize ?? Number(process.env.MQCHAIN_COMPILER_CHUNK_SIZE ?? 500);
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 10_000) throw new Error("compiler_chunk_size_invalid");

  try {
    for (const indexName of COMPILED_INDEX_NAMES) {
      const db = rocksdb(indexDirectory(stagingDirectory, indexName));
      await call(callback => db.open({ createIfMissing: true, errorIfExists: true }, callback));
      try {
        let operations: Array<{ type: "put"; key: Buffer; value: Buffer }> = [];
        for (const record of input.records) {
          if (record.indexName !== indexName) continue;
          operations.push({ type: "put", key: record.keyBytes, value: record.valueBytes });
          if (operations.length >= chunkSize) {
            await call(callback => db.batch(operations, { sync: true }, callback));
            operations = [];
          }
        }
        if (operations.length) await call(callback => db.batch(operations, { sync: true }, callback));
      } finally {
        await call(callback => db.close(callback));
      }
    }
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
  return stagingDirectory;
}

export async function promoteRocksDbArtifact(input: { artifactRoot: string; stagingDirectory: string; artifactHash: string }) {
  const buildsRoot = path.join(path.resolve(input.artifactRoot), "builds");
  const destination = compiledArtifactDirectory(input.artifactRoot, input.artifactHash);
  await mkdir(buildsRoot, { recursive: true });
  try {
    await stat(destination);
    await rm(input.stagingDirectory, { recursive: true, force: true });
    return destination;
  } catch {}
  await rename(input.stagingDirectory, destination);
  return destination;
}

export async function readRocksDbRecords(artifactDirectory: string, indexName: CompiledIndexName) {
  const db = rocksdb(indexDirectory(artifactDirectory, indexName));
  await call(callback => db.open({ createIfMissing: false }, callback));
  const records: Array<{ keyBytes: Buffer; valueBytes: Buffer }> = [];
  try {
    const iterator = db.iterator({ keyAsBuffer: true, valueAsBuffer: true });
    while (true) {
      const next = await new Promise<{ key?: Buffer; value?: Buffer }>((resolve, reject) => iterator.next((error, key, value) => error ? reject(error) : resolve({ key, value })));
      if (!next.key) break;
      records.push({ keyBytes: next.key, valueBytes: next.value ?? Buffer.alloc(0) });
    }
    await call(callback => iterator.end(callback));
  } finally {
    await call(callback => db.close(callback));
  }
  return records;
}

export async function readRocksDbValues(artifactDirectory: string, indexName: CompiledIndexName, keys: readonly Buffer[]) {
  if (!keys.length) return new Map<string, Buffer>();
  const db = rocksdb(indexDirectory(artifactDirectory, indexName));
  await call(callback => db.open({ createIfMissing: false }, callback));
  try {
    const values = await Promise.all(keys.map(async key => {
      try {
        const value = await call<Buffer>(callback => db.get(key, { asBuffer: true }, callback));
        return [key.toString("hex"), value] as const;
      } catch (error) {
        if (error instanceof Error && /notfound/i.test(error.message)) return null;
        throw error;
      }
    }));
    return new Map(values.filter((value): value is readonly [string, Buffer] => value !== null));
  } finally {
    await call(callback => db.close(callback));
  }
}
