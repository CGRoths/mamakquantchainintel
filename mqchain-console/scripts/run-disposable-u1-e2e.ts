import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

import postgres from "postgres";

function run(command: string, args: string[], environment: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env: environment, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? "unknown"}`);
}

async function main() {
  const configured = process.env.DATABASE_URL?.trim();
  if (!configured) throw new Error("DATABASE_URL is required to derive disposable PostgreSQL credentials.");
  const databaseName = `mqchain_u1_it_${Date.now()}_${randomUUID().slice(0, 8).replace(/-/g, "")}`;
  const adminUrl = new URL(configured);
  adminUrl.pathname = "/postgres";
  const testUrl = new URL(configured);
  testUrl.pathname = `/${databaseName}`;
  const admin = postgres(adminUrl.toString(), { max: 1, prepare: false });
  try {
    await admin.unsafe(`create database "${databaseName}"`);
    process.stdout.write(`Created disposable PostgreSQL database ${databaseName}.\n`);
    const environment = { ...process.env, DATABASE_URL: testUrl.toString(), MQCHAIN_TEST_DATABASE_URL: testUrl.toString() };
    run(process.execPath, ["./node_modules/drizzle-kit/bin.cjs", "migrate"], environment);
    run(process.execPath, ["./node_modules/vitest/vitest.mjs", "run", "src/test/integration/bulk-approval-lifecycle.integration.test.ts"], environment);
  } finally {
    await admin.unsafe(`drop database if exists "${databaseName}" with (force)`);
    await admin.end();
    process.stdout.write(`Dropped disposable PostgreSQL database ${databaseName}.\n`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
