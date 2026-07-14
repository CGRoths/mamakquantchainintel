You are acting as MQCHAIN CTO, senior blockchain full-stack developer, senior data engineer, and blockchain detective.

I am building a new production-ready web system for MQCHAIN under MamakQuant. The current repo I provide is only a reference for the existing intake/normalization pipeline. Do not blindly modify the old intake system unless explicitly needed. Build a new clean folder/app that can be hosted on Vercel.

The product should become the web control plane for MQCHAIN: an Arkham-style address intelligence and Glassnode/CryptoQuant-style CEX metrics labelling system. The purpose is to discover, review, approve, archive, label, version, and compile blockchain addresses into a production-grade address intelligence registry.

The final goal is to support MamakQuantNode metrics such as BTC CEX inflow/outflow, CEX reserve, exchange activity, protocol entity graph, DeFi protocol discovery, bridge intelligence, custody labels, treasury labels, sanctions/risk labels, and future all-chain address intelligence.

Build this as a serious production system, not a toy CRUD app.

# 1. Product mission

MQCHAIN is the intelligence backbone of MamakQuantNode.

Its mission:

* Convert raw blockchain addresses into verified, evidence-backed, versioned intelligence labels.
* Support CEX metrics such as exchange inflow, outflow, reserve, internal movement, inter-exchange transfer, and entity-level flow.
* Support DeFi/protocol discovery by mapping factories, registries, routers, pools, vaults, oracles, treasuries, multisigs, proxy admins, governance contracts, and asset containers.
* Support point-in-time historical labels so old blockchain flows are not incorrectly classified using modern labels.
* Build a compounding discovery loop: approved labels improve discovery; discovery finds new candidates; candidates go to approval; approved labels compile back into KV/dictionary indexes.
* Provide an operator-facing approval portal where I can sign in, review discovered addresses, inspect evidence, edit labels, approve/reject, batch commit, and track every decision.

The system must separate these worlds:

1. Intake world: messy input enters system.
2. Candidate world: normalized unapproved addresses live here.
3. Approval world: human or high-confidence system review happens here.
4. Registry world: approved canonical truth.
5. KV/dictionary world: compact serving index for fast resolver/metrics.
6. Discovery world: on-chain/AI/ML/protocol scanners generate new candidates.
7. Metrics world: MamakQuantNode uses approved/compiled labels to compute CEX metrics.

Never allow raw intake or discovery to write directly into production KV labels. Everything must pass through candidate staging and approval/batch commit.

# 2. High-level system loop

The architecture loop is:

Manual input / CSV / URL / PDF / GitHub / official docs / AI-cleaned data / ML discovery / on-chain discovery
→ intake normalization
→ candidate staging
→ evidence attachment
→ confidence scoring
→ approval portal
→ approved registry
→ label batch commit
→ KV/dictionary compiler
→ resolver + metric group membership
→ MamakQuantNode metrics / discovery engine
→ newly discovered candidates
→ back to approval

This loop is the core of the system.

# 3. Important implementation boundary

The existing intake repo is only a reference. It already has an idea like source jobs, extraction, candidates, evidence, registry, and promotion. But this new project should be a new Vercel-hosted web app/control plane.

Create a new folder, for example:

mqchain-console/

or if monorepo:

apps/mqchain-console/

This new app should be built cleanly with:

* Next.js App Router
* TypeScript
* Tailwind CSS
* shadcn/ui
* PostgreSQL
* Drizzle ORM or Prisma, choose one and be consistent
* Auth
* Role-based access control
* Server Actions or route handlers for mutations
* Clean dashboard UI
* Production-ready database schema/migrations
* Seed data for dictionaries
* Audit logging
* CSV upload/manual input flow
* Candidate review/approval flow
* Batch commit flow
* Registry view
* KV build manifest view
* Discovery job view
* Resolver test UI

Vercel is the hosting target for the web control plane. Do not assume RocksDB runs directly inside Vercel serverless functions. RocksDB should be treated as an external/local/worker-produced compiled artifact for now. The Vercel app should manage dictionaries, approvals, manifests, and batch metadata in PostgreSQL. The actual RocksDB compiler can be a separate Node/Python worker/CLI script that reads approved registry data and writes compiled KV files outside Vercel.

# 4. Tech stack requirements

Use:

* Next.js App Router
* TypeScript strict mode
* Tailwind CSS
* shadcn/ui components
* PostgreSQL
* Drizzle ORM preferred unless the existing repo strongly suggests Prisma
* Zod validation
* Server Actions or API route handlers
* Auth.js / NextAuth or Clerk, choose whichever is easiest to make production-ready
* Role-based permissions
* Dark UI by default, enterprise data terminal style
* Tables with filtering, search, pagination
* CSV upload support
* Manual address input support
* JSON evidence payload support
* Hashing for evidence/batches
* Clean typed service layer

Important Vercel/Next.js constraint:

Do not initialize database clients, Redis clients, or SDK clients at module scope. Use lazy singleton getter functions such as getDb(), getRedis(), getStorageClient(). This avoids build-time environment crashes.

Example pattern:

let _db = null

export function getDb() {
if (!_db) {
_db = createDbClient(process.env.DATABASE_URL)
}
return _db
}

Apply this pattern consistently.

# 5. Main navigation / URL structure

Create these routes:

