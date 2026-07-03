# MQCHAIN Console

Production slice for the MamakQuant MQCHAIN address intelligence control plane.

## Stack

- Next.js App Router, TypeScript strict mode, Tailwind CSS, shadcn/ui
- PostgreSQL with Drizzle ORM and SQL migrations
- Auth.js credentials login with role permissions
- Server Actions for intake, approval, batch, discovery, registry, dictionary, and KV manifest mutations
- Vitest coverage for address normalization, flags, and metric group matching

## Local Setup

```bash
cp .env.example .env.local
# edit DATABASE_URL and NEXTAUTH_SECRET
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Default seeded owner credentials come from:

```env
MQCHAIN_SEED_OWNER_EMAIL=owner@mamakquant.local
MQCHAIN_SEED_OWNER_PASSWORD=change-me-locally
MQCHAIN_RESOLVER_BACKEND=postgres
MQCHAIN_KV_ARTIFACT_ROOT=build/mqchain-kv
```

Change them in `.env.local` before running `npm run db:seed`.
`MQCHAIN_RESOLVER_BACKEND=postgres` is the supported console backend today; `rocksdb` is reserved for the external compiled resolver path.

## Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run db:generate
npm run db:migrate
npm run db:seed
npm run kv:compile
npm run test
```

## Slice 1 Workflow

1. Sign in at `/login`.
2. Create manual, CSV upload/paste, source URL, deployment-source, JSON evidence, or AI-cleaned CSV intake at `/mqchain/intake/new`.
3. Inspect source job summary at `/mqchain/source-jobs/[id]`.
4. Review staged candidates at `/mqchain/candidates` or `/mqchain/review`.
5. Attach JSON evidence, mark conflicts/duplicates/needs-more-evidence, or mark metric-ineligible when needed.
6. Approve or reject candidates with evidence-aware edits.
7. Create a label batch from approved candidate IDs at `/mqchain/batches`.
8. Approve and commit the batch.
9. Registry rows appear at `/mqchain/registry`.
10. Test labels at `/mqchain/resolver`.
11. KV build handoff manifests appear at `/mqchain/kv-builds`.

The resolver page also includes a BTC CEX transaction classifier. Paste transaction input and output address sets, choose `btc_cex_flow_boundary`, and the console classifies the flow as `cex_inflow`, `cex_outflow`, `internal_movement`, `inter_exchange_flow`, or `ignore`.

Resolver lookups show normalized key data, current or point-in-time registry labels, metric group membership, source batch, metric eligibility, flags, confidence/quality, and evidence summaries. Block-number lookups use timeline validity so historical labels can be tested without treating inactive historical rows as current truth.

Resolver reads now go through an `AddressResolver` abstraction. `MQCHAIN_RESOLVER_BACKEND=postgres` is the supported in-app backend; `rocksdb` is intentionally left as an explicit external backend placeholder so compiled artifacts can be wired later without changing resolver UI or CEX-flow classification callers.

Read-only MamakQuantNode-facing APIs are available under `/api/mqchain` after authentication. `/api/mqchain/resolver` resolves a single address by current or point-in-time registry state, POSTs classify CEX transaction flow from input/output address sets, and `/api/mqchain/metric-groups/[code]/members` exports a paginated metric-group member universe plus preview and pending external KV compile manifests. These endpoints are explicitly non-mutating: they expose PostgreSQL-derived truth and mark RocksDB/KV as external compiled artifacts.

Address normalization is checksum-aware for BTC P2PKH/P2SH Base58Check, BTC Bech32/Bech32m witness addresses, Tron Base58Check, and length-aware for EVM 20-byte and Solana 32-byte payloads. The normalizer returns the canonical chain, address family, key prefix, and payload hex used by resolver and KV-key preview paths, while invalid inputs stay as structured validation errors.

Discovery jobs at `/mqchain/discovery/jobs` can be completed from structured JSON result rows. Creation and completion forms return structured action states so scanner-config JSON errors, results JSON errors, and staging counts render inline. Completion archives the JSON as a source document, creates staged candidates and inferred evidence, and still requires the normal candidate review and batch commit flow before any registry row exists. Discovery job detail pages now show scanner interface metadata, result summary counts, logs, generated source-job/document archive links, discovered candidates, evidence/status rollups, and a filtered handoff link for sending pending results into review.

