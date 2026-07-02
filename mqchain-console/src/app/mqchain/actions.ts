"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  approveCandidate,
  approveCandidateAsSuggested,
  markCandidateConflict,
  markCandidateDuplicate,
  markCandidateHistoricalOnly,
  markCandidateMetricIneligible,
  markCandidateNeedsMoreEvidence,
  markCandidateSupersedesRegistry,
  rejectCandidate,
} from "@/lib/mqchain/services/approval-service";
import { approveBatch, commitBatch, createBatchFromCandidates, failBatch, supersedeBatch } from "@/lib/mqchain/services/batch-service";
import {
  createAiCleanedCsvIntake,
  createCsvIntake,
  createDeploymentSourceIntake,
  createJsonEvidenceIntake,
  createManualIntake,
  createUrlIntake,
  type IntakeSummary,
} from "@/lib/mqchain/services/candidate-service";
import {
  createCategory,
  createEntity,
  createKeyPrefix,
  createProtocol,
  createRole,
  deactivateCategory,
  deactivateEntity,
  deactivateKeyPrefix,
  deactivateProtocol,
  deactivateRole,
} from "@/lib/mqchain/services/dictionary-service";
import { completeDiscoveryJob, createDiscoveryJob, createDiscoveryJobFromRegistry } from "@/lib/mqchain/services/discovery-service";
import { addCandidateEvidence, addRegistryEvidence } from "@/lib/mqchain/services/evidence-service";
import { activateKvBuildManifest, createKvBuildManifest } from "@/lib/mqchain/services/kv-manifest-service";
import { addMetricGroupRule, createMetricGroup, deactivateMetricGroup } from "@/lib/mqchain/services/metric-group-service";
import {
  addRegistrySecondaryRole,
  deactivateRegistryLabel,
  markRegistryHistorical,
  supersedeRegistryLabel,
  updateRegistryLabel,
} from "@/lib/mqchain/services/registry-service";
import { createSettingsUser, updateSettingsUserAccess } from "@/lib/mqchain/services/settings-service";
import { archiveSourceJob } from "@/lib/mqchain/services/source-job-service";
import { csvInputFromFormData } from "@/lib/mqchain/csv-upload";
import { formValue, runAction } from "@/lib/mqchain/services/service-utils";
import type { ActionResult } from "@/lib/mqchain/types";

export type IntakeActionData = {
  sourceJobId: number;
  totalRows: number;
  validAddresses: number;
  invalidAddresses: number;
  duplicates: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  evidenceCreated: number;
  conflictsFound: number;
};

export type IntakeActionState = ActionResult<IntakeActionData> | null;
export type UrlIntakeActionData = IntakeActionData;
export type UrlIntakeActionState = IntakeActionState;

function reviewReturnPath(formData: FormData) {
  const returnTo = formValue(formData, "returnTo") ?? "";
  return returnTo.startsWith("/mqchain/review") ? returnTo : "/mqchain/review";
}

function intakeActionData(summary: IntakeSummary): IntakeActionData {
  return {
    sourceJobId: summary.sourceJobId,
    totalRows: summary.totalRows,
    validAddresses: summary.validAddresses,
    invalidAddresses: summary.invalidAddresses,
    duplicates: summary.duplicates,
    candidatesCreated: summary.candidatesCreated,
    candidatesUpdated: summary.candidatesUpdated,
    evidenceCreated: summary.evidenceCreated,
    conflictsFound: summary.conflictsFound,
  };
}

function revalidateIntakePaths() {
  revalidatePath("/mqchain");
  revalidatePath("/mqchain/intake");
  revalidatePath("/mqchain/source-jobs");
  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
}

function manualIntakeInputFromFormData(formData: FormData) {
  return {
    sourceType: "manual_input",
    sourceName: formValue(formData, "sourceName"),
    sourceUrl: formValue(formData, "sourceUrl"),
    entityHint: formValue(formData, "entityHint"),
    protocolHint: formValue(formData, "protocolHint"),
    roleHint: formValue(formData, "roleHint"),
    chainCode: formValue(formData, "chainCode"),
    addresses: formValue(formData, "addresses"),
    notes: formValue(formData, "notes"),
    confidenceScore: formValue(formData, "confidenceScore"),
    qualityTier: formValue(formData, "qualityTier"),
  };
}