/login
/mqchain
/mqchain/intake
/mqchain/intake/new
/mqchain/source-jobs
/mqchain/source-jobs/[id]
/mqchain/candidates
/mqchain/candidates/[id]
/mqchain/review
/mqchain/review/groups
/mqchain/review/groups/[id]
/mqchain/batches
/mqchain/batches/[id]
/mqchain/registry
/mqchain/registry/[id]
/mqchain/dictionaries
/mqchain/dictionaries/entities
/mqchain/dictionaries/protocols
/mqchain/dictionaries/roles
/mqchain/dictionaries/categories
/mqchain/dictionaries/key-prefixes
/mqchain/metric-groups
/mqchain/discovery
/mqchain/discovery/jobs
/mqchain/discovery/jobs/[id]
/mqchain/kv-builds
/mqchain/kv-builds/[id]
/mqchain/resolver
/mqchain/audit-log
/mqchain/settings

The dashboard /mqchain should show:

* pending candidate count
* needs review count
* approved today
* rejected today
* committed batches
* active entities
* active protocols
* active labels
* unresolved conflicts
* latest KV build manifest
* discovery jobs status
* top source types
* quality-tier distribution
* confidence distribution
* metric eligible count
* recent approval events

# 6. Core data model philosophy

The system must have these layers:

PostgreSQL = canonical control plane, evidence, dictionaries, approval events, registry, batches, manifests.
RocksDB = compiled compact address lookup artifact for mass serving.
Timeline = point-in-time address label lookup for historical CEX in/out flow.
Metric group membership = precompiled countable universe for metrics such as BTC CEX flow.
Archive = raw source snapshots such as PDFs, CSVs, HTML, GitHub files, screenshots, manual notes.
Redis = optional hot cache only, not canonical truth.

PostgreSQL is the source of truth. RocksDB is only a compiled serving artifact. Never make RocksDB the source of truth.

# 7. Required PostgreSQL tables

Implement migrations for the following core tables. Use good indexes, foreign keys, constraints, created_at, updated_at, status fields, and audit-friendly design.

## 7.1 Users and access control

mq_users

* id uuid primary key
* email text unique not null
* display_name text
* role text not null default 'analyst'
* is_active boolean default true
* created_at timestamptz
* updated_at timestamptz

Roles:

* owner
* admin
* analyst
* reviewer
* readonly

Permissions:

* owner/admin can edit dictionaries and commit batches
* reviewer can approve/reject candidates
* analyst can create intake/discovery jobs and propose labels
* readonly can view only

## 7.2 Source jobs

mq_source_jobs

Purpose: stores intake source metadata.

Fields:

* id bigserial primary key
* source_type text not null
  examples: csv_upload, manual_input, official_url, pdf, github, explorer, arkham_reference, llm_cleaned_csv, ml_discovery, onchain_discovery
* source_name text
* source_url text
* local_file_name text
* archive_storage_uri text
* entity_hint text
* protocol_hint text
* chain_scope text[]
* expected_roles text[]
* status text not null
  examples: draft, normalized, extracted, candidate_created, failed, archived
* parser_version text
* submitted_by uuid references mq_users(id)
* created_at timestamptz
* updated_at timestamptz

## 7.3 Raw source documents / archive references

mq_source_documents

Fields:

* id bigserial primary key
* source_job_id bigint references mq_source_jobs(id)
* document_type text
  examples: html_snapshot, pdf, csv, json, manual_note, screenshot, github_file
* original_name text
* storage_uri text
* content_hash text
* mime_type text
* size_bytes bigint
* extracted_text text nullable
* metadata jsonb
* created_at timestamptz

## 7.4 Address candidates

mq_address_candidates

Purpose: unapproved normalized candidates.

Fields:

* id bigserial primary key
* source_job_id bigint references mq_source_jobs(id)
* source_document_id bigint references mq_source_documents(id)
* raw_address text not null
* normalized_address text not null
* chain_code text
  examples: btc, ethereum, polygon, base, arbitrum, optimism, bsc, solana, tron
* address_family text
  examples: btc_p2pkh, btc_p2sh, btc_bech32, evm20, solana32, tron21
* prefix_code integer nullable
* payload_hex text nullable
* entity_hint text
* protocol_hint text
* role_hint text
* suggested_entity_id bigint nullable
* suggested_protocol_id bigint nullable
* suggested_role_id integer nullable
* confidence_score integer default 0
* quality_tier integer default 0
* candidate_status text not null default 'pending_review'
  examples: pending_review, needs_more_evidence, approved, rejected, conflict_pending, duplicate, superseded
* duplicate_of_candidate_id bigint nullable
* discovered_by text
  examples: manual, csv, llm, ml, factory_scanner, registry_scanner, tx_graph_scanner
* discovery_job_id bigint nullable
* evidence_count integer default 0
* last_seen_block bigint nullable
* first_seen_block bigint nullable
* metadata jsonb
* created_at timestamptz
* updated_at timestamptz

Indexes:

* normalized_address + chain_code
* candidate_status
* source_job_id
* suggested_entity_id
* suggested_role_id

## 7.5 Candidate evidence

mq_address_evidence

Purpose: every piece of evidence that supports or weakens a candidate.

Fields:

* id bigserial primary key
* candidate_id bigint references mq_address_candidates(id)
* registry_id bigint nullable
* batch_id bigint nullable
* evidence_type text not null
  examples: official_page, official_csv, proof_of_reserve, etherscan_verified_contract, github_deployment, factory_event, registry_call, token_balance, tx_pattern, manual_note, llm_analysis, ml_score, third_party_label
* source_url text
* source_document_id bigint references mq_source_documents(id)
* evidence_hash text
* storage_uri text
* confidence_delta integer default 0
* trust_tier text
  examples: official, verified_third_party, inferred, weak, conflict
* summary text
* payload jsonb
* created_by uuid nullable
* created_at timestamptz

## 7.6 Entity dictionary

mq_entities

Purpose: who owns or controls an address.

Fields:

