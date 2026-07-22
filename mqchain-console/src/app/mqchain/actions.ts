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
} from "@/lib/mqchain/origin-client/client";
import { approveBatch, commitBatch, createBatchFromCandidates, failBatch, supersedeBatch } from "@/lib/mqchain/origin-client/client";
import { executeBulkCandidateApproval, previewBulkCandidateApproval } from "@/lib/mqchain/origin-client/client";
import {
  createAiCleanedCsvIntake,
  createCsvIntake,
  createDeploymentSourceIntake,
  createJsonEvidenceIntake,
  createManualIntake,
  createUrlIntake,
  type IntakeSummary,
} from "@/lib/mqchain/origin-client/client";
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
  updateCategory,
  updateEntity,
  updateKeyPrefix,
  updateProtocol,
  updateRole,
} from "@/lib/mqchain/origin-client/client";
import { completeDiscoveryJob, createDiscoveryJob, createDiscoveryJobFromRegistry } from "@/lib/mqchain/origin-client/client";
import { addCandidateEvidence, addRegistryEvidence } from "@/lib/mqchain/origin-client/client";
import { activateKvBuildManifest, createKvBuildManifest } from "@/lib/mqchain/origin-client/client";
import { createNetworkChangeProposal, reviewNetworkChangeProposal } from "@/lib/mqchain/origin-client/client";
import { addMetricGroupRule, createMetricGroup, deactivateMetricGroup } from "@/lib/mqchain/origin-client/client";
import {
  addRegistrySecondaryRole,
  deactivateRegistryLabel,
  markRegistryHistorical,
  supersedeRegistryLabel,
  updateRegistryLabel,
} from "@/lib/mqchain/origin-client/client";
import { createSettingsUser, updateSettingsUserAccess } from "@/lib/mqchain/origin-client/client";
import { archiveSourceJob, getSourceJobApprovalCoverage, recordSourceVerification, rerunDictionaryResolution } from "@/lib/mqchain/origin-client/client";
import type { SourceJobApprovalCoverageDto } from "@/lib/mqchain/contracts/source-approval-coverage";
import { csvInputFromFormData } from "@/lib/mqchain/csv-upload";
import { formValue, runAction } from "@/lib/mqchain/origin-client/action-utils";
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

export type CandidateMutationData = {
  candidateId: number;
  status?: string | null;
  evidenceId?: number;
  message: string;
};

export type CandidateMutationState = ActionResult<CandidateMutationData> | null;

export type BulkApprovalPreviewData = Awaited<ReturnType<typeof previewBulkCandidateApproval>>;
export type BulkApprovalPreviewState = ActionResult<BulkApprovalPreviewData> | null;
export type BulkApprovalResultData = Awaited<ReturnType<typeof executeBulkCandidateApproval>>;
export type BulkApprovalResultState = ActionResult<BulkApprovalResultData> | null;

export type BatchMutationData = {
  batchId: number;
  status?: string | null;
  registryCount?: number;
  dictionaryVersion?: string | null;
  message: string;
};

export type BatchMutationState = ActionResult<BatchMutationData> | null;

export type RegistryMutationData = {
  registryId: number;
  status?: string | null;
  evidenceId?: number;
  discoveryJobId?: number;
  message: string;
};

export type RegistryMutationState = ActionResult<RegistryMutationData> | null;

export type DiscoveryMutationData = {
  jobId: number;
  status?: string | null;
  sourceJobId?: number;
  sourceDocumentId?: number;
  rows?: number;
  candidatesCreated?: number;
  evidenceCreated?: number;
  invalidRows?: number;
  duplicates?: number;
  message: string;
};

export type DiscoveryMutationState = ActionResult<DiscoveryMutationData> | null;

export type SourceJobMutationData = {
  sourceJobId: number;
  sourceVerificationId?: number;
  status?: string | null;
  archiveStorageUri?: string | null;
  candidatesInspected?: number;
  candidatesUpdated?: number;
  approvalCoverage?: SourceJobApprovalCoverageDto;
  message: string;
};

export type SourceJobMutationState = ActionResult<SourceJobMutationData> | null;

export type KvBuildMutationData = {
  buildId: number;
  status?: string | null;
  buildHash?: string | null;
  message: string;
};

export type KvBuildMutationState = ActionResult<KvBuildMutationData> | null;

export type DictionaryMutationData = {
  dictionaryType: "entity" | "protocol" | "category" | "role" | "key_prefix";
  id: number;
  code?: string | null;
  status?: "active" | "inactive";
  message: string;
};

export type DictionaryMutationState = ActionResult<DictionaryMutationData> | null;

export type MetricGroupMutationData = {
  groupId: number;
  ruleId?: number;
  status?: "active" | "inactive";
  dictionaryVersion?: string | null;
  message: string;
};

export type MetricGroupMutationState = ActionResult<MetricGroupMutationData> | null;

export type SettingsMutationData = {
  userId: string;
  email: string;
  role: string;
  isActive: boolean;
  message: string;
};

export type SettingsMutationState = ActionResult<SettingsMutationData> | null;

export type NetworkProposalMutationData = { proposalId: number; status: string; message: string };
export type NetworkProposalMutationState = ActionResult<NetworkProposalMutationData> | null;

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

function revalidateCandidatePaths(candidateId: number | string | undefined) {
  revalidatePath("/mqchain");
  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  revalidatePath("/mqchain/review/groups");

  if (candidateId) {
    revalidatePath(`/mqchain/candidates/${candidateId}`);
  }
}

function revalidateReviewPaths(candidateId: number | string | undefined, returnTo?: string | null) {
  revalidateCandidatePaths(candidateId);

  if (returnTo?.startsWith("/mqchain/review/groups/")) {
    revalidatePath(returnTo);
  }
}

function revalidateBatchPaths(batchId: number | string | undefined) {
  revalidatePath("/mqchain");
  revalidatePath("/mqchain/batches");
  revalidatePath("/mqchain/review");
  revalidatePath("/mqchain/registry");
  revalidatePath("/mqchain/kv-builds");

  if (batchId) {
    revalidatePath(`/mqchain/batches/${batchId}`);
  }
}

function revalidateRegistryPaths(registryId: number | string | undefined) {
  revalidatePath("/mqchain");
  revalidatePath("/mqchain/registry");
  revalidatePath("/mqchain/resolver");
  revalidatePath("/mqchain/audit-log");
  revalidatePath("/mqchain/metric-groups");

  if (registryId) {
    revalidatePath(`/mqchain/registry/${registryId}`);
  }
}

function revalidateDiscoveryPaths(jobId: number | string | undefined) {
  revalidatePath("/mqchain");
  revalidatePath("/mqchain/discovery/jobs");
  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
  revalidatePath("/mqchain/source-jobs");

  if (jobId) {
    revalidatePath(`/mqchain/discovery/jobs/${jobId}`);
  }
}

function revalidateSourceJobPaths(sourceJobId: number | string | undefined) {
  revalidatePath("/mqchain");
  revalidatePath("/mqchain/source-jobs");
  revalidatePath("/mqchain/audit-log");

  if (sourceJobId) {
    revalidatePath(`/mqchain/source-jobs/${sourceJobId}`);
  }
}

function revalidateKvBuildPaths(buildId: number | string | undefined) {
  revalidatePath("/mqchain");
  revalidatePath("/mqchain/kv-builds");
  revalidatePath("/mqchain/audit-log");

  if (buildId) {
    revalidatePath(`/mqchain/kv-builds/${buildId}`);
  }
}

function revalidateDictionaryPaths(section?: string) {
  revalidatePath("/mqchain");
  revalidatePath("/mqchain/dictionaries");
  revalidatePath("/mqchain/metric-groups");
  revalidatePath("/mqchain/registry");
  revalidatePath("/mqchain/resolver");
  revalidatePath("/mqchain/audit-log");

  if (section) {
    revalidatePath(`/mqchain/dictionaries/${section}`);
  }
}

