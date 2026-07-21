import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MQCHAIN_DICTIONARY_BUNDLE_SCHEMA } from "@/lib/mqchain/dictionary-bundle";
import { computeCanonicalDictionaryVersion, type CanonicalDictionaryRows } from "@/lib/mqchain/kv/contract";
import {
  preflightResearchCsv,
  RESEARCH_CSV_SCHEMA_VERSION,
  type ResearchDictionarySnapshot,
} from "@/lib/mqchain/research-normalization";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const emptyCanonicalRows: CanonicalDictionaryRows = {
  networks: [],
  chainAliases: [],
  namespaces: [],
  codecs: [],
  keyPrefixes: [],
  entities: [],
  protocols: [],
  categories: [],
  roles: [],
  components: [],
  nameAliases: [],
  tags: [],
  tagsets: [],
  tagsetMembers: [],
  tokenStandards: [],
  metricGroups: [],
  metricGroupRules: [],
};

/**
 * The canonical MQD-U1 version a dictionary bundle would publish for this
 * governed state. Research preflight must accept exactly this value.
 */
const canonicalDictionaryVersion = computeCanonicalDictionaryVersion({
  ...emptyCanonicalRows,
  entities: [{ id: 1, entityCode: "kraken", entityName: "Kraken", entityType: "cex", categoryId: 100, isActive: true }],
  roles: [
    {
      roleId: 1002,
      roleCode: "cex_reserve_wallet",
      roleName: "CEX reserve wallet",
      categoryId: 100,
      roleGroup: "cex",
      metricUsageDefault: "cex_flow",
      boundaryClass: "custodial",
      defaultQualityTier: 1,
      defaultFlags: 5,
      isActive: true,
    },
  ],
});

const dictionary: ResearchDictionarySnapshot = {
  dictionaryVersion: canonicalDictionaryVersion,
  entities: [{ id: 1, code: "kraken", name: "Kraken" }],
  protocols: [],
  roles: [{ id: 1002, code: "cex_reserve_wallet", name: "CEX reserve wallet" }],
  categories: [],
  components: [{ id: 20, code: "reserve_vault", name: "Reserve vault" }],
  tags: [],
  networkProfiles: [
    {
      networkId: 2,
      networkCode: "eth",
      networkName: "Ethereum",
      aliases: ["ERC20"],
      namespaceId: 3,
      prefixCode: 1,
      addressCodecId: 1,
      codecCode: "evm20_hex",
      identifierKind: "wallet_address",
    },
  ],
};

const address = "0x52908400098527886E0F7030069857D2E4169EE7";

function csvWithDictionaryVersion(dictionaryVersion: string) {
  return [
    "schema_version,dictionary_version,address,chain,identifier_kind,entity,role,component,source_url,source_sheet,source_row",
    [
      RESEARCH_CSV_SCHEMA_VERSION,
      dictionaryVersion,
      address,
      "Ethereum",
      "wallet_address",
      "kraken",
      "cex_reserve_wallet",
      "reserve_vault",
      "https://kraken.com/por",
      "ETH",
      "7",
    ].join(","),
  ].join("\n");
}

describe("dictionary bundle contract", () => {
  const bundle = read("src/lib/mqchain/dictionary-bundle.ts");

  it("publishes dictionaryVersion and bundleHash as separate manifest fields", () => {
    expect(bundle).toContain("dictionaryVersion,");
    expect(bundle).toContain("bundleHash,");
    expect(bundle).toContain("MQCHAIN_KV_CONTRACT_SCHEMA_VERSIONS");
    expect(bundle).toContain(MQCHAIN_DICTIONARY_BUNDLE_SCHEMA);
  });

  it("sources dictionaryVersion from the canonical snapshot, not from the packaging hash", () => {
    expect(bundle).toContain("const dictionaryVersion = snapshot.dictionaryVersion;");
    // The packaging hash covers the exported file list, hashes and row counts.
    expect(bundle).toContain("const bundleHash = sha256(");
    expect(bundle).toContain("files: files.map(file => ({ name: file.name, contentHash: file.contentHash, rowCount: file.rowCount })),");
  });

  it("derives a bundleHash that changes when exported content changes", () => {
    // Mirrors the bundle's packaging-hash inputs.
    const bundleHash = (files: Array<{ name: string; contentHash: string; rowCount: number }>) =>
      createHash("sha256")
        .update(
          JSON.stringify({
            schema: MQCHAIN_DICTIONARY_BUNDLE_SCHEMA,
            dictionaryVersion: canonicalDictionaryVersion,
            catalogVersion: "catalog-1",
            files,
          }),
        )
        .digest("hex");

    const base = bundleHash([{ name: "entities.csv", contentHash: "a", rowCount: 1 }]);

    expect(bundleHash([{ name: "entities.csv", contentHash: "a", rowCount: 1 }])).toBe(base);
    expect(bundleHash([{ name: "entities.csv", contentHash: "b", rowCount: 1 }])).not.toBe(base);
    expect(bundleHash([{ name: "entities.csv", contentHash: "a", rowCount: 2 }])).not.toBe(base);
    expect(
      bundleHash([
        { name: "entities.csv", contentHash: "a", rowCount: 1 },
        { name: "roles.csv", contentHash: "c", rowCount: 3 },
      ]),
    ).not.toBe(base);
    // The packaging hash is not the governed dictionary version.
    expect(base).not.toBe(canonicalDictionaryVersion);
  });

  it("accepts a CSV built from manifest.dictionaryVersion during preflight", () => {
    const report = preflightResearchCsv({
      csvText: csvWithDictionaryVersion(canonicalDictionaryVersion),
      dictionary,
    });

    expect(report.dictionaryVersion).toBe(canonicalDictionaryVersion);
    expect(report.suppliedDictionaryVersion).toBe(canonicalDictionaryVersion);
    expect(report.dictionaryVersionMatches).toBe(true);
    expect(report.blockers).not.toContain("dictionary_version_mismatch");
    expect(report.records[0].status).toBe("resolved");
    expect(report.canCreateSourceJob).toBe(true);
  });

  it("rejects a CSV that used the bundle packaging hash as the dictionary version", () => {
    const report = preflightResearchCsv({
      csvText: csvWithDictionaryVersion("f".repeat(64)),
      dictionary,
    });

    expect(report.dictionaryVersionMatches).toBe(false);
    expect(report.blockers).toContain("dictionary_version_mismatch");
    expect(report.canCreateSourceJob).toBe(false);
  });
});

