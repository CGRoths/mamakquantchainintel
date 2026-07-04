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
import { createKvBuildManifestSchema, kvBuildRegistrationApiRequestSchema } from "@/lib/mqchain/validators/kv-manifest";

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
          manifest: {
            artifactType: "jsonl-kv-preview",
            artifactStatus: "compiled",
            rowCount: 6,
            privateCompilerNote: "full manifest body should stay on detail endpoint",
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
          },
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
          artifactType: "jsonl-kv-preview",
          artifactStatus: "compiled",
          manifestRowCount: 6,
          manifestKeys: ["artifactStatus", "artifactType", "indexes", "privateCompilerNote", "rowCount"],
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
        manifest: {
          artifactType: "jsonl-kv-preview",
          artifactStatus: "compiled",
          rowCount: 6,
          privateCompilerNote: "full compiler note is only summarized here",
          indexes: {
            addressLabelCurrent: {
              indexName: "address_label_current",
              rowCount: 2,
            },
            addressLabelTimeline: {
              indexName: "address_label_timeline",
              rowCount: 3,
            },
            metricGroupMembership: {
              indexName: "metric_group_membership",
              rowCount: 1,
            },
          },
        },
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
        artifactType: "jsonl-kv-preview",
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
        manifest: {
          artifactType: "jsonl-kv-preview",
          rowCount: 6,
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
        },
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
