import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const HANDLER_EXPORT_PATTERN = /export async function (GET|POST|PUT|PATCH|DELETE)\b/g;

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(fullPath);
    return entry.isFile() && entry.name === "route.ts" ? [fullPath] : [];
  });
}

function handlerBlocks(source: string) {
  const matches = [...source.matchAll(HANDLER_EXPORT_PATTERN)];
  return matches.map((match, index) => {
    const next = matches[index + 1];
    return {
      method: match[1],
      body: source.slice(match.index ?? 0, next?.index ?? source.length),
    };
  });
}

describe("MQCHAIN API route security", () => {
  it("requires every /api/mqchain handler to gate access explicitly", () => {
    const apiRoot = join(process.cwd(), "src", "app", "api", "mqchain");
    const unguardedHandlers = routeFiles(apiRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return handlerBlocks(source)
        .filter((handler) => !handler.body.includes("assertAuthenticated") && !handler.body.includes("assertPermission"))
        .map((handler) => `${relative(process.cwd(), file)}:${handler.method}`);
    });

    expect(unguardedHandlers).toEqual([]);
  });

  it("keeps /mqchain pages behind the authenticated layout", () => {
    const layout = readFileSync(join(process.cwd(), "src", "app", "mqchain", "layout.tsx"), "utf8");

    expect(layout).toContain("getCurrentUser");
    expect(layout).toContain('redirect("/login")');
  });
});
