import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildDictionaryBundle } from "../src/lib/mqchain/dictionary-bundle";
import { closeDb } from "../src/db/client";

function outputArgument() {
  const index = process.argv.indexOf("--output");
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error("Usage: npm.cmd run mqchain:dictionary-bundle -- --output <directory>");
  return resolve(value);
}

async function main() {
  const output = outputArgument();
  const bundle = await buildDictionaryBundle();
  await mkdir(output, { recursive: true });
  await Promise.all([
    ...bundle.files.map(file => writeFile(resolve(output, file.name), file.content, "utf8")),
    writeFile(resolve(output, "manifest.json"), bundle.manifest, "utf8"),
  ]);
  process.stdout.write(`MQCHAIN dictionary bundle ${bundle.dictionaryVersion} written to ${output}\n`);
}

main()
  .catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : "Dictionary bundle generation failed."}\n`);
    process.exitCode = 1;
  })
  .finally(closeDb);