async function csvIntakeInputFromFormData(formData: FormData, sourceType: "csv_upload" | "llm_cleaned_csv") {
  const csvInput = await csvInputFromFormData(formData, "csvText", "csvFile");

  return {
    sourceType,
    sourceName: formValue(formData, "sourceName"),
    sourceUrl: formValue(formData, "sourceUrl"),
    entityHint: formValue(formData, "entityHint"),
    protocolHint: formValue(formData, "protocolHint"),
    csvText: csvInput.text,
    localFileName: csvInput.fileName,
    uploadMimeType: csvInput.mimeType,
    uploadSizeBytes: csvInput.sizeBytes,
    csvInputMode: csvInput.inputMode,
  };
}

function urlIntakeInputFromFormData(formData: FormData) {
  return {
    sourceName: formValue(formData, "sourceName"),
    sourceUrl: formValue(formData, "sourceUrl"),
    entityHint: formValue(formData, "entityHint"),
    protocolHint: formValue(formData, "protocolHint"),
    roleHint: formValue(formData, "roleHint"),
    chainCode: formValue(formData, "chainCode"),
    notes: formValue(formData, "notes"),
    confidenceScore: formValue(formData, "confidenceScore"),
    qualityTier: formValue(formData, "qualityTier"),
  };
}

function jsonEvidenceInputFromFormData(formData: FormData) {
  return {
    sourceName: formValue(formData, "sourceName"),
    sourceUrl: formValue(formData, "sourceUrl"),
    entityHint: formValue(formData, "entityHint"),
    protocolHint: formValue(formData, "protocolHint"),
    roleHint: formValue(formData, "roleHint"),
    chainCode: formValue(formData, "chainCode"),
    notes: formValue(formData, "notes"),
    confidenceScore: formValue(formData, "confidenceScore"),
    qualityTier: formValue(formData, "qualityTier"),
    jsonText: formValue(formData, "jsonText"),
  };
}

function deploymentSourceInputFromFormData(formData: FormData) {
  return {
    sourceType: formValue(formData, "sourceType"),
    sourceName: formValue(formData, "sourceName"),
    sourceUrl: formValue(formData, "sourceUrl"),
    sourceText: formValue(formData, "sourceText"),
    entityHint: formValue(formData, "entityHint"),
    protocolHint: formValue(formData, "protocolHint"),
    roleHint: formValue(formData, "roleHint"),
    chainCode: formValue(formData, "chainCode"),
    notes: formValue(formData, "notes"),
    confidenceScore: formValue(formData, "confidenceScore"),
    qualityTier: formValue(formData, "qualityTier"),
  };
}

export async function createManualIntakeAction(formData: FormData) {
  const summary = await createManualIntake(manualIntakeInputFromFormData(formData));

  revalidatePath("/mqchain");
  redirect(`/mqchain/source-jobs/${summary.sourceJobId}`);
}

export async function createManualIntakeResultAction(
  _previousState: IntakeActionState,
  formData: FormData,
): Promise<IntakeActionState> {
  return runAction(async () => {
    const summary = await createManualIntake(manualIntakeInputFromFormData(formData));

    revalidateIntakePaths();

    return intakeActionData(summary);
  });
}

export async function createCsvIntakeAction(formData: FormData) {
  const summary = await createCsvIntake(await csvIntakeInputFromFormData(formData, "csv_upload"));

  revalidatePath("/mqchain");
  redirect(`/mqchain/source-jobs/${summary.sourceJobId}`);
}

export async function createCsvIntakeResultAction(
  _previousState: IntakeActionState,
  formData: FormData,
): Promise<IntakeActionState> {
  return runAction(async () => {
    const summary = await createCsvIntake(await csvIntakeInputFromFormData(formData, "csv_upload"));

    revalidateIntakePaths();

    return intakeActionData(summary);
  });
}

