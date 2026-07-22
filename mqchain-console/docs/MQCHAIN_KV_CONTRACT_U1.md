# MQCHAIN KV contract — U1 generation

`src/lib/mqchain/kv/contract.ts` is the single authoritative definition of the
current MQCHAIN KV/dictionary contract. Research preflight, dictionary bundle
generation, registry commit, KV build handoff, activation preflight and the
MQNODE-facing snapshot all read their schema versions, dictionary version and
required-index list from that module. Do not redefine any of them elsewhere.

## Schema-version constants

| Constant | Value | Covers |
| --- | --- | --- |
| `MQCHAIN_DICTIONARY_SCHEMA_VERSION` | `MQD-U1` | Governed dictionary snapshot shape |
| `MQCHAIN_KEY_SCHEMA_VERSION` | `MQK-U1` | Address key encoding |
| `MQCHAIN_VALUE_SCHEMA_VERSION` | `MQV-U1` | Current-label value encoding |
| `MQCHAIN_TIMELINE_SCHEMA_VERSION` | `MQT-U1` | Timeline value encoding |
| `MQCHAIN_METRIC_SCHEMA_VERSION` | `MQG-U1` | Metric-group membership encoding |

Binary layouts live in `src/lib/mqchain/kv/u1.ts`; this document and
`contract.ts` govern the logical contract around them.

## Canonical address key

The canonical U1 address key is:

```
namespace_id + address_codec_id + canonical address payload bytes
```

`prefixCode` remains only for legacy compatibility and display. It never
replaces the U1 identity and is never used to reconstruct one.

`validateU1AddressKey()` is the shared validator. It returns every blocker it
finds and never guesses a missing component. Production registry commit calls it
and **fails closed** when any of these hold:

- `namespaceId`, `addressCodecId` or `payloadHex` is missing;
- the payload is not even-length lowercase hex;
- the payload length violates the codec's `exact:N` payload rule;
- the namespace is unknown or inactive;
- the codec is unknown, `unsupported` or `disabled`;
- the namespace's codec disagrees with the candidate's codec.

## Stable dictionary IDs

- `NULL_DICTIONARY_ID = 0` — reserved; means "not assigned" inside a KV value.
- `MIN_STABLE_DICTIONARY_ID = 1`
- `MAX_STABLE_DICTIONARY_ID = 2147483647`

The wire format may encode IDs as unsigned 32-bit integers; the current
PostgreSQL implementation uses the safe signed positive subset. This commit does
not expand the database to the full uint32 range.

Stable IDs are **append-only**. They never change semantic meaning, are never
recycled after retirement, and remain resolvable so historical KV artifacts stay
decodable. Existing IDs are never renumbered.

## KV value fields and zero/null semantics

| Field | Semantics |
| --- | --- |
| `entityId` | Required for a canonical address label; never zero on a committed label |
| `protocolId` | Zero when not assigned |
| `categoryId` | Approved category override, else the approved role's `categoryId`; zero only when genuinely unavailable |
| `roleId` | Required; never zero on a committed label |
| `componentId` | Resolved active component ID when assigned; zero when none. Unresolved component proposals never invent an ID |
| `tagsetId` | Resolved canonical tagset when assigned; zero while no governed tagset is assigned |
| `confidenceScore` | 0–100 |
| `qualityTier` | 0–7 |
| `flags` | Bitfield, see `flags.ts` |
| `labelStatus` | See `LABEL_STATUS` in `constants.ts` |
| `approvedBatchId` | Committing label batch |
| `validFromHeight` / `validToHeight` | Existing timeline semantics, unchanged |

Category precedence is deterministic: **approved category override → approved
role category → null**. Category is never inferred from free-text source labels.

This commit introduces no new component-definition ontology table. Unknown
protocol-specific components stay explicit proposals/metadata until approved and
resolved through the existing component infrastructure.

## Canonical dictionary version

