import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

function routeFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        return routeFiles(fullPath);
      }
      return entry === "route.ts" ? [fullPath] : [];
    })
    .sort();
}

describe("MQCHAIN API auth contract", () => {
  it("keeps every mqchain route handler behind an explicit permission check", () => {
    const apiRoot = join(process.cwd(), "src", "app", "api", "mqchain");
    const files = routeFiles(apiRoot);

    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const label = relative(process.cwd(), file);
      const handlers = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((match) => match[1]);

      expect(handlers, `${label} should declare at least one route handler`).not.toEqual([]);
      expect(source, `${label} should import the shared RBAC guard`).toContain('from "@/lib/auth/permissions"');
      expect(source, `${label} should assert a permission before exporting MQCHAIN data`).toContain("await assertPermission(");
      expect(source, `${label} should return 401 for unauthenticated requests`).toContain(", 401)");
    }
  });
});