export async function createAiCleanedCsvIntakeAction(formData: FormData) {
  const summary = await createAiCleanedCsvIntake(await csvIntakeInputFromFormData(formData, "llm_cleaned_csv"));

  revalidatePath("/mqchain");
  redirect(`/mqchain/source-jobs/${summary.sourceJobId}`);
}

export async function createAiCleanedCsvIntakeResultAction(
  _previousState: IntakeActionState,
  formData: FormData,
): Promise<IntakeActionState> {
  return runAction(async () => {
    const summary = await createAiCleanedCsvIntake(await csvIntakeInputFromFormData(formData, "llm_cleaned_csv"));

    revalidateIntakePaths();

    return intakeActionData(summary);
  });
}

export async function createUrlIntakeAction(formData: FormData) {
  const summary = await createUrlIntake(urlIntakeInputFromFormData(formData));

  revalidatePath("/mqchain");
  redirect(`/mqchain/source-jobs/${summary.sourceJobId}`);
}

export async function createUrlIntakeResultAction(
  _previousState: IntakeActionState,
  formData: FormData,
): Promise<IntakeActionState> {
  return runAction(async () => {
    const summary = await createUrlIntake(urlIntakeInputFromFormData(formData));

    revalidateIntakePaths();

    return intakeActionData(summary);
  });
}

export async function createJsonEvidenceIntakeAction(formData: FormData) {
  const summary = await createJsonEvidenceIntake(jsonEvidenceInputFromFormData(formData));

  revalidatePath("/mqchain");
  redirect(`/mqchain/source-jobs/${summary.sourceJobId}`);
}

export async function createJsonEvidenceIntakeResultAction(
  _previousState: IntakeActionState,
  formData: FormData,
): Promise<IntakeActionState> {
  return runAction(async () => {
    const summary = await createJsonEvidenceIntake(jsonEvidenceInputFromFormData(formData));

    revalidateIntakePaths();

    return intakeActionData(summary);
  });
}

export async function createDeploymentSourceIntakeAction(formData: FormData) {
  const summary = await createDeploymentSourceIntake(deploymentSourceInputFromFormData(formData));

  revalidatePath("/mqchain");
  redirect(`/mqchain/source-jobs/${summary.sourceJobId}`);
}

export async function createDeploymentSourceIntakeResultAction(
  _previousState: IntakeActionState,
  formData: FormData,
): Promise<IntakeActionState> {
  return runAction(async () => {
    const summary = await createDeploymentSourceIntake(deploymentSourceInputFromFormData(formData));

    revalidateIntakePaths();

    return intakeActionData(summary);
  });
}

export async function approveCandidateAction(formData: FormData) {
  const candidate = await approveCandidate({
    candidateId: formValue(formData, "candidateId"),
    entityId: formValue(formData, "entityId"),
    protocolId: formValue(formData, "protocolId"),
    roleId: formValue(formData, "roleId"),
    confidenceScore: formValue(formData, "confidenceScore"),
    qualityTier: formValue(formData, "qualityTier"),
    labelStatus: formValue(formData, "labelStatus"),
    flags: formValue(formData, "flags"),
    metricEligible: formValue(formData, "metricEligible"),
    validFromBlock: formValue(formData, "validFromBlock"),
    validToBlock: formValue(formData, "validToBlock"),
    firstSeenBlock: formValue(formData, "firstSeenBlock"),
    lastSeenBlock: formValue(formData, "lastSeenBlock"),
    notes: formValue(formData, "notes"),
  });

  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  redirect(`/mqchain/candidates/${candidate.id}`);
}

export async function approveCandidateAsSuggestedAction(formData: FormData) {
  const returnTo = reviewReturnPath(formData);
  await approveCandidateAsSuggested({
    candidateId: formValue(formData, "candidateId"),
    reason: formValue(formData, "reason"),
  });

  revalidatePath("/mqchain");
  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  revalidatePath("/mqchain/review/groups");
  redirect(returnTo);
}

