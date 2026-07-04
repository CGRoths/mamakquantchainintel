ALTER TABLE "mq_users" ADD CONSTRAINT "ck_mq_users_role" CHECK ("role" IN ('owner', 'admin', 'analyst', 'reviewer', 'readonly'));

ALTER TABLE "mq_source_jobs" ADD CONSTRAINT "ck_mq_source_jobs_source_type" CHECK ("source_type" IN ('csv_upload', 'manual_input', 'official_url', 'pdf', 'github', 'explorer', 'arkham_reference', 'llm_cleaned_csv', 'json_evidence', 'ml_discovery', 'onchain_discovery'));
ALTER TABLE "mq_source_jobs" ADD CONSTRAINT "ck_mq_source_jobs_status" CHECK ("status" IN ('draft', 'normalized', 'extracted', 'candidate_created', 'failed', 'archived'));

ALTER TABLE "mq_discovery_jobs" ADD CONSTRAINT "ck_mq_discovery_jobs_status" CHECK ("status" IN ('draft', 'running', 'completed', 'failed'));
ALTER TABLE "mq_discovery_jobs" ADD CONSTRAINT "ck_mq_discovery_jobs_counts_non_negative" CHECK ("candidates_created" >= 0 AND "evidence_created" >= 0);

ALTER TABLE "mq_kv_key_prefix_dict" ADD CONSTRAINT "ck_mq_kv_key_prefix_payload_len_positive" CHECK ("payload_len" IS NULL OR "payload_len" > 0);
ALTER TABLE "mq_kv_key_prefix_dict" ADD CONSTRAINT "ck_mq_kv_key_prefix_evm_chain_id_positive" CHECK ("evm_chain_id" IS NULL OR "evm_chain_id" > 0);

ALTER TABLE "mq_kv_role_dict" ADD CONSTRAINT "ck_mq_kv_role_default_quality_tier_range" CHECK ("default_quality_tier" BETWEEN 0 AND 7);
ALTER TABLE "mq_kv_role_dict" ADD CONSTRAINT "ck_mq_kv_role_default_flags_non_negative" CHECK ("default_flags" >= 0);

ALTER TABLE "mq_address_candidates" ADD CONSTRAINT "ck_mq_address_candidates_confidence_range" CHECK ("confidence_score" BETWEEN 0 AND 100);
ALTER TABLE "mq_address_candidates" ADD CONSTRAINT "ck_mq_address_candidates_quality_tier_range" CHECK ("quality_tier" BETWEEN 0 AND 7);
ALTER TABLE "mq_address_candidates" ADD CONSTRAINT "ck_mq_address_candidates_status" CHECK ("candidate_status" IN ('pending_review', 'needs_more_evidence', 'approved', 'rejected', 'conflict_pending', 'duplicate', 'superseded'));
ALTER TABLE "mq_address_candidates" ADD CONSTRAINT "ck_mq_address_candidates_evidence_count_non_negative" CHECK ("evidence_count" >= 0);

ALTER TABLE "mq_label_batches" ADD CONSTRAINT "ck_mq_label_batches_confidence_default_range" CHECK ("confidence_default" IS NULL OR "confidence_default" BETWEEN 0 AND 100);
ALTER TABLE "mq_label_batches" ADD CONSTRAINT "ck_mq_label_batches_quality_tier_default_range" CHECK ("quality_tier_default" IS NULL OR "quality_tier_default" BETWEEN 0 AND 7);
ALTER TABLE "mq_label_batches" ADD CONSTRAINT "ck_mq_label_batches_status_default_range" CHECK ("status_default" IS NULL OR "status_default" BETWEEN 0 AND 9);
ALTER TABLE "mq_label_batches" ADD CONSTRAINT "ck_mq_label_batches_counts_non_negative" CHECK ("imported_count" >= 0 AND "accepted_count" >= 0 AND "rejected_count" >= 0 AND "conflict_count" >= 0);
ALTER TABLE "mq_label_batches" ADD CONSTRAINT "ck_mq_label_batches_label_action" CHECK ("label_action" IN ('create', 'update', 'supersede', 'deactivate', 'mark_historical'));
ALTER TABLE "mq_label_batches" ADD CONSTRAINT "ck_mq_label_batches_status" CHECK ("status" IN ('draft', 'pending_approval', 'approved', 'writing', 'committed', 'failed', 'superseded'));

