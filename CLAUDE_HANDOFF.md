# MAMAKQUANTCHAIN U1 Claude Handoff

## Safe Pending Source-Job Deletion (2026-07-20)

Owner/admin-only deletion of non-canonical source jobs is implemented in `C:\MAMAKQUANT\mamakquantchain\mqchain-console`. Start with:

- `src/lib/mqchain/source-job-deletion.ts`
- `src/lib/mqchain/services/source-job-service.ts`
- `origin/app.ts`
- `src/components/mqchain/delete-source-job-dialog.tsx`
- `src/test/source-job-deletion.test.ts`
- `src/test/source-job-deletion-api.test.ts`

The new `intake:delete` permission belongs only to owner and admin. Origin exposes `GET /v1/source-jobs/:id/delete-preview` and `DELETE /v1/source-jobs/:id`; the Vercel adapter calls these through the signed Origin client and has no PostgreSQL dependency. The UI is available as a row action and in the detail-page Danger zone, requires the exact confirmation `DELETE <id>`, preserves the preview after an error, and redirects to `/mqchain/source-jobs` after success.

Deletion is one transaction. It reloads and locks the source job, recalculates blockers, inserts the persistent `source_job_deleted` audit record, then deletes batch evidence, approval events, batch-candidate links, address evidence, source verifications, draft/failed batches, candidates, documents, and finally the source job. It blocks archived jobs, approved candidates, protected batches, registry dependencies, KV build/index-manifest references, canonical evidence or approval events, superseding batches, and cross-job/cross-batch references. No cascade migration or canonical registry/KV behavior changed.

Verification completed: 79 test files and 462 tests passed; TypeScript passed; ESLint passed; the network-enabled Next.js production build passed. Vitest still prints the existing missing `typescript.js.map` warning. The first sandboxed build failed only because Google Fonts was unreachable. No commit, push, deployment, database mutation, schema, migration, environment, codec, or normalization change occurred.

Remaining risk: rollback and row-isolation coverage verifies the transaction/service contract without mutating a live PostgreSQL test database. Before production use, smoke-test one disposable pending job in a staging database and confirm its audit row survives while an unrelated source job remains unchanged.

## MQCHAIN Origin Boundary Remediation (2026-07-18)

The Vercel-to-PostgreSQL boundary remediation is implemented in `C:\MAMAKQUANT\mamakquantchain\mqchain-console`. Read this first:

- `docs/architecture/MQCHAIN_ORIGIN_BOUNDARY_REMEDIATION.md`
- `reports/origin_boundary_remediation.md`
- `origin/app.ts`
- `src/lib/mqchain/origin-client/client.ts`
- `src/lib/mqchain/contracts/`
- `src/test/origin-boundary.test.ts`

Current state:

- Every MQCHAIN App Router page, API route, action, and reachable component uses the Origin client for database-backed work.
- Vercel has no runtime or type-only dependency on `src/db`, PostgreSQL/Drizzle query implementations, `src/lib/mqchain/services`, Origin-only actor context, or the U1 filesystem catalog loader.
- `origin/server.ts` is lifecycle-only; `origin/app.ts` owns request handling and is directly testable.
- Employee requests are HMAC-SHA256 signed with audience, timestamp, request ID, exact body hash, and replay-protected employee context.
- Signed context contains employee ID and email but no role. The Origin reloads the active `mq_users` row and enforces the current database role.
- The shared transport owns Cloudflare headers, timeouts, canonical query signing, serialization/date revival, request IDs, and normalized errors.
- Existing `/api/mqchain/**` URLs, page behavior, permissions, scoring, registry semantics, network proposal rules, and U1 catalog data remain unchanged.
- No environment file, schema, migration, seed, or database data was changed.

Verification:

```text
Vitest: 75 files, 410 tests passed
TypeScript: passed
ESLint: passed with zero warnings
Architecture AST graph: zero Vercel boundary violations across more than 100 reachable modules
Build: passed in the network-enabled retry; the former U1 filesystem tracing warning is gone
```

Environment variable names are documented in the architecture file. Do not inspect or copy their values. For rollout, deploy the Origin and console versions together, verify Cloudflare policy and signing-secret parity, then smoke-test authentication, dashboard, one read-only list, and one authorized mutation. Rollback is code-only and must restore both applications together.