export async function rejectCandidateAction(formData: FormData) {
  const candidate = await rejectCandidate({
    candidateId: formValue(formData, "candidateId"),
    reason: formValue(formData, "reason"),
  });

  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  redirect(`/mqchain/candidates/${candidate.id}`);
}

export async function reviewRejectCandidateAction(formData: FormData) {
  const returnTo = reviewReturnPath(formData);
  await rejectCandidate({
    candidateId: formValue(formData, "candidateId"),
    reason: formValue(formData, "reason") || "Rejected from review queue.",
  });

  revalidatePath("/mqchain");
  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  revalidatePath("/mqchain/review/groups");
  redirect(returnTo);
}

export async function addCandidateEvidenceAction(formData: FormData) {
  const evidence = await addCandidateEvidence({
    candidateId: formValue(formData, "candidateId"),
    evidenceType: formValue(formData, "evidenceType"),
    sourceUrl: formValue(formData, "sourceUrl"),
    trustTier: formValue(formData, "trustTier"),
    confidenceDelta: formValue(formData, "confidenceDelta"),
    summary: formValue(formData, "summary"),
    payloadJson: formValue(formData, "payloadJson"),
  });

  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  redirect(`/mqchain/candidates/${evidence.candidateId}`);
}

export async function addRegistryEvidenceAction(formData: FormData) {
  const registryId = formValue(formData, "registryId");
  const evidence = await addRegistryEvidence({
    registryId,
    evidenceType: formValue(formData, "evidenceType"),
    sourceUrl: formValue(formData, "sourceUrl"),
    trustTier: formValue(formData, "trustTier"),
    confidenceDelta: formValue(formData, "confidenceDelta"),
    summary: formValue(formData, "summary"),
    payloadJson: formValue(formData, "payloadJson"),
  });

  revalidatePath("/mqchain/registry");
  redirect(`/mqchain/registry/${evidence.registryId ?? registryId}`);
}

export async function markCandidateNeedsMoreEvidenceAction(formData: FormData) {
  const candidate = await markCandidateNeedsMoreEvidence({
    candidateId: formValue(formData, "candidateId"),
    reason: formValue(formData, "reason"),
  });

  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  redirect(`/mqchain/candidates/${candidate.id}`);
}

export async function reviewMarkCandidateNeedsMoreEvidenceAction(formData: FormData) {
  const returnTo = reviewReturnPath(formData);
  await markCandidateNeedsMoreEvidence({
    candidateId: formValue(formData, "candidateId"),
    reason: formValue(formData, "reason") || "Needs more evidence from review queue.",
  });

  revalidatePath("/mqchain");
  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  revalidatePath("/mqchain/review/groups");
  redirect(returnTo);
}

export async function markCandidateConflictAction(formData: FormData) {
  const candidate = await markCandidateConflict({
    candidateId: formValue(formData, "candidateId"),
    reason: formValue(formData, "reason"),
  });

  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  redirect(`/mqchain/candidates/${candidate.id}`);
}

export async function reviewMarkCandidateConflictAction(formData: FormData) {
  const returnTo = reviewReturnPath(formData);
  await markCandidateConflict({
    candidateId: formValue(formData, "candidateId"),
    reason: formValue(formData, "reason") || "Conflict marked from review queue.",
  });

  revalidatePath("/mqchain");
  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  revalidatePath("/mqchain/review/groups");
  redirect(returnTo);
}

export async function markCandidateDuplicateAction(formData: FormData) {
  const candidate = await markCandidateDuplicate({
    candidateId: formValue(formData, "candidateId"),
    duplicateOfCandidateId: formValue(formData, "duplicateOfCandidateId"),
    reason: formValue(formData, "reason"),
  });

  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  redirect(`/mqchain/candidates/${candidate.id}`);
}

export async function markCandidateMetricIneligibleAction(formData: FormData) {
  const candidate = await markCandidateMetricIneligible({
    candidateId: formValue(formData, "candidateId"),
    reason: formValue(formData, "reason"),
  });

  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  redirect(`/mqchain/candidates/${candidate.id}`);
}

