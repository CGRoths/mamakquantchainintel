# MQCHAIN U1 Phase 0 Audit

Date: 2026-07-14

## Baseline

- Application: `mqchain-console`, Next.js 16, TypeScript, Drizzle/PostgreSQL.
- PostgreSQL is already the workflow and registry source of truth.
- The current compiler emits deterministic JSONL previews and records index manifests; it does not make RocksDB canonical.
- Baseline verification passed: 65 test files, 355 tests, typecheck, lint, and production build.

## Existing IDs That Must Be Preserved

The inspected local `mqchain_console` database contains:

- 17 categories with explicit IDs 100 through 920.
- 31 entities with IDs 1 through 31.
- 13 protocols with IDs 1 through 13.
- 55 roles with explicit IDs 1000 through 6050.
- 11 prefix rows, 9 metric groups, 578 candidates, and 1 canonical registry row.

Entity and protocol seed arrays currently rely on insertion order even though their live IDs are already externally meaningful. U1 catalog files must therefore assign the observed IDs explicitly. Existing category, entity, protocol, role, prefix, candidate, batch, and registry identifiers will not be renumbered.

## Schema Findings

- Existing workflow/audit coverage is substantial and compatible: source jobs/documents, discovery, candidates, evidence, source verification, approvals, batches, registry, audit, metric groups, membership snapshots, KV builds, index manifests, and index shards.
- The current model lacks U1 network, codec, namespace, capability, tag/tagset, component, MQASSET, catalog-source, external-identifier, alias, ID-range, and filter-manifest tables.
- Candidates, registry rows, and metric-group members still identify address encoding through `prefix_code`; no `namespace_id` or `address_codec_id` exists.
- Existing numeric constraints cover confidence, quality, status, flags, and positive block ranges, but not all U1 uint widths, namespace/codec compatibility, or codec payload rules.
- The existing prefix table is active and referenced. It must remain available through the U1 migration.

## KV Findings

- Current keys are prefix-oriented V1: a uint16 prefix plus payload, and metric-group IDs are uint16.
- Current values are 32/40/9 bytes and omit U1 component/tagset fields and full uint32 role/flag widths.
- U1 requires new byte-exact MQK/MQV/MQT/MQG/MQA/MQAN serializers with BE keys, LE values, strict overflow checks, decode functions, and golden vectors.
- The compiler currently emits current, timeline, and metric-group JSONL previews sorted by textual key. It has no MQASSET outputs, binary-key sort, base/delta model, filter artifacts, or filter validation.
- No Cuckoo-filter dependency is currently installed. Selection must be isolated behind an interface and accepted only after deterministic serialization and no-false-negative tests pass.

## Catalog and Normalizer Findings

- Seed dictionaries are TypeScript arrays rather than checked-in canonical catalog files.
- Existing normalization supports EVM20 for six networks, Bitcoin Base58Check and Bech32/Bech32m, Solana base58-32, and Tron Base58Check.
- Existing `NormalizedAddress` output is prefix-oriented. U1 must add namespace and codec identity while retaining compatibility fields during migration.
- The U1 catalog must distinguish `catalogued` from tested normalization, KV, MQASSET, MQNODE parser, and metric readiness. No unsupported chain will be marked production ready.
- Static deployment/token rows require authoritative sources. Missing or ambiguous official coverage will be reported rather than guessed.

## Additive Migration Decision

1. Add U1 tables and nullable U1 identity columns without dropping or rewriting prefix data.
2. Register every observed legacy ID in append-only allocation ranges.
3. Seed deterministic prefix-to-namespace/codec mappings.
4. Backfill U1 identity where the mapping is unambiguous; retain unmapped rows and emit conflicts.
5. Keep a compatibility adapter and dual-validation report until a separately approved retirement migration.
6. Add U1 serializers/compiler paths alongside V1 until parity and rollback are proven.

No destructive operation, production deletion, ID renumbering, or metric-formula change is required by the planned migration.
