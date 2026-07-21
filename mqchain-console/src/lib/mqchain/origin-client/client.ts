/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";

import type { CexFlowInput } from "../contracts/domain";
import type { OriginActorClaims } from "../contracts/origin";
export type { IntakeSummary } from "../contracts/domain";
import type * as AuditContract from "../contracts/dto/audit-service";
import type * as BatchContract from "../contracts/dto/batch-service";
import type * as BulkApprovalContract from "../contracts/dto/bulk-approval-service";
import type * as CandidateContract from "../contracts/dto/candidate-service";
import type * as CexContract from "../contracts/dto/cex-flow-service";
import type * as DashboardContract from "../contracts/dto/dashboard-origin-service";
import type * as DictionaryContract from "../contracts/dto/dictionary-service";
import type * as DiscoveryContract from "../contracts/dto/discovery-service";
import type * as EvidenceContract from "../contracts/dto/evidence-service";
import type * as KvContract from "../contracts/dto/kv-manifest-service";
import type * as MetricContract from "../contracts/dto/metric-group-service";
import type * as NetworkContract from "../contracts/dto/network-support-service";
import type * as RegistryContract from "../contracts/dto/registry-service";
import type * as ResolverContract from "../contracts/dto/resolver-service";
import type * as ReviewContract from "../contracts/dto/review-service";
import type * as SettingsContract from "../contracts/dto/settings-service";
import type * as SourceContract from "../contracts/dto/source-job-service";
import { encodeOriginActorClaims, MQCHAIN_ACTOR_HEADER, MQCHAIN_REQUEST_ID_HEADER, MQCHAIN_SIGNATURE_HEADER, signOriginRequest } from "../contracts/request-signing";
import type { OriginCatalogFile, OriginCatalogKey, OriginCatalogResponse } from "../contracts/catalog";
import type { ResearchIntakeCreatedDto, ResearchPreflightReportDto } from "../contracts/research-intake";
import type { RuntimeDictionaryDashboardDto } from "../contracts/runtime-dictionaries";
import type { SourceJobApprovalCoverageDto } from "../contracts/source-approval-coverage";
import { originClientErrorFromResponse } from "./errors";
import { parseOriginJson, serializeOriginBody } from "./serialization";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Actor = { id: string; email: string };
type RequestOptions = { method?: Method; body?: unknown; actor?: Actor | null; timeoutMs?: number };
type ServiceResult<T extends (...args: any[]) => any> = Awaited<ReturnType<T>>;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function queryPath(path: string, input?: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return path;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export async function requestOrigin<T = any>(pathAndQuery: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const bodyText = options.body === undefined ? "" : serializeOriginBody(options.body);
  const requestId = randomUUID();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "CF-Access-Client-Id": requiredEnv("CF_ACCESS_CLIENT_ID"),
    "CF-Access-Client-Secret": requiredEnv("CF_ACCESS_CLIENT_SECRET"),
    [MQCHAIN_REQUEST_ID_HEADER]: requestId,
  };
  if (bodyText) headers["Content-Type"] = "application/json";
  if (options.actor) {
    const claims: OriginActorClaims = {
      sub: options.actor.id,
      email: options.actor.email,
      aud: requiredEnv("MQCHAIN_REQUEST_AUDIENCE"),
      iat: Math.floor(Date.now() / 1000),
      jti: randomUUID(),
    };
    const encodedActor = encodeOriginActorClaims(claims);
    headers[MQCHAIN_ACTOR_HEADER] = encodedActor;
    headers[MQCHAIN_SIGNATURE_HEADER] = signOriginRequest({
      secret: requiredEnv("MQCHAIN_REQUEST_SIGNING_SECRET"), method, pathAndQuery, requestId, bodyText, encodedActor,
    });
  }
  let response: Response;
  try {
    response = await fetch(`${requiredEnv("MQCHAIN_ORIGIN_URL").replace(/\/+$/, "")}${pathAndQuery}`, {
      method, headers, body: bodyText || undefined, cache: "no-store", redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? (method === "GET" ? 15_000 : 30_000)),
    });
  } catch (error) {
    throw new Error(`MQCHAIN Origin is unavailable: ${error instanceof Error ? error.message : "request failed"}`);
  }
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try { payload = parseOriginJson(text); }
    catch { throw new Error("MQCHAIN Origin returned invalid JSON."); }
  }
  if (!response.ok) throw originClientErrorFromResponse(response.status, payload, response.headers.get(MQCHAIN_REQUEST_ID_HEADER) ?? requestId);
  return payload as T;
}

