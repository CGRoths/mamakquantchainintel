import { and, eq, inArray, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqWorkflowAddressCandidates,
  mqDictAddressCodecs,
  mqWorkflowAddressEvidence,
  mqDictAddressNamespaces,
  mqRegistryAddressLabels,
  mqDictEntities,
  mqDictRoles,
  mqDictProtocolComponents,
  mqDictProtocols,
  mqPolicyRoleApprovalRequirements,
  mqWorkflowSourceVerifications,
  mqWorkflowSourceJobs,
} from "@/db/schema";

import { buildCandidateSourceVerificationContext } from "../candidate-detail";
import { evaluateCandidateApproval, type CandidateApprovalEvaluation } from "../candidate-approval";
import { registryTargetsConflict } from "../registry-conflicts";
import { hashJson } from "./service-utils";

type Db = ReturnType<typeof getDb>;
export type ApprovalEvaluationReader = Pick<Db, "select">;

export type CandidateApprovalEvaluationBundle = {
  candidateIds: number[];
  evaluations: CandidateApprovalEvaluation[];
  candidatesById: Map<number, typeof mqWorkflowAddressCandidates.$inferSelect>;
  sourceVerificationStatusById: Map<number, string>;
  evidenceCountById: Map<number, number>;
  sourceJobIds: number[];
  dictionaryVersion: string;
  candidateSnapshotHash: string;
  sourceVerificationSnapshotHash: string;
  previewHash: string;
};

function uniqueIds(values: Array<number | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is number => typeof value === "number" && value > 0)));
}

/**
 * Load candidates plus all approval context in a fixed number of batched
 * queries — never one query per candidate — and evaluate each against the
 * single shared approval rule set.
 *
 * Shared by approveCandidateAsSuggested(), bulk approval preview, and bulk
 * approval execution so the rules can never drift apart.
 */
