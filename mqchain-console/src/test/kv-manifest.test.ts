import { describe, expect, it } from "vitest";

import {
  buildKvManifestActivationPreflight,
  buildPendingBatchKvManifest,
  extractKvIndexManifestRecords,
  summarizeKvManifestIndexes,
  summarizePersistedKvIndexRecords,
} from "@/lib/mqchain/kv-manifest";
import {
  buildKvBuildDetailApiResponse,
  buildKvBuildListApiResponse,
  buildKvBuildRegistrationApiResponse,
  buildKvServingManifestApiResponse,
  KV_BUILD_DETAIL_API_CONTRACT,
  KV_BUILD_LIST_API_CONTRACT,
  KV_BUILD_REGISTRATION_API_CONTRACT,
  KV_SERVING_MANIFEST_API_CONTRACT,
} from "@/lib/mqchain/kv-serving-api";
import { MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS } from "@/lib/mqchain/kv/contract";
import { computePendingKvBuildHash } from "@/lib/mqchain/kv-manifest";
import { createKvBuildManifestSchema, kvBuildRegistrationApiRequestSchema } from "@/lib/mqchain/validators/kv-manifest";

/**
 * A complete production artifact manifest as an external RocksDB compiler is
 * expected to register it. Individual tests override one field to prove the
 * corresponding activation gate.
 */
function productionManifest(overrides: Record<string, unknown> = {}) {
  return {
    artifactType: "rocksdb",
    ...MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS,
    dictionaryVersion: "dict-123",
    registrySnapshotHash: "registry-snapshot-123",
    rowCount: 2,
    registryIds: [11, 12],
    expectedCounts: { addressLabelCurrent: 2, addressLabelTimeline: 1, metricGroupMembership: 1 },
    validation: { validationRunId: 99, status: "passed", reportHash: "a".repeat(64) },
    indexes: {
      addressLabelCurrent: { indexName: "address_label_current", rowCount: 2, hash: "current-hash" },
      addressLabelTimeline: { indexName: "address_label_timeline", rowCount: 1, hash: "timeline-hash" },
      metricGroupMembership: { indexName: "metric_group_membership", rowCount: 1, hash: "metric-hash" },
    },
    ...overrides,
  };
}

