-- Drizzle executes this migration in one transaction.

ALTER TABLE "mq_chain_networks" RENAME TO "mq_dict_chain_networks";
ALTER TABLE "mq_address_namespaces" RENAME TO "mq_dict_address_namespaces";
ALTER TABLE "mq_address_codecs" RENAME TO "mq_dict_address_codecs";
ALTER TABLE "mq_entities" RENAME TO "mq_dict_entities";
ALTER TABLE "mq_protocols" RENAME TO "mq_dict_protocols";
ALTER TABLE "mq_protocol_deployments" RENAME TO "mq_dict_protocol_deployments";
ALTER TABLE "mq_protocol_components" RENAME TO "mq_dict_protocol_components";
ALTER TABLE "mq_category_dict" RENAME TO "mq_dict_categories";
ALTER TABLE "mq_kv_role_dict" RENAME TO "mq_dict_roles";
ALTER TABLE "mq_tag_dict" RENAME TO "mq_dict_tags";
ALTER TABLE "mq_tagset_dict" RENAME TO "mq_dict_tagsets";
ALTER TABLE "mq_tagset_members" RENAME TO "mq_map_tagset_members";
ALTER TABLE "mq_metric_groups" RENAME TO "mq_dict_metric_groups";
ALTER TABLE "mq_assets" RENAME TO "mq_dict_assets";
ALTER TABLE "mq_token_standards" RENAME TO "mq_dict_token_standards";
ALTER TABLE "mq_kv_key_prefix_dict" RENAME TO "mq_dict_legacy_key_prefixes";
ALTER TABLE "mq_metric_group_rules" RENAME TO "mq_policy_metric_group_rules";
ALTER TABLE "mq_chain_capabilities" RENAME TO "mq_policy_chain_capabilities";
ALTER TABLE "mq_address_registry" RENAME TO "mq_registry_address_labels";
ALTER TABLE "mq_address_tags" RENAME TO "mq_registry_address_tags";
ALTER TABLE "mq_token_contracts" RENAME TO "mq_registry_token_contracts";
ALTER TABLE "mq_asset_namespaces" RENAME TO "mq_registry_asset_namespaces";
ALTER TABLE "mq_source_jobs" RENAME TO "mq_workflow_source_jobs";
ALTER TABLE "mq_source_documents" RENAME TO "mq_workflow_source_documents";
ALTER TABLE "mq_discovery_jobs" RENAME TO "mq_workflow_discovery_jobs";
ALTER TABLE "mq_address_candidates" RENAME TO "mq_workflow_address_candidates";
ALTER TABLE "mq_address_evidence" RENAME TO "mq_workflow_address_evidence";
ALTER TABLE "mq_source_verifications" RENAME TO "mq_workflow_source_verifications";
ALTER TABLE "mq_label_batches" RENAME TO "mq_workflow_label_batches";
ALTER TABLE "mq_label_batch_candidates" RENAME TO "mq_workflow_label_batch_candidates";
ALTER TABLE "mq_label_batch_evidence" RENAME TO "mq_workflow_label_batch_evidence";
ALTER TABLE "mq_approval_events" RENAME TO "mq_workflow_approval_events";
ALTER TABLE "mq_chain_aliases" RENAME TO "mq_catalog_chain_aliases";
ALTER TABLE "mq_external_identifiers" RENAME TO "mq_catalog_external_identifiers";
ALTER TABLE "mq_name_aliases" RENAME TO "mq_catalog_name_aliases";
ALTER TABLE "mq_dictionary_versions" RENAME TO "mq_governance_dictionary_versions";
ALTER TABLE "mq_dictionary_proposals" RENAME TO "mq_governance_dictionary_proposals";
ALTER TABLE "mq_dictionary_id_ranges" RENAME TO "mq_governance_dictionary_id_ranges";
ALTER TABLE "mq_network_change_proposals" RENAME TO "mq_governance_network_change_proposals";
ALTER TABLE "mq_kv_builds" RENAME TO "mq_build_kv_builds";
ALTER TABLE "mq_kv_compiled_entries" RENAME TO "mq_build_compiled_entries";
ALTER TABLE "mq_kv_validation_runs" RENAME TO "mq_build_validation_runs";
ALTER TABLE "mq_metric_group_membership_snapshots" RENAME TO "mq_build_metric_group_membership_snapshots";
ALTER TABLE "mq_metric_group_members" RENAME TO "mq_build_metric_group_members";
ALTER TABLE "mq_kv_index_manifest" RENAME TO "mq_build_index_manifests";
ALTER TABLE "mq_kv_index_shards" RENAME TO "mq_build_index_shards";
ALTER TABLE "mq_kv_filter_manifest" RENAME TO "mq_build_filter_manifests";
ALTER TABLE "mq_audit_log" RENAME TO "mq_audit_events";

