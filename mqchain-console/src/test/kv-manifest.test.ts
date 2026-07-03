import { describe, expect, it } from "vitest";

import { buildKvManifestActivationPreflight, buildPendingBatchKvManifest, summarizeKvManifestIndexes } from "@/lib/mqchain/kv-manifest";
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

  it("passes activation preflight when multi-index row counts agree", () => {
    const preflight = buildKvManifestActivationPreflight({
      status: "compiled",
      buildHash: "hash-123",
      dictionaryVersion: "dict-123",
      rowCount: 6,
      storageUri: "D:/mqchain-artifacts/kv/hash-123",
      manifest: {
        artifactType: "jsonl-kv-preview",
        rowCount: 6,
        indexes: {
          addressLabelCurrent: { rowCount: 2, hash: "current" },
          addressLabelTimeline: { rowCount: 3, hash: "timeline" },
          metricGroupMembership: { rowCount: 1, hash: "metric" },
        },
      },
    });

    expect(preflight.canActivate).toBe(true);
    expect(preflight.checks.find((check) => check.key === "indexRowCounts")).toMatchObject({
      status: "pass",
      detail: "Index row counts sum to 6 for database row count 6.",
    });
    expect(preflight.checks.find((check) => check.key === "requiredIndexes")).toMatchObject({
      status: "pass",
      detail: "Manifest declares 3 required serving indexes.",
    });
  });

  it("summarizes required serving indexes by key or declared index name", () => {
    expect(
      summarizeKvManifestIndexes({
        indexes: {
          addressLabelCurrent: { indexName: "address_label_current", rowCount: 2, hash: "current", path: "current.jsonl" },
          timeline: { indexName: "address_label_timeline", rowCount: 3, hash: "timeline", path: "timeline.jsonl" },
          metricGroupMembership: { indexName: "metric_group_membership", rowCount: 1, hash: "metric", path: "metric.jsonl" },
        },
      }),
    ).toEqual({
      hasIndexes: true,
      totalRowCount: 6,
      missingRequired: [],
      rowCountMissing: [],
      rows: [
        {
          key: "addressLabelCurrent",
          indexName: "address_label_current",
          label: "Address label current",
          present: true,
          rowCount: 2,
          hash: "current",
          path: "current.jsonl",
        },
        {
          key: "addressLabelTimeline",
          indexName: "address_label_timeline",
          label: "Address label timeline",
          present: true,
          rowCount: 3,
          hash: "timeline",
          path: "timeline.jsonl",
        },
        {
          key: "metricGroupMembership",
          indexName: "metric_group_membership",
          label: "Metric group membership",
          present: true,
          rowCount: 1,
          hash: "metric",
          path: "metric.jsonl",
        },
      ],
    });
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

  it("blocks activation when multi-index row counts disagree with the database row", () => {
    const preflight = buildKvManifestActivationPreflight({
      status: "compiled",
      buildHash: "hash-123",
      dictionaryVersion: "dict-123",
      rowCount: 6,
      storageUri: "D:/mqchain-artifacts/kv/hash-123",
      manifest: {
        artifactType: "jsonl-kv-preview",
        rowCount: 6,
        indexes: {
          addressLabelCurrent: { rowCount: 2 },
          addressLabelTimeline: { rowCount: 3 },
          metricGroupMembership: { rowCount: 2 },
        },
      },
    });

    expect(preflight.canActivate).toBe(false);
    expect(preflight.blockers.join(" ")).toContain("Index row counts");
    expect(preflight.blockers.join(" ")).toContain("sum to 7");
  });

  it("blocks activation when a declared multi-index artifact is missing a required serving index", () => {
    const preflight = buildKvManifestActivationPreflight({
      status: "compiled",
      buildHash: "hash-123",
      dictionaryVersion: "dict-123",
      rowCount: 5,
      storageUri: "D:/mqchain-artifacts/kv/hash-123",
      manifest: {
        artifactType: "jsonl-kv-preview",
        rowCount: 5,
        indexes: {
          addressLabelCurrent: { indexName: "address_label_current", rowCount: 2 },
          addressLabelTimeline: { indexName: "address_label_timeline", rowCount: 3 },
        },
      },
    });

    expect(preflight.canActivate).toBe(false);
    expect(preflight.blockers.join(" ")).toContain("Required serving indexes");
    expect(preflight.blockers.join(" ")).toContain("Metric group membership");
  });
});
