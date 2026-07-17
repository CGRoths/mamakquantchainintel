# MQCHAIN U1 Network Universe Expansion

## Contract

This tranche expands canonical network identity and source-name resolution without importing workbook address rows into PostgreSQL registry truth. Network IDs 1-48, codec IDs 1-95, and namespace IDs 1-47 remain unchanged.

New canonical networks are catalogue entries only. They are seeded with `is_active=false`, `label_readiness=not_ready`, and `runtime_readiness=not_ready`. Activation still requires an approved manual network-change proposal and the PostgreSQL activation guard from migration 0010.

## Workbook Boundary

Alias evidence comes from `cex_por_wallet_registry_MQCHAIN_multi_cex.xlsx`, SHA-256 `c19fe777e29dd0d6434d7e9f08aa36fca0d1e89ed89c293accd55b4f8b987594`.

Only distinct `Chain` values, their source sheet, address type, and occurrence count are represented in `chain_aliases.csv`. Wallet addresses and other direct workbook registry rows are not copied into the U1 catalog or canonical registry.

Aliases are scoped by source sheet because identical raw strings can carry different identifier semantics. `Ethereum / ETH Staking`, for example, maps to an execution wallet namespace on wallet sheets and a BLS validator-public-key namespace on validator sheets.

## Alias States

- `approved`: reviewed canonical network, namespace, and codec mapping.
- `pending_mapping`: a known but ambiguous or malformed source value requiring manual review.
- `pending_network`: no approved canonical network mapping exists yet.
- `not_a_network`: an asset, token standard, protocol, or asset/network expression; optional underlying network hints do not create a network row.
- `unsupported`: recognized historical or unsupported values retained for auditability.

Pending aliases must have no canonical mapping fields. Approved aliases must have a complete network/namespace/codec triple. PostgreSQL enforces the triple with a composite foreign key.

## Typed Identifiers

Codecs declare `identifier_kind`; namespaces declare `address_type`. Wallet addresses, validator public keys, staking identifiers, and consensus identifiers are separate contracts. The catalog validator rejects family-incompatible codecs and prevents validator keys from being routed into wallet namespaces.

Execution and consensus examples include Ethereum EVM addresses versus BLS validator keys and withdrawal credentials, Cosmos account versus validator-operator and consensus addresses, and Avalanche wallet versus validator node identifiers.

## Allocators

Every row in `id_ranges.csv` is checked against occupied IDs in its declared range. `next_id` must be strictly greater than the maximum occupied ID. The alias catalog has its own `u1_chain_aliases` range.

## Operational Boundaries

- PostgreSQL remains canonical truth.
- The KV compiler consumes approved canonical registry data; aliases do not become direct registry rows.
- No native RocksDB implementation is part of this tranche.
- No deployment is part of this tranche.
- No new network is activated by migration or seed.
