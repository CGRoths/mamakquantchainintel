import path from "node:path";

import { requiredArtifactDirectory } from "./arguments";
import { verifyCompiledArtifactPackage } from "./artifact-package";

async function main() {
  const artifactDirectory = path.resolve(requiredArtifactDirectory());
  const result = await verifyCompiledArtifactPackage(artifactDirectory);
  process.stdout.write(`${JSON.stringify({ artifactDirectory, artifactHash: result.manifest.artifactHash, compileRequestBuildId: result.manifest.compileRequestBuildId, indexes: result.summaries, passed: true }, null, 2)}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