* id bigserial primary key
* entity_code text unique not null
  examples: binance, okx, coinbase, aave, morpho, tether
* entity_name text not null
* entity_type text
  examples: cex, dex, defi, custody, issuer, bridge, dao, market_maker, sanction, mixer, gambling, miner, validator, unknown
* category_id integer nullable
* website_url text
* description text
* is_active boolean default true
* created_at timestamptz
* updated_at timestamptz

Seed initial CEX entities:

* Binance
* OKX
* Bybit
* Coinbase
* Kraken
* Bitfinex
* Bitget
* KuCoin
* Gate
* MEXC
* Crypto.com
* Gemini
* Deribit
* Bitstamp
* Upbit
* Bithumb
* Huobi/HTX
* Indodax
* Luno
* BitMEX

Seed DeFi/protocol entities:

* Aave
* Uniswap
* Morpho
* Curve
* Compound
* Lido
* Maker/Sky
* Chainlink
* LayerZero
* Wormhole
* Stargate

## 7.7 Protocol dictionary

mq_protocols

Purpose: protocol/product/subsystem under an entity.

Fields:

* id bigserial primary key
* entity_id bigint references mq_entities(id)
* protocol_code text unique not null
  examples: aave_v3, uniswap_v2, uniswap_v3, morpho_blue
* protocol_name text not null
* protocol_type text
  examples: dex, lending, bridge, yield, perp, liquid_staking, oracle, governance, rwa, nft_marketplace
* chain_scope text[]
* description text
* is_active boolean default true
* created_at timestamptz
* updated_at timestamptz

## 7.8 Category dictionary

mq_category_dict

Purpose: taxonomy categories.

Fields:

* category_id integer primary key
* category_code text unique not null
* category_name text not null
* parent_category_id integer nullable references mq_category_dict(category_id)
* domain_code text
  examples: exchange, defi, bridge, custody, risk, issuer, governance
* metric_domain text nullable
* description text
* is_active boolean default true
* created_at timestamptz
* updated_at timestamptz

Seed:

* cex
* cex_reserve
* cex_deposit
* cex_hot_cold
* defi
* defi_dex
* defi_lending
* defi_yield
* bridge
* custody
* issuer
* oracle
* governance
* treasury
* risk
* mixer
* sanction

## 7.9 Key prefix dictionary

mq_kv_key_prefix_dict

Purpose: defines how chain/address is encoded into compact KV keys.

Fields:

* prefix_code integer primary key
* chain_code text not null
* chain_name text
* chain_family text
  examples: bitcoin, evm, solana, tron
* address_family text
  examples: p2pkh, p2sh, bech32, evm20, base58_32, tron_base58check
* codec text
* payload_len integer
* evm_chain_id integer nullable
* description text
* is_active boolean default true
* created_at timestamptz
* updated_at timestamptz

Seed:

* 0x0010 btc p2pkh base58check 21 bytes
* 0x0011 btc p2sh base58check 21 bytes
* 0x0012 btc bech32 witness program variable
* 0x0101 ethereum evm20 20 bytes
* 0x0102 polygon evm20 20 bytes
* 0x0103 base evm20 20 bytes
* 0x0104 arbitrum evm20 20 bytes
* 0x0105 optimism evm20 20 bytes
* 0x0106 bsc evm20 20 bytes
* 0x0301 solana base58_32 32 bytes
* 0x0401 tron base58check 21 bytes

## 7.10 Role dictionary

mq_kv_role_dict

Purpose: semantic role + category + metric behavior.

Fields:

* role_id integer primary key
* role_code text unique not null
* role_name text not null
* category_id integer references mq_category_dict(category_id)
* role_group text
  examples: cex, protocol, bridge, custody, risk, treasury, governance
* metric_usage_default text
  examples: cex_flow, cex_reserve, protocol_graph, bridge_flow, none
* boundary_class text
  examples: reserve_boundary, core_boundary, candidate_boundary, deposit_boundary, internal_boundary, protocol_boundary, asset_boundary, control_boundary, data_dependency, none
* default_quality_tier integer
* default_flags integer
* description text
* is_active boolean default true
* created_at timestamptz
* updated_at timestamptz

Seed roles:

CEX:

* cex_por_cold_wallet
* cex_cold_wallet
* cex_hot_wallet
* cex_deposit_wallet
* cex_withdrawal_wallet
* cex_internal_wallet
* cex_gas_wallet
* cex_fee_wallet
* cex_reserve_wallet
* cex_old_inactive_wallet
* cex_candidate_wallet

Protocol/DeFi:

* protocol_factory
* protocol_registry
* protocol_router
* protocol_pool
* protocol_vault
* protocol_oracle
* protocol_treasury
* protocol_multisig
* protocol_governance
* protocol_timelock
* protocol_proxy
* protocol_proxy_admin
* protocol_implementation
* protocol_reward_distributor
* protocol_incentives_controller
* protocol_data_provider
* protocol_keeper
* protocol_bridge_adapter

Aave-specific examples:

* aave_pool_addresses_provider
* aave_pool
* aave_pool_configurator
* aave_oracle
* aave_acl_manager
* aave_data_provider
* aave_atoken
* aave_variable_debt_token
* aave_stable_debt_token

Uniswap-specific examples:

* uniswap_v2_factory
* uniswap_v2_pair
* uniswap_v2_router
* uniswap_v3_factory
* uniswap_v3_pool
* uniswap_v3_position_manager

Bridge:

* bridge_router
* bridge_vault
* bridge_relayer
* bridge_adapter
* bridge_messenger

Risk:

* mixer
* sanctioned_wallet
* scam_wallet
* exploit_wallet
* darkweb_wallet
* gambling_wallet

