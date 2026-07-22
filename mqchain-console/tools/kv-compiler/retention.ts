import { postSignedOrigin } from "./origin-command";

type RetentionPlan = { planHash: string; removableBuildIds: number[] };

async function main() {
  const preview = await postSignedOrigin<RetentionPlan>("/v1/kv-builds/compiled/retention", { apply: false });
  if (!process.argv.includes("--apply")) {
    process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
    return;
  }
  const applied = await postSignedOrigin("/v1/kv-builds/compiled/retention", { apply: true, expectedPlanHash: preview.planHash, buildIds: preview.removableBuildIds });
  process.stdout.write(`${JSON.stringify(applied, null, 2)}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
