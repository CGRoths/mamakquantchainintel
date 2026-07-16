import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { closeDb } from "../src/db/client";
import { getNetworkCatalogDrift } from "../src/lib/mqchain/services/network-support-service";

async function main() {
  const report = await getNetworkCatalogDrift();
  const lines = [
    "# MQCHAIN U1 Catalog/Database Drift",
    "",
    `Dictionary version: \`${report.dictionaryVersion}\``,
    `Generated: ${report.generatedAt}`,
    "",
    `Total drift: ${report.summary.total} | errors: ${report.summary.errors} | warnings: ${report.summary.warnings}`,
    "",
    "| Severity | Scope | Key | Field | Catalog | Database |",
    "|---|---|---|---|---|---|",
    ...report.drift.map(row => `| ${row.severity} | ${row.scope} | ${row.key} | ${row.field} | ${String(row.catalogValue).replace(/\|/g, "\\|")} | ${String(row.databaseValue).replace(/\|/g, "\\|")} |`),
    "",
  ];
  const out = path.join(process.cwd(), "reports");
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "u1_catalog_database_drift.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(out, "u1_catalog_database_drift.md"), lines.join("\n"), "utf8");
  console.log(JSON.stringify(report.summary));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(closeDb);
