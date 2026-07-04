import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildApprovalEventTargetLinks, buildAuditTimeline, summarizeAuditPayload } from "@/lib/mqchain/audit";

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
        payload: {
          before: { isActive: true, role: "admin" },
          after: { isActive: false, role: "admin" },
        },
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
        reason: "1 field changed",
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

  it("summarizes before and after audit payloads as changed fields", () => {
    expect(
      summarizeAuditPayload({
        before: { role: "reviewer", isActive: true, displayName: "Review A" },
        after: { role: "admin", isActive: true, displayName: "Admin A" },
      }),
    ).toEqual({
      summary: "2 fields changed",
      details: ["displayName: Review A -> Admin A", "role: reviewer -> admin"],
    });
  });

  it("detects nested metadata changes in before and after payloads", () => {
    expect(
      summarizeAuditPayload({
        before: { metadata: { labels: ["cex"], source: { type: "manual" } } },
        after: { metadata: { labels: ["cex"], source: { type: "official_url" } } },
      }),
    ).toEqual({
      summary: "1 field changed",
      details: ["metadata: 2 keys -> 2 keys"],
    });
  });

  it("summarizes user payloads without exposing password hashes", () => {
    expect(
      summarizeAuditPayload({
        user: {
          id: "user-1",
          email: "admin@mamakquant.local",
          role: "owner",
          isActive: true,
          passwordHash: "secret-hash",
          hasPassword: true,
        },
      }),
    ).toEqual({
      summary: "User admin@mamakquant.local / owner / active",
      details: [
        "id: user-1",
        "email: admin@mamakquant.local",
        "role: owner",
        "isActive: true",
        "passwordHash: [redacted]",
        "hasPassword: true",
      ],
    });
  });

  it("keeps approval and system audit tables append-only at the database boundary", () => {
    const migration = readFileSync(join(process.cwd(), "drizzle", "0003_audit_trail_immutability.sql"), "utf8");

    expect(migration).toContain('CREATE OR REPLACE FUNCTION "mq_prevent_audit_event_mutation"()');
    expect(migration).toContain('BEFORE UPDATE ON "mq_approval_events"');
    expect(migration).toContain('BEFORE DELETE ON "mq_approval_events"');
    expect(migration).toContain('BEFORE UPDATE ON "mq_audit_log"');
    expect(migration).toContain('BEFORE DELETE ON "mq_audit_log"');
    expect(migration).toContain('RAISE EXCEPTION \'MQCHAIN audit table % is append-only; % is not allowed\'');
  });
});