Important remaining risk: the replay cache is in-memory per Origin process. Add a shared replay store before horizontal replication if cross-replica one-time enforcement is required.

## MQCHAIN-U1 Network Universe Expansion (2026-07-17)

This tranche is implemented and verified in `C:\MAMAKQUANT\mamakquantchain\mqchain-console`. Read these first:

- `docs/architecture/MQCHAIN_U1_NETWORK_UNIVERSE_EXPANSION.md`
- `data/catalog/u1/chain_aliases.csv`
- `drizzle/0011_heavy_agent_brand.sql`
- `reports/u1_network_universe.md`

Final catalog state:

| Dictionary | Rows |
|---|---:|
| Canonical networks | 128 |
| Preserved base network IDs | 48 |
| Added inactive network IDs | 80 |
| Address/identifier codecs | 59 |
| Typed namespaces | 166 |
| Capability rows | 128 |
| Scoped workbook aliases | 316 |

The alias source is `cex_por_wallet_registry_MQCHAIN_multi_cex.xlsx`, SHA-256 `c19fe777e29dd0d6434d7e9f08aa36fca0d1e89ed89c293accd55b4f8b987594`. It contained 223 globally distinct raw `Chain` strings across 15 source sheets, represented as 316 source-scoped alias rows. No workbook wallet/address row was copied into canonical registry tables.

Alias states are: 281 `approved`, 24 `not_a_network`, 7 `pending_mapping`, 2 `pending_network`, and 2 `unsupported`. Do not force the pending values into canonical mappings. The report lists each unresolved source scope and raw value.

All IDs that existed before this tranche are unchanged: network IDs 1-48, codec IDs 1-95, and namespace IDs 1-47 have identical ID/code mappings. New allocations start at network 49, codec 96, namespace 48, and alias 1. Current allocator heads are network 129, codec 132, namespace 167, and alias 317; all other allocator rows were reconciled to their occupied maxima.

Migration 0011 adds `mq_chain_aliases`, codec `identifier_kind`, namespace `address_type`, and a composite alias mapping FK. It is additive. Validator public keys, staking identifiers, consensus identifiers, and wallet addresses are separate contracts. The validator-key-to-wallet-namespace count is zero.

Every added network is `is_active=false`, label/runtime readiness is `not_ready`, and MQNODE/metric readiness remains unsupported without integration evidence. Migration 0010's proposal activation trigger remains authoritative. Do not bypass it.

Verification:

```text
Vitest: 74 files, 402 tests passed
TypeScript: passed
ESLint: passed with zero warnings
Next.js production build: passed (known non-fatal catalog filesystem tracing warning)
Clean temporary database: migrations 0000-0011 and seed passed
Isolated mqchain_console: migration 0011, db:seed, and zero-drift report passed
Database counts: 128 networks, 59 codecs, 166 namespaces, 316 aliases, 128 capabilities
New active networks: 0
Missing capability rows: 0
Validator aliases routed to wallet namespaces: 0
KV compile: passed, build 208f12ce1bbf15272bbf289859cf617809defd98cc15872be749e730261f4c10, 15 rows
Dictionary version: f8adbdf28418e119001751be4dbf90c14aff48750699ad5f61634e7a002caf06
```

No native RocksDB work and no Vercel deployment were performed. No commit or push was made.

## MQCHAIN-U1 Network Capability Hardening (2026-07-17)

The requested hardening tranche is implemented in the dirty worktree. Start with:

- `docs/architecture/MQCHAIN_U1_NETWORK_CAPABILITY_HARDENING.md`
- `drizzle/0010_parallel_yellow_claw.sql`
- `src/lib/mqchain/services/network-support-service.ts`
- `src/app/api/mqchain/network-support/route.ts`
- `src/app/mqchain/dictionaries/network-support/page.tsx`
- `reports/u1_catalog_database_drift.md`

Key outcomes:

