import { closeDb } from "../src/db/client";
import { recordDictionaryVersion } from "../src/lib/mqchain/services/dictionary-service";

async function main() {
  const dictionaryVersion = await recordDictionaryVersion(null, "phase1_compact_dictionary_families_added");
  process.stdout.write(`${JSON.stringify({ dictionaryVersion }, null, 2)}\n`);
}

main().finally(closeDb);
