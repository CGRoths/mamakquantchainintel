import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressCandidates,
  mqAddressCodecs,
  mqAddressEvidence,
  mqAddressNamespaces,
  mqAddressRegistry,
  mqEntities,
  mqKvRoleDict,
  mqProtocolComponents,
  mqProtocols,
  mqSourceVerifications,
  mqSourceJobs,
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
  candidatesById: Map<number, typeof mqAddressCandidates.$inferSelect>;
  sourceVerificationStatusById: Map<number, string>;
  evidenceCountById: Map<number, number>;
  sourceJobIds: number[];
  dictionaryVersion: string;
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
}): Promise<CandidateApprovalEvaluationBundle> {
  const { reader, candidateIds, dictionaryVersion, lockRows } = input;
  const candidateQuery = reader.select().from(mqAddressCandidates).where(inArray(mqAddressCandidates.id, candidateIds));
  const candidates = lockRows
    ? await (candidateQuery as unknown as {
        for(strength: "update"): Promise<(typeof mqAddressCandidates.$inferSelect)[]>;
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
      .select({ id: mqSourceJobs.id })
      .from(mqSourceJobs)
      .where(inArray(mqSourceJobs.id, sourceJobIds))
      .for("update");
  }

  const [
    evidenceCounts,
    candidateVerifications,
    jobVerifications,
    documentVerifications,
    entities,
    protocols,
    roles,
    components,
    namespaces,
    codecs,
    registryRows,
  ] = await Promise.all([
    presentIds.length
      ? reader
          .select({ candidateId: mqAddressEvidence.candidateId, value: sql<number>`count(*)::int` })
          .from(mqAddressEvidence)
          .where(inArray(mqAddressEvidence.candidateId, presentIds))
          .groupBy(mqAddressEvidence.candidateId)
      : Promise.resolve([]),
    presentIds.length
      ? reader.select().from(mqSourceVerifications).where(inArray(mqSourceVerifications.candidateId, presentIds))
      : Promise.resolve([]),
    sourceJobIds.length
      ? reader.select().from(mqSourceVerifications).where(inArray(mqSourceVerifications.sourceJobId, sourceJobIds))
      : Promise.resolve([]),
    sourceDocumentIds.length
      ? reader.select().from(mqSourceVerifications).where(inArray(mqSourceVerifications.sourceDocumentId, sourceDocumentIds))
      : Promise.resolve([]),
    entityIds.length ? reader.select().from(mqEntities).where(inArray(mqEntities.id, entityIds)) : Promise.resolve([]),
    protocolIds.length ? reader.select().from(mqProtocols).where(inArray(mqProtocols.id, protocolIds)) : Promise.resolve([]),
    roleIds.length ? reader.select().from(mqKvRoleDict).where(inArray(mqKvRoleDict.roleId, roleIds)) : Promise.resolve([]),
    componentIds.length
      ? reader.select().from(mqProtocolComponents).where(inArray(mqProtocolComponents.id, componentIds))
      : Promise.resolve([]),
    namespaceIds.length
      ? reader.select().from(mqAddressNamespaces).where(inArray(mqAddressNamespaces.id, namespaceIds))
      : Promise.resolve([]),
    codecIds.length ? reader.select().from(mqAddressCodecs).where(inArray(mqAddressCodecs.id, codecIds)) : Promise.resolve([]),
    normalizedAddresses.length
      ? reader
          .select()
          .from(mqAddressRegistry)
          .where(and(inArray(mqAddressRegistry.normalizedAddress, normalizedAddresses), eq(mqAddressRegistry.isActive, true)))
      : Promise.resolve([]),
  ]);

  const evidenceCountById = new Map(evidenceCounts.map((row) => [row.candidateId as number, row.value]));
  const entityById = new Map(entities.map((row) => [row.id, row]));
  const protocolById = new Map(protocols.map((row) => [row.id, row]));
  const roleById = new Map(roles.map((row) => [row.roleId, row]));
  const componentById = new Map(components.map((row) => [row.id, row]));
  const namespaceById = new Map(namespaces.map((row) => [row.id, row]));
  const codecById = new Map(codecs.map((row) => [row.id, row]));

  const verifications = new Map<number, typeof mqSourceVerifications.$inferSelect>();
  for (const rows of [candidateVerifications, jobVerifications, documentVerifications]) {
    for (const verification of rows) verifications.set(verification.id, verification);
  }
  const verificationRows = Array.from(verifications.values());

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
        },
      ),
    );
  }

  // Deterministic over selection, candidate state, resolution and mode only.
  // Never over wall-clock time.
  const previewHash = hashJson({
    contract: "MQCHAIN-BULK-APPROVAL-PREVIEW-1",
    mode: input.mode ?? null,
    dictionaryVersion,
    candidates: candidateIds.map((candidateId) => {
      const candidate = candidatesById.get(candidateId);
      return {
        candidateId,
        present: Boolean(candidate),
        candidateStatus: candidate?.candidateStatus ?? null,
        updatedAt: candidate?.updatedAt?.toISOString() ?? null,
        suggestedEntityId: candidate?.suggestedEntityId ?? null,
        suggestedProtocolId: candidate?.suggestedProtocolId ?? null,
        suggestedRoleId: candidate?.suggestedRoleId ?? null,
        suggestedComponentId: candidate?.suggestedComponentId ?? null,
        namespaceId: candidate?.namespaceId ?? null,
        addressCodecId: candidate?.addressCodecId ?? null,
        payloadHex: candidate?.payloadHex ?? null,
        evidenceCount: evidenceCountById.get(candidateId) ?? 0,
        sourceVerificationStatus: sourceVerificationStatusById.get(candidateId) ?? null,
      };
    }),
  });

  return {
    candidateIds,
    evaluations,
    candidatesById,
    sourceVerificationStatusById,
    evidenceCountById,
    sourceJobIds: sourceJobIds.sort((left, right) => left - right),
    dictionaryVersion,
    previewHash,
  };
}
