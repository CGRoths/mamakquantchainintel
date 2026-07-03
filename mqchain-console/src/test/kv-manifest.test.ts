import { describe, expect, it } from "vitest";

import {
  buildKvManifestActivationPreflight,
  buildPendingBatchKvManifest,
  extractKvIndexManifestRecords,
  summarizeKvManifestIndexes,
  summarizePersistedKvIndexRecords,
} from "@/lib/mqchain/kv-manifest";
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

  it("extracts per-index manifest rows and optional shard rows for production KV tables", () => {
    expect(
      extractKvIndexManifestRecords(
        {
          batchId: 77,
          indexes: {
            addressLabelCurrent: {
              indexName: "address_label_current",
              path: "D:/mqchain/build/current.jsonl",
              rowCount: 2,
              hash: "current-hash",
              shards: [
                {
                  shardId: "current-00",
                  shardKey: "00",
                  shardHash: "current-shard-hash",
                  rowCount: 2,
                  path: "D:/mqchain/build/current-00.sst",
                },
              ],
            },
            metricGroupMembership: {
              indexName: "metric_group_membership",
              rowCount: 1,
              hash: "metric-hash",
            },
          },
        },
        "D:/mqchain/build",
      ),
    ).toEqual([
      {
        indexKey: "addressLabelCurrent",
        indexName: "address_label_current",
        rowCount: 2,
        storageUri: "D:/mqchain/build/current.jsonl",
        manifestHash: "current-hash",
        lastCommittedBatchId: 77,
        metadata: {
          indexKey: "addressLabelCurrent",
          indexName: "address_label_current",
          source: "kv_manifest_indexes",
          indexManifest: {
            indexName: "address_label_current",
            path: "D:/mqchain/build/current.jsonl",
            rowCount: 2,
            hash: "current-hash",
            shards: [
              {
                shardId: "current-00",
                shardKey: "00",
                shardHash: "current-shard-hash",
                rowCount: 2,
                path: "D:/mqchain/build/current-00.sst",
              },
            ],
          },
        },
        shards: [
          {
            shardId: "current-00",
            shardKey: "00",
            shardHash: "current-shard-hash",
            storageUri: "D:/mqchain/build/current-00.sst",
            rowCount: 2,
            metadata: {
              indexKey: "addressLabelCurrent",
              indexName: "address_label_current",
              source: "kv_manifest_indexes",
              shard: {
                shardId: "current-00",
                shardKey: "00",
                shardHash: "current-shard-hash",
                rowCount: 2,
                path: "D:/mqchain/build/current-00.sst",
              },
            },
          },
        ],
      },
      {
        indexKey: "metricGroupMembership",
        indexName: "metric_group_membership",
        rowCount: 1,
        storageUri: "D:/mqchain/build",
        manifestHash: "metric-hash",
        lastCommittedBatchId: 77,
        metadata: {
          indexKey: "metricGroupMembership",
          indexName: "metric_group_membership",
          source: "kv_manifest_indexes",
          indexManifest: {
            indexName: "metric_group_membership",
            rowCount: 1,
            hash: "metric-hash",
          },
        },
        shards: [],
      },
    ]);
  });

  it("summarizes persisted per-index manifest and shard rows", () => {
    const summary = summarizePersistedKvIndexRecords(
      [
        {
          id: 1,
          indexName: "address_label_current",
          dictionaryVersion: "dict-1",
          status: "compiled",
          rowCount: 2,
          storageUri: "D:/mqchain/current",
          manifestHash: "current-hash",
          lastCommittedBatchId: 10,
        },
        {
          id: 2,
          indexName: "metric_group_membership",
          dictionaryVersion: "dict-1",
          status: "compiled",
          rowCount: 1,
          storageUri: "D:/mqchain/metric",
          manifestHash: "metric-hash",
          lastCommittedBatchId: 10,
        },
        {
          id: 3,
          indexName: "custom_serving_index",
          dictionaryVersion: "dict-1",
          status: "pending",
          rowCount: 4,
          storageUri: null,
          manifestHash: null,
          lastCommittedBatchId: null,
        },
      ],
      [
        {
          manifestId: 1,
          shardId: "current-00",
          shardKey: "00",
          shardHash: "current-shard",
          storageUri: "D:/mqchain/current-00",
          rowCount: 2,
        },
        {
          manifestId: null,
          shardId: "orphan",
          shardKey: "orphan",
          shardHash: null,
          storageUri: null,
          rowCount: 9,
        },
      ],
    );

    expect(summary).toMatchObject({
      indexCount: 3,
      shardCount: 2,
      totalRowCount: 7,
      totalShardRowCount: 11,
      missingRequired: ["Address label timeline"],
      statusCounts: { compiled: 2, pending: 1 },
    });
    expect(summary.rows[0]).toMatchObject({
      indexName: "address_label_current",
      requiredKey: "addressLabelCurrent",
      requiredLabel: "Address label current",
      shardCount: 1,
      shardRowCount: 2,
    });
    expect(summary.rows[2]).toMatchObject({
      indexName: "custom_serving_index",
      requiredKey: null,
      requiredLabel: null,
      shardCount: 0,
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
