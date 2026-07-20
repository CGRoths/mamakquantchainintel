import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { compare } from "bcryptjs";
import { asc, eq, sql } from "drizzle-orm";
import { ZodError } from "zod";

import { getDb } from "../src/db/client";
import { mqKvBuilds, mqKvFilterManifests, mqUsers } from "../src/db/schema";
import { ROLE_PERMISSIONS, type MqUserRole } from "../src/lib/mqchain/constants";
import { CATALOG_KEY_TO_FILE, ORIGIN_CATALOG_KEYS, type OriginCatalogKey } from "../src/lib/mqchain/contracts/catalog";
import type { VerifiedOriginActor } from "../src/lib/mqchain/contracts/origin";
import { decodeOriginActorClaims, MQCHAIN_ACTOR_HEADER, MQCHAIN_REQUEST_ID_HEADER, MQCHAIN_SIGNATURE_HEADER, originActorClaimError, OriginReplayWindow, verifyOriginRequestSignature } from "../src/lib/mqchain/contracts/request-signing";
import { loadAndValidateU1Catalog } from "../src/lib/mqchain/catalog/u1";
import { runWithOriginActor } from "../src/lib/mqchain/origin-only/actor-context";
import { serializeOriginBody } from "../src/lib/mqchain/origin-client/serialization";
import { listAuditTimeline } from "../src/lib/mqchain/services/audit-service";
import { approveCandidate, approveCandidateAsSuggested, markCandidateConflict, markCandidateDuplicate, markCandidateHistoricalOnly, markCandidateMetricIneligible, markCandidateNeedsMoreEvidence, markCandidateSupersedesRegistry, rejectCandidate } from "../src/lib/mqchain/services/approval-service";
import { approveBatch, commitBatch, createBatchFromCandidates, failBatch, getBatchDetail, listBatches, supersedeBatch } from "../src/lib/mqchain/services/batch-service";
import { createAiCleanedCsvIntake, createCsvIntake, createDeploymentSourceIntake, createJsonEvidenceIntake, createManualIntake, createUrlIntake, getCandidateDetail, listCandidatesFromDatabase } from "../src/lib/mqchain/services/candidate-service";
import { classifyCexTransactionFlow } from "../src/lib/mqchain/services/cex-flow-service";
import type { CexFlowInput } from "../src/lib/mqchain/services/cex-flow-service";
import { getDashboardOverviewFromDatabase } from "../src/lib/mqchain/services/dashboard-origin-service";
import { createCategory, createEntity, createKeyPrefix, createProtocol, createRole, deactivateCategory, deactivateEntity, deactivateKeyPrefix, deactivateProtocol, deactivateRole, getDictionaryOverview, listCategories, listDictionaries, listDictionaryVersionHistory, listEntities, listKeyPrefixes, listProtocols, listRoles, updateCategory, updateEntity, updateKeyPrefix, updateProtocol, updateRole } from "../src/lib/mqchain/services/dictionary-service";
import { completeDiscoveryJob, createDiscoveryJob, createDiscoveryJobFromRegistry, getDiscoveryJobDetail, listDiscoveryJobs } from "../src/lib/mqchain/services/discovery-service";
import { addCandidateEvidence, addRegistryEvidence, listEvidenceLedger } from "../src/lib/mqchain/services/evidence-service";
import { activateKvBuildManifest, createKvBuildManifest, getActiveKvBuildDetail, getKvBuildDetail, listKvBuilds } from "../src/lib/mqchain/services/kv-manifest-service";
import { addMetricGroupRule, createMetricGroup, deactivateMetricGroup, listMetricGroups, previewMetricGroupMembers, previewMetricGroupMembersByCode } from "../src/lib/mqchain/services/metric-group-service";
import { createNetworkChangeProposal, getNetworkCatalogDrift, listNetworkSupportMatrix, reviewNetworkChangeProposal } from "../src/lib/mqchain/services/network-support-service";
import { addRegistrySecondaryRole, deactivateRegistryLabel, getRegistryDetail, listRegistry, markRegistryHistorical, supersedeRegistryLabel, updateRegistryLabel } from "../src/lib/mqchain/services/registry-service";
import { getAddressResolver } from "../src/lib/mqchain/services/resolver-service";
import { getReviewGroupDetail, getReviewGroupsWorkspace, getReviewWorkspace } from "../src/lib/mqchain/services/review-service";
import { createSettingsUser, listSettingsUsers, updateSettingsUserAccess } from "../src/lib/mqchain/services/settings-service";
import { archiveSourceJob, deletePendingSourceJob, getSourceJob, getSourceJobDeletionPreview, listSourceJobs, recordSourceVerification } from "../src/lib/mqchain/services/source-job-service";
import { SourceJobDeletionError } from "../src/lib/mqchain/source-job-deletion";
import { createResearchIntake, preflightResearchIntake, ResearchIntakeError } from "../src/lib/mqchain/services/research-intake-service";
import { createDictionaryProposal, listDictionaryProposals, rerunDictionaryResolution, reviewDictionaryProposal } from "../src/lib/mqchain/services/dictionary-proposal-service";

