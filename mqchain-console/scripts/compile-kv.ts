import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { eq } from "drizzle-orm";

import { getDb } from "../src/db/client";
import {
  mqAddressRegistry,
  mqCategoryDict,
  mqEntities,
  mqKvBuilds,
  mqKvIndexManifests,
  mqKvRoleDict,
  mqMetricGroupRules,
  mqMetricGroups,
  mqProtocols,
} from "../src/db/schema";
import { extractKvIndexManifestRecords } from "../src/lib/mqchain/kv-manifest";
import {
  buildKvKey,
  encodeCurrentLabelKey,
  encodeCurrentLabelValue,
  encodeMetricGroupMembershipKey,
  encodeMetricGroupMembershipValue,
  encodeTimelineKey,
  encodeTimelineValue,
  MQ_KV_SCHEMA,
  type MqKvAddressValue,
} from "../src/lib/mqchain/kv/schema";
import { matchingMetricGroupsForRow } from "../src/lib/mqchain/metric-rules";
import { getMqchainKvArtifactRoot } from "../src/lib/mqchain/runtime-env";
import { recordDictionaryVersion } from "../src/lib/mqchain/services/dictionary-service";
import type { MetricGroupRule } from "../src/lib/mqchain/types";

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

function hex(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("hex");
}

function jsonl(entries: unknown[]) {
  return entries.map((entry) => JSON.stringify(entry)).join("\n") + (entries.length ? "\n" : "");
}