async function employeeRequest<T = any>(permission: string, path: string, options: Omit<RequestOptions, "actor"> = {}): Promise<T> {
  const { assertPermission } = await import("@/lib/auth/permissions");
  const actor = await assertPermission(permission);
  return requestOrigin<T>(path, { ...options, actor: { id: actor.id, email: actor.email } });
}

const read = <T = any>(path: string, input?: unknown) => employeeRequest<T>("view", queryPath(path, input));
const mutate = <T = any>(permission: string, path: string, body: unknown, method: Method = "POST") => employeeRequest<T>(permission, path, { method, body });
const inputId = (input: unknown, key: string) => String((input as Record<string, unknown>)?.[key] ?? "");

export const authenticateWithOrigin = (email: string, password: string) =>
  requestOrigin<{ id: string; email: string; name: string | null; role: string }>("/v1/auth/credentials", { method: "POST", body: { email, password }, timeoutMs: 10_000 });

export const getDashboardOverview = () => read<ServiceResult<typeof DashboardContract.getDashboardOverviewFromDatabase>>("/v1/dashboard/overview");
export const listCandidates = (input?: unknown) => read<ServiceResult<typeof CandidateContract.listCandidatesFromDatabase>>("/v1/candidates", input);
export const getCandidateDetail = (id: number) => read<ServiceResult<typeof CandidateContract.getCandidateDetail>>(`/v1/candidates/${id}`);
export const listSourceJobs = (input?: unknown) => read<ServiceResult<typeof SourceContract.listSourceJobs>>("/v1/source-jobs", input);
export const getSourceJob = (id: number) => read<ServiceResult<typeof SourceContract.getSourceJob>>(`/v1/source-jobs/${id}`);
export const getSourceJobApprovalCoverage = (id: number) => employeeRequest<SourceJobApprovalCoverageDto>("candidate:review", `/v1/source-jobs/${id}/approval-coverage`);
export const getSourceJobDeletionPreview = (id: number) => employeeRequest<ServiceResult<typeof SourceContract.getSourceJobDeletionPreview>>("intake:delete", `/v1/source-jobs/${id}/delete-preview`);
export const deleteSourceJob = (id: number, confirmation: string) => mutate<ServiceResult<typeof SourceContract.deletePendingSourceJob>>("intake:delete", `/v1/source-jobs/${id}`, { confirmation }, "DELETE");
export const getReviewWorkspace = (input?: unknown) => read<ServiceResult<typeof ReviewContract.getReviewWorkspace>>("/v1/review", input);
export const getReviewGroupsWorkspace = (input?: unknown) => read<ServiceResult<typeof ReviewContract.getReviewGroupsWorkspace>>("/v1/review/groups", input);
export const getReviewGroupDetail = (slug: string) => read<ServiceResult<typeof ReviewContract.getReviewGroupDetail>>(`/v1/review/groups/${encodeURIComponent(slug)}`);
export const listBatches = (input?: unknown) => read<ServiceResult<typeof BatchContract.listBatches>>("/v1/batches", input);
export const getBatchDetail = (id: number) => read<ServiceResult<typeof BatchContract.getBatchDetail>>(`/v1/batches/${id}`);
export const listRegistry = (input?: unknown) => read<ServiceResult<typeof RegistryContract.listRegistry>>("/v1/registry", input);
export const getRegistryDetail = (id: number) => read<ServiceResult<typeof RegistryContract.getRegistryDetail>>(`/v1/registry/${id}`);
export const listEvidenceLedger = (input?: unknown) => read<ServiceResult<typeof EvidenceContract.listEvidenceLedger>>("/v1/evidence", input);
export const listAuditTimeline = (input?: unknown) => read<ServiceResult<typeof AuditContract.listAuditTimeline>>("/v1/audit-log", input);
export const listAuditLog = listAuditTimeline;
export const listSettingsUsers = () => read<ServiceResult<typeof SettingsContract.listSettingsUsers>>("/v1/settings/users");
export const listDictionaries = () => read<ServiceResult<typeof DictionaryContract.listDictionaries>>("/v1/dictionaries");
export const getDictionaryOverview = () => read<ServiceResult<typeof DictionaryContract.getDictionaryOverview>>("/v1/dictionaries/overview");
export const listDictionaryVersions = (limit = 20) => read<ServiceResult<typeof DictionaryContract.listDictionaryVersions>>("/v1/dictionaries/versions", { limit });
export const listDictionaryVersionHistory = (input?: unknown) => read<ServiceResult<typeof DictionaryContract.listDictionaryVersionHistory>>("/v1/dictionaries/versions", input);
export const listEntities = (input?: unknown) => read<ServiceResult<typeof DictionaryContract.listEntities>>("/v1/dictionaries/entities", input);
export const listProtocols = (input?: unknown) => read<ServiceResult<typeof DictionaryContract.listProtocols>>("/v1/dictionaries/protocols", input);
export const listCategories = (input?: unknown) => read<ServiceResult<typeof DictionaryContract.listCategories>>("/v1/dictionaries/categories", input);
export const listRoles = (input?: unknown) => read<ServiceResult<typeof DictionaryContract.listRoles>>("/v1/dictionaries/roles", input);
export const listKeyPrefixes = (input?: unknown) => read<ServiceResult<typeof DictionaryContract.listKeyPrefixes>>("/v1/dictionaries/key-prefixes", input);
export const getRuntimeDictionaryDashboard = () => read<RuntimeDictionaryDashboardDto>("/v1/dictionaries/runtime-u1");
export const listMetricGroups = (input?: unknown) => read<ServiceResult<typeof MetricContract.listMetricGroups>>("/v1/metric-groups", input);
export const previewMetricGroupMembers = (metricGroupId: number, focusedRegistryId?: number | null) => read<ServiceResult<typeof MetricContract.previewMetricGroupMembers>>(`/v1/metric-groups/${metricGroupId}/members`, { focusedRegistryId });
export const previewMetricGroupMembersByCode = (code: string, focusedRegistryId?: number | null) => read<ServiceResult<typeof MetricContract.previewMetricGroupMembersByCode>>(`/v1/metric-groups/${encodeURIComponent(code)}/members`, { focusedRegistryId, byCode: true });
export const listDiscoveryJobs = (input?: unknown) => read<ServiceResult<typeof DiscoveryContract.listDiscoveryJobs>>("/v1/discovery/jobs", input);
export const getDiscoveryJob = (id: number) => read<ServiceResult<typeof DiscoveryContract.getDiscoveryJobDetail>>(`/v1/discovery/jobs/${id}`);
export const getDiscoveryJobDetail = getDiscoveryJob;
export const listKvBuilds = (input?: unknown) => read<ServiceResult<typeof KvContract.listKvBuilds>>("/v1/kv-builds", input);
export const getKvBuild = (id: number) => read<ServiceResult<typeof KvContract.getKvBuildDetail>>(`/v1/kv-builds/${id}`);
export const getKvBuildDetail = getKvBuild;
export const getActiveKvBuildDetail = () => read<ServiceResult<typeof KvContract.getActiveKvBuildDetail>>("/v1/kv-builds/active");
export const listKvFilters = () => read<Array<{ filter: Record<string, any>; buildHash: string | null }>>("/v1/kv-filters");
export const listNetworkSupportMatrix = () => read<ServiceResult<typeof NetworkContract.listNetworkSupportMatrix>>("/v1/network-support/matrix");
export const getNetworkCatalogDrift = () => read<ServiceResult<typeof NetworkContract.getNetworkCatalogDrift>>("/v1/network-support/drift");
export const resolveCurrent = (chainCode: string, address: string) => read<ServiceResult<typeof ResolverContract.resolveCurrent>>("/v1/resolver", { chainCode, address });
export const resolveAt = (chainCode: string, address: string, blockNumber?: number | null) => read<ServiceResult<typeof ResolverContract.resolveAt>>("/v1/resolver", { chainCode, address, blockNumber });
export const checkMetricGroup = (chainCode: string, address: string, metricGroupCode: string, blockNumber?: number | null) => read<ServiceResult<typeof ResolverContract.checkMetricGroup>>("/v1/resolver", { chainCode, address, metricGroupCode, blockNumber });
export const getAddressResolver = () => ({ resolveCurrent, resolveAt, checkMetricGroup });
export const classifyCexTransactionFlow = (input: CexFlowInput, resolver?: unknown) => { void resolver; return mutate<ServiceResult<typeof CexContract.classifyCexTransactionFlow>>("view", "/v1/resolver/cex-flow", input); };
export const parseTransactionAddressSet = (value: string) => value.split(/[\r\n,]+/).map(item => item.trim()).filter(Boolean);