const BODY_LIMITS = {
  credentials: 16 * 1024,
  standard: 64 * 1024,
  manifest: 1024 * 1024,
  intake: 1024 * 1024 + 64 * 1024,
} as const;
const replayWindow = new OriginReplayWindow();

export class OriginHttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = "OriginHttpError";
  }
}

function header(request: IncomingMessage, name: string) {
  const value = request.headers[name];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

function bodyLimitFor(method: string, pathname: string) {
  if (method === "GET" || method === "HEAD") return 0;
  if (pathname === "/v1/auth/credentials") return BODY_LIMITS.credentials;
  if (pathname === "/v1/intake" || pathname.startsWith("/v1/intake/")) return BODY_LIMITS.intake;
  if (pathname === "/v1/kv-builds" || /^\/v1\/discovery\/jobs\/\d+\/complete$/.test(pathname)) return BODY_LIMITS.manifest;
  return BODY_LIMITS.standard;
}

async function readBody(request: IncomingMessage, maxBytes: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) throw new OriginHttpError(413, "body_too_large", "Request body is too large.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseBody(rawBody: string): Record<string, unknown> {
  if (!rawBody.trim()) return {};
  try {
    const value = JSON.parse(rawBody) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required");
    return value as Record<string, unknown>;
  } catch {
    throw new OriginHttpError(400, "invalid_json", "Request body must be a JSON object.");
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown, requestId: string) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-MQCHAIN-Request-Id", requestId);
  response.end(serializeOriginBody(value));
}

function roleCan(role: string, permission: string) {
  return (ROLE_PERMISSIONS[role as MqUserRole] ?? []).includes(permission);
}

function requirePermission(actor: VerifiedOriginActor, permission: string) {
  if (!roleCan(actor.role, permission)) throw new OriginHttpError(403, "permission_denied", "You do not have permission to perform this action.");
}

async function authenticateEmployee(request: IncomingMessage, rawBody: string, pathAndQuery: string, requestId: string): Promise<VerifiedOriginActor> {
  const encodedActor = header(request, MQCHAIN_ACTOR_HEADER);
  const signature = header(request, MQCHAIN_SIGNATURE_HEADER);
  if (!encodedActor || !signature) throw new OriginHttpError(401, "signature_required", "Signed employee context is required.");
  const secret = process.env.MQCHAIN_REQUEST_SIGNING_SECRET?.trim();
  const audience = process.env.MQCHAIN_REQUEST_AUDIENCE?.trim();
  if (!secret || !audience) throw new OriginHttpError(503, "signing_not_configured", "Origin request signing is not configured.");
  let claims;
  try { claims = decodeOriginActorClaims(encodedActor); }
  catch { throw new OriginHttpError(401, "invalid_actor_context", "Employee context is invalid."); }
  const nowSeconds = Math.floor(Date.now() / 1000);
  const claimError = originActorClaimError(claims, audience, nowSeconds);
  if (claimError === "invalid_audience") throw new OriginHttpError(401, claimError, "Employee context audience is invalid.");
  if (claimError === "expired_signature") throw new OriginHttpError(401, claimError, "Employee context has expired.");
  const valid = verifyOriginRequestSignature({
    secret, signature, method: request.method ?? "GET", pathAndQuery, requestId, bodyText: rawBody, encodedActor,
  });
  if (!valid) throw new OriginHttpError(401, "invalid_signature", "Request signature is invalid.");
  if (!replayWindow.checkAndRemember(claims.jti, nowSeconds)) throw new OriginHttpError(409, "replayed_request", "The signed request has already been used.");
  const [user] = await getDb().select({ id: mqUsers.id, email: mqUsers.email, name: mqUsers.displayName, role: mqUsers.role, isActive: mqUsers.isActive }).from(mqUsers).where(eq(mqUsers.id, claims.sub)).limit(1);
  if (!user || !user.isActive || !roleCan(user.role, "view")) throw new OriginHttpError(403, "inactive_employee", "Employee access is inactive.");
  if (user.email.toLowerCase() !== claims.email.toLowerCase()) throw new OriginHttpError(401, "employee_mismatch", "Employee context does not match the current account.");
  return { id: user.id, email: user.email, name: user.name ?? user.email, role: user.role };
}

async function authorized<T>(actor: VerifiedOriginActor, permission: string, callback: () => Promise<T> | T) {
  requirePermission(actor, permission);
  return runWithOriginActor(actor, callback);
}

function queryObject(url: URL) { return Object.fromEntries(url.searchParams.entries()); }

async function publicRoute(method: string, pathname: string, body: Record<string, unknown>) {
  if (method === "GET" && (pathname === "/v1/health" || pathname === "/v1/ready")) {
    await getDb().execute(sql`select 1 as ok`);
    return pathname.endsWith("ready") ? { ready: true, service: "mqchain-origin", database: "reachable" } : { status: "ok", service: "mqchain-origin", database: "reachable" };
  }
  if (method === "GET" && pathname === "/v1/version") return { service: "mqchain-origin", apiVersion: "v1", applicationVersion: "0.1.0" };
  if (method === "POST" && pathname === "/v1/auth/credentials") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password || email.length > 320 || password.length > 1024) throw new OriginHttpError(400, "invalid_credentials_input", "A valid email and password are required.");
    const [user] = await getDb().select().from(mqUsers).where(eq(mqUsers.email, email)).limit(1);
    if (!user?.passwordHash || !user.isActive || !(await compare(password, user.passwordHash))) throw new OriginHttpError(401, "invalid_credentials", "Invalid credentials.");
    return { id: user.id, email: user.email, name: user.displayName, role: user.role };
  }
  return undefined;
}