export async function markCandidateSupersedesRegistryAction(formData: FormData) {
  const candidate = await markCandidateSupersedesRegistry({
    candidateId: formValue(formData, "candidateId"),
    supersedesRegistryId: formValue(formData, "supersedesRegistryId"),
    validFromBlock: formValue(formData, "validFromBlock"),
    reason: formValue(formData, "reason"),
  });

  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  revalidatePath("/mqchain/registry");
  redirect(`/mqchain/candidates/${candidate.id}`);
}

export async function markCandidateHistoricalOnlyAction(formData: FormData) {
  const candidate = await markCandidateHistoricalOnly({
    candidateId: formValue(formData, "candidateId"),
    validFromBlock: formValue(formData, "validFromBlock"),
    validToBlock: formValue(formData, "validToBlock"),
    reason: formValue(formData, "reason"),
  });

  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  revalidatePath("/mqchain/registry");
  redirect(`/mqchain/candidates/${candidate.id}`);
}

export async function reviewMarkCandidateMetricIneligibleAction(formData: FormData) {
  const returnTo = reviewReturnPath(formData);
  await markCandidateMetricIneligible({
    candidateId: formValue(formData, "candidateId"),
    reason: formValue(formData, "reason") || "Metric-ineligible from review queue.",
  });

  revalidatePath("/mqchain");
  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  revalidatePath("/mqchain/review/groups");
  redirect(returnTo);
}

export async function createBatchAction(formData: FormData) {
  const batch = await createBatchFromCandidates({
    candidateIds: formValue(formData, "candidateIds"),
    sourceName: formValue(formData, "sourceName"),
  });

  revalidatePath("/mqchain/batches");
  redirect(`/mqchain/batches/${batch.id}`);
}

export async function createReviewBatchFromSelectionAction(formData: FormData) {
  const candidateIds = formData
    .getAll("candidateId")
    .filter((value): value is string => typeof value === "string")
    .join(", ");

  const batch = await createBatchFromCandidates({
    candidateIds,
    sourceName: formValue(formData, "sourceName") || "Review queue selected batch",
  });

  revalidatePath("/mqchain");
  revalidatePath("/mqchain/batches");
  revalidatePath("/mqchain/review");
  redirect(`/mqchain/batches/${batch.id}`);
}

export async function approveBatchAction(formData: FormData) {
  const batch = await approveBatch({ batchId: formValue(formData, "batchId") });

  revalidatePath("/mqchain/batches");
  redirect(`/mqchain/batches/${batch.id}`);
}

export async function commitBatchAction(formData: FormData) {
  const result = await commitBatch({ batchId: formValue(formData, "batchId") });

  revalidatePath("/mqchain/batches");
  revalidatePath("/mqchain/registry");
  revalidatePath("/mqchain/kv-builds");
  redirect(`/mqchain/batches/${result.batch.id}`);
}

export async function failBatchAction(formData: FormData) {
  const batch = await failBatch({
    batchId: formValue(formData, "batchId"),
    reason: formValue(formData, "reason"),
  });

  revalidatePath("/mqchain/batches");
  redirect(`/mqchain/batches/${batch.id}`);
}

export async function supersedeBatchAction(formData: FormData) {
  const batch = await supersedeBatch({
    batchId: formValue(formData, "batchId"),
    reason: formValue(formData, "reason"),
  });

  revalidatePath("/mqchain/batches");
  redirect(`/mqchain/batches/${batch.id}`);
}

export async function createDiscoveryJobAction(formData: FormData) {
  const job = await createDiscoveryJob({
    discoveryType: formValue(formData, "discoveryType"),
    chainCode: formValue(formData, "chainCode"),
    seedAddress: formValue(formData, "seedAddress"),
    configJson: formValue(formData, "configJson"),
  });

  revalidatePath("/mqchain/discovery/jobs");
  redirect(`/mqchain/discovery/jobs/${job.id}`);
}

