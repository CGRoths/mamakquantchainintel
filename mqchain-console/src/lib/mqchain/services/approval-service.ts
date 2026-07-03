import { desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mqAddressCandidates, mqAddressEvidence, mqAddressRegistry, mqApprovalEvents, mqAuditLog, mqKvRoleDict } from "@/db/schema";
import { assertPermission } from "@/lib/auth/permissions";
import { LABEL_STATUS } from "../constants";
import { FLAG_BITS, applyMetricEligibilityToFlags, clearFlag, markHistoricalOnlyFlags } from "../flags";
import {
  approvalEditSchema,
  candidateHistoricalOnlySchema,
  candidateReviewStatusSchema,
  candidateSupersedeRegistrySchema,
  duplicateCandidateSchema,
  rejectCandidateSchema,
} from "../validators/approval";
import { optionalNumber } from "./service-utils";

function candidateMetadata(candidate: typeof mqAddressCandidates.$inferSelect) {
  return (candidate.metadata ?? {}) as { approvalDraft?: Record<string, unknown> };
}

async function assertCandidateHasAttachedEvidence(tx: Pick<ReturnType<typeof getDb>, "select">, candidateId: number) {
  const [row] = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(mqAddressEvidence)
    .where(eq(mqAddressEvidence.candidateId, candidateId));

  if (!row?.value) {
    throw new Error(`Candidate ${candidateId} must have at least one evidence row before approval.`);
  }
}

function baseApprovalDraft(
  candidate: typeof mqAddressCandidates.$inferSelect,
  role: typeof mqKvRoleDict.$inferSelect | null,
  existingDraft: Record<string, unknown>,
) {
  return {
    entityId: existingDraft.entityId ?? candidate.suggestedEntityId,
    protocolId: existingDraft.protocolId ?? candidate.suggestedProtocolId ?? null,
    roleId: existingDraft.roleId ?? candidate.suggestedRoleId,
    confidenceScore: existingDraft.confidenceScore ?? candidate.confidenceScore,
    qualityTier: existingDraft.qualityTier ?? candidate.qualityTier,
    labelStatus: existingDraft.labelStatus ?? LABEL_STATUS.activeCurrent,
    flags: existingDraft.flags ?? role?.defaultFlags ?? 0,
    validFromBlock: existingDraft.validFromBlock ?? null,
    validToBlock: existingDraft.validToBlock ?? null,
    firstSeenBlock: existingDraft.firstSeenBlock ?? candidate.firstSeenBlock,
    lastSeenBlock: existingDraft.lastSeenBlock ?? candidate.lastSeenBlock,
    notes: existingDraft.notes,
  };
}

export async function approveCandidate(input: unknown) {
  const actor = await assertPermission("candidate:review");
  const parsed = approvalEditSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(mqAddressCandidates).where(eq(mqAddressCandidates.id, parsed.candidateId)).limit(1);

    if (!candidate) {
      throw new Error("Candidate not found.");
    }
    await assertCandidateHasAttachedEvidence(tx, candidate.id);

    const draftFlags = applyMetricEligibilityToFlags(parsed.flags, parsed.metricEligible === "true");
    const approvalDraft = {
      entityId: parsed.entityId,
      protocolId: optionalNumber(parsed.protocolId),
      roleId: parsed.roleId,
      confidenceScore: parsed.confidenceScore,
      qualityTier: parsed.qualityTier,
      labelStatus: parsed.labelStatus,
      flags: draftFlags,
      metricEligible: parsed.metricEligible === "true",
      validFromBlock: optionalNumber(parsed.validFromBlock),
      validToBlock: optionalNumber(parsed.validToBlock),
      firstSeenBlock: optionalNumber(parsed.firstSeenBlock),
      lastSeenBlock: optionalNumber(parsed.lastSeenBlock),
      notes: parsed.notes,
    };

    const [updated] = await tx
      .update(mqAddressCandidates)
      .set({
        candidateStatus: "approved",
        suggestedEntityId: parsed.entityId,
        suggestedProtocolId: optionalNumber(parsed.protocolId),
        suggestedRoleId: parsed.roleId,
        confidenceScore: parsed.confidenceScore,
        qualityTier: parsed.qualityTier,
        metadata: {
          ...(candidate.metadata ?? {}),
          approvalDraft,
        },
        updatedAt: new Date(),
      })
      .where(eq(mqAddressCandidates.id, parsed.candidateId))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      candidateId: parsed.candidateId,
        action: "candidate_approved",
        actorId: actor.id,
        reason: parsed.notes || "Approved with review edits.",
        beforeJson: candidate,
        afterJson: updated,
      metadata: { approvalDraft, metricEligible: parsed.metricEligible === "true" },
    });

    return updated;
  });
}