## 7.11 Approved address registry

mq_address_registry

Purpose: canonical approved high-value address registry.

Fields:

* id bigserial primary key
* normalized_address text not null
* raw_address text
* chain_code text not null
* prefix_code integer references mq_kv_key_prefix_dict(prefix_code)
* payload_hex text nullable
* entity_id bigint references mq_entities(id)
* protocol_id bigint nullable references mq_protocols(id)
* role_id integer references mq_kv_role_dict(role_id)
* confidence_score integer not null
* label_status integer not null
* quality_tier integer not null
* flags integer not null default 0
* metric_usage text nullable
* valid_from_block bigint nullable
* valid_to_block bigint nullable
* first_seen_block bigint nullable
* last_seen_block bigint nullable
* is_active boolean default true
* primary_source_job_id bigint nullable references mq_source_jobs(id)
* approved_batch_id bigint nullable
* notes text
* metadata jsonb
* created_at timestamptz
* updated_at timestamptz

Unique index:

* chain_code + normalized_address + role_id + valid_from_block

## 7.12 Label batches

mq_label_batches

Purpose: batch-level approval and commit unit.

Fields:

* id bigserial primary key
* source_job_id bigint nullable references mq_source_jobs(id)
* source_document_id bigint nullable references mq_source_documents(id)
* entity_id bigint nullable references mq_entities(id)
* protocol_id bigint nullable references mq_protocols(id)
* role_id integer nullable references mq_kv_role_dict(role_id)
* source_type text
* source_url text
* source_name text
* confidence_default integer
* quality_tier_default integer
* status_default integer
* flags_default integer
* imported_count integer default 0
* accepted_count integer default 0
* rejected_count integer default 0
* conflict_count integer default 0
* effective_from_block bigint nullable
* effective_to_block bigint nullable
* label_action text
  examples: create, update, supersede, deactivate, mark_historical
* supersedes_batch_id bigint nullable references mq_label_batches(id)
* batch_hash text
* evidence_hash text
* storage_uri text
* parser_version text
* dictionary_version text
* status text not null
  examples: draft, pending_approval, approved, writing, committed, failed, superseded
* created_by uuid references mq_users(id)
* approved_by uuid nullable references mq_users(id)
* created_at timestamptz
* updated_at timestamptz
* approved_at timestamptz nullable
* committed_at timestamptz nullable

## 7.13 Batch evidence

mq_label_batch_evidence

Fields:

* id bigserial primary key
* batch_id bigint references mq_label_batches(id)
* evidence_type text
* source_url text
* source_document_id bigint nullable references mq_source_documents(id)
* evidence_hash text
* storage_uri text
* summary text
* payload jsonb
* created_at timestamptz

## 7.14 Approval events

mq_approval_events

Purpose: immutable audit trail.

Fields:

* id bigserial primary key
* actor_user_id uuid references mq_users(id)
* event_type text not null
  examples: candidate_approved, candidate_rejected, candidate_edited, batch_approved, batch_committed, registry_updated, label_superseded, conflict_marked
* candidate_id bigint nullable references mq_address_candidates(id)
* registry_id bigint nullable references mq_address_registry(id)
* batch_id bigint nullable references mq_label_batches(id)
* old_values jsonb
* new_values jsonb
* reason text
* created_at timestamptz

Do not delete approval events.

## 7.15 Metric group dictionaries

mq_metric_group_dict

Purpose: defines countable metric universes such as BTC CEX flow boundary.

Fields:

* metric_group_id integer primary key
* metric_group_code text unique not null
  examples: btc_cex_flow_boundary, btc_cex_reserve_boundary, eth_cex_erc20_flow_boundary
* metric_domain text not null
  examples: cex_flow, cex_reserve, bridge_flow, protocol_tvl
* chain_code text nullable
* asset_code text nullable
* description text
* is_active boolean default true
* created_at timestamptz
* updated_at timestamptz

Seed:

* btc_cex_flow_boundary
* btc_cex_reserve_boundary
* btc_cex_core_hot_cold
* btc_cex_deposit_candidates
* eth_cex_native_flow_boundary
* eth_cex_erc20_flow_boundary
* stablecoin_cex_flow_boundary
* defi_protocol_asset_container
* bridge_flow_boundary

mq_metric_group_rules

Fields:

* id bigserial primary key
* metric_group_id integer references mq_metric_group_dict(metric_group_id)
* include_category_id integer nullable
* include_role_id integer nullable
* include_entity_id bigint nullable
* exclude_role_id integer nullable
* exclude_entity_id bigint nullable
* min_confidence integer default 80
* require_metric_eligible boolean default true
* require_active boolean default true
* valid_from_block bigint nullable
* valid_to_block bigint nullable
* rule_priority integer default 100
* is_active boolean default true
* created_at timestamptz
* updated_at timestamptz

## 7.16 KV build manifest

mq_kv_index_manifest

Purpose: track compiled KV builds.

Fields:

* id bigserial primary key
* index_name text not null
  examples: address_label_current, address_label_timeline, metric_group_membership
* rocksdb_path text nullable
* column_family text
* key_schema_version integer
* value_schema_version integer
* dictionary_version text
* total_keys bigint default 0
* last_committed_batch_id bigint nullable
* manifest_hash text
* status text
  examples: pending, building, active, failed, superseded
* created_at timestamptz
* activated_at timestamptz nullable

mq_kv_index_shards

Fields:

* id bigserial primary key
* manifest_id bigint references mq_kv_index_manifest(id)
* prefix_code integer
* chain_code text
* shard_id text
* shard_key text
* key_count bigint default 0
* min_key_hex text nullable
* max_key_hex text nullable
* shard_hash text nullable
* status text
* created_at timestamptz
* updated_at timestamptz

