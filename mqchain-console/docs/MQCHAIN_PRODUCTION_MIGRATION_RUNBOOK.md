# MQCHAIN Phase I production migration runbook

This runbook is an operator procedure, not authorization to run against
production. Build 5 is immutable and no build is activated by this migration.

## Before the window

1. Record the application SHA, migration journal head, current active build ID,
   Build 5 row/hash/status, latest committed batch, dictionary version, registry
   snapshot hash, table row counts, and invalid-FK count.
2. Take and restore-test a PostgreSQL backup. Retain the backup under the normal
   production recovery policy.
3. Confirm no external writer uses legacy physical names. Coordinate MQNODE,
   workers, reporting jobs, and ad-hoc SQL clients.
4. Run typecheck, lint, tests, build, and the disposable PostgreSQL migration
   suite from the exact release SHA.

## Maintenance and migration

1. Enable maintenance mode and stop all MQCHAIN writers. Reads may continue only
   if the deployment topology guarantees they cannot issue old-name SQL during
   the rename/deploy boundary.
2. Set `DATABASE_URL` to the reviewed production secret through the deployment
   secret manager. Never paste it into logs or shell history.
3. Run `npm.cmd run db:migrate` once. Drizzle wraps migration 0015 in one
   transaction.
4. Deploy the matching application and Origin release. Do not activate a KV
   build.

## Smoke tests

- Confirm all 48 new physical names and both intentionally unchanged tables.
- Confirm zero invalid foreign keys and that owned serial defaults resolve.
- Compare pre/post row counts, PK sets, Build 5, historical audit payload hashes,
  dictionary version for rename-only content, registry snapshot hash, and sample
  compiled U1 key/value hex.
- Insert and roll back a transaction in a safe workflow table to prove the next
  sequence value does not collide.
- Exercise signed read routes, source verification preview, bulk approval preview
  only, KV detail, and resolver batch reads. Keep all smoke-test mutations
  explicitly non-production or rolled back.

## Rollback criteria

Rollback before reopening writers if any table is missing, a row/PK/hash differs,
an FK is invalid, a sequence default fails, signed Origin routes use old names,
or resolver/U1 parity changes. Do not attempt an in-place repair during the
window without a separately reviewed procedure.

## Rollback commands

Keep maintenance mode enabled and run the reviewed rollback in a single psql
session:

```powershell
Get-Content -Raw drizzle/rollback/0015_phase1_domain_hardening.down.sql |
  psql $env:DATABASE_URL -v ON_ERROR_STOP=1
```

Deploy the pre-migration application SHA, repeat old-schema row/FK/sequence/read
checks, then reopen writers. New workflow records written after the forward
migration survive the physical reverse rename; the compact descriptive tables
and contract registry are intentionally removed.

## Monitoring

For at least one normal operating cycle monitor Origin 4xx/5xx rates, PostgreSQL
missing-relation errors, approval conflicts, sequence violations, resolver query
latency, KV parity/registration failures, and audit-event continuity. Activation
remains a separate manual `kv:activate` decision with fresh lineage expectations.