async function main() {
  const outDir = path.resolve(argValue("--out", getMqchainKvArtifactRoot()));
  const db = getDb();
  const [rows, metricGroups, metricGroupRules] = await Promise.all([
    db
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
      .leftJoin(mqCategoryDict, eq(mqKvRoleDict.categoryId, mqCategoryDict.categoryId)),
    db.select().from(mqMetricGroups).where(eq(mqMetricGroups.isActive, true)),
    db.select().from(mqMetricGroupRules),
  ]);

  const groups = metricGroups.map((group) => ({
    id: group.id,
    metricGroupCode: group.metricGroupCode,
    metricGroupName: group.metricGroupName,
    chainCode: group.chainCode,
    minConfidence: group.minConfidence,
    requireMetricEligible: group.requireMetricEligible,
    rules: metricGroupRules
      .filter((rule) => rule.metricGroupId === group.id)
      .map((rule) => ({
        ...(rule.ruleJson as MetricGroupRule),
        minConfidence: (rule.ruleJson as MetricGroupRule).minConfidence ?? group.minConfidence,
        requireMetricEligible: (rule.ruleJson as MetricGroupRule).requireMetricEligible ?? group.requireMetricEligible,
      })),
  }));

  const compilableRows = rows
    .filter((row) => row.registry.prefixCode !== null && row.registry.payloadHex !== null)
    .map((row) => {
      const value: MqKvAddressValue = {
        entityId: row.registry.entityId!,
        protocolId: row.registry.protocolId,
        roleId: row.registry.roleId!,
        categoryId: row.category?.categoryId ?? null,
        labelStatus: row.registry.labelStatus,
        confidenceScore: row.registry.confidenceScore,
        qualityTier: row.registry.qualityTier,
        flags: row.registry.flags,
        validFromBlock: row.registry.validFromBlock,
        validToBlock: row.registry.validToBlock,
        firstSeenBlock: row.registry.firstSeenBlock,
        lastSeenBlock: row.registry.lastSeenBlock,
        approvedBatchId: row.registry.approvedBatchId,
      };

      return {
        row,
        value,
        key: buildKvKey({ prefixCode: row.registry.prefixCode!, payloadHex: row.registry.payloadHex! }),
        debug: {
          registryId: row.registry.id,
          chainCode: row.registry.chainCode,
          address: row.registry.normalizedAddress,
          entityCode: row.entity.entityCode,
          protocolCode: row.protocol?.protocolCode ?? null,
          roleCode: row.role.roleCode,
          categoryCode: row.category?.categoryCode ?? null,
        },
      };
    });

  const currentEntries = compilableRows
    .filter((entry) => entry.row.registry.isActive)
    .map((entry) => ({
      key: entry.key,
      keyHex: hex(encodeCurrentLabelKey({
        prefixCode: entry.row.registry.prefixCode!,
        payloadHex: entry.row.registry.payloadHex!,
      })),
      value: entry.value,
      valueHex: hex(encodeCurrentLabelValue(entry.value)),
      debug: entry.debug,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));

  const timelineEntries = compilableRows
    .map((entry) => ({
      key: `${entry.key}:${entry.row.registry.validFromBlock ?? 0}`,
      keyHex: hex(encodeTimelineKey({
        prefixCode: entry.row.registry.prefixCode!,
        payloadHex: entry.row.registry.payloadHex!,
        validFromBlock: entry.row.registry.validFromBlock,
      })),
      value: entry.value,
      valueHex: hex(encodeTimelineValue(entry.value)),
      debug: entry.debug,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));

  const metricGroupEntries = compilableRows
    .flatMap((entry) => {
      if (!entry.row.registry.isActive) {
        return [];
      }

      return matchingMetricGroupsForRow(
        {
          chainCode: entry.row.registry.chainCode,
          roleCode: entry.row.role.roleCode,
          categoryCode: entry.row.category?.categoryCode,
          entityCode: entry.row.entity.entityCode,
          confidenceScore: entry.row.registry.confidenceScore,
          flags: entry.row.registry.flags,
        },
        groups,
      ).map((group) => ({
        key: `${group.id}:${entry.key}`,
        keyHex: hex(encodeMetricGroupMembershipKey({
          metricGroupId: group.id,
          prefixCode: entry.row.registry.prefixCode!,
          payloadHex: entry.row.registry.payloadHex!,
        })),
        value: {
          entityId: entry.value.entityId,
          roleId: entry.value.roleId,
          confidenceScore: entry.value.confidenceScore,
          flags: entry.value.flags,
        },
        valueHex: hex(encodeMetricGroupMembershipValue({
          entityId: entry.value.entityId,
          roleId: entry.value.roleId,
          confidenceScore: entry.value.confidenceScore,
          flags: entry.value.flags,
        })),
        debug: {
          ...entry.debug,
          metricGroupId: group.id,
          metricGroupCode: group.metricGroupCode,
        },
      }));
    })
    .sort((left, right) => left.key.localeCompare(right.key));

  const currentBody = jsonl(currentEntries);
  const timelineBody = jsonl(timelineEntries);
  const metricGroupBody = jsonl(metricGroupEntries);
  const buildHash = sha256([currentBody, timelineBody, metricGroupBody].join("\n---mqchain-index---\n"));
  const dictionaryVersion = await recordDictionaryVersion(null, "kv_compile");
  const buildDir = path.join(outDir, buildHash);
  const currentPath = path.join(buildDir, "address-label-current.jsonl");
  const timelinePath = path.join(buildDir, "address-label-timeline.jsonl");
  const metricGroupsPath = path.join(buildDir, "metric-group-membership.jsonl");
  const manifestPath = path.join(buildDir, "manifest.json");
  const totalKeys = currentEntries.length + timelineEntries.length + metricGroupEntries.length;
  const manifest = {
    buildHash,
    dictionaryVersion,
    rowCount: totalKeys,
    generatedAt: new Date().toISOString(),
    source: "postgres:mq_address_registry",
    artifactType: "jsonl-kv-preview",
    schemas: MQ_KV_SCHEMA,
    indexes: {
      addressLabelCurrent: {
        indexName: "address_label_current",
        path: currentPath,
        rowCount: currentEntries.length,
        hash: sha256(currentBody),
      },
      addressLabelTimeline: {
        indexName: "address_label_timeline",
        path: timelinePath,
        rowCount: timelineEntries.length,
        hash: sha256(timelineBody),
      },
      metricGroupMembership: {
        indexName: "metric_group_membership",
        path: metricGroupsPath,
        rowCount: metricGroupEntries.length,
        hash: sha256(metricGroupBody),
      },
    },
    note: "RocksDB compilation should consume this deterministic JSONL or replace it with a binary writer.",
  };

  await mkdir(buildDir, { recursive: true });
  await writeFile(currentPath, currentBody, "utf8");
  await writeFile(timelinePath, timelineBody, "utf8");
  await writeFile(metricGroupsPath, metricGroupBody, "utf8");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  const [build] = await db
    .insert(mqKvBuilds)
    .values({
      buildHash,
      dictionaryVersion,
      status: "compiled",
      rowCount: totalKeys,
      storageUri: buildDir,
      manifest,
    })
    .onConflictDoUpdate({
      target: mqKvBuilds.buildHash,
      set: {
        status: "compiled",
        dictionaryVersion,
        rowCount: totalKeys,
        storageUri: buildDir,
        manifest,
      },
    })
    .returning();

  const indexRecords = extractKvIndexManifestRecords(manifest, buildDir);
  for (const record of indexRecords) {
    await db
      .insert(mqKvIndexManifests)
      .values({
        buildId: build.id,
        indexName: record.indexName,
        dictionaryVersion,
        status: "compiled",
        rowCount: record.rowCount,
        storageUri: record.storageUri,
        manifestHash: record.manifestHash,
        lastCommittedBatchId: record.lastCommittedBatchId,
        metadata: record.metadata,
      })
      .onConflictDoUpdate({
        target: [mqKvIndexManifests.buildId, mqKvIndexManifests.indexName],
        set: {
          dictionaryVersion,
          status: "compiled",
          rowCount: record.rowCount,
          storageUri: record.storageUri,
          manifestHash: record.manifestHash,
          lastCommittedBatchId: record.lastCommittedBatchId,
          metadata: record.metadata,
        },
      });
  }

  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