mq_dictionary_versions

Fields:

* id bigserial primary key
* version_name text unique not null
* key_prefix_hash text
* role_dict_hash text
* category_hash text
* entity_hash text
* protocol_hash text
* metric_group_hash text
* status text
* created_at timestamptz

## 7.17 Discovery jobs

mq_discovery_jobs

Purpose: tracks discovery tasks that create candidates.

Fields:

* id bigserial primary key
* discovery_type text not null
  examples: factory_event_scan, registry_call_scan, proxy_resolution, tx_graph_cluster, balance_scan, llm_evidence_review, ml_cluster_score
* seed_registry_id bigint nullable references mq_address_registry(id)
* seed_candidate_id bigint nullable references mq_address_candidates(id)
* seed_address text nullable
* chain_code text
* entity_id bigint nullable references mq_entities(id)
* protocol_id bigint nullable references mq_protocols(id)
* status text not null
  examples: queued, running, completed, failed, cancelled
* input_payload jsonb
* result_summary jsonb
* candidates_created integer default 0
* evidence_created integer default 0
* started_at timestamptz nullable
* finished_at timestamptz nullable
* created_by uuid nullable references mq_users(id)
* created_at timestamptz
* updated_at timestamptz

# 8. KV and compact label design

The web app must include data types and documentation for KV compiler even if RocksDB itself is not running inside Vercel.

Define the canonical key/value schemas in code under:

src/lib/mqchain/kv/schema.ts

## 8.1 Current label key

MQK-V1:

[prefix_code:uint16BE][normalized_address_payload]

Examples:

* BTC P2PKH: [00 10][21-byte BTC payload]
* Ethereum: [01 01][20-byte EVM address]
* Polygon: [01 02][20-byte EVM address]

## 8.2 Current label value

MQV-V1 32 bytes:

[schema_version:uint8]
[confidence:uint8]
[label_status:uint8]
[quality_tier:uint8]
[entity_id:uint32LE]
[protocol_id:uint32LE]
[role_id:uint16LE]
[flags:uint16LE]
[batch_id:uint64LE]
[first_seen:uint32LE]
[last_seen:uint32LE]

## 8.3 Timeline key

MQT-Key-V1:

[prefix_code:uint16BE][normalized_address_payload][valid_from:uint64BE]

## 8.4 Timeline value

MQT-V1 40 bytes:

[schema_version:uint8]
[confidence:uint8]
[label_status:uint8]
[quality_tier:uint8]
[entity_id:uint32LE]
[protocol_id:uint32LE]
[role_id:uint16LE]
[flags:uint16LE]
[batch_id:uint64LE]
[valid_to:uint64LE]
[first_seen:uint32LE]
[last_seen:uint32LE]

## 8.5 Metric group membership key

MQG-Key-V1:

[metric_group_id:uint16BE][prefix_code:uint16BE][normalized_address_payload]

Value:

[entity_id:uint32LE]
[role_id:uint16LE]
[confidence:uint8]
[flags:uint16LE]

The metric group membership index is important because MamakQuantNode BTC CEX inflow/outflow wants to ask:

Is this tx input/output address inside btc_cex_flow_boundary?
If yes, get entity_id and role_id.
If no, ignore.

Do not confuse category_id with metric_group_id:

category_id = what type of thing it is.
role_id = what the address does.
metric_group_id = whether this address belongs to a countable metric universe.

# 9. Label statuses, quality tiers, and flags

Implement constants/enums.

## 9.1 label_status

0 unknown
1 active_current
2 inactive_historical
3 migrated
4 deprecated
5 conflict
6 do_not_use
7 pending_review
8 sanctioned_current
9 sanctioned_historical

## 9.2 quality_tier

0 unknown
1 official_verified
2 official_low_confidence
3 third_party_verified
4 inferred_high_confidence
5 inferred_low_confidence
6 manual_reviewed
7 conflict_pending

## 9.3 flags uint16

bit 0 metric_eligible
bit 1 is_contract
bit 2 has_por
bit 3 is_multisig
bit 4 is_sanctioned
bit 5 is_mixer
bit 6 is_official_source
bit 7 is_inferred
bit 8 is_manual_reviewed
bit 9 is_cluster_label
bit 10 is_protocol_root
bit 11 is_asset_container
bit 12 has_secondary_roles
bit 13 has_audit_ptr
bit 14 reserved
bit 15 reserved

Create helper functions:

hasFlag(flags, bit)
setFlag(flags, bit)
clearFlag(flags, bit)
buildDefaultFlags(role, qualityTier, metricEligible)

# 10. Address normalization

Implement a clean normalization library:

src/lib/mqchain/address/normalize.ts

Support initially:

* BTC P2PKH base58check
* BTC P2SH base58check
* BTC Bech32/Bech32m basic validation
* EVM 20-byte address
* Solana base58 32-byte public key basic validation
* Tron base58check 21-byte basic validation

Return:

{
chainCode,
addressFamily,
rawAddress,
normalizedAddress,
prefixCode,
payloadHex,
isValid,
error
}

For EVM:

* accept checksum or lowercase
* normalize to lowercase 0x-prefixed string
* payloadHex = 20-byte lowercase hex without 0x

For BTC:

* validate base58check where possible
* preserve canonical address string
* payloadHex should include version/payload according to prefix rules

For invalid addresses:

* do not crash
* return isValid false and error message
* UI should show validation errors

# 11. Intake system

Build /mqchain/intake and /mqchain/intake/new.

Input modes:

