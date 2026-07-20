import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("research normalization workflow contracts", () => {
  it("keeps preflight pure and creation bound to dictionary version plus deterministic hash", () => {
    const normalizer = read("src/lib/mqchain/research-normalization.ts");
    const service = read("src/lib/mqchain/services/research-intake-service.ts");
    expect(normalizer).not.toMatch(/getDb|src\/db|drizzle-orm/);
    expect(service).toContain("expectedDictionaryVersion !== report.dictionaryVersion");
    expect(service).toContain("preflightHash !== report.preflightHash");
    expect(service).toContain('record.status === "resolved"');
    expect(service).toContain("rawText: parsed.csvText");
  });

  it("preserves the signed Origin boundary and route-specific intake limits", () => {
    const origin = read("origin/app.ts");
    const preflightApi = read("src/app/api/mqchain/intake/preflight/route.ts");
    const createApi = read("src/app/api/mqchain/intake/research/route.ts");
    expect(origin).toContain('pathname === "/v1/intake/preflight"');
    expect(origin).toContain('pathname === "/v1/intake/research"');
    expect(origin).toContain('pathname.startsWith("/v1/intake/")');
    expect(preflightApi).not.toMatch(/@\/db|drizzle-orm|getDb/);
    expect(createApi).not.toMatch(/@\/db|drizzle-orm|getDb/);
  });

  it("uses an additive governed proposal migration and specialized network workflow", () => {
    const migration = read("drizzle/0012_wet_jazinda.sql");
    const service = read("src/lib/mqchain/services/dictionary-proposal-service.ts");
    expect(migration).toContain('CREATE TABLE "mq_dictionary_proposals"');
    for (const column of ["proposal_kind", "proposed_code", "proposed_name", "source_job_id", "source_document_id", "candidate_id", "requested_by", "reviewed_by", "reviewed_at", "applied_at"]) expect(migration).toContain(column);
    expect(service).toContain("allocateStableId");
    expect(service).toContain("pg_advisory_xact_lock");
    expect(service).toContain("dictionary_proposal_applied");
    expect(service).toContain("requires_specialized_network_workflow");
  });

  it("re-resolves suggested IDs only and records before/after audit history", () => {
    const service = read("src/lib/mqchain/services/dictionary-proposal-service.ts");
    const update = service.slice(service.indexOf("export async function rerunDictionaryResolution"));
    expect(update).toContain("suggestedEntityId");
    expect(update).toContain("suggestedProtocolId");
    expect(update).toContain("suggestedRoleId");
    expect(update).toContain("changes.push({ candidateId: candidate.id, before, after })");
    expect(update).not.toContain("candidateStatus:");
    expect(update).not.toMatch(/delete\(mqAddressEvidence|update\(mqApprovalEvents/);
  });

  it("exports a versioned dictionary bundle and documents exact AI matching", () => {
    const packageJson = read("package.json");
    const bundle = read("src/lib/mqchain/dictionary-bundle.ts");
    const skill = read("skills/mqchain-research-normalization/SKILL.md");
    expect(packageJson).toContain('"mqchain:dictionary-bundle"');
    for (const field of ["dictionaryVersion", "generatedAt", "contentHash", "rowCount", "sourceVersion"]) expect(bundle).toContain(field);
    expect(skill).toContain("Never interpret an unknown chain plus a `0x` address as Ethereum");
    expect(skill).toContain("Trust and verification are separate");
    expect(skill).toContain('"total_rows"');
  });

  it("provides all required filters, downloads, and exact create gating", () => {
    const component = read("src/components/mqchain/research-intake-workflow.tsx");
    for (const filter of ["resolved", "unresolved", "invalid", "duplicate", "pending_role", "pending_alias", "pending_codec", "source_provenance_missing"]) expect(component).toContain(`"${filter}"`);
    expect(component).toContain("report.normalizedCsv");
    expect(component).toContain("report.unresolvedCsv");
    expect(component).toContain("JSON.stringify(report, null, 2)");
    expect(component).toContain("!report?.canCreateSourceJob");
  });
});