ALTER TABLE "mq_address_registry" ADD CONSTRAINT "ck_mq_address_registry_confidence_range" CHECK ("confidence_score" BETWEEN 0 AND 100);
ALTER TABLE "mq_address_registry" ADD CONSTRAINT "ck_mq_address_registry_label_status_range" CHECK ("label_status" BETWEEN 0 AND 9);
ALTER TABLE "mq_address_registry" ADD CONSTRAINT "ck_mq_address_registry_quality_tier_range" CHECK ("quality_tier" BETWEEN 0 AND 7);
ALTER TABLE "mq_address_registry" ADD CONSTRAINT "ck_mq_address_registry_flags_non_negative" CHECK ("flags" >= 0);
ALTER TABLE "mq_address_registry" ADD CONSTRAINT "ck_mq_address_registry_block_ranges" CHECK (
  ("valid_from_block" IS NULL OR "valid_from_block" > 0)
  AND ("valid_to_block" IS NULL OR "valid_to_block" > 0)
  AND ("first_seen_block" IS NULL OR "first_seen_block" > 0)
  AND ("last_seen_block" IS NULL OR "last_seen_block" > 0)
  AND ("valid_from_block" IS NULL OR "valid_to_block" IS NULL OR "valid_to_block" >= "valid_from_block")
  AND ("first_seen_block" IS NULL OR "last_seen_block" IS NULL OR "last_seen_block" >= "first_seen_block")
);

ALTER TABLE "mq_address_evidence" ADD CONSTRAINT "ck_mq_address_evidence_confidence_delta_range" CHECK ("confidence_delta" BETWEEN -100 AND 100);
ALTER TABLE "mq_address_evidence" ADD CONSTRAINT "ck_mq_address_evidence_trust_tier" CHECK ("trust_tier" IN ('official', 'verified_third_party', 'inferred', 'weak', 'conflict'));

ALTER TABLE "mq_source_verifications" ADD CONSTRAINT "ck_mq_source_verifications_scope" CHECK ("verification_scope" IN ('source_job', 'source_document', 'source_sheet', 'source_url'));
ALTER TABLE "mq_source_verifications" ADD CONSTRAINT "ck_mq_source_verifications_trust" CHECK ("source_trust" IN ('official', 'verified_third_party', 'inferred', 'weak', 'conflict'));
ALTER TABLE "mq_source_verifications" ADD CONSTRAINT "ck_mq_source_verifications_status" CHECK ("status" IN ('verified', 'rejected', 'revoked'));

ALTER TABLE "mq_metric_groups" ADD CONSTRAINT "ck_mq_metric_groups_min_confidence_range" CHECK ("min_confidence" BETWEEN 0 AND 100);

ALTER TABLE "mq_kv_builds" ADD CONSTRAINT "ck_mq_kv_builds_status" CHECK ("status" IN ('pending', 'compiled', 'active', 'failed', 'superseded'));
ALTER TABLE "mq_kv_builds" ADD CONSTRAINT "ck_mq_kv_builds_row_count_non_negative" CHECK ("row_count" >= 0);

ALTER TABLE "mq_metric_group_membership_snapshots" ADD CONSTRAINT "ck_mq_metric_group_membership_snapshots_status" CHECK ("status" IN ('pending', 'compiled', 'active', 'failed', 'superseded'));
ALTER TABLE "mq_metric_group_membership_snapshots" ADD CONSTRAINT "ck_mq_metric_group_membership_snapshots_member_count_non_negative" CHECK ("member_count" >= 0);

ALTER TABLE "mq_metric_group_members" ADD CONSTRAINT "ck_mq_metric_group_members_confidence_range" CHECK ("confidence_score" BETWEEN 0 AND 100);
ALTER TABLE "mq_metric_group_members" ADD CONSTRAINT "ck_mq_metric_group_members_flags_non_negative" CHECK ("flags" >= 0);

ALTER TABLE "mq_kv_index_manifest" ADD CONSTRAINT "ck_mq_kv_index_manifest_status" CHECK ("status" IN ('pending', 'compiled', 'active', 'failed', 'superseded'));
ALTER TABLE "mq_kv_index_manifest" ADD CONSTRAINT "ck_mq_kv_index_manifest_row_count_non_negative" CHECK ("row_count" >= 0);

ALTER TABLE "mq_kv_index_shards" ADD CONSTRAINT "ck_mq_kv_index_shards_row_count_non_negative" CHECK ("row_count" >= 0);
