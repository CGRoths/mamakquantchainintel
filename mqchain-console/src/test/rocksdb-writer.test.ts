import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { CompiledU1Record } from "@/lib/mqchain/kv/compiled-records";
import { readRocksDbRecords, writeRocksDbStagingArtifact } from "../../tools/kv-compiler/rocksdb-writer";

const cleanup: string[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe("real RocksDB writer", () => {
  it("writes and reads the exact compiled byte stream", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mqchain-rocksdb-test-"));
    cleanup.push(root);
    const record = {
      indexName: "address_label_current", ordinal: 0, keyBytes: Buffer.from("0102", "hex"), valueBytes: Buffer.alloc(56, 7),
      keyHash: "a".repeat(64), recordHash: "b".repeat(64), registryId: 1, metricGroupId: null, namespaceId: 1, addressCodecId: 1,
    } satisfies CompiledU1Record;
    const staging = await writeRocksDbStagingArtifact({ artifactRoot: root, compileRequestHash: "c".repeat(64), records: [record] });
    const rows = await readRocksDbRecords(staging, "address_label_current");
    expect(rows).toHaveLength(1);
    expect(rows[0].keyBytes.equals(record.keyBytes)).toBe(true);
    expect(rows[0].valueBytes.equals(record.valueBytes)).toBe(true);
  });
});
