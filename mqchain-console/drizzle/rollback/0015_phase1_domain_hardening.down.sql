BEGIN;

ALTER TABLE "mq_audit_events" RENAME TO "mq_audit_log";
ALTER TABLE "mq_build_filter_manifests" RENAME TO "mq_kv_filter_manifest";
ALTER TABLE "mq_build_index_shards" RENAME TO "mq_kv_index_shards";
ALTER TABLE "mq_build_index_manifests" RENAME TO "mq_kv_index_manifest";
ALTER TABLE "mq_build_metric_group_members" RENAME TO "mq_metric_group_members";
ALTER TABLE "mq_build_metric_group_membership_snapshots" RENAME TO "mq_metric_group_membership_snapshots";
ALTER TABLE "mq_build_validation_runs" RENAME TO "mq_kv_validation_runs";
ALTER TABLE "mq_build_compiled_entries" RENAME TO "mq_kv_compiled_entries";
ALTER TABLE "mq_build_kv_builds" RENAME TO "mq_kv_builds";
ALTER TABLE "mq_governance_network_change_proposals" RENAME TO "mq_network_change_proposals";
ALTER TABLE "mq_governance_dictionary_id_ranges" RENAME TO "mq_dictionary_id_ranges";
ALTER TABLE "mq_governance_dictionary_proposals" RENAME TO "mq_dictionary_proposals";
ALTER TABLE "mq_governance_dictionary_versions" RENAME TO "mq_dictionary_versions";
ALTER TABLE "mq_catalog_name_aliases" RENAME TO "mq_name_aliases";
ALTER TABLE "mq_catalog_external_identifiers" RENAME TO "mq_external_identifiers";
ALTER TABLE "mq_catalog_chain_aliases" RENAME TO "mq_chain_aliases";
ALTER TABLE "mq_workflow_approval_events" RENAME TO "mq_approval_events";
ALTER TABLE "mq_workflow_label_batch_evidence" RENAME TO "mq_label_batch_evidence";
ALTER TABLE "mq_workflow_label_batch_candidates" RENAME TO "mq_label_batch_candidates";
ALTER TABLE "mq_workflow_label_batches" RENAME TO "mq_label_batches";
ALTER TABLE "mq_workflow_source_verifications" RENAME TO "mq_source_verifications";
ALTER TABLE "mq_workflow_address_evidence" RENAME TO "mq_address_evidence";
ALTER TABLE "mq_workflow_address_candidates" RENAME TO "mq_address_candidates";
ALTER TABLE "mq_workflow_discovery_jobs" RENAME TO "mq_discovery_jobs";
ALTER TABLE "mq_workflow_source_documents" RENAME TO "mq_source_documents";
ALTER TABLE "mq_workflow_source_jobs" RENAME TO "mq_source_jobs";
ALTER TABLE "mq_registry_asset_namespaces" RENAME TO "mq_asset_namespaces";
ALTER TABLE "mq_registry_token_contracts" RENAME TO "mq_token_contracts";
ALTER TABLE "mq_registry_address_tags" RENAME TO "mq_address_tags";
ALTER TABLE "mq_registry_address_labels" RENAME TO "mq_address_registry";
ALTER TABLE "mq_policy_chain_capabilities" RENAME TO "mq_chain_capabilities";
ALTER TABLE "mq_policy_metric_group_rules" RENAME TO "mq_metric_group_rules";
ALTER TABLE "mq_dict_legacy_key_prefixes" RENAME TO "mq_kv_key_prefix_dict";
ALTER TABLE "mq_dict_token_standards" RENAME TO "mq_token_standards";
ALTER TABLE "mq_dict_assets" RENAME TO "mq_assets";
ALTER TABLE "mq_dict_metric_groups" RENAME TO "mq_metric_groups";
ALTER TABLE "mq_map_tagset_members" RENAME TO "mq_tagset_members";
ALTER TABLE "mq_dict_tagsets" RENAME TO "mq_tagset_dict";
ALTER TABLE "mq_dict_tags" RENAME TO "mq_tag_dict";
ALTER TABLE "mq_dict_roles" RENAME TO "mq_kv_role_dict";
ALTER TABLE "mq_dict_categories" RENAME TO "mq_category_dict";
ALTER TABLE "mq_dict_protocol_components" RENAME TO "mq_protocol_components";
ALTER TABLE "mq_dict_protocol_deployments" RENAME TO "mq_protocol_deployments";
ALTER TABLE "mq_dict_protocols" RENAME TO "mq_protocols";
ALTER TABLE "mq_dict_entities" RENAME TO "mq_entities";
ALTER TABLE "mq_dict_address_codecs" RENAME TO "mq_address_codecs";
ALTER TABLE "mq_dict_address_namespaces" RENAME TO "mq_address_namespaces";
ALTER TABLE "mq_dict_chain_networks" RENAME TO "mq_chain_networks";

CREATE OR REPLACE FUNCTION "mq_validate_active_namespace"() RETURNS trigger AS $$
BEGIN
  IF NEW."is_active" AND NOT EXISTS (
    SELECT 1 FROM "mq_chain_networks" network
    JOIN "mq_address_codecs" codec ON codec."address_codec_id" = NEW."address_codec_id"
    WHERE network."chain_network_id" = NEW."chain_network_id" AND network."is_active"
      AND codec."status" NOT IN ('unsupported', 'disabled')
  ) THEN RAISE EXCEPTION 'active namespace requires an active network and enabled codec';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mq_guard_network_namespace_deactivation() RETURNS trigger AS $$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active
    AND EXISTS (SELECT 1 FROM mq_address_namespaces WHERE chain_network_id = OLD.chain_network_id AND is_active) THEN
    RAISE EXCEPTION 'cannot deactivate network % while active namespaces reference it', OLD.chain_network_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mq_guard_codec_namespace_deactivation() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'disabled' AND NEW.status = 'disabled'
    AND EXISTS (SELECT 1 FROM mq_address_namespaces WHERE address_codec_id = OLD.address_codec_id AND is_active) THEN
    RAISE EXCEPTION 'cannot disable codec % while active namespaces reference it', OLD.address_codec_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mq_guard_network_proposal_activation() RETURNS trigger AS $$
DECLARE proposal_id_text text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_active AND NEW.chain_network_id > 48 THEN
    RAISE EXCEPTION 'unknown network % must be created inactive through a manual proposal', NEW.chain_network_id;
  END IF;
  IF TG_OP = 'UPDATE' AND NOT OLD.is_active AND NEW.is_active THEN
    proposal_id_text := current_setting('mqchain.network_change_proposal_id', true);
    IF proposal_id_text IS NULL OR proposal_id_text = '' OR NOT EXISTS (
      SELECT 1 FROM mq_network_change_proposals proposal
      WHERE proposal.id = proposal_id_text::bigint AND proposal.network_id = NEW.chain_network_id
        AND proposal.change_type = 'activate' AND proposal.status = 'approved'
    ) THEN RAISE EXCEPTION 'network % activation requires an approved manual proposal', NEW.chain_network_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- These compact dictionaries and the contract registry are descriptive additions.
-- Rollback explicitly drops them; all workflow and role-policy rows are retained.
DROP TABLE "mq_contract_u1_versions";
DROP TABLE "mq_dict_flag_bits";
DROP TABLE "mq_dict_quality_tiers";
DROP TABLE "mq_dict_asset_statuses";
DROP TABLE "mq_dict_metric_membership_statuses";
DROP TABLE "mq_dict_label_statuses";

COMMIT;
