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
      reason: event.reason ?? "-",
      createdAt: event.createdAt,
    }))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.key.localeCompare(left.key))
    .slice(0, limit);
}