`buildCanonicalDictionarySnapshot()` / `computeCanonicalDictionaryVersion()`
produce the MQD-U1 version. The snapshot shape is:

```json
{
  "dictionarySchemaVersion": "MQD-U1",
  "keySchemaVersion": "MQK-U1",
  "valueSchemaVersion": "MQV-U1",
  "timelineSchemaVersion": "MQT-U1",
  "metricSchemaVersion": "MQG-U1",
  "components": { "networks": { "contentHash": "...", "rowCount": 0 } },
  "versionHash": "..."
}
```

### Governed families included

`networks`, `chainAliases`, `namespaces`, `codecs`, `keyPrefixes` (legacy prefix
dictionary, still supported), `entities`, `protocols`, `categories`, `roles`,
`components`, `nameAliases`, `tags`, `tagsets`, `tagsetMembers`,
`tokenStandards`, `metricGroups`, `metricGroupRules`, `labelStatuses`,
`metricMembershipStatuses`, `assetStatuses`, `qualityTiers`, and `flagBits`.

### Deliberately excluded

Generated and retrieval timestamps, database row physical order, audit events,
source jobs, source documents, candidates, registry rows and KV build rows.

### Normalization rules

Each family selects explicit columns, normalizes nulls and booleans
consistently, sorts by stable ID (then stable code), and includes active/inactive
status plus semantic fields. Serialization uses the single canonical stable JSON
serializer in `src/lib/mqchain/contracts/hash.ts` — object insertion order never
affects the result. Identical governed content always yields an identical
`versionHash`; any semantic change to any family changes it.

### One algorithm only

`recordDictionaryVersion()` is the single writer, and every caller now shares it:
research preflight, research CSV creation, dictionary bundle generation,
dictionary proposal application, dictionary re-resolution, batch commit, the
pending KV build request, activation preflight, and the MQNODE-facing snapshot.
There is exactly one JSON hash implementation; `services/service-utils.ts`
re-exports it rather than defining a second one.

Physical SQL table names are excluded: family names and selected logical fields
are hashed, so a rename-only migration leaves `dictionaryVersion` unchanged.
Historical `mq_governance_dictionary_versions` rows are never rewritten. Records created
after this change use the canonical MQD-U1 version.

## Active resolution versus historical decoding

The canonical snapshot **retains inactive and retired records** so old KV values
remain decodable, and their active status participates in the version hash.

Research resolution matches **active records only**:

- an inactive role, entity, protocol or component stays in the snapshot, can
  decode historical data, and cannot resolve a new CSV candidate;
- approved active aliases resolve; inactive aliases do not.

`getResearchDictionarySnapshot()` filters to active rows for resolution while
deriving its `dictionaryVersion` from the full canonical snapshot.

## dictionaryVersion versus bundleHash

The dictionary bundle manifest exposes both, and they are not interchangeable.

```json
{
  "schemaVersion": "MQCHAIN-DICTIONARY-BUNDLE-1",
  "dictionarySchemaVersion": "MQD-U1",
  "keySchemaVersion": "MQK-U1",
  "valueSchemaVersion": "MQV-U1",
  "timelineSchemaVersion": "MQT-U1",
  "metricSchemaVersion": "MQG-U1",
  "dictionaryVersion": "<canonical MQD-U1 version>",
  "bundleHash": "<bundle integrity hash>",
  "generatedAt": "...",
  "files": []
}
```

- **`dictionaryVersion`** — the canonical MQD-U1 governed version. This is what
  research preflight accepts, what goes in CSV `dictionary_version` cells, and
  what is recorded on candidates, batches and KV builds.
- **`bundleHash`** — integrity hash of the exported bundle: manifest file list,
  file content hashes and row counts. It changes when packaging or export
  content changes. **Never put `bundleHash` in `dictionary_version`.**

## Deterministic build handoff