export async function completeDiscoveryJobAction(formData: FormData) {
  const result = await completeDiscoveryJob({
    jobId: formValue(formData, "jobId"),
    resultsJson: formValue(formData, "resultsJson"),
  });

  revalidatePath("/mqchain/discovery/jobs");
  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  redirect(`/mqchain/discovery/jobs/${result.job.id}`);
}

export async function createRegistryDiscoveryJobAction(formData: FormData) {
  const job = await createDiscoveryJobFromRegistry({
    registryId: formValue(formData, "registryId"),
    discoveryType: formValue(formData, "discoveryType"),
    configJson: formValue(formData, "configJson"),
  });

  revalidatePath("/mqchain/discovery/jobs");
  revalidatePath("/mqchain/registry");
  redirect(`/mqchain/discovery/jobs/${job.id}`);
}

export async function createMetricGroupAction(formData: FormData) {
  const result = await createMetricGroup({
    metricGroupCode: formValue(formData, "metricGroupCode"),
    metricGroupName: formValue(formData, "metricGroupName"),
    chainCode: formValue(formData, "chainCode"),
    minConfidence: formValue(formData, "minConfidence"),
    requireMetricEligible: formValue(formData, "requireMetricEligible"),
    description: formValue(formData, "description"),
    includeRoles: formValue(formData, "includeRoles"),
    excludeRoles: formValue(formData, "excludeRoles"),
    includeCategories: formValue(formData, "includeCategories"),
    excludeCategories: formValue(formData, "excludeCategories"),
    includeEntities: formValue(formData, "includeEntities"),
    excludeEntities: formValue(formData, "excludeEntities"),
    ruleMinConfidence: formValue(formData, "ruleMinConfidence"),
    ruleRequireMetricEligible: formValue(formData, "ruleRequireMetricEligible"),
  });

  revalidatePath("/mqchain/metric-groups");
  revalidatePath("/mqchain/dictionaries");
  redirect(`/mqchain/metric-groups?preview=${result.group.id}`);
}

export async function addMetricGroupRuleAction(formData: FormData) {
  const result = await addMetricGroupRule({
    metricGroupId: formValue(formData, "metricGroupId"),
    includeRoles: formValue(formData, "includeRoles"),
    excludeRoles: formValue(formData, "excludeRoles"),
    includeCategories: formValue(formData, "includeCategories"),
    excludeCategories: formValue(formData, "excludeCategories"),
    includeEntities: formValue(formData, "includeEntities"),
    excludeEntities: formValue(formData, "excludeEntities"),
    ruleMinConfidence: formValue(formData, "ruleMinConfidence"),
    ruleRequireMetricEligible: formValue(formData, "ruleRequireMetricEligible"),
  });

  revalidatePath("/mqchain");
  revalidatePath("/mqchain/metric-groups");
  revalidatePath("/mqchain/dictionaries");
  redirect(`/mqchain/metric-groups?preview=${result.group.id}`);
}

export async function deactivateMetricGroupAction(formData: FormData) {
  await deactivateMetricGroup({ id: formValue(formData, "id") });

  revalidatePath("/mqchain");
  revalidatePath("/mqchain/metric-groups");
  revalidatePath("/mqchain/dictionaries");
  redirect("/mqchain/metric-groups");
}

export async function createKvBuildManifestAction(formData: FormData) {
  const build = await createKvBuildManifest({
    buildHash: formValue(formData, "buildHash"),
    dictionaryVersion: formValue(formData, "dictionaryVersion"),
    status: formValue(formData, "status"),
    rowCount: formValue(formData, "rowCount"),
    storageUri: formValue(formData, "storageUri"),
    manifestJson: formValue(formData, "manifestJson"),
  });

  revalidatePath("/mqchain");
  revalidatePath("/mqchain/kv-builds");
  redirect(`/mqchain/kv-builds/${build.id}`);
}

