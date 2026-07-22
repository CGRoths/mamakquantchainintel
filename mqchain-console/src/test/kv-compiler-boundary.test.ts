import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("external compiler boundary", () => {
  it("uses distinct compile, verify, parity and register entrypoints", () => {
    const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
    expect(new Set([scripts["kv:compile"], scripts["kv:verify"], scripts["kv:parity"], scripts["kv:register"]]).size).toBe(4);
    expect(scripts["kv:verify"]).toContain("verify.ts");
    expect(scripts["kv:parity"]).toContain("parity.ts");
    expect(scripts["kv:register"]).toContain("register.ts");
  });

  it("keeps compilation database access read-only and sends writes through signed Origin", () => {
    const compiler = read("tools/kv-compiler/compiler.ts");
    expect(compiler).toContain('accessMode: "read only"');
    expect(compiler).not.toMatch(/\b(?:db|tx)\.(?:insert|update|delete)\(/);
    const originCommand = read("tools/kv-compiler/origin-command.ts");
    expect(originCommand).toContain("requestOrigin");
    expect(originCommand).toContain("actor: compilerActor()");
    const origin = read("origin/app.ts");
    expect(origin).toContain('pathname === "/v1/kv-builds/compiled/parity"');
    expect(origin).toContain('pathname === "/v1/kv-builds/compiled/register"');
    expect(origin).toContain('authorized(actor, "batch:commit"');
  });

  it("provides all three named reference resolver paths without per-key SQL loops", () => {
    const canonical = read("src/lib/mqchain/services/canonical-postgres-resolver.ts");
    const compiled = read("src/lib/mqchain/services/compiled-postgres-resolver.ts");
    const rocks = read("tools/kv-compiler/rocksdb-resolver.ts");
    expect(canonical).toContain("class CanonicalPostgresResolver");
    expect(compiled).toContain("class CompiledPostgresResolver");
    expect(rocks).toContain("class RocksDbResolver");
    expect(compiled).not.toMatch(/for\s*\([^)]*key[^)]*\)\s*\{[^}]*\.select\(/s);
    for (const source of [canonical, compiled, rocks]) {
      expect(source).toContain("resolveCurrent");
      expect(source).toContain("resolveTimeline");
      expect(source).toContain("resolveMetricGroup");
    }
  });

  it("serves MQNODE lookups only from the active RocksDB artifact", () => {
    const service = read("src/lib/mqchain/services/activated-artifact-resolver.ts");
    expect(service).toContain('eq(mqKvBuilds.status, "active")');
    expect(service).toContain("new RocksDbResolver");
    expect(service).not.toContain("mqKvCompiledEntries");
    expect(service).not.toContain("mqAddressRegistry");
    const origin = read("origin/app.ts");
    expect(origin).toContain('pathname === "/v1/mqnode/u1/resolve"');
    expect(origin).toContain('authorized(actor, "view"');
  });
});
