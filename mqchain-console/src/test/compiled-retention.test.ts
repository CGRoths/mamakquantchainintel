import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildCompiledEntryRetentionPlan } from "@/lib/mqchain/services/compiled-retention-service";

describe("compiled-entry retention", () => {
  it("protects the active, newest successful, and immediately previous active builds", () => {
    const plan = buildCompiledEntryRetentionPlan({
      builds: [
        { id: 9, status: "compiled", activatedAt: null },
        { id: 8, status: "active", activatedAt: new Date("2026-07-04") },
        { id: 7, status: "superseded", activatedAt: new Date("2026-07-03") },
        { id: 6, status: "superseded", activatedAt: new Date("2026-07-02") },
      ],
      passedBuildIds: new Set([6, 7, 8, 9]),
      rowCounts: new Map([[6, 30], [7, 30], [8, 30], [9, 30]]),
    });
    expect(plan.protectedBuildIds).toEqual([7, 8, 9]);
    expect(plan.removableBuildIds).toEqual([6]);
    expect(plan.removableCompiledEntryCount).toBe(30);
  });

  it("is dry-run-first and deletes only derived compiled entries", () => {
    const source = readFileSync(path.join(process.cwd(), "src/lib/mqchain/services/compiled-retention-service.ts"), "utf8");
    expect(source).toContain('mode: "dry_run"');
    expect(source).toContain("expectedPlanHash");
    expect(source).toContain("delete(mqBuildCompiledEntries)");
    expect(source).not.toMatch(/delete\((mqRegistryAddressLabels|mqWorkflowAddressEvidence|mqBuildKvBuilds|mqBuildIndexManifests|mqAuditEvents)/);
  });
});