export async function approveCandidateAsSuggested(input: unknown) {
  const actor = await assertPermission("candidate:review");
  const parsed = candidateReviewStatusSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(mqAddressCandidates).where(eq(mqAddressCandidates.id, parsed.candidateId)).limit(1);

    if (!candidate) {
      throw new Error("Candidate not found.");
    }
    await assertCandidateHasAttachedEvidence(tx, candidate.id);

    if (!candidate.suggestedEntityId || !candidate.suggestedRoleId) {
      throw new Error("Candidate needs suggested entity and role before quick approval.");
    }

    const [role] = await tx.select().from(mqKvRoleDict).where(eq(mqKvRoleDict.roleId, candidate.suggestedRoleId)).limit(1);
    const approvalDraft = {
      entityId: candidate.suggestedEntityId,
      protocolId: candidate.suggestedProtocolId ?? null,
      roleId: candidate.suggestedRoleId,
      confidenceScore: candidate.confidenceScore,
      qualityTier: candidate.qualityTier,
      labelStatus: LABEL_STATUS.activeCurrent,
      flags: role?.defaultFlags ?? 0,
      validFromBlock: null,
      validToBlock: null,
      firstSeenBlock: candidate.firstSeenBlock,
      lastSeenBlock: candidate.lastSeenBlock,
      notes: parsed.reason || "Approved as suggested from review queue.",
    };

    const [updated] = await tx
      .update(mqAddressCandidates)
      .set({
        candidateStatus: "approved",
        metadata: {
          ...(candidate.metadata ?? {}),
          approvalDraft,
        },
        updatedAt: new Date(),
      })
      .where(eq(mqAddressCandidates.id, parsed.candidateId))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      candidateId: parsed.candidateId,
      action: "candidate_approved_as_suggested",
      actorId: actor.id,
      reason: approvalDraft.notes,
      beforeJson: candidate,
      afterJson: updated,
      metadata: { approvalDraft },
    });

    return updated;
  });
}

export async function rejectCandidate(input: unknown) {
  const actor = await assertPermission("candidate:review");
  const parsed = rejectCandidateSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(mqAddressCandidates).where(eq(mqAddressCandidates.id, parsed.candidateId)).limit(1);

    if (!candidate) {
      throw new Error("Candidate not found.");
    }

    const [updated] = await tx
      .update(mqAddressCandidates)
      .set({
        candidateStatus: "rejected",
        metadata: {
          ...(candidate.metadata ?? {}),
          rejectionReason: parsed.reason,
        },
        updatedAt: new Date(),
      })
      .where(eq(mqAddressCandidates.id, parsed.candidateId))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      candidateId: parsed.candidateId,
      action: "candidate_rejected",
      actorId: actor.id,
      reason: parsed.reason,
      beforeJson: candidate,
      afterJson: updated,
    });

    return updated;
  });
}

async function markCandidateStatus(input: unknown, status: "needs_more_evidence" | "conflict_pending", action: string) {
  const actor = await assertPermission("candidate:review");
  const parsed = candidateReviewStatusSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(mqAddressCandidates).where(eq(mqAddressCandidates.id, parsed.candidateId)).limit(1);

    if (!candidate) {
      throw new Error("Candidate not found.");
    }

    const [updated] = await tx
      .update(mqAddressCandidates)
      .set({
        candidateStatus: status,
        metadata: {
          ...(candidate.metadata ?? {}),
          reviewReason: parsed.reason,
        },
        updatedAt: new Date(),
      })
      .where(eq(mqAddressCandidates.id, parsed.candidateId))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      candidateId: parsed.candidateId,
      action,
      actorId: actor.id,
      reason: parsed.reason,
      beforeJson: candidate,
      afterJson: updated,
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action,
      targetTable: "mq_address_candidates",
      targetId: String(parsed.candidateId),
      payload: { beforeStatus: candidate.candidateStatus, afterStatus: status, reason: parsed.reason },
    });

    return updated;
  });
}

export async function markCandidateNeedsMoreEvidence(input: unknown) {
  return markCandidateStatus(input, "needs_more_evidence", "candidate_marked_needs_more_evidence");
}

export async function markCandidateConflict(input: unknown) {
  return markCandidateStatus(input, "conflict_pending", "candidate_marked_conflict");
}

