export type AuditTimelineInput = {
  id: number;
  source: "approval" | "system";
  action: string;
  actorId: string | null;
  actorLabel?: string | null;
  targetTable?: string | null;
  targetId?: string | number | null;
  candidateId?: number | null;
  registryId?: number | null;
  batchId?: number | null;
  reason?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt: Date;
};

export type AuditTimelineRow = {
  key: string;
  source: "approval" | "system";
  action: string;
  actor: string;
  target: string;
  reason: string;
  createdAt: Date;
};

export type ApprovalEventTargetLink = {
  key: "candidate" | "registry" | "batch";
  label: string;
  href: string;
  id: number;
};

export type AuditPayloadSummary = {
  summary: string;
  details: string[];
};

const SENSITIVE_KEYS = new Set(["password", "passwordhash", "secret", "token", "apikey", "privatekey"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string) {
  return SENSITIVE_KEYS.has(normalizedKey(key));
}

function trimLabel(value: string, maxLength = 72) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function formatAuditValue(key: string, value: unknown): string {
  if (isSensitiveKey(key)) return "[redacted]";
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string") return trimLabel(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (isRecord(value)) return `${Object.keys(value).length} key${Object.keys(value).length === 1 ? "" : "s"}`;
  return trimLabel(String(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function summarizeRecordDetails(record: Record<string, unknown>, maxDetails = 6) {
  return Object.entries(record)
    .filter(([key]) => !key.startsWith("_"))
    .slice(0, maxDetails)
    .map(([key, value]) => `${key}: ${formatAuditValue(key, value)}`);
}

function summarizeBeforeAfter(before: Record<string, unknown>, after: Record<string, unknown>): AuditPayloadSummary {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  const changedKeys = keys.filter((key) => stableJson(before[key]) !== stableJson(after[key]));
  const visibleChanges = changedKeys.slice(0, 8).map((key) => {
    return `${key}: ${formatAuditValue(key, before[key])} -> ${formatAuditValue(key, after[key])}`;
  });
  const extraCount = changedKeys.length - visibleChanges.length;

  return {
    summary: changedKeys.length ? `${changedKeys.length} field${changedKeys.length === 1 ? "" : "s"} changed` : "No field changes",
    details: extraCount > 0 ? [...visibleChanges, `+${extraCount} more change${extraCount === 1 ? "" : "s"}`] : visibleChanges,
  };
}

function summarizeUserPayload(user: Record<string, unknown>): AuditPayloadSummary {
  const label = formatAuditValue("email", user.email ?? user.id ?? "user");
  const role = user.role ? ` / ${formatAuditValue("role", user.role)}` : "";
  const status = typeof user.isActive === "boolean" ? ` / ${user.isActive ? "active" : "inactive"}` : "";

  return {
    summary: `User ${label}${role}${status}`,
    details: summarizeRecordDetails(user),
  };
}

export function summarizeAuditPayload(payload: Record<string, unknown> | null | undefined): AuditPayloadSummary {
  if (!payload || !Object.keys(payload).length) {
    return { summary: "-", details: [] };
  }

  if (isRecord(payload.before) && isRecord(payload.after)) {
    return summarizeBeforeAfter(payload.before, payload.after);
  }

  if (isRecord(payload.user)) {
    return summarizeUserPayload(payload.user);
  }

  const key = ["sourceJob", "candidate", "batch", "registry", "metricGroup", "kvBuild", "manifest"].find((entry) =>
    isRecord(payload[entry]),
  );
  if (key && isRecord(payload[key])) {
    const record = payload[key];
    const label = record.id ?? record.name ?? record.status ?? key;
    return {
      summary: `${key}: ${formatAuditValue(key, label)}`,
      details: summarizeRecordDetails(record),
    };
  }

  const details = summarizeRecordDetails(payload);
  return {
    summary: details.length ? details.join(" / ") : `${Object.keys(payload).length} payload key${Object.keys(payload).length === 1 ? "" : "s"}`,
    details,
  };
}

function approvalTarget(input: AuditTimelineInput) {
  if (input.registryId) return `registry:${input.registryId}`;
  if (input.batchId) return `batch:${input.batchId}`;
  if (input.candidateId) return `candidate:${input.candidateId}`;
  return "approval:-";
}

function systemTarget(input: AuditTimelineInput) {
  return `${input.targetTable ?? "system"}:${input.targetId ?? "-"}`;
}

export function buildApprovalEventTargetLinks(input: Pick<AuditTimelineInput, "candidateId" | "registryId" | "batchId">) {
  const links: ApprovalEventTargetLink[] = [];

  if (input.candidateId) {
    links.push({
      key: "candidate",
      label: `candidate:${input.candidateId}`,
      href: `/mqchain/candidates/${input.candidateId}`,
      id: input.candidateId,
    });
  }

  if (input.registryId) {
    links.push({
      key: "registry",
      label: `registry:${input.registryId}`,
      href: `/mqchain/registry/${input.registryId}`,
      id: input.registryId,
    });
  }

  if (input.batchId) {
    links.push({
      key: "batch",
      label: `batch:${input.batchId}`,
      href: `/mqchain/batches/${input.batchId}`,
      id: input.batchId,
    });
  }

  return links;
}

export function buildAuditTimeline(events: AuditTimelineInput[], limit = 200): AuditTimelineRow[] {
  return events
    .map((event) => ({
      key: `${event.source}:${event.id}`,
      source: event.source,
      action: event.action,
      actor: event.actorLabel ?? event.actorId ?? "system",
      target: event.source === "approval" ? approvalTarget(event) : systemTarget(event),
      reason: event.reason ?? (event.source === "system" ? summarizeAuditPayload(event.payload).summary : "-"),
      createdAt: event.createdAt,
    }))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.key.localeCompare(left.key))
    .slice(0, limit);
}