function revalidateSettingsPaths() {
  revalidatePath("/mqchain");
  revalidatePath("/mqchain/settings");
  revalidatePath("/mqchain/audit-log");
}

function revalidateMetricGroupPaths(groupId?: number | string | undefined) {
  revalidatePath("/mqchain");
  revalidatePath("/mqchain/metric-groups");
  revalidatePath("/mqchain/dictionaries");
  revalidatePath("/mqchain/registry");
  revalidatePath("/mqchain/resolver");
  revalidatePath("/mqchain/audit-log");

  if (groupId) {
    revalidatePath(`/mqchain/metric-groups?preview=${groupId}`);
  }
}

function createBatchInputFromFormData(formData: FormData, fallbackSourceName?: string) {
  const selectedCandidateIds = formData
    .getAll("candidateId")
    .filter((value): value is string => typeof value === "string")
    .join(", ");
  const manualCandidateIds = formValue(formData, "candidateIds");

  return {
    candidateIds: [selectedCandidateIds, manualCandidateIds].filter(Boolean).join(", "),
    sourceName: formValue(formData, "sourceName") || fallbackSourceName,
  };
}

function batchIdInputFromFormData(formData: FormData) {
  return { batchId: formValue(formData, "batchId") };
}

function batchLifecycleInputFromFormData(formData: FormData) {
  return {
    batchId: formValue(formData, "batchId"),
    reason: formValue(formData, "reason"),
  };
}

function approveCandidateInputFromFormData(formData: FormData) {
  return {
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
  };
}

function candidateStatusInputFromFormData(formData: FormData) {
  return {
    candidateId: formValue(formData, "candidateId"),
    reason: formValue(formData, "reason"),
  };
}

function duplicateCandidateInputFromFormData(formData: FormData) {
  return {
    candidateId: formValue(formData, "candidateId"),
    duplicateOfCandidateId: formValue(formData, "duplicateOfCandidateId"),
    reason: formValue(formData, "reason"),
  };
}

function supersedeRegistryInputFromFormData(formData: FormData) {
  return {
    candidateId: formValue(formData, "candidateId"),
    supersedesRegistryId: formValue(formData, "supersedesRegistryId"),
    validFromBlock: formValue(formData, "validFromBlock"),
    reason: formValue(formData, "reason"),
  };
}

function historicalOnlyInputFromFormData(formData: FormData) {
  return {
    candidateId: formValue(formData, "candidateId"),
    validFromBlock: formValue(formData, "validFromBlock"),
    validToBlock: formValue(formData, "validToBlock"),
    reason: formValue(formData, "reason"),
  };
}

function candidateEvidenceInputFromFormData(formData: FormData) {
  return {
    candidateId: formValue(formData, "candidateId"),
    evidenceType: formValue(formData, "evidenceType"),
    sourceUrl: formValue(formData, "sourceUrl"),
    trustTier: formValue(formData, "trustTier"),
    confidenceDelta: formValue(formData, "confidenceDelta"),
    summary: formValue(formData, "summary"),
    payloadJson: formValue(formData, "payloadJson"),
  };
}

function registryEvidenceInputFromFormData(formData: FormData) {
  return {
    registryId: formValue(formData, "registryId"),
    evidenceType: formValue(formData, "evidenceType"),
    sourceUrl: formValue(formData, "sourceUrl"),
    trustTier: formValue(formData, "trustTier"),
    confidenceDelta: formValue(formData, "confidenceDelta"),
    summary: formValue(formData, "summary"),
    payloadJson: formValue(formData, "payloadJson"),
  };
}

function registryEditInputFromFormData(formData: FormData) {
  return {
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
  };
}

function registryIdInputFromFormData(formData: FormData) {
  return {
    registryId: formValue(formData, "registryId"),
    reason: formValue(formData, "reason"),
  };
}

function registrySecondaryRoleInputFromFormData(formData: FormData) {
  return {
    registryId: formValue(formData, "registryId"),
    roleId: formValue(formData, "roleId"),
    reason: formValue(formData, "reason"),
  };
}

function registrySupersedeInputFromFormData(formData: FormData) {
  return {
    registryId: formValue(formData, "registryId"),
    replacementRegistryId: formValue(formData, "replacementRegistryId"),
    validToBlock: formValue(formData, "validToBlock"),
    reason: formValue(formData, "reason"),
  };
}

function registryDiscoveryInputFromFormData(formData: FormData) {
  return {
    registryId: formValue(formData, "registryId"),
    discoveryType: formValue(formData, "discoveryType"),
    configJson: formValue(formData, "configJson"),
  };
}

function discoveryJobInputFromFormData(formData: FormData) {
  return {
    discoveryType: formValue(formData, "discoveryType"),
    chainCode: formValue(formData, "chainCode"),
    seedAddress: formValue(formData, "seedAddress"),
    configJson: formValue(formData, "configJson"),
  };
}

function discoveryCompletionInputFromFormData(formData: FormData) {
  return {
    jobId: formValue(formData, "jobId"),
    resultsJson: formValue(formData, "resultsJson"),
  };
}

function createKvBuildManifestInputFromFormData(formData: FormData) {
  return {
    buildHash: formValue(formData, "buildHash"),
    dictionaryVersion: formValue(formData, "dictionaryVersion"),
    status: formValue(formData, "status"),
    rowCount: formValue(formData, "rowCount"),
    storageUri: formValue(formData, "storageUri"),
    manifestJson: formValue(formData, "manifestJson"),
  };
}

function kvBuildIdInputFromFormData(formData: FormData) {
  return {
    buildId: formValue(formData, "buildId"),
    expectedBuildHash: formValue(formData, "expectedBuildHash"),
    expectedDictionaryVersion: formValue(formData, "expectedDictionaryVersion"),
    expectedRegistrySnapshotHash: formValue(formData, "expectedRegistrySnapshotHash"),
    expectedCurrentActiveBuildId: formValue(formData, "expectedCurrentActiveBuildId"),
    expectedValidationRunId: formValue(formData, "expectedValidationRunId"),
    expectedValidationReportHash: formValue(formData, "expectedValidationReportHash"),
  };
}

function entityInputFromFormData(formData: FormData) {
  return {
    entityCode: formValue(formData, "entityCode"),
    entityName: formValue(formData, "entityName"),
    entityType: formValue(formData, "entityType"),
    categoryId: formValue(formData, "categoryId"),
    websiteUrl: formValue(formData, "websiteUrl"),
    description: formValue(formData, "description"),
  };
}

function protocolInputFromFormData(formData: FormData) {
  return {
    entityId: formValue(formData, "entityId"),
    protocolCode: formValue(formData, "protocolCode"),
    protocolName: formValue(formData, "protocolName"),
    protocolType: formValue(formData, "protocolType"),
    chainScope: formValue(formData, "chainScope"),
    description: formValue(formData, "description"),
  };
}

function categoryInputFromFormData(formData: FormData) {
  return {
    categoryId: formValue(formData, "categoryId"),
    categoryCode: formValue(formData, "categoryCode"),
    categoryName: formValue(formData, "categoryName"),
    parentCategoryId: formValue(formData, "parentCategoryId"),
    domainCode: formValue(formData, "domainCode"),
    metricDomain: formValue(formData, "metricDomain"),
    description: formValue(formData, "description"),
  };
}

function roleInputFromFormData(formData: FormData) {
  return {
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
  };
}

