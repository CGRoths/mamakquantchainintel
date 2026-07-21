import { describe, expect, it } from "vitest";

import {
  buildCanonicalDictionarySnapshot,
  CANONICAL_DICTIONARY_FAMILIES,
  computeCanonicalDictionaryVersion,
  computeRegistrySnapshotHash,
  MAX_STABLE_DICTIONARY_ID,
  MIN_STABLE_DICTIONARY_ID,
  MQCHAIN_DICTIONARY_SCHEMA_VERSION,
  MQCHAIN_KEY_SCHEMA_VERSION,
  MQCHAIN_METRIC_SCHEMA_VERSION,
  MQCHAIN_TIMELINE_SCHEMA_VERSION,
  MQCHAIN_VALUE_SCHEMA_VERSION,
  NULL_DICTIONARY_ID,
  REQUIRED_KV_INDEXES,
  validateU1AddressKey,
  type CanonicalDictionaryRows,
  type RegistrySnapshotRow,
} from "@/lib/mqchain/kv/contract";

function canonicalRows(overrides: Partial<CanonicalDictionaryRows> = {}): CanonicalDictionaryRows {
  return {
    networks: [
      {
        id: 1,
        networkCode: "ethereum",
        networkName: "Ethereum",
        chainFamily: "evm",
        environment: "mainnet",
        caip2: "eip155:1",
        evmChainId: 1,
        slip44: 60,
        isActive: true,
      },
    ],
    chainAliases: [
      {
        id: 1,
        sourceScope: "kraken_por",
        rawChainName: "ETH",
        chainNetworkId: 1,
        namespaceId: 1,
        addressCodecId: 1,
        addressType: "wallet_address",
        assetHint: null,
        tokenStandardHint: null,
        status: "approved",
      },
    ],
    namespaces: [
      {
        id: 1,
        namespaceCode: "ethereum_wallet",
        namespaceName: "Ethereum wallet",
        chainNetworkId: 1,
        addressCodecId: 1,
        addressType: "wallet_address",
        legacyPrefixCode: 10,
        addressHrp: null,
        networkDiscriminator: null,
        isActive: true,
      },
    ],
    codecs: [
      {
        id: 1,
        codecCode: "evm20",
        codecName: "EVM 20-byte",
        addressFamily: "evm",
        identifierKind: "wallet_address",
        acceptedFormats: "hex",
        canonicalFormat: "lowercase_hex",
        payloadRule: "exact:20",
        checksumBehavior: "eip55_optional",
        chainFamilyCompatibility: "evm",
        normalizerVersion: "v1",
        status: "production_ready",
      },
    ],
    keyPrefixes: [
      {
        prefixCode: 10,
        chainCode: "ethereum",
        chainName: "Ethereum",
        chainFamily: "evm",
        addressFamily: "evm",
        codec: "evm20",
        payloadLen: 20,
        evmChainId: 1,
        isActive: true,
      },
    ],
    entities: [{ id: 1, entityCode: "kraken", entityName: "Kraken", entityType: "cex", categoryId: 100, isActive: true }],
    protocols: [
      { id: 1, entityId: 1, protocolCode: "kraken_custody", protocolName: "Kraken Custody", protocolType: "custody", chainScope: ["ethereum"], isActive: true },
    ],
    categories: [
      { categoryId: 100, categoryCode: "cex", categoryName: "Centralized exchange", parentCategoryId: null, domainCode: "exchange", metricDomain: "flows", isActive: true },
    ],
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
    components: [
      {
        id: 1,
        protocolId: 1,
        deploymentId: null,
        componentCode: "kraken_reserve_vault",
        componentName: "Kraken reserve vault",
        componentType: "contract",
        namespaceId: 1,
        addressCodecId: 1,
        normalizedPayloadHex: "aa".repeat(20),
        roleId: 1002,
        categoryId: 100,
        confidenceScore: 90,
        qualityTier: 1,
        validFromHeight: null,
        isActive: true,
      },
    ],
    nameAliases: [
      { id: 1, subjectKind: "entity", subjectId: 1, alias: "Kraken Exchange", normalizedAlias: "kraken-exchange", languageCode: null, isActive: true },
    ],
    tags: [{ id: 1, tagCode: "proof_of_reserve", tagName: "Proof of reserve", tagGroup: "evidence", isActive: true }],
    tagsets: [{ id: 1, tagsetCode: "por_only", contentHash: "tagset-hash", isActive: true }],
    tagsetMembers: [{ tagsetId: 1, tagId: 1 }],
    tokenStandards: [{ id: 1, standardCode: "erc20", standardName: "ERC-20", chainFamily: "evm", isActive: true }],
    metricGroups: [
      { id: 1, metricGroupCode: "eth_cex_flow", metricGroupName: "ETH CEX flow", chainCode: "ethereum", namespaceId: 1, minConfidence: 70, requireMetricEligible: true, isActive: true },
    ],
    metricGroupRules: [
      { id: 1, metricGroupId: 1, ruleVersion: 1, ruleJson: { includeRoles: ["cex_reserve_wallet"] }, status: "active", contentHash: "rule-hash" },
    ],
    ...overrides,
  };
}

