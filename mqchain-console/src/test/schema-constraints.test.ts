import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BATCH_LABEL_ACTIONS,
  CANDIDATE_STATUSES,
  KV_ARTIFACT_STATUSES,
  SOURCE_JOB_STATUSES,
  SOURCE_TYPES,
  SOURCE_VERIFICATION_SCOPES,
} from "@/lib/mqchain/constants";

function readProjectFile(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), "utf8");
}

function compactSql(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sqlStringList(values: readonly string[]) {
  return values.map((value) => `'${value}'`).join(", ");
}

describe("MQCHAIN schema check constraints", () => {
  it("keeps core enum and range constraints in the Drizzle schema", () => {
    const schema = readProjectFile("src", "db", "schema.ts");

    expect(schema).toContain("function sqlStringList");
    expect(schema).toContain('"ck_mq_source_jobs_source_type"');
    expect(schema).toContain("sqlStringList(SOURCE_TYPES)");
    expect(schema).toContain("sqlStringList(SOURCE_JOB_STATUSES)");
    expect(schema).toContain('"ck_mq_address_candidates_status"');
    expect(schema).toContain("sqlStringList(CANDIDATE_STATUSES)");
    expect(schema).toContain('"ck_mq_address_registry_label_status_range"');
    expect(schema).toContain("between 0 and 9");
    expect(schema).toContain('"ck_mq_address_registry_quality_tier_range"');
    expect(schema).toContain("between 0 and 7");
    expect(schema).toContain('"ck_mq_kv_key_prefix_payload_len_positive"');
    expect(schema).toContain('"ck_mq_kv_role_default_quality_tier_range"');
    expect(schema).toContain("sqlStringList(BATCH_LABEL_ACTIONS)");
    expect(schema).toContain('"ck_mq_source_verifications_scope"');
    expect(schema).toContain("sqlStringList(SOURCE_VERIFICATION_SCOPES)");
    expect(schema).toContain('"ck_mq_kv_builds_status"');
    expect(schema).toContain("sqlStringList(KV_ARTIFACT_STATUSES)");
  });

  it("ships a migration for database-enforced control-plane invariants", () => {
    const migration = compactSql(readProjectFile("drizzle", "0005_control_plane_check_constraints.sql"));

    expect(migration).toContain(
      'ALTER TABLE "mq_address_registry" ADD CONSTRAINT "ck_mq_address_registry_label_status_range" CHECK ("label_status" BETWEEN 0 AND 9)',
    );
    expect(migration).toContain(
      'ALTER TABLE "mq_address_registry" ADD CONSTRAINT "ck_mq_address_registry_quality_tier_range" CHECK ("quality_tier" BETWEEN 0 AND 7)',
    );
    expect(migration).toContain(
      'ALTER TABLE "mq_kv_key_prefix_dict" ADD CONSTRAINT "ck_mq_kv_key_prefix_payload_len_positive" CHECK ("payload_len" IS NULL OR "payload_len" > 0)',
    );
    expect(migration).toContain(
      'ALTER TABLE "mq_kv_role_dict" ADD CONSTRAINT "ck_mq_kv_role_default_quality_tier_range" CHECK ("default_quality_tier" BETWEEN 0 AND 7)',
    );
    expect(migration).toContain(
      `ALTER TABLE "mq_address_candidates" ADD CONSTRAINT "ck_mq_address_candidates_status" CHECK ("candidate_status" IN (${sqlStringList(CANDIDATE_STATUSES)}))`,
    );
    expect(migration).toContain(
      `ALTER TABLE "mq_source_jobs" ADD CONSTRAINT "ck_mq_source_jobs_source_type" CHECK ("source_type" IN (${sqlStringList(SOURCE_TYPES)}))`,
    );
    expect(migration).toContain(
      `ALTER TABLE "mq_source_jobs" ADD CONSTRAINT "ck_mq_source_jobs_status" CHECK ("status" IN (${sqlStringList(SOURCE_JOB_STATUSES)}))`,
    );
    expect(migration).toContain(
      `ALTER TABLE "mq_label_batches" ADD CONSTRAINT "ck_mq_label_batches_label_action" CHECK ("label_action" IN (${sqlStringList(BATCH_LABEL_ACTIONS)}))`,
    );
    expect(migration).toContain(
      `ALTER TABLE "mq_source_verifications" ADD CONSTRAINT "ck_mq_source_verifications_scope" CHECK ("verification_scope" IN (${sqlStringList(SOURCE_VERIFICATION_SCOPES)}))`,
    );
    expect(migration).toContain(
      `ALTER TABLE "mq_kv_builds" ADD CONSTRAINT "ck_mq_kv_builds_status" CHECK ("status" IN (${sqlStringList(KV_ARTIFACT_STATUSES)}))`,
    );
  });

  it("registers the check-constraint migration in the Drizzle journal", () => {
    const journal = readProjectFile("drizzle", "meta", "_journal.json");

    expect(journal).toContain('"idx": 5');
    expect(journal).toContain('"tag": "0005_control_plane_check_constraints"');
  });
});
