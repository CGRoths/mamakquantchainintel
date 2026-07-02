import { describe, expect, it } from "vitest";

import { buildKvManifestActivationPreflight, buildPendingBatchKvManifest } from "@/lib/mqchain/kv-manifest";
import { createKvBuildManifestSchema } from "@/lib/mqchain/validators/kv-manifest";

describe("KV build manifest validation", () => {
  it("parses external compiler manifests", () => {
    const parsed = createKvBuildManifestSchema.parse({
      buildHash: "",
      status: "compiled",
      rowCount: "42",
      storageUri: "s3://mqchain/builds/hash",
      manifestJson: '{"artifactType":"rocksdb","batchId":7}',
    });

    expect(parsed).toMatchObject({
      status: "compiled",
      rowCount: 42,
      storageUri: "s3://mqchain/builds/hash",
      manifestJson: { artifactType: "rocksdb", batchId: 7 },
    });
    expect(parsed.buildHash).toBeUndefined();
  });

  it("rejects non-object manifests", () => {
    expect(() => createKvBuildManifestSchema.parse({ manifestJson: "[1,2,3]" })).toThrow();
  });

  it("builds pending batch commit handoff manifests with dictionary version", () => {
    expect(
      buildPendingBatchKvManifest({
        batchId: 7,
        registryIds: [11, 12],
        dictionaryVersion: "abc123",
      }),
    ).toEqual({
      reason: "batch_commit",
      batchId: 7,
      registryIds: [11, 12],
      dictionaryVersion: "abc123",
      artifactType: "rocksdb",
      artifactStatus: "pending_external_compile",
      note: "RocksDB compilation is external; this manifest is the Vercel control-plane handoff.",
    });
  });

  it("passes activation preflight for compiled external artifacts", () => {
    const preflight = buildKvManifestActivationPreflight({
      status: "compiled",
      buildHash: "hash-123",
      dictionaryVersion: "dict-123",
      rowCount: 2,
      storageUri: "s3://mqchain/builds/hash-123",
      manifest: {
        artifactType: "rocksdb",
        rowCount: 2,
        registryIds: [11, 12],
      },
    });

    expect(preflight.canActivate).toBe(true);
    expect(preflight.blockers).toEqual([]);
  });

  it("blocks activation without external artifact and dictionary provenance", () => {
    const preflight = buildKvManifestActivationPreflight({
      status: "compiled",
      buildHash: "hash-123",
      dictionaryVersion: null,
      rowCount: 1,
      storageUri: null,
      manifest: { artifactType: "rocksdb", rowCount: 1 },
    });

    expect(preflight.canActivate).toBe(false);
    expect(preflight.blockers.join(" ")).toContain("Dictionary version");
    expect(preflight.blockers.join(" ")).toContain("External artifact URI");
  });

  it("blocks activation when manifest row accounting disagrees with the database row", () => {
    const preflight = buildKvManifestActivationPreflight({
      status: "compiled",
      buildHash: "hash-123",
      dictionaryVersion: "dict-123",
      rowCount: 3,
      storageUri: "D:/mqchain-artifacts/kv/hash-123",
      manifest: {
        artifactType: "jsonl-kv-preview",
        rowCount: 2,
        registryIds: [11, 12],
      },
    });

    expect(preflight.canActivate).toBe(false);
    expect(preflight.blockers.join(" ")).toContain("Row count agreement");
    expect(preflight.blockers.join(" ")).toContain("Registry ID accounting");
  });
});