CSV intake accepts either a `.csv`/`.txt` upload or pasted text, enforces a 1,000,000 byte cap before parsing, reads the file as text only, archives the source document, and stages candidates with evidence. CSV and AI-cleaned CSV intake preserve source provenance on the job and archived document, including original filename when uploaded, input mode, MIME type, byte size, content hash, and extracted text. Source URL intake fetches and archives a bounded page snapshot, extracts valid address candidates, and attaches `official_page` evidence. Deployment-source intake can fetch GitHub blob/raw URLs or accept pasted official docs, markdown tables, Solidity constants, JSON deployment maps, explorer text, or extracted PDF text; it stages candidates with raw references such as `contract_name`, `role_source`, `line_number`, and `source_input_type`. Manual, CSV, source URL, JSON evidence, deployment-source, and AI-cleaned CSV intake forms all use structured server-action responses so validation, upload, parsing, and fetch guardrail failures render inline instead of as generic page errors. JSON evidence and AI-cleaned CSV intake preserve structured rows as staged candidates with auditable evidence; none of these paths approve or commit labels directly.

Fetched source URLs are constrained before network access: only HTTP/S URLs without embedded credentials are allowed, localhost/private/metadata literal hosts are blocked, GitHub blob URLs are rewritten to raw content, redirects are validated and bounded, and response reads are capped at 1,000,000 bytes. This keeps source archive capture useful without letting intake become an arbitrary internal fetch surface.

Source job detail pages now expose the full import summary, invalid-row errors, parser/source metadata, archived document coverage, storage/hash/text snapshot diagnostics, candidate status/chain/confidence distributions, evidence type/trust rollups, and raw summary JSON so intake provenance can be audited before review. Operators can mark a source job archived with an archive URI and reason; the archive form returns structured action states for validation and permission failures, preserves candidates/evidence, updates source metadata, and writes an immutable audit row.

Discovery job creation includes typed scanner templates for factory events, registry/address-provider calls, proxy resolution, pool/vault inspection, TX graph scanning, and LLM/ML evidence review. These templates validate operator config and define the expected evidence shape; actual RPC or worker execution remains outside the Vercel request path.

Candidate and registry tables support query-string driven filters for address search, chain, entity, protocol, role, confidence, quality tier, status, and pagination. Registry filters also cover category, metric eligibility, active/historical state, source batch, and conflict flags.

Candidate detail pages show source job/document context, current registry matches for the same chain/address, evidence source URLs and JSON payloads, duplicate/conflict context, discovery origin, and approval history so a staged address can be audited before action. Approval with edits exposes metric eligibility as an explicit control that sets or clears the metric boundary flag before batch commit. Candidate detail mutation forms for evidence attachment, approval edits, rejection, conflict/needs-evidence status, duplicate merge, metric-ineligible marking, supersession, and historical-only approval return structured action states with inline errors and success refreshes. Candidate review can also mark a staged row as superseding an existing registry match or as historical-only; both actions write approval/audit events and still require the normal batch commit boundary before registry truth changes.

The review workspace includes queue rollups, entity/chain/role candidate groups, latest evidence summaries, approve-as-suggested for candidates with complete suggestions, reject/needs-evidence/conflict/metric-ineligible actions, and batch selection from approved candidates without bypassing the batch commit boundary. Queue and group quick actions now return structured action states so permission, validation, and readiness failures render inline instead of as redirect errors; selected approved-row batch creation uses the same structured response before navigating to the new batch. Review group detail pages now show pending and approved-ready rows, status/source/evidence/trust composition, and group-scoped batch creation for candidates that have already been approved.

The dashboard at `/mqchain` now tracks the control-plane operating surface: pending and needs-evidence candidates, same-day approvals/rejections, committed batches, active dictionaries and labels, unresolved conflicts, metric-eligible rows, active metric groups, latest committed batch, latest KV manifest, discovery status, source-type mix, label quality/confidence distributions, entity concentration, recent approval events, recent source jobs, and recent discovery jobs.

Batch detail pages show source defaults, imported/accepted/rejected/conflict counts, quality and confidence distributions, candidate evidence summaries, committed batch evidence rows, approval history, and KV handoff manifests before or after commit. Batch create, approve, commit, fail, and supersede forms return structured action states so readiness failures, registry-conflict guards, and KV handoff results render inline for operators. Batch approve, commit, fail, and supersede actions are separate status transitions that write approval events. During commit, historical-only candidate drafts produce inactive historical registry rows, and supersession drafts mark the old registry row historical in the same transaction. The commit boundary also blocks duplicate active registry targets for the same chain, normalized address, role, and valid-from block, including the PostgreSQL edge case where `valid_from_block` is unknown/null; operators must supersede the existing row, edit the timeline, or update the registry label instead of writing duplicate truth.

Batch creation and commit both require candidates to be in `approved` status. Selected candidate IDs are treated strictly: missing, pending, rejected, duplicate, conflict, or needs-evidence rows block batch creation instead of being silently dropped, and commit re-checks readiness before registry writes. Approval-with-edits role overrides are resolved against the reviewed role dictionary at commit time so default flags and metric usage come from the final reviewed role.

