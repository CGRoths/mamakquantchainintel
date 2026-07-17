import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = (name: string) => readFile(path.join(process.cwd(), "drizzle", name), "utf8");

describe("MQCHAIN U1 additive migrations", () => {
  it("never drops tables, truncates rows, deletes rows, or renames legacy objects", async () => {
    const sql = (await Promise.all([
      migration("0006_exotic_omega_flight.sql"),
      migration("0007_robust_bucky.sql"),
      migration("0008_chilly_doctor_octopus.sql"),
      migration("0009_giant_ezekiel_stane.sql"),
      migration("0010_parallel_yellow_claw.sql"),
      migration("0011_heavy_agent_brand.sql"),
    ])).join("\n").toLowerCase();
    expect(sql).not.toMatch(/\bdrop\s+table\b/);
    expect(sql).not.toMatch(/\btruncate\b/);
    expect(sql).not.toMatch(/\bdelete\s+from\b/);
    expect(sql).not.toMatch(/\brename\s+(table|column)\b/);
  });

  it("creates the compatibility views without recreating source verification tables", async () => {
    const sql = await migration("0006_exotic_omega_flight.sql");
    expect(sql).toContain("mq_u1_prefix_compatibility");
    expect(sql).toContain("mq_u1_prefix_conflicts");
    expect(sql).not.toMatch(/CREATE TABLE\s+"mq_source_verifications"/i);
  });

  it("enforces build-chain and namespace parent guards", async () => {
    const sql = await migration("0009_giant_ezekiel_stane.sql");
    expect(sql).toContain("fk_mq_kv_builds_base");
    expect(sql).toContain("uq_mq_kv_builds_one_active");
    expect(sql).toContain("mq_chain_network_active_namespace_guard");
    expect(sql).toContain("mq_address_codec_active_namespace_guard");
  });

  it("requires approved manual proposals for unknown-network activation", async () => {
    const sql = await migration("0010_parallel_yellow_claw.sql");
    expect(sql).toContain("mq_network_change_proposals");
    expect(sql).toContain("mq_chain_network_proposal_activation_guard");
    expect(sql).toContain("unknown network % must be created inactive through a manual proposal");
    expect(sql).toContain("network % activation requires an approved manual proposal");
  });

  it("adds typed identifier namespaces and scoped chain aliases additively", async () => {
    const sql = await migration("0011_heavy_agent_brand.sql");
    expect(sql).toContain('CREATE TABLE "mq_chain_aliases"');
    expect(sql).toContain('ADD COLUMN "identifier_kind"');
    expect(sql).toContain('ADD COLUMN "address_type"');
    expect(sql.indexOf('CREATE UNIQUE INDEX "uq_mq_address_namespaces_mapping"')).toBeLessThan(sql.indexOf('ADD CONSTRAINT "fk_mq_chain_aliases_namespace_mapping"'));
  });
});