async function employeeRoute(method: string, pathname: string, url: URL, body: Record<string, unknown>, actor: VerifiedOriginActor): Promise<unknown> {
  const query = queryObject(url);
  if (method === "GET" && pathname === "/v1/dashboard/overview") return authorized(actor, "view", getDashboardOverviewFromDatabase);
  if (method === "GET" && pathname === "/v1/candidates") return authorized(actor, "view", () => listCandidatesFromDatabase(query));
  let match = pathname.match(/^\/v1\/candidates\/(\d+)$/);
  if (method === "GET" && match) return authorized(actor, "view", () => getCandidateDetail(Number(match![1])));
  if (method === "GET" && pathname === "/v1/source-jobs") return authorized(actor, "view", () => listSourceJobs(query));
  match = pathname.match(/^\/v1\/source-jobs\/(\d+)\/delete-preview$/);
  if (method === "GET" && match) return authorized(actor, "intake:delete", () => getSourceJobDeletionPreview(Number(match![1])));
  match = pathname.match(/^\/v1\/source-jobs\/(\d+)$/);
  if (method === "GET" && match) return authorized(actor, "view", () => getSourceJob(Number(match![1])));
  if (method === "GET" && pathname === "/v1/review") return authorized(actor, "view", () => getReviewWorkspace(query));
  if (method === "GET" && pathname === "/v1/review/groups") return authorized(actor, "view", () => getReviewGroupsWorkspace(query));
  match = pathname.match(/^\/v1\/review\/groups\/([^/]+)$/);
  if (method === "GET" && match) return authorized(actor, "view", () => getReviewGroupDetail(decodeURIComponent(match![1])));
  if (method === "GET" && pathname === "/v1/batches") return authorized(actor, "view", () => listBatches(query));
  match = pathname.match(/^\/v1\/batches\/(\d+)$/);
  if (method === "GET" && match) return authorized(actor, "view", () => getBatchDetail(Number(match![1])));
  if (method === "GET" && pathname === "/v1/registry") return authorized(actor, "view", () => listRegistry(query));
  match = pathname.match(/^\/v1\/registry\/(\d+)$/);
  if (method === "GET" && match) return authorized(actor, "view", () => getRegistryDetail(Number(match![1])));
  if (method === "GET" && pathname === "/v1/evidence") return authorized(actor, "view", () => listEvidenceLedger(query));
  if (method === "GET" && pathname === "/v1/audit-log") return authorized(actor, "view", () => listAuditTimeline(query));
  if (method === "GET" && pathname === "/v1/settings/users") return authorized(actor, "view", listSettingsUsers);
  if (method === "GET" && pathname === "/v1/dictionaries") return authorized(actor, "view", listDictionaries);
  if (method === "GET" && pathname === "/v1/dictionaries/overview") return authorized(actor, "view", getDictionaryOverview);
  if (method === "GET" && pathname === "/v1/dictionaries/versions") return authorized(actor, "view", () => listDictionaryVersionHistory(query));
  if (method === "GET" && pathname === "/v1/dictionary-proposals") return authorized(actor, "view", listDictionaryProposals);
  const dictionaryReaders: Record<string, (input: unknown) => Promise<unknown>> = { entities: listEntities, protocols: listProtocols, categories: listCategories, roles: listRoles, "key-prefixes": listKeyPrefixes };
  match = pathname.match(/^\/v1\/dictionaries\/([^/]+)$/);
  if (method === "GET" && match && dictionaryReaders[match![1]]) return authorized(actor, "view", () => dictionaryReaders[match![1]](query));
  if (method === "GET" && pathname === "/v1/metric-groups") return authorized(actor, "view", () => listMetricGroups(query));
  match = pathname.match(/^\/v1\/metric-groups\/([^/]+)\/members$/);
  if (method === "GET" && match) return authorized(actor, "view", () => query.byCode === "true" ? previewMetricGroupMembersByCode(decodeURIComponent(match![1]), query.focusedRegistryId ? Number(query.focusedRegistryId) : null) : previewMetricGroupMembers(Number(match![1]), query.focusedRegistryId ? Number(query.focusedRegistryId) : null));
  if (method === "GET" && pathname === "/v1/discovery/jobs") return authorized(actor, "view", () => listDiscoveryJobs(query));
  match = pathname.match(/^\/v1\/discovery\/jobs\/(\d+)$/);
  if (method === "GET" && match) return authorized(actor, "view", () => getDiscoveryJobDetail(Number(match![1])));
  if (method === "GET" && pathname === "/v1/kv-builds/active") return authorized(actor, "view", getActiveKvBuildDetail);
  if (method === "GET" && pathname === "/v1/kv-builds") return authorized(actor, "view", () => listKvBuilds(query));
  match = pathname.match(/^\/v1\/kv-builds\/(\d+)$/);
  if (method === "GET" && match) return authorized(actor, "view", () => getKvBuildDetail(Number(match![1])));
  if (method === "GET" && pathname === "/v1/kv-filters") return authorized(actor, "view", () => getDb().select({ filter: mqKvFilterManifests, buildHash: mqKvBuilds.buildHash }).from(mqKvFilterManifests).leftJoin(mqKvBuilds, eq(mqKvFilterManifests.buildId, mqKvBuilds.id)).orderBy(asc(mqKvFilterManifests.id)));
  if (method === "GET" && pathname === "/v1/network-support/matrix") return authorized(actor, "view", listNetworkSupportMatrix);
  if (method === "GET" && pathname === "/v1/network-support/drift") return authorized(actor, "view", getNetworkCatalogDrift);
  match = pathname.match(/^\/v1\/catalog\/([^/]+)$/);
  if (method === "GET" && match && ORIGIN_CATALOG_KEYS.includes(match![1] as OriginCatalogKey)) return authorized(actor, "view", async () => {
    const key = match![1] as OriginCatalogKey;
    const catalog = await loadAndValidateU1Catalog();
    if (key === "coverage") return { catalogKey: key, file: null, dictionaryVersion: catalog.dictionaryVersion, rows: catalog.rows.get("chain_networks.csv") ?? [], capabilities: catalog.rows.get("chain_capabilities.csv") ?? [] };
    const file = CATALOG_KEY_TO_FILE[key as keyof typeof CATALOG_KEY_TO_FILE];
    return { catalogKey: key, file, dictionaryVersion: catalog.dictionaryVersion, rows: catalog.rows.get(file) ?? [] };
  });
  if (method === "GET" && pathname === "/v1/resolver") return authorized(actor, "view", async () => {
    const resolver = getAddressResolver();
    const block = query.blockNumber ? Number(query.blockNumber) : null;
    return query.metricGroupCode ? resolver.checkMetricGroup(query.chainCode, query.address, query.metricGroupCode, block) : resolver.resolveAt(query.chainCode, query.address, block);
  });
  if (method === "POST" && pathname === "/v1/resolver/cex-flow") return authorized(actor, "view", () => classifyCexTransactionFlow(body as unknown as CexFlowInput));

  if (method === "POST" && pathname === "/v1/intake") return authorized(actor, "intake:create", () => {
    const functions: Record<string, (input: unknown) => Promise<unknown>> = { manual: createManualIntake, csv: createCsvIntake, ai_cleaned_csv: createAiCleanedCsvIntake, url: createUrlIntake, json_evidence: createJsonEvidenceIntake, deployment: createDeploymentSourceIntake };
    const handler = functions[String(body.intakeType)];
    if (!handler) throw new OriginHttpError(400, "invalid_intake_type", "Intake type is invalid.");
    return handler(body.input);
  });
  if (method === "POST" && pathname === "/v1/intake/preflight") return authorized(actor, "intake:create", () => preflightResearchIntake(body));
  if (method === "POST" && pathname === "/v1/intake/research") return authorized(actor, "intake:create", () => createResearchIntake(body));
  if (method === "POST" && pathname === "/v1/dictionary-proposals") return authorized(actor, "intake:create", () => createDictionaryProposal(body));
  if (method === "PATCH" && /^\/v1\/dictionary-proposals\/\d+$/.test(pathname)) return authorized(actor, "dictionary:edit", () => reviewDictionaryProposal(body));
  if (method === "POST" && pathname === "/v1/dictionary-resolution/rerun") return authorized(actor, "dictionary:edit", () => rerunDictionaryResolution(body));
  match = pathname.match(/^\/v1\/candidates\/\d+\/review$/);
  if (method === "POST" && match) return authorized(actor, "candidate:review", () => {
    const functions: Record<string, (input: unknown) => Promise<unknown>> = { approve: approveCandidate, approve_suggested: approveCandidateAsSuggested, reject: rejectCandidate, needs_more_evidence: markCandidateNeedsMoreEvidence, conflict: markCandidateConflict, duplicate: markCandidateDuplicate, supersedes_registry: markCandidateSupersedesRegistry, historical_only: markCandidateHistoricalOnly, metric_ineligible: markCandidateMetricIneligible };
    const handler = functions[String(body.action)];
    if (!handler) throw new OriginHttpError(400, "invalid_candidate_action", "Candidate review action is invalid.");
    return handler(body.input);
  });
  if (method === "POST" && /^\/v1\/candidates\/\d+\/evidence$/.test(pathname)) return authorized(actor, "candidate:evidence", () => addCandidateEvidence(body));
  if (method === "POST" && /^\/v1\/registry\/\d+\/evidence$/.test(pathname)) return authorized(actor, "registry:edit", () => addRegistryEvidence(body));
  if (method === "POST" && pathname === "/v1/batches") return authorized(actor, "candidate:review", () => createBatchFromCandidates(body));
  match = pathname.match(/^\/v1\/batches\/\d+\/(approve|commit|fail|supersede)$/);
  if (method === "POST" && match) {
    const permission = match![1] === "commit" ? "batch:commit" : "candidate:review";
    const action = match![1];
    return authorized<unknown>(actor, permission, () => {
      if (action === "approve") return approveBatch(body);
      if (action === "commit") return commitBatch(body);
      if (action === "fail") return failBatch(body);
      return supersedeBatch(body);
    });
  }
  if (method === "POST" && pathname === "/v1/discovery/jobs") return authorized(actor, "discovery:create", () => body.mode === "from_registry" ? createDiscoveryJobFromRegistry(body.input) : createDiscoveryJob(body.input));
  if (method === "POST" && /^\/v1\/discovery\/jobs\/\d+\/complete$/.test(pathname)) return authorized(actor, "discovery:create", () => completeDiscoveryJob(body));
  if (method === "POST" && pathname === "/v1/kv-builds") return authorized(actor, "batch:commit", () => createKvBuildManifest(body));
  if (method === "POST" && /^\/v1\/kv-builds\/\d+\/activate$/.test(pathname)) return authorized(actor, "batch:commit", () => activateKvBuildManifest(body));
  if (method === "POST" && pathname === "/v1/metric-groups") return authorized(actor, "dictionary:edit", () => createMetricGroup(body));
  if (method === "POST" && /^\/v1\/metric-groups\/\d+\/rules$/.test(pathname)) return authorized(actor, "dictionary:edit", () => addMetricGroupRule(body));
  if (method === "POST" && /^\/v1\/metric-groups\/\d+\/deactivate$/.test(pathname)) return authorized(actor, "dictionary:edit", () => deactivateMetricGroup(body));
  if (method === "POST" && /^\/v1\/source-jobs\/\d+\/archive$/.test(pathname)) return authorized(actor, "intake:create", () => archiveSourceJob(body));
  if (method === "POST" && /^\/v1\/source-jobs\/\d+\/verifications$/.test(pathname)) return authorized(actor, "source:verify", () => recordSourceVerification(body));
  match = pathname.match(/^\/v1\/source-jobs\/(\d+)$/);
  if (method === "DELETE" && match) return authorized(actor, "intake:delete", () => deletePendingSourceJob({ ...body, sourceJobId: Number(match![1]) }));
  const dictionaryMutationMatch = pathname.match(/^\/v1\/dictionaries\/([^/]+)$/);
  if ((method === "POST" || method === "PATCH") && dictionaryMutationMatch && dictionaryReaders[dictionaryMutationMatch[1]]) return authorized(actor, "dictionary:edit", () => {
    const handlers: Record<string, Record<string, (input: unknown) => Promise<unknown>>> = {
      entities: { create: createEntity, update: updateEntity, deactivate: deactivateEntity }, protocols: { create: createProtocol, update: updateProtocol, deactivate: deactivateProtocol }, categories: { create: createCategory, update: updateCategory, deactivate: deactivateCategory }, roles: { create: createRole, update: updateRole, deactivate: deactivateRole }, "key-prefixes": { create: createKeyPrefix, update: updateKeyPrefix, deactivate: deactivateKeyPrefix },
    };
    const handler = handlers[dictionaryMutationMatch[1]]?.[String(body.action)];
    if (!handler) throw new OriginHttpError(400, "invalid_dictionary_action", "Dictionary action is invalid.");
    return handler(body.input);
  });
  match = pathname.match(/^\/v1\/registry\/\d+$/);
  if (method === "PATCH" && match) return authorized(actor, "registry:edit", () => {
    const handlers: Record<string, (input: unknown) => Promise<unknown>> = { update: updateRegistryLabel, add_secondary_role: addRegistrySecondaryRole, supersede: supersedeRegistryLabel, deactivate: deactivateRegistryLabel, mark_historical: markRegistryHistorical };
    const handler = handlers[String(body.action)];
    if (!handler) throw new OriginHttpError(400, "invalid_registry_action", "Registry action is invalid.");
    return handler(body.input);
  });
  if (method === "POST" && pathname === "/v1/settings/users") return authorized(actor, "settings:edit", () => createSettingsUser(body));
  if (method === "PATCH" && /^\/v1\/settings\/users\/[0-9a-f-]+$/i.test(pathname)) return authorized(actor, "settings:edit", () => updateSettingsUserAccess(body));
  if (method === "POST" && pathname === "/v1/network-proposals") return authorized(actor, "network:propose", () => createNetworkChangeProposal(body));
  if (method === "PATCH" && /^\/v1\/network-proposals\/\d+$/.test(pathname)) return authorized(actor, "network:review", () => reviewNetworkChangeProposal(body));
  throw new OriginHttpError(404, "route_not_found", "Route not found.");
}

