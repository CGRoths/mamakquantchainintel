/**
 * End-to-end lifecycle against a disposable PostgreSQL database.
 *
 * Skipped unless MQCHAIN_TEST_DATABASE_URL points at a throwaway database that
 * already has the Drizzle migrations applied. See docs/MQCHAIN_BULK_APPROVAL.md
 * for the exact container and migration commands.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";

import { encodeOriginActorClaims, MQCHAIN_ACTOR_HEADER, MQCHAIN_REQUEST_ID_HEADER, MQCHAIN_SIGNATURE_HEADER, signOriginRequest } from "@/lib/mqchain/contracts/request-signing";
import { parseOriginJson, serializeOriginBody } from "@/lib/mqchain/origin-client/serialization";

const testDatabaseUrl = process.env.MQCHAIN_TEST_DATABASE_URL;
const describeIntegration = testDatabaseUrl ? describe : describe.skip;

if (testDatabaseUrl) {
  process.env.DATABASE_URL = testDatabaseUrl;
}

describeIntegration("bulk approval to registry commit lifecycle", () => {
  let db: Awaited<typeof import("@/db/client")>["getDb"] extends () => infer T ? T : never;
  let schema: typeof import("@/db/schema");
  let closeDb: () => Promise<void>;
  let runWithOriginActor: typeof import("@/lib/mqchain/origin-only/actor-context").runWithOriginActor;
  let previewBulkCandidateApproval: typeof import("@/lib/mqchain/services/bulk-approval-service").previewBulkCandidateApproval;
  let executeBulkCandidateApproval: typeof import("@/lib/mqchain/services/bulk-approval-service").executeBulkCandidateApproval;
  let createBatchFromCandidates: typeof import("@/lib/mqchain/services/batch-service").createBatchFromCandidates;
  let approveBatch: typeof import("@/lib/mqchain/services/batch-service").approveBatch;
  let commitBatch: typeof import("@/lib/mqchain/services/batch-service").commitBatch;
  let computeFullKvBuildRequestHash: typeof import("@/lib/mqchain/kv-manifest").computeFullKvBuildRequestHash;
  let compilePendingFullBuild: typeof import("../../../tools/kv-compiler/compiler").compilePendingFullBuild;
  let buildKvManifestActivationPreflight: typeof import("@/lib/mqchain/kv-manifest").buildKvManifestActivationPreflight;

  const actor = { id: "", email: "owner@mamakquant.local", name: "Owner", role: "owner" as const };
  const eligibleCandidateIds: number[] = [];
  const blockedCandidateIds: number[] = [];
  let sourceJobId = 0;
  let sourceDocumentId = 0;
  let pendingBuildId = 0;
  let compiledBuildId = 0;
  let compiledBuildHash = "";
  let compiledDictionaryVersion = "";
  let compiledRegistrySnapshotHash = "";
  let compiledValidationRunId = 0;
  let compiledValidationReportHash = "";
  let artifactRoot: string | null = null;
  let originServer: Server | null = null;
  let originUrl = "";
  const originAudience = "mqchain-u1-integration";
  const originSigningSecret = "mqchain-u1-integration-signing-secret";

  const NAMESPACE_ID = 900001;
  const CODEC_ID = 9001;
  // Inside the canonical pre-U1 network range, which may be created active
  // directly; ids above 48 must arrive inactive via a manual proposal.
  const NETWORK_ID = 40;
  const CATEGORY_ID = 900003;
  const ENTITY_ID = 900004;
  const PROTOCOL_ID = 900005;
  const ROLE_ID = 900006;
  const COMPONENT_ID = 900007;
  const SOURCE_ID = 900008;
  const UNRESOLVED_ROLE_ID = 900009;

  function payloadFor(index: number) {
    return index.toString(16).padStart(40, "0");
  }

  function candidateMetadata(sheet = "ETH") {
    return {
      normalizationStatus: "resolved",
      identifierKind: "wallet_address",
      sourceEvidence: { sourceUrl: "https://kraken.com/por", sourceSheet: sheet, sourceRow: 7 },
    };
  }

  beforeAll(async () => {
    const client = await import("@/db/client");
    schema = await import("@/db/schema");
    db = client.getDb();
    closeDb = client.closeDb;
    ({ runWithOriginActor } = await import("@/lib/mqchain/origin-only/actor-context"));
    ({ previewBulkCandidateApproval, executeBulkCandidateApproval } = await import(
      "@/lib/mqchain/services/bulk-approval-service"
    ));
    ({ createBatchFromCandidates, approveBatch, commitBatch } = await import("@/lib/mqchain/services/batch-service"));
    ({ computeFullKvBuildRequestHash } = await import("@/lib/mqchain/kv-manifest"));
    ({ buildKvManifestActivationPreflight } = await import("@/lib/mqchain/kv-manifest"));
    ({ compilePendingFullBuild } = await import("../../../tools/kv-compiler/compiler"));

    // The target database is disposable, so start from a clean slate and make
    // repeated runs deterministic.
    await db.execute(sql`
      do $$
      declare statement text;
      begin
        select 'truncate table ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' restart identity cascade'
          into statement
          from pg_tables
         where schemaname = 'public' and tablename like 'mq\\_%'
           and tablename not in (
             'mq_dict_label_statuses', 'mq_dict_metric_membership_statuses',
             'mq_dict_asset_statuses', 'mq_dict_quality_tiers',
             'mq_dict_flag_bits', 'mq_contract_u1_versions'
           );
        if statement is not null then execute statement; end if;
      end $$;
    `);

    const [user] = await db
      .insert(schema.mqUsers)
      .values({ email: `it-owner-${Date.now()}@mamakquant.local`, displayName: "Integration Owner", role: "owner" })
      .returning();
    actor.id = user.id;
    actor.email = user.email;

    process.env.MQCHAIN_REQUEST_AUDIENCE = originAudience;
    process.env.MQCHAIN_REQUEST_SIGNING_SECRET = originSigningSecret;
    const { handleOriginRequest } = await import("../../../origin/app");
    originServer = createServer(handleOriginRequest);
    await new Promise<void>((resolve, reject) => {
      originServer!.once("error", reject);
      originServer!.listen(0, "127.0.0.1", resolve);
    });
    const address = originServer.address();
    if (!address || typeof address === "string") throw new Error("Origin integration server did not bind a TCP port.");
    originUrl = `http://127.0.0.1:${address.port}`;

    await db.insert(schema.mqCatalogSources).values({
      id: SOURCE_ID,
      sourceCode: `it_source_${SOURCE_ID}`,
      sourceName: "Integration source",
      sourceType: "official",
    });
    await db.insert(schema.mqDictLegacyKeyPrefixes).values({
      prefixCode: 60,
      chainCode: `it_eth_${NETWORK_ID}`,
      chainName: "Integration Ethereum",
      chainFamily: "evm",
      addressFamily: "evm20",
      codec: "evm20_hex",
      payloadLen: 20,
      evmChainId: 1,
    });
    await db.insert(schema.mqDictChainNetworks).values({
      id: NETWORK_ID,
      networkCode: `it_eth_${NETWORK_ID}`,
      networkName: "Integration Ethereum",
      chainFamily: "evm",
      environment: "mainnet",
    });
    await db.insert(schema.mqDictAddressCodecs).values({
      id: CODEC_ID,
      codecCode: `it_evm20_${CODEC_ID}`,
      codecName: "Integration EVM20",
      addressFamily: "evm",
      identifierKind: "wallet_address",
      acceptedFormats: "hex",
      canonicalFormat: "lowercase_hex",
      payloadRule: "exact:20",
      checksumBehavior: "eip55_optional",
      chainFamilyCompatibility: "evm",
      normalizerVersion: "v1",
      status: "production_ready",
    });
    await db.insert(schema.mqDictAddressNamespaces).values({
      id: NAMESPACE_ID,
      namespaceCode: `it_ns_${NAMESPACE_ID}`,
      namespaceName: "Integration namespace",
      chainNetworkId: NETWORK_ID,
      addressCodecId: CODEC_ID,
      addressType: "wallet_address",
    });
    await db.insert(schema.mqDictCategories).values({
      categoryId: CATEGORY_ID,
      categoryCode: `it_cex_${CATEGORY_ID}`,
      categoryName: "Integration CEX",
    });
    await db.insert(schema.mqDictEntities).values({
      id: ENTITY_ID,
      entityCode: `it_kraken_${ENTITY_ID}`,
      entityName: "Integration Kraken",
      entityType: "cex",
      categoryId: CATEGORY_ID,
    });
    await db.insert(schema.mqDictProtocols).values({
      id: PROTOCOL_ID,
      entityId: ENTITY_ID,
      protocolCode: `it_custody_${PROTOCOL_ID}`,
      protocolName: "Integration custody",
    });
    await db.insert(schema.mqDictRoles).values([
      {
        roleId: ROLE_ID,
        roleCode: `it_cex_reserve_${ROLE_ID}`,
        roleName: "Integration reserve wallet",
        categoryId: CATEGORY_ID,
        metricUsageDefault: "cex_flow",
        defaultQualityTier: 1,
        defaultFlags: 5,
      },
      {
        roleId: UNRESOLVED_ROLE_ID,
        roleCode: `it_retired_${UNRESOLVED_ROLE_ID}`,
        roleName: "Integration retired role",
        categoryId: CATEGORY_ID,
        defaultQualityTier: 1,
        defaultFlags: 0,
        isActive: false,
      },
    ]);
    await db.insert(schema.mqDictProtocolComponents).values({
      id: COMPONENT_ID,
      protocolId: PROTOCOL_ID,
      componentCode: `it_vault_${COMPONENT_ID}`,
      componentName: "Integration vault",
      componentType: "contract",
      namespaceId: NAMESPACE_ID,
      addressCodecId: CODEC_ID,
      normalizedPayloadHex: payloadFor(1),
      roleId: ROLE_ID,
      categoryId: CATEGORY_ID,
      confidenceScore: 90,
      qualityTier: 1,
      sourceId: SOURCE_ID,
    });

    const [sourceJob] = await db
      .insert(schema.mqWorkflowSourceJobs)
      .values({ sourceType: "csv_upload", sourceName: "Integration PoR", status: "candidate_created", submittedBy: actor.id })
      .returning();
    sourceJobId = sourceJob.id;

    const [document] = await db
      .insert(schema.mqWorkflowSourceDocuments)
      .values({ sourceJobId, documentType: "csv", originalName: "por.csv", contentHash: "it-hash" })
      .returning();
    sourceDocumentId = document.id;

    // One verified official source scope covering the candidates' sheet.
    await db.insert(schema.mqWorkflowSourceVerifications).values({
      sourceJobId,
      sourceDocumentId,
      verificationScope: "source_sheet",
      sourceSheet: "ETH",
      sourceTrust: "official",
      status: "verified",
      verifiedBy: actor.id,
    });

    // 10 eligible candidates; the first carries a resolved component.
    for (let index = 1; index <= 10; index += 1) {
      const [candidate] = await db
        .insert(schema.mqWorkflowAddressCandidates)
        .values({
          sourceJobId,
          sourceDocumentId,
          rawAddress: `0x${payloadFor(index)}`,
          normalizedAddress: `0x${payloadFor(index)}`,
          chainCode: "ethereum",
          addressFamily: "evm",
          namespaceId: NAMESPACE_ID,
          addressCodecId: CODEC_ID,
          payloadHex: payloadFor(index),
          suggestedEntityId: ENTITY_ID,
          suggestedProtocolId: PROTOCOL_ID,
          suggestedRoleId: ROLE_ID,
          suggestedComponentId: index === 1 ? COMPONENT_ID : null,
          confidenceScore: 95,
          qualityTier: 1,
          candidateStatus: "pending_review",
          evidenceCount: 1,
          metadata: candidateMetadata(),
        })
        .returning();
      eligibleCandidateIds.push(candidate.id);
      await db.insert(schema.mqWorkflowAddressEvidence).values({
        candidateId: candidate.id,
        sourceDocumentId,
        evidenceType: "proof_of_reserve",
        trustTier: "official",
        createdBy: actor.id,
      });
    }

    // 1 unresolved-role candidate (role exists but is retired/inactive).
    const [unresolvedRole] = await db
      .insert(schema.mqWorkflowAddressCandidates)
      .values({
        sourceJobId,
        sourceDocumentId,
        rawAddress: `0x${payloadFor(90)}`,
        normalizedAddress: `0x${payloadFor(90)}`,
        chainCode: "ethereum",
        addressFamily: "evm",
        namespaceId: NAMESPACE_ID,
        addressCodecId: CODEC_ID,
        payloadHex: payloadFor(90),
        suggestedEntityId: ENTITY_ID,
        suggestedRoleId: UNRESOLVED_ROLE_ID,
        confidenceScore: 80,
        qualityTier: 1,
        candidateStatus: "pending_review",
        evidenceCount: 1,
        metadata: candidateMetadata(),
      })
      .returning();
    blockedCandidateIds.push(unresolvedRole.id);
    await db.insert(schema.mqWorkflowAddressEvidence).values({
      candidateId: unresolvedRole.id,
      sourceDocumentId,
      evidenceType: "proof_of_reserve",
      trustTier: "official",
      createdBy: actor.id,
    });

    // 1 duplicate candidate.
    const [duplicate] = await db
      .insert(schema.mqWorkflowAddressCandidates)
      .values({
        sourceJobId,
        sourceDocumentId,
        rawAddress: `0x${payloadFor(1)}`,
        normalizedAddress: `0x${payloadFor(1)}`,
        chainCode: "ethereum",
        addressFamily: "evm",
        namespaceId: NAMESPACE_ID,
        addressCodecId: CODEC_ID,
        payloadHex: payloadFor(1),
        suggestedEntityId: ENTITY_ID,
        suggestedRoleId: ROLE_ID,
        confidenceScore: 95,
        qualityTier: 1,
        candidateStatus: "pending_review",
        duplicateOfCandidateId: eligibleCandidateIds[0],
        evidenceCount: 1,
        metadata: { ...candidateMetadata(), normalizationStatus: "duplicate" },
      })
      .returning();
    blockedCandidateIds.push(duplicate.id);
    await db.insert(schema.mqWorkflowAddressEvidence).values({
      candidateId: duplicate.id,
      sourceDocumentId,
      evidenceType: "proof_of_reserve",
      trustTier: "official",
      createdBy: actor.id,
    });
  }, 120_000);

  afterAll(async () => {
    if (originServer) await new Promise<void>((resolve, reject) => originServer!.close(error => error ? reject(error) : resolve()));
    if (closeDb) await closeDb();
    if (artifactRoot) await rm(artifactRoot, { recursive: true, force: true });
  });

  const selection = () => [...eligibleCandidateIds, ...blockedCandidateIds].sort((left, right) => left - right);

  async function signedOriginPost<T>(pathname: string, body: unknown): Promise<T> {
    const bodyText = serializeOriginBody(body);
    const requestId = randomUUID();
    const encodedActor = encodeOriginActorClaims({ sub: actor.id, email: actor.email, aud: originAudience, iat: Math.floor(Date.now() / 1000), jti: randomUUID() });
    const signature = signOriginRequest({ secret: originSigningSecret, method: "POST", pathAndQuery: pathname, requestId, bodyText, encodedActor });
    const response = await fetch(`${originUrl}${pathname}`, { method: "POST", headers: { "content-type": "application/json", [MQCHAIN_REQUEST_ID_HEADER]: requestId, [MQCHAIN_ACTOR_HEADER]: encodedActor, [MQCHAIN_SIGNATURE_HEADER]: signature }, body: bodyText });
    const payload = parseOriginJson(await response.text());
    if (!response.ok) throw new Error(`Origin ${response.status}: ${JSON.stringify(payload)}`);
    return payload as T;
  }

  it("previews 10 eligible and 2 blocked candidates without writing state", async () => {
    const before = await db.select({ value: sql<number>`count(*)::int` }).from(schema.mqWorkflowApprovalEvents);

    const preview = await runWithOriginActor(actor, () =>
      previewBulkCandidateApproval({ candidateIds: selection(), mode: "eligible_only" }),
    );

    expect(preview.selectedCount).toBe(12);
    expect(preview.eligibleCount).toBe(10);
    expect(preview.blockedCount).toBe(2);
    expect(preview.eligibleCandidateIds.sort((a, b) => a - b)).toEqual([...eligibleCandidateIds].sort((a, b) => a - b));
    expect(preview.blockedCandidates.map((row) => row.candidateId).sort((a, b) => a - b)).toEqual(
      [...blockedCandidateIds].sort((a, b) => a - b),
    );
    expect(preview.previewHash).toMatch(/^[0-9a-f]{64}$/);

    const after = await db.select({ value: sql<number>`count(*)::int` }).from(schema.mqWorkflowApprovalEvents);
    expect(after[0].value).toBe(before[0].value);
  });

  it("rejects a stale preview hash and a changed dictionary version", async () => {
    const preview = await runWithOriginActor(actor, () =>
      previewBulkCandidateApproval({ candidateIds: selection(), mode: "eligible_only" }),
    );

    await expect(
      runWithOriginActor(actor, () =>
        executeBulkCandidateApproval({
          candidateIds: selection(),
          mode: "eligible_only",
          expectedDictionaryVersion: preview.dictionaryVersion,
          expectedPreviewHash: "0".repeat(64),
          expectedCandidateSnapshotHash: preview.candidateSnapshotHash,
          expectedSourceVerificationSnapshotHash: preview.sourceVerificationSnapshotHash,
          reason: "stale hash",
        }),
      ),
    ).rejects.toThrow(/preview/i);

    await expect(
      runWithOriginActor(actor, () =>
        executeBulkCandidateApproval({
          candidateIds: selection(),
          mode: "eligible_only",
          expectedDictionaryVersion: "0".repeat(64),
          expectedPreviewHash: preview.previewHash,
          expectedCandidateSnapshotHash: preview.candidateSnapshotHash,
          expectedSourceVerificationSnapshotHash: preview.sourceVerificationSnapshotHash,
          reason: "stale dictionary",
        }),
      ),
    ).rejects.toThrow(/Dictionary state changed/i);
  });

  it("refuses to approve anything in strict mode when one candidate is blocked", async () => {
    const preview = await runWithOriginActor(actor, () =>
      previewBulkCandidateApproval({ candidateIds: selection(), mode: "strict" }),
    );

    await expect(
      runWithOriginActor(actor, () =>
        executeBulkCandidateApproval({
          candidateIds: selection(),
          mode: "strict",
          expectedDictionaryVersion: preview.dictionaryVersion,
          expectedPreviewHash: preview.previewHash,
          expectedCandidateSnapshotHash: preview.candidateSnapshotHash,
          expectedSourceVerificationSnapshotHash: preview.sourceVerificationSnapshotHash,
          reason: "strict attempt",
        }),
      ),
    ).rejects.toThrow(/Strict mode/i);

    const stillPending = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.mqWorkflowAddressCandidates)
      .where(and(inArray(schema.mqWorkflowAddressCandidates.id, selection()), eq(schema.mqWorkflowAddressCandidates.candidateStatus, "pending_review")));
    expect(stillPending[0].value).toBe(12);
  });

  it("approves only the eligible candidates and leaves blocked ones pending", async () => {
    const preview = await runWithOriginActor(actor, () =>
      previewBulkCandidateApproval({ candidateIds: selection(), mode: "eligible_only" }),
    );

    const result = await runWithOriginActor(actor, () =>
      executeBulkCandidateApproval({
        candidateIds: selection(),
        mode: "eligible_only",
        expectedDictionaryVersion: preview.dictionaryVersion,
        expectedPreviewHash: preview.previewHash,
        expectedCandidateSnapshotHash: preview.candidateSnapshotHash,
        expectedSourceVerificationSnapshotHash: preview.sourceVerificationSnapshotHash,
        reason: "Approved official Kraken PoR source",
      }),
    );

    expect(result.approvedCount).toBe(10);
    expect(result.blockedCount).toBe(2);
    expect(result.batchCreated).toBe(false);
    expect(result.registryRowsCreated).toBe(0);
    expect(result.kvBuildsCreated).toBe(0);

    const approved = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.mqWorkflowAddressCandidates)
      .where(and(inArray(schema.mqWorkflowAddressCandidates.id, eligibleCandidateIds), eq(schema.mqWorkflowAddressCandidates.candidateStatus, "approved")));
    expect(approved[0].value).toBe(10);

    const pending = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.mqWorkflowAddressCandidates)
      .where(and(inArray(schema.mqWorkflowAddressCandidates.id, blockedCandidateIds), eq(schema.mqWorkflowAddressCandidates.candidateStatus, "pending_review")));
    expect(pending[0].value).toBe(2);

    // One approval event per approved candidate, all sharing the bulk operation ID.
    const events = await db
      .select()
      .from(schema.mqWorkflowApprovalEvents)
      .where(inArray(schema.mqWorkflowApprovalEvents.candidateId, eligibleCandidateIds));
    expect(events).toHaveLength(10);
    expect(events.every((event) => (event.metadata as Record<string, unknown>).bulkOperationId === result.bulkOperationId)).toBe(true);

    // Exactly one bulk audit record.
    const auditRows = await db
      .select()
      .from(schema.mqAuditEvents)
      .where(eq(schema.mqAuditEvents.targetId, result.bulkOperationId));
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].action).toBe("candidates_bulk_approved");
    expect((auditRows[0].payload as Record<string, unknown>).approvedCount).toBe(10);

    // No batch, registry row or KV build was created as a side effect.
    const batches = await db.select({ value: sql<number>`count(*)::int` }).from(schema.mqWorkflowLabelBatches);
    expect(batches[0].value).toBe(0);
    const registry = await db.select({ value: sql<number>`count(*)::int` }).from(schema.mqRegistryAddressLabels);
    expect(registry[0].value).toBe(0);
    const builds = await db.select({ value: sql<number>`count(*)::int` }).from(schema.mqBuildKvBuilds);
    expect(builds[0].value).toBe(0);
  });

  it("requires batch approval before commit, then preserves U1 identity and the frozen KV contract", async () => {
    const [priorBatch] = await db.insert(schema.mqWorkflowLabelBatches).values({
      sourceName: "Prior committed batch",
      status: "committed",
      createdBy: actor.id,
      approvedBy: actor.id,
      approvedAt: new Date(),
      committedAt: new Date(),
    }).returning();
    const [priorRegistry] = await db.insert(schema.mqRegistryAddressLabels).values({
      normalizedAddress: `0x${payloadFor(999)}`,
      chainCode: `it_eth_${NETWORK_ID}`,
      prefixCode: 60,
      namespaceId: NAMESPACE_ID,
      addressCodecId: CODEC_ID,
      payloadHex: payloadFor(999),
      entityId: ENTITY_ID,
      categoryId: CATEGORY_ID,
      roleId: ROLE_ID,
      confidenceScore: 90,
      labelStatus: 1,
      qualityTier: 3,
      flags: 1,
      approvedBatchId: priorBatch.id,
      isActive: true,
      validFromBlock: 1,
    }).returning();
    const [metricGroup] = await db.insert(schema.mqDictMetricGroups).values({
      metricGroupCode: `it_cex_flow_${NETWORK_ID}`,
      metricGroupName: "Integration CEX flow",
      chainCode: null,
      minConfidence: 80,
      requireMetricEligible: true,
      isActive: true,
    }).returning();
    await db.insert(schema.mqPolicyMetricGroupRules).values({
      metricGroupId: metricGroup.id,
      ruleVersion: 1,
      ruleJson: { includeRoles: [`it_cex_reserve_${ROLE_ID}`], requireMetricEligible: true },
      status: "active",
      sourceId: SOURCE_ID,
      contentHash: "integration-rule-v1",
    });
    const batch = await runWithOriginActor(actor, () =>
      createBatchFromCandidates({ candidateIds: eligibleCandidateIds.join(","), sourceName: "Integration batch" }),
    );
    expect(batch.status).toBe("pending_approval");

    await expect(runWithOriginActor(actor, () => commitBatch({ batchId: batch.id }))).rejects.toThrow(
      /Only approved batches can be committed/i,
    );

    const approvedBatch = await runWithOriginActor(actor, () => approveBatch({ batchId: batch.id }));
    expect(approvedBatch.status).toBe("approved");

    const commit = await runWithOriginActor(actor, () => commitBatch({ batchId: batch.id }));
    expect(commit.registryIds).toHaveLength(10);

    const registryRows = await db
      .select()
      .from(schema.mqRegistryAddressLabels)
      .where(inArray(schema.mqRegistryAddressLabels.id, commit.registryIds));

    expect(registryRows).toHaveLength(10);
    for (const row of registryRows) {
      expect(row.namespaceId).toBe(NAMESPACE_ID);
      expect(row.addressCodecId).toBe(CODEC_ID);
      expect(row.payloadHex).toMatch(/^[0-9a-f]{40}$/);
      expect(row.roleId).toBe(ROLE_ID);
      expect(row.categoryId).toBe(CATEGORY_ID);
    }
    // The one candidate that carried a resolved component keeps it in registry.
    expect(registryRows.filter((row) => row.componentId === COMPONENT_ID)).toHaveLength(1);

    const [kvBuild] = await db
      .select()
      .from(schema.mqBuildKvBuilds)
      .where(sql`${schema.mqBuildKvBuilds.manifest}->>'triggeringBatchId' = ${String(batch.id)}`);
    const manifest = kvBuild.manifest as Record<string, unknown>;

    expect(kvBuild.dictionaryVersion).toBe(commit.dictionaryVersion);
    expect(manifest.dictionarySchemaVersion).toBe("MQD-U1");
    expect(manifest.keySchemaVersion).toBe("MQK-U1");
    expect(manifest.valueSchemaVersion).toBe("MQV-U1");
    expect(manifest.timelineSchemaVersion).toBe("MQT-U1");
    expect(manifest.metricSchemaVersion).toBe("MQG-U1");
    expect(manifest.registrySnapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest).toMatchObject({
      reason: "full_registry_compile",
      compileScope: "full",
      triggeringBatchId: batch.id,
      lastCommittedBatchId: batch.id,
    });
    expect(manifest.expectedCounts).toMatchObject({
      addressLabelCurrent: 11,
      addressLabelTimeline: 1,
      metricGroupMembership: 11,
    });
    expect(manifest.artifactStatus).toBe("pending_external_compile");
    expect(manifest.registryIds).toEqual([priorRegistry.id, ...commit.registryIds].sort((left, right) => left - right));

    // The recorded build hash is reproducible from the stored manifest alone.
    expect(computeFullKvBuildRequestHash(manifest as never)).toBe(kvBuild.buildHash);
    pendingBuildId = kvBuild.id;
  });

  it("compiles once, persists exact bytes, proves three-way parity, and registers without activation", async () => {
    artifactRoot = await mkdtemp(path.join(tmpdir(), "mqchain-u1-e2e-"));
    const compiled = await compilePendingFullBuild(pendingBuildId, artifactRoot);
    const parity = await signedOriginPost<Awaited<ReturnType<typeof import("@/lib/mqchain/services/compiled-artifact-service").runCompiledArtifactParity>>>("/v1/kv-builds/compiled/parity", { artifactDirectory: compiled.artifactDirectory });
    expect(parity.report.passed).toBe(true);
    expect(parity.report.indexes.address_label_current).toMatchObject({ canonicalRows: 11, postgresCompiledRows: 11, rocksDbRows: 11, passed: true });
    expect(parity.report.indexes.address_label_timeline).toMatchObject({ canonicalRows: 1, postgresCompiledRows: 1, rocksDbRows: 1, passed: true });
    expect(parity.report.indexes.metric_group_membership).toMatchObject({ canonicalRows: 11, postgresCompiledRows: 11, rocksDbRows: 11, passed: true });

    const retriedParity = await signedOriginPost<Awaited<ReturnType<typeof import("@/lib/mqchain/services/compiled-artifact-service").runCompiledArtifactParity>>>("/v1/kv-builds/compiled/parity", { artifactDirectory: compiled.artifactDirectory });
    expect(retriedParity.build.id).toBe(parity.build.id);
    expect(retriedParity.report.passed).toBe(true);
    expect(await db.select().from(schema.mqBuildCompiledEntries).where(eq(schema.mqBuildCompiledEntries.buildId, parity.build.id))).toHaveLength(23);

    const registered = await signedOriginPost<Awaited<ReturnType<typeof import("@/lib/mqchain/services/compiled-artifact-service").registerCompiledArtifact>>>("/v1/kv-builds/compiled/register", { artifactDirectory: compiled.artifactDirectory });
    expect(registered.build.status).toBe("compiled");
    expect(registered.build.compileRequestBuildId).toBe(pendingBuildId);
    expect(registered.validation.status).toBe("passed");
    compiledBuildId = registered.build.id;
    compiledBuildHash = registered.build.buildHash;
    compiledDictionaryVersion = registered.build.dictionaryVersion ?? "";
    compiledRegistrySnapshotHash = String(registered.build.manifest.registrySnapshotHash ?? "");
    compiledValidationRunId = registered.validation.id;
    compiledValidationReportHash = registered.validation.reportHash;
    const persisted = await db.select().from(schema.mqBuildCompiledEntries).where(eq(schema.mqBuildCompiledEntries.buildId, registered.build.id)).orderBy(schema.mqBuildCompiledEntries.indexName, schema.mqBuildCompiledEntries.ordinal);
    expect(persisted).toHaveLength(23);
    expect(persisted.filter(row => row.indexName === "address_label_current").every(row => row.valueBytes.length === 56)).toBe(true);
    expect(persisted.filter(row => row.indexName === "address_label_timeline").every(row => row.valueBytes.length === 64)).toBe(true);
    expect(persisted.filter(row => row.indexName === "metric_group_membership").every(row => row.valueBytes.length === 24)).toBe(true);
    const ordinalsByIndex = new Map<string, number[]>();
    for (const row of persisted) ordinalsByIndex.set(row.indexName, [...(ordinalsByIndex.get(row.indexName) ?? []), row.ordinal]);
    for (const ordinals of ordinalsByIndex.values()) expect(ordinals).toEqual(ordinals.map((_, index) => index));
    const preflight = buildKvManifestActivationPreflight(registered.build);
    expect(preflight.canActivate).toBe(true);
    const active = await db.select().from(schema.mqBuildKvBuilds).where(eq(schema.mqBuildKvBuilds.status, "active"));
    expect(active).toHaveLength(0);
    const [requestBuild] = await db.select().from(schema.mqBuildKvBuilds).where(eq(schema.mqBuildKvBuilds.id, pendingBuildId));
    expect(requestBuild.status).toBe("pending");
    const registeredAgain = await signedOriginPost<Awaited<ReturnType<typeof import("@/lib/mqchain/services/compiled-artifact-service").registerCompiledArtifact>>>("/v1/kv-builds/compiled/register", { artifactDirectory: compiled.artifactDirectory });
    expect(registeredAgain).toMatchObject({ idempotent: true, build: { id: registered.build.id, status: "compiled" } });

    process.stdout.write(`${JSON.stringify({
      event: "u1_e2e_evidence",
      compileRequestBuildId: pendingBuildId,
      compiledBuildId: registered.build.id,
      artifactHash: compiled.manifest.artifactHash,
      recordsHash: compiled.manifest.recordsHash,
      indexHashes: Object.fromEntries(Object.entries(compiled.manifest.indexes).map(([name, value]) => [name, value.hash])),
      rowCounts: compiled.manifest.expectedCounts,
      validationRunId: retriedParity.validation.id,
      validationStatus: retriedParity.validation.status,
      activationPreflightPassed: preflight.canActivate,
      activeBuildCount: active.length,
    })}\n`);
  });

  it("rejects protected Build 5 and permits one explicit disposable-only manual activation", async () => {
    await db.insert(schema.mqBuildKvBuilds).values({
      id: 5,
      buildHash: "5".repeat(64),
      status: "pending",
      rowCount: 0,
      manifest: { syntheticBuild5: true },
    });
    await expect(signedOriginPost(`/v1/kv-builds/5/activate`, {
      buildId: 5,
      expectedBuildHash: "5".repeat(64),
      expectedDictionaryVersion: "synthetic",
      expectedRegistrySnapshotHash: "5".repeat(64),
      expectedCurrentActiveBuildId: null,
      expectedValidationRunId: 1,
      expectedValidationReportHash: "5".repeat(64),
    })).rejects.toThrow(/protected historical build/i);
    const [protectedBuild] = await db.select().from(schema.mqBuildKvBuilds).where(eq(schema.mqBuildKvBuilds.id, 5));
    expect(protectedBuild).toMatchObject({ id: 5, status: "pending", buildHash: "5".repeat(64) });

    const activated = await signedOriginPost<typeof protectedBuild>(`/v1/kv-builds/${compiledBuildId}/activate`, {
      buildId: compiledBuildId,
      expectedBuildHash: compiledBuildHash,
      expectedDictionaryVersion: compiledDictionaryVersion,
      expectedRegistrySnapshotHash: compiledRegistrySnapshotHash,
      expectedCurrentActiveBuildId: null,
      expectedValidationRunId: compiledValidationRunId,
      expectedValidationReportHash: compiledValidationReportHash,
    });
    expect(activated).toMatchObject({ id: compiledBuildId, status: "active" });
    const active = await db.select().from(schema.mqBuildKvBuilds).where(eq(schema.mqBuildKvBuilds.status, "active"));
    expect(active.map((build) => build.id)).toEqual([compiledBuildId]);
  });
});
