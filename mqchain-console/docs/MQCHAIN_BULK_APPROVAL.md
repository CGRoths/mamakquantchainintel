# MQCHAIN bulk candidate approval

Bulk approval lets a reviewer approve hundreds or thousands of individually
eligible candidates without approving them one by one. Its scope is deliberately
narrow: **approve as suggested, and nothing else**.

## Scope

Bulk approval only performs the same operation as individual
`approveCandidateAsSuggested()`. Candidates requiring manual changes to entity,
role, component, category, confidence, timeline or flags stay individually
reviewable.

Eligibility rules live in exactly one place: `src/lib/mqchain/candidate-approval.ts`
(pure evaluation) plus `src/lib/mqchain/services/candidate-approval-evaluation.ts`
(batched context loading). `approveCandidateAsSuggested()`, bulk preview and bulk
execution all call the same code, so the individual and bulk paths cannot drift.

## Lifecycle boundaries

Bulk approval **never**:

- creates a label batch;
- writes a registry row;
- queues or activates a KV build;
- approves an unresolved candidate.

The lifecycle is unchanged:

```
research CSV → preflight → source job → source verification
→ candidate approval → label batch → batch approval → registry commit
→ KV compile request → external compilation → activation
```

## Preview

`POST /v1/candidates/bulk-approval/preview` (Origin), proxied by
`POST /api/mqchain/candidates/bulk-approval/preview` (Next.js).

Request:

```json
{ "selectionType": "explicit_ids", "candidateIds": [1, 2, 3], "mode": "strict" }
```

The server also accepts `source_sheet` with `sourceJobId` and `sourceSheet`, or
`source_job` with `sourceJobId`. It expands the scope itself and freezes the exact
sorted candidate-ID set. The browser never sends thousands of hidden IDs.

Preview performs **no database writes**. For every candidate it evaluates:
existence, `pending_review` status, attached evidence, source verification,
normalized address, the full U1 key (`namespaceId`, `addressCodecId`,
`payloadHex`, payload validity, namespace/codec activity and agreement), entity
resolved and active, role resolved and active, component active when assigned,
normalization status resolved, not duplicate, not invalid, not an unsupported
identifier, no unresolved role proposal, no required unresolved component, no
dictionary-version mismatch, source provenance present, recalculated metric
eligibility, and any conflicting active registry label knowable at approval time.

Response:

```json
{
  "selectedCount": 0,
  "eligibleCount": 0,
  "blockedCount": 0,
  "candidateIds": [],
  "eligibleCandidateIds": [],
  "blockedCandidates": [{ "candidateId": 0, "blockers": [] }],
  "blockerSummary": [{ "blocker": "missing_evidence", "label": "Missing attached evidence", "count": 0 }],
  "sourceJobIds": [],
  "dictionaryVersion": "...",
  "candidateSnapshotHash": "...",
  "sourceVerificationSnapshotHash": "...",
  "previewHash": "...",
  "mode": "eligible_only"
}
```

`previewHash` is deterministic over sorted candidate IDs, each candidate's
status, relevant suggested IDs and U1 key fields, evidence count, applicable
source-verification rows, the canonical dictionary version, selection scope and
mode. No current timestamp participates. Blocker detail is paginated while the
summary covers the complete frozen selection.

## Execution

`POST /v1/candidates/bulk-approval` (Origin), proxied by
`POST /api/mqchain/candidates/bulk-approval` (Next.js).

```json
{
  "candidateIds": [1, 2, 3],
  "mode": "eligible_only",
  "expectedDictionaryVersion": "...",
  "expectedPreviewHash": "...",
  "expectedCandidateSnapshotHash": "...",
  "expectedSourceVerificationSnapshotHash": "...",
  "idempotencyKey": "optional-client-operation-key",
  "reason": "Approved official Kraken PoR source"
}
```

Execution order:

1. re-expand the server selection and freeze sorted IDs;
2. open a transaction and lock candidates, source jobs and applicable verification rows;
3. recalculate the entire preview inside the transaction;
4. reject with `409 dictionary_version_changed` if the dictionary version moved;
5. reject with `409 preview_hash_mismatch` if candidate state moved;
6. re-run evidence and source-verification checks;
7. re-run metric eligibility;
8. approve eligible candidates with one `UPDATE ... FROM` input relation;
9. insert all candidate events with one `INSERT ... SELECT`;
10. insert one bulk audit summary.

An idempotency key is advisory-locked and persisted. An identical completed
request replays its stored result; reusing a key for different input returns a
conflict and never duplicates events.

## Modes

### `strict` — approve all selected atomically

If a single selected candidate is blocked, the call returns `409
strict_mode_blocked`, zero candidates are approved and the transaction rolls
back.

### `eligible_only` — approve eligible candidates only

Every eligible candidate is approved; blocked candidates are left untouched and
returned with exact blocker details. Skipped candidates are never reported as
approved.

UI labels are explicit — "Approve all selected atomically" and "Approve eligible
candidates only". A vague "Approve all" label is never used for eligible-only
behavior, and blocked candidates are never hidden.

## Blockers

