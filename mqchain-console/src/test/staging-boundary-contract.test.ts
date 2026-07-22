import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const CANONICAL_WRITE_TABLES = [
  {
    symbol: "mqRegistryAddressLabels",
    allowedFiles: ["src/lib/mqchain/services/batch-service.ts", "src/lib/mqchain/services/registry-service.ts"],
  },
  {
    symbol: "mqBuildKvBuilds",
    allowedFiles: ["src/lib/mqchain/services/batch-service.ts", "src/lib/mqchain/services/kv-manifest-service.ts", "src/lib/mqchain/services/compiled-artifact-service.ts"],
  },
  {
    symbol: "mqBuildIndexManifests",
    allowedFiles: ["src/lib/mqchain/services/kv-manifest-service.ts", "src/lib/mqchain/services/compiled-artifact-service.ts"],
  },
  {
    symbol: "mqBuildMetricGroupMembers",
    allowedFiles: ["src/lib/mqchain/services/kv-manifest-service.ts"],
  },
  {
    symbol: "mqBuildMetricGroupMembershipSnapshots",
    allowedFiles: ["src/lib/mqchain/services/kv-manifest-service.ts"],
  },
] as const;

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      return tsFiles(fullPath);
    }
    return fullPath.endsWith(".ts") ? [fullPath] : [];
  });
}

function workspaceRelative(file: string) {
  return relative(process.cwd(), file).replace(/\\/g, "/");
}

describe("MQCHAIN staging boundary contract", () => {
  it("keeps canonical registry and KV writes inside the approved commit and compiled-registration services", () => {
    const files = [
      ...tsFiles(join(process.cwd(), "src", "lib", "mqchain")),
      ...tsFiles(join(process.cwd(), "src", "app", "api", "mqchain")),
    ].sort();
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const label = workspaceRelative(file);

      for (const table of CANONICAL_WRITE_TABLES) {
        const allowed = (table.allowedFiles as readonly string[]).includes(label);
        const writePattern = new RegExp(`(?:\\.\\s*)?(?:insert|update|delete)\\s*\\(\\s*${table.symbol}\\b`);

        if (!allowed && writePattern.test(source)) {
          violations.push(`${label} writes ${table.symbol}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