1. Manual single address
2. Manual multi-line addresses
3. CSV upload
4. Source URL with notes
5. Paste JSON evidence
6. AI-cleaned CSV import

CSV format should support flexible columns:

address
chain
entity
protocol
role
source_url
source_name
confidence
quality_tier
notes
first_seen_block
last_seen_block
metric_eligible

The intake flow:

1. Create source job.
2. Archive uploaded file/source metadata.
3. Parse addresses.
4. Normalize.
5. Deduplicate.
6. Create candidates.
7. Attach evidence.
8. Send candidates to pending_review.
9. Show import summary.

Import summary should show:

* total rows
* valid addresses
* invalid addresses
* duplicates
* candidates created
* candidates updated
* evidence created
* conflicts found

Nothing from intake should go directly to registry or KV.

# 12. Candidate review system

Build /mqchain/review and /mqchain/candidates.

Candidate list features:

* search by address
* filter by chain
* filter by entity hint
* filter by protocol hint
* filter by role hint
* filter by status
* filter by confidence range
* filter by quality tier
* filter by source type
* filter by discovery type
* filter conflicts
* sort by confidence, created_at, evidence_count

Candidate detail page should show:

* raw address
* normalized address
* chain
* prefix_code
* payload_hex
* source job
* all evidence
* suggested entity/protocol/role
* confidence score
* quality tier
* flags
* first_seen/last_seen
* duplicate/conflict warnings
* current registry match if already exists
* approval history

Actions:

* approve as suggested
* approve with edits
* reject
* mark needs more evidence
* mark conflict
* merge duplicate
* supersede old label
* mark historical only
* mark metric ineligible

Approval with edits must allow:

* entity_id
* protocol_id
* role_id
* confidence_score
* quality_tier
* label_status
* flags
* metric eligibility
* valid_from_block
* valid_to_block
* first_seen_block
* last_seen_block
* notes

Every action must create mq_approval_events row.

# 13. Batch approval and commit

Build /mqchain/batches.

There are two layers:

1. Candidate approval
2. Batch commit

Approved candidates should be grouped into a label batch before becoming registry truth.

Batch detail page should show:

* source job
* candidates included
* entity/protocol/role defaults
* evidence summary
* imported_count
* accepted_count
* rejected_count
* conflict_count
* quality distribution
* confidence distribution
* effective block range
* flags default
* hash preview
* approval status
* commit status

Batch actions:

* create batch from selected candidates
* approve batch
* commit batch
* fail batch
* supersede batch

When committing a batch:

1. Validate all candidates.
2. Resolve entity/protocol/role/prefix/status/flags.
3. Create/update mq_address_registry rows.
4. Create mq_label_batch_evidence rows.
5. Mark candidates approved.
6. Create approval events.
7. Update batch status to committed.
8. Trigger or mark pending KV rebuild/manifest update.

Do not compile RocksDB inside Vercel. Instead, create a pending KV build manifest or task.

# 14. Registry system

Build /mqchain/registry.

Registry list features:

* search address
* chain filter
* entity filter
* protocol filter
* role filter
* category filter
* metric eligible filter
* active/historical filter
* confidence filter
* quality tier filter
* source batch filter
* conflict filter

Registry detail page:

* address info
* normalized key info
* entity/protocol/role/category
* status, quality, confidence
* flags visual badges
* metric groups membership preview
* timeline validity
* evidence list
* source batch
* approval event history
* related candidates
* related discovery jobs
* optional resolver preview

Registry actions:

* edit label
* deactivate
* mark historical
* supersede
* add secondary role
* add evidence
* create discovery job from this address
* create metric group membership preview

All registry edits must create audit events.

# 15. Dictionary management

Build /mqchain/dictionaries.

Dictionaries should include CRUD UI for:

* entities
* protocols
* categories
* roles
* key prefixes
* metric groups
* metric group rules

Only admin/owner can modify dictionaries.

Any dictionary modification should affect dictionary versioning.

Create a dictionary version hash from:

* key prefixes
* role dict
* category dict
* entity dict
* protocol dict
* metric group dict

Store in mq_dictionary_versions.

# 16. Metric group membership

Build /mqchain/metric-groups.

This is critical for MamakQuantNode metrics.

Metric group concept:

* category = taxonomy
* role = function
* metric group = countable universe

Examples:

btc_cex_flow_boundary:
include:

* cex_hot_wallet
* cex_cold_wallet
* cex_por_cold_wallet
* cex_withdrawal_wallet
  maybe include:
* cex_deposit_wallet if confidence high
  exclude:
* cex_gas_wallet
* cex_fee_wallet
* inactive historical unless resolving historical block
* low confidence candidates

btc_cex_reserve_boundary:
include:

* cex_por_cold_wallet
* cex_cold_wallet
* cex_reserve_wallet
  exclude:
* deposit wallets
* hot wallets optionally depending rule

The UI should show:

* group definition
* included roles/categories/entities
* excluded roles/entities
* min confidence
* require metric eligible
* estimated address count
* preview matching registry rows
* export/compile status

Provide a preview function:
Given a metric_group_id, query PostgreSQL registry rows that match group rules and show them.

# 17. Resolver test UI

Build /mqchain/resolver.

This page lets me test:

Input:

* chain
* address
* optional block number
* optional metric group

Output:

* normalized address
* prefix code
* payload hex
* current label
* point-in-time label if block provided
* entity
* protocol
* role
* category
* status
* quality tier
* confidence
* flags
* metric eligible
* metric group membership preview
* source batch
* evidence summary

For now, resolver reads PostgreSQL registry, because RocksDB is external. But design service abstraction so later it can read RocksDB first.

Create interface:

