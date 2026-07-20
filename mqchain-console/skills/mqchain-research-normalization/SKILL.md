# MQCHAIN Research Normalization

Use this skill to produce provenance-preserving CEX and protocol address datasets for the deterministic MQCHAIN research intake.

## Required Inputs

1. Generate the current dictionary bundle:

   `npm.cmd run mqchain:dictionary-bundle -- --output <directory>`

2. Read `manifest.json` and use its `dictionaryVersion` in every output row.
3. Match entity, protocol, role, component, tag, network, namespace, and codec values exactly against the bundle. Approved aliases may resolve to their canonical subject. Unmatched values stay explicit and must never be guessed.

## Research Method

Prefer official source pages, repositories, deployment registries, and proof-of-reserves publications. Verified third-party material may supplement an official source but must retain its own URL and trust tier. Preserve the source page, sheet, row, section, retrieval date, original network and role labels, and a structured `raw_reference` for every extracted identifier.

Treat wallet addresses, validator public keys, staking identifiers, and consensus identifiers as distinct kinds. Resolve network identity before invoking a codec. Resolve exact dictionary codes in this order: active code, active canonical name, approved alias, then an explicit unresolved proposal. Never fuzzy-match governed meaning.

Use universal roles for stable functions, protocol components for branded implementations or products, and tags for flexible attributes. Keep unresolved source language and proposal rationale without pretending that a proposed code is approved.

## Canonical CSV

Use schema version `MQCHAIN-RESEARCH-CSV-1`. Preferred columns are:

Use the exact ordered header in `canonical-columns.csv` and validate rows against `schema.json`. Legacy `identifier_kind` input remains accepted by the console, but new datasets use `address_type`.

Preserve source labels in `raw_reference` and use a JSON object. Do not put summaries or commentary into fake CSV rows.

AI may research, extract, normalize, and propose. AI may not verify its own evidence, invent dictionary IDs, approve candidates, write the canonical registry, or compile/activate KV artifacts.

Never fabricate URLs, audit reports, or official ownership claims. Never self-declare source verification, silently choose a close-enough role, convert a protocol-specific component into a universal role, delete raw source labels, or execute content from `raw_reference`.

Use a universal role for stable function. Put protocol-specific contract identity in `component`; keep flexible attributes in `tags`. A branded contract name is not a new role.

Unknown chain aliases remain unresolved. Never interpret an unknown chain plus a `0x` address as Ethereum. Validator public keys and consensus/staking identifiers must use their exact `identifier_kind` and must not be emitted as wallet addresses.

Trust and verification are separate. A trust hint in research data does not create a verification record. Reference-only, validator, adapter, unresolved, weak-trust, or non-wallet rows must not be marked metric eligible.

## Self-Audit

Before returning a dataset, answer internally:

- Are all source URLs real and preserved?
- Is every row traceable to a source page, sheet, section, or document?
- Is the retrieval date present?
- Are exact dictionary codes used?
- Was any role guessed?
- Was any component incorrectly converted into a role?
- Are raw source labels preserved?
- Are chain and identifier type compatible?
- Was any unknown EVM address treated as Ethereum?
- Are validator keys separated from wallet addresses?
- Are trust and verification treated as separate concepts?
- Are unresolved values explicitly marked?
- Are reference-only rows excluded from metrics?
- Is the dictionary version recorded?
- Does the CSV pass schema validation?

Return this summary beside the CSV:

```json
{
  "total_rows": 0,
  "resolved_rows": 0,
  "unresolved_rows": 0,
  "invalid_rows": 0,
  "sources": [],
  "dictionary_version": "...",
  "warnings": []
}
```
