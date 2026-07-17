import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadAndValidateU1Catalog } from "../src/lib/mqchain/catalog/u1";

async function main() {
  const catalog = await loadAndValidateU1Catalog();
  const networks = catalog.rows.get("chain_networks.csv") ?? [];
  const capabilities = new Map((catalog.rows.get("chain_capabilities.csv") ?? []).map(row => [row.chain_network_id, row]));
  const coverage = networks.map(network => {
    const capability = capabilities.get(network.chain_network_id)!;
    return {
      chainNetworkId: Number(network.chain_network_id),
      networkCode: network.network_code,
      networkName: network.network_name,
      environment: network.environment,
      isActive: network.is_active === "true",
      supportTier: capability.support_tier ? Number(capability.support_tier) : null,
      catalogState: capability.catalog_state,
      labelReadiness: capability.label_readiness,
      runtimeReadiness: capability.runtime_readiness,
      catalogued: capability.catalog_status,
      normalizerReady: capability.normalizer_status,
      kvReady: { current: capability.current_label_status, timeline: capability.timeline_status },
      assetResolverReady: capability.asset_resolver_status,
      mqnodeParserReady: capability.mqnode_parser_status,
      metricReady: capability.metric_status,
      reason: capability.notes,
      lastVerifiedAt: capability.last_verified_at,
    };
  });
  const summary = {
    networks: coverage.length,
    activeNetworks: coverage.filter(row => row.isActive).length,
    inactiveNetworks: coverage.filter(row => !row.isActive).length,
    normalizerTestReady: coverage.filter(row => row.normalizerReady === "test_ready").length,
    normalizerPartial: coverage.filter(row => row.normalizerReady === "partial").length,
    mqnodeProductionReady: coverage.filter(row => row.mqnodeParserReady === "production_ready").length,
    metricProductionReady: coverage.filter(row => row.metricReady === "production_ready").length,
    tier1: coverage.filter(row => row.supportTier === 1).length,
    tier2: coverage.filter(row => row.supportTier === 2).length,
    labelReady: coverage.filter(row => ["test_ready", "production_ready"].includes(row.labelReadiness)).length,
    runtimeReady: coverage.filter(row => ["test_ready", "production_ready"].includes(row.runtimeReadiness)).length,
  };
  const report = { schemaVersion: "MQCHAIN-U1-COVERAGE-1", dictionaryVersion: catalog.dictionaryVersion, summary, networks: coverage };
  const markdown = [
    "# MQCHAIN U1 Chain Coverage",
    "",
    `Dictionary version: \`${catalog.dictionaryVersion}\``,
    "",
    `Catalogued: ${summary.networks} | active: ${summary.activeNetworks} | inactive: ${summary.inactiveNetworks} | Tier 1: ${summary.tier1} | Tier 2: ${summary.tier2} | label-ready: ${summary.labelReady} | runtime-ready: ${summary.runtimeReady} | MQNODE production-ready: ${summary.mqnodeProductionReady} | metric production-ready: ${summary.metricProductionReady}`,
    "",
    "| ID | Network | Tier | Catalog state | Label readiness | Runtime readiness | Normalizer | Current KV | Timeline | MQASSET | MQNODE | Metric | Missing reason | Verified |",
    "|---:|---|---:|---|---|---|---|---|---|---|---|---|---|---|",
    ...coverage.map(row => `| ${row.chainNetworkId} | ${row.networkName} | ${row.supportTier ?? "-"} | ${row.catalogState} | ${row.labelReadiness} | ${row.runtimeReadiness} | ${row.normalizerReady} | ${row.kvReady.current} | ${row.kvReady.timeline} | ${row.assetResolverReady} | ${row.mqnodeParserReady} | ${row.metricReady} | ${row.reason.replace(/\|/g, "\\|")} | ${row.lastVerifiedAt} |`),
    "",
  ].join("\n");
  const out = path.join(process.cwd(), "reports");
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "u1_chain_coverage.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(out, "u1_chain_coverage.md"), markdown, "utf8");

  const protocols = catalog.rows.get("protocols.csv") ?? [];
  const deployments = catalog.rows.get("protocol_deployments.csv") ?? [];
  const components = catalog.rows.get("protocol_components.csv") ?? [];
  const protocolCoverage = protocols.map(protocol => {
    const protocolDeployments = deployments.filter(row => row.protocol_id === protocol.protocol_id);
    const protocolComponents = components.filter(row => row.protocol_id === protocol.protocol_id);
    return {
      protocolId: Number(protocol.protocol_id),
      protocolCode: protocol.protocol_code,
      protocolName: protocol.protocol_name,
      deploymentCount: protocolDeployments.length,
      rootComponentCount: protocolComponents.length,
      verifiedSourceCount: new Set([...protocolDeployments, ...protocolComponents].map(row => row.source_id)).size,
      status: protocolComponents.length > 0 ? "verified_root_components_seeded" : "catalogued_only",
      missingReason: protocolComponents.length > 0 ? null : "official source unavailable or not yet verified for U1 ingestion",
    };
  });
  const protocolReport = {
    schemaVersion: "MQCHAIN-U1-PROTOCOL-COVERAGE-1",
    dictionaryVersion: catalog.dictionaryVersion,
    summary: {
      protocols: protocolCoverage.length,
      protocolsWithVerifiedRoots: protocolCoverage.filter(row => row.rootComponentCount > 0).length,
      deployments: deployments.length,
      rootComponents: components.length,
    },
    protocols: protocolCoverage,
  };
  const protocolMarkdown = [
    "# MQCHAIN U1 Protocol Coverage",
    "",
    `Dictionary version: \`${catalog.dictionaryVersion}\``,
    "",
    `Catalogued: ${protocolReport.summary.protocols} | with verified roots: ${protocolReport.summary.protocolsWithVerifiedRoots} | deployments: ${protocolReport.summary.deployments} | root components: ${protocolReport.summary.rootComponents}`,
    "",
    "| ID | Protocol | Deployments | Root components | Sources | Status | Missing reason |",
    "|---:|---|---:|---:|---:|---|---|",
    ...protocolCoverage.map(row => `| ${row.protocolId} | ${row.protocolName} | ${row.deploymentCount} | ${row.rootComponentCount} | ${row.verifiedSourceCount} | ${row.status} | ${row.missingReason ?? "-"} |`),
    "",
  ].join("\n");
  await writeFile(path.join(out, "u1_protocol_coverage.json"), `${JSON.stringify(protocolReport, null, 2)}\n`, "utf8");
  await writeFile(path.join(out, "u1_protocol_coverage.md"), protocolMarkdown, "utf8");

  const namespaces = catalog.rows.get("address_namespaces.csv") ?? [];
  const prefixGroups = new Map<string, typeof namespaces>();
  for (const namespace of namespaces) {
    if (!namespace.legacy_prefix_code) continue;
    prefixGroups.set(namespace.legacy_prefix_code, [...(prefixGroups.get(namespace.legacy_prefix_code) ?? []), namespace]);
  }
  const conflicts = [...prefixGroups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([legacyPrefixCode, rows]) => ({
      conflictType: "legacy_prefix_to_multiple_u1_namespaces",
      legacyPrefixCode: Number(legacyPrefixCode),
      namespaceIds: rows.map(row => Number(row.namespace_id)),
      namespaceCodes: rows.map(row => row.namespace_code),
      resolution: "resolved_by_payload_aware_codec_detection",
      destructiveAction: false,
    }));
  const conflictReport = {
    schemaVersion: "MQCHAIN-U1-CONFLICT-1",
    dictionaryVersion: catalog.dictionaryVersion,
    summary: {
      detected: conflicts.length,
      resolved: conflicts.length,
      unresolved: 0,
      existingIdsRenumbered: 0,
    },
    conflicts,
  };
  const conflictMarkdown = [
    "# MQCHAIN U1 Migration Conflicts",
    "",
    `Dictionary version: \`${catalog.dictionaryVersion}\``,
    "",
    `Detected: ${conflicts.length} | resolved: ${conflicts.length} | unresolved: 0 | existing IDs renumbered: 0`,
    "",
    "| Type | Legacy prefix | U1 namespaces | Resolution | Destructive action |",
    "|---|---:|---|---|---|",
    ...conflicts.map(row => `| ${row.conflictType} | ${row.legacyPrefixCode} | ${row.namespaceIds.join(", ")} | ${row.resolution} | no |`),
    "",
  ].join("\n");
  await writeFile(path.join(out, "u1_conflicts.json"), `${JSON.stringify(conflictReport, null, 2)}\n`, "utf8");
  await writeFile(path.join(out, "u1_conflicts.md"), conflictMarkdown, "utf8");

  const aliases = catalog.rows.get("chain_aliases.csv") ?? [];
  const codecs = catalog.rows.get("address_codecs.csv") ?? [];
  const idRanges = catalog.rows.get("id_ranges.csv") ?? [];
  const aliasStatusCounts = Object.fromEntries(["approved", "pending_mapping", "pending_network", "not_a_network", "unsupported"].map(status => [status, aliases.filter(row => row.status === status).length]));
  const addressTypeCounts = Object.fromEntries([...new Set(namespaces.map(row => row.address_type))].sort().map(addressType => [addressType, namespaces.filter(row => row.address_type === addressType).length]));
  const familyCounts = Object.fromEntries([...new Set(networks.map(row => row.chain_family))].sort().map(family => [family, networks.filter(row => row.chain_family === family).length]));
  const universeReport = {
    schemaVersion: "MQCHAIN-U1-NETWORK-UNIVERSE-1",
    dictionaryVersion: catalog.dictionaryVersion,
    workbookEvidence: {
      sourceFile: "cex_por_wallet_registry_MQCHAIN_multi_cex.xlsx",
      sha256: "c19fe777e29dd0d6434d7e9f08aa36fca0d1e89ed89c293accd55b4f8b987594",
      sourceScopes: new Set(aliases.map(row => row.source_scope)).size,
      scopedDistinctChainValues: aliases.length,
      globallyDistinctRawChainValues: new Set(aliases.map(row => row.raw_chain_name)).size,
    },
    summary: {
      networks: networks.length,
      preservedBaseNetworks: networks.filter(row => Number(row.chain_network_id) <= 48).length,
      addedInactiveNetworks: networks.filter(row => Number(row.chain_network_id) > 48 && row.is_active === "false").length,
      codecs: codecs.length,
      namespaces: namespaces.length,
      capabilities: capabilities.size,
      aliases: aliases.length,
      aliasStatusCounts,
      addressTypeCounts,
      familyCounts,
      publishedIdsRenumbered: 0,
    },
    allocators: idRanges.map(row => ({ rangeCode: row.range_code, nextId: Number(row.next_id) })),
    pendingAliases: aliases.filter(row => ["pending_mapping", "pending_network", "unsupported"].includes(row.status)).map(row => ({ sourceScope: row.source_scope, rawChainName: row.raw_chain_name, addressType: row.address_type, status: row.status })),
  };
  const universeMarkdown = [
    "# MQCHAIN U1 Network Universe Expansion",
    "",
    `Dictionary version: \`${catalog.dictionaryVersion}\``,
    "",
    `Canonical networks: ${universeReport.summary.networks} | preserved base: ${universeReport.summary.preservedBaseNetworks} | added inactive: ${universeReport.summary.addedInactiveNetworks} | codecs: ${universeReport.summary.codecs} | namespaces: ${universeReport.summary.namespaces} | aliases: ${universeReport.summary.aliases}`,
    "",
    `Workbook evidence: ${universeReport.workbookEvidence.globallyDistinctRawChainValues} globally distinct Chain values across ${universeReport.workbookEvidence.sourceScopes} source scopes (${universeReport.workbookEvidence.scopedDistinctChainValues} scoped aliases).`,
    "",
    `Alias states: approved ${aliasStatusCounts.approved}; pending_mapping ${aliasStatusCounts.pending_mapping}; pending_network ${aliasStatusCounts.pending_network}; not_a_network ${aliasStatusCounts.not_a_network}; unsupported ${aliasStatusCounts.unsupported}.`,
    "",
    "All network IDs 1-48 are preserved. Every added network is inactive and has runtime readiness `not_ready`; activation remains proposal-gated.",
    "",
    "## Pending And Unsupported Aliases",
    "",
    "| Scope | Raw Chain | Address type | Status |",
    "|---|---|---|---|",
    ...universeReport.pendingAliases.map(row => `| ${row.sourceScope} | ${row.rawChainName.replace(/\|/g, "\\|")} | ${row.addressType} | ${row.status} |`),
    "",
  ].join("\n");
  await writeFile(path.join(out, "u1_network_universe.json"), `${JSON.stringify(universeReport, null, 2)}\n`, "utf8");
  await writeFile(path.join(out, "u1_network_universe.md"), universeMarkdown, "utf8");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