export async function activateKvBuildManifestAction(formData: FormData) {
  const build = await activateKvBuildManifest({ buildId: formValue(formData, "buildId") });

  revalidatePath("/mqchain");
  revalidatePath("/mqchain/kv-builds");
  redirect(`/mqchain/kv-builds/${build.id}`);
}

export async function createEntityAction(formData: FormData) {
  await createEntity({
    entityCode: formValue(formData, "entityCode"),
    entityName: formValue(formData, "entityName"),
    entityType: formValue(formData, "entityType"),
    categoryId: formValue(formData, "categoryId"),
    websiteUrl: formValue(formData, "websiteUrl"),
    description: formValue(formData, "description"),
  });

  revalidatePath("/mqchain/dictionaries");
  redirect("/mqchain/dictionaries/entities");
}

export async function deactivateEntityAction(formData: FormData) {
  await deactivateEntity({ id: formValue(formData, "id") });
  revalidatePath("/mqchain/dictionaries");
  redirect("/mqchain/dictionaries/entities");
}

export async function createProtocolAction(formData: FormData) {
  await createProtocol({
    entityId: formValue(formData, "entityId"),
    protocolCode: formValue(formData, "protocolCode"),
    protocolName: formValue(formData, "protocolName"),
    protocolType: formValue(formData, "protocolType"),
    chainScope: formValue(formData, "chainScope"),
    description: formValue(formData, "description"),
  });

  revalidatePath("/mqchain/dictionaries");
  redirect("/mqchain/dictionaries/protocols");
}

export async function deactivateProtocolAction(formData: FormData) {
  await deactivateProtocol({ id: formValue(formData, "id") });
  revalidatePath("/mqchain/dictionaries");
  redirect("/mqchain/dictionaries/protocols");
}

export async function createCategoryAction(formData: FormData) {
  await createCategory({
    categoryId: formValue(formData, "categoryId"),
    categoryCode: formValue(formData, "categoryCode"),
    categoryName: formValue(formData, "categoryName"),
    parentCategoryId: formValue(formData, "parentCategoryId"),
    domainCode: formValue(formData, "domainCode"),
    metricDomain: formValue(formData, "metricDomain"),
    description: formValue(formData, "description"),
  });

  revalidatePath("/mqchain/dictionaries");
  redirect("/mqchain/dictionaries/categories");
}

export async function deactivateCategoryAction(formData: FormData) {
  await deactivateCategory({ id: formValue(formData, "id") });
  revalidatePath("/mqchain/dictionaries");
  redirect("/mqchain/dictionaries/categories");
}

export async function createRoleAction(formData: FormData) {
  await createRole({
    roleId: formValue(formData, "roleId"),
    roleCode: formValue(formData, "roleCode"),
    roleName: formValue(formData, "roleName"),
    categoryId: formValue(formData, "categoryId"),
    roleGroup: formValue(formData, "roleGroup"),
    metricUsageDefault: formValue(formData, "metricUsageDefault"),
    boundaryClass: formValue(formData, "boundaryClass"),
    defaultQualityTier: formValue(formData, "defaultQualityTier"),
    defaultFlags: formValue(formData, "defaultFlags"),
    description: formValue(formData, "description"),
  });

  revalidatePath("/mqchain/dictionaries");
  redirect("/mqchain/dictionaries/roles");
}

export async function deactivateRoleAction(formData: FormData) {
  await deactivateRole({ id: formValue(formData, "id") });
  revalidatePath("/mqchain/dictionaries");
  redirect("/mqchain/dictionaries/roles");
}

export async function createKeyPrefixAction(formData: FormData) {
  await createKeyPrefix({
    prefixCode: formValue(formData, "prefixCode"),
    chainCode: formValue(formData, "chainCode"),
    chainName: formValue(formData, "chainName"),
    chainFamily: formValue(formData, "chainFamily"),
    addressFamily: formValue(formData, "addressFamily"),
    codec: formValue(formData, "codec"),
    payloadLen: formValue(formData, "payloadLen"),
    evmChainId: formValue(formData, "evmChainId"),
    description: formValue(formData, "description"),
  });

  revalidatePath("/mqchain/dictionaries");
  redirect("/mqchain/dictionaries/key-prefixes");
}