- `u1_namespaces.next_id` is corrected from 47 to 48. All 47 published namespace IDs remain unchanged.
- Network IDs 1-48 and every other published dictionary ID remain stable; no catalog row was deleted or renumbered.
- Catalog, label, and runtime readiness are separate database/catalog fields.
- Tier 1 is Bitcoin, Ethereum, Base, BSC, and Solana. Tier 2 is Arbitrum, Optimism, Polygon, Tron, and Avalanche.
- Every published EVM namespace now uses the generic EVM20 normalizer path. Existing legacy output aliases remain compatible.
- MQNODE remains unsupported. Metric and MQNODE readiness at `test_ready` or `production_ready` is rejected unless a non-null integration-test reference exists.
- Unknown networks can only be created inactive through a manual proposal. Activation requires an approved proposal and transaction-scoped proposal context enforced by PostgreSQL.
- The API is `GET|POST|PATCH /api/mqchain/network-support`; the console is `/mqchain/dictionaries/network-support`.
- `npm run u1:drift` generates Markdown and JSON catalog/database drift reports. The isolated seeded database currently reports zero errors and zero warnings.

Migration 0010 is additive. It backfills the new fields conservatively and downgrades unsupported historical metric readiness claims before installing evidence constraints. Do not weaken `mq_chain_network_proposal_activation_guard` or bypass the proposal service with direct activation SQL.

Verification completed for this tranche:

```text
Vitest: 74 files passed, 397 tests passed
TypeScript: passed
ESLint: passed
Next.js production build: passed
Clean temporary database: all migrations, seed, and zero-drift report passed
Seeded state: 48 networks, 5 Tier-1, 5 Tier-2, 5 label-ready, 0 runtime-ready
Unsupported ready claims: 0
Activation probes: unknown active insert rejected; direct activation rejected; approved-proposal activation allowed
```

The local development server for this tranche is running at `http://localhost:3011`. Credential authentication succeeded, but the app's configured canonical auth URL redirected browser navigation to port 3000, which was outside this server session. Rely on the passing production build, route tests, and database integration probes unless a fresh browser session is started with matching auth URL configuration.

## Start Here

Continue in:

`C:\MAMAKQUANT\mamakquantchain\mqchain-console`

Read these first:

1. `C:\Users\User\.codex\attachments\9559841c-fff1-44d4-9fd4-376729fc3222\pasted-text.txt` - approved U1 implementation contract.
2. `docs/architecture/MQCHAIN_U1_PHASE0_AUDIT.md` - pre-change audit.
3. `docs/architecture/MQCHAIN_U1_FINAL_SPEC.md` - implemented architecture and boundaries.
4. `docs/architecture/MQCHAIN_U1_BINARY_LAYOUT.md` - exact binary layouts.
5. `docs/runbooks/MQCHAIN_U1_BUILD_ACTIVATE_ROLLBACK.md` - operational lifecycle.

The earlier `CGRoths/mqchain_ai` repository is reference material for intake/source adapters only. Do not copy its storage shortcuts into this application.

## Non-Negotiable Contracts

- PostgreSQL is canonical truth. KV/RocksDB is a reproducible compiled serving artifact only.
- Intake and discovery write candidates/evidence, never canonical registry or production KV rows directly.
- Existing entity, protocol, category, role, metric-group, and legacy prefix IDs are immutable.
- U1 migration is additive. Do not drop, truncate, renumber, or silently rewrite legacy data.
- Metric formulas and existing classification/scoring semantics were not changed and must remain unchanged without explicit approval.
- MQASSET is logically separate from MQCHAIN label values.
- MQNODE is not integrated. Capability rows deliberately report it as unsupported.
- Cuckoo filters are negative-lookup accelerators only and may never replace the canonical index.
- Preserve exact provenance, role-label, source-verification, approved-batch, and audit contracts.
- Do not stage, commit, push, or switch branches unless the user explicitly requests it.

## Database Safety

The current `.env.local` was externally changed during this run and points to the legacy database name `mqchain`. Do not edit `.env.local`, and do not migrate or seed that legacy database.

For all U1 verification, override the URL in the process:

```powershell
$configured = ((Get-Content .env.local | Select-String '^DATABASE_URL=').Line -replace '^DATABASE_URL="?','' -replace '"$','')
$env:DATABASE_URL = $configured -replace '/mqchain$','/mqchain_console'
```