AddressResolver {
resolveCurrent(chain, address)
resolveAt(chain, address, blockNumber)
checkMetricGroup(chain, address, metricGroupCode)
}

Implementation now:
PostgresAddressResolver

Future:
RocksDbAddressResolver

# 18. Discovery system

Build /mqchain/discovery and /mqchain/discovery/jobs.

Discovery does not directly approve labels. It creates candidates and evidence.

Discovery types:

## 18.1 Factory event scanner

Input:

* chain
* factory address
* event signature
* from_block
* to_block
* protocol_id
* expected child role

Use for:

* Uniswap V2 PairCreated
* Uniswap V3 PoolCreated
* vault factories
* market factories
* clone factories

Output:

* discovered child addresses as candidates
* evidence_type = factory_event
* payload includes event args, tx hash, block, log index

## 18.2 Registry/address-provider scanner

Input:

* chain
* registry/address provider address
* ABI/function names
* protocol_id

Use for:

* Aave PoolAddressesProvider
* protocol registries
* address providers
* directory contracts

Output:

* discovered core addresses as candidates
* evidence_type = registry_call
* payload includes called function and return value

## 18.3 Proxy resolution scanner

Input:

* chain
* proxy address

Output:

* implementation address
* proxy admin address if detectable
* evidence_type = proxy_resolution

## 18.4 Pool/vault inspector

Input:

* chain
* pool/vault address
* ABI type

Inspect:

* token0/token1
* getReserves
* asset
* totalAssets
* totalSupply
* reserves list if lending pool
* recent activity

Output:

* candidate metadata
* role hints
* asset-container flags

## 18.5 TX graph scanner

Input:

* known entity address
* block range
* threshold rules

Find:

* repeated counterparties
* consolidation addresses
* hot/cold movement
* deposit fan-in
* exchange internal movement

Output:

* candidates with inferred confidence
* evidence_type = tx_pattern
* never direct approve

## 18.6 LLM/ML evidence reviewer

Input:

* candidate group
* source text/evidence payload

Output:

* suggested entity/protocol/role/confidence
* reasoning summary
* structured evidence
* status remains pending_review

Do not rely on LLM as truth. LLM only helps structure evidence and propose labels.

Discovery UI should show:

* job status
* seed
* candidates created
* evidence created
* errors
* logs
* result summary
* button to send result group to review

# 19. Protocol discovery philosophy

Do not make the mistake of only relying on factory addresses.

Factory discovers child contracts:

* pairs
* pools
* markets
* vaults
* clones

But protocols also have:

* router
* registry
* oracle
* treasury
* governance
* timelock
* multisig
* proxy admin
* incentives controller
* reward distributor
* data provider
* bridge relayer
* keeper
* liquidation bot
* frontend fee collector

The discovery system should classify root types:

* Factory
* Registry
* Router
* Pool
* Vault
* Proxy
* Treasury
* Oracle
* Governance
* Timelock
* Multisig
* DataProvider
* IncentivesController
* RewardDistributor
* BridgeRelayer
* Keeper

Discovery workflow:

Input official URL/deployment address
→ extract root addresses
→ classify root type
→ if Factory: scan Created events
→ if Registry: call view functions
→ if Proxy: resolve implementation/admin
→ if Pool: inspect token/reserve data
→ if Vault: inspect asset/share/totalAssets
→ if Treasury/Multisig: attach governance/control evidence
→ create candidates with role/confidence/evidence
→ approval portal
→ approved registry
→ KV compiler

# 20. CEX metric design requirement

The system must support MamakQuantNode BTC CEX inflow/outflow.

The metric code wants this logic:

For each BTC transaction:

* extract input address set
* extract output address set
* normalize addresses
* check whether each address is inside btc_cex_flow_boundary metric group
* if yes, get entity_id and role_id
* classify flow

Classification:

input side has no CEX, output side has CEX
→ CEX inflow

input side has CEX, output side has no CEX
→ CEX outflow

input side has CEX and output side has same CEX
→ internal movement

input side has CEX A and output side has CEX B
→ inter-exchange flow

both sides unknown
→ ignore

Do not only store category_id = cex. That is too broad. The system must support metric_group_id such as btc_cex_flow_boundary. This is the countable universe for the metric.

# 21. UI/UX requirements

Design style:

* dark mode
* professional intelligence terminal
* shadcn/ui
* compact but readable
* badges for status, quality tier, role, category, flags
* monospace for addresses, hashes, IDs
* cards for summaries
* data tables for candidates/registry/batches
* dialogs for approval/rejection
* forms should be validated with Zod
* loading states
* error states
* empty states

Important pages:

## Dashboard

Cards:

* Pending candidates
* Needs review
* Conflicts
* Approved labels
* Active registry rows
* Latest committed batch
* Latest KV manifest
* Discovery jobs running
* Metric groups active

Charts/tables:

* Candidates by source type
* Labels by quality tier
* Labels by entity
* Recent approval events
* Recent source jobs
* Recent discovery jobs

## Review page

Make it efficient for manual approval:

* candidate group table on left
* evidence panel on right
* quick approve/reject buttons
* edit form
* keyboard-friendly if possible
* batch select

## Registry page

Make it searchable and audit-friendly.

## Resolver page

Make it simple to paste address and instantly see what the system thinks.

# 22. API / service layer

Create clean services:

src/lib/mqchain/services/source-job-service.ts
src/lib/mqchain/services/candidate-service.ts
src/lib/mqchain/services/evidence-service.ts
src/lib/mqchain/services/approval-service.ts
src/lib/mqchain/services/batch-service.ts
src/lib/mqchain/services/registry-service.ts
src/lib/mqchain/services/dictionary-service.ts
src/lib/mqchain/services/metric-group-service.ts
src/lib/mqchain/services/resolver-service.ts
src/lib/mqchain/services/discovery-service.ts
src/lib/mqchain/services/kv-manifest-service.ts