function compiledBuild(manifestOverrides: Record<string, unknown> = {}, buildOverrides: Record<string, unknown> = {}) {
  return {
    status: "compiled",
    buildHash: "hash-123",
    dictionaryVersion: "dict-123",
    rowCount: 2,
    storageUri: "s3://mqchain/builds/hash-123",
    manifest: productionManifest(manifestOverrides),
    ...buildOverrides,
  };
}

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

  it("normalizes external worker KV registration requests", () => {
    expect(
      kvBuildRegistrationApiRequestSchema.parse({
        buildHash: " hash-compiled ",
        dictionaryVersion: " dict-compiled ",
        status: "compiled",
        rowCount: "6",
        storageUri: " s3://mqchain/kv/hash-compiled ",
        manifest: {
          artifactType: "jsonl-kv-preview",
          rowCount: 6,
        },
      }),
    ).toEqual({
      buildHash: "hash-compiled",
      dictionaryVersion: "dict-compiled",
      status: "compiled",
      rowCount: 6,
      storageUri: "s3://mqchain/kv/hash-compiled",
      manifestJson: JSON.stringify({
        artifactType: "jsonl-kv-preview",
        rowCount: 6,
      }),
    });
    expect(
      kvBuildRegistrationApiRequestSchema.parse({
        rowCount: 1,
        manifestJson: '{"artifactType":"rocksdb"}',
      }),
    ).toMatchObject({
      status: "compiled",
      rowCount: 1,
      manifestJson: '{"artifactType":"rocksdb"}',
    });
    expect(() => kvBuildRegistrationApiRequestSchema.parse({ rowCount: 1 })).toThrow("Provide either manifest or manifestJson");
  });

  it("builds pending batch commit handoff manifests with the frozen contract versions", () => {
    expect(
      buildPendingBatchKvManifest({
        batchId: 7,
        registryIds: [12, 11],
        registrySnapshotHash: "registry-snapshot-abc",
        dictionaryVersion: "abc123",
        expectedCounts: { addressLabelCurrent: 2, addressLabelTimeline: 1, metricGroupMembership: 1 },
      }),
    ).toEqual({
      reason: "batch_commit",
      batchId: 7,
      registryIds: [11, 12],
      registrySnapshotHash: "registry-snapshot-abc",
      dictionaryVersion: "abc123",
      dictionarySchemaVersion: "MQD-U1",
      keySchemaVersion: "MQK-U1",
      valueSchemaVersion: "MQV-U1",
      timelineSchemaVersion: "MQT-U1",
      metricSchemaVersion: "MQG-U1",
      expectedCounts: { addressLabelCurrent: 2, addressLabelTimeline: 1, metricGroupMembership: 1 },
      artifactType: "rocksdb",
      artifactStatus: "pending_external_compile",
      note: "RocksDB compilation is external; this manifest is the Vercel control-plane handoff.",
    });
  });

  it("derives a reproducible pending build hash from immutable content only", () => {
    const input = {
      batchId: 7,
      registryIds: [11, 12],
      registrySnapshotHash: "registry-snapshot-abc",
      dictionaryVersion: "abc123",
      expectedCounts: { addressLabelCurrent: 2, addressLabelTimeline: 1, metricGroupMembership: 1 },
    };
    const first = computePendingKvBuildHash(buildPendingBatchKvManifest(input));
    const second = computePendingKvBuildHash(buildPendingBatchKvManifest({ ...input, registryIds: [12, 11] }));

    // Registry ID ordering is normalized, so the hash is stable across input order.
    expect(first).toBe(second);

    // A timestamp in the manifest object must never reach the hash input.
    expect(computePendingKvBuildHash({ ...buildPendingBatchKvManifest(input), note: "changed note" } as never)).toBe(first);

    // Registry content changes must change the hash.
    expect(
      computePendingKvBuildHash(
        buildPendingBatchKvManifest({ ...input, registrySnapshotHash: "registry-snapshot-xyz" }),
      ),
    ).not.toBe(first);
    expect(
      computePendingKvBuildHash(buildPendingBatchKvManifest({ ...input, registryIds: [11, 12, 13] })),
    ).not.toBe(first);
  });

  it("passes activation preflight for a complete compiled production artifact", () => {
    const preflight = buildKvManifestActivationPreflight(compiledBuild());

    expect(preflight.blockers).toEqual([]);
    expect(preflight.canActivate).toBe(true);
  });

  it("reports active serving artifacts as healthy but not re-activatable", () => {
    const preflight = buildKvManifestActivationPreflight(compiledBuild({}, { status: "active" }));

    expect(preflight.canActivate).toBe(false);
    expect(preflight.blockers).toEqual([]);
    expect(preflight.checks.find((check) => check.key === "status")).toMatchObject({
      status: "pass",
      detail: "Manifest is the active serving artifact.",
    });
  });

  it("validates each required index against its own expected count, never a summed total", () => {
    // Counts differ per index and deliberately do not sum to the build rowCount.
    const preflight = buildKvManifestActivationPreflight(
      compiledBuild(
        {
          rowCount: 2,
          expectedCounts: { addressLabelCurrent: 2, addressLabelTimeline: 5, metricGroupMembership: 3 },
          indexes: {
            addressLabelCurrent: { indexName: "address_label_current", rowCount: 2, hash: "current-hash" },
            addressLabelTimeline: { indexName: "address_label_timeline", rowCount: 5, hash: "timeline-hash" },
            metricGroupMembership: { indexName: "metric_group_membership", rowCount: 3, hash: "metric-hash" },
          },
        },
        { rowCount: 2 },
      ),
    );

    expect(preflight.blockers).toEqual([]);
    expect(preflight.canActivate).toBe(true);
    // The removed "sum all index rowCounts and compare to rowCount" check must not come back.
    expect(preflight.checks.some((check) => check.key === "indexRowCounts")).toBe(false);
  });

  it("blocks activation when one index disagrees with its own expected count", () => {
    const preflight = buildKvManifestActivationPreflight(
      compiledBuild({
        indexes: {
          addressLabelCurrent: { indexName: "address_label_current", rowCount: 2, hash: "current-hash" },
          addressLabelTimeline: { indexName: "address_label_timeline", rowCount: 9, hash: "timeline-hash" },
          metricGroupMembership: { indexName: "metric_group_membership", rowCount: 1, hash: "metric-hash" },
        },
      }),
    );

    expect(preflight.canActivate).toBe(false);
    expect(preflight.blockers.join(" ")).toContain("Address label timeline index");
    expect(preflight.blockers.join(" ")).toContain("expectedCounts.addressLabelTimeline 1");
  });

  it("blocks activation when a required index is missing its content hash", () => {
    const preflight = buildKvManifestActivationPreflight(
      compiledBuild({
        indexes: {
          addressLabelCurrent: { indexName: "address_label_current", rowCount: 2 },
          addressLabelTimeline: { indexName: "address_label_timeline", rowCount: 1, hash: "timeline-hash" },
          metricGroupMembership: { indexName: "metric_group_membership", rowCount: 1, hash: "metric-hash" },
        },
      }),
    );

    expect(preflight.canActivate).toBe(false);
    expect(preflight.blockers.join(" ")).toContain("content hash missing");
  });

  it("blocks production activation when the manifest declares no indexes object", () => {
    const manifest = productionManifest();
    delete (manifest as Record<string, unknown>).indexes;
    const preflight = buildKvManifestActivationPreflight({ ...compiledBuild(), manifest });

    expect(preflight.canActivate).toBe(false);
    expect(preflight.blockers.join(" ")).toContain("Serving indexes declared");
  });

  it("blocks activation when a frozen schema version is missing or wrong", () => {
    const missing = buildKvManifestActivationPreflight(compiledBuild({ valueSchemaVersion: undefined }));
    expect(missing.canActivate).toBe(false);
    expect(missing.blockers.join(" ")).toContain("Value schema version is missing");

    const wrong = buildKvManifestActivationPreflight(compiledBuild({ keySchemaVersion: "MQK-V1" }));
    expect(wrong.canActivate).toBe(false);
    expect(wrong.blockers.join(" ")).toContain("Key schema version is MQK-V1");
  });

  it("blocks activation when the manifest dictionary version disagrees with the build", () => {
    const preflight = buildKvManifestActivationPreflight(compiledBuild({ dictionaryVersion: "dict-other" }));

    expect(preflight.canActivate).toBe(false);
    expect(preflight.blockers.join(" ")).toContain("Dictionary version agreement");
  });

  it("blocks activation when the registry snapshot hash is absent", () => {
    const manifest = productionManifest();
    delete (manifest as Record<string, unknown>).registrySnapshotHash;
    const preflight = buildKvManifestActivationPreflight({ ...compiledBuild(), manifest });

    expect(preflight.canActivate).toBe(false);
    expect(preflight.blockers.join(" ")).toContain("Registry snapshot hash");
  });

  it("never activates a preview or partial artifact as the production serving artifact", () => {
    const preview = buildKvManifestActivationPreflight(compiledBuild({ artifactType: "jsonl-kv-preview" }));
    expect(preview.canActivate).toBe(false);
    expect(preview.blockers.join(" ")).toContain("Production build kind");

    const partial = buildKvManifestActivationPreflight(compiledBuild({ partial: true }));
    expect(partial.canActivate).toBe(false);
    expect(partial.blockers.join(" ")).toContain("Production build kind");
  });

  it("blocks activation when filter support is enabled without filter manifests", () => {
    const preflight = buildKvManifestActivationPreflight(compiledBuild({ filterSupport: true }));

    expect(preflight.canActivate).toBe(false);
    expect(preflight.blockers.join(" ")).toContain("Filter manifests");
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
    const preflight = buildKvManifestActivationPreflight(
      compiledBuild({}, { dictionaryVersion: null, storageUri: null }),
    );

    expect(preflight.canActivate).toBe(false);
    expect(preflight.blockers.join(" ")).toContain("Dictionary version");
    expect(preflight.blockers.join(" ")).toContain("External artifact URI");
  });

  it("blocks activation when manifest row accounting disagrees with the database row", () => {
    const preflight = buildKvManifestActivationPreflight(compiledBuild({}, { rowCount: 3 }));

    expect(preflight.canActivate).toBe(false);
    expect(preflight.blockers.join(" ")).toContain("Row count agreement");
    expect(preflight.blockers.join(" ")).toContain("Registry ID accounting");
  });

  it("blocks activation when a declared multi-index artifact is missing a required serving index", () => {
    const preflight = buildKvManifestActivationPreflight(
      compiledBuild({
        indexes: {
          addressLabelCurrent: { indexName: "address_label_current", rowCount: 2, hash: "current-hash" },
          addressLabelTimeline: { indexName: "address_label_timeline", rowCount: 1, hash: "timeline-hash" },
        },
      }),
    );

    expect(preflight.canActivate).toBe(false);
    expect(preflight.blockers.join(" ")).toContain("Metric group membership index");
    expect(preflight.blockers.join(" ")).toContain("index missing");
  });

  it("serializes the active external KV serving manifest for MamakQuantNode", () => {
    const payload = buildKvServingManifestApiResponse({
      build: {
        id: 9,
        buildHash: "hash-active",
        dictionaryVersion: "dict-active",
        status: "active",
        rowCount: 6,
        storageUri: "s3://mqchain/kv/hash-active",
        manifest: { artifactType: "rocksdb", rowCount: 6 },
        createdAt: new Date("2026-07-04T01:00:00.000Z"),
        activatedAt: new Date("2026-07-04T02:00:00.000Z"),
      },
      indexManifests: [
        {
          id: 1,
          indexName: "address_label_current",
          dictionaryVersion: "dict-active",
          status: "active",
          rowCount: 2,
          storageUri: "s3://mqchain/kv/current",
          manifestHash: "current-hash",
          lastCommittedBatchId: 10,
          activatedAt: new Date("2026-07-04T02:00:00.000Z"),
        },
        {
          id: 2,
          indexName: "address_label_timeline",
          dictionaryVersion: "dict-active",
          status: "active",
          rowCount: 3,
          storageUri: "s3://mqchain/kv/timeline",
          manifestHash: "timeline-hash",
          lastCommittedBatchId: 10,
          activatedAt: new Date("2026-07-04T02:00:00.000Z"),
        },
        {
          id: 3,
          indexName: "metric_group_membership",
          dictionaryVersion: "dict-active",
          status: "active",
          rowCount: 1,
          storageUri: "s3://mqchain/kv/metric",
          manifestHash: "metric-hash",
          lastCommittedBatchId: 10,
          activatedAt: new Date("2026-07-04T02:00:00.000Z"),
        },
      ],
      indexShards: [
        {
          manifestId: 1,
          shardId: "current-00",
          shardKey: "00",
          shardHash: "current-shard",
          storageUri: "s3://mqchain/kv/current-00",
          rowCount: 2,
        },
      ],
      membershipSnapshots: [
        {
          id: 4,
          metricGroupId: 7,
          metricGroupCode: "btc_cex_flow_boundary",
          dictionaryVersion: "dict-active",
          status: "active",
          memberCount: 1,
          manifestHash: "metric-hash",
          activatedAt: new Date("2026-07-04T02:00:00.000Z"),
        },
      ],
      membershipRows: [{ id: 99, snapshotId: 4 }],
    });

    expect(payload).toMatchObject({
      ...KV_SERVING_MANIFEST_API_CONTRACT,
      activeBuild: {
        id: 9,
        buildHash: "hash-active",
        status: "active",
        storageUri: "s3://mqchain/kv/hash-active",
        activatedAt: "2026-07-04T02:00:00.000Z",
      },
      indexSummary: {
        indexCount: 3,
        shardCount: 1,
        missingRequired: [],
      },
      indexes: [
        {
          indexName: "address_label_current",
          requiredKey: "addressLabelCurrent",
          shardCount: 1,
          shards: [{ shardId: "current-00", storageUri: "s3://mqchain/kv/current-00" }],
        },
        {
          indexName: "address_label_timeline",
          requiredKey: "addressLabelTimeline",
        },
        {
          indexName: "metric_group_membership",
          requiredKey: "metricGroupMembership",
        },
      ],
      metricGroupMembership: [
        {
          snapshotId: 4,
          metricGroupCode: "btc_cex_flow_boundary",
          memberCount: 1,
          persistedMemberRows: 1,
        },
      ],
      policy: {
        activeBuildOnly: true,
        requiredServingIndexes: true,
        externalWorkerOwnsArtifactStorage: true,
      },
    });
  });

  it("serializes KV build queue exports without full manifest bodies", () => {
    const payload = buildKvBuildListApiResponse({
      query: {
        page: 1,
        pageSize: 25,
        filters: {
          status: "compiled",
          sort: "created_at",
        },
      },
      total: 1,
      totalPages: 1,
      rows: [
        {
          id: 12,
          buildHash: "hash-compiled",
          dictionaryVersion: "dict-compiled",
          status: "compiled",
          rowCount: 6,
          storageUri: "s3://mqchain/kv/hash-compiled",
          manifest: productionManifest({
            artifactStatus: "compiled",
            dictionaryVersion: "dict-compiled",
            rowCount: 6,
            registryIds: [11, 12, 13, 14, 15, 16],
            privateCompilerNote: "full manifest body should stay on detail endpoint",
            expectedCounts: { addressLabelCurrent: 2, addressLabelTimeline: 3, metricGroupMembership: 1 },
            indexes: {
              addressLabelCurrent: {
                indexName: "address_label_current",
                rowCount: 2,
                hash: "current-hash",
              },
              addressLabelTimeline: {
                indexName: "address_label_timeline",
                rowCount: 3,
                hash: "timeline-hash",
              },
              metricGroupMembership: {
                indexName: "metric_group_membership",
                rowCount: 1,
                hash: "metric-hash",
              },
            },
          }),
          createdAt: new Date("2026-07-04T01:00:00.000Z"),
          activatedAt: null,
        },
      ],
    });

    expect(payload).toMatchObject({
      ...KV_BUILD_LIST_API_CONTRACT,
      mutationAllowed: false,
      registryWriteAllowed: false,
      kvWriteAllowed: false,
      fullManifestIncluded: false,
      pagination: {
        totalRows: 1,
        returnedRows: 1,
      },
      rows: [
        {
          id: 12,
          buildHash: "hash-compiled",
          dictionaryVersion: "dict-compiled",
          status: "compiled",
          rowCount: 6,
          storageUri: "s3://mqchain/kv/hash-compiled",
          artifactType: "rocksdb",
          artifactStatus: "compiled",
          manifestRowCount: 6,
          manifestKeys: [
            "artifactStatus",
            "artifactType",
            "dictionarySchemaVersion",
            "dictionaryVersion",
            "expectedCounts",
            "indexes",
            "keySchemaVersion",
            "metricSchemaVersion",
            "privateCompilerNote",
            "registryIds",
            "registrySnapshotHash",
            "rowCount",
            "timelineSchemaVersion",
            "validation",
            "valueSchemaVersion",
          ],
          declaredIndexes: {
            hasIndexes: true,
            missingRequired: [],
            totalRowCount: 6,
            indexCount: 3,
          },
          activationPreflight: {
            canActivate: true,
            blockerCount: 0,
            blockers: [],
          },
          hrefs: {
            detailApi: "/api/mqchain/kv-builds/12",
            detailPage: "/mqchain/kv-builds/12",
            activeApi: "/api/mqchain/kv-builds/active",
          },
        },
      ],
      policy: {
        queueContainsControlPlaneManifestsOnly: true,
        externalWorkerOwnsArtifactStorage: true,
        consoleOnlyTracksControlPlaneState: true,
        rocksDbCompilationNotPerformedInVercel: true,
        activationRequiresPreflightPass: true,
      },
    });
    expect(payload.rows[0]).not.toHaveProperty("manifest");
    expect(JSON.stringify(payload)).not.toContain("full manifest body should stay on detail endpoint");
  });

  it("serializes KV build registration responses as control-plane writes only", () => {
    const payload = buildKvBuildRegistrationApiResponse({
      build: {
        id: 12,
        buildHash: "hash-compiled",
        dictionaryVersion: "dict-compiled",
        status: "compiled",
        rowCount: 6,
        storageUri: "s3://mqchain/kv/hash-compiled",
        manifest: productionManifest({
          artifactStatus: "compiled",
          dictionaryVersion: "dict-compiled",
          rowCount: 6,
          registryIds: [11, 12, 13, 14, 15, 16],
          privateCompilerNote: "full compiler note is only summarized here",
          expectedCounts: { addressLabelCurrent: 2, addressLabelTimeline: 3, metricGroupMembership: 1 },
          indexes: {
            addressLabelCurrent: {
              indexName: "address_label_current",
              rowCount: 2,
              hash: "current-hash",
            },
            addressLabelTimeline: {
              indexName: "address_label_timeline",
              rowCount: 3,
              hash: "timeline-hash",
            },
            metricGroupMembership: {
              indexName: "metric_group_membership",
              rowCount: 1,
              hash: "metric-hash",
            },
          },
        }),
        createdAt: new Date("2026-07-04T01:00:00.000Z"),
        activatedAt: null,
      },
    });

    expect(payload).toMatchObject({
      ...KV_BUILD_REGISTRATION_API_CONTRACT,
      mutationAllowed: true,
      registryWriteAllowed: false,
      kvArtifactWriteAllowed: false,
      rocksDbCompiledInsideVercel: false,
      build: {
        id: 12,
        buildHash: "hash-compiled",
        dictionaryVersion: "dict-compiled",
        status: "compiled",
        artifactType: "rocksdb",
        activationPreflight: {
          canActivate: true,
          blockerCount: 0,
        },
      },
      canonicalWrites: {
        registryRowsCreated: 0,
        labelsCreated: 0,
        candidatesCreated: 0,
      },
      controlPlaneWrites: {
        kvBuildsCreated: 1,
        indexManifestsMayBeCreated: true,
        indexShardsMayBeCreated: true,
        metricGroupSnapshotsMayBeCreated: true,
      },
      nextActions: {
        detailApi: "/api/mqchain/kv-builds/12",
        detailPage: "/mqchain/kv-builds/12",
      },
      policy: {
        externalWorkerOwnsArtifactStorage: true,
        consoleRegistersManifestOnly: true,
        rocksDbCompilationNotPerformedInVercel: true,
        registryRowsRequireBatchCommitBeforeCompile: true,
        kvArtifactRegistrationDoesNotCreateLabels: true,
      },
    });
    expect(payload.build).not.toHaveProperty("manifest");
    expect(JSON.stringify(payload)).not.toContain("full compiler note is only summarized here");
  });

  it("serializes KV build detail diagnostics without making Vercel the artifact compiler", () => {
    const payload = buildKvBuildDetailApiResponse({
      build: {
        id: 12,
        buildHash: "hash-compiled",
        dictionaryVersion: "dict-compiled",
        status: "compiled",
        rowCount: 6,
        storageUri: "s3://mqchain/kv/hash-compiled",
        manifest: productionManifest({
          dictionaryVersion: "dict-compiled",
          rowCount: 6,
          registryIds: [11, 12, 13, 14, 15, 16],
          expectedCounts: { addressLabelCurrent: 2, addressLabelTimeline: 3, metricGroupMembership: 1 },
          indexes: {
            addressLabelCurrent: {
              indexName: "address_label_current",
              rowCount: 2,
              hash: "current-hash",
              path: "current.jsonl",
            },
            addressLabelTimeline: {
              indexName: "address_label_timeline",
              rowCount: 3,
              hash: "timeline-hash",
              path: "timeline.jsonl",
            },
            metricGroupMembership: {
              indexName: "metric_group_membership",
              rowCount: 1,
              hash: "metric-hash",
              path: "metric.jsonl",
            },
          },
        }),
        createdAt: new Date("2026-07-04T01:00:00.000Z"),
        activatedAt: null,
      },
      indexManifests: [
        {
          id: 1,
          indexName: "address_label_current",
          dictionaryVersion: "dict-compiled",
          status: "compiled",
          rowCount: 2,
          storageUri: "s3://mqchain/kv/current",
          manifestHash: "current-hash",
          lastCommittedBatchId: 10,
          activatedAt: null,
        },
        {
          id: 2,
          indexName: "address_label_timeline",
          dictionaryVersion: "dict-compiled",
          status: "compiled",
          rowCount: 3,
          storageUri: "s3://mqchain/kv/timeline",
          manifestHash: "timeline-hash",
          lastCommittedBatchId: 10,
          activatedAt: null,
        },
        {
          id: 3,
          indexName: "metric_group_membership",
          dictionaryVersion: "dict-compiled",
          status: "compiled",
          rowCount: 1,
          storageUri: "s3://mqchain/kv/metric",
          manifestHash: "metric-hash",
          lastCommittedBatchId: 10,
          activatedAt: null,
        },
      ],
      indexShards: [
        {
          manifestId: 1,
          shardId: "current-00",
          shardKey: "00",
          shardHash: "current-shard",
          storageUri: "s3://mqchain/kv/current-00",
          rowCount: 2,
        },
      ],
      membershipSnapshots: [
        {
          id: 4,
          metricGroupId: 7,
          metricGroupCode: "btc_cex_flow_boundary",
          dictionaryVersion: "dict-compiled",
          status: "compiled",
          memberCount: 1,
          manifestHash: "metric-hash",
          activatedAt: null,
        },
      ],
      membershipRows: [
        {
          id: 99,
          snapshotId: 4,
          registryId: 42,
          chainCode: "btc",
          normalizedAddress: "bc1qcanonical",
          entityId: 7,
          roleId: 1002,
          confidenceScore: 95,
          flags: 1,
        },
      ],
    });

    expect(payload).toMatchObject({
      ...KV_BUILD_DETAIL_API_CONTRACT,
      servingBackend: "external_kv_artifact",
      rocksDbCompiledInsideVercel: false,
      build: {
        id: 12,
        buildHash: "hash-compiled",
        status: "compiled",
        storageUri: "s3://mqchain/kv/hash-compiled",
        activatedAt: null,
      },
      activationPreflight: {
        canActivate: true,
        blockers: [],
      },
      declaredIndexes: {
        hasIndexes: true,
        missingRequired: [],
        totalRowCount: 6,
      },
      persistedIndexes: {
        indexCount: 3,
        shardCount: 1,
        missingRequired: [],
        rows: [
          {
            indexName: "address_label_current",
            requiredKey: "addressLabelCurrent",
            shardCount: 1,
            shards: [{ shardId: "current-00", rowCount: 2 }],
          },
          {
            indexName: "address_label_timeline",
            requiredKey: "addressLabelTimeline",
          },
          {
            indexName: "metric_group_membership",
            requiredKey: "metricGroupMembership",
          },
        ],
      },
      metricGroupMembership: [
        {
          snapshotId: 4,
          metricGroupCode: "btc_cex_flow_boundary",
          persistedMemberRows: 1,
          memberPreview: [
            {
              id: 99,
              registryId: 42,
              chainCode: "btc",
              normalizedAddress: "bc1qcanonical",
              confidenceScore: 95,
            },
          ],
        },
      ],
      policy: {
        externalWorkerOwnsArtifactStorage: true,
        consoleOnlyTracksControlPlaneState: true,
        rocksDbCompilationNotPerformedInVercel: true,
        activationRequiresPreflightPass: true,
        requiredServingIndexesPersisted: true,
      },
    });
  });
});
