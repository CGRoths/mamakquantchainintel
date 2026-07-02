import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { eq } from "drizzle-orm";

import { getDb } from "../src/db/client";
import { mqAddressRegistry, mqCategoryDict, mqEntities, mqKvBuilds, mqKvRoleDict, mqProtocols } from "../src/db/schema";
import { buildKvKey, type MqKvAddressValue } from "../src/lib/mqchain/kv/schema";
import { recordDictionaryVersion } from "../src/lib/mqchain/services/dictionary-service";

function argValue(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }

  return process.argv[index + 1] ?? fallback;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const outDir = path.resolve(argValue("--out", "build/mqchain-kv"));
  const db = getDb();
  const rows = await db
    .select({
      registry: mqAddressRegistry,
      entity: mqEntities,
      protocol: mqProtocols,
      role: mqKvRoleDict,
      category: mqCategoryDict,
    })
    .from(mqAddressRegistry)
    .innerJoin(mqEntities, eq(mqAddressRegistry.entityId, mqEntities.id))
    .leftJoin(mqProtocols, eq(mqAddressRegistry.protocolId, mqProtocols.id))
    .innerJoin(mqKvRoleDict, eq(mqAddressRegistry.roleId, mqKvRoleDict.roleId))
    .leftJoin(mqCategoryDict, eq(mqKvRoleDict.categoryId, mqCategoryDict.categoryId))
    .where(eq(mqAddressRegistry.isActive, true));

  const entries = rows
    .filter((row) => row.registry.prefixCode !== null && row.registry.payloadHex !== null)
    .map((row) => {
      const value: MqKvAddressValue = {
        entityId: row.registry.entityId!,
        protocolId: row.registry.protocolId,
        roleId: row.registry.roleId!,
        categoryId: row.category?.categoryId ?? null,
        confidenceScore: row.registry.confidenceScore,
        qualityTier: row.registry.qualityTier,
        flags: row.registry.flags,
        validFromBlock: row.registry.validFromBlock,
        validToBlock: row.registry.validToBlock,
        approvedBatchId: row.registry.approvedBatchId,
      };

      return {
        key: buildKvKey({
          prefixCode: row.registry.prefixCode!,
          payloadHex: row.registry.payloadHex!,
        }),
        value,
        debug: {
          chainCode: row.registry.chainCode,
          address: row.registry.normalizedAddress,
          entityCode: row.entity.entityCode,
          protocolCode: row.protocol?.protocolCode ?? null,
          roleCode: row.role.roleCode,
          categoryCode: row.category?.categoryCode ?? null,
        },
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));

  const body = entries.map((entry) => JSON.stringify(entry)).join("\n") + (entries.length ? "\n" : "");
  const buildHash = sha256(body);
  const dictionaryVersion = await recordDictionaryVersion(null, "kv_compile");
  const buildDir = path.join(outDir, buildHash);
  const registryPath = path.join(buildDir, "registry.jsonl");
  const manifestPath = path.join(buildDir, "manifest.json");
  const manifest = {
    buildHash,
    dictionaryVersion,
    rowCount: entries.length,
    generatedAt: new Date().toISOString(),
    registryPath,
    source: "postgres:mq_address_registry",
    artifactType: "jsonl-kv-preview",
    note: "RocksDB compilation should consume this deterministic JSONL or replace it with a binary writer.",
  };

  await mkdir(buildDir, { recursive: true });
  await writeFile(registryPath, body, "utf8");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  await db
    .insert(mqKvBuilds)
    .values({
      buildHash,
      dictionaryVersion,
      status: "compiled",
      rowCount: entries.length,
      storageUri: buildDir,
      manifest,
    })
    .onConflictDoUpdate({
      target: mqKvBuilds.buildHash,
      set: {
        status: "compiled",
        dictionaryVersion,
        rowCount: entries.length,
        storageUri: buildDir,
        manifest,
      },
    });

  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