Metric groups can be created at `/mqchain/metric-groups` with include/exclude role, category, and entity rules. Operators can append additional rules or deactivate a group without deleting historical definitions. Metric-group forms return structured action states so missing include selectors, code-format errors, permission failures, and dictionary-version updates render inline before the preview refreshes. These mutations are permission-gated as dictionary changes, audit logged, and included in dictionary version hashes alongside rule JSON. Preview membership now enforces active registry rows and the metric group's chain scope before rule matching, then shows a compile-preview manifest with row count, registry IDs, and role/entity/chain distributions for downstream metric or KV workers.

Dictionary pages let operators create and deactivate entities, protocols, categories, roles, and key prefixes. The dictionary hub also surfaces metric groups and metric-group rules as versioned dictionary-governed data, with active/total counts and the latest dictionary hash used by downstream KV/compiler handoffs. Dictionary mutation forms return structured action states so validation, permission, uniqueness, and dependency failures render inline. Deactivation preserves historical references, writes an audit row, and records a new dictionary version hash for downstream KV/compiler handoff.

Registry detail pages can seed a draft TX graph discovery job from an approved label. The job records registry context in its config and audit log, then follows the normal discovery-to-candidate staging path before anything can affect registry truth.

Registry detail pages also show resolver key data, source batch, metric-group memberships, approval history, related staged candidates, sibling labels for the same chain/address, and related discovery jobs so an approved label remains traceable from source intake through metric usage. Flags are rendered as named visual badges next to the raw bitmask on registry, candidate, resolver, batch, role, and metric-preview surfaces so operators can distinguish metric eligibility, historical-only rows, official-source evidence, inferred labels, protocol roots, asset containers, and secondary roles without decoding integers. Matching metric groups link directly into a focused membership preview at `/mqchain/metric-groups`, where the registry row is highlighted and the compile-preview manifest records whether it is included. Registry evidence additions, secondary role attachments, direct registry supersession, historical marking, edits, deactivation, and discovery job creation are permission-gated and auditable, with structured inline success and validation states on the registry detail page. Secondary roles are stored on the registry row metadata, set the `has_secondary_roles` flag, and write both approval and audit events.

Settings at `/mqchain/settings` expose the active user roster, role-permission matrix, and owner-only user creation/access updates. User management forms return structured action states so validation, uniqueness, permission, and final-owner failures render inline. These mutations never return password hashes to the UI, write immutable audit rows, and prevent the final active owner account from being deactivated or demoted.

Audit log at `/mqchain/audit-log` merges approval events and system audit rows into a newest-first control-plane timeline, with system payload summaries for before/after changes and user/access mutations. Raw approval and system JSON remain expandable for detailed inspection, and sensitive payload keys are redacted in summaries.

## Architecture Rules

- Intake and discovery never write directly to `mq_address_registry`.
- Candidates are staging records until reviewed.
- Batch commit is the registry write boundary.
- PostgreSQL is canonical truth.
- RocksDB/KV is treated as an external compiled artifact.
- Metric groups are countable universes and are separate from categories.
- Protected mutations validate input, check role permissions, and write approval events where relevant.
- New non-redirecting mutation forms should use `runAction()` and return `ActionResult<T>` so client surfaces can show structured success, validation, and operator-safe error states.
- Owner-only settings mutations validate input, hash passwords, and write `mq_audit_log` rows without exposing password hashes.

## Vercel Notes

- Provision PostgreSQL and set `DATABASE_URL`.
- Set `NEXTAUTH_URL` to the deployment URL.
- Set a strong `NEXTAUTH_SECRET`.
- Set `MQCHAIN_RESOLVER_BACKEND=postgres` for the Vercel control plane.
- Run migrations before first production traffic.
- Run the seed script once, then rotate the seeded owner password.
- Do not compile RocksDB inside Vercel functions. Use `mq_kv_builds` manifests as worker/CLI handoff records.

## KV Compiler Handoff

`npm run kv:compile` reads active approved registry rows from PostgreSQL, emits a deterministic JSONL key/value preview under `build/mqchain-kv/<buildHash>/`, writes a manifest, and records the build in `mq_kv_builds`. Batch commits also queue a pending KV handoff manifest with the committed registry IDs and current dictionary version, giving the external compiler an auditable source batch and dictionary snapshot.
Set `MQCHAIN_KV_ARTIFACT_ROOT` to change the default compiler output root, or pass `--out` for a one-off path.

```bash
npm run kv:compile -- --out D:/mqchain-artifacts/kv
```

This is intentionally a Node CLI/worker path, not a Vercel request handler. Operators can also register external compiler outputs at `/mqchain/kv-builds` by providing a storage URI, row count, build hash, dictionary version, and manifest JSON. KV registration and activation forms return structured action states so manifest JSON, permission, and preflight failures render inline. A compiled manifest can then be activated from `/mqchain/kv-builds/[id]` only after preflight passes: the artifact must have an external URI, build hash, dictionary version, manifest `artifactType`, and matching row-count accounting. Activation marks previous active manifests as superseded and writes an immutable audit row with the preflight report.
