import path from "node:path";

import { closeDb } from "../../src/db/client";
import { compilePendingFullBuild } from "./compiler";

function argument(name: string) {
  const position = process.argv.indexOf(name);
  return position < 0 ? null : process.argv[position + 1] ?? null;
}

async function main() {
  const buildId = Number(argument("--build-id"));
  if (!Number.isSafeInteger(buildId) || buildId <= 0) throw new Error("--build-id must be a positive integer");
  const artifactRoot = path.resolve(argument("--artifact-root") ?? "D:/MAMAKQUANT_DATA/mqchain/rocksdb");
  const result = await compilePendingFullBuild(buildId, artifactRoot);
  process.stdout.write(`${JSON.stringify({ buildId: result.build.id, compileRequestBuildId: buildId, artifactDirectory: result.artifactDirectory, validationRunId: result.validation.id, reportHash: result.validation.reportHash, report: result.report }, null, 2)}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(closeDb);
