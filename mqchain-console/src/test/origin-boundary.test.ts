import { readFileSync, readdirSync } from "node:fs";
import { join, normalize, relative, resolve } from "node:path";

import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OriginClientError } from "@/lib/mqchain/origin-client/errors";
import { requestOrigin } from "@/lib/mqchain/origin-client/client";
import { originActorSchema } from "@/lib/mqchain/contracts/origin";
import { assertPermission as assertOriginPermission, runWithOriginActor } from "@/lib/mqchain/origin-only/actor-context";
import {
  canonicalOriginPath,
  decodeOriginActorClaims,
  encodeOriginActorClaims,
  MQCHAIN_ACTOR_HEADER,
  MQCHAIN_REQUEST_ID_HEADER,
  MQCHAIN_SIGNATURE_HEADER,
  originActorClaimError,
  OriginReplayWindow,
  signOriginRequest,
  verifyOriginRequestSignature,
} from "@/lib/mqchain/contracts/request-signing";

const root = process.cwd();
const extensions = [".ts", ".tsx"];

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : extensions.some(extension => path.endsWith(extension)) ? [path] : [];
  });
}

function resolveLocalImport(from: string, specifier: string) {
  const base = specifier.startsWith("@/") ? join(root, "src", specifier.slice(2)) : specifier.startsWith(".") ? resolve(from, "..", specifier) : null;
  if (!base) return null;
  const candidates = [base, ...extensions.map(extension => base + extension), ...extensions.map(extension => join(base, `index${extension}`))];
  return candidates.find(candidate => {
    try { readFileSync(candidate); return true; } catch { return false; }
  }) ?? null;
}

function runtimeImports(file: string) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  source.forEachChild(node => {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
  });
  return imports;
}

