import { describe, expect, it } from "vitest";

import { buildApprovalEventTargetLinks, buildAuditTimeline } from "@/lib/mqchain/audit";

describe("audit timeline", () => {
  it("merges approval and system audit events into a newest-first timeline", () => {
    const timeline = buildAuditTimeline([
      {
        id: 1,
        source: "approval",
        action: "candidate_approved",
        actorId: "user-1",
        actorLabel: "reviewer@mamakquant.local",
        candidateId: 42,
        reason: "Approved from review queue.",
        createdAt: new Date("2026-07-02T01:00:00.000Z"),
      },
      {
        id: 9,
        source: "system",
        action: "key_prefix_deactivated",
        actorId: null,
        targetTable: "mq_kv_key_prefix_dict",
        targetId: "257",
        createdAt: new Date("2026-07-02T02:00:00.000Z"),
      },
    ]);

    expect(timeline).toEqual([
      {
        key: "system:9",
        source: "system",
        action: "key_prefix_deactivated",
        actor: "system",
        target: "mq_kv_key_prefix_dict:257",
        reason: "-",
        createdAt: new Date("2026-07-02T02:00:00.000Z"),
      },
      {
        key: "approval:1",
        source: "approval",
        action: "candidate_approved",
        actor: "reviewer@mamakquant.local",
        target: "candidate:42",
        reason: "Approved from review queue.",
        createdAt: new Date("2026-07-02T01:00:00.000Z"),
      },
    ]);
  });

  it("builds approval target links for candidate, registry, and batch context", () => {
    expect(buildApprovalEventTargetLinks({ candidateId: 42, registryId: 7, batchId: 3 })).toEqual([
      { key: "candidate", label: "candidate:42", href: "/mqchain/candidates/42", id: 42 },
      { key: "registry", label: "registry:7", href: "/mqchain/registry/7", id: 7 },
      { key: "batch", label: "batch:3", href: "/mqchain/batches/3", id: 3 },
    ]);
  });

  it("omits empty approval targets", () => {
    expect(buildApprovalEventTargetLinks({ candidateId: null, registryId: undefined, batchId: 3 })).toEqual([
      { key: "batch", label: "batch:3", href: "/mqchain/batches/3", id: 3 },
    ]);
  });
});
