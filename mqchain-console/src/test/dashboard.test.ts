import { describe, expect, it } from "vitest";

import { buildApprovalEventTargetLinks } from "@/lib/mqchain/audit";
import { buildConfidenceDistribution, buildDashboardLatestKvBuildSummary, normalizeDistributionRows } from "@/lib/mqchain/dashboard";

describe("dashboard rollups", () => {
  it("normalizes count rows with deterministic ordering", () => {
    expect(
      normalizeDistributionRows([
        { label: "manual_input", count: 2 },
        { label: null, count: 3 },
        { label: "csv_upload", count: 0 },
        { label: "official_url", count: 3 },
      ]),
    ).toEqual([
      { label: "official_url", count: 3 },
      { label: "unknown", count: 3 },
      { label: "manual_input", count: 2 },
    ]);
  });

  it("buckets registry confidence for dashboard distribution", () => {
    expect(
      buildConfidenceDistribution([
        { confidenceScore: 95 },
        { confidenceScore: 84 },
        { confidenceScore: 70 },
        { confidenceScore: 40 },
        { confidenceScore: 39 },
      ]),
    ).toEqual([
      { label: "0-39", count: 1 },
      { label: "40-69", count: 1 },
      { label: "70-84", count: 2 },
      { label: "85-100", count: 1 },
    ]);
  });

  it("can link recent approval events to their canonical dashboard targets", () => {
    expect(buildApprovalEventTargetLinks({ candidateId: 1, registryId: null, batchId: 2 }).map((link) => link.href)).toEqual([
      "/mqchain/candidates/1",
      "/mqchain/batches/2",
    ]);
  });

  it("summarizes an absent latest KV build", () => {
    expect(buildDashboardLatestKvBuildSummary(null)).toMatchObject({
      exists: false,
      servingStatus: "missing",
      canServe: false,
      canActivate: false,
      requiredIndexesPresent: 0,
      requiredIndexesTotal: 0,
    });
  });

  it("summarizes a compiled KV build with all serving indexes", () => {
    expect(
      buildDashboardLatestKvBuildSummary({
        id: 9,
        status: "compiled",
        buildHash: "kv-build-hash",
        dictionaryVersion: "dict-v1",
        rowCount: 3,
        storageUri: "file:///tmp/mqchain/kv",
        createdAt: new Date("2026-07-04T00:00:00Z"),
        activatedAt: null,
        manifest: {
          artifactType: "rocksdb",
          dictionarySchemaVersion: "MQD-U1",
          keySchemaVersion: "MQK-U1",
          valueSchemaVersion: "MQV-U1",
          timelineSchemaVersion: "MQT-U1",
          metricSchemaVersion: "MQG-U1",
          dictionaryVersion: "dict-v1",
          registrySnapshotHash: "registry-snapshot-v1",
          rowCount: 3,
          expectedCounts: { addressLabelCurrent: 1, addressLabelTimeline: 1, metricGroupMembership: 1 },
          validation: { validationRunId: 7, status: "passed", reportHash: "a".repeat(64) },
          indexes: {
            addressLabelCurrent: { indexName: "address_label_current", rowCount: 1, hash: "current-hash" },
            addressLabelTimeline: { indexName: "address_label_timeline", rowCount: 1, hash: "timeline-hash" },
            metricGroupMembership: { indexName: "metric_group_membership", rowCount: 1, hash: "metric-hash" },
          },
        },
      }),
    ).toMatchObject({
      exists: true,
      servingStatus: "ready",
      canServe: false,
      canActivate: true,
      requiredIndexesPresent: 3,
      requiredIndexesTotal: 3,
      servingIndexesDeclared: true,
      servingIndexesReady: true,
      blockerCount: 0,
    });
  });

  it("surfaces KV activation blockers and missing serving indexes", () => {
    expect(
      buildDashboardLatestKvBuildSummary({
        id: 10,
        status: "pending",
        buildHash: "",
        dictionaryVersion: null,
        rowCount: 3,
        storageUri: null,
        createdAt: new Date("2026-07-04T00:00:00Z"),
        activatedAt: null,
        manifest: {
          artifactType: "rocksdb",
          rowCount: 3,
          indexes: {
            addressLabelCurrent: { indexName: "address_label_current", rowCount: 3 },
          },
        },
      }),
    ).toMatchObject({
      exists: true,
      servingStatus: "pending",
      canServe: false,
      canActivate: false,
      requiredIndexesPresent: 1,
      requiredIndexesTotal: 3,
      servingIndexesReady: false,
      // Not compiled, plus missing build hash, dictionary version, storage URI,
      // all five frozen schema versions, dictionary-version agreement, registry
      // snapshot hash, the current index's content hash, the timeline index and
      // the metric-group index, explicit expected counts, and three-way parity.
      blockerCount: 16,
    });
  });
});
