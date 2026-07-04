import { summarizeAuditPayload, type AuditPayloadSummary, type AuditTimelineRow } from "./audit";

export const AUDIT_TIMELINE_EXPORT_API_CONTRACT = {
  apiVersion: "mqchain-audit-log-api-v1",
  sourceOfTruth: "postgres_audit_events",
  servingBackend: "postgres",
  artifactType: "audit_timeline_export",
  mutationAllowed: false,
  auditWriteAllowed: false,
  approvalEventWriteAllowed: false,
  registryWriteAllowed: false,
  postgresIsCanonicalTruth: true,
  auditTrailAppendOnly: true,
  rawJsonIncluded: false,
} as const;

type JsonRecord = Record<string, unknown>;

export type AuditTimelineApprovalEventInput = {
  id: number;
  candidateId: number | null;
  registryId: number | null;
  batchId: number | null;
  action: string;
  actorId: string | null;
  reason: string | null;
  beforeJson: JsonRecord | null;
  afterJson: JsonRecord | null;
  metadata: JsonRecord;
  createdAt: Date;
};

export type AuditTimelineSystemEventInput = {
  id: number;
  actorId: string | null;
  action: string;
  targetTable: string;
  targetId: string | null;
  payload: JsonRecord;
  createdAt: Date;
};

export type AuditTimelineExportApiInput = {
  query: {
    page: number;
    pageSize: number;
    filters: Record<string, unknown>;
  };
  rows: AuditTimelineRow[];
  approvalEvents: AuditTimelineApprovalEventInput[];
  auditRows: AuditTimelineSystemEventInput[];
  total: number;
  approvalTotal: number;
  systemTotal: number;
  totalPages: number;
};

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function sortedKeys(value: JsonRecord | null | undefined) {
  return Object.keys(value ?? {}).sort((left, right) => left.localeCompare(right));
}

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function shouldOmitSummaryValue(key: string) {
  const normalized = normalizedKey(key);
  return (
    normalized.includes("raw") ||
    normalized.includes("body") ||
    normalized.includes("content") ||
    normalized.includes("text") ||
    normalized.includes("html") ||
    normalized.includes("payload")
  );
}

function sanitizeSummaryValue(key: string, value: unknown): unknown {
  if (shouldOmitSummaryValue(key)) return "[omitted]";
  if (Array.isArray(value)) return value.map((item) => sanitizeSummaryValue(key, item));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([nestedKey, nestedValue]) => [nestedKey, sanitizeSummaryValue(nestedKey, nestedValue)]),
  );
}

function sanitizeSummaryPayload(payload: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, sanitizeSummaryValue(key, value)]));
}

function approvalPayloadSummary(event: AuditTimelineApprovalEventInput): AuditPayloadSummary {
  const payload: JsonRecord = {};
  if (event.beforeJson) payload.before = sanitizeSummaryPayload(event.beforeJson);
  if (event.afterJson) payload.after = sanitizeSummaryPayload(event.afterJson);
  return summarizeAuditPayload(payload);
}

function systemPayloadSummary(event: AuditTimelineSystemEventInput): AuditPayloadSummary {
  const payload = event.payload;
  if (!payload || !Object.keys(payload).length) {
    return { summary: "-", details: [] };
  }

  if ("before" in payload || "after" in payload || "user" in payload) {
    return summarizeAuditPayload(sanitizeSummaryPayload(payload));
  }

  const nestedSummaryKey = ["sourceJob", "candidate", "batch", "registry", "metricGroup", "kvBuild", "manifest"].find(
    (key) => Boolean(payload[key] && typeof payload[key] === "object" && !Array.isArray(payload[key])),
  );
  if (nestedSummaryKey) {
    return summarizeAuditPayload(sanitizeSummaryPayload(payload));
  }

  const keys = sortedKeys(payload);
  return {
    summary: `${keys.length} payload key${keys.length === 1 ? "" : "s"}`,
    details: keys.map((key) => `${key}: [omitted]`),
  };
}

export function buildAuditTimelineExportApiResponse(input: AuditTimelineExportApiInput) {
  const approvalByKey = new Map(input.approvalEvents.map((event) => [`approval:${event.id}`, event]));
  const systemByKey = new Map(input.auditRows.map((event) => [`system:${event.id}`, event]));

  return {
    ...AUDIT_TIMELINE_EXPORT_API_CONTRACT,
    query: input.query,
    pagination: {
      totalRows: input.total,
      approvalRows: input.approvalTotal,
      systemRows: input.systemTotal,
      page: input.query.page,
      pageSize: input.query.pageSize,
      totalPages: input.totalPages,
      returnedRows: input.rows.length,
    },
    rows: input.rows.map((row) => {
      const approvalEvent = approvalByKey.get(row.key);
      const systemEvent = systemByKey.get(row.key);
      const payloadSummary = approvalEvent ? approvalPayloadSummary(approvalEvent) : systemEvent ? systemPayloadSummary(systemEvent) : { summary: row.reason, details: [] };

      return {
        key: row.key,
        id: approvalEvent?.id ?? systemEvent?.id ?? null,
        source: row.source,
        action: row.action,
        actor: {
          id: approvalEvent?.actorId ?? systemEvent?.actorId ?? null,
          label: row.actor,
        },
        target: row.target,
        targetIds: {
          candidateId: approvalEvent?.candidateId ?? null,
          registryId: approvalEvent?.registryId ?? null,
          batchId: approvalEvent?.batchId ?? null,
          targetTable: systemEvent?.targetTable ?? null,
          targetId: systemEvent?.targetId ?? null,
        },
        reason: approvalEvent?.reason ?? (systemEvent ? null : row.reason),
        payloadSummary,
        metadataKeys: approvalEvent ? sortedKeys(approvalEvent.metadata) : [],
        systemPayloadKeys: systemEvent ? sortedKeys(systemEvent.payload) : [],
        rawJsonIncluded: false,
        createdAt: isoDate(row.createdAt),
      };
    }),
    policy: {
      rawJsonExcludedByDefault: true,
      approvalAndSystemEventsShareTimeline: true,
      auditTablesAreAppendOnlyByMigration: true,
      externalWorkersMustTreatAuditAsReadOnly: true,
      exportDoesNotCreateAuditEvents: true,
    },
  };
}