The isolated `mqchain_console` database has migrations 0006-0009 applied and the U1 catalog seeded. A failed seed attempt against legacy rolled back transactionally before any change; no legacy data was modified.

## Implemented U1 Surface

### Architecture and governance

- Nine required architecture, migration, and runbook documents are under `docs/`.
- `data/catalog/u1/` is the canonical, explicit-ID, source-backed catalog.
- `src/lib/mqchain/catalog/u1.ts` validates required files, canonical hashes, duplicate IDs/codes, ranges, FKs, source references, capability claims, metric rules, namespace/codec pairs, and payload lengths.
- Dictionary version is the SHA-256 of the complete canonical U1 catalog. Current version: `cfe03c24e185f131967c85e4f3df70be12b75f4f33867432847321ab90f10658`.

### Additive database migrations

- `drizzle/0006_exotic_omega_flight.sql`: U1 catalogs, namespaces/codecs, source registry, components/deployments, MQASSET, metric rules, KV build/filter metadata, compatibility views, and additive U1 columns.
- `drizzle/0007_robust_bucky.sql`: metric rule version/provenance hardening.
- `drizzle/0008_chilly_doctor_octopus.sql`: permits one frozen legacy prefix to map to multiple U1 namespaces without removing the legacy model.
- `drizzle/0009_giant_ezekiel_stane.sql`: base/delta parent FKs, one-active-build constraint, filter uniqueness, and separate network/codec deactivation guards.

The network and codec guards must remain separate PostgreSQL functions. A shared polymorphic trigger function fails because the two row types expose different fields.

### Seeded catalog counts

| Dictionary | Count |
|---|---:|
| Networks | 48 |
| Address codecs | 23 |
| Address namespaces | 47 |
| Categories | 44 |
| Roles | 79 |
| Entities | 52 |
| Protocols | 31 |
| Metric groups/rules | 20 / 20 |
| Assets | 24 |
| Token standards | 20 |
| Native asset mappings | 12 |
| Token contracts | 3 |
| Protocol deployments | 1 |
| Root components | 5 |

The three token mappings are Ethereum USDT, Tron USDT, and Solana USDC. Aave V3 Ethereum is the verified deployment with five roots. Never invent missing addresses; the protocol coverage report marks the other protocols as catalogued-only.

### Normalization and migration

- `src/lib/mqchain/address/normalize.ts` emits `namespaceId` and `addressCodecId` for EVM20, Bitcoin P2PKH/P2SH/Bech32/Bech32m, Solana, and Tron.
- Legacy Bitcoin prefix 18 is intentionally ambiguous: witness v0 maps to namespace 3/codec 12; witness v1-v16 maps to namespace 47/codec 13.
- `src/lib/mqchain/u1-migration.ts` performs payload-aware compatibility mapping.
- `reports/u1_conflicts.*` records this as one detected, resolved, non-destructive conflict with zero unresolved conflicts and zero renumbered IDs.

### Binary compiler and filters

- `src/lib/mqchain/kv/u1.ts` implements exact MQK/MQV/MQT/MQG/MQA/MQAN U1 key/value encoders and decoders.
- `src/lib/mqchain/kv/u1-compiler.ts` sorts binary keys, rejects duplicates, hashes binary content, verifies all filter insertions, probes absent keys, and computes deterministic build hashes.
- `src/lib/mqchain/kv/filter.ts` wraps exact `bloom-filters@3.0.4` Cuckoo filters with fixed seed, serialization round trip, conservative load, and zero-false-negative enforcement.
- `src/lib/mqchain/kv/layers.ts` resolves delta-before-base with tombstones.
- `scripts/compile-kv.ts` emits U1 JSONL binary previews, manifests, Cuckoo artifacts, build validation, database manifests, and V1 compatibility files.
- Current reproducible build hash: `37f4790746f007bf3f4e66ad9868d5d8ada27b43cfe1b9c4c78730b342b106ad`, 18 rows.
- The older database-only dictionary hash is retained as `compatibilityDictionaryVersion`; it must not drive U1 build identity.

