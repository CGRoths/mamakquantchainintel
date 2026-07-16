# MQCHAIN U1 Network Capability Hardening

## State model

Network support has three independent top-level states:

- `catalog_state`: the stable network identity is governed and published. It does not imply address or runtime support.
- `label_readiness`: address normalization and MQCHAIN current/timeline label artifacts have network-specific test evidence.
- `runtime_readiness`: the end-to-end runtime path, including MQNODE and metric integration, has integration-test evidence.

`label_readiness` and `runtime_readiness` use `not_ready`, `prepared`, `test_ready`, or `production_ready`. Existing granular capability columns remain for compatibility and diagnosis. A ready MQNODE or metric status requires a non-null integration-test reference at both catalog validation and PostgreSQL constraint layers.

## Tiers

Tier 1 is Bitcoin, Ethereum, Base, BNB Smart Chain, and Solana. These networks have network-specific normalizer tests and are label `test_ready`; runtime remains `not_ready`.

Tier 2 is Polygon, Arbitrum, OP Mainnet, Tron, and Avalanche C-Chain. Their normalizers are tested and label state is `prepared`; end-to-end label/runtime integration remains pending.

All other networks remain catalogued with conservative readiness. Catalog presence never promotes support automatically.

## Generic EVM20

One EVM20 normalizer handles all published EVM namespaces. A governed identity registry selects namespace and frozen legacy prefix, where one exists. The address algorithm is shared; readiness is still network-specific and advances only when that network has explicit vectors.

## Manual proposals

Every network mutation is represented by `mq_network_change_proposals`:

1. An owner, admin, or analyst submits a manual proposal with reason and evidence.
2. An owner or admin approves or rejects it.
3. An approved proposal is applied explicitly.
4. Creates allocate the current `u1_networks.next_id` and always insert inactive.
5. Activation requires a separate approved `activate` proposal.

Stable IDs and published canonical codes are never updated. New rows do not reuse an ID. Deactivation remains blocked while active namespaces reference a network.

PostgreSQL rejects active inserts above the published 1-48 baseline and rejects inactive-to-active transitions unless the transaction supplies an approved matching proposal ID through `mqchain.network_change_proposal_id`.

## Drift

Run `npm run u1:drift` against the intended database. It compares checked-in network identities, capability states, and the namespace allocator with PostgreSQL and writes:

- `reports/u1_catalog_database_drift.json`
- `reports/u1_catalog_database_drift.md`

Any ID/code drift, missing row, or allocator mismatch must block activation and release work until reviewed.
