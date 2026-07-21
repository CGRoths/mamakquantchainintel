import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  mqAddressCandidates,
  mqAuditLog,
  mqCategoryDict,
  mqDictionaryIdRanges,
  mqDictionaryProposals,
  mqEntities,
  mqKvRoleDict,
  mqNameAliases,
  mqProtocolComponents,
  mqProtocols,
  mqTagDict,
} from "@/db/schema";
import { assertPermission } from "@/lib/mqchain/origin-only/actor-context";

import { dictionaryProposalCreateSchema, dictionaryProposalReviewSchema, dictionaryReresolutionSchema } from "../validators/dictionary-proposal";
import { hashJson, optionalNumber } from "./service-utils";
import { getResearchDictionarySnapshot, recordDictionaryVersion } from "./dictionary-service";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function allocateStableId(tx: Tx, dictionaryKind: string) {
  const ranges = await tx.select().from(mqDictionaryIdRanges)
    .where(and(eq(mqDictionaryIdRanges.dictionaryKind, dictionaryKind), eq(mqDictionaryIdRanges.status, "active")))
    .orderBy(asc(mqDictionaryIdRanges.id)).for("update");
  const range = ranges.find(value => value.rangeCode.startsWith("u1_")) ?? ranges[0];
  if (!range || range.nextId > range.endId) throw new Error(`dictionary_id_range_exhausted:${dictionaryKind}`);
  await tx.update(mqDictionaryIdRanges).set({ nextId: range.nextId + 1, updatedAt: new Date() }).where(eq(mqDictionaryIdRanges.id, range.id));
  return range.nextId;
}

async function recordTransactionalDictionaryVersion(tx: Tx, actorId: string, proposalId: number) {
  return recordDictionaryVersion(actorId, `dictionary_proposal_applied:${proposalId}`, tx);
}