const intake = (intakeType: string, input: unknown) => mutate("intake:create", "/v1/intake", { intakeType, input }, "POST");
export const createManualIntake = (input: unknown) => intake("manual", input);
export const createCsvIntake = (input: unknown) => intake("csv", input);
export const createAiCleanedCsvIntake = (input: unknown) => intake("ai_cleaned_csv", input);
export const createUrlIntake = (input: unknown) => intake("url", input);
export const createJsonEvidenceIntake = (input: unknown) => intake("json_evidence", input);
export const createDeploymentSourceIntake = (input: unknown) => intake("deployment", input);
export const preflightResearchIntake = (input: unknown) => mutate<ResearchPreflightReportDto>("intake:create", "/v1/intake/preflight", input);
export const createResearchIntake = (input: unknown) => mutate<ResearchIntakeCreatedDto>("intake:create", "/v1/intake/research", input);
export const listDictionaryProposals = () => read<Record<string, unknown>[]>("/v1/dictionary-proposals");
export const createDictionaryProposal = (input: unknown) => mutate<Record<string, unknown>>("intake:create", "/v1/dictionary-proposals", input);
export const reviewDictionaryProposal = (input: unknown) => mutate<Record<string, unknown>>("dictionary:edit", `/v1/dictionary-proposals/${inputId(input, "proposalId")}`, input, "PATCH");
export const rerunDictionaryResolution = (input: unknown) => mutate<{ dictionaryVersion: string; candidatesInspected: number; candidatesUpdated: number }>("dictionary:edit", "/v1/dictionary-resolution/rerun", input);