The external compiler rejects registry snapshots and compiled record sets above
`MQCHAIN_COMPILER_MAX_RECORDS` (default 250,000) before materializing them. It
fetches registry rows and writes RocksDB batches using
`MQCHAIN_COMPILER_CHUNK_SIZE` (default 500); PostgreSQL compiled-entry persistence
uses `MQCHAIN_COMPILED_ENTRY_CHUNK_SIZE`. This gives the current artifact format a
hard memory ceiling and bounded database/write batches while keeping byte order
and semantic hashes deterministic.

`buildPendingBatchKvManifest()` emits the handoff manifest and
`computePendingKvBuildHash()` hashes it. No timestamp participates — not
`new Date()`, not `generatedAt`, not `controlPlaneCreatedAt`. Registry IDs are
sorted, so input ordering cannot change the hash.

```json
{
  "reason": "batch_commit",
  "batchId": 0,
  "registryIds": [],
  "registrySnapshotHash": "...",
  "dictionaryVersion": "...",
  "dictionarySchemaVersion": "MQD-U1",
  "keySchemaVersion": "MQK-U1",
  "valueSchemaVersion": "MQV-U1",
  "timelineSchemaVersion": "MQT-U1",
  "metricSchemaVersion": "MQG-U1",
  "expectedCounts": {
    "addressLabelCurrent": 0,
    "addressLabelTimeline": 0,
    "metricGroupMembership": 0
  },
  "artifactType": "rocksdb",
  "artifactStatus": "pending_external_compile"
}
```

`computeRegistrySnapshotHash()` hashes the committed registry rows' immutable
content, sorted by registry ID. Artifact and index content hashes stay separate
and are supplied by the external compiler.

## Required production indexes

Defined once, in `REQUIRED_KV_INDEXES`:

- `address_label_current`
- `address_label_timeline`
- `metric_group_membership`

## Activation requirements

Production activation fails unless **all** of the following hold:

- build status is `compiled`;
- build hash exists;
- storage URI exists;
- dictionary version exists and matches the manifest's compiled snapshot;
- `dictionarySchemaVersion` is `MQD-U1`;
- `keySchemaVersion` is `MQK-U1`;
- `valueSchemaVersion` is `MQV-U1`;
- `timelineSchemaVersion` is `MQT-U1`;
- `metricSchemaVersion` is `MQG-U1`;
- the manifest declares an `indexes` object — a missing one is a failure, never
  an implicit pass;
- each of the three required indexes is present with its own row count and its
  own content hash;
- each index matches **its own** expected count
  (`address_label_current ↔ expectedCounts.addressLabelCurrent`,
  `address_label_timeline ↔ expectedCounts.addressLabelTimeline`,
  `metric_group_membership ↔ expectedCounts.metricGroupMembership`);
- `registrySnapshotHash` exists;
- filter manifests exist when `filterSupport` is enabled;
- the artifact is `rocksdb` and is not a preview, partial or test build.

Unrelated index cardinalities are **never** summed and compared to one top-level
row count. Preview/partial/test artifacts are allowed to exist under a
non-production build kind but can never become the production serving artifact.

## Batch lifecycle gate

`commitBatch()` requires `batch.status === "approved"`. A `pending_approval`
batch can no longer write registry or KV state. The same owner/admin may approve
and then commit, but the two decisions produce two separate audit records
(`batch_approved` and `batch_committed`, plus `kv_build_manifest_created`).

## Backward compatibility

- Existing dictionary IDs are not renumbered and retired IDs are not reused.
- Historical `mq_dictionary_versions` rows keep their original values; only new
  records use MQD-U1.
- Historical candidates and registry rows are not rewritten.
- The legacy `mq_kv_key_prefix_dict` remains supported and participates in the
  canonical version.
- Candidates created before this change may lack `namespaceId`,
  `addressCodecId` or `payloadHex`. They are not migrated; instead registry
  commit fails closed for them, and the fix is to re-run research normalization.
- The database is not expanded to the full uint32 ID range in this change.
