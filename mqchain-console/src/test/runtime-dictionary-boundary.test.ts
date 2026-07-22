import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("runtime dictionary dashboard boundary", () => {
  it("serves runtime dictionaries from signed Origin and PostgreSQL", () => {
    const origin = read("origin/app.ts");
    const client = read("src/lib/mqchain/origin-client/client.ts");
    const service = read("src/lib/mqchain/services/dictionary-service.ts");
    expect(origin).toContain('pathname === "/v1/dictionaries/runtime-u1"');
    expect(client).toContain('read<RuntimeDictionaryDashboardDto>("/v1/dictionaries/runtime-u1")');
    expect(service).toContain("export async function getRuntimeDictionaryDashboard");
  });

  it("keeps Vercel dictionary pages database-free and off the CSV catalog loader", () => {
    for (const page of ["components", "networks", "namespaces", "codecs"]) {
      const source = read(`src/app/mqchain/dictionaries/${page}/page.tsx`);
      expect(source).toContain("getRuntimeDictionaryDashboard");
      expect(source).not.toMatch(/@\/db|drizzle-orm|getDb|U1CatalogTable/);
    }
  });

  it("re-resolves governed components without changing candidate lifecycle state", () => {
    const service = read("src/lib/mqchain/services/dictionary-proposal-service.ts");
    const rerun = service.slice(service.indexOf("export async function rerunDictionaryResolution"));
    expect(rerun).toContain("suggestedComponentId");
    expect(rerun).toContain("snapshot.components");
    expect(rerun).not.toContain("candidateStatus:");
    expect(rerun).not.toMatch(/delete\(mqWorkflowAddressEvidence|update\(mqWorkflowApprovalEvents/);
  });

  it("uses the authoritative evaluator for database metric dashboard counts", () => {
    const service = read("src/lib/mqchain/services/metric-group-service.ts");
    expect(service).toContain("previewDiagnostics");
    expect(service).toContain("evaluateMetricGroupPreviewMembers");
    expect(service).toContain("getCanonicalDictionarySnapshot");
    expect(service).not.toContain(".limit(1000)");
  });
});