describe("MQCHAIN U1 KV contract", () => {
  it("freezes the schema-version identifiers and stable-ID range", () => {
    expect(MQCHAIN_DICTIONARY_SCHEMA_VERSION).toBe("MQD-U1");
    expect(MQCHAIN_KEY_SCHEMA_VERSION).toBe("MQK-U1");
    expect(MQCHAIN_VALUE_SCHEMA_VERSION).toBe("MQV-U1");
    expect(MQCHAIN_TIMELINE_SCHEMA_VERSION).toBe("MQT-U1");
    expect(MQCHAIN_METRIC_SCHEMA_VERSION).toBe("MQG-U1");
    expect(NULL_DICTIONARY_ID).toBe(0);
    expect(MIN_STABLE_DICTIONARY_ID).toBe(1);
    expect(MAX_STABLE_DICTIONARY_ID).toBe(2147483647);
  });

  it("defines the required production serving indexes exactly once", () => {
    expect(REQUIRED_KV_INDEXES.map((index) => index.indexName)).toEqual([
      "address_label_current",
      "address_label_timeline",
      "metric_group_membership",
    ]);
  });

  it("emits a snapshot carrying the frozen versions and a per-family content hash", () => {
    const snapshot = buildCanonicalDictionarySnapshot(canonicalRows());

    expect(snapshot.dictionarySchemaVersion).toBe("MQD-U1");
    expect(snapshot.keySchemaVersion).toBe("MQK-U1");
    expect(snapshot.valueSchemaVersion).toBe("MQV-U1");
    expect(snapshot.timelineSchemaVersion).toBe("MQT-U1");
    expect(snapshot.metricSchemaVersion).toBe("MQG-U1");
    expect(Object.keys(snapshot.components).sort()).toEqual([...CANONICAL_DICTIONARY_FAMILIES].sort());
    for (const family of CANONICAL_DICTIONARY_FAMILIES) {
      expect(snapshot.components[family].contentHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(snapshot.versionHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic regardless of query row order", () => {
    const rows = canonicalRows({
      entities: [
        { id: 2, entityCode: "binance", entityName: "Binance", entityType: "cex", categoryId: 100, isActive: true },
        { id: 1, entityCode: "kraken", entityName: "Kraken", entityType: "cex", categoryId: 100, isActive: true },
      ],
    });
    const reversed = canonicalRows({ entities: [...rows.entities].reverse() });

    expect(computeCanonicalDictionaryVersion(rows)).toBe(computeCanonicalDictionaryVersion(reversed));
  });

  it("ignores generated timestamps because they are never selected into the snapshot", () => {
    const withTimestamps = canonicalRows() as CanonicalDictionaryRows & Record<string, unknown>;
    // Simulate a row carrying mutable presentation timestamps.
    withTimestamps.entities = [
      { ...canonicalRows().entities[0], createdAt: new Date(), updatedAt: new Date() } as never,
    ];

    expect(computeCanonicalDictionaryVersion(withTimestamps)).toBe(computeCanonicalDictionaryVersion(canonicalRows()));
  });

  it("changes when any governed family changes semantically", () => {
    const base = computeCanonicalDictionaryVersion(canonicalRows());

    const roleChange = canonicalRows();
    roleChange.roles[0].defaultFlags = 7;
    expect(computeCanonicalDictionaryVersion(roleChange)).not.toBe(base);

    const aliasActivation = canonicalRows();
    aliasActivation.nameAliases[0].isActive = false;
    expect(computeCanonicalDictionaryVersion(aliasActivation)).not.toBe(base);

    const componentActivation = canonicalRows();
    componentActivation.components[0].isActive = false;
    expect(computeCanonicalDictionaryVersion(componentActivation)).not.toBe(base);

    const metricRuleChange = canonicalRows();
    metricRuleChange.metricGroupRules[0].ruleJson = { includeRoles: ["cex_hot_wallet"] };
    expect(computeCanonicalDictionaryVersion(metricRuleChange)).not.toBe(base);

    const codecChange = canonicalRows();
    codecChange.codecs[0].normalizerVersion = "v2";
    expect(computeCanonicalDictionaryVersion(codecChange)).not.toBe(base);

    const namespaceChange = canonicalRows();
    namespaceChange.namespaces[0].legacyPrefixCode = 11;
    expect(computeCanonicalDictionaryVersion(namespaceChange)).not.toBe(base);

    const tagsetChange = canonicalRows();
    tagsetChange.tagsetMembers = [];
    expect(computeCanonicalDictionaryVersion(tagsetChange)).not.toBe(base);

    const tokenStandardChange = canonicalRows();
    tokenStandardChange.tokenStandards[0].isActive = false;
    expect(computeCanonicalDictionaryVersion(tokenStandardChange)).not.toBe(base);

    const chainAliasChange = canonicalRows();
    chainAliasChange.chainAliases[0].status = "pending_mapping";
    expect(computeCanonicalDictionaryVersion(chainAliasChange)).not.toBe(base);
  });

  it("keeps inactive and retired records inside the snapshot so historical KV values stay decodable", () => {
    const retired = canonicalRows();
    retired.roles[0].isActive = false;
    retired.entities[0].isActive = false;

    const snapshot = buildCanonicalDictionarySnapshot(retired);

    // Row counts are unchanged: retirement does not remove a row from the snapshot.
    expect(snapshot.components.roles.rowCount).toBe(1);
    expect(snapshot.components.entities.rowCount).toBe(1);
    // But the version does change, because active status is a governed field.
    expect(snapshot.versionHash).not.toBe(computeCanonicalDictionaryVersion(canonicalRows()));
  });
});

describe("U1 address key validation", () => {
  const validKey = { namespaceId: 1, addressCodecId: 1, payloadHex: "aa".repeat(20) };
  const namespace = { id: 1, addressCodecId: 1, isActive: true };
  const codec = { id: 1, payloadRule: "exact:20", status: "production_ready" };

  it("accepts a complete, internally consistent U1 key", () => {
    expect(validateU1AddressKey(validKey, { namespace, codec })).toEqual([]);
  });

  it("reports each missing component of the identity", () => {
    expect(validateU1AddressKey({ namespaceId: null, addressCodecId: 1, payloadHex: "aa" })).toContain("missing_namespace_id");
    expect(validateU1AddressKey({ namespaceId: 1, addressCodecId: null, payloadHex: "aa" })).toContain("missing_address_codec_id");
    expect(validateU1AddressKey({ namespaceId: 1, addressCodecId: 1, payloadHex: null })).toContain("missing_payload_hex");
  });

  it("rejects malformed payload hex", () => {
    expect(validateU1AddressKey({ ...validKey, payloadHex: "ZZ" })).toContain("invalid_payload_hex");
    expect(validateU1AddressKey({ ...validKey, payloadHex: "abc" })).toContain("invalid_payload_hex");
  });

  it("fails closed on inactive namespaces, inactive codecs and mismatched pairs", () => {
    expect(validateU1AddressKey(validKey, { namespace: { ...namespace, isActive: false }, codec })).toContain("inactive_namespace");
    expect(validateU1AddressKey(validKey, { namespace, codec: { ...codec, status: "disabled" } })).toContain("inactive_codec");
    expect(validateU1AddressKey(validKey, { namespace, codec: { ...codec, status: "planned" } })).toContain("inactive_codec");
    expect(validateU1AddressKey(validKey, { namespace, codec: { ...codec, status: "catalogued" } })).toContain("inactive_codec");
    expect(validateU1AddressKey(validKey, { namespace: { ...namespace, addressCodecId: 2 }, codec })).toContain("namespace_codec_mismatch");
    expect(validateU1AddressKey(validKey, { namespace: null, codec })).toContain("unknown_namespace");
    expect(validateU1AddressKey(validKey, { namespace, codec: null })).toContain("unknown_codec");
  });

  it("enforces the codec payload length rule", () => {
    expect(validateU1AddressKey({ ...validKey, payloadHex: "aa".repeat(19) }, { namespace, codec })).toContain(
      "payload_length_mismatch",
    );
  });
});

describe("registry snapshot hash", () => {
  function registryRow(overrides: Partial<RegistrySnapshotRow> = {}): RegistrySnapshotRow {
    return {
      id: 1,
      chainCode: "ethereum",
      normalizedAddress: "0x" + "aa".repeat(20),
      namespaceId: 1,
      addressCodecId: 1,
      payloadHex: "aa".repeat(20),
      prefixCode: 10,
      entityId: 1,
      protocolId: null,
      categoryId: 100,
      roleId: 1002,
      componentId: null,
      tagsetId: null,
      confidenceScore: 95,
      labelStatus: 1,
      qualityTier: 1,
      flags: 5,
      validFromBlock: null,
      validToBlock: null,
      isActive: true,
      approvedBatchId: 7,
      ...overrides,
    };
  }

  it("is deterministic across row order", () => {
    const rows = [registryRow({ id: 2 }), registryRow({ id: 1 })];
    expect(computeRegistrySnapshotHash(rows)).toBe(computeRegistrySnapshotHash([...rows].reverse()));
  });

  it("changes when committed registry content changes", () => {
    const base = computeRegistrySnapshotHash([registryRow()]);
    expect(computeRegistrySnapshotHash([registryRow({ componentId: 4 })])).not.toBe(base);
    expect(computeRegistrySnapshotHash([registryRow({ categoryId: 101 })])).not.toBe(base);
    expect(computeRegistrySnapshotHash([registryRow({ payloadHex: "bb".repeat(20) })])).not.toBe(base);
  });
});
