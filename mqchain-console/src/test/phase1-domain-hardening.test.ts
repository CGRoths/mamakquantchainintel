import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { effectiveCategoryId } from "@/lib/mqchain/effective-category";
import { assertUniqueMetricMembershipPairs } from "@/lib/mqchain/services/full-kv-build-service";

const read = (relative: string) => readFileSync(path.join(process.cwd(), relative), "utf8");

function renamePairs(sql: string) {
  return [...sql.matchAll(/ALTER TABLE "([^"]+)" RENAME TO "([^"]+)";/g)].map((match) => [match[1], match[2]] as const);
}

function runtimeFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const absolute = path.join(root, name);
    if (statSync(absolute).isDirectory()) return runtimeFiles(absolute);
    return /\.(?:ts|tsx)$/.test(name) && !absolute.includes(`${path.sep}test${path.sep}`) ? [absolute] : [];
  });
}

describe("Phase I physical domain migration", () => {
  const forward = read("drizzle/0015_phase1_domain_hardening.sql");
  const rollback = read("drizzle/rollback/0015_phase1_domain_hardening.down.sql");
  const mappings = renamePairs(forward);

  it("renames every existing table in place and provides an exact reverse mapping", () => {
    expect(mappings).toHaveLength(48);
    expect(new Set(mappings.map(([oldName]) => oldName)).size).toBe(48);
    expect(new Set(mappings.map(([, newName]) => newName)).size).toBe(48);
    expect(forward).not.toMatch(/DROP TABLE\s+"(?:mq_chain_networks|mq_address_registry|mq_kv_builds)"/i);
    const reverse = new Set(renamePairs(rollback).map(([from, to]) => `${from}:${to}`));
    for (const [oldName, newName] of mappings) expect(reverse).toContain(`${newName}:${oldName}`);
  });

  it("leaves the two intentionally stable physical tables alone", () => {
    expect(mappings.flat()).not.toContain("mq_users");
    expect(mappings.flat()).not.toContain("mq_catalog_sources");
  });

  it("removes exact legacy physical table literals from runtime code", () => {
    const files = ["src", "origin", "scripts", "tools"].flatMap((directory) => runtimeFiles(path.join(process.cwd(), directory)));
    for (const [oldName] of mappings) {
      for (const file of files) {
        const source = readFileSync(file, "utf8");
        expect(
          source.includes(`"${oldName}"`) || source.includes(`'${oldName}'`) || source.includes(`\`${oldName}\``),
          `${path.relative(process.cwd(), file)} retains exact legacy physical table ${oldName}`,
        ).toBe(false);
      }
    }
  });

  it("preserves object names while repairing trigger function relation references", () => {
    expect(forward).not.toMatch(/ALTER (?:INDEX|SEQUENCE).*RENAME/i);
    for (const name of [
      "mq_validate_active_namespace",
      "mq_guard_network_namespace_deactivation",
      "mq_guard_codec_namespace_deactivation",
      "mq_guard_network_proposal_activation",
    ]) expect(forward).toContain(`FUNCTION ${name}`.replace("FUNCTION mq_validate", 'FUNCTION "mq_validate'));
    expect(forward).toContain('FROM "mq_dict_chain_networks"');
    expect(rollback).toContain('FROM "mq_chain_networks"');
  });

  it("adds compact code dictionaries and the frozen contract registry additively", () => {
    for (const table of [
      "mq_dict_label_statuses",
      "mq_dict_metric_membership_statuses",
      "mq_dict_asset_statuses",
      "mq_dict_quality_tiers",
      "mq_dict_flag_bits",
      "mq_contract_u1_versions",
    ]) expect(forward).toContain(`CREATE TABLE "${table}"`);
    expect(forward).toContain("MQK-U1");
    expect(forward).toContain("MQV-U1");
    expect(forward).toContain("MQT-U1");
    expect(forward).toContain("MQG-U1");
    expect(forward).toContain("MQA-U1");
    expect(forward).toContain("MQAN-U1");
  });
});

describe("Phase I canonical policies", () => {
  it("uses one category precedence rule", () => {
    expect(effectiveCategoryId(17, 4)).toBe(17);
    expect(effectiveCategoryId(null, 4)).toBe(4);
    expect(effectiveCategoryId(undefined, null)).toBeNull();
  });

  it("counts exact metric-group/registry pairs and rejects duplicates", () => {
    expect(assertUniqueMetricMembershipPairs([
      { metricGroupId: 1, registryId: 10 },
      { metricGroupId: 1, registryId: 11 },
      { metricGroupId: 2, registryId: 10 },
    ])).toHaveLength(3);
    expect(() => assertUniqueMetricMembershipPairs([
      { metricGroupId: 1, registryId: 10 },
      { metricGroupId: 1, registryId: 10 },
    ])).toThrow("duplicate_metric_membership_pair:1:10");
  });

  it("separates registration from activation permissions at every layer", () => {
    const origin = read("origin/app.ts");
    const artifact = read("src/lib/mqchain/services/compiled-artifact-service.ts");
    const activation = read("src/lib/mqchain/services/kv-manifest-service.ts");
    expect(origin).toMatch(/compiled\/register[\s\S]+?"kv:register"/);
    expect(origin).toMatch(/compiled\/parity[\s\S]+?"kv:register"/);
    expect(origin).toContain('authorized(actor, "kv:activate", () => activateKvBuildManifest(body))');
    expect(artifact).toContain('assertPermission("kv:register")');
    expect(activation).toContain('assertPermission("kv:activate")');
  });

  it("hardens activation against immutable Build 5 and every stale lineage", () => {
    const service = read("src/lib/mqchain/services/kv-manifest-service.ts");
    expect(service).toContain("build.id === 5");
    expect(service).toContain("dictionary version changed");
    expect(service).toContain("registry snapshot changed");
    expect(service).toContain("a newer committed batch exists");
    expect(service).toContain("latest three-way parity validation");
    expect(service).toContain("expectedCurrentActiveBuildId");
    expect(service).toContain("expectedValidationReportHash");
  });

  it("uses set-based resolver input and configurable bounded write chunks", () => {
    const resolver = read("src/lib/mqchain/services/compiled-postgres-resolver.ts");
    const writer = read("tools/kv-compiler/rocksdb-writer.ts");
    const persistence = read("src/lib/mqchain/services/compiled-artifact-service.ts");
    expect(resolver.match(/jsonb_array_elements/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(writer).toContain("MQCHAIN_COMPILER_CHUNK_SIZE");
    expect(writer).toContain("operations.length >= chunkSize");
    expect(persistence).toContain("MQCHAIN_COMPILED_ENTRY_CHUNK_SIZE");
  });
});
