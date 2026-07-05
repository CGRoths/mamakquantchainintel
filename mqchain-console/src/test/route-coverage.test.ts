import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REQUIRED_APP_ROUTES = [
  "/login",
  "/mqchain",
  "/mqchain/intake",
  "/mqchain/intake/new",
  "/mqchain/source-jobs",
  "/mqchain/source-jobs/[id]",
  "/mqchain/candidates",
  "/mqchain/candidates/[id]",
  "/mqchain/review",
  "/mqchain/review/groups",
  "/mqchain/review/groups/[id]",
  "/mqchain/batches",
  "/mqchain/batches/[id]",
  "/mqchain/registry",
  "/mqchain/registry/[id]",
  "/mqchain/dictionaries",
  "/mqchain/dictionaries/entities",
  "/mqchain/dictionaries/protocols",
  "/mqchain/dictionaries/roles",
  "/mqchain/dictionaries/categories",
  "/mqchain/dictionaries/key-prefixes",
  "/mqchain/metric-groups",
  "/mqchain/discovery",
  "/mqchain/discovery/jobs",
  "/mqchain/discovery/jobs/[id]",
  "/mqchain/kv-builds",
  "/mqchain/kv-builds/[id]",
  "/mqchain/resolver",
  "/mqchain/audit-log",
  "/mqchain/settings",
] as const;

const PRIMARY_NAV_ROUTES = [
  "/mqchain",
  "/mqchain/intake/new",
  "/mqchain/source-jobs",
  "/mqchain/candidates",
  "/mqchain/review",
  "/mqchain/batches",
  "/mqchain/registry",
  "/mqchain/dictionaries",
  "/mqchain/metric-groups",
  "/mqchain/discovery/jobs",
  "/mqchain/kv-builds",
  "/mqchain/resolver",
  "/mqchain/audit-log",
  "/mqchain/settings",
] as const;

function routeToPageFile(route: string) {
  const segments = route.split("/").filter(Boolean);
  return join(process.cwd(), "src", "app", ...segments, "page.tsx");
}

describe("MQCHAIN route coverage", () => {
  it("keeps every spec-required app route backed by a page file", () => {
    const missingRoutes = REQUIRED_APP_ROUTES.filter((route) => !existsSync(routeToPageFile(route)));

    expect(missingRoutes).toEqual([]);
  });

  it("keeps primary operator workspaces reachable from the console shell", () => {
    const shell = readFileSync(join(process.cwd(), "src", "components", "mqchain", "console-shell.tsx"), "utf8");
    const missingNavRoutes = PRIMARY_NAV_ROUTES.filter((route) => !shell.includes(`href: "${route}"`));

    expect(missingNavRoutes).toEqual([]);
  });
});