export async function deactivateKeyPrefixAction(formData: FormData) {
  await deactivateKeyPrefix({ id: formValue(formData, "id") });
  revalidatePath("/mqchain/dictionaries");
  redirect("/mqchain/dictionaries/key-prefixes");
}

export async function archiveSourceJobAction(formData: FormData) {
  const sourceJob = await archiveSourceJob({
    sourceJobId: formValue(formData, "sourceJobId"),
    archiveStorageUri: formValue(formData, "archiveStorageUri"),
    reason: formValue(formData, "reason"),
  });

  revalidatePath("/mqchain/source-jobs");
  revalidatePath("/mqchain/audit-log");
  redirect(`/mqchain/source-jobs/${sourceJob.id}`);
}

export async function updateRegistryLabelAction(formData: FormData) {
  const row = await updateRegistryLabel({
    registryId: formValue(formData, "registryId"),
    entityId: formValue(formData, "entityId"),
    protocolId: formValue(formData, "protocolId"),
    roleId: formValue(formData, "roleId"),
    confidenceScore: formValue(formData, "confidenceScore"),
    qualityTier: formValue(formData, "qualityTier"),
    labelStatus: formValue(formData, "labelStatus"),
    flags: formValue(formData, "flags"),
    metricUsage: formValue(formData, "metricUsage"),
    validFromBlock: formValue(formData, "validFromBlock"),
    validToBlock: formValue(formData, "validToBlock"),
    firstSeenBlock: formValue(formData, "firstSeenBlock"),
    lastSeenBlock: formValue(formData, "lastSeenBlock"),
    notes: formValue(formData, "notes"),
  });

  revalidatePath("/mqchain/registry");
  redirect(`/mqchain/registry/${row.id}`);
}

export async function deactivateRegistryLabelAction(formData: FormData) {
  const row = await deactivateRegistryLabel({
    registryId: formValue(formData, "registryId"),
    reason: formValue(formData, "reason"),
  });

  revalidatePath("/mqchain/registry");
  redirect(`/mqchain/registry/${row.id}`);
}

export async function addRegistrySecondaryRoleAction(formData: FormData) {
  const row = await addRegistrySecondaryRole({
    registryId: formValue(formData, "registryId"),
    roleId: formValue(formData, "roleId"),
    reason: formValue(formData, "reason"),
  });

  revalidatePath("/mqchain/registry");
  redirect(`/mqchain/registry/${row.id}`);
}

export async function supersedeRegistryLabelAction(formData: FormData) {
  const row = await supersedeRegistryLabel({
    registryId: formValue(formData, "registryId"),
    replacementRegistryId: formValue(formData, "replacementRegistryId"),
    validToBlock: formValue(formData, "validToBlock"),
    reason: formValue(formData, "reason"),
  });

  revalidatePath("/mqchain/registry");
  revalidatePath(`/mqchain/registry/${formValue(formData, "replacementRegistryId")}`);
  redirect(`/mqchain/registry/${row.id}`);
}

export async function markRegistryHistoricalAction(formData: FormData) {
  const row = await markRegistryHistorical({
    registryId: formValue(formData, "registryId"),
    reason: formValue(formData, "reason"),
  });

  revalidatePath("/mqchain/registry");
  redirect(`/mqchain/registry/${row.id}`);
}

export async function createSettingsUserAction(formData: FormData) {
  await createSettingsUser({
    email: formValue(formData, "email"),
    displayName: formValue(formData, "displayName"),
    role: formValue(formData, "role"),
    password: formValue(formData, "password"),
  });

  revalidatePath("/mqchain/settings");
  redirect("/mqchain/settings");
}

export async function updateSettingsUserAccessAction(formData: FormData) {
  await updateSettingsUserAccess({
    userId: formValue(formData, "userId"),
    role: formValue(formData, "role"),
    isActive: formData.has("isActive"),
  });

  revalidatePath("/mqchain/settings");
  redirect("/mqchain/settings");
}
