# MQCHAIN Research Normalization Implementation Map

## Existing Features Reused

- Signed employee-bound Vercel to Origin requests and current database-role authorization.
- PostgreSQL source jobs, immutable source documents, staged candidates, evidence, source verification, audit, approval, batch, registry, and KV control-plane tables.
- Exact code/name dictionary matching, deterministic dictionary history, stable U1 ID ranges, approved name aliases, chain aliases, active namespaces, static runtime codecs, and validated U1 catalogs.
- Sheet and URL provenance matching, source verification gates, candidate approval gates, batch readiness, registry commit transactions, and immutable KV compilation.
- SSRF-aware source fetching and bounded API request parsing.

## Partial Features Extended

- CSV intake previously parsed and mutated in one operation. Research CSV now has a write-free deterministic preflight followed by hash/version-bound creation.
- Candidate metadata already carried selected provenance hints. Canonical research intake now records source sheet, numeric row, URL, section, retrieval date, raw-reference object, raw row, dictionary version, normalization status, identifier kind, component hint, and tags.
- Dictionary maps previously matched code/name only. Research resolution includes active governed name aliases and approved chain aliases.
- Metric eligibility previously accepted an operator boolean after source verification. It now also enforces role, identifier kind, trust tier, confidence, and active-label policy.

## Missing Features Implemented

- Canonical research CSV parser, deterministic network/profile/codec normalization, preflight counts, blockers, warnings, duplicates, filters, and formula-safe exports.
- Authenticated preflight/create Origin and Next.js boundaries plus the two-step console workflow.
- Deterministic dictionary bundle directory exporter and AI skill/self-audit documentation.
- Generic governed dictionary proposal queue and explicit candidate re-resolution action.
- Candidate detail separation of raw hints, resolved values, normalization, provenance, evidence, verification, and approval blockers.

## Conflicts Resolved

The legacy `normalizeAddress()` compatibility facade still preserves its historical unknown-EVM fallback for existing callers. The research workflow never dispatches an unknown chain to that facade; network identity must resolve first, then the active network profile selects a static runtime codec.

## Database Change

One additive table, `mq_dictionary_proposals`, is required. It does not rewrite historical rows or change registry/KV semantics. Migration numbering was discovered from the Drizzle journal, whose previous final entry was `0011`.

## Backward Compatibility Risks

- Legacy CSVs are accepted with `legacy_schema` warning but still require provenance and dictionary resolution.
- Existing direct CSV intake APIs remain available; the deterministic guarantees apply to the new research preflight/create flow.
- Network and codec proposal application remains in the specialized manual network workflow, not the generic proposal applicator.
- Re-resolution changes suggested IDs only and may change what operators see in review queues; it never changes candidate status or approval history.