Create types:

src/lib/mqchain/types.ts
src/lib/mqchain/constants.ts
src/lib/mqchain/flags.ts
src/lib/mqchain/address/normalize.ts
src/lib/mqchain/kv/schema.ts

Create validation schemas:

src/lib/mqchain/validators/intake.ts
src/lib/mqchain/validators/candidate.ts
src/lib/mqchain/validators/approval.ts
src/lib/mqchain/validators/batch.ts
src/lib/mqchain/validators/registry.ts
src/lib/mqchain/validators/dictionary.ts
src/lib/mqchain/validators/discovery.ts

# 23. Server actions / mutations

Implement actions:

createSourceJob
uploadCsvSource
createManualCandidate
normalizeSourceJob
createCandidatesFromCsv
addCandidateEvidence
approveCandidate
rejectCandidate
markCandidateConflict
createBatchFromCandidates
approveBatch
commitBatch
updateRegistryLabel
deactivateRegistryLabel
createDiscoveryJob
completeDiscoveryJob
createMetricGroup
previewMetricGroupMembers
createKvBuildManifest
activateKvBuildManifest

Each mutation must:

* validate input
* check permissions
* write audit events when relevant
* revalidate relevant paths
* return structured success/error response

# 24. Security requirements

* Auth required for all /mqchain routes.
* No anonymous access to data.
* Role-based permissions.
* Never expose DATABASE_URL or secrets to client.
* Validate all user input.
* Prevent arbitrary file execution.
* CSV upload size limit.
* Sanitize displayed text from sources.
* Use server-side mutations only.
* Keep audit trail immutable.
* Never trust LLM output as approved truth.
* Never allow discovery job to directly commit registry labels.

# 25. Production readiness

Add:

* .env.example
* README.md
* database migration command
* seed command
* local dev command
* Vercel deployment notes
* typecheck script
* lint script
* build script
* basic tests for address normalization
* basic tests for flags
* basic tests for metric group rule matching
* seed dictionaries
* seed admin user placeholder instructions

package.json scripts:

* dev
* build
* start
* lint
* typecheck
* db:generate
* db:migrate
* db:seed
* test

# 26. What to build first

Build in this order:

Phase 1:

* Next.js app scaffold
* auth layout
* database setup
* migrations
* dictionary seeds
* dashboard shell

Phase 2:

* intake CSV/manual input
* source jobs
* candidates
* evidence

Phase 3:

* review UI
* approval events
* batch creation
* batch commit to registry

Phase 4:

* registry UI
* dictionary UI
* resolver test UI

Phase 5:

* metric groups
* metric group rule preview
* KV manifest page

Phase 6:

* discovery job UI
* discovery job stubs
* factory/registry/proxy scanner interfaces

Do not overbuild blockchain RPC scanning first. The first deliverable should be a strong approval + registry + dictionary + batch system.

# 27. Expected first deliverable

Return a complete implementation plan, then implement the first production slice:

Slice 1 acceptance criteria:

* App runs locally.
* Auth-protected /mqchain dashboard exists.
* PostgreSQL schema/migrations exist.
* Seed dictionaries exist.
* /mqchain/intake/new can create manual or CSV source job.
* CSV upload parses rows and creates candidates.
* /mqchain/candidates shows candidate table.
* /mqchain/candidates/[id] shows evidence and suggested label.
* /mqchain/review allows approve/reject with edits.
* Approval writes mq_approval_events.
* Approved candidates can be grouped into batch.
* Batch commit writes mq_address_registry.
* /mqchain/registry shows approved labels.
* /mqchain/resolver can resolve from PostgreSQL registry.
* README explains setup and deployment.

# 28. Coding standards

* Use strict TypeScript.
* Keep components small.
* Prefer Server Components for data loading.
* Use Client Components only for interactive forms/tables/dialogs.
* Use Zod for input validation.
* Use typed DB schema.
* Use clear enum/constants files.
* Avoid giant files.
* Avoid business logic inside React components.
* Use service layer.
* Use transactions for approval/batch commit.
* Use indexes for heavy tables.
* Add useful comments only where logic is non-obvious.

# 29. Important conceptual rules

1. Intake is not approval.
2. Discovery is not approval.
3. Registry is truth.
4. RocksDB/KV is compiled artifact, not truth.
5. Metric group is not category.
6. Role determines address function.
7. Category determines taxonomy.
8. Entity determines owner/controller.
9. Protocol determines subsystem/product.
10. Batch provides auditability.
11. Evidence must be attached before approval.
12. Timeline labels are required for historical metrics.
13. Current labels are okay for live metrics.
14. CEX metric must count only metric-eligible boundary addresses.
15. Low-confidence candidates must not enter production metrics by default.

# 30. Final product description

Build MQCHAIN Console: a production-grade blockchain address intelligence control plane for MamakQuant.

It should feel like an internal Arkham + Glassnode labelling terminal:

* Intake sources.
* Normalize addresses.
* Stage candidates.
* Attach evidence.
* Review and approve.
* Commit batches.
* Maintain canonical registry.
* Manage dictionaries.
* Build metric groups.
* Prepare compact KV/RocksDB manifests.
* Test resolver output.
* Launch discovery jobs.
* Feed MamakQuantNode metrics.

The system must be clean, auditable, scalable, and production-ready for Vercel web hosting.

Start by inspecting the provided existing intake repo as reference only. Then create the new Vercel app folder and implement the architecture above.
