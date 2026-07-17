# MQCHAIN Origin Boundary Remediation

Date: 2026-07-18

## Outcome

All MQCHAIN App Router pages, route handlers, server actions, and transitively reachable components now use the shared Origin HTTP client. The Vercel runtime graph no longer reaches PostgreSQL, Drizzle query implementations, the U1 filesystem catalog loader, or Origin-only actor context.

The database implementations remain in `src/lib/mqchain/services` for compatibility with the existing test suite. They are Origin-only at runtime: `origin/app.ts` is their production caller, and `src/test/origin-boundary.test.ts` fails if a Vercel entrypoint imports them at runtime or through a type-only edge.

No schema, migration, seed, metric formula, registry semantic, label taxonomy, candidate approval behavior, or environment file changed.

## Layout

| Path | Responsibility |
|---|---|
| `origin/server.ts` | HTTP listener lifecycle and graceful database shutdown only |
| `origin/app.ts` | Request parsing, authentication, authorization, route dispatch, response envelope, and body limits |
| `src/lib/mqchain/contracts` | Database-free request, response, signing, catalog, and DTO contracts |
| `src/lib/mqchain/origin-client` | Sole Cloudflare-aware HTTP transport, signing, serialization, errors, and domain clients |
| `src/lib/mqchain/origin-only/actor-context.ts` | Verified actor propagation for Origin mutation services |
| `src/lib/mqchain/services` | PostgreSQL implementations reachable by the Origin only |
| `src/test/origin-boundary.test.ts` | AST dependency boundary, route inventory, request security, body-limit, and client behavior tests |

## Request Security

Employee-bound requests carry:

- `x-mqchain-request-id`
- `x-mqchain-employee-context`
- `x-mqchain-signature`

The employee context is base64url JSON containing `sub`, `email`, `aud`, `iat`, and a unique `jti`. It intentionally contains no role. The HMAC-SHA256 canonical input is:

```text
v1
METHOD
normalized-path-and-sorted-query
request-id
sha256(exact-body)
base64url-employee-context
```

The Origin validates the audience, 60-second clock window, constant-time signature comparison, and a bounded replay cache. It then loads `mq_users` by the signed `sub`, requires an active user and matching email, and uses the current database role for permission checks. Browser-supplied identity and stale NextAuth role values are not authority at the Origin.

Cloudflare Access credentials authenticate the Vercel workload at the network boundary. Employee signing identifies the caller inside that workload.

## Environment Contract

Variable names only:

- Vercel: `MQCHAIN_ORIGIN_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `MQCHAIN_REQUEST_AUDIENCE`, `MQCHAIN_REQUEST_SIGNING_SECRET`, plus existing NextAuth variables.
- Origin: `DATABASE_URL`, `MQCHAIN_REQUEST_AUDIENCE`, `MQCHAIN_REQUEST_SIGNING_SECRET`, `MQCHAIN_ORIGIN_HOST`, `MQCHAIN_ORIGIN_PORT`, `MQCHAIN_ORIGIN_ENV`.

The client reads configuration lazily. No secret values were inspected or changed.

## Endpoint Inventory

Public/service endpoints:

- `GET /v1/health`
- `GET /v1/ready`
- `GET /v1/version`
- `POST /v1/auth/credentials`

Employee reads:

- `GET /v1/dashboard/overview`
- `GET /v1/source-jobs` and `GET /v1/source-jobs/:id`
- `GET /v1/candidates` and `GET /v1/candidates/:id`
- `GET /v1/review`, `GET /v1/review/groups`, and `GET /v1/review/groups/:slug`
- `GET /v1/batches` and `GET /v1/batches/:id`
- `GET /v1/registry` and `GET /v1/registry/:id`
- `GET /v1/evidence`, `GET /v1/audit-log`, and `GET /v1/settings/users`
- `GET /v1/dictionaries`, `/v1/dictionaries/overview`, `/v1/dictionaries/versions`, and `/v1/dictionaries/:kind`
- `GET /v1/catalog/:catalogKey` for the explicit U1 allowlist
- `GET /v1/metric-groups` and `GET /v1/metric-groups/:code/members`
- `GET /v1/discovery/jobs` and `GET /v1/discovery/jobs/:id`
- `GET /v1/kv-builds`, `/v1/kv-builds/active`, `/v1/kv-builds/:id`, and `/v1/kv-filters`
- `GET /v1/network-support/matrix` and `/v1/network-support/drift`
- `GET /v1/resolver` and `POST /v1/resolver/cex-flow`

Employee mutations:

- `POST /v1/intake`
- `POST /v1/source-jobs/:id/verifications` and `/v1/source-jobs/:id/archive`
- `POST /v1/candidates/:id/review` and `/v1/candidates/:id/evidence`
- `POST /v1/batches` and `POST /v1/batches/:id/{approve|commit|fail|supersede}`
- `PATCH /v1/registry/:id` and `POST /v1/registry/:id/evidence`
- `POST|PATCH /v1/dictionaries/:kind` with discriminated actions
- `POST /v1/discovery/jobs` and `POST /v1/discovery/jobs/:id/complete`
- `POST /v1/metric-groups`, `/v1/metric-groups/:id/rules`, and `/v1/metric-groups/:id/deactivate`
- `POST /v1/kv-builds` and `POST /v1/kv-builds/:id/activate`
- `POST /v1/settings/users` and `PATCH /v1/settings/users/:id`
- `POST /v1/network-proposals` and `PATCH /v1/network-proposals/:id`

Body limits are 16 KiB for credential authentication, 64 KiB for ordinary mutations, 1 MiB for manifests/discovery completion, and 1 MiB plus 64 KiB for intake.

## Compatibility

Existing `/api/mqchain/**` handlers and pages retain their public URLs and response builders. They now obtain data through `src/lib/mqchain/origin-client/client.ts`. NextAuth credentials authenticate through the Origin. U1 catalog and coverage pages use allowlisted Origin catalog responses, removing Vercel filesystem tracing.

Date values are serialized with a tagged JSON-safe representation and revived by the shared client. Origin failures use a status/code/message/request-ID envelope; the client normalizes it as `OriginClientError`.

## Verification

Completed on 2026-07-18:

```text
npm test: 75 files, 410 tests passed
npm run typecheck: passed
npm run lint: passed with zero warnings
Architecture graph: more than 100 reachable modules checked, zero violations
Focused security suite: signing, tampering, audience, expiry, replay, role authority,
permission denial, request IDs, date revival, Cloudflare headers, error envelopes,
route inventory, and body-limit policy passed
```

`npm run build`: passed in the network-enabled retry and produced `.next/BUILD_ID`. The sandboxed attempt failed only while fetching Google Fonts. Neither build emitted the former U1 catalog filesystem tracing warning.

## Rollback

Rollback is code-only. Restore the console and Origin application versions together so endpoint and client contracts remain aligned. No database rollback is required because this remediation added no schema or data changes.

## Remaining Risks

- The replay cache is bounded and process-local. Multiple Origin replicas require a shared replay store for strict cross-replica one-time enforcement.
- Cloudflare Access policy and secret rotation must be validated in the deployment environment.
- The Origin dispatcher is intentionally centralized for contract visibility; route modules can be split later without changing endpoint contracts.
- Generated database-free DTO declarations mirror current service result shapes. Update the DTO contract and implementation together when a service response changes.