async function applyProposal(tx: Tx, proposal: typeof mqDictionaryProposals.$inferSelect) {
  const values = proposal.proposedValues;
  if (proposal.proposalKind === "network" || proposal.proposalKind === "codec") {
    throw new Error(`${proposal.proposalKind}_proposal_requires_specialized_network_workflow`);
  }
  if (proposal.proposalKind === "entity") {
    const id = await allocateStableId(tx, "entity");
    await tx.insert(mqEntities).values({ id, entityCode: proposal.proposedCode, entityName: proposal.proposedName, entityType: text(values.entityType), categoryId: optionalNumber(values.categoryId), websiteUrl: text(values.websiteUrl), description: text(values.description) });
    return { subjectKind: "entity", subjectId: id };
  }
  if (proposal.proposalKind === "protocol") {
    const id = await allocateStableId(tx, "protocol");
    const entityId = optionalNumber(values.entityId);
    if (!entityId) throw new Error("protocol_proposal_requires_entity_id");
    await tx.insert(mqProtocols).values({ id, entityId, protocolCode: proposal.proposedCode, protocolName: proposal.proposedName, protocolType: text(values.protocolType), chainScope: Array.isArray(values.chainScope) ? values.chainScope.map(String) : undefined, description: text(values.description) });
    return { subjectKind: "protocol", subjectId: id };
  }
  if (proposal.proposalKind === "category") {
    const id = await allocateStableId(tx, "category");
    await tx.insert(mqCategoryDict).values({ categoryId: id, categoryCode: proposal.proposedCode, categoryName: proposal.proposedName, parentCategoryId: optionalNumber(values.parentCategoryId), domainCode: text(values.domainCode), metricDomain: text(values.metricDomain), description: text(values.description) });
    return { subjectKind: "category", subjectId: id };
  }
  if (proposal.proposalKind === "role") {
    const id = await allocateStableId(tx, "role");
    await tx.insert(mqKvRoleDict).values({ roleId: id, roleCode: proposal.proposedCode, roleName: proposal.proposedName, categoryId: optionalNumber(values.categoryId), roleGroup: text(values.roleGroup), metricUsageDefault: text(values.metricUsageDefault), boundaryClass: text(values.boundaryClass), defaultQualityTier: optionalNumber(values.defaultQualityTier) ?? 1, defaultFlags: optionalNumber(values.defaultFlags) ?? 0, description: text(values.description) });
    return { subjectKind: "role", subjectId: id };
  }
  if (proposal.proposalKind === "tag") {
    const id = await allocateStableId(tx, "tag");
    await tx.insert(mqTagDict).values({ id, tagCode: proposal.proposedCode, tagName: proposal.proposedName, tagGroup: text(values.tagGroup), sourceId: optionalNumber(values.sourceId) });
    return { subjectKind: "tag", subjectId: id };
  }
  if (proposal.proposalKind === "alias") {
    const subjectKind = text(proposal.targetReferences.subjectKind);
    const subjectId = optionalNumber(proposal.targetReferences.subjectId);
    if (!subjectKind || !subjectId) throw new Error("alias_proposal_requires_subject_target");
    const [alias] = await tx.insert(mqNameAliases).values({ subjectKind, subjectId, alias: proposal.proposedName, normalizedAlias: proposal.proposedName.trim().toLowerCase().replace(/[_\s]+/g, "-") }).returning({ id: mqNameAliases.id });
    return { subjectKind: "alias", subjectId: alias.id };
  }
  if (proposal.proposalKind === "component") {
    const id = await allocateStableId(tx, "component");
    const required = {
      protocolId: optionalNumber(values.protocolId), namespaceId: optionalNumber(values.namespaceId),
      addressCodecId: optionalNumber(values.addressCodecId), roleId: optionalNumber(values.roleId),
      categoryId: optionalNumber(values.categoryId), sourceId: optionalNumber(values.sourceId),
    };
    if (Object.values(required).some(value => !value) || !text(values.normalizedPayloadHex)) throw new Error("component_proposal_missing_required_values");
    await tx.insert(mqProtocolComponents).values({
      id, protocolId: required.protocolId!, deploymentId: optionalNumber(values.deploymentId),
      componentCode: proposal.proposedCode, componentName: proposal.proposedName,
      componentType: text(values.componentType) ?? "contract", namespaceId: required.namespaceId!,
      addressCodecId: required.addressCodecId!, normalizedPayloadHex: text(values.normalizedPayloadHex)!,
      roleId: required.roleId!, categoryId: required.categoryId!, confidenceScore: optionalNumber(values.confidenceScore) ?? 0,
      qualityTier: optionalNumber(values.qualityTier) ?? 0, validFromHeight: optionalNumber(values.validFromHeight),
      sourceId: required.sourceId!, notes: text(values.notes),
    });
    return { subjectKind: "component", subjectId: id };
  }
  throw new Error("unsupported_dictionary_proposal_kind");
}

export async function listDictionaryProposals() {
  await assertPermission("view");
  return getDb().select().from(mqDictionaryProposals).orderBy(sql`${mqDictionaryProposals.createdAt} desc`, sql`${mqDictionaryProposals.id} desc`);
}

export async function createDictionaryProposal(input: unknown) {
  const actor = await assertPermission("intake:create");
  const parsed = dictionaryProposalCreateSchema.parse(input);
  return getDb().transaction(async tx => {
    const [proposal] = await tx.insert(mqDictionaryProposals).values({ ...parsed, requestedBy: actor.id }).returning();
    await tx.insert(mqAuditLog).values({ actorId: actor.id, action: "dictionary_proposal_created", targetTable: "mq_dictionary_proposals", targetId: String(proposal.id), payload: { proposalKind: proposal.proposalKind, proposedCode: proposal.proposedCode, sourceJobId: proposal.sourceJobId } });
    return proposal;
  });
}