function keyPrefixInputFromFormData(formData: FormData) {
  return {
    prefixCode: formValue(formData, "prefixCode"),
    chainCode: formValue(formData, "chainCode"),
    chainName: formValue(formData, "chainName"),
    chainFamily: formValue(formData, "chainFamily"),
    addressFamily: formValue(formData, "addressFamily"),
    codec: formValue(formData, "codec"),
    payloadLen: formValue(formData, "payloadLen"),
    evmChainId: formValue(formData, "evmChainId"),
    description: formValue(formData, "description"),
  };
}

function entityUpdateInputFromFormData(formData: FormData) {
  return {
    ...entityInputFromFormData(formData),
    id: formValue(formData, "id"),
    isActive: formData.has("isActive"),
  };
}

function protocolUpdateInputFromFormData(formData: FormData) {
  return {
    ...protocolInputFromFormData(formData),
    id: formValue(formData, "id"),
    isActive: formData.has("isActive"),
  };
}

function categoryUpdateInputFromFormData(formData: FormData) {
  return {
    ...categoryInputFromFormData(formData),
    isActive: formData.has("isActive"),
  };
}

function roleUpdateInputFromFormData(formData: FormData) {
  return {
    ...roleInputFromFormData(formData),
    isActive: formData.has("isActive"),
  };
}

function keyPrefixUpdateInputFromFormData(formData: FormData) {
  return {
    ...keyPrefixInputFromFormData(formData),
    isActive: formData.has("isActive"),
  };
}

function dictionaryIdInputFromFormData(formData: FormData) {
  return {
    id: formValue(formData, "id"),
  };
}

function metricGroupInputFromFormData(formData: FormData) {
  return {
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
  };
}

function metricGroupRuleInputFromFormData(formData: FormData) {
  return {
    metricGroupId: formValue(formData, "metricGroupId"),
    includeRoles: formValue(formData, "includeRoles"),
    excludeRoles: formValue(formData, "excludeRoles"),
    includeCategories: formValue(formData, "includeCategories"),
    excludeCategories: formValue(formData, "excludeCategories"),
    includeEntities: formValue(formData, "includeEntities"),
    excludeEntities: formValue(formData, "excludeEntities"),
    ruleMinConfidence: formValue(formData, "ruleMinConfidence"),
    ruleRequireMetricEligible: formValue(formData, "ruleRequireMetricEligible"),
  };
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
  const candidate = await approveCandidate(approveCandidateInputFromFormData(formData));

  revalidateCandidatePaths(candidate.id);
  redirect(`/mqchain/candidates/${candidate.id}`);
}