Blocker codes come from `CANDIDATE_APPROVAL_BLOCKERS` and are returned in a
stable order: `candidate_not_found`, `status_not_pending_review`,
`missing_evidence`, `missing_source_verification`, `missing_normalized_address`,
`missing_chain`, `missing_namespace_id`, `missing_address_codec_id`,
`missing_payload_hex`, `invalid_payload_hex`, `unknown_namespace`,
`unknown_codec`, `namespace_codec_mismatch`, `inactive_namespace`,
`inactive_codec`, `payload_length_mismatch`, `unresolved_entity`,
`inactive_entity`, `unresolved_role`, `inactive_role`, `inactive_protocol`,
`inactive_component`, `duplicate_candidate`, `invalid_candidate`,
`unsupported_identifier`, `unresolved_role_proposal`,
`required_component_unresolved`, `invalid_confidence`, `invalid_quality_tier`,
`malformed_timeline`, `role_minimum_confidence_not_met`,
`role_bulk_approval_disabled`, `normalization_status_unresolved`,
`dictionary_version_mismatch`, `missing_source_provenance`,
`conflicting_active_registry_label`.

A `pending_component` normalization status blocks approval only when policy marks
the component as required; an absent optional component is approvable and becomes
KV zero.

## Per-candidate semantics

Each approved candidate gets exactly what individual quick approval produces:
status becomes `approved`; an `approvalDraft` is written freezing entity,
protocol (when assigned), role, component (when assigned), deterministically
derived category, confidence, quality tier, calculated flags and recalculated
metric eligibility; label status is set; timeline fields are preserved; and the
source-verification context is recorded.

Metric eligibility is always recalculated at approval time — never inherited from
intake. A weak source trust tier or sub-threshold confidence strips the
metric-eligible flag even when the role defaults to it.

## Permissions

Both routes require `candidate:review`, matching individual approval. Under the
current policy that is `owner`, `admin` and `reviewer`. `analyst` and `readonly`
can neither preview nor execute. The Next.js proxy returns `401` when
unauthenticated and `403` without the permission; Origin re-checks the permission
independently.

## Race protection

- Candidate rows are locked for the duration of the transaction.
- The preview is fully recomputed inside the transaction.
- A changed canonical dictionary version rejects the call.
- A changed preview hash rejects the call — this covers candidate status races,
  re-resolution races and source-verification races.
- The UI disarms its confirmation whenever the selection or mode changes, so a
  stale preview cannot be submitted.

## Audit

Every execution produces:

- **one** bulk audit record in `mq_audit_events`, action `candidates_bulk_approved`,
  keyed by a UUID bulk operation ID, recording actor, mode, selected/eligible/
  approved/blocked counts, source-job IDs, dictionary version, preview hash,
  reason, approved candidate IDs, blocked candidate IDs with blocker summaries,
  and explicit `batchCreated: false`, `registryRowsCreated: 0`,
  `kvBuildsCreated: 0`;
- **one** `mq_workflow_approval_events` row per approved candidate, action
  `candidate_approved_as_suggested`, carrying the shared bulk operation ID,
  before/after status, entity, protocol, role, component, category, confidence,
  quality, flags, metric eligibility, source-verification status and reason.

Candidate-level audit events are never replaced by the summary record.

## Limits and API safety

- Maximum 10,000 selected candidates per call.
- Request bodies are capped at 512 KB on both the Next.js proxy and Origin.
- Zod validates every request; IDs are deduplicated and sorted at the edge.
- Next.js routes never import the database client, Drizzle, or a PostgreSQL
  writing service — Origin performs all database work behind signed requests.
- Internal database errors are never returned verbatim; unexpected failures
  become a generic 500.

## Scale

Context loading is batched: one candidate query plus a fixed set of context
queries regardless of selection size — never one query per candidate. Approval
writes use a JSON input relation: one set-based update and one set-based
candidate-event insert.

## Running the PostgreSQL integration test

`src/test/integration/bulk-approval-lifecycle.integration.test.ts` covers the
full lifecycle and is skipped unless `MQCHAIN_TEST_DATABASE_URL` is set. It
truncates every `mq_*` table on start, so point it only at a disposable database.

```bash
docker run -d --name mqchain-it-pg \
  -e POSTGRES_PASSWORD=mqchain -e POSTGRES_USER=mqchain -e POSTGRES_DB=mqchain_test \
  -p 55433:5432 postgres:16-alpine

DATABASE_URL="postgres://mqchain:mqchain@127.0.0.1:55433/mqchain_test" \
  npx drizzle-kit migrate

MQCHAIN_TEST_DATABASE_URL="postgres://mqchain:mqchain@127.0.0.1:55433/mqchain_test" \
  npx vitest run src/test/integration/bulk-approval-lifecycle.integration.test.ts

docker rm -f mqchain-it-pg
```

The test asserts: 10 eligible and 2 blocked in preview with no writes; stale
preview hash and changed dictionary version both rejected; strict mode approving
nothing when one candidate is blocked; eligible-only approving 10 and leaving 2
pending with one bulk audit record and ten shared-operation approval events and
no batch/registry/KV side effects; commit rejected before batch approval; and
after approval and commit, registry rows carrying `namespaceId`,
`addressCodecId`, `payloadHex`, `roleId`, `componentId` where assigned and
`categoryId`, plus a pending KV manifest whose build hash is reproducible from
the stored manifest alone.