export async function reviewDictionaryProposal(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = dictionaryProposalReviewSchema.parse(input);
  return getDb().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(70424101)`);
    const [proposal] = await tx.select().from(mqDictionaryProposals).where(eq(mqDictionaryProposals.id, parsed.proposalId)).for("update").limit(1);
    if (!proposal) throw new Error("Dictionary proposal not found.");
    if (parsed.action === "approve" || parsed.action === "reject") {
      if (proposal.status !== "pending") throw new Error("Only pending proposals can be reviewed.");
      const status = parsed.action === "approve" ? "approved" : "rejected";
      const [updated] = await tx.update(mqDictionaryProposals).set({ status, reviewedBy: actor.id, reviewNotes: parsed.reviewNotes, reviewedAt: new Date() }).where(eq(mqDictionaryProposals.id, proposal.id)).returning();
      await tx.insert(mqAuditLog).values({ actorId: actor.id, action: `dictionary_proposal_${status}`, targetTable: "mq_dictionary_proposals", targetId: String(proposal.id), payload: { beforeStatus: proposal.status, afterStatus: status, reviewNotes: parsed.reviewNotes } });
      return { proposal: updated, dictionaryVersion: null };
    }
    if (proposal.status !== "approved") throw new Error("Only approved proposals can be applied.");
    const appliedTarget = await applyProposal(tx, proposal);
    const dictionaryVersion = await recordTransactionalDictionaryVersion(tx, actor.id, proposal.id);
    const [updated] = await tx.update(mqDictionaryProposals).set({ status: "applied", reviewedBy: proposal.reviewedBy ?? actor.id, reviewNotes: parsed.reviewNotes ?? proposal.reviewNotes, appliedAt: new Date() }).where(eq(mqDictionaryProposals.id, proposal.id)).returning();
    await tx.insert(mqAuditLog).values({ actorId: actor.id, action: "dictionary_proposal_applied", targetTable: "mq_dictionary_proposals", targetId: String(proposal.id), payload: { appliedTarget, dictionaryVersion } });
    return { proposal: updated, dictionaryVersion };
  });
}

export async function rerunDictionaryResolution(input: unknown) {
  const actor = await assertPermission("dictionary:edit");
  const parsed = dictionaryReresolutionSchema.parse(input);
  const snapshot = await getResearchDictionarySnapshot();
  if (parsed.expectedDictionaryVersion && parsed.expectedDictionaryVersion !== snapshot.dictionaryVersion) throw new Error("dictionary_version_changed");
  const byKey = (items: readonly { id: number; code: string; name: string; aliases?: readonly string[] }[]) => new Map(items.flatMap(item => [item.code, item.name, ...(item.aliases ?? [])].map(value => [value.trim().toLowerCase().replace(/[_\s]+/g, "-"), item] as const)));
  const entities = byKey(snapshot.entities), protocols = byKey(snapshot.protocols), roles = byKey(snapshot.roles);
  return getDb().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(70424101)`);
    const conditions = [];
    if (parsed.sourceJobId) conditions.push(eq(mqAddressCandidates.sourceJobId, parsed.sourceJobId));
    if (parsed.candidateIds?.length) conditions.push(inArray(mqAddressCandidates.id, parsed.candidateIds));
    const candidates = await tx.select().from(mqAddressCandidates).where(conditions.length === 1 ? conditions[0] : sql`(${conditions[0]}) or (${conditions[1]})`).for("update");
    const changes: Array<{ candidateId: number; before: Record<string, unknown>; after: Record<string, unknown> }> = [];
    for (const candidate of candidates) {
      const normalize = (value: string | null) => value?.trim().toLowerCase().replace(/[_\s]+/g, "-") ?? "";
      const after = {
        suggestedEntityId: entities.get(normalize(candidate.entityHint))?.id ?? null,
        suggestedProtocolId: protocols.get(normalize(candidate.protocolHint))?.id ?? null,
        suggestedRoleId: roles.get(normalize(candidate.roleHint))?.id ?? null,
      };
      const before = { suggestedEntityId: candidate.suggestedEntityId, suggestedProtocolId: candidate.suggestedProtocolId, suggestedRoleId: candidate.suggestedRoleId };
      if (hashJson(before) === hashJson(after)) continue;
      await tx.update(mqAddressCandidates).set({ ...after, updatedAt: new Date() }).where(eq(mqAddressCandidates.id, candidate.id));
      changes.push({ candidateId: candidate.id, before, after });
    }
    await tx.insert(mqAuditLog).values({ actorId: actor.id, action: "candidate_dictionary_resolution_rerun", targetTable: "mq_source_jobs", targetId: parsed.sourceJobId ? String(parsed.sourceJobId) : null, payload: { dictionaryVersion: snapshot.dictionaryVersion, candidateIds: candidates.map(candidate => candidate.id), changes } });
    return { dictionaryVersion: snapshot.dictionaryVersion, candidatesInspected: candidates.length, candidatesUpdated: changes.length, changes };
  });
}
