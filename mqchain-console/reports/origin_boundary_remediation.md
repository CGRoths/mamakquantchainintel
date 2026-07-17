# MQCHAIN Origin Boundary Remediation Final Report

Date: 2026-07-18

## Result

The Vercel runtime and type dependency graph is separated from PostgreSQL, Drizzle query implementations, Origin-only actor context, and filesystem catalog loading. Existing console URLs and behavior are retained through the signed Origin client.

## Verification

- `npm test`: 75 files and 410 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed with zero warnings.
- `npm run build`: passed in the network-enabled retry; no U1 filesystem tracing warning.
- Local smoke test: `GET http://127.0.0.1:3011/login` returned 200.
- Protected-file audit: no environment, schema, migration, seed, or catalog data changes.

## Detailed Design

See `docs/architecture/MQCHAIN_ORIGIN_BOUNDARY_REMEDIATION.md` for endpoint inventory, security protocol, environment variable names, rollback, and remaining risks.

## Exact Changed Files

- `CLAUDE_HANDOFF.md`
- `mqchain-console/docs/architecture/MQCHAIN_ORIGIN_BOUNDARY_REMEDIATION.md`
- `mqchain-console/origin/app.ts`
- `mqchain-console/origin/server.ts`
- `mqchain-console/reports/origin_boundary_remediation.md`
- `mqchain-console/src/app/api/mqchain/audit-log/route.ts`
- `mqchain-console/src/app/api/mqchain/batches/[id]/route.ts`
- `mqchain-console/src/app/api/mqchain/batches/route.ts`
- `mqchain-console/src/app/api/mqchain/candidates/[id]/route.ts`
- `mqchain-console/src/app/api/mqchain/candidates/route.ts`
- `mqchain-console/src/app/api/mqchain/dictionaries/route.ts`
- `mqchain-console/src/app/api/mqchain/dictionaries/versions/route.ts`
- `mqchain-console/src/app/api/mqchain/discovery/jobs/[id]/complete/route.ts`
- `mqchain-console/src/app/api/mqchain/discovery/jobs/[id]/route.ts`
- `mqchain-console/src/app/api/mqchain/discovery/jobs/route.ts`
- `mqchain-console/src/app/api/mqchain/evidence/route.ts`
- `mqchain-console/src/app/api/mqchain/kv-builds/[id]/route.ts`
- `mqchain-console/src/app/api/mqchain/kv-builds/active/route.ts`
- `mqchain-console/src/app/api/mqchain/kv-builds/route.ts`
- `mqchain-console/src/app/api/mqchain/metric-groups/[code]/members/route.ts`
- `mqchain-console/src/app/api/mqchain/metric-groups/route.ts`
- `mqchain-console/src/app/api/mqchain/network-support/route.ts`
- `mqchain-console/src/app/api/mqchain/registry/[id]/route.ts`
- `mqchain-console/src/app/api/mqchain/registry/route.ts`
- `mqchain-console/src/app/api/mqchain/resolver/route.ts`
- `mqchain-console/src/app/api/mqchain/review/groups/[id]/route.ts`
- `mqchain-console/src/app/api/mqchain/review/groups/route.ts`
- `mqchain-console/src/app/api/mqchain/review/route.ts`
- `mqchain-console/src/app/api/mqchain/settings/route.ts`
- `mqchain-console/src/app/api/mqchain/source-jobs/[id]/route.ts`
- `mqchain-console/src/app/api/mqchain/source-jobs/route.ts`
- `mqchain-console/src/app/mqchain/actions.ts`
- `mqchain-console/src/app/mqchain/audit-log/page.tsx`
- `mqchain-console/src/app/mqchain/batches/[id]/page.tsx`
- `mqchain-console/src/app/mqchain/batches/page.tsx`
- `mqchain-console/src/app/mqchain/candidates/[id]/page.tsx`
- `mqchain-console/src/app/mqchain/candidates/page.tsx`
- `mqchain-console/src/app/mqchain/dictionaries/categories/page.tsx`
- `mqchain-console/src/app/mqchain/dictionaries/coverage/page.tsx`
- `mqchain-console/src/app/mqchain/dictionaries/entities/page.tsx`
- `mqchain-console/src/app/mqchain/dictionaries/key-prefixes/page.tsx`
- `mqchain-console/src/app/mqchain/dictionaries/network-support/page.tsx`
- `mqchain-console/src/app/mqchain/dictionaries/page.tsx`
- `mqchain-console/src/app/mqchain/dictionaries/protocols/page.tsx`
- `mqchain-console/src/app/mqchain/dictionaries/roles/page.tsx`
- `mqchain-console/src/app/mqchain/discovery/jobs/[id]/page.tsx`
- `mqchain-console/src/app/mqchain/discovery/jobs/page.tsx`
- `mqchain-console/src/app/mqchain/kv/filters/page.tsx`
- `mqchain-console/src/app/mqchain/kv-builds/[id]/page.tsx`
- `mqchain-console/src/app/mqchain/kv-builds/page.tsx`
- `mqchain-console/src/app/mqchain/metric-groups/page.tsx`
- `mqchain-console/src/app/mqchain/page.tsx`
- `mqchain-console/src/app/mqchain/registry/[id]/page.tsx`
- `mqchain-console/src/app/mqchain/registry/page.tsx`
- `mqchain-console/src/app/mqchain/resolver/page.tsx`
- `mqchain-console/src/app/mqchain/review/groups/[id]/page.tsx`
- `mqchain-console/src/app/mqchain/review/groups/page.tsx`
- `mqchain-console/src/app/mqchain/review/page.tsx`
- `mqchain-console/src/app/mqchain/settings/page.tsx`
- `mqchain-console/src/app/mqchain/source-jobs/[id]/page.tsx`
- `mqchain-console/src/app/mqchain/source-jobs/page.tsx`
- `mqchain-console/src/components/mqchain/u1-catalog-table.tsx`
- `mqchain-console/src/lib/auth/options.ts`
- `mqchain-console/src/lib/mqchain/contracts/catalog.ts`
- `mqchain-console/src/lib/mqchain/contracts/domain.ts`
- `mqchain-console/src/lib/mqchain/contracts/dto/audit-service.ts`
- `mqchain-console/src/lib/mqchain/contracts/dto/batch-service.ts`
- `mqchain-console/src/lib/mqchain/contracts/dto/candidate-service.ts`
- `mqchain-console/src/lib/mqchain/contracts/dto/cex-flow-service.ts`
- `mqchain-console/src/lib/mqchain/contracts/dto/dashboard-origin-service.ts`
- `mqchain-console/src/lib/mqchain/contracts/dto/dictionary-service.ts`
- `mqchain-console/src/lib/mqchain/contracts/dto/discovery-service.ts`
- `mqchain-console/src/lib/mqchain/contracts/dto/evidence-service.ts`
- `mqchain-console/src/lib/mqchain/contracts/dto/kv-manifest-service.ts`
- `mqchain-console/src/lib/mqchain/contracts/dto/metric-group-service.ts`
- `mqchain-console/src/lib/mqchain/contracts/dto/network-support-service.ts`
- `mqchain-console/src/lib/mqchain/contracts/dto/registry-service.ts`
- `mqchain-console/src/lib/mqchain/contracts/dto/resolver-service.ts`
- `mqchain-console/src/lib/mqchain/contracts/dto/review-service.ts`
- `mqchain-console/src/lib/mqchain/contracts/dto/settings-service.ts`
- `mqchain-console/src/lib/mqchain/contracts/dto/source-job-service.ts`
- `mqchain-console/src/lib/mqchain/contracts/hash.ts`
- `mqchain-console/src/lib/mqchain/contracts/origin.ts`
- `mqchain-console/src/lib/mqchain/contracts/request-signing.ts`
- `mqchain-console/src/lib/mqchain/dictionary-api.ts`
- `mqchain-console/src/lib/mqchain/origin-client/action-utils.ts`
- `mqchain-console/src/lib/mqchain/origin-client/client.ts`
- `mqchain-console/src/lib/mqchain/origin-client/errors.ts`
- `mqchain-console/src/lib/mqchain/origin-client/serialization.ts`
- `mqchain-console/src/lib/mqchain/origin-only/actor-context.ts`
- `mqchain-console/src/lib/mqchain/resolver-api.ts`
- `mqchain-console/src/lib/mqchain/services/approval-service.ts`
- `mqchain-console/src/lib/mqchain/services/batch-service.ts`
- `mqchain-console/src/lib/mqchain/services/candidate-service.ts`
- `mqchain-console/src/lib/mqchain/services/dashboard-service.ts`
- `mqchain-console/src/lib/mqchain/services/dictionary-service.ts`
- `mqchain-console/src/lib/mqchain/services/discovery-service.ts`
- `mqchain-console/src/lib/mqchain/services/evidence-service.ts`
- `mqchain-console/src/lib/mqchain/services/kv-manifest-service.ts`
- `mqchain-console/src/lib/mqchain/services/metric-group-service.ts`
- `mqchain-console/src/lib/mqchain/services/network-support-service.ts`
- `mqchain-console/src/lib/mqchain/services/registry-service.ts`
- `mqchain-console/src/lib/mqchain/services/review-service.ts`
- `mqchain-console/src/lib/mqchain/services/settings-service.ts`
- `mqchain-console/src/lib/mqchain/services/source-job-service.ts`
- `mqchain-console/src/lib/mqchain/settings-api.ts`
- `mqchain-console/src/test/origin-boundary.test.ts`
