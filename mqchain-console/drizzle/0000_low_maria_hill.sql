CREATE TABLE "mq_address_candidates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_job_id" bigint,
	"source_document_id" bigint,
	"raw_address" text NOT NULL,
	"normalized_address" text NOT NULL,
	"chain_code" text,
	"address_family" text,
	"prefix_code" integer,
	"payload_hex" text,
	"entity_hint" text,
	"protocol_hint" text,
	"role_hint" text,
	"suggested_entity_id" bigint,
	"suggested_protocol_id" bigint,
	"suggested_role_id" integer,
	"confidence_score" integer DEFAULT 0 NOT NULL,
	"quality_tier" integer DEFAULT 0 NOT NULL,
	"candidate_status" text DEFAULT 'pending_review' NOT NULL,
	"duplicate_of_candidate_id" bigint,
	"discovered_by" text DEFAULT 'manual' NOT NULL,
	"discovery_job_id" bigint,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"last_seen_block" bigint,
	"first_seen_block" bigint,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mq_address_evidence" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"candidate_id" bigint,
	"registry_id" bigint,
	"batch_id" bigint,
	"evidence_type" text NOT NULL,
	"source_url" text,
	"source_document_id" bigint,
	"evidence_hash" text,
	"storage_uri" text,
	"confidence_delta" integer DEFAULT 0 NOT NULL,
	"trust_tier" text DEFAULT 'weak' NOT NULL,
	"summary" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mq_address_registry" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"normalized_address" text NOT NULL,
	"raw_address" text,
	"chain_code" text NOT NULL,
	"prefix_code" integer,
	"payload_hex" text,
	"entity_id" bigint,
	"protocol_id" bigint,
	"role_id" integer,
	"confidence_score" integer NOT NULL,
	"label_status" integer DEFAULT 1 NOT NULL,
	"quality_tier" integer NOT NULL,
	"flags" integer DEFAULT 0 NOT NULL,
	"metric_usage" text,
	"valid_from_block" bigint,
	"valid_to_block" bigint,
	"first_seen_block" bigint,
	"last_seen_block" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"primary_source_job_id" bigint,
	"approved_batch_id" bigint,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mq_approval_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"candidate_id" bigint,
	"registry_id" bigint,
	"batch_id" bigint,
	"action" text NOT NULL,
	"actor_id" uuid,
	"reason" text,
	"before_json" jsonb,
	"after_json" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mq_audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_table" text NOT NULL,
	"target_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mq_category_dict" (
	"category_id" integer PRIMARY KEY NOT NULL,
	"category_code" text NOT NULL,
	"category_name" text NOT NULL,
	"parent_category_id" integer,
	"domain_code" text,
	"metric_domain" text,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_category_dict_category_code_unique" UNIQUE("category_code")
);
--> statement-breakpoint
CREATE TABLE "mq_dictionary_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"version_hash" text NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_dictionary_versions_version_hash_unique" UNIQUE("version_hash")
);
--> statement-breakpoint
CREATE TABLE "mq_discovery_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"discovery_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"chain_code" text,
	"seed_address" text,
	"entity_id" bigint,
	"protocol_id" bigint,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"candidates_created" integer DEFAULT 0 NOT NULL,
	"evidence_created" integer DEFAULT 0 NOT NULL,
	"error" text,
	"logs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mq_entities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_code" text NOT NULL,
	"entity_name" text NOT NULL,
	"entity_type" text,
	"category_id" integer,
	"website_url" text,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_entities_entity_code_unique" UNIQUE("entity_code")
);
--> statement-breakpoint
CREATE TABLE "mq_kv_builds" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"build_hash" text NOT NULL,
	"dictionary_version" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"storage_uri" text,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	CONSTRAINT "mq_kv_builds_build_hash_unique" UNIQUE("build_hash")
);
--> statement-breakpoint
CREATE TABLE "mq_kv_key_prefix_dict" (
	"prefix_code" integer PRIMARY KEY NOT NULL,
	"chain_code" text NOT NULL,
	"chain_name" text,
	"chain_family" text NOT NULL,
	"address_family" text NOT NULL,
	"codec" text NOT NULL,
	"payload_len" integer,
	"evm_chain_id" integer,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mq_kv_role_dict" (
	"role_id" integer PRIMARY KEY NOT NULL,
	"role_code" text NOT NULL,
	"role_name" text NOT NULL,
	"category_id" integer,
	"role_group" text,
	"metric_usage_default" text,
	"boundary_class" text,
	"default_quality_tier" integer DEFAULT 1 NOT NULL,
	"default_flags" integer DEFAULT 0 NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_kv_role_dict_role_code_unique" UNIQUE("role_code")
);
--> statement-breakpoint
CREATE TABLE "mq_label_batch_candidates" (
	"batch_id" bigint NOT NULL,
	"candidate_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_label_batch_candidates_batch_id_candidate_id_pk" PRIMARY KEY("batch_id","candidate_id")
);
--> statement-breakpoint
CREATE TABLE "mq_label_batch_evidence" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"batch_id" bigint,
	"evidence_id" bigint,
	"evidence_hash" text,
	"summary" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mq_label_batches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_job_id" bigint,
	"source_document_id" bigint,
	"entity_id" bigint,
	"protocol_id" bigint,
	"role_id" integer,
	"source_type" text,
	"source_url" text,
	"source_name" text,
	"confidence_default" integer,
	"quality_tier_default" integer,
	"status_default" integer,
	"flags_default" integer,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"conflict_count" integer DEFAULT 0 NOT NULL,
	"effective_from_block" bigint,
	"effective_to_block" bigint,
	"label_action" text DEFAULT 'create' NOT NULL,
	"supersedes_batch_id" bigint,
	"batch_hash" text,
	"evidence_hash" text,
	"storage_uri" text,
	"parser_version" text DEFAULT 'mqchain-console-v1' NOT NULL,
	"dictionary_version" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"committed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mq_metric_group_rules" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"metric_group_id" bigint,
	"rule_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mq_metric_groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"metric_group_code" text NOT NULL,
	"metric_group_name" text NOT NULL,
	"chain_code" text,
	"min_confidence" integer DEFAULT 70 NOT NULL,
	"require_metric_eligible" boolean DEFAULT true NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_metric_groups_metric_group_code_unique" UNIQUE("metric_group_code")
);
--> statement-breakpoint
CREATE TABLE "mq_protocols" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_id" bigint,
	"protocol_code" text NOT NULL,
	"protocol_name" text NOT NULL,
	"protocol_type" text,
	"chain_scope" text[],
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_protocols_protocol_code_unique" UNIQUE("protocol_code")
);
--> statement-breakpoint
CREATE TABLE "mq_source_documents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_job_id" bigint,
	"document_type" text NOT NULL,
	"original_name" text,
	"storage_uri" text,
	"content_hash" text NOT NULL,
	"mime_type" text,
	"size_bytes" bigint,
	"extracted_text" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mq_source_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_name" text,
	"source_url" text,
	"local_file_name" text,
	"archive_storage_uri" text,
	"entity_hint" text,
	"protocol_hint" text,
	"chain_scope" text[],
	"expected_roles" text[],
	"status" text DEFAULT 'draft' NOT NULL,
	"parser_version" text DEFAULT 'mqchain-console-v1' NOT NULL,
	"submitted_by" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mq_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"password_hash" text,
	"role" text DEFAULT 'analyst' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "mq_address_candidates" ADD CONSTRAINT "mq_address_candidates_source_job_id_mq_source_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."mq_source_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_candidates" ADD CONSTRAINT "mq_address_candidates_source_document_id_mq_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."mq_source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_candidates" ADD CONSTRAINT "mq_address_candidates_prefix_code_mq_kv_key_prefix_dict_prefix_code_fk" FOREIGN KEY ("prefix_code") REFERENCES "public"."mq_kv_key_prefix_dict"("prefix_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_candidates" ADD CONSTRAINT "mq_address_candidates_suggested_entity_id_mq_entities_id_fk" FOREIGN KEY ("suggested_entity_id") REFERENCES "public"."mq_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_candidates" ADD CONSTRAINT "mq_address_candidates_suggested_protocol_id_mq_protocols_id_fk" FOREIGN KEY ("suggested_protocol_id") REFERENCES "public"."mq_protocols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_candidates" ADD CONSTRAINT "mq_address_candidates_suggested_role_id_mq_kv_role_dict_role_id_fk" FOREIGN KEY ("suggested_role_id") REFERENCES "public"."mq_kv_role_dict"("role_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_candidates" ADD CONSTRAINT "mq_address_candidates_discovery_job_id_mq_discovery_jobs_id_fk" FOREIGN KEY ("discovery_job_id") REFERENCES "public"."mq_discovery_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_evidence" ADD CONSTRAINT "mq_address_evidence_candidate_id_mq_address_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."mq_address_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_evidence" ADD CONSTRAINT "mq_address_evidence_registry_id_mq_address_registry_id_fk" FOREIGN KEY ("registry_id") REFERENCES "public"."mq_address_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_evidence" ADD CONSTRAINT "mq_address_evidence_batch_id_mq_label_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."mq_label_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_evidence" ADD CONSTRAINT "mq_address_evidence_source_document_id_mq_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."mq_source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_evidence" ADD CONSTRAINT "mq_address_evidence_created_by_mq_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."mq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_registry" ADD CONSTRAINT "mq_address_registry_prefix_code_mq_kv_key_prefix_dict_prefix_code_fk" FOREIGN KEY ("prefix_code") REFERENCES "public"."mq_kv_key_prefix_dict"("prefix_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_registry" ADD CONSTRAINT "mq_address_registry_entity_id_mq_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."mq_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_registry" ADD CONSTRAINT "mq_address_registry_protocol_id_mq_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."mq_protocols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_registry" ADD CONSTRAINT "mq_address_registry_role_id_mq_kv_role_dict_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."mq_kv_role_dict"("role_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_registry" ADD CONSTRAINT "mq_address_registry_primary_source_job_id_mq_source_jobs_id_fk" FOREIGN KEY ("primary_source_job_id") REFERENCES "public"."mq_source_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_registry" ADD CONSTRAINT "mq_address_registry_approved_batch_id_mq_label_batches_id_fk" FOREIGN KEY ("approved_batch_id") REFERENCES "public"."mq_label_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_approval_events" ADD CONSTRAINT "mq_approval_events_candidate_id_mq_address_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."mq_address_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_approval_events" ADD CONSTRAINT "mq_approval_events_registry_id_mq_address_registry_id_fk" FOREIGN KEY ("registry_id") REFERENCES "public"."mq_address_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_approval_events" ADD CONSTRAINT "mq_approval_events_batch_id_mq_label_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."mq_label_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_approval_events" ADD CONSTRAINT "mq_approval_events_actor_id_mq_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."mq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_audit_log" ADD CONSTRAINT "mq_audit_log_actor_id_mq_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."mq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_dictionary_versions" ADD CONSTRAINT "mq_dictionary_versions_created_by_mq_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."mq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_discovery_jobs" ADD CONSTRAINT "mq_discovery_jobs_entity_id_mq_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."mq_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_discovery_jobs" ADD CONSTRAINT "mq_discovery_jobs_protocol_id_mq_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."mq_protocols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_discovery_jobs" ADD CONSTRAINT "mq_discovery_jobs_created_by_mq_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."mq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_entities" ADD CONSTRAINT "mq_entities_category_id_mq_category_dict_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."mq_category_dict"("category_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_builds" ADD CONSTRAINT "mq_kv_builds_created_by_mq_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."mq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_role_dict" ADD CONSTRAINT "mq_kv_role_dict_category_id_mq_category_dict_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."mq_category_dict"("category_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_label_batch_candidates" ADD CONSTRAINT "mq_label_batch_candidates_batch_id_mq_label_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."mq_label_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_label_batch_candidates" ADD CONSTRAINT "mq_label_batch_candidates_candidate_id_mq_address_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."mq_address_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_label_batch_evidence" ADD CONSTRAINT "mq_label_batch_evidence_batch_id_mq_label_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."mq_label_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_label_batch_evidence" ADD CONSTRAINT "mq_label_batch_evidence_evidence_id_mq_address_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."mq_address_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_label_batches" ADD CONSTRAINT "mq_label_batches_source_job_id_mq_source_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."mq_source_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_label_batches" ADD CONSTRAINT "mq_label_batches_source_document_id_mq_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."mq_source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_label_batches" ADD CONSTRAINT "mq_label_batches_entity_id_mq_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."mq_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_label_batches" ADD CONSTRAINT "mq_label_batches_protocol_id_mq_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."mq_protocols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_label_batches" ADD CONSTRAINT "mq_label_batches_role_id_mq_kv_role_dict_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."mq_kv_role_dict"("role_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_label_batches" ADD CONSTRAINT "mq_label_batches_created_by_mq_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."mq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_label_batches" ADD CONSTRAINT "mq_label_batches_approved_by_mq_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."mq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_metric_group_rules" ADD CONSTRAINT "mq_metric_group_rules_metric_group_id_mq_metric_groups_id_fk" FOREIGN KEY ("metric_group_id") REFERENCES "public"."mq_metric_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_protocols" ADD CONSTRAINT "mq_protocols_entity_id_mq_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."mq_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_source_documents" ADD CONSTRAINT "mq_source_documents_source_job_id_mq_source_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."mq_source_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_source_jobs" ADD CONSTRAINT "mq_source_jobs_submitted_by_mq_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."mq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mq_candidates_address_chain" ON "mq_address_candidates" USING btree ("normalized_address","chain_code");--> statement-breakpoint
CREATE INDEX "idx_mq_candidates_status" ON "mq_address_candidates" USING btree ("candidate_status");--> statement-breakpoint
CREATE INDEX "idx_mq_candidates_source_job" ON "mq_address_candidates" USING btree ("source_job_id");--> statement-breakpoint
CREATE INDEX "idx_mq_candidates_entity" ON "mq_address_candidates" USING btree ("suggested_entity_id");--> statement-breakpoint
CREATE INDEX "idx_mq_candidates_role" ON "mq_address_candidates" USING btree ("suggested_role_id");--> statement-breakpoint
CREATE INDEX "idx_mq_evidence_candidate" ON "mq_address_evidence" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_mq_evidence_registry" ON "mq_address_evidence" USING btree ("registry_id");--> statement-breakpoint
CREATE INDEX "idx_mq_evidence_batch" ON "mq_address_evidence" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_mq_evidence_type" ON "mq_address_evidence" USING btree ("evidence_type");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_registry_chain_address_role_from" ON "mq_address_registry" USING btree ("chain_code","normalized_address","role_id","valid_from_block");--> statement-breakpoint
CREATE INDEX "idx_mq_registry_address_chain" ON "mq_address_registry" USING btree ("normalized_address","chain_code");--> statement-breakpoint
CREATE INDEX "idx_mq_registry_entity" ON "mq_address_registry" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "idx_mq_registry_protocol" ON "mq_address_registry" USING btree ("protocol_id");--> statement-breakpoint
CREATE INDEX "idx_mq_registry_role" ON "mq_address_registry" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "idx_mq_registry_active" ON "mq_address_registry" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_mq_approval_events_candidate" ON "mq_approval_events" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_mq_approval_events_batch" ON "mq_approval_events" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_mq_approval_events_action" ON "mq_approval_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_mq_audit_action" ON "mq_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_mq_audit_target" ON "mq_audit_log" USING btree ("target_table","target_id");--> statement-breakpoint
CREATE INDEX "idx_mq_category_domain" ON "mq_category_dict" USING btree ("domain_code");--> statement-breakpoint
CREATE INDEX "idx_mq_discovery_jobs_type" ON "mq_discovery_jobs" USING btree ("discovery_type");--> statement-breakpoint
CREATE INDEX "idx_mq_discovery_jobs_status" ON "mq_discovery_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_mq_entities_type" ON "mq_entities" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_mq_entities_category" ON "mq_entities" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_mq_kv_builds_status" ON "mq_kv_builds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_mq_prefix_chain" ON "mq_kv_key_prefix_dict" USING btree ("chain_code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_prefix_chain_family" ON "mq_kv_key_prefix_dict" USING btree ("chain_code","address_family");--> statement-breakpoint
CREATE INDEX "idx_mq_roles_category" ON "mq_kv_role_dict" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_mq_roles_group" ON "mq_kv_role_dict" USING btree ("role_group");--> statement-breakpoint
CREATE INDEX "idx_mq_batch_candidates_candidate" ON "mq_label_batch_candidates" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_mq_batch_evidence_batch" ON "mq_label_batch_evidence" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_mq_batches_status" ON "mq_label_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_mq_batches_source_job" ON "mq_label_batches" USING btree ("source_job_id");--> statement-breakpoint
CREATE INDEX "idx_mq_batches_entity" ON "mq_label_batches" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "idx_mq_metric_group_rules_group" ON "mq_metric_group_rules" USING btree ("metric_group_id");--> statement-breakpoint
CREATE INDEX "idx_mq_metric_groups_chain" ON "mq_metric_groups" USING btree ("chain_code");--> statement-breakpoint
CREATE INDEX "idx_mq_protocols_entity" ON "mq_protocols" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "idx_mq_protocols_type" ON "mq_protocols" USING btree ("protocol_type");--> statement-breakpoint
CREATE INDEX "idx_mq_source_documents_job" ON "mq_source_documents" USING btree ("source_job_id");--> statement-breakpoint
CREATE INDEX "idx_mq_source_documents_hash" ON "mq_source_documents" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "idx_mq_source_jobs_source_type" ON "mq_source_jobs" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "idx_mq_source_jobs_status" ON "mq_source_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_mq_source_jobs_submitted_by" ON "mq_source_jobs" USING btree ("submitted_by");