-- PostgreSQL rewrites view dependencies and FK targets by OID during table
-- rename, but PL/pgSQL relation names are resolved when a statement executes.
-- Recreate the four trigger functions that embed physical table names.
CREATE OR REPLACE FUNCTION "mq_validate_active_namespace"() RETURNS trigger AS $$
BEGIN
  IF NEW."is_active" AND NOT EXISTS (
    SELECT 1 FROM "mq_dict_chain_networks" network
    JOIN "mq_dict_address_codecs" codec ON codec."address_codec_id" = NEW."address_codec_id"
    WHERE network."chain_network_id" = NEW."chain_network_id"
      AND network."is_active"
      AND codec."status" NOT IN ('unsupported', 'disabled')
  ) THEN
    RAISE EXCEPTION 'active namespace requires an active network and enabled codec';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mq_guard_network_namespace_deactivation() RETURNS trigger AS $$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active
    AND EXISTS (SELECT 1 FROM mq_dict_address_namespaces WHERE chain_network_id = OLD.chain_network_id AND is_active) THEN
    RAISE EXCEPTION 'cannot deactivate network % while active namespaces reference it', OLD.chain_network_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mq_guard_codec_namespace_deactivation() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'disabled' AND NEW.status = 'disabled'
    AND EXISTS (SELECT 1 FROM mq_dict_address_namespaces WHERE address_codec_id = OLD.address_codec_id AND is_active) THEN
    RAISE EXCEPTION 'cannot disable codec % while active namespaces reference it', OLD.address_codec_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mq_guard_network_proposal_activation() RETURNS trigger AS $$