describe("U1 identity and component/category propagation", () => {
  it("carries the U1 key and resolved IDs out of preflight", () => {
    const report = preflightResearchCsv({
      csvText: csvWithDictionaryVersion(canonicalDictionaryVersion),
      dictionary,
    });
    const record = report.records[0];

    expect(record.namespaceId).toBe(3);
    expect(record.addressCodecId).toBe(1);
    expect(record.payloadHex).toBe("52908400098527886e0f7030069857d2e4169ee7");
    expect(record.prefixCode).toBe(1);
    expect(record.entityId).toBe(1);
    expect(record.roleId).toBe(1002);
    expect(record.componentId).toBe(20);
  });

  it("hands preflight component and category resolution to candidate creation", () => {
    const intake = read("src/lib/mqchain/services/research-intake-service.ts");
    expect(intake).toContain("componentId: record.componentId");
    expect(intake).toContain("categoryId: record.categoryId");

    const candidateService = read("src/lib/mqchain/services/candidate-service.ts");
    expect(candidateService).toContain("suggestedComponentId");
    expect(candidateService).toContain("namespaceId: normalized.namespaceId");
    expect(candidateService).toContain("addressCodecId: normalized.addressCodecId");
    expect(candidateService).toContain("payloadHex: normalized.payloadHex");
  });

  it("persists the U1 key, component and category on registry commit", () => {
    const batchService = read("src/lib/mqchain/services/batch-service.ts");
    const commit = batchService.slice(batchService.indexOf("export async function commitBatch"));

    expect(commit).toContain("namespaceId: candidate.namespaceId");
    expect(commit).toContain("addressCodecId: candidate.addressCodecId");
    expect(commit).toContain("payloadHex: candidate.payloadHex");
    expect(commit).toContain("prefixCode: candidate.prefixCode");
    expect(commit).toContain("componentId: optionalNumber(draft.componentId) ?? candidate.suggestedComponentId");
    // Category precedence: approved override, then approved role category.
    expect(commit).toContain("categoryId: optionalNumber(draft.categoryId) ?? role?.categoryId ?? null");
  });

  it("fails closed instead of reconstructing an unknown U1 key during commit", () => {
    const batchService = read("src/lib/mqchain/services/batch-service.ts");
    const commit = batchService.slice(batchService.indexOf("export async function commitBatch"));

    expect(commit).toContain("validateU1AddressKey(candidate, { namespace: namespace ?? null, codec: codec ?? null })");
    expect(commit).toContain("invalid or incomplete U1 address key");
  });

  it("leaves an unassigned component and tagset as null so the KV value encodes zero", () => {
    const contract = read("src/lib/mqchain/kv/contract.ts");
    expect(contract).toContain("NULL_DICTIONARY_ID = 0");
    expect(contract).toContain("componentId:");
    expect(contract).toContain("zero when no component is assigned");
    expect(contract).toContain("zero while no governed tagset is assigned");
  });
});

describe("batch lifecycle gate", () => {
  const batchService = read("src/lib/mqchain/services/batch-service.ts");

  it("only commits an approved batch", () => {
    const commit = batchService.slice(batchService.indexOf("export async function commitBatch"));

    expect(commit).toContain('batch.status !== "approved"');
    expect(commit).toContain("Only approved batches can be committed");
    // A pending_approval batch must no longer be accepted.
    expect(commit).not.toContain('["approved", "pending_approval"].includes(batch.status)');
  });

  it("keeps batch approval and batch commit as two separate audited decisions", () => {
    expect(batchService).toContain('action: "batch_approved"');
    expect(batchService).toContain('action: "batch_committed"');
    expect(batchService).toContain('action: "kv_build_manifest_created"');
  });

  it("builds the pending KV handoff from immutable content only", () => {
    const commit = batchService.slice(batchService.indexOf("export async function commitBatch"));

    expect(commit).toContain("computeRegistrySnapshotHash(committedRegistryRows)");
    expect(commit).toContain("computePendingKvBuildHash(pendingKvManifest)");
    expect(commit).toContain("expectedCounts:");
    // No timestamp may participate in the deterministic build hash.
    expect(commit).not.toContain("hashJson({ ...pendingKvManifest, createdAt");
  });
});