describe("MQCHAIN Origin boundary", () => {
  it("keeps every Vercel runtime entrypoint away from database and Origin implementation modules", () => {
    const appFiles = filesUnder(join(root, "src", "app"));
    const entries = appFiles.filter(file => /(?:page|layout|route)\.tsx?$/.test(file) || file.endsWith(normalize("mqchain/actions.ts")));
    const visited = new Set<string>();
    const violations: string[] = [];
    const queue = [...entries];
    while (queue.length) {
      const file = queue.shift()!;
      if (visited.has(file)) continue;
      visited.add(file);
      const source = readFileSync(file, "utf8");
      if (file.includes(normalize("src/db/")) || /\bgetDb\s*\(|process\.env\.(?:DATABASE_URL|MQCHAIN_SEED_)/.test(source)) violations.push(relative(root, file));
      if (/from\s+["'][^"']*(?:\/services\/|\/origin-only\/)/.test(source)) violations.push(`${relative(root, file)} -> Origin implementation import`);
      for (const specifier of runtimeImports(file)) {
        if (specifier === "postgres" || specifier.startsWith("drizzle-orm/postgres")) violations.push(`${relative(root, file)} -> ${specifier}`);
        const target = resolveLocalImport(file, specifier);
        if (target) queue.push(target);
      }
    }
    expect(violations).toEqual([]);
    expect(visited.size).toBeGreaterThan(100);
  });

  it("covers every production console domain in the Origin route dispatcher", () => {
    const source = readFileSync(join(root, "origin", "app.ts"), "utf8");
    for (const route of ["/v1/dashboard/overview", "/v1/intake", "/v1/source-jobs", "/v1/candidates", "/v1/review", "/v1/batches", "/v1/registry", "/v1/dictionaries", "ORIGIN_CATALOG_KEYS", "/v1/metric-groups", "/v1/discovery/jobs", "/v1/kv-builds", "/v1/kv-filters", "/v1/resolver", "/v1/audit-log", "/v1/settings/users", "/v1/network-support", "/v1/network-proposals"]) {
      expect(source).toContain(route);
    }
  });

  it("keeps role authority at the Origin database boundary", async () => {
    const source = readFileSync(join(root, "origin", "app.ts"), "utf8");
    expect(source).toContain("where(eq(mqUsers.id, claims.sub))");
    expect(source).toContain("!user.isActive");
    expect(source).toContain("roleCan(user.role");
    expect(source).not.toContain("claims.role");

    const parsed = originActorSchema.parse({
      sub: "11111111-1111-4111-8111-111111111111",
      email: "employee@example.com",
      aud: "mqchain-console",
      iat: 1_800_000_000,
      jti: "22222222-2222-4222-8222-222222222222",
      role: "owner",
    });
    expect(parsed).not.toHaveProperty("role");

    const readonlyActor = { id: parsed.sub, email: parsed.email, name: parsed.email, role: "readonly" };
    await expect(runWithOriginActor(readonlyActor, () => assertOriginPermission("view"))).resolves.toEqual(readonlyActor);
    await expect(runWithOriginActor(readonlyActor, () => assertOriginPermission("batch:commit"))).rejects.toThrow("permission");
  });

  it("keeps route-specific request body limits", () => {
    const source = readFileSync(join(root, "origin", "app.ts"), "utf8");
    expect(source).toContain("credentials: 16 * 1024");
    expect(source).toContain("standard: 64 * 1024");
    expect(source).toContain("manifest: 1024 * 1024");
    expect(source).toContain("intake: 1024 * 1024 + 64 * 1024");
    expect(source).toContain("bodyLimitFor(method, url.pathname)");
  });
});

describe("Origin request signing", () => {
  const now = 1_800_000_000;
  const claims = { sub: "11111111-1111-4111-8111-111111111111", email: "employee@example.com", aud: "mqchain-console", iat: now, jti: "22222222-2222-4222-8222-222222222222" };

  it("canonicalizes queries and rejects tampered request inputs", () => {
    const encodedActor = encodeOriginActorClaims(claims);
    const input = { secret: "test-secret", method: "POST", pathAndQuery: "/v1/test?z=2&a=1", requestId: "request-1", bodyText: "{\"ok\":true}", encodedActor };
    const signature = signOriginRequest(input);
    expect(canonicalOriginPath(input.pathAndQuery)).toBe("/v1/test?a=1&z=2");
    expect(verifyOriginRequestSignature({ ...input, signature })).toBe(true);
    expect(verifyOriginRequestSignature({ ...input, signature, method: "GET" })).toBe(false);
    expect(verifyOriginRequestSignature({ ...input, signature, bodyText: "{}" })).toBe(false);
    expect(decodeOriginActorClaims(encodedActor)).toEqual(claims);
  });

  it("rejects wrong audiences, expired claims, and replayed request IDs", () => {
    expect(originActorClaimError(claims, "other", now)).toBe("invalid_audience");
    expect(originActorClaimError({ ...claims, iat: now - 61 }, claims.aud, now)).toBe("expired_signature");
    expect(originActorClaimError(claims, claims.aud, now)).toBeNull();
    const replay = new OriginReplayWindow(10, 120);
    expect(replay.checkAndRemember(claims.jti, now)).toBe(true);
    expect(replay.checkAndRemember(claims.jti, now)).toBe(false);
    expect(replay.checkAndRemember(claims.jti, now + 121)).toBe(true);
  });
});

describe("Origin HTTP client", () => {
  const originalEnv = { ...process.env };
  afterEach(() => { vi.restoreAllMocks(); process.env = { ...originalEnv }; });

  it("centralizes Cloudflare headers, employee signing, and date revival", async () => {
    Object.assign(process.env, { MQCHAIN_ORIGIN_URL: "https://origin.example", CF_ACCESS_CLIENT_ID: "client-id", CF_ACCESS_CLIENT_SECRET: "client-secret", MQCHAIN_REQUEST_AUDIENCE: "mqchain-console", MQCHAIN_REQUEST_SIGNING_SECRET: "signing-secret" });
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      expect(headers["CF-Access-Client-Id"]).toBe("client-id");
      expect(headers["CF-Access-Client-Secret"]).toBe("client-secret");
      expect(headers[MQCHAIN_ACTOR_HEADER]).toBeTruthy();
      expect(headers[MQCHAIN_SIGNATURE_HEADER]).toMatch(/^v1=/);
      expect(headers[MQCHAIN_REQUEST_ID_HEADER]).toBeTruthy();
      return new Response('{"createdAt":"2026-07-18T00:00:00.000Z"}', { status: 200, headers: { "content-type": "application/json", "x-mqchain-request-id": headers[MQCHAIN_REQUEST_ID_HEADER] } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await requestOrigin<{ createdAt: Date }>("/v1/test", { actor: { id: "11111111-1111-4111-8111-111111111111", email: "employee@example.com" } });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("normalizes Origin error envelopes", async () => {
    Object.assign(process.env, { MQCHAIN_ORIGIN_URL: "https://origin.example", CF_ACCESS_CLIENT_ID: "id", CF_ACCESS_CLIENT_SECRET: "secret" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":{"code":"permission_denied","message":"Denied"},"requestId":"r1"}', { status: 403 })));
    await expect(requestOrigin("/v1/test")).rejects.toEqual(expect.objectContaining<Partial<OriginClientError>>({ status: 403, code: "permission_denied", requestId: "r1" }));
  });
});