const candidateReview = (action: string, input: unknown) => mutate("candidate:review", `/v1/candidates/${inputId(input, "candidateId")}/review`, { action, input });
export const approveCandidate = (input: unknown) => candidateReview("approve", input);
export const approveCandidateAsSuggested = (input: unknown) => candidateReview("approve_suggested", input);
export const rejectCandidate = (input: unknown) => candidateReview("reject", input);
export const markCandidateNeedsMoreEvidence = (input: unknown) => candidateReview("needs_more_evidence", input);
export const markCandidateConflict = (input: unknown) => candidateReview("conflict", input);
export const markCandidateDuplicate = (input: unknown) => candidateReview("duplicate", input);
export const markCandidateSupersedesRegistry = (input: unknown) => candidateReview("supersedes_registry", input);
export const markCandidateHistoricalOnly = (input: unknown) => candidateReview("historical_only", input);
export const markCandidateMetricIneligible = (input: unknown) => candidateReview("metric_ineligible", input);
export const previewBulkCandidateApproval = (input: unknown) => mutate<ServiceResult<typeof BulkApprovalContract.previewBulkCandidateApproval>>("candidate:review", "/v1/candidates/bulk-approval/preview", input);
export const executeBulkCandidateApproval = (input: unknown) => mutate<ServiceResult<typeof BulkApprovalContract.executeBulkCandidateApproval>>("candidate:review", "/v1/candidates/bulk-approval", input);
export const addCandidateEvidence = (input: unknown) => mutate("candidate:evidence", `/v1/candidates/${inputId(input, "candidateId")}/evidence`, input);
export const addRegistryEvidence = (input: unknown) => mutate("registry:edit", `/v1/registry/${inputId(input, "registryId")}/evidence`, input);

export const createBatchFromCandidates = (input: unknown) => mutate("candidate:review", "/v1/batches", input);
const batchTransition = (action: string, permission: string, input: unknown) => mutate(permission, `/v1/batches/${inputId(input, "batchId")}/${action}`, input);
export const approveBatch = (input: unknown) => batchTransition("approve", "candidate:review", input);
export const commitBatch = (input: unknown) => batchTransition("commit", "batch:commit", input);
export const failBatch = (input: unknown) => batchTransition("fail", "candidate:review", input);
export const supersedeBatch = (input: unknown) => batchTransition("supersede", "candidate:review", input);

