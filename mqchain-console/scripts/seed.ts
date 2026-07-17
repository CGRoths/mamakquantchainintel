import { hash } from "bcryptjs";
import { createHash } from "crypto";
import { eq, sql } from "drizzle-orm";

import { closeDb, getDb } from "../src/db/client";
import {
  mqCategoryDict,
  mqAddressCodecs,
  mqAddressNamespaces,
  mqAssetNamespaces,
  mqAssets,
  mqCatalogSources,
  mqChainCapabilities,
  mqChainAliases,
  mqChainNetworks,
  mqDictionaryIdRanges,
  mqDictionaryVersions,
  mqEntities,
  mqKvKeyPrefixDict,
  mqKvRoleDict,
  mqMetricGroupRules,
  mqMetricGroups,
  mqProtocolComponents,
  mqProtocolDeployments,
  mqProtocols,
  mqTagDict,
  mqTokenContracts,
  mqTokenStandards,
  mqUsers,
} from "../src/db/schema";
import { assertStableCatalogIds, loadAndValidateU1Catalog } from "../src/lib/mqchain/catalog/u1";
import { seedCategories, seedEntities, seedMetricGroups, seedPrefixes, seedProtocols, seedRoles } from "../src/lib/mqchain/data/seed-data";
import { planStableDictionaryIds } from "../src/lib/mqchain/seed-reconciliation";

