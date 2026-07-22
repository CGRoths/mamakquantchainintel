# MQCHAIN PostgreSQL domains

PostgreSQL is the canonical store. The Phase I migration changes physical table
names in place with `ALTER TABLE ... RENAME TO`; it does not recreate existing
tables, reseed identities, or rewrite rows. RocksDB remains a derived immutable
serving artifact.

## Physical table mapping

`U1 IDs` means that the table owns or references an integer encoded by a frozen
U1 key/value. `Canonical` describes governed state, not a cache.

| Old table | New table | Domain | U1 IDs |
| --- | --- | --- | --- |
| `mq_chain_networks` | `mq_dict_chain_networks` | dictionary/canonical | yes |
| `mq_address_namespaces` | `mq_dict_address_namespaces` | dictionary/canonical | yes |
| `mq_address_codecs` | `mq_dict_address_codecs` | dictionary/canonical | yes |
| `mq_entities` | `mq_dict_entities` | dictionary/canonical | yes |
| `mq_protocols` | `mq_dict_protocols` | dictionary/canonical | yes |
| `mq_protocol_deployments` | `mq_dict_protocol_deployments` | dictionary/canonical | referenced |
| `mq_protocol_components` | `mq_dict_protocol_components` | dictionary/canonical | yes |
| `mq_category_dict` | `mq_dict_categories` | dictionary/canonical | yes |
| `mq_kv_role_dict` | `mq_dict_roles` | dictionary/canonical | yes |
| `mq_tag_dict` | `mq_dict_tags` | dictionary/canonical | referenced |
| `mq_tagset_dict` | `mq_dict_tagsets` | dictionary/canonical | yes |
| `mq_tagset_members` | `mq_map_tagset_members` | dictionary mapping | referenced |
| `mq_metric_groups` | `mq_dict_metric_groups` | dictionary/canonical | yes |
| `mq_assets` | `mq_dict_assets` | dictionary/canonical | yes |
| `mq_token_standards` | `mq_dict_token_standards` | dictionary/canonical | yes |
| `mq_kv_key_prefix_dict` | `mq_dict_legacy_key_prefixes` | legacy dictionary | legacy only |
| `mq_metric_group_rules` | `mq_policy_metric_group_rules` | policy | referenced |
| `mq_chain_capabilities` | `mq_policy_chain_capabilities` | policy | referenced |
| `mq_address_registry` | `mq_registry_address_labels` | registry/canonical | yes |
| `mq_address_tags` | `mq_registry_address_tags` | registry mapping | referenced |
| `mq_token_contracts` | `mq_registry_token_contracts` | registry/canonical | yes |
| `mq_asset_namespaces` | `mq_registry_asset_namespaces` | registry/canonical | yes |
| `mq_source_jobs` | `mq_workflow_source_jobs` | workflow | no |
| `mq_source_documents` | `mq_workflow_source_documents` | workflow | no |
| `mq_discovery_jobs` | `mq_workflow_discovery_jobs` | workflow | no |
| `mq_address_candidates` | `mq_workflow_address_candidates` | workflow | proposed IDs |
| `mq_address_evidence` | `mq_workflow_address_evidence` | workflow | no |
| `mq_source_verifications` | `mq_workflow_source_verifications` | workflow | no |
| `mq_label_batches` | `mq_workflow_label_batches` | workflow/governance | batch ID |
| `mq_label_batch_candidates` | `mq_workflow_label_batch_candidates` | workflow mapping | no |
| `mq_label_batch_evidence` | `mq_workflow_label_batch_evidence` | workflow mapping | no |
| `mq_approval_events` | `mq_workflow_approval_events` | append-only workflow audit | no |
| `mq_chain_aliases` | `mq_catalog_chain_aliases` | catalog | referenced |
| `mq_external_identifiers` | `mq_catalog_external_identifiers` | catalog | no |
| `mq_name_aliases` | `mq_catalog_name_aliases` | catalog | referenced |
| `mq_dictionary_versions` | `mq_governance_dictionary_versions` | governance | no |
| `mq_dictionary_proposals` | `mq_governance_dictionary_proposals` | governance | proposed IDs |
| `mq_dictionary_id_ranges` | `mq_governance_dictionary_id_ranges` | governance | allocation |
| `mq_network_change_proposals` | `mq_governance_network_change_proposals` | governance | referenced |
| `mq_kv_builds` | `mq_build_kv_builds` | build/control plane | batch lineage |
| `mq_kv_compiled_entries` | `mq_build_compiled_entries` | derived build | exact U1 bytes |
| `mq_kv_validation_runs` | `mq_build_validation_runs` | build validation | no |
| `mq_metric_group_membership_snapshots` | `mq_build_metric_group_membership_snapshots` | derived build | group IDs |
| `mq_metric_group_members` | `mq_build_metric_group_members` | derived build | group/registry IDs |
| `mq_kv_index_manifest` | `mq_build_index_manifests` | build manifest | referenced |
| `mq_kv_index_shards` | `mq_build_index_shards` | build manifest | no |
| `mq_kv_filter_manifest` | `mq_build_filter_manifests` | derived build | referenced |
| `mq_audit_log` | `mq_audit_events` | append-only audit | no |

`mq_users` and `mq_catalog_sources` intentionally keep their names. Newly added
tables are `mq_dict_label_statuses`, `mq_dict_metric_membership_statuses`,
`mq_dict_asset_statuses`, `mq_dict_quality_tiers`, `mq_dict_flag_bits`,
`mq_contract_u1_versions`, `mq_policy_role_approval_requirements`, and
`mq_workflow_bulk_approval_operations`.

## Object handling

PostgreSQL preserves table OIDs, foreign-key targets, owned sequences, defaults,
indexes, and constraints across a table rename. Existing index, constraint, and
sequence names are deliberately retained. Four PL/pgSQL trigger functions that
contained relation-name text are recreated against the new names. Views and FK
dependencies follow table OIDs automatically. Historical audit payloads,
`target_table` strings, build manifests, hashes, and compiled bytes are not
rewritten.

## Migration and rollback

Forward migration: `drizzle/0015_phase1_domain_hardening.sql` through
`npm.cmd run db:migrate`. Rollback:

```powershell
Get-Content -Raw drizzle/rollback/0015_phase1_domain_hardening.down.sql |
  psql $env:DATABASE_URL -v ON_ERROR_STOP=1
```

Use maintenance mode and a verified backup. Deploy application code and the
forward migration together; do not use compatibility views for writes. Rollback
renames all 48 tables back and drops only the descriptive compact-code and U1
contract tables. Workflow policy/idempotency rows survive rollback. See
`MQCHAIN_PRODUCTION_MIGRATION_RUNBOOK.md` for the complete procedure.
