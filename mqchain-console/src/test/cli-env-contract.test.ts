import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("CLI environment contract", () => {
  it("loads .env.local for every database-backed CLI command", () => {
    expect(packageJson.scripts["db:migrate"]).toContain("--env-file=.env.local");
    expect(packageJson.scripts["db:seed"]).toContain("--env-file=.env.local");
    expect(packageJson.scripts["kv:compile"]).toContain("--env-file=.env.local");
  });

  it("does not print the configured seed password", () => {
    const seedScript = readFileSync(join(root, "scripts", "seed.ts"), "utf8");

    expect(seedScript).not.toContain("${ownerEmail} / ${ownerPassword}");
    expect(seedScript).not.toMatch(/console\.log\([^\n]*ownerPassword/);
  });
});