export async function markCandidateDuplicate(input: unknown) {
  const actor = await assertPermission("candidate:review");
  const parsed = duplicateCandidateSchema.parse(input);
  const db = getDb();

  if (parsed.candidateId === parsed.duplicateOfCandidateId) {
    throw new Error("A candidate cannot be a duplicate of itself.");
  }

  return db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(mqAddressCandidates).where(eq(mqAddressCandidates.id, parsed.candidateId)).limit(1);
    const [duplicateOf] = await tx.select().from(mqAddressCandidates).where(eq(mqAddressCandidates.id, parsed.duplicateOfCandidateId)).limit(1);

    if (!candidate || !duplicateOf) {
      throw new Error("Candidate or duplicate target not found.");
    }

    const [updated] = await tx
      .update(mqAddressCandidates)
      .set({
        candidateStatus: "duplicate",
        duplicateOfCandidateId: parsed.duplicateOfCandidateId,
        metadata: {
          ...(candidate.metadata ?? {}),
          duplicateReason: parsed.reason,
        },
        updatedAt: new Date(),
      })
      .where(eq(mqAddressCandidates.id, parsed.candidateId))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      candidateId: parsed.candidateId,
      action: "candidate_marked_duplicate",
      actorId: actor.id,
      reason: parsed.reason,
      beforeJson: candidate,
      afterJson: updated,
      metadata: { duplicateOfCandidateId: parsed.duplicateOfCandidateId },
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "candidate_marked_duplicate",
      targetTable: "mq_address_candidates",
      targetId: String(parsed.candidateId),
      payload: { duplicateOfCandidateId: parsed.duplicateOfCandidateId, reason: parsed.reason },
    });

    return updated;
  });
}

export async function markCandidateSupersedesRegistry(input: unknown) {
  const actor = await assertPermission("candidate:review");
  const parsed = candidateSupersedeRegistrySchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(mqAddressCandidates).where(eq(mqAddressCandidates.id, parsed.candidateId)).limit(1);
    const [registry] = await tx.select().from(mqAddressRegistry).where(eq(mqAddressRegistry.id, parsed.supersedesRegistryId)).limit(1);

    if (!candidate || !registry) {
      throw new Error("Candidate or registry row not found.");
    }
    await assertCandidateHasAttachedEvidence(tx, candidate.id);

    if (candidate.chainCode !== registry.chainCode || candidate.normalizedAddress !== registry.normalizedAddress) {
      throw new Error("Superseded registry row must match the candidate chain and normalized address.");
    }

    const metadata = candidateMetadata(candidate);
    const existingDraft = metadata.approvalDraft ?? {};
    const roleId = optionalNumber(existingDraft.roleId) ?? candidate.suggestedRoleId;
    const [role] = roleId ? await tx.select().from(mqKvRoleDict).where(eq(mqKvRoleDict.roleId, roleId)).limit(1) : [null];
    const approvalDraft = {
      ...baseApprovalDraft(candidate, role ?? null, existingDraft),
      labelAction: "supersede",
      supersedesRegistryId: parsed.supersedesRegistryId,
      validFromBlock: optionalNumber(parsed.validFromBlock) ?? existingDraft.validFromBlock ?? null,
      notes: parsed.reason || existingDraft.notes || "Approved to supersede an existing registry label.",
    };

    if (!approvalDraft.entityId || !approvalDraft.roleId) {
      throw new Error("Candidate needs entity and role before it can supersede a registry label.");
    }

    const [updated] = await tx
      .update(mqAddressCandidates)
      .set({
        candidateStatus: "approved",
        suggestedEntityId: optionalNumber(approvalDraft.entityId),
        suggestedProtocolId: optionalNumber(approvalDraft.protocolId),
        suggestedRoleId: optionalNumber(approvalDraft.roleId),
        metadata: {
          ...metadata,
          approvalDraft,
          supersedesRegistryId: parsed.supersedesRegistryId,
        },
        updatedAt: new Date(),
      })
      .where(eq(mqAddressCandidates.id, parsed.candidateId))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      candidateId: parsed.candidateId,
      registryId: parsed.supersedesRegistryId,
      action: "candidate_marked_supersedes_registry",
      actorId: actor.id,
      reason: parsed.reason || "Candidate approved to supersede existing registry row.",
      beforeJson: candidate,
      afterJson: updated,
      metadata: { approvalDraft, supersedesRegistryId: parsed.supersedesRegistryId },
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "candidate_marked_supersedes_registry",
      targetTable: "mq_address_candidates",
      targetId: String(parsed.candidateId),
      payload: { supersedesRegistryId: parsed.supersedesRegistryId, reason: parsed.reason },
    });

    return updated;
  });
}