async function main() {
  const db = getDb();
  const u1Catalog = await loadAndValidateU1Catalog();
  const ownerEmail = process.env.MQCHAIN_SEED_OWNER_EMAIL ?? "owner@mamakquant.local";
  const ownerPassword = process.env.MQCHAIN_SEED_OWNER_PASSWORD ?? "change-me-locally";
  const passwordHash = await hash(ownerPassword, 12);

  await db.transaction(async (tx) => {
    await tx
      .insert(mqUsers)
      .values({
        email: ownerEmail,
        displayName: "MamakQuant Owner",
        passwordHash,
        role: "owner",
        isActive: true,
      })
      .onConflictDoUpdate({
        target: mqUsers.email,
        set: {
          displayName: "MamakQuant Owner",
          passwordHash,
          role: "owner",
          isActive: true,
          updatedAt: new Date(),
        },
      });

    const existingCategories = await tx.select().from(mqCategoryDict);
    const categoryPlans = planStableDictionaryIds(
      seedCategories.map(([categoryId, categoryCode]) => ({ preferredId: categoryId, code: categoryCode })),
      existingCategories.map((category) => ({ id: category.categoryId, code: category.categoryCode })),
    );
    const categoryIdByCode = new Map(categoryPlans.map((plan) => [plan.code, plan.id]));
    const categoryCodeByPreferredId = new Map(seedCategories.map(([categoryId, categoryCode]) => [categoryId, categoryCode]));

    for (const [categoryId, categoryCode, categoryName, parentCategoryId, domainCode, metricDomain] of seedCategories) {
      const actualCategoryId = categoryIdByCode.get(categoryCode) ?? categoryId;
      const parentCode = parentCategoryId === null ? null : categoryCodeByPreferredId.get(parentCategoryId);
      const actualParentId = parentCode ? categoryIdByCode.get(parentCode) ?? null : null;
      const values = {
        categoryName,
        parentCategoryId: actualParentId,
        domainCode,
        metricDomain,
        isActive: true,
        updatedAt: new Date(),
      };
      const existing = existingCategories.find((category) => category.categoryCode === categoryCode);

      if (existing) {
        await tx.update(mqCategoryDict).set(values).where(eq(mqCategoryDict.categoryCode, categoryCode));
      } else {
        await tx.insert(mqCategoryDict).values({ categoryId: actualCategoryId, categoryCode, ...values });
      }
    }

    for (const [entityCode, entityName, entityType, preferredCategoryId] of seedEntities) {
      const categoryCode = categoryCodeByPreferredId.get(preferredCategoryId);
      await tx
        .insert(mqEntities)
        .values({
          entityCode,
          entityName,
          entityType,
          categoryId: categoryCode ? categoryIdByCode.get(categoryCode) ?? null : null,
        })
        .onConflictDoUpdate({
          target: mqEntities.entityCode,
          set: {
            entityName,
            entityType,
            categoryId: categoryCode ? categoryIdByCode.get(categoryCode) ?? null : null,
            isActive: true,
            updatedAt: new Date(),
          },
        });
    }

    const entities = await tx.select().from(mqEntities);
    const entityIdByCode = new Map(entities.map((entity) => [entity.entityCode, entity.id]));

    for (const [entityCode, protocolCode, protocolName, protocolType, chainScope] of seedProtocols) {
      await tx
        .insert(mqProtocols)
        .values({
          entityId: entityIdByCode.get(entityCode),
          protocolCode,
          protocolName,
          protocolType,
          chainScope: [...chainScope],
        })
        .onConflictDoUpdate({
          target: mqProtocols.protocolCode,
          set: {
            entityId: entityIdByCode.get(entityCode),
            protocolName,
            protocolType,
            chainScope: [...chainScope],
            isActive: true,
            updatedAt: new Date(),
          },
        });
    }

    for (const [prefixCode, chainCode, chainName, chainFamily, addressFamily, codec, payloadLen, evmChainId] of seedPrefixes) {
      await tx
        .insert(mqKvKeyPrefixDict)
        .values({ prefixCode, chainCode, chainName, chainFamily, addressFamily, codec, payloadLen, evmChainId })
        .onConflictDoUpdate({
          target: mqKvKeyPrefixDict.prefixCode,
          set: { chainCode, chainName, chainFamily, addressFamily, codec, payloadLen, evmChainId, isActive: true, updatedAt: new Date() },
        });
    }

    const existingRoles = await tx.select().from(mqKvRoleDict);
    const rolePlans = planStableDictionaryIds(
      seedRoles.map((role) => ({ preferredId: role.roleId, code: role.roleCode })),
      existingRoles.map((role) => ({ id: role.roleId, code: role.roleCode })),
    );
    const roleIdByCode = new Map(rolePlans.map((plan) => [plan.code, plan.id]));

    for (const role of seedRoles) {
      const categoryCode = categoryCodeByPreferredId.get(role.categoryId);
      const values = {
        roleName: role.roleName,
        categoryId: categoryCode ? categoryIdByCode.get(categoryCode) : undefined,
        roleGroup: role.roleGroup,
        metricUsageDefault: role.metricUsageDefault,
        boundaryClass: role.boundaryClass,
        defaultQualityTier: role.defaultQualityTier,
        defaultFlags: role.defaultFlags,
        isActive: true,
        updatedAt: new Date(),
      };
      const existing = existingRoles.find((existingRole) => existingRole.roleCode === role.roleCode);

      if (existing) {
        await tx.update(mqKvRoleDict).set(values).where(eq(mqKvRoleDict.roleCode, role.roleCode));
      } else {
        await tx.insert(mqKvRoleDict).values({ roleId: roleIdByCode.get(role.roleCode) ?? role.roleId, roleCode: role.roleCode, ...values });
      }
    }

    for (const metricGroup of seedMetricGroups) {
      const [group] = await tx
        .insert(mqMetricGroups)
        .values({
          metricGroupCode: metricGroup.metricGroupCode,
          metricGroupName: metricGroup.metricGroupName,
          chainCode: metricGroup.chainCode,
          minConfidence: metricGroup.minConfidence,
          requireMetricEligible: metricGroup.requireMetricEligible,
        })
        .onConflictDoUpdate({
          target: mqMetricGroups.metricGroupCode,
          set: {
            metricGroupName: metricGroup.metricGroupName,
            chainCode: metricGroup.chainCode,
            minConfidence: metricGroup.minConfidence,
            requireMetricEligible: metricGroup.requireMetricEligible,
            isActive: true,
            updatedAt: new Date(),
          },
        })
        .returning();

      const [existingRule] = await tx
        .select({ id: mqMetricGroupRules.id })
        .from(mqMetricGroupRules)
        .where(eq(mqMetricGroupRules.metricGroupId, group.id))
        .limit(1);

      if (!existingRule) {
        await tx.insert(mqMetricGroupRules).values({ metricGroupId: group.id, ruleJson: metricGroup.ruleJson });
      }
    }

    const catalogSources = u1Catalog.rows.get("catalog_sources.csv") ?? [];
    for (const row of catalogSources) {
      const values = {
        sourceCode: row.source_code,
        sourceName: row.source_name,
        sourceType: row.source_type,
        url: row.url || null,
        retrievedAt: row.retrieved_at ? new Date(`${row.retrieved_at}T00:00:00Z`) : null,
        status: row.status,
        notes: row.notes || null,
        contentHash: row.content_hash || null,
        updatedAt: new Date(),
      };
      await tx.insert(mqCatalogSources).values({ id: Number(row.source_id), ...values }).onConflictDoUpdate({ target: mqCatalogSources.id, set: values });
    }

    const categoryRows = u1Catalog.rows.get("categories.csv") ?? [];
    const currentCategories = await tx.select().from(mqCategoryDict);
    assertStableCatalogIds(
      "category",
      categoryRows.map((row) => ({ id: Number(row.category_id), code: row.category_code })),
      currentCategories.map((row) => ({ id: row.categoryId, code: row.categoryCode })),
    );
    for (const row of categoryRows) {
      const values = {
        categoryName: row.category_name,
        parentCategoryId: row.parent_category_id ? Number(row.parent_category_id) : null,
        domainCode: row.domain_code || null,
        metricDomain: row.metric_domain || null,
        isActive: row.is_active === "true",
        updatedAt: new Date(),
      };
      await tx.insert(mqCategoryDict).values({ categoryId: Number(row.category_id), categoryCode: row.category_code, ...values }).onConflictDoUpdate({ target: mqCategoryDict.categoryCode, set: values });
    }

    const entityRows = u1Catalog.rows.get("entities.csv") ?? [];
    const currentEntities = await tx.select().from(mqEntities);
    assertStableCatalogIds(
      "entity",
      entityRows.map((row) => ({ id: Number(row.entity_id), code: row.entity_code })),
      currentEntities.map((row) => ({ id: row.id, code: row.entityCode })),
    );
    for (const row of entityRows) {
      const values = {
        entityName: row.entity_name,
        entityType: row.entity_type || null,
        categoryId: Number(row.category_id),
        websiteUrl: row.website_url || null,
        isActive: row.is_active === "true",
        updatedAt: new Date(),
      };
      await tx.insert(mqEntities).values({ id: Number(row.entity_id), entityCode: row.entity_code, ...values }).onConflictDoUpdate({ target: mqEntities.entityCode, set: values });
    }

    const protocolRows = u1Catalog.rows.get("protocols.csv") ?? [];
    const currentProtocols = await tx.select().from(mqProtocols);
    assertStableCatalogIds(
      "protocol",
      protocolRows.map((row) => ({ id: Number(row.protocol_id), code: row.protocol_code })),
      currentProtocols.map((row) => ({ id: row.id, code: row.protocolCode })),
    );
    for (const row of protocolRows) {
      const values = {
        entityId: Number(row.entity_id),
        protocolName: row.protocol_name,
        protocolType: row.protocol_type || null,
        isActive: row.is_active === "true",
        updatedAt: new Date(),
      };
      await tx.insert(mqProtocols).values({ id: Number(row.protocol_id), protocolCode: row.protocol_code, ...values }).onConflictDoUpdate({ target: mqProtocols.protocolCode, set: values });
    }

    const roleRows = u1Catalog.rows.get("roles.csv") ?? [];
    const currentRoles = await tx.select().from(mqKvRoleDict);
    assertStableCatalogIds(
      "role",
      roleRows.map((row) => ({ id: Number(row.role_id), code: row.role_code })),
      currentRoles.map((row) => ({ id: row.roleId, code: row.roleCode })),
    );
    for (const row of roleRows) {
      const values = {
        roleName: row.role_name,
        categoryId: Number(row.category_id),
        roleGroup: row.role_group || null,
        metricUsageDefault: row.metric_usage_default || null,
        boundaryClass: row.boundary_class || null,
        defaultQualityTier: Number(row.default_quality_tier),
        defaultFlags: Number(row.default_flags),
        isActive: row.is_active === "true",
        updatedAt: new Date(),
      };
      await tx.insert(mqKvRoleDict).values({ roleId: Number(row.role_id), roleCode: row.role_code, ...values }).onConflictDoUpdate({ target: mqKvRoleDict.roleCode, set: values });
    }

    const networkRows = u1Catalog.rows.get("chain_networks.csv") ?? [];
    assertStableCatalogIds(
      "network",
      networkRows.map((row) => ({ id: Number(row.chain_network_id), code: row.network_code })),
      (await tx.select().from(mqChainNetworks)).map((row) => ({ id: row.id, code: row.networkCode })),
    );
    for (const row of networkRows) {
      const values = {
        networkCode: row.network_code,
        networkName: row.network_name,
        chainFamily: row.chain_family,
        environment: row.environment,
        caip2: row.caip2 || null,
        evmChainId: row.evm_chain_id ? Number(row.evm_chain_id) : null,
        slip44: row.slip44 ? Number(row.slip44) : null,
        isActive: row.is_active === "true",
        sourceId: Number(row.source_id),
        verifiedAt: row.verified_at ? new Date(`${row.verified_at}T00:00:00Z`) : null,
        notes: row.notes || null,
        updatedAt: new Date(),
      };
      await tx.insert(mqChainNetworks).values({ id: Number(row.chain_network_id), ...values }).onConflictDoUpdate({ target: mqChainNetworks.id, set: values });
    }

    const codecRows = u1Catalog.rows.get("address_codecs.csv") ?? [];
    assertStableCatalogIds(
      "address codec",
      codecRows.map((row) => ({ id: Number(row.address_codec_id), code: row.codec_code })),
      (await tx.select().from(mqAddressCodecs)).map((row) => ({ id: row.id, code: row.codecCode })),
    );
    for (const row of codecRows) {
      const values = {
        codecCode: row.codec_code,
        codecName: row.codec_name,
        addressFamily: row.address_family,
        identifierKind: row.identifier_kind,
        acceptedFormats: row.accepted_formats,
        canonicalFormat: row.canonical_format,
        payloadRule: row.payload_rule,
        checksumBehavior: row.checksum_behavior,
        chainFamilyCompatibility: row.chain_family_compatibility,
        normalizerVersion: row.normalizer_version,
        testVectors: {
          valid: JSON.parse(row.valid_test_vectors_json || "[]") as string[],
          invalid: JSON.parse(row.invalid_test_vectors_json || "[]") as string[],
        },
        status: row.status,
        sourceId: Number(row.source_id),
        verifiedAt: row.verified_at ? new Date(`${row.verified_at}T00:00:00Z`) : null,
        notes: row.notes || null,
        updatedAt: new Date(),
      };
      await tx.insert(mqAddressCodecs).values({ id: Number(row.address_codec_id), ...values }).onConflictDoUpdate({ target: mqAddressCodecs.id, set: values });
    }

    const namespaceRows = u1Catalog.rows.get("address_namespaces.csv") ?? [];
    assertStableCatalogIds(
      "address namespace",
      namespaceRows.map((row) => ({ id: Number(row.namespace_id), code: row.namespace_code })),
      (await tx.select().from(mqAddressNamespaces)).map((row) => ({ id: row.id, code: row.namespaceCode })),
    );
    for (const row of namespaceRows) {
      const values = {
        namespaceCode: row.namespace_code,
        namespaceName: row.namespace_name,
        chainNetworkId: Number(row.chain_network_id),
        addressCodecId: Number(row.address_codec_id),
        addressType: row.address_type,
        legacyPrefixCode: row.legacy_prefix_code ? Number(row.legacy_prefix_code) : null,
        addressHrp: row.address_hrp || null,
        networkDiscriminator: row.network_discriminator || null,
        isActive: row.is_active === "true",
        sourceId: Number(row.source_id),
        verifiedAt: row.verified_at ? new Date(`${row.verified_at}T00:00:00Z`) : null,
        notes: row.notes || null,
        updatedAt: new Date(),
      };
      await tx.insert(mqAddressNamespaces).values({ id: Number(row.namespace_id), ...values }).onConflictDoUpdate({ target: mqAddressNamespaces.id, set: values });
    }

    await tx.execute(sql`
      update mq_address_candidates candidate
      set namespace_id = namespace.namespace_id,
          address_codec_id = namespace.address_codec_id
      from mq_address_namespaces namespace
      where candidate.prefix_code = namespace.legacy_prefix_code
        and (select count(*) from mq_address_namespaces sibling where sibling.legacy_prefix_code = candidate.prefix_code) = 1
        and (candidate.namespace_id is distinct from namespace.namespace_id
          or candidate.address_codec_id is distinct from namespace.address_codec_id)
    `);
    await tx.execute(sql`
      update mq_address_registry registry
      set namespace_id = namespace.namespace_id,
          address_codec_id = namespace.address_codec_id
      from mq_address_namespaces namespace
      where registry.prefix_code = namespace.legacy_prefix_code
        and (select count(*) from mq_address_namespaces sibling where sibling.legacy_prefix_code = registry.prefix_code) = 1
        and (registry.namespace_id is distinct from namespace.namespace_id
          or registry.address_codec_id is distinct from namespace.address_codec_id)
    `);
    await tx.execute(sql`
      update mq_address_candidates
      set namespace_id = case when substring(payload_hex from 1 for 2) = '00' then 3 else 47 end,
          address_codec_id = case when substring(payload_hex from 1 for 2) = '00' then 12 else 13 end
      where prefix_code = 18 and payload_hex ~ '^(0[0-9a-f]|10)'
    `);
    await tx.execute(sql`
      update mq_address_registry
      set namespace_id = case when substring(payload_hex from 1 for 2) = '00' then 3 else 47 end,
          address_codec_id = case when substring(payload_hex from 1 for 2) = '00' then 12 else 13 end
      where prefix_code = 18 and payload_hex ~ '^(0[0-9a-f]|10)'
    `);
    await tx.execute(sql`
      update mq_metric_group_members member
      set namespace_id = registry.namespace_id,
          address_codec_id = registry.address_codec_id,
          payload_hex = registry.payload_hex
      from mq_address_registry registry
      where member.registry_id = registry.id
        and (member.namespace_id is distinct from registry.namespace_id
          or member.address_codec_id is distinct from registry.address_codec_id
          or member.payload_hex is distinct from registry.payload_hex)
    `);
    await tx.execute(sql`
      update mq_address_registry registry
      set category_id = role.category_id
      from mq_kv_role_dict role
      where registry.role_id = role.role_id and registry.category_id is null
    `);

    for (const row of u1Catalog.rows.get("chain_capabilities.csv") ?? []) {
      const values = {
        supportTier: row.support_tier ? Number(row.support_tier) : null,
        catalogState: row.catalog_state,
        labelReadiness: row.label_readiness,
        runtimeReadiness: row.runtime_readiness,
        catalogStatus: row.catalog_status,
        normalizerStatus: row.normalizer_status,
        mqnodeParserStatus: row.mqnode_parser_status,
        assetResolverStatus: row.asset_resolver_status,
        currentLabelStatus: row.current_label_status,
        timelineStatus: row.timeline_status,
        metricStatus: row.metric_status,
        mqnodeIntegrationTestRef: row.mqnode_integration_test_ref || null,
        metricIntegrationTestRef: row.metric_integration_test_ref || null,
        notes: row.notes || null,
        lastVerifiedAt: row.last_verified_at ? new Date(`${row.last_verified_at}T00:00:00Z`) : null,
        updatedAt: new Date(),
      };
      await tx.insert(mqChainCapabilities).values({ chainNetworkId: Number(row.chain_network_id), ...values }).onConflictDoUpdate({ target: mqChainCapabilities.chainNetworkId, set: values });
    }

    const existingAliases = await tx.select().from(mqChainAliases);
    const existingAliasIdentityById = new Map(existingAliases.map((row) => [row.id, `${row.sourceScope}\u0000${row.rawChainName}\u0000${row.addressType}`]));
    for (const row of u1Catalog.rows.get("chain_aliases.csv") ?? []) {
      const id = Number(row.alias_id);
      const identity = `${row.source_scope}\u0000${row.raw_chain_name}\u0000${row.address_type}`;
      const existingIdentity = existingAliasIdentityById.get(id);
      if (existingIdentity && existingIdentity !== identity) throw new Error(`chain alias ID ${id} is already assigned to a different source alias.`);
      const values = {
        sourceScope: row.source_scope,
        rawChainName: row.raw_chain_name,
        chainNetworkId: row.chain_network_id ? Number(row.chain_network_id) : null,
        namespaceId: row.namespace_id ? Number(row.namespace_id) : null,
        addressCodecId: row.address_codec_id ? Number(row.address_codec_id) : null,
        addressType: row.address_type,
        assetHint: row.asset_hint || null,
        tokenStandardHint: row.token_standard_hint || null,
        status: row.status,
        evidenceRef: row.evidence_ref,
        sourceId: Number(row.source_id),
        approvedBy: row.approved_by || null,
        approvedAt: row.approved_at ? new Date(`${row.approved_at}T00:00:00Z`) : null,
        approvalNotes: row.approval_notes || null,
        updatedAt: new Date(),
      };
      await tx.insert(mqChainAliases).values({ id, ...values }).onConflictDoUpdate({ target: mqChainAliases.id, set: values });
    }

    for (const row of u1Catalog.rows.get("id_ranges.csv") ?? []) {
      const values = {
        dictionaryKind: row.dictionary_kind,
        rangeCode: row.range_code,
        startId: Number(row.start_id),
        endId: Number(row.end_id),
        nextId: Number(row.next_id),
        ownerDomain: row.owner_domain,
        status: row.status,
        notes: row.notes || null,
        updatedAt: new Date(),
      };
      await tx.insert(mqDictionaryIdRanges).values({ id: Number(row.range_id), ...values }).onConflictDoUpdate({ target: mqDictionaryIdRanges.id, set: values });
    }

    for (const row of u1Catalog.rows.get("tags.csv") ?? []) {
      const values = { tagCode: row.tag_code, tagName: row.tag_name, tagGroup: row.tag_group || null, isActive: row.is_active === "true", sourceId: Number(row.source_id), updatedAt: new Date() };
      await tx.insert(mqTagDict).values({ id: Number(row.tag_id), ...values }).onConflictDoUpdate({ target: mqTagDict.id, set: values });
    }

    for (const row of u1Catalog.rows.get("assets.csv") ?? []) {
      const values = { assetCode: row.asset_code, assetName: row.asset_name, assetType: row.asset_type, symbol: row.symbol, isActive: row.is_active === "true", sourceId: Number(row.source_id), verifiedAt: row.verified_at ? new Date(`${row.verified_at}T00:00:00Z`) : null, notes: row.notes || null, updatedAt: new Date() };
      await tx.insert(mqAssets).values({ id: Number(row.asset_id), ...values }).onConflictDoUpdate({ target: mqAssets.id, set: values });
    }

    for (const row of u1Catalog.rows.get("token_standards.csv") ?? []) {
      const values = { standardCode: row.standard_code, standardName: row.standard_name, chainFamily: row.chain_family, isActive: row.is_active === "true", sourceId: Number(row.source_id), verifiedAt: row.verified_at ? new Date(`${row.verified_at}T00:00:00Z`) : null, notes: row.notes || null, updatedAt: new Date() };
      await tx.insert(mqTokenStandards).values({ id: Number(row.standard_id), ...values }).onConflictDoUpdate({ target: mqTokenStandards.id, set: values });
    }

    for (const row of u1Catalog.rows.get("asset_namespaces.csv") ?? []) {
      const values = { assetId: Number(row.asset_id), namespaceId: Number(row.namespace_id), standardId: Number(row.standard_id), status: row.status, sourceId: Number(row.source_id), verifiedAt: row.verified_at ? new Date(`${row.verified_at}T00:00:00Z`) : null, notes: row.notes || null, updatedAt: new Date() };
      await tx.insert(mqAssetNamespaces).values({ id: Number(row.asset_namespace_id), ...values }).onConflictDoUpdate({ target: mqAssetNamespaces.id, set: values });
    }

    for (const row of u1Catalog.rows.get("token_contracts.csv") ?? []) {
      const values = {
        assetId: Number(row.asset_id),
        namespaceId: Number(row.namespace_id),
        addressCodecId: Number(row.address_codec_id),
        normalizedPayloadHex: row.normalized_payload_hex,
        standardId: Number(row.standard_id),
        decimals: Number(row.decimals),
        issuerEntityId: row.issuer_entity_id ? Number(row.issuer_entity_id) : null,
        status: row.status,
        sourceId: Number(row.source_id),
        verifiedAt: row.verified_at ? new Date(`${row.verified_at}T00:00:00Z`) : null,
        notes: row.notes || null,
        updatedAt: new Date(),
      };
      await tx.insert(mqTokenContracts).values({ id: Number(row.token_contract_id), ...values }).onConflictDoUpdate({ target: mqTokenContracts.id, set: values });
    }

    for (const row of u1Catalog.rows.get("protocol_deployments.csv") ?? []) {
      const values = {
        protocolId: Number(row.protocol_id),
        namespaceId: Number(row.namespace_id),
        deploymentName: row.deployment_name,
        status: row.status,
        sourceId: Number(row.source_id),
        verifiedAt: row.verified_at ? new Date(`${row.verified_at}T00:00:00Z`) : null,
        notes: row.notes || null,
        updatedAt: new Date(),
      };
      await tx.insert(mqProtocolDeployments).values({ id: Number(row.deployment_id), deploymentCode: row.deployment_code, ...values }).onConflictDoUpdate({ target: mqProtocolDeployments.deploymentCode, set: values });
    }

    for (const row of u1Catalog.rows.get("protocol_components.csv") ?? []) {
      const values = {
        protocolId: Number(row.protocol_id),
        deploymentId: row.deployment_id ? Number(row.deployment_id) : null,
        componentName: row.component_name,
        componentType: row.component_type,
        namespaceId: Number(row.namespace_id),
        addressCodecId: Number(row.address_codec_id),
        normalizedPayloadHex: row.normalized_payload_hex,
        roleId: Number(row.role_id),
        categoryId: Number(row.category_id),
        confidenceScore: Number(row.confidence_score),
        qualityTier: Number(row.quality_tier),
        validFromHeight: row.valid_from_height ? Number(row.valid_from_height) : null,
        isActive: row.is_active === "true",
        sourceId: Number(row.source_id),
        verifiedAt: row.verified_at ? new Date(`${row.verified_at}T00:00:00Z`) : null,
        notes: row.notes || null,
        updatedAt: new Date(),
      };
      await tx.insert(mqProtocolComponents).values({ id: Number(row.component_id), componentCode: row.component_code, ...values }).onConflictDoUpdate({ target: mqProtocolComponents.componentCode, set: values });
    }

    const metricRows = u1Catalog.rows.get("metric_groups.csv") ?? [];
    const currentMetricGroups = await tx.select().from(mqMetricGroups);
    assertStableCatalogIds(
      "metric group",
      metricRows.map((row) => ({ id: Number(row.metric_group_id), code: row.metric_group_code })),
      currentMetricGroups.map((row) => ({ id: row.id, code: row.metricGroupCode })),
    );
    for (const row of metricRows) {
      const values = { metricGroupName: row.metric_group_name, namespaceId: row.namespace_id ? Number(row.namespace_id) : null, minConfidence: Number(row.min_confidence), requireMetricEligible: row.require_metric_eligible === "true", isActive: row.is_active === "true", updatedAt: new Date() };
      await tx.insert(mqMetricGroups).values({ id: Number(row.metric_group_id), metricGroupCode: row.metric_group_code, ...values }).onConflictDoUpdate({ target: mqMetricGroups.metricGroupCode, set: values });
    }

    for (const rule of u1Catalog.metricRules) {
      const contentHash = createHash("sha256").update(JSON.stringify(rule)).digest("hex");
      const values = {
        ruleJson: rule,
        status: rule.status,
        sourceId: rule.source_id,
        contentHash,
        activatedAt: rule.status === "active" ? new Date() : null,
        retiredAt: rule.status === "retired" ? new Date() : null,
        updatedAt: new Date(),
      };
      await tx
        .insert(mqMetricGroupRules)
        .values({ metricGroupId: rule.metric_group_id, ruleVersion: rule.rule_version, ...values })
        .onConflictDoUpdate({
          target: [mqMetricGroupRules.metricGroupId, mqMetricGroupRules.ruleVersion],
          set: values,
        });
    }

    await tx.insert(mqDictionaryVersions).values({
      versionHash: u1Catalog.dictionaryVersion,
      catalogHash: u1Catalog.dictionaryVersion,
      catalogPath: "data/catalog/u1",
      status: "active",
      summary: { catalog: "u1", files: u1Catalog.rows.size },
      activatedAt: new Date(),
    }).onConflictDoNothing({ target: mqDictionaryVersions.versionHash });

    await tx.execute(sql`select setval(pg_get_serial_sequence('mq_entities', 'id'), greatest((select max(id) from mq_entities), 1), true)`);
    await tx.execute(sql`select setval(pg_get_serial_sequence('mq_protocols', 'id'), greatest((select max(id) from mq_protocols), 1), true)`);
    await tx.execute(sql`select setval(pg_get_serial_sequence('mq_metric_groups', 'id'), greatest((select max(id) from mq_metric_groups), 1), true)`);
  });

  console.log(`Seed complete. Owner account: ${ownerEmail}. Password loaded from MQCHAIN_SEED_OWNER_PASSWORD.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