export async function handleOriginRequest(request: IncomingMessage, response: ServerResponse) {
  const startedAt = Date.now();
  const suppliedRequestId = header(request, MQCHAIN_REQUEST_ID_HEADER);
  const requestId = suppliedRequestId && suppliedRequestId.length <= 128 ? suppliedRequestId : randomUUID();
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const method = request.method ?? "GET";
    const rawBody = await readBody(request, bodyLimitFor(method, url.pathname));
    const body = parseBody(rawBody);
    const publicResult = await publicRoute(method, url.pathname, body);
    if (publicResult !== undefined) { sendJson(response, 200, publicResult, requestId); return; }
    const actor = await authenticateEmployee(request, rawBody, `${url.pathname}${url.search}`, requestId);
    const result = await employeeRoute(method, url.pathname, url, body, actor);
    sendJson(response, method === "POST" && ["/v1/intake", "/v1/batches", "/v1/discovery/jobs", "/v1/kv-builds", "/v1/metric-groups", "/v1/settings/users", "/v1/network-proposals"].includes(url.pathname) ? 201 : 200, result, requestId);
  } catch (error) {
    const domainError = error instanceof OriginHttpError || error instanceof SourceJobDeletionError || error instanceof ResearchIntakeError;
    const status = domainError ? error.status : error instanceof ZodError ? 400 : 500;
    const code = domainError ? error.code : error instanceof ZodError ? "validation_failed" : "internal_error";
    const message = domainError ? error.message : error instanceof ZodError ? "Validation failed." : "Internal server error.";
    const details = domainError ? error.details : error instanceof ZodError ? error.flatten() : undefined;
    if (status >= 500) console.error(JSON.stringify({ level: "error", event: "origin_request_failed", requestId, message: error instanceof Error ? error.message : "unknown" }));
    sendJson(response, status, { error: { code, message, details }, requestId }, requestId);
  } finally {
    console.log(JSON.stringify({ level: "info", event: "origin_http_request", requestId, method: request.method ?? "GET", path: request.url ?? "/", statusCode: response.statusCode, durationMs: Date.now() - startedAt }));
  }
}