export async function markCandidateHistoricalOnly(input: unknown) {
  const actor = await assertPermission("candidate:review");
  const parsed = candidateHistoricalOnlySchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(mqAddressCandidates).where(eq(mqAddressCandidates.id, parsed.candidateId)).limit(1);

    if (!candidate) {
      throw new Error("Candidate not found.");
    }
    await assertCandidateHasAttachedEvidence(tx, candidate.id);

    const metadata = candidateMetadata(candidate);
    const existingDraft = metadata.approvalDraft ?? {};
    const roleId = optionalNumber(existingDraft.roleId) ?? candidate.suggestedRoleId;
    const [role] = roleId ? await tx.select().from(mqKvRoleDict).where(eq(mqKvRoleDict.roleId, roleId)).limit(1) : [null];
    const baseDraft = baseApprovalDraft(candidate, role ?? null, existingDraft);
    const approvalDraft = {
      ...baseDraft,
      labelAction: "mark_historical",
      historicalOnly: true,
      labelStatus: LABEL_STATUS.inactiveHistorical,
      flags: markHistoricalOnlyFlags(optionalNumber(baseDraft.flags) ?? 0),
      validFromBlock: optionalNumber(parsed.validFromBlock) ?? baseDraft.validFromBlock,
      validToBlock: optionalNumber(parsed.validToBlock) ?? baseDraft.validToBlock ?? candidate.lastSeenBlock,
      notes: parsed.reason || baseDraft.notes || "Approved as a historical-only label.",
    };

    if (!approvalDraft.entityId || !approvalDraft.roleId) {
      throw new Error("Candidate needs entity and role before it can be approved as historical-only.");
    }

    const [updated] = await tx
      .update(mqAddressCandidates)
      .set({
        candidateStatus: "approved",
        suggestedEntityId: optionalNumber(approvalDraft.entityId),
        suggestedProtocolId: optionalNumber(approvalDraft.protocolId),
        suggestedRoleId: optionalNumber(approvalDraft.roleId),
        metadata: {
          ...metadata,
          historicalOnly: true,
          approvalDraft,
        },
        updatedAt: new Date(),
      })
      .where(eq(mqAddressCandidates.id, parsed.candidateId))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      candidateId: parsed.candidateId,
      action: "candidate_marked_historical_only",
      actorId: actor.id,
      reason: parsed.reason || "Candidate approved as historical-only.",
      beforeJson: candidate,
      afterJson: updated,
      metadata: { approvalDraft },
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "candidate_marked_historical_only",
      targetTable: "mq_address_candidates",
      targetId: String(parsed.candidateId),
      payload: { validFromBlock: approvalDraft.validFromBlock, validToBlock: approvalDraft.validToBlock, reason: parsed.reason },
    });

    return updated;
  });
}

export async function markCandidateMetricIneligible(input: unknown) {
  const actor = await assertPermission("candidate:review");
  const parsed = candidateReviewStatusSchema.parse(input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(mqAddressCandidates).where(eq(mqAddressCandidates.id, parsed.candidateId)).limit(1);

    if (!candidate) {
      throw new Error("Candidate not found.");
    }

    const metadata = (candidate.metadata ?? {}) as { approvalDraft?: Record<string, unknown> };
    const existingDraft = metadata.approvalDraft ?? {};
    const existingFlags = Number(existingDraft.flags ?? 0);

    const [updated] = await tx
      .update(mqAddressCandidates)
      .set({
        metadata: {
          ...metadata,
          metricEligible: false,
          metricIneligibleReason: parsed.reason,
          approvalDraft: {
            ...existingDraft,
            flags: clearFlag(existingFlags, FLAG_BITS.metricEligible),
            metricEligible: false,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(mqAddressCandidates.id, parsed.candidateId))
      .returning();

    await tx.insert(mqApprovalEvents).values({
      candidateId: parsed.candidateId,
      action: "candidate_marked_metric_ineligible",
      actorId: actor.id,
      reason: parsed.reason,
      beforeJson: candidate,
      afterJson: updated,
    });

    await tx.insert(mqAuditLog).values({
      actorId: actor.id,
      action: "candidate_marked_metric_ineligible",
      targetTable: "mq_address_candidates",
      targetId: String(parsed.candidateId),
      payload: { reason: parsed.reason },
    });

    return updated;
  });
}

export async function listApprovalEvents(limit = 100) {
  return getDb().select().from(mqApprovalEvents).orderBy(desc(mqApprovalEvents.createdAt)).limit(limit);
}