Benchmark evidence is in `reports/u1_cuckoo_benchmark.md`: 100,000 inserted keys, zero false negatives, 2/100,000 false positives (0.00002), 8,326,768 serialized bytes, and about 141,863 lookups/second. The current five real build filters each observed zero false positives in 10,000 absent probes.

### Console pages

New inspection routes:

- `/mqchain/dictionaries/networks`
- `/mqchain/dictionaries/network-support`
- `/mqchain/dictionaries/codecs`
- `/mqchain/dictionaries/components`
- `/mqchain/dictionaries/assets`
- `/mqchain/dictionaries/token-standards`
- `/mqchain/dictionaries/metric-groups`
- `/mqchain/dictionaries/coverage`
- `/mqchain/kv/builds`
- `/mqchain/kv/filters`

The dev server is intentionally running at `http://localhost:3010`. Browser checks authenticated through a temporary account that was removed afterward. Coverage, assets, components, and filters rendered with expected row counts, no browser console errors, and no mobile document overflow.

## Reports

Generated, source-reproducible reports are under `reports/`:

- `u1_chain_coverage.md/json`
- `u1_protocol_coverage.md/json`
- `u1_conflicts.md/json`
- `u1_build_validation.md/json`
- `u1_cuckoo_benchmark.md`

Coverage currently reports 48 catalogued networks, 5 Tier-1, 5 Tier-2, 5 label-ready, 0 runtime-ready, 0 MQNODE production-ready, and 0 metric production-ready. These conservative statuses are intentional.

## Verification Completed 2026-07-14

```text
Vitest: 73 files passed, 382 tests passed
TypeScript: passed
ESLint: passed
Next.js production build: passed
Clean database: migrations 0000-0009, seed, compile, and count checks passed
Determinism: two identical U1 build hashes (37f4790746...)
Database guards: active-network deactivation and referenced-codec disable both rejected
Browser: desktop/mobile geometry and four U1 views passed; no console errors
```

The production build has one non-fatal Turbopack NFT warning caused by the server-side catalog loader's dynamic filesystem reads. Compilation and all routes succeed. A future improvement can move catalog projection to generated static TypeScript/JSON or configure a narrowly scoped tracing include.

`npm audit` reports eight moderate transitive vulnerabilities. Do not run `npm audit fix --force`; review dependency upgrades deliberately.

## Rollback

Use `docs/runbooks/MQCHAIN_U1_BUILD_ACTIVATE_ROLLBACK.md`.

- Never delete PostgreSQL canonical registry rows to roll back a serving artifact.
- Deactivate the bad build and reactivate the previously compatible build transactionally.
- Keep dictionary/build compatibility checks enabled.
- Migrations are additive; do not reverse them by dropping U1 tables from a live database.
- The legacy prefix compatibility view/adapter remains available for migration consumers.

No production-destructive operation occurred. The only destructive operations were removal of an explicitly named throwaway validation database and deletion of one temporary local browser-test account after verification.

## Exact Next Recommended Job

Implement the next normalization/deployment tranche without broadening readiness claims:

1. Add authoritative vectors and checksum tests for the five `partial` EVM networks, promoting each capability independently only after tests pass.
2. Seed verified protocol deployments/root components from pinned official sources, beginning with Uniswap V3 Ethereum, and regenerate protocol coverage.
3. Add a build-activation integration test covering base plus delta, tombstone resolution, filter lookup order, dictionary compatibility, and rollback to the prior active build.
4. Keep MQNODE unsupported and leave metric formulas untouched.

## Safe Commands

```powershell
cd C:\MAMAKQUANT\mamakquantchain\mqchain-console
git status --short

$configured = ((Get-Content .env.local | Select-String '^DATABASE_URL=').Line -replace '^DATABASE_URL="?','' -replace '"$','')
$env:DATABASE_URL = $configured -replace '/mqchain$','/mqchain_console'

npm test
npm run typecheck
npm run lint
npm run build
npm run u1:reports
npm run kv:compile -- --out <artifact-directory>
```

Run `git status --short` before editing. The worktree is intentionally dirty and includes user-owned untracked `MQCHAIN_PRODUCT_SPEC.md`; do not overwrite or remove it.