export async function buildCandidateApprovalEvaluations(input: {
  reader: ApprovalEvaluationReader;
  candidateIds: number[];
  dictionaryVersion: string;
  /** SELECT ... FOR UPDATE. Only valid inside a transaction. */
  lockRows: boolean;
  /** Included in previewHash so a mode switch cannot reuse another mode's hash. */
  mode?: string;
  selectionScope?: Readonly<Record<string, unknown>>;
  approvalKind?: "individual" | "bulk";
}): Promise<CandidateApprovalEvaluationBundle> {
  const { reader, candidateIds, dictionaryVersion, lockRows } = input;
  const candidateQuery = reader.select().from(mqWorkflowAddressCandidates).where(inArray(mqWorkflowAddressCandidates.id, candidateIds));
  const candidates = lockRows
    ? await (candidateQuery as unknown as {
        for(strength: "update"): Promise<(typeof mqWorkflowAddressCandidates.$inferSelect)[]>;
      }).for("update")
    : await candidateQuery;
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  const presentIds = candidates.map((candidate) => candidate.id);
  const sourceJobIds = uniqueIds(candidates.map((candidate) => candidate.sourceJobId));
  const sourceDocumentIds = uniqueIds(candidates.map((candidate) => candidate.sourceDocumentId));
  const entityIds = uniqueIds(candidates.map((candidate) => candidate.suggestedEntityId));
  const protocolIds = uniqueIds(candidates.map((candidate) => candidate.suggestedProtocolId));
  const roleIds = uniqueIds(candidates.map((candidate) => candidate.suggestedRoleId));
  const componentIds = uniqueIds(candidates.map((candidate) => candidate.suggestedComponentId));
  const namespaceIds = uniqueIds(candidates.map((candidate) => candidate.namespaceId));
  const codecIds = uniqueIds(candidates.map((candidate) => candidate.addressCodecId));
  const normalizedAddresses = Array.from(
    new Set(candidates.map((candidate) => candidate.normalizedAddress).filter((value): value is string => Boolean(value))),
  );

  if (lockRows && sourceJobIds.length) {
    await reader
      .select({ id: mqWorkflowSourceJobs.id })
      .from(mqWorkflowSourceJobs)
      .where(inArray(mqWorkflowSourceJobs.id, sourceJobIds))
      .for("update");
  }

  const verificationConditions = [
    presentIds.length ? inArray(mqWorkflowSourceVerifications.candidateId, presentIds) : undefined,
    sourceJobIds.length ? inArray(mqWorkflowSourceVerifications.sourceJobId, sourceJobIds) : undefined,
    sourceDocumentIds.length ? inArray(mqWorkflowSourceVerifications.sourceDocumentId, sourceDocumentIds) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const verificationQuery = verificationConditions.length
    ? reader.select().from(mqWorkflowSourceVerifications).where(or(...verificationConditions))
    : null;
  const verificationRows = verificationQuery
    ? lockRows
      ? await (verificationQuery as unknown as {
          for(strength: "update"): Promise<(typeof mqWorkflowSourceVerifications.$inferSelect)[]>;
        }).for("update")
      : await verificationQuery
    : [];

  const [
    evidenceCounts,
    entities,
    protocols,
    roles,
    rolePolicies,
    components,
    namespaces,
    codecs,
    registryRows,
  ] = await Promise.all([
    presentIds.length
      ? reader
          .select({ candidateId: mqWorkflowAddressEvidence.candidateId, value: sql<number>`count(*)::int` })
          .from(mqWorkflowAddressEvidence)
          .where(inArray(mqWorkflowAddressEvidence.candidateId, presentIds))
          .groupBy(mqWorkflowAddressEvidence.candidateId)
      : Promise.resolve([]),
    entityIds.length ? reader.select().from(mqDictEntities).where(inArray(mqDictEntities.id, entityIds)) : Promise.resolve([]),
    protocolIds.length ? reader.select().from(mqDictProtocols).where(inArray(mqDictProtocols.id, protocolIds)) : Promise.resolve([]),
    roleIds.length ? reader.select().from(mqDictRoles).where(inArray(mqDictRoles.roleId, roleIds)) : Promise.resolve([]),
    roleIds.length
      ? reader.select().from(mqPolicyRoleApprovalRequirements).where(inArray(mqPolicyRoleApprovalRequirements.roleId, roleIds))
      : Promise.resolve([]),
    componentIds.length
      ? reader.select().from(mqDictProtocolComponents).where(inArray(mqDictProtocolComponents.id, componentIds))
      : Promise.resolve([]),
    namespaceIds.length
      ? reader.select().from(mqDictAddressNamespaces).where(inArray(mqDictAddressNamespaces.id, namespaceIds))
      : Promise.resolve([]),
    codecIds.length ? reader.select().from(mqDictAddressCodecs).where(inArray(mqDictAddressCodecs.id, codecIds)) : Promise.resolve([]),
    normalizedAddresses.length
      ? reader
          .select()
          .from(mqRegistryAddressLabels)
          .where(and(inArray(mqRegistryAddressLabels.normalizedAddress, normalizedAddresses), eq(mqRegistryAddressLabels.isActive, true)))
      : Promise.resolve([]),
  ]);

  const evidenceCountById = new Map(evidenceCounts.map((row) => [row.candidateId as number, row.value]));
  const entityById = new Map(entities.map((row) => [row.id, row]));
  const protocolById = new Map(protocols.map((row) => [row.id, row]));
  const roleById = new Map(roles.map((row) => [row.roleId, row]));
  const rolePolicyById = new Map(rolePolicies.map((row) => [row.roleId, row]));
  const componentById = new Map(components.map((row) => [row.id, row]));
  const namespaceById = new Map(namespaces.map((row) => [row.id, row]));
  const codecById = new Map(codecs.map((row) => [row.id, row]));

  const evaluations: CandidateApprovalEvaluation[] = [];
  const sourceVerificationStatusById = new Map<number, string>();

  for (const candidateId of candidateIds) {
    const candidate = candidatesById.get(candidateId);
    if (!candidate) {
      evaluations.push({
        candidateId,
        eligible: false,
        blockers: ["candidate_not_found"],
        metricEligible: false,
        metricBlockers: [],
        draft: null,
      });
      continue;
    }

    const verificationContext = buildCandidateSourceVerificationContext({
      candidate: {
        id: candidate.id,
        sourceJobId: candidate.sourceJobId,
        sourceDocumentId: candidate.sourceDocumentId,
        metadata: candidate.metadata,
      },
      verifications: verificationRows.filter((verification) => {
        if (verification.candidateId === candidate.id) return true;
        if (candidate.sourceDocumentId && verification.sourceDocumentId === candidate.sourceDocumentId) return true;
        return Boolean(candidate.sourceJobId && verification.sourceJobId === candidate.sourceJobId);
      }),
    });
    sourceVerificationStatusById.set(candidate.id, verificationContext.status);

    const candidateChainCode = candidate.chainCode;
    const candidateNormalizedAddress = candidate.normalizedAddress;
    const candidateRoleId = candidate.suggestedRoleId;
    const conflicting =
      candidateChainCode && candidateNormalizedAddress && candidateRoleId
        ? registryRows.find((registryRow) =>
            registryTargetsConflict(
              {
                id: registryRow.id,
                chainCode: registryRow.chainCode,
                normalizedAddress: registryRow.normalizedAddress,
                roleId: registryRow.roleId ?? -1,
                validFromBlock: registryRow.validFromBlock,
                isActive: registryRow.isActive,
              },
              {
                chainCode: candidateChainCode,
                normalizedAddress: candidateNormalizedAddress,
                roleId: candidateRoleId,
                validFromBlock: null,
                isActive: true,
              },
            ),
          ) ?? null
        : null;

    const rolePolicy = candidate.suggestedRoleId ? rolePolicyById.get(candidate.suggestedRoleId) : null;
    evaluations.push(
      evaluateCandidateApproval(
        {
          id: candidate.id,
          candidateStatus: candidate.candidateStatus,
          chainCode: candidate.chainCode,
          normalizedAddress: candidate.normalizedAddress,
          namespaceId: candidate.namespaceId,
          addressCodecId: candidate.addressCodecId,
          payloadHex: candidate.payloadHex,
          prefixCode: candidate.prefixCode,
          suggestedEntityId: candidate.suggestedEntityId,
          suggestedProtocolId: candidate.suggestedProtocolId,
          suggestedRoleId: candidate.suggestedRoleId,
          suggestedComponentId: candidate.suggestedComponentId,
          confidenceScore: candidate.confidenceScore,
          qualityTier: candidate.qualityTier,
          firstSeenBlock: candidate.firstSeenBlock,
          lastSeenBlock: candidate.lastSeenBlock,
          metadata: candidate.metadata,
        },
        {
          evidenceCount: evidenceCountById.get(candidate.id) ?? 0,
          sourceVerificationStatus: verificationContext.status,
          matchingTrustTiers: verificationContext.matchingTrustTiers ?? [],
          entity: candidate.suggestedEntityId ? entityById.get(candidate.suggestedEntityId) ?? null : null,
          protocol: candidate.suggestedProtocolId ? protocolById.get(candidate.suggestedProtocolId) ?? null : null,
          role: candidate.suggestedRoleId ? roleById.get(candidate.suggestedRoleId) ?? null : null,
          component: candidate.suggestedComponentId ? componentById.get(candidate.suggestedComponentId) ?? null : null,
          u1Context: {
            namespace: candidate.namespaceId ? namespaceById.get(candidate.namespaceId) ?? null : null,
            codec: candidate.addressCodecId ? codecById.get(candidate.addressCodecId) ?? null : null,
          },
          activeDictionaryVersion: dictionaryVersion,
          conflictingRegistryLabelId: conflicting?.id ?? null,
          componentRequired: rolePolicy?.isActive ? rolePolicy.requireComponent : false,
          minimumConfidence: rolePolicy?.isActive ? rolePolicy.minimumConfidence : 0,
          allowBulkApproval: rolePolicy?.isActive ? rolePolicy.allowBulkApproval : true,
          approvalKind: input.approvalKind ?? "individual",
        },
      ),
    );
  }

  // Deterministic over selection, candidate state, resolution and mode only.
  // Never over wall-clock time.
  const candidateSnapshotHash = hashJson({
    contract: "MQCHAIN-CANDIDATE-APPROVAL-SNAPSHOT-1",
    candidates: candidateIds.map((candidateId) => {
      const candidate = candidatesById.get(candidateId);
      const evaluation = evaluations.find((item) => item.candidateId === candidateId);
      return {
        candidateId,
        candidate: candidate
          ? {
              candidateStatus: candidate.candidateStatus,
              sourceJobId: candidate.sourceJobId,
              sourceDocumentId: candidate.sourceDocumentId,
              chainCode: candidate.chainCode,
              normalizedAddress: candidate.normalizedAddress,
              namespaceId: candidate.namespaceId,
              addressCodecId: candidate.addressCodecId,
              payloadHex: candidate.payloadHex,
              suggestedEntityId: candidate.suggestedEntityId,
              suggestedProtocolId: candidate.suggestedProtocolId,
              suggestedRoleId: candidate.suggestedRoleId,
              suggestedComponentId: candidate.suggestedComponentId,
              confidenceScore: candidate.confidenceScore,
              qualityTier: candidate.qualityTier,
              firstSeenBlock: candidate.firstSeenBlock,
              lastSeenBlock: candidate.lastSeenBlock,
              metadata: candidate.metadata,
              updatedAt: candidate.updatedAt.toISOString(),
            }
          : null,
        evidenceCount: evidenceCountById.get(candidateId) ?? 0,
        eligible: evaluation?.eligible ?? false,
        blockers: evaluation?.blockers ?? ["candidate_not_found"],
        draft: evaluation?.draft ?? null,
      };
    }),
  });
  const sourceVerificationSnapshotHash = hashJson({
    contract: "MQCHAIN-SOURCE-VERIFICATION-SNAPSHOT-1",
    verifications: [...verificationRows]
      .sort((left, right) => left.id - right.id)
      .map((verification) => ({
        id: verification.id,
        sourceJobId: verification.sourceJobId,
        sourceDocumentId: verification.sourceDocumentId,
        candidateId: verification.candidateId,
        verificationScope: verification.verificationScope,
        sourceSheet: verification.sourceSheet,
        sourceUrl: verification.sourceUrl,
        sourceTrust: verification.sourceTrust,
        status: verification.status,
        verificationEvidence: verification.verificationEvidence,
        createdAt: verification.createdAt.toISOString(),
      })),
  });
  const previewHash = hashJson({
    contract: "MQCHAIN-BULK-APPROVAL-PREVIEW-1",
    mode: input.mode ?? null,
    selectionScope: input.selectionScope ?? null,
    dictionaryVersion,
    candidateIds,
    candidateSnapshotHash,
    sourceVerificationSnapshotHash,
  });

  return {
    candidateIds,
    evaluations,
    candidatesById,
    sourceVerificationStatusById,
    evidenceCountById,
    sourceJobIds: sourceJobIds.sort((left, right) => left - right),
    dictionaryVersion,
    candidateSnapshotHash,
    sourceVerificationSnapshotHash,
    previewHash,
  };
}