export const createDiscoveryJob = (input: unknown) => mutate("discovery:create", "/v1/discovery/jobs", { mode: "create", input });
export const createDiscoveryJobFromRegistry = (input: unknown) => mutate("discovery:create", "/v1/discovery/jobs", { mode: "from_registry", input });
export const completeDiscoveryJob = (input: unknown) => mutate("discovery:create", `/v1/discovery/jobs/${inputId(input, "jobId")}/complete`, input);
export const createKvBuildManifest = (input: unknown) => mutate("batch:commit", "/v1/kv-builds", input);
export const activateKvBuildManifest = (input: unknown) => mutate("batch:commit", `/v1/kv-builds/${inputId(input, "buildId")}/activate`, input);
export const createMetricGroup = (input: unknown) => mutate("dictionary:edit", "/v1/metric-groups", input);
export const addMetricGroupRule = (input: unknown) => mutate("dictionary:edit", `/v1/metric-groups/${inputId(input, "metricGroupId")}/rules`, input);
export const deactivateMetricGroup = (input: unknown) => mutate("dictionary:edit", `/v1/metric-groups/${inputId(input, "metricGroupId")}/deactivate`, input);
export const archiveSourceJob = (input: unknown) => mutate("intake:create", `/v1/source-jobs/${inputId(input, "sourceJobId")}/archive`, input);
export const recordSourceVerification = (input: unknown) => mutate("source:verify", `/v1/source-jobs/${inputId(input, "sourceJobId")}/verifications`, input);

const dictionaryMutation = (kind: string, action: string, input: unknown) => mutate("dictionary:edit", `/v1/dictionaries/${kind}`, { action, input }, action === "create" ? "POST" : "PATCH");
export const createEntity = (input: unknown) => dictionaryMutation("entities", "create", input);
export const updateEntity = (input: unknown) => dictionaryMutation("entities", "update", input);
export const deactivateEntity = (input: unknown) => dictionaryMutation("entities", "deactivate", input);
export const createProtocol = (input: unknown) => dictionaryMutation("protocols", "create", input);
export const updateProtocol = (input: unknown) => dictionaryMutation("protocols", "update", input);
export const deactivateProtocol = (input: unknown) => dictionaryMutation("protocols", "deactivate", input);
export const createCategory = (input: unknown) => dictionaryMutation("categories", "create", input);
export const updateCategory = (input: unknown) => dictionaryMutation("categories", "update", input);
export const deactivateCategory = (input: unknown) => dictionaryMutation("categories", "deactivate", input);
export const createRole = (input: unknown) => dictionaryMutation("roles", "create", input);
export const updateRole = (input: unknown) => dictionaryMutation("roles", "update", input);
export const deactivateRole = (input: unknown) => dictionaryMutation("roles", "deactivate", input);
export const createKeyPrefix = (input: unknown) => dictionaryMutation("key-prefixes", "create", input);
export const updateKeyPrefix = (input: unknown) => dictionaryMutation("key-prefixes", "update", input);
export const deactivateKeyPrefix = (input: unknown) => dictionaryMutation("key-prefixes", "deactivate", input);

const registryMutation = (action: string, input: unknown) => mutate("registry:edit", `/v1/registry/${inputId(input, "registryId")}`, { action, input }, "PATCH");
export const updateRegistryLabel = (input: unknown) => registryMutation("update", input);
export const addRegistrySecondaryRole = (input: unknown) => registryMutation("add_secondary_role", input);
export const supersedeRegistryLabel = (input: unknown) => registryMutation("supersede", input);
export const deactivateRegistryLabel = (input: unknown) => registryMutation("deactivate", input);
export const markRegistryHistorical = (input: unknown) => registryMutation("mark_historical", input);
export const createSettingsUser = (input: unknown) => mutate("settings:edit", "/v1/settings/users", input);
export const updateSettingsUserAccess = (input: unknown) => mutate("settings:edit", `/v1/settings/users/${inputId(input, "userId")}`, input, "PATCH");
export const createNetworkChangeProposal = (input: unknown) => mutate("network:propose", "/v1/network-proposals", input);
export const reviewNetworkChangeProposal = (input: unknown) => mutate("network:review", `/v1/network-proposals/${inputId(input, "proposalId")}`, input, "PATCH");

export const getOriginCatalog = (catalogKey: OriginCatalogKey) => read<OriginCatalogResponse>(`/v1/catalog/${catalogKey}`);
export async function getOriginCatalogFile(file: OriginCatalogFile): Promise<OriginCatalogResponse> {
  const key = file === "chain_networks.csv" ? "networks" : file === "address_codecs.csv" ? "codecs" : file === "protocol_components.csv" ? "components" : file === "assets.csv" ? "assets" : "token-standards";
  return getOriginCatalog(key);
}
