import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every page that renders a mutation control must gate that control on the same permission the
 * underlying service asserts. Server services already enforce RBAC, but operators should never see
 * (or be able to submit) a control their role cannot use. This contract locks that visibility in.
 */
const GATED_MUTATION_PAGES: Array<{ page: string; permissions: string[] }> = [
  { page: "intake/new/page.tsx", permissions: ["intake:create"] },
  { page: "source-jobs/[id]/page.tsx", permissions: ["intake:create", "intake:delete", "source:verify"] },
  { page: "source-jobs/page.tsx", permissions: ["intake:delete"] },
  { page: "candidates/[id]/page.tsx", permissions: ["candidate:review", "candidate:evidence"] },
  { page: "review/page.tsx", permissions: ["candidate:review", "candidate:evidence"] },
  { page: "review/groups/[id]/page.tsx", permissions: ["candidate:review", "candidate:evidence"] },
  { page: "batches/page.tsx", permissions: ["candidate:review"] },
  { page: "batches/[id]/page.tsx", permissions: ["candidate:review", "batch:commit"] },
  { page: "registry/[id]/page.tsx", permissions: ["registry:edit"] },
  { page: "metric-groups/page.tsx", permissions: ["dictionary:edit", "batch:commit"] },
  { page: "kv-builds/page.tsx", permissions: ["batch:commit"] },
  { page: "kv-builds/[id]/page.tsx", permissions: ["batch:commit"] },
  { page: "discovery/jobs/page.tsx", permissions: ["discovery:create"] },
  { page: "dictionaries/entities/page.tsx", permissions: ["dictionary:edit"] },
  { page: "dictionaries/protocols/page.tsx", permissions: ["dictionary:edit"] },
  { page: "dictionaries/categories/page.tsx", permissions: ["dictionary:edit"] },
  { page: "dictionaries/roles/page.tsx", permissions: ["dictionary:edit"] },
  { page: "dictionaries/key-prefixes/page.tsx", permissions: ["dictionary:edit"] },
];

function pageSource(page: string) {
  return readFileSync(join(process.cwd(), "src", "app", "mqchain", ...page.split("/")), "utf8");
}

describe("MQCHAIN page RBAC visibility", () => {
  for (const { page, permissions } of GATED_MUTATION_PAGES) {
    it(`gates ${page} on ${permissions.join(", ")}`, () => {
      const source = pageSource(page);

      expect(source, `${page} should resolve the current viewer`).toContain("getCurrentUser");
      expect(source, `${page} should evaluate role permissions`).toContain("roleCan(");

      for (const permission of permissions) {
        expect(source, `${page} should gate a control on ${permission}`).toContain(`"${permission}"`);
      }
    });
  }
});