DECLARE
  proposal_id_text text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_active AND NEW.chain_network_id > 48 THEN
    RAISE EXCEPTION 'unknown network % must be created inactive through a manual proposal', NEW.chain_network_id;
  END IF;
  IF TG_OP = 'UPDATE' AND NOT OLD.is_active AND NEW.is_active THEN
    proposal_id_text := current_setting('mqchain.network_change_proposal_id', true);
    IF proposal_id_text IS NULL OR proposal_id_text = '' OR NOT EXISTS (
      SELECT 1 FROM mq_governance_network_change_proposals proposal
      WHERE proposal.id = proposal_id_text::bigint
        AND proposal.network_id = NEW.chain_network_id
        AND proposal.change_type = 'activate'
        AND proposal.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'network % activation requires an approved manual proposal', NEW.chain_network_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE "mq_dict_label_statuses" (
  "label_status_code" integer PRIMARY KEY,
  "stable_code" text NOT NULL UNIQUE,
  "display_name" text NOT NULL,
  "description" text NOT NULL,
  "is_current" boolean NOT NULL,
  "is_historical" boolean NOT NULL,
  "is_serving" boolean NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true
);
INSERT INTO "mq_dict_label_statuses" VALUES
(0,'unknown','Unknown','No governed label state assigned.',false,false,false,true),
(1,'active_current','Active current','Current serving label.',true,false,true,true),
(2,'inactive_historical','Inactive historical','Historical label excluded from current serving.',false,true,true,true),
(3,'migrated','Migrated','Label migrated from a previous governed source.',false,true,true,true),
(4,'deprecated','Deprecated','Label retained for decoding but deprecated.',false,true,false,true),
(5,'conflict','Conflict','Label is in a governed conflict state.',false,false,false,true),
(6,'do_not_use','Do not use','Label must not be served.',false,false,false,true),
(7,'pending_review','Pending review','Label is awaiting operator review.',false,false,false,true),
(8,'sanctioned_current','Sanctioned current','Current sanctioned serving label.',true,false,true,true),
(9,'sanctioned_historical','Sanctioned historical','Historical sanctioned label.',false,true,true,true);

CREATE TABLE "mq_dict_metric_membership_statuses" (
  "membership_status_code" integer PRIMARY KEY,
  "stable_code" text NOT NULL UNIQUE,
  "display_name" text NOT NULL,
  "is_member" boolean NOT NULL,
  "description" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true
);
INSERT INTO "mq_dict_metric_membership_statuses" VALUES
(0,'unknown','Unknown',false,'No governed metric membership state assigned.',true),
(1,'active','Active',true,'Registry row is an active member of the metric group.',true),
(2,'removed','Removed',false,'Registry row was removed from the metric group.',true),
(3,'deprecated','Deprecated',false,'Membership is retained only for historical decoding.',true);

CREATE TABLE "mq_dict_asset_statuses" (
  "asset_status_code" integer PRIMARY KEY,
  "stable_code" text NOT NULL UNIQUE,
  "display_name" text NOT NULL,
  "is_serving" boolean NOT NULL,
  "description" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true
);
INSERT INTO "mq_dict_asset_statuses" VALUES
(0,'unknown','Unknown',false,'No governed asset state assigned.',true),
(1,'active','Active',true,'Asset is active for serving.',true),
(2,'inactive','Inactive',false,'Asset is inactive but remains decodable.',true),
(3,'deprecated','Deprecated',false,'Asset is deprecated and retained for history.',true);

CREATE TABLE "mq_dict_quality_tiers" (
  "quality_tier" integer PRIMARY KEY,
  "stable_code" text NOT NULL UNIQUE,
  "display_name" text NOT NULL,
  "description" text NOT NULL,
  "minimum_evidence_expectation" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true
);
INSERT INTO "mq_dict_quality_tiers" VALUES
(0,'unknown','Unknown','Evidence quality has not been classified.','Requires operator classification before approval.',true),
(1,'official_verified','Official verified','Verified against an official source.','Current MQCHAIN source verification covering official provenance.',true),
(2,'official_low_confidence','Official low confidence','Official provenance with lower confidence.','Official source verification plus explicit reviewer judgment.',true),
(3,'third_party_verified','Third-party verified','Verified against a supported third-party source.','Current supported third-party source verification.',true),
(4,'inferred_high_confidence','Inferred high confidence','High-confidence inference.','Multiple corroborating evidence items and reviewer approval.',true),
(5,'inferred_low_confidence','Inferred low confidence','Lower-confidence inference.','Evidence and explicit reviewer acceptance.',true),
(6,'manual_reviewed','Manual reviewed','Manually curated and reviewed.','Operator evidence and recorded review reason.',true),
(7,'conflict_pending','Conflict pending','Evidence remains in conflict.','Not approvable until conflict resolution is governed.',true);

CREATE TABLE "mq_dict_flag_bits" (
  "bit_position" integer PRIMARY KEY,
  "bit_mask" bigint NOT NULL UNIQUE,
  "flag_code" text NOT NULL UNIQUE,
  "display_name" text NOT NULL,
  "applies_to" text NOT NULL,
  "description" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "ck_mq_dict_flag_bits_position" CHECK ("bit_position" BETWEEN 0 AND 30)
);
INSERT INTO "mq_dict_flag_bits" VALUES
(0,1,'metric_eligible','Metric eligible','address_label','Eligible for metric-group evaluation when other rules pass.',true),
(1,2,'historical_only','Historical only','address_label','Retained for point-in-time resolution only.',true),
(2,4,'active_label','Active label','address_label','Represents a current canonical label.',true),
(3,8,'conflict','Conflict','address_label','Has known conflicting evidence or review state.',true),
(4,16,'deprecated','Deprecated','all','Should be phased out in favor of a governed successor.',true),
(5,32,'manually_curated','Manually curated','all','Curated directly by an operator.',true),
(6,64,'official_source','Official source','all','Backed by official or first-party evidence.',true),
(7,128,'inferred','Inferred','all','Derived from inference or non-official evidence.',true),
(8,256,'manual_reviewed','Manual reviewed','all','Reviewed by a human operator.',true),
(9,512,'cluster_label','Cluster label','address_label','Represents a clustered address label.',true),
(10,1024,'protocol_root','Protocol root','address_label','Represents a protocol root component.',true),
(11,2048,'asset_container','Asset container','address_label','Represents an asset-holding component.',true),
(12,4096,'has_secondary_roles','Has secondary roles','address_label','Has additional approved role assignments.',true),
(13,8192,'has_audit_ptr','Has audit pointer','all','Has a structured audit pointer.',true);

CREATE TABLE "mq_contract_u1_versions" (
  "contract_code" text PRIMARY KEY,
  "schema_version" integer NOT NULL,
  "key_bytes" integer,
  "value_bytes" integer,
  "implementation_module" text NOT NULL,
  "description" text NOT NULL,
  "is_frozen" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
INSERT INTO "mq_contract_u1_versions" ("contract_code","schema_version","key_bytes","value_bytes","implementation_module","description") VALUES
('MQD-U1',1,NULL,NULL,'src/lib/mqchain/kv/contract.ts','Canonical governed dictionary snapshot contract.'),
('MQK-U1',1,NULL,NULL,'src/lib/mqchain/kv/u1.ts','Address key; payload length is codec-defined.'),
('MQV-U1',1,NULL,56,'src/lib/mqchain/kv/u1.ts','Current address-label value.'),
('MQT-Key-U1',1,NULL,NULL,'src/lib/mqchain/kv/u1.ts','Address key plus valid-from height.'),
('MQT-U1',1,NULL,64,'src/lib/mqchain/kv/u1.ts','Timeline address-label value.'),
('MQG-Key-U1',1,NULL,NULL,'src/lib/mqchain/kv/u1.ts','Metric-group ID plus address key.'),
('MQG-U1',1,NULL,24,'src/lib/mqchain/kv/u1.ts','Metric-group membership value.'),
('MQA-Key-U1',1,NULL,NULL,'src/lib/mqchain/kv/u1.ts','Token asset address key.'),
('MQA-U1',1,NULL,48,'src/lib/mqchain/kv/u1.ts','Token asset value.'),
('MQAN-Key-U1',1,4,NULL,'src/lib/mqchain/kv/u1.ts','Native asset namespace key.'),
('MQAN-U1',1,NULL,16,'src/lib/mqchain/kv/u1.ts','Native asset value.');

CREATE TABLE IF NOT EXISTS "mq_policy_role_approval_requirements" (
  "role_id" integer PRIMARY KEY REFERENCES "mq_dict_roles"("role_id"),
  "require_component" boolean NOT NULL DEFAULT false,
  "minimum_confidence" integer NOT NULL DEFAULT 0,
  "allow_bulk_approval" boolean NOT NULL DEFAULT true,
  "is_active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ck_mq_policy_role_approval_requirements_confidence" CHECK ("minimum_confidence" BETWEEN 0 AND 100)
);
INSERT INTO "mq_policy_role_approval_requirements" ("role_id")
SELECT "role_id" FROM "mq_dict_roles"
ON CONFLICT ("role_id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "mq_workflow_bulk_approval_operations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "idempotency_key" text NOT NULL UNIQUE,
  "actor_id" uuid NOT NULL REFERENCES "mq_users"("id"),
  "request_hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'running',
  "result" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  CONSTRAINT "ck_mq_workflow_bulk_approval_operations_status" CHECK ("status" IN ('running','completed'))
);
CREATE INDEX IF NOT EXISTS "idx_mq_workflow_bulk_approval_operations_actor" ON "mq_workflow_bulk_approval_operations" ("actor_id");
