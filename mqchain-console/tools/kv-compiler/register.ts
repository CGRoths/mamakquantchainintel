import path from "node:path";

import { requiredArtifactDirectory } from "./arguments";
import { postSignedOrigin } from "./origin-command";

async function main() {
  const result = await postSignedOrigin("/v1/kv-builds/compiled/register", { artifactDirectory: path.resolve(requiredArtifactDirectory()) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
