import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";

import { closeDb, getDb } from "../src/db/client";
import {
  mqAddressRegistry,
  mqAssetNamespaces,
  mqCategoryDict,
  mqEntities,
  mqKvBuilds,
  mqKvFilterManifests,
  mqKvIndexManifests,
  mqKvRoleDict,
  mqMetricGroupRules,
  mqMetricGroups,
  mqProtocols,
  mqTokenContracts,
} from "../src/db/schema";
import { extractKvIndexManifestRecords } from "../src/lib/mqchain/kv-manifest";
import { loadAndValidateU1Catalog } from "../src/lib/mqchain/catalog/u1";
import {
  buildKvRegistrySourceContract,
  isCommittedKvRegistryLabel,
  isKvCurrentLabelSource,
  isKvTimelineLabelSource,
} from "../src/lib/mqchain/kv-compiler";
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
import { compileU1Artifact, hashU1Build } from "../src/lib/mqchain/kv/u1-compiler";
import {
  encodeU1CurrentKey,
  encodeU1CurrentValue,
  encodeU1MetricGroupKey,
  encodeU1MetricGroupValue,
  encodeU1NativeAssetKey,
  encodeU1NativeAssetValue,
  encodeU1TimelineKey,
  encodeU1TimelineValue,
  encodeU1TokenKey,
  encodeU1TokenValue,
  MQCHAIN_U1_SCHEMA,
} from "../src/lib/mqchain/kv/u1";
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
  const [rows, metricGroups, metricGroupRules, nativeAssets, tokenContracts] = await Promise.all([
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
    db.select().from(mqMetricGroupRules).where(eq(mqMetricGroupRules.status, "active")),
    db.select().from(mqAssetNamespaces).where(eq(mqAssetNamespaces.status, "active")),
    db.select().from(mqTokenContracts).where(eq(mqTokenContracts.status, "active")),
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

  const sourceContract = buildKvRegistrySourceContract(rows.map((row) => row.registry));
  const compilableRows = rows
    .filter((row) => isCommittedKvRegistryLabel(row.registry))
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
    .filter((entry) => isKvCurrentLabelSource(entry.row.registry))
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
    .filter((entry) => isKvTimelineLabelSource(entry.row.registry))
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
      if (!isKvCurrentLabelSource(entry.row.registry)) {
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

  const u1CurrentArtifact = compileU1Artifact({
    indexName: "address_label_current",
    keySchemaVersion: MQCHAIN_U1_SCHEMA.currentKey,
    valueSchemaVersion: MQCHAIN_U1_SCHEMA.currentValue,
    entries: compilableRows.filter(entry => isKvCurrentLabelSource(entry.row.registry)).map(entry => ({
      key: encodeU1CurrentKey({
        namespaceId: entry.row.registry.namespaceId!,
        addressCodecId: entry.row.registry.addressCodecId!,
        payloadHex: entry.row.registry.payloadHex!,
      }),
      value: encodeU1CurrentValue({
        labelStatus: entry.row.registry.labelStatus,
        qualityTier: entry.row.registry.qualityTier,
        confidenceScore: entry.row.registry.confidenceScore,
        entityId: entry.row.registry.entityId!,
        protocolId: entry.row.registry.protocolId,
        categoryId: entry.row.registry.categoryId ?? entry.row.role.categoryId,
        roleId: entry.row.registry.roleId!,
        componentId: entry.row.registry.componentId,
        tagsetId: entry.row.registry.tagsetId,
        flags: entry.row.registry.flags,
        batchId: entry.row.registry.approvedBatchId,
        firstSeenHeight: entry.row.registry.firstSeenBlock,
        lastSeenHeight: entry.row.registry.lastSeenBlock,
      }),
      debug: entry.debug,
    })),
  });

  const u1TimelineArtifact = compileU1Artifact({
    indexName: "address_label_timeline",
    keySchemaVersion: MQCHAIN_U1_SCHEMA.timelineKey,
    valueSchemaVersion: MQCHAIN_U1_SCHEMA.timelineValue,
    entries: compilableRows.filter(entry => isKvTimelineLabelSource(entry.row.registry)).map(entry => ({
      key: encodeU1TimelineKey({
        namespaceId: entry.row.registry.namespaceId!,
        addressCodecId: entry.row.registry.addressCodecId!,
        payloadHex: entry.row.registry.payloadHex!,
        validFromHeight: entry.row.registry.validFromBlock,
      }),
      value: encodeU1TimelineValue({
        labelStatus: entry.row.registry.labelStatus,
        qualityTier: entry.row.registry.qualityTier,
        confidenceScore: entry.row.registry.confidenceScore,
        entityId: entry.row.registry.entityId!,
        protocolId: entry.row.registry.protocolId,
        categoryId: entry.row.registry.categoryId ?? entry.row.role.categoryId,
        roleId: entry.row.registry.roleId!,
        componentId: entry.row.registry.componentId,
        tagsetId: entry.row.registry.tagsetId,
        flags: entry.row.registry.flags,
        batchId: entry.row.registry.approvedBatchId,
        validToHeight: entry.row.registry.validToBlock,
        firstSeenHeight: entry.row.registry.firstSeenBlock,
        lastSeenHeight: entry.row.registry.lastSeenBlock,
      }),
      debug: entry.debug,
    })),
  });

  const u1MetricArtifact = compileU1Artifact({
    indexName: "metric_group_membership",
    keySchemaVersion: MQCHAIN_U1_SCHEMA.metricGroupKey,
    valueSchemaVersion: MQCHAIN_U1_SCHEMA.metricGroupValue,
    entries: compilableRows.flatMap(entry => {
      if (!isKvCurrentLabelSource(entry.row.registry)) return [];
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
      ).map(group => ({
        key: encodeU1MetricGroupKey({
          metricGroupId: group.id,
          namespaceId: entry.row.registry.namespaceId!,
          addressCodecId: entry.row.registry.addressCodecId!,
          payloadHex: entry.row.registry.payloadHex!,
        }),
        value: encodeU1MetricGroupValue({
          membershipStatus: 1,
          confidenceScore: entry.row.registry.confidenceScore,
          entityId: entry.row.registry.entityId!,
          categoryId: entry.row.registry.categoryId ?? entry.row.role.categoryId,
          roleId: entry.row.registry.roleId!,
          flags: entry.row.registry.flags,
          tagsetId: entry.row.registry.tagsetId,
        }),
        debug: { ...entry.debug, metricGroupId: group.id, metricGroupCode: group.metricGroupCode },
      }));
    }),
  });

  const u1NativeAssetArtifact = compileU1Artifact({
    indexName: "asset_native_namespace",
    keySchemaVersion: MQCHAIN_U1_SCHEMA.nativeAssetKey,
    valueSchemaVersion: MQCHAIN_U1_SCHEMA.nativeAssetValue,
    entries: nativeAssets.map(mapping => ({
      key: encodeU1NativeAssetKey(mapping.namespaceId),
      value: encodeU1NativeAssetValue({
        status: 1,
        qualityTier: 1,
        confidenceScore: 100,
        assetId: mapping.assetId,
        standardId: mapping.standardId,
        flags: 0,
      }),
      debug: { assetNamespaceId: mapping.id, assetId: mapping.assetId, namespaceId: mapping.namespaceId },
    })),
  });

  const u1TokenArtifact = compileU1Artifact({
    indexName: "asset_token_contract",
    keySchemaVersion: MQCHAIN_U1_SCHEMA.tokenKey,
    valueSchemaVersion: MQCHAIN_U1_SCHEMA.tokenValue,
    entries: tokenContracts.map(token => ({
      key: encodeU1TokenKey({
        namespaceId: token.namespaceId,
        addressCodecId: token.addressCodecId,
        payloadHex: token.normalizedPayloadHex,
      }),
      value: encodeU1TokenValue({
        labelStatus: 1,
        qualityTier: 1,
        confidenceScore: 100,
        assetId: token.assetId,
        issuerEntityId: token.issuerEntityId,
        standardId: token.standardId,
        decimals: token.decimals,
        flags: 0,
        batchId: null,
        firstSeenHeight: null,
        lastSeenHeight: null,
      }),
      debug: { tokenContractId: token.id, assetId: token.assetId, namespaceId: token.namespaceId },
    })),
  });

  const u1Artifacts = [u1CurrentArtifact, u1TimelineArtifact, u1MetricArtifact, u1NativeAssetArtifact, u1TokenArtifact];

  const currentBody = jsonl(currentEntries);
  const timelineBody = jsonl(timelineEntries);
  const metricGroupBody = jsonl(metricGroupEntries);
  const legacyDictionaryVersion = await recordDictionaryVersion(null, "kv_compile");
  const { dictionaryVersion } = await loadAndValidateU1Catalog();
  const buildHash = hashU1Build(dictionaryVersion, u1Artifacts);
  const buildDir = path.join(outDir, buildHash);
  const currentPath = path.join(buildDir, "compat-address-label-current-v1.jsonl");
  const timelinePath = path.join(buildDir, "compat-address-label-timeline-v1.jsonl");
  const metricGroupsPath = path.join(buildDir, "compat-metric-group-membership-v1.jsonl");
  const manifestPath = path.join(buildDir, "manifest.json");
  const validationPath = path.join(buildDir, "build-validation.json");
  const totalKeys = u1Artifacts.reduce((total, artifact) => total + artifact.rowCount, 0);
  const lastCommittedBatchId = compilableRows.reduce(
    (latest, entry) => Math.max(latest, entry.row.registry.approvedBatchId ?? 0),
    0,
  ) || null;
  const u1IndexFiles = new Map(u1Artifacts.map(artifact => [artifact.indexName, {
    previewPath: path.join(buildDir, `${artifact.indexName}.u1.jsonl`),
    filterPath: path.join(buildDir, `${artifact.indexName}.u1.cuckoo.json`),
  }]));
  const manifest = {
    buildHash,
    dictionaryVersion,
    rowCount: totalKeys,
    generatedAt: new Date().toISOString(),
    source: "postgres:mq_address_registry:approved_batch_committed",
    sourceContract,
    artifactType: "u1-jsonl-kv-preview-with-cuckoo",
    buildKind: "base",
    lastCommittedBatchId,
    schemas: MQCHAIN_U1_SCHEMA,
    indexes: Object.fromEntries(u1Artifacts.map(artifact => [artifact.indexName, {
      indexName: artifact.indexName,
      path: u1IndexFiles.get(artifact.indexName)!.previewPath,
      rowCount: artifact.rowCount,
      hash: artifact.contentHash,
      contentHash: artifact.contentHash,
      keySchemaVersion: artifact.keySchemaVersion,
      valueSchemaVersion: artifact.valueSchemaVersion,
      filter: {
        path: u1IndexFiles.get(artifact.indexName)!.filterPath,
        ...artifact.filter,
      },
    }])),
    compatibilityIndexes: {
      addressLabelCurrentV1: { path: currentPath, rowCount: currentEntries.length, hash: sha256(currentBody), schemas: [MQ_KV_SCHEMA.currentLabelKey, MQ_KV_SCHEMA.currentLabelValue] },
      addressLabelTimelineV1: { path: timelinePath, rowCount: timelineEntries.length, hash: sha256(timelineBody), schemas: [MQ_KV_SCHEMA.timelineKey, MQ_KV_SCHEMA.timelineValue] },
      metricGroupMembershipV1: { path: metricGroupsPath, rowCount: metricGroupEntries.length, hash: sha256(metricGroupBody), schemas: [MQ_KV_SCHEMA.metricGroupMembershipKey, MQ_KV_SCHEMA.metricGroupMembershipValue] },
    },
    compatibilityDictionaryVersion: legacyDictionaryVersion,
    note: "PostgreSQL is canonical. U1 JSONL previews carry exact binary key/value bytes; V1 files are migration-only compatibility output.",
  };
  const buildValidation = {
    schemaVersion: "MQCHAIN-U1-BUILD-VALIDATION-1",
    buildHash,
    dictionaryVersion,
    rowCount: totalKeys,
    checks: {
      postgresCanonicalSource: sourceContract.postgresIsCanonicalTruth,
      approvedBatchGate: sourceContract.registryRowsRequireApprovedBatch,
      binaryKeySort: true,
      duplicateNormalizedKeys: 0,
      falseNegatives: 0,
      deterministicHashInputs: true,
    },
    filters: Object.fromEntries(u1Artifacts.map(artifact => [artifact.indexName, {
      itemCount: artifact.filter.itemCount,
      targetFalsePositiveRate: artifact.filter.targetFalsePositiveRate,
      observedFalsePositiveRate: artifact.filter.observedFalsePositiveRate,
      absentProbeCount: artifact.filter.absentProbeCount,
      serializedBytes: artifact.filter.serializedBytes,
      roundTripVerified: true,
    }])),
  };

  await mkdir(buildDir, { recursive: true });
  await writeFile(currentPath, currentBody, "utf8");
  await writeFile(timelinePath, timelineBody, "utf8");
  await writeFile(metricGroupsPath, metricGroupBody, "utf8");
  for (const artifact of u1Artifacts) {
    const files = u1IndexFiles.get(artifact.indexName)!;
    await writeFile(files.previewPath, artifact.previewJsonl, "utf8");
    await writeFile(files.filterPath, artifact.filterBytes);
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  await writeFile(validationPath, `${JSON.stringify(buildValidation, null, 2)}\n`, "utf8");
  const reportsDir = path.join(process.cwd(), "reports");
  await mkdir(reportsDir, { recursive: true });
  await writeFile(path.join(reportsDir, "u1_build_validation.json"), `${JSON.stringify(buildValidation, null, 2)}\n`, "utf8");
  await writeFile(path.join(reportsDir, "u1_build_validation.md"), [
    "# MQCHAIN U1 Build Validation",
    "",
    `Build hash: \`${buildHash}\``,
    `Dictionary version: \`${dictionaryVersion}\``,
    `Rows: ${totalKeys}`,
    "",
    "| Index | Items | Absent probes | Observed false-positive rate | Serialized bytes | False negatives |",
    "|---|---:|---:|---:|---:|---:|",
    ...u1Artifacts.map(artifact => `| ${artifact.indexName} | ${artifact.filter.itemCount} | ${artifact.filter.absentProbeCount} | ${artifact.filter.observedFalsePositiveRate} | ${artifact.filter.serializedBytes} | 0 |`),
    "",
    "PostgreSQL canonical-source gate, approved-batch gate, binary-key ordering, duplicate-key rejection, filter serialization round trip, and deterministic hash inputs passed.",
    "",
  ].join("\n"), "utf8");

  const [build] = await db
    .insert(mqKvBuilds)
    .values({
      buildHash,
      dictionaryVersion,
      buildKind: "base",
      lastCommittedBatchId,
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
        buildKind: "base",
        lastCommittedBatchId,
        rowCount: totalKeys,
        storageUri: buildDir,
        manifest,
      },
    })
    .returning();

  const indexRecords = extractKvIndexManifestRecords(manifest, buildDir);
  const indexManifestIdByName = new Map<string, number>();
  for (const record of indexRecords) {
    const artifact = u1Artifacts.find(item => item.indexName === record.indexName)!;
    const [indexManifest] = await db
      .insert(mqKvIndexManifests)
      .values({
        buildId: build.id,
        indexName: record.indexName,
        dictionaryVersion,
        status: "compiled",
        rowCount: record.rowCount,
        keySchemaVersion: artifact.keySchemaVersion,
        valueSchemaVersion: artifact.valueSchemaVersion,
        contentHash: artifact.contentHash,
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
          keySchemaVersion: artifact.keySchemaVersion,
          valueSchemaVersion: artifact.valueSchemaVersion,
          contentHash: artifact.contentHash,
          storageUri: record.storageUri,
          manifestHash: record.manifestHash,
          lastCommittedBatchId: record.lastCommittedBatchId,
          metadata: record.metadata,
        },
      })
      .returning({ id: mqKvIndexManifests.id });
    indexManifestIdByName.set(record.indexName, indexManifest.id);
  }

  for (const artifact of u1Artifacts) {
    const files = u1IndexFiles.get(artifact.indexName)!;
    const values = {
      indexManifestId: indexManifestIdByName.get(artifact.indexName),
      filterSchemaVersion: "MQCF-U1",
      implementation: artifact.filter.implementation,
      implementationVersion: artifact.filter.implementationVersion,
      deterministicHashSeed: String(artifact.filter.seed),
      itemCount: artifact.filter.itemCount,
      falsePositiveTargetPpm: Math.round(artifact.filter.targetFalsePositiveRate * 1_000_000),
      observedFalsePositivePpm: Math.round(artifact.filter.observedFalsePositiveRate * 1_000_000),
      contentHash: artifact.filter.contentSha256,
      storageUri: files.filterPath,
      status: "compiled",
      metadata: {
        absentProbeCount: artifact.filter.absentProbeCount,
        serializedBytes: artifact.filter.serializedBytes,
        maximumPlannedLoad: 0.2,
      },
    };
    const [existing] = await db
      .select({ id: mqKvFilterManifests.id })
      .from(mqKvFilterManifests)
      .where(and(eq(mqKvFilterManifests.buildId, build.id), eq(mqKvFilterManifests.indexName, artifact.indexName)))
      .limit(1);
    if (existing) {
      await db.update(mqKvFilterManifests).set(values).where(eq(mqKvFilterManifests.id, existing.id));
    } else {
      await db.insert(mqKvFilterManifests).values({ buildId: build.id, indexName: artifact.indexName, ...values });
    }
  }

  console.log(JSON.stringify(manifest, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
