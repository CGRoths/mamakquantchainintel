import { desc, eq } from "drizzle-orm";

import { closeDb, getDb } from "../../src/db/client";
import { mqBuildKvBuilds, mqWorkflowLabelBatches } from "../../src/db/schema";
import { createFullKvBuildRequest } from "../../src/lib/mqchain/services/full-kv-build-service";

function argument(name: string) {
  const position = process.argv.indexOf(name);
  return position < 0 ? null : process.argv[position + 1] ?? null;
}

async function main() {
  const triggeringBatchId = Number(argument("--triggering-batch-id"));
  if (!Number.isSafeInteger(triggeringBatchId) || triggeringBatchId <= 0) throw new Error("--triggering-batch-id must be a positive integer");
  const db = getDb();
  const result = await db.transaction(async tx => {
    const [triggeringBatch] = await tx.select().from(mqWorkflowLabelBatches).where(eq(mqWorkflowLabelBatches.id, triggeringBatchId)).limit(1);
    if (!triggeringBatch || triggeringBatch.status !== "committed") throw new Error(`triggering_batch_not_committed:${triggeringBatchId}`);
    const [latestBatch] = await tx.select({ id: mqWorkflowLabelBatches.id }).from(mqWorkflowLabelBatches).where(eq(mqWorkflowLabelBatches.status, "committed")).orderBy(desc(mqWorkflowLabelBatches.id)).limit(1);
    const request = await createFullKvBuildRequest(tx, { triggeringBatchId, lastCommittedBatchId: latestBatch?.id ?? triggeringBatchId });
    const [existing] = await tx.select().from(mqBuildKvBuilds).where(eq(mqBuildKvBuilds.buildHash, request.buildHash)).limit(1);
    if (existing) return existing;
    const [build] = await tx.insert(mqBuildKvBuilds).values({ buildHash: request.buildHash, dictionaryVersion: request.snapshot.dictionaryVersion, status: "pending", rowCount: request.snapshot.registryIds.length, lastCommittedBatchId: latestBatch?.id ?? triggeringBatchId, manifest: request.manifest }).returning();
    return build;
  }, { isolationLevel: "repeatable read" });
  process.stdout.write(`${JSON.stringify({ buildId: result.id, buildHash: result.buildHash, status: result.status, rowCount: result.rowCount }, null, 2)}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(closeDb);
