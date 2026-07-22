import { describe, expect, it } from "vitest";

import { AUDIT_TIMELINE_EXPORT_API_CONTRACT, buildAuditTimelineExportApiResponse } from "@/lib/mqchain/audit-api";

const createdAt = new Date("2026-07-04T02:00:00.000Z");
const laterAt = new Date("2026-07-04T03:00:00.000Z");

describe("audit timeline export API payloads", () => {
  it("exports the unified audit timeline without exposing raw audit JSON bodies", () => {
    const payload = buildAuditTimelineExportApiResponse({
      query: {
        page: 1,
        pageSize: 50,
        filters: { source: "all", actor: "reviewer" },
      },
      rows: [
        {
          key: "system:9",
          source: "system",
          action: "source_job_archived",
          actor: "reviewer@mamakquant.local",
          target: "mq_workflow_source_jobs:12",
          reason: "sourceJob: 12",
          createdAt: laterAt,
        },
        {
          key: "approval:3",
          source: "approval",
          action: "candidate_approved",
          actor: "reviewer@mamakquant.local",
          target: "candidate:42",
          reason: "official source verified",
          createdAt,
        },
      ],
      approvalEvents: [
        {
          id: 3,
          candidateId: 42,
          registryId: null,
          batchId: 7,
          action: "candidate_approved",
          actorId: "00000000-0000-0000-0000-000000000001",
          reason: "official source verified",
          beforeJson: { candidateStatus: "pending_review" },
          afterJson: { candidateStatus: "approved" },
          metadata: {
            rawReference: "line 7",
            manual_policy_override: "official low-confidence reserve/core candidate",
            rawPayload: "private reviewer notes",
          },
          createdAt,
        },
      ],
      auditRows: [
        {
          id: 9,
          actorId: "00000000-0000-0000-0000-000000000001",
          action: "source_job_archived",
          targetTable: "mq_workflow_source_jobs",
          targetId: "12",
          payload: {
            sourceJob: {
              id: 12,
              status: "archived",
              rawExtractedText: "private source text",
            },
            archivedBy: "reviewer",
          },
          createdAt: laterAt,
        },
      ],
      total: 2,
      approvalTotal: 1,
      systemTotal: 1,
      totalPages: 1,
    });

    expect(payload).toMatchObject({
      ...AUDIT_TIMELINE_EXPORT_API_CONTRACT,
      mutationAllowed: false,
      auditWriteAllowed: false,
      approvalEventWriteAllowed: false,
      rawJsonIncluded: false,
      pagination: {
        totalRows: 2,
        approvalRows: 1,
        systemRows: 1,
        returnedRows: 2,
      },
      rows: [
        {
          key: "system:9",
          source: "system",
          id: 9,
          targetIds: {
            targetTable: "mq_workflow_source_jobs",
            targetId: "12",
          },
          payloadSummary: {
            summary: "sourceJob: 12",
          },
          systemPayloadKeys: ["archivedBy", "sourceJob"],
          rawJsonIncluded: false,
        },
        {
          key: "approval:3",
          source: "approval",
          id: 3,
          targetIds: {
            candidateId: 42,
            batchId: 7,
          },
          reason: "official source verified",
          payloadSummary: {
            summary: "1 field changed",
            details: ["candidateStatus: pending_review -> approved"],
          },
          metadataKeys: ["manual_policy_override", "rawPayload", "rawReference"],
          rawJsonIncluded: false,
        },
      ],
      policy: {
        rawJsonExcludedByDefault: true,
        approvalAndSystemEventsShareTimeline: true,
        auditTablesAreAppendOnlyByMigration: true,
        externalWorkersMustTreatAuditAsReadOnly: true,
        exportDoesNotCreateAuditEvents: true,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("private reviewer notes");
    expect(JSON.stringify(payload)).not.toContain("private source text");
    expect(JSON.stringify(payload)).not.toContain("beforeJson");
    expect(JSON.stringify(payload)).not.toContain("afterJson");
    expect(JSON.stringify(payload)).not.toContain("metadata\":");
    expect(JSON.stringify(payload)).not.toContain("payload\":");
  });

  it("summarizes arbitrary system payloads by keys only", () => {
    const payload = buildAuditTimelineExportApiResponse({
      query: {
        page: 1,
        pageSize: 50,
        filters: {},
      },
      rows: [
        {
          key: "system:10",
          source: "system",
          action: "raw_payload_audited",
          actor: "system",
          target: "mq_workflow_source_documents:5",
          reason: "2 payload keys",
          createdAt,
        },
      ],
      approvalEvents: [],
      auditRows: [
        {
          id: 10,
          actorId: null,
          action: "raw_payload_audited",
          targetTable: "mq_workflow_source_documents",
          targetId: "5",
          payload: {
            extractedText: "do not export this text",
            sourceUrl: "https://example.com/source",
          },
          createdAt,
        },
      ],
      total: 1,
      approvalTotal: 0,
      systemTotal: 1,
      totalPages: 1,
    });

    expect(payload.rows[0].payloadSummary).toEqual({
      summary: "2 payload keys",
      details: ["extractedText: [omitted]", "sourceUrl: [omitted]"],
    });
    expect(JSON.stringify(payload)).not.toContain("do not export this text");
    expect(JSON.stringify(payload)).not.toContain("https://example.com/source");
  });
});