export async function approveCandidateResultAction(
  _previousState: CandidateMutationState,
  formData: FormData,
): Promise<CandidateMutationState> {
  return runAction(async () => {
    const candidate = await approveCandidate(approveCandidateInputFromFormData(formData));
    revalidateCandidatePaths(candidate.id);
    return { candidateId: candidate.id, status: candidate.candidateStatus, message: "Candidate approved with review edits." };
  });
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

export async function approveCandidateAsSuggestedResultAction(
  _previousState: CandidateMutationState,
  formData: FormData,
): Promise<CandidateMutationState> {
  return runAction(async () => {
    const returnTo = reviewReturnPath(formData);
    const candidate = await approveCandidateAsSuggested({
      candidateId: formValue(formData, "candidateId"),
      reason: formValue(formData, "reason"),
    });

    revalidateReviewPaths(candidate.id, returnTo);
    return { candidateId: candidate.id, status: candidate.candidateStatus, message: "Candidate approved as suggested." };
  });
}

function bulkApprovalSelectionFromFormData(formData: FormData) {
  const candidateIds = formData
    .getAll("candidateId")
    .filter((value): value is string => typeof value === "string")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  const mode = formValue(formData, "mode") === "strict" ? "strict" : "eligible_only";
  const rawSelectionType = formValue(formData, "selectionType");
  const selectionType = rawSelectionType === "source_sheet" || rawSelectionType === "source_job" ? rawSelectionType : "explicit_ids";
  const sourceJobId = Number(formValue(formData, "sourceJobId"));
  const sourceSheet = formValue(formData, "sourceSheet") || null;
  return {
    selectionType,
    candidateIds,
    sourceJobId: Number.isInteger(sourceJobId) && sourceJobId > 0 ? sourceJobId : undefined,
    sourceSheet,
    mode,
  } as const;
}

export async function previewBulkCandidateApprovalResultAction(
  _previousState: BulkApprovalPreviewState,
  formData: FormData,
): Promise<BulkApprovalPreviewState> {
  return runAction(async () => {
    const selection = bulkApprovalSelectionFromFormData(formData);
    if (selection.selectionType === "explicit_ids" && !selection.candidateIds.length) {
      throw new Error("Select at least one candidate to preview.");
    }

    const preview = await previewBulkCandidateApproval(selection);
    // Preview writes nothing, but it reports the server's current view of the
    // queue; drop stale cached renders so the operator confirms against the
    // same state the preview was computed from.
    revalidatePath("/mqchain/review");
    return preview;
  });
}

export async function executeBulkCandidateApprovalResultAction(
  _previousState: BulkApprovalResultState,
  formData: FormData,
): Promise<BulkApprovalResultState> {
  return runAction(async () => {
    const selection = bulkApprovalSelectionFromFormData(formData);
    if (selection.selectionType === "explicit_ids" && !selection.candidateIds.length) {
      throw new Error("Select at least one candidate to approve.");
    }

    const result = await executeBulkCandidateApproval({
      ...selection,
      expectedDictionaryVersion: formValue(formData, "expectedDictionaryVersion"),
      expectedPreviewHash: formValue(formData, "expectedPreviewHash"),
      expectedCandidateSnapshotHash: formValue(formData, "expectedCandidateSnapshotHash"),
      expectedSourceVerificationSnapshotHash: formValue(formData, "expectedSourceVerificationSnapshotHash"),
      idempotencyKey: formValue(formData, "idempotencyKey"),
      reason: formValue(formData, "reason"),
    });

    revalidateCandidatePaths(undefined);
    revalidatePath("/mqchain/source-jobs");
    return result;
  });
}

export async function rejectCandidateAction(formData: FormData) {
  const candidate = await rejectCandidate(candidateStatusInputFromFormData(formData));

  revalidateCandidatePaths(candidate.id);
  redirect(`/mqchain/candidates/${candidate.id}`);
}

export async function rejectCandidateResultAction(
  _previousState: CandidateMutationState,
  formData: FormData,
): Promise<CandidateMutationState> {
  return runAction(async () => {
    const candidate = await rejectCandidate(candidateStatusInputFromFormData(formData));
    revalidateCandidatePaths(candidate.id);
    return { candidateId: candidate.id, status: candidate.candidateStatus, message: "Candidate rejected." };
  });
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

export async function reviewRejectCandidateResultAction(
  _previousState: CandidateMutationState,
  formData: FormData,
): Promise<CandidateMutationState> {
  return runAction(async () => {
    const returnTo = reviewReturnPath(formData);
    const candidate = await rejectCandidate({
      candidateId: formValue(formData, "candidateId"),
      reason: formValue(formData, "reason") || "Rejected from review queue.",
    });

    revalidateReviewPaths(candidate.id, returnTo);
    return { candidateId: candidate.id, status: candidate.candidateStatus, message: "Candidate rejected from review." };
  });
}

export async function addCandidateEvidenceAction(formData: FormData) {
  const evidence = await addCandidateEvidence(candidateEvidenceInputFromFormData(formData));

  revalidateCandidatePaths(evidence.candidateId ?? undefined);
  redirect(`/mqchain/candidates/${evidence.candidateId}`);
}

export async function addCandidateEvidenceResultAction(
  _previousState: CandidateMutationState,
  formData: FormData,
): Promise<CandidateMutationState> {
  return runAction(async () => {
    const evidence = await addCandidateEvidence(candidateEvidenceInputFromFormData(formData));
    revalidateCandidatePaths(evidence.candidateId ?? undefined);

    if (!evidence.candidateId) {
      throw new Error("Evidence was not linked to a candidate.");
    }

    return {
      candidateId: evidence.candidateId,
      evidenceId: evidence.id,
      message: "Candidate evidence attached.",
    };
  });
}

export async function addRegistryEvidenceAction(formData: FormData) {
  const registryId = formValue(formData, "registryId");
  const evidence = await addRegistryEvidence(registryEvidenceInputFromFormData(formData));

  revalidateRegistryPaths(evidence.registryId ?? registryId ?? undefined);
  redirect(`/mqchain/registry/${evidence.registryId ?? registryId}`);
}

export async function addRegistryEvidenceResultAction(
  _previousState: RegistryMutationState,
  formData: FormData,
): Promise<RegistryMutationState> {
  return runAction(async () => {
    const evidence = await addRegistryEvidence(registryEvidenceInputFromFormData(formData));

    if (!evidence.registryId) {
      throw new Error("Evidence was not linked to a registry row.");
    }

    revalidateRegistryPaths(evidence.registryId);

    return {
      registryId: evidence.registryId,
      evidenceId: evidence.id,
      message: "Registry evidence attached.",
    };
  });
}

export async function markCandidateNeedsMoreEvidenceAction(formData: FormData) {
  const candidate = await markCandidateNeedsMoreEvidence(candidateStatusInputFromFormData(formData));

  revalidateCandidatePaths(candidate.id);
  redirect(`/mqchain/candidates/${candidate.id}`);
}

export async function markCandidateNeedsMoreEvidenceResultAction(
  _previousState: CandidateMutationState,
  formData: FormData,
): Promise<CandidateMutationState> {
  return runAction(async () => {
    const candidate = await markCandidateNeedsMoreEvidence(candidateStatusInputFromFormData(formData));
    revalidateCandidatePaths(candidate.id);
    return { candidateId: candidate.id, status: candidate.candidateStatus, message: "Candidate marked as needing more evidence." };
  });
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

export async function reviewMarkCandidateNeedsMoreEvidenceResultAction(
  _previousState: CandidateMutationState,
  formData: FormData,
): Promise<CandidateMutationState> {
  return runAction(async () => {
    const returnTo = reviewReturnPath(formData);
    const candidate = await markCandidateNeedsMoreEvidence({
      candidateId: formValue(formData, "candidateId"),
      reason: formValue(formData, "reason") || "Needs more evidence from review queue.",
    });

    revalidateReviewPaths(candidate.id, returnTo);
    return { candidateId: candidate.id, status: candidate.candidateStatus, message: "Candidate marked as needing evidence." };
  });
}

export async function markCandidateConflictAction(formData: FormData) {
  const candidate = await markCandidateConflict(candidateStatusInputFromFormData(formData));

  revalidateCandidatePaths(candidate.id);
  redirect(`/mqchain/candidates/${candidate.id}`);
}

export async function markCandidateConflictResultAction(
  _previousState: CandidateMutationState,
  formData: FormData,
): Promise<CandidateMutationState> {
  return runAction(async () => {
    const candidate = await markCandidateConflict(candidateStatusInputFromFormData(formData));
    revalidateCandidatePaths(candidate.id);
    return { candidateId: candidate.id, status: candidate.candidateStatus, message: "Candidate marked as conflict pending." };
  });
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

export async function reviewMarkCandidateConflictResultAction(
  _previousState: CandidateMutationState,
  formData: FormData,
): Promise<CandidateMutationState> {
  return runAction(async () => {
    const returnTo = reviewReturnPath(formData);
    const candidate = await markCandidateConflict({
      candidateId: formValue(formData, "candidateId"),
      reason: formValue(formData, "reason") || "Conflict marked from review queue.",
    });

    revalidateReviewPaths(candidate.id, returnTo);
    return { candidateId: candidate.id, status: candidate.candidateStatus, message: "Candidate marked as conflict pending." };
  });
}

export async function markCandidateDuplicateAction(formData: FormData) {
  const candidate = await markCandidateDuplicate(duplicateCandidateInputFromFormData(formData));

  revalidateCandidatePaths(candidate.id);
  redirect(`/mqchain/candidates/${candidate.id}`);
}

export async function markCandidateDuplicateResultAction(
  _previousState: CandidateMutationState,
  formData: FormData,
): Promise<CandidateMutationState> {
  return runAction(async () => {
    const candidate = await markCandidateDuplicate(duplicateCandidateInputFromFormData(formData));
    revalidateCandidatePaths(candidate.id);
    return { candidateId: candidate.id, status: candidate.candidateStatus, message: "Candidate merged as duplicate." };
  });
}

export async function markCandidateMetricIneligibleAction(formData: FormData) {
  const candidate = await markCandidateMetricIneligible(candidateStatusInputFromFormData(formData));

  revalidateCandidatePaths(candidate.id);
  redirect(`/mqchain/candidates/${candidate.id}`);
}

export async function markCandidateMetricIneligibleResultAction(
  _previousState: CandidateMutationState,
  formData: FormData,
): Promise<CandidateMutationState> {
  return runAction(async () => {
    const candidate = await markCandidateMetricIneligible(candidateStatusInputFromFormData(formData));
    revalidateCandidatePaths(candidate.id);
    return { candidateId: candidate.id, status: candidate.candidateStatus, message: "Candidate marked metric ineligible." };
  });
}

export async function markCandidateSupersedesRegistryAction(formData: FormData) {
  const candidate = await markCandidateSupersedesRegistry(supersedeRegistryInputFromFormData(formData));

  revalidateCandidatePaths(candidate.id);
  revalidatePath("/mqchain/registry");
  redirect(`/mqchain/candidates/${candidate.id}`);
}

export async function markCandidateSupersedesRegistryResultAction(
  _previousState: CandidateMutationState,
  formData: FormData,
): Promise<CandidateMutationState> {
  return runAction(async () => {
    const candidate = await markCandidateSupersedesRegistry(supersedeRegistryInputFromFormData(formData));
    revalidateCandidatePaths(candidate.id);
    revalidatePath("/mqchain/registry");
    return { candidateId: candidate.id, status: candidate.candidateStatus, message: "Candidate approved to supersede an existing registry row." };
  });
}

export async function markCandidateHistoricalOnlyAction(formData: FormData) {
  const candidate = await markCandidateHistoricalOnly(historicalOnlyInputFromFormData(formData));

  revalidateCandidatePaths(candidate.id);
  revalidatePath("/mqchain/registry");
  redirect(`/mqchain/candidates/${candidate.id}`);
}

export async function markCandidateHistoricalOnlyResultAction(
  _previousState: CandidateMutationState,
  formData: FormData,
): Promise<CandidateMutationState> {
  return runAction(async () => {
    const candidate = await markCandidateHistoricalOnly(historicalOnlyInputFromFormData(formData));
    revalidateCandidatePaths(candidate.id);
    revalidatePath("/mqchain/registry");
    return { candidateId: candidate.id, status: candidate.candidateStatus, message: "Candidate approved as historical-only." };
  });
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

export async function reviewMarkCandidateMetricIneligibleResultAction(
  _previousState: CandidateMutationState,
  formData: FormData,
): Promise<CandidateMutationState> {
  return runAction(async () => {
    const returnTo = reviewReturnPath(formData);
    const candidate = await markCandidateMetricIneligible({
      candidateId: formValue(formData, "candidateId"),
      reason: formValue(formData, "reason") || "Metric-ineligible from review queue.",
    });

    revalidateReviewPaths(candidate.id, returnTo);
    return { candidateId: candidate.id, status: candidate.candidateStatus, message: "Candidate marked metric ineligible." };
  });
}

export async function createBatchAction(formData: FormData) {
  const batch = await createBatchFromCandidates(createBatchInputFromFormData(formData));

  revalidateBatchPaths(batch.id);
  redirect(`/mqchain/batches/${batch.id}`);
}

export async function createBatchResultAction(
  _previousState: BatchMutationState,
  formData: FormData,
): Promise<BatchMutationState> {
  return runAction(async () => {
    const batch = await createBatchFromCandidates(createBatchInputFromFormData(formData));
    revalidateBatchPaths(batch.id);
    return { batchId: batch.id, status: batch.status, message: "Batch created from approved candidates." };
  });
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

export async function createReviewBatchFromSelectionResultAction(
  _previousState: BatchMutationState,
  formData: FormData,
): Promise<BatchMutationState> {
  return runAction(async () => {
    const candidateIds = formData
      .getAll("candidateId")
      .filter((value): value is string => typeof value === "string")
      .join(", ");

    const batch = await createBatchFromCandidates({
      candidateIds,
      sourceName: formValue(formData, "sourceName") || "Review queue selected batch",
    });

    revalidateBatchPaths(batch.id);
    return { batchId: batch.id, status: batch.status, message: "Batch created from selected approved candidates." };
  });
}

export async function approveBatchAction(formData: FormData) {
  const batch = await approveBatch(batchIdInputFromFormData(formData));

  revalidateBatchPaths(batch.id);
  redirect(`/mqchain/batches/${batch.id}`);
}

export async function approveBatchResultAction(
  _previousState: BatchMutationState,
  formData: FormData,
): Promise<BatchMutationState> {
  return runAction(async () => {
    const batch = await approveBatch(batchIdInputFromFormData(formData));
    revalidateBatchPaths(batch.id);
    return { batchId: batch.id, status: batch.status, message: "Batch approved for commit." };
  });
}

export async function commitBatchAction(formData: FormData) {
  const result = await commitBatch(batchIdInputFromFormData(formData));

  revalidateBatchPaths(result.batch.id);
  redirect(`/mqchain/batches/${result.batch.id}`);
}

export async function commitBatchResultAction(
  _previousState: BatchMutationState,
  formData: FormData,
): Promise<BatchMutationState> {
  return runAction(async () => {
    const result = await commitBatch(batchIdInputFromFormData(formData));
    revalidateBatchPaths(result.batch.id);
    return {
      batchId: result.batch.id,
      status: result.batch.status,
      registryCount: result.registryIds.length,
      dictionaryVersion: result.dictionaryVersion,
      message: `Batch committed to registry with ${result.registryIds.length} rows and queued KV handoff.`,
    };
  });
}

export async function failBatchAction(formData: FormData) {
  const batch = await failBatch(batchLifecycleInputFromFormData(formData));

  revalidateBatchPaths(batch.id);
  redirect(`/mqchain/batches/${batch.id}`);
}

export async function failBatchResultAction(
  _previousState: BatchMutationState,
  formData: FormData,
): Promise<BatchMutationState> {
  return runAction(async () => {
    const batch = await failBatch(batchLifecycleInputFromFormData(formData));
    revalidateBatchPaths(batch.id);
    return { batchId: batch.id, status: batch.status, message: "Batch marked failed." };
  });
}

export async function supersedeBatchAction(formData: FormData) {
  const batch = await supersedeBatch(batchLifecycleInputFromFormData(formData));

  revalidateBatchPaths(batch.id);
  redirect(`/mqchain/batches/${batch.id}`);
}

export async function supersedeBatchResultAction(
  _previousState: BatchMutationState,
  formData: FormData,
): Promise<BatchMutationState> {
  return runAction(async () => {
    const batch = await supersedeBatch(batchLifecycleInputFromFormData(formData));
    revalidateBatchPaths(batch.id);
    return { batchId: batch.id, status: batch.status, message: "Batch marked superseded." };
  });
}

export async function createDiscoveryJobAction(formData: FormData) {
  const job = await createDiscoveryJob(discoveryJobInputFromFormData(formData));

  revalidateDiscoveryPaths(job.id);
  redirect(`/mqchain/discovery/jobs/${job.id}`);
}

export async function createDiscoveryJobResultAction(
  _previousState: DiscoveryMutationState,
  formData: FormData,
): Promise<DiscoveryMutationState> {
  return runAction(async () => {
    const job = await createDiscoveryJob(discoveryJobInputFromFormData(formData));
    revalidateDiscoveryPaths(job.id);
    return {
      jobId: job.id,
      status: job.status,
      message: `Discovery job ${job.id} created. Scanner execution remains external until results are completed into candidates.`,
    };
  });
}

export async function completeDiscoveryJobAction(formData: FormData) {
  const result = await completeDiscoveryJob(discoveryCompletionInputFromFormData(formData));

  revalidateDiscoveryPaths(result.job.id);
  redirect(`/mqchain/discovery/jobs/${result.job.id}`);
}

export async function completeDiscoveryJobResultAction(
  _previousState: DiscoveryMutationState,
  formData: FormData,
): Promise<DiscoveryMutationState> {
  return runAction(async () => {
    const result = await completeDiscoveryJob(discoveryCompletionInputFromFormData(formData));
    revalidateDiscoveryPaths(result.job.id);
    return {
      jobId: result.job.id,
      status: result.job.status,
      sourceJobId: result.sourceJobId,
      sourceDocumentId: result.sourceDocumentId,
      rows: result.rows,
      candidatesCreated: result.candidatesCreated,
      evidenceCreated: result.evidenceCreated,
      invalidRows: result.invalidRows,
      duplicates: result.duplicates,
      message: `Discovery completion staged ${result.candidatesCreated} candidates and ${result.evidenceCreated} evidence rows; registry truth still requires review and batch commit.`,
    };
  });
}

export async function createRegistryDiscoveryJobAction(formData: FormData) {
  const registryId = formValue(formData, "registryId");
  const job = await createDiscoveryJobFromRegistry(registryDiscoveryInputFromFormData(formData));

  revalidateRegistryPaths(registryId ?? undefined);
  revalidatePath("/mqchain/discovery/jobs");
  redirect(`/mqchain/discovery/jobs/${job.id}`);
}

export async function createRegistryDiscoveryJobResultAction(
  _previousState: RegistryMutationState,
  formData: FormData,
): Promise<RegistryMutationState> {
  return runAction(async () => {
    const registryId = formValue(formData, "registryId");
    const job = await createDiscoveryJobFromRegistry(registryDiscoveryInputFromFormData(formData));

    revalidateRegistryPaths(registryId ?? undefined);
    revalidatePath("/mqchain/discovery/jobs");

    return {
      registryId: Number(registryId),
      discoveryJobId: job.id,
      status: job.status,
      message: `Discovery job ${job.id} created from approved registry truth.`,
    };
  });
}

export async function createMetricGroupAction(formData: FormData) {
  const result = await createMetricGroup(metricGroupInputFromFormData(formData));

  revalidateMetricGroupPaths(result.group.id);
  redirect(`/mqchain/metric-groups?preview=${result.group.id}`);
}

export async function createMetricGroupResultAction(
  _previousState: MetricGroupMutationState,
  formData: FormData,
): Promise<MetricGroupMutationState> {
  return runAction(async () => {
    const result = await createMetricGroup(metricGroupInputFromFormData(formData));

    revalidateMetricGroupPaths(result.group.id);

    return {
      groupId: result.group.id,
      ruleId: result.rule.id,
      status: result.group.isActive ? "active" : "inactive",
      dictionaryVersion: result.dictionaryVersion,
      message: `Metric group ${result.group.metricGroupCode} created with an initial rule and dictionary version updated.`,
    };
  });
}

export async function addMetricGroupRuleAction(formData: FormData) {
  const result = await addMetricGroupRule(metricGroupRuleInputFromFormData(formData));

  revalidateMetricGroupPaths(result.group.id);
  redirect(`/mqchain/metric-groups?preview=${result.group.id}`);
}

export async function addMetricGroupRuleResultAction(
  _previousState: MetricGroupMutationState,
  formData: FormData,
): Promise<MetricGroupMutationState> {
  return runAction(async () => {
    const result = await addMetricGroupRule(metricGroupRuleInputFromFormData(formData));

    revalidateMetricGroupPaths(result.group.id);

    return {
      groupId: result.group.id,
      ruleId: result.rule.id,
      status: result.group.isActive ? "active" : "inactive",
      dictionaryVersion: result.dictionaryVersion,
      message: `Rule ${result.rule.id} added to ${result.group.metricGroupCode} and dictionary version updated.`,
    };
  });
}

export async function deactivateMetricGroupAction(formData: FormData) {
  const result = await deactivateMetricGroup(dictionaryIdInputFromFormData(formData));

  revalidateMetricGroupPaths(result.group.id);
  redirect("/mqchain/metric-groups");
}

export async function deactivateMetricGroupResultAction(
  _previousState: MetricGroupMutationState,
  formData: FormData,
): Promise<MetricGroupMutationState> {
  return runAction(async () => {
    const result = await deactivateMetricGroup(dictionaryIdInputFromFormData(formData));

    revalidateMetricGroupPaths(result.group.id);

    return {
      groupId: result.group.id,
      status: "inactive",
      dictionaryVersion: result.dictionaryVersion,
      message: `Metric group ${result.group.metricGroupCode} deactivated and dictionary version updated.`,
    };
  });
}

export async function createKvBuildManifestAction(formData: FormData) {
  const build = await createKvBuildManifest(createKvBuildManifestInputFromFormData(formData));

  revalidateKvBuildPaths(build.id);
  redirect(`/mqchain/kv-builds/${build.id}`);
}

export async function createKvBuildManifestResultAction(
  _previousState: KvBuildMutationState,
  formData: FormData,
): Promise<KvBuildMutationState> {
  return runAction(async () => {
    const build = await createKvBuildManifest(createKvBuildManifestInputFromFormData(formData));

    revalidateKvBuildPaths(build.id);

    return {
      buildId: build.id,
      status: build.status,
      buildHash: build.buildHash,
      message: `KV build manifest ${build.id} registered for external artifact tracking.`,
    };
  });
}

export async function activateKvBuildManifestAction(formData: FormData) {
  const build = await activateKvBuildManifest(kvBuildIdInputFromFormData(formData));

  revalidateKvBuildPaths(build.id);
  redirect(`/mqchain/kv-builds/${build.id}`);
}

export async function activateKvBuildManifestResultAction(
  _previousState: KvBuildMutationState,
  formData: FormData,
): Promise<KvBuildMutationState> {
  return runAction(async () => {
    const build = await activateKvBuildManifest(kvBuildIdInputFromFormData(formData));

    revalidateKvBuildPaths(build.id);

    return {
      buildId: build.id,
      status: build.status,
      buildHash: build.buildHash,
      message: "KV build manifest activated as the current serving artifact.",
    };
  });
}

export async function createEntityAction(formData: FormData) {
  await createEntity(entityInputFromFormData(formData));

  revalidateDictionaryPaths("entities");
  redirect("/mqchain/dictionaries/entities");
}

export async function createEntityResultAction(
  _previousState: DictionaryMutationState,
  formData: FormData,
): Promise<DictionaryMutationState> {
  return runAction(async () => {
    const entity = await createEntity(entityInputFromFormData(formData));
    revalidateDictionaryPaths("entities");
    return {
      dictionaryType: "entity",
      id: entity.id,
      code: entity.entityCode,
      status: entity.isActive ? "active" : "inactive",
      message: `Entity ${entity.entityCode} created and dictionary version updated.`,
    };
  });
}

export async function updateEntityResultAction(
  _previousState: DictionaryMutationState,
  formData: FormData,
): Promise<DictionaryMutationState> {
  return runAction(async () => {
    const entity = await updateEntity(entityUpdateInputFromFormData(formData));
    revalidateDictionaryPaths("entities");
    return {
      dictionaryType: "entity",
      id: entity.id,
      code: entity.entityCode,
      status: entity.isActive ? "active" : "inactive",
      message: `Entity ${entity.entityCode} updated and dictionary version updated.`,
    };
  });
}

export async function deactivateEntityAction(formData: FormData) {
  await deactivateEntity(dictionaryIdInputFromFormData(formData));
  revalidateDictionaryPaths("entities");
  redirect("/mqchain/dictionaries/entities");
}

export async function deactivateEntityResultAction(
  _previousState: DictionaryMutationState,
  formData: FormData,
): Promise<DictionaryMutationState> {
  return runAction(async () => {
    const entity = await deactivateEntity(dictionaryIdInputFromFormData(formData));
    revalidateDictionaryPaths("entities");
    return {
      dictionaryType: "entity",
      id: entity.id,
      code: entity.entityCode,
      status: "inactive",
      message: `Entity ${entity.entityCode} deactivated and dictionary version updated.`,
    };
  });
}

export async function createProtocolAction(formData: FormData) {
  await createProtocol(protocolInputFromFormData(formData));

  revalidateDictionaryPaths("protocols");
  redirect("/mqchain/dictionaries/protocols");
}

export async function createProtocolResultAction(
  _previousState: DictionaryMutationState,
  formData: FormData,
): Promise<DictionaryMutationState> {
  return runAction(async () => {
    const protocol = await createProtocol(protocolInputFromFormData(formData));
    revalidateDictionaryPaths("protocols");
    return {
      dictionaryType: "protocol",
      id: protocol.id,
      code: protocol.protocolCode,
      status: protocol.isActive ? "active" : "inactive",
      message: `Protocol ${protocol.protocolCode} created and dictionary version updated.`,
    };
  });
}

export async function updateProtocolResultAction(
  _previousState: DictionaryMutationState,
  formData: FormData,
): Promise<DictionaryMutationState> {
  return runAction(async () => {
    const protocol = await updateProtocol(protocolUpdateInputFromFormData(formData));
    revalidateDictionaryPaths("protocols");
    return {
      dictionaryType: "protocol",
      id: protocol.id,
      code: protocol.protocolCode,
      status: protocol.isActive ? "active" : "inactive",
      message: `Protocol ${protocol.protocolCode} updated and dictionary version updated.`,
    };
  });
}

export async function deactivateProtocolAction(formData: FormData) {
  await deactivateProtocol(dictionaryIdInputFromFormData(formData));
  revalidateDictionaryPaths("protocols");
  redirect("/mqchain/dictionaries/protocols");
}

export async function deactivateProtocolResultAction(
  _previousState: DictionaryMutationState,
  formData: FormData,
): Promise<DictionaryMutationState> {
  return runAction(async () => {
    const protocol = await deactivateProtocol(dictionaryIdInputFromFormData(formData));
    revalidateDictionaryPaths("protocols");
    return {
      dictionaryType: "protocol",
      id: protocol.id,
      code: protocol.protocolCode,
      status: "inactive",
      message: `Protocol ${protocol.protocolCode} deactivated and dictionary version updated.`,
    };
  });
}

export async function createCategoryAction(formData: FormData) {
  await createCategory(categoryInputFromFormData(formData));

  revalidateDictionaryPaths("categories");
  redirect("/mqchain/dictionaries/categories");
}

export async function createCategoryResultAction(
  _previousState: DictionaryMutationState,
  formData: FormData,
): Promise<DictionaryMutationState> {
  return runAction(async () => {
    const category = await createCategory(categoryInputFromFormData(formData));
    revalidateDictionaryPaths("categories");
    return {
      dictionaryType: "category",
      id: category.categoryId,
      code: category.categoryCode,
      status: category.isActive ? "active" : "inactive",
      message: `Category ${category.categoryCode} created and dictionary version updated.`,
    };
  });
}

export async function updateCategoryResultAction(
  _previousState: DictionaryMutationState,
  formData: FormData,
): Promise<DictionaryMutationState> {
  return runAction(async () => {
    const category = await updateCategory(categoryUpdateInputFromFormData(formData));
    revalidateDictionaryPaths("categories");
    return {
      dictionaryType: "category",
      id: category.categoryId,
      code: category.categoryCode,
      status: category.isActive ? "active" : "inactive",
      message: `Category ${category.categoryCode} updated and dictionary version updated.`,
    };
  });
}

export async function deactivateCategoryAction(formData: FormData) {
  await deactivateCategory(dictionaryIdInputFromFormData(formData));
  revalidateDictionaryPaths("categories");
  redirect("/mqchain/dictionaries/categories");
}

export async function deactivateCategoryResultAction(
  _previousState: DictionaryMutationState,
  formData: FormData,
): Promise<DictionaryMutationState> {
  return runAction(async () => {
    const category = await deactivateCategory(dictionaryIdInputFromFormData(formData));
    revalidateDictionaryPaths("categories");
    return {
      dictionaryType: "category",
      id: category.categoryId,
      code: category.categoryCode,
      status: "inactive",
      message: `Category ${category.categoryCode} deactivated and dictionary version updated.`,
    };
  });
}

export async function createRoleAction(formData: FormData) {
  await createRole(roleInputFromFormData(formData));

  revalidateDictionaryPaths("roles");
  redirect("/mqchain/dictionaries/roles");
}

export async function createRoleResultAction(
  _previousState: DictionaryMutationState,
  formData: FormData,
): Promise<DictionaryMutationState> {
  return runAction(async () => {
    const role = await createRole(roleInputFromFormData(formData));
    revalidateDictionaryPaths("roles");
    return {
      dictionaryType: "role",
      id: role.roleId,
      code: role.roleCode,
      status: role.isActive ? "active" : "inactive",
      message: `Role ${role.roleCode} created and dictionary version updated.`,
    };
  });
}

export async function updateRoleResultAction(
  _previousState: DictionaryMutationState,
  formData: FormData,
): Promise<DictionaryMutationState> {
  return runAction(async () => {
    const role = await updateRole(roleUpdateInputFromFormData(formData));
    revalidateDictionaryPaths("roles");
    return {
      dictionaryType: "role",
      id: role.roleId,
      code: role.roleCode,
      status: role.isActive ? "active" : "inactive",
      message: `Role ${role.roleCode} updated and dictionary version updated.`,
    };
  });
}

export async function deactivateRoleAction(formData: FormData) {
  await deactivateRole(dictionaryIdInputFromFormData(formData));
  revalidateDictionaryPaths("roles");
  redirect("/mqchain/dictionaries/roles");
}

export async function deactivateRoleResultAction(
  _previousState: DictionaryMutationState,
  formData: FormData,
): Promise<DictionaryMutationState> {
  return runAction(async () => {
    const role = await deactivateRole(dictionaryIdInputFromFormData(formData));
    revalidateDictionaryPaths("roles");
    return {
      dictionaryType: "role",
      id: role.roleId,
      code: role.roleCode,
      status: "inactive",
      message: `Role ${role.roleCode} deactivated and dictionary version updated.`,
    };
  });
}

export async function createKeyPrefixAction(formData: FormData) {
  await createKeyPrefix(keyPrefixInputFromFormData(formData));

  revalidateDictionaryPaths("key-prefixes");
  redirect("/mqchain/dictionaries/key-prefixes");
}

export async function createKeyPrefixResultAction(
  _previousState: DictionaryMutationState,
  formData: FormData,
): Promise<DictionaryMutationState> {
  return runAction(async () => {
    const prefix = await createKeyPrefix(keyPrefixInputFromFormData(formData));
    revalidateDictionaryPaths("key-prefixes");
    return {
      dictionaryType: "key_prefix",
      id: prefix.prefixCode,
      code: prefix.chainCode,
      status: prefix.isActive ? "active" : "inactive",
      message: `Key prefix 0x${prefix.prefixCode.toString(16).padStart(4, "0")} created and dictionary version updated.`,
    };
  });
}

export async function updateKeyPrefixResultAction(
  _previousState: DictionaryMutationState,
  formData: FormData,
): Promise<DictionaryMutationState> {
  return runAction(async () => {
    const prefix = await updateKeyPrefix(keyPrefixUpdateInputFromFormData(formData));
    revalidateDictionaryPaths("key-prefixes");
    return {
      dictionaryType: "key_prefix",
      id: prefix.prefixCode,
      code: prefix.chainCode,
      status: prefix.isActive ? "active" : "inactive",
      message: `Key prefix 0x${prefix.prefixCode.toString(16).padStart(4, "0")} updated and dictionary version updated.`,
    };
  });
}

export async function deactivateKeyPrefixAction(formData: FormData) {
  await deactivateKeyPrefix(dictionaryIdInputFromFormData(formData));
  revalidateDictionaryPaths("key-prefixes");
  redirect("/mqchain/dictionaries/key-prefixes");
}

export async function deactivateKeyPrefixResultAction(
  _previousState: DictionaryMutationState,
  formData: FormData,
): Promise<DictionaryMutationState> {
  return runAction(async () => {
    const prefix = await deactivateKeyPrefix(dictionaryIdInputFromFormData(formData));
    revalidateDictionaryPaths("key-prefixes");
    return {
      dictionaryType: "key_prefix",
      id: prefix.prefixCode,
      code: prefix.chainCode,
      status: "inactive",
      message: `Key prefix 0x${prefix.prefixCode.toString(16).padStart(4, "0")} deactivated and dictionary version updated.`,
    };
  });
}

export async function archiveSourceJobAction(formData: FormData) {
  const sourceJob = await archiveSourceJob({
    sourceJobId: formValue(formData, "sourceJobId"),
    archiveStorageUri: formValue(formData, "archiveStorageUri"),
    reason: formValue(formData, "reason"),
  });

  revalidateSourceJobPaths(sourceJob.id);
  redirect(`/mqchain/source-jobs/${sourceJob.id}`);
}

export async function archiveSourceJobResultAction(
  _previousState: SourceJobMutationState,
  formData: FormData,
): Promise<SourceJobMutationState> {
  return runAction(async () => {
    const sourceJob = await archiveSourceJob({
      sourceJobId: formValue(formData, "sourceJobId"),
      archiveStorageUri: formValue(formData, "archiveStorageUri"),
      reason: formValue(formData, "reason"),
    });

    revalidateSourceJobPaths(sourceJob.id);
    return {
      sourceJobId: sourceJob.id,
      status: sourceJob.status,
      archiveStorageUri: sourceJob.archiveStorageUri,
      message: `Source job ${sourceJob.id} marked archived and audit logged.`,
    };
  });
}

export async function recordSourceVerificationResultAction(
  _previousState: SourceJobMutationState,
  formData: FormData,
): Promise<SourceJobMutationState> {
  return runAction(async () => {
    const verification = await recordSourceVerification({
      sourceJobId: formValue(formData, "sourceJobId"),
      sourceDocumentId: formValue(formData, "sourceDocumentId"),
      candidateId: formValue(formData, "candidateId"),
      verificationScope: formValue(formData, "verificationScope"),
      sourceSheet: formValue(formData, "sourceSheet"),
      sourceUrl: formValue(formData, "sourceUrl"),
      sourceTrust: formValue(formData, "sourceTrust"),
      status: formValue(formData, "status"),
      notes: formValue(formData, "notes"),
      verificationEvidenceJson: formValue(formData, "verificationEvidenceJson"),
    });

    const sourceJobId = verification.sourceJobId ?? 0;
    const approvalCoverage = formValue(formData, "returnApprovalCoverage") === "true" && sourceJobId
      ? await getSourceJobApprovalCoverage(sourceJobId)
      : undefined;
    if (sourceJobId) revalidatePath(`/mqchain/source-jobs/${sourceJobId}`);
    revalidatePath("/mqchain/audit-log");
    return {
      sourceJobId,
      sourceVerificationId: verification.id,
      status: verification.status,
      approvalCoverage,
      message: `Source verification ${verification.id} recorded; candidates still require review and batch commit.`,
    };
  });
}

export async function rerunDictionaryResolutionResultAction(
  _previousState: SourceJobMutationState,
  formData: FormData,
): Promise<SourceJobMutationState> {
  return runAction(async () => {
    const sourceJobId = Number(formValue(formData, "sourceJobId"));
    const result = await rerunDictionaryResolution({ sourceJobId });
    revalidateSourceJobPaths(sourceJobId);
    return {
      sourceJobId,
      candidatesInspected: result.candidatesInspected,
      candidatesUpdated: result.candidatesUpdated,
      message: `Re-resolved ${result.candidatesInspected} candidates; ${result.candidatesUpdated} suggested dictionary mappings changed. Candidate status and evidence were preserved.`,
    };
  });
}

export async function updateRegistryLabelAction(formData: FormData) {
  const row = await updateRegistryLabel(registryEditInputFromFormData(formData));

  revalidateRegistryPaths(row.id);
  redirect(`/mqchain/registry/${row.id}`);
}

export async function deactivateRegistryLabelAction(formData: FormData) {
  const row = await deactivateRegistryLabel(registryIdInputFromFormData(formData));

  revalidateRegistryPaths(row.id);
  redirect(`/mqchain/registry/${row.id}`);
}

export async function addRegistrySecondaryRoleAction(formData: FormData) {
  const row = await addRegistrySecondaryRole(registrySecondaryRoleInputFromFormData(formData));

  revalidateRegistryPaths(row.id);
  redirect(`/mqchain/registry/${row.id}`);
}

export async function supersedeRegistryLabelAction(formData: FormData) {
  const replacementRegistryId = formValue(formData, "replacementRegistryId");
  const row = await supersedeRegistryLabel(registrySupersedeInputFromFormData(formData));

  revalidateRegistryPaths(row.id);
  if (replacementRegistryId) {
    revalidatePath(`/mqchain/registry/${replacementRegistryId}`);
  }
  redirect(`/mqchain/registry/${row.id}`);
}

export async function markRegistryHistoricalAction(formData: FormData) {
  const row = await markRegistryHistorical(registryIdInputFromFormData(formData));

  revalidateRegistryPaths(row.id);
  redirect(`/mqchain/registry/${row.id}`);
}

export async function updateRegistryLabelResultAction(
  _previousState: RegistryMutationState,
  formData: FormData,
): Promise<RegistryMutationState> {
  return runAction(async () => {
    const row = await updateRegistryLabel(registryEditInputFromFormData(formData));
    revalidateRegistryPaths(row.id);
    return { registryId: row.id, status: row.isActive ? "active" : "inactive", message: "Registry label updated." };
  });
}

export async function deactivateRegistryLabelResultAction(
  _previousState: RegistryMutationState,
  formData: FormData,
): Promise<RegistryMutationState> {
  return runAction(async () => {
    const row = await deactivateRegistryLabel(registryIdInputFromFormData(formData));
    revalidateRegistryPaths(row.id);
    return { registryId: row.id, status: "inactive", message: "Registry label deactivated." };
  });
}

export async function addRegistrySecondaryRoleResultAction(
  _previousState: RegistryMutationState,
  formData: FormData,
): Promise<RegistryMutationState> {
  return runAction(async () => {
    const row = await addRegistrySecondaryRole(registrySecondaryRoleInputFromFormData(formData));
    revalidateRegistryPaths(row.id);
    return { registryId: row.id, status: row.isActive ? "active" : "inactive", message: "Secondary role attached to registry label." };
  });
}

export async function supersedeRegistryLabelResultAction(
  _previousState: RegistryMutationState,
  formData: FormData,
): Promise<RegistryMutationState> {
  return runAction(async () => {
    const replacementRegistryId = formValue(formData, "replacementRegistryId");
    const row = await supersedeRegistryLabel(registrySupersedeInputFromFormData(formData));

    revalidateRegistryPaths(row.id);
    if (replacementRegistryId) {
      revalidatePath(`/mqchain/registry/${replacementRegistryId}`);
    }

    return { registryId: row.id, status: "superseded", message: "Registry label superseded." };
  });
}

export async function markRegistryHistoricalResultAction(
  _previousState: RegistryMutationState,
  formData: FormData,
): Promise<RegistryMutationState> {
  return runAction(async () => {
    const row = await markRegistryHistorical(registryIdInputFromFormData(formData));
    revalidateRegistryPaths(row.id);
    return { registryId: row.id, status: "historical", message: "Registry label marked historical." };
  });
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

export async function createSettingsUserResultAction(
  _previousState: SettingsMutationState,
  formData: FormData,
): Promise<SettingsMutationState> {
  return runAction(async () => {
    const user = await createSettingsUser({
      email: formValue(formData, "email"),
      displayName: formValue(formData, "displayName"),
      role: formValue(formData, "role"),
      password: formValue(formData, "password"),
    });

    revalidateSettingsPaths();
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      message: `User ${user.email} created with ${user.role} access.`,
    };
  });
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

export async function updateSettingsUserAccessResultAction(
  _previousState: SettingsMutationState,
  formData: FormData,
): Promise<SettingsMutationState> {
  return runAction(async () => {
    const user = await updateSettingsUserAccess({
      userId: formValue(formData, "userId"),
      role: formValue(formData, "role"),
      isActive: formData.has("isActive"),
    });

    revalidateSettingsPaths();
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      message: `${user.email} is now ${user.isActive ? "active" : "inactive"} with ${user.role} access.`,
    };
  });
}

export async function createNetworkProposalResultAction(
  _previousState: NetworkProposalMutationState,
  formData: FormData,
): Promise<NetworkProposalMutationState> {
  return runAction(async () => {
    const proposal = await createNetworkChangeProposal({
      changeType: formValue(formData, "changeType"),
      networkId: formValue(formData, "networkId") || null,
      proposedValues: JSON.parse(formValue(formData, "proposedValues") || "{}") as unknown,
      reason: formValue(formData, "reason"),
    });
    revalidatePath("/mqchain/dictionaries/network-support");
    return { proposalId: proposal.id, status: proposal.status, message: `Proposal #${proposal.id} submitted for manual review.` };
  });
}

export async function reviewNetworkProposalResultAction(
  _previousState: NetworkProposalMutationState,
  formData: FormData,
): Promise<NetworkProposalMutationState> {
  return runAction(async () => {
    const proposal = await reviewNetworkChangeProposal({ proposalId: formValue(formData, "proposalId"), action: formValue(formData, "action"), reviewNotes: formValue(formData, "reviewNotes") });
    revalidatePath("/mqchain/dictionaries/network-support");
    return { proposalId: proposal.id, status: proposal.status, message: `Proposal #${proposal.id} is ${proposal.status}.` };
  });
}
