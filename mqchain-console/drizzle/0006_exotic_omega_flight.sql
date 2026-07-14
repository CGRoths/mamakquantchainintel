CREATE TABLE "mq_address_codecs" (
	"address_codec_id" integer PRIMARY KEY NOT NULL,
	"codec_code" text NOT NULL,
	"codec_name" text NOT NULL,
	"address_family" text NOT NULL,
	"accepted_formats" text NOT NULL,
	"canonical_format" text NOT NULL,
	"payload_rule" text NOT NULL,
	"checksum_behavior" text NOT NULL,
	"chain_family_compatibility" text NOT NULL,
	"normalizer_version" text NOT NULL,
	"test_vectors" jsonb DEFAULT '{"valid":[],"invalid":[]}'::jsonb NOT NULL,
	"status" text DEFAULT 'catalogued' NOT NULL,
	"source_id" bigint,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_address_codecs_codec_code_unique" UNIQUE("codec_code"),
	CONSTRAINT "ck_mq_address_codecs_id_uint16" CHECK ("mq_address_codecs"."address_codec_id" between 1 and 65535),
	CONSTRAINT "ck_mq_address_codecs_status" CHECK ("mq_address_codecs"."status" in ('unsupported', 'catalogued', 'planned', 'partial', 'test_ready', 'production_ready', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "mq_address_namespaces" (
	"namespace_id" bigint PRIMARY KEY NOT NULL,
	"namespace_code" text NOT NULL,
	"namespace_name" text NOT NULL,
	"chain_network_id" bigint NOT NULL,
	"address_codec_id" integer NOT NULL,
	"legacy_prefix_code" integer,
	"address_hrp" text,
	"network_discriminator" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"source_id" bigint,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_address_namespaces_namespace_code_unique" UNIQUE("namespace_code"),
	CONSTRAINT "ck_mq_address_namespaces_id_uint32" CHECK ("mq_address_namespaces"."namespace_id" between 1 and 4294967295)
);
--> statement-breakpoint
CREATE TABLE "mq_address_tags" (
	"registry_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL,
	"source_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_address_tags_registry_id_tag_id_pk" PRIMARY KEY("registry_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "mq_asset_namespaces" (
	"asset_namespace_id" bigint PRIMARY KEY NOT NULL,
	"asset_id" bigint NOT NULL,
	"namespace_id" bigint NOT NULL,
	"standard_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source_id" bigint NOT NULL,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_mq_asset_namespaces_id_uint32" CHECK ("mq_asset_namespaces"."asset_namespace_id" between 1 and 4294967295)
);
--> statement-breakpoint
CREATE TABLE "mq_assets" (
	"asset_id" bigint PRIMARY KEY NOT NULL,
	"asset_code" text NOT NULL,
	"asset_name" text NOT NULL,
	"asset_type" text NOT NULL,
	"symbol" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"source_id" bigint,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_assets_asset_code_unique" UNIQUE("asset_code"),
	CONSTRAINT "ck_mq_assets_id_uint32" CHECK ("mq_assets"."asset_id" between 1 and 4294967295)
);
--> statement-breakpoint
CREATE TABLE "mq_catalog_sources" (
	"id" bigint PRIMARY KEY NOT NULL,
	"source_code" text NOT NULL,
	"source_name" text NOT NULL,
	"source_type" text NOT NULL,
	"url" text,
	"retrieved_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_catalog_sources_source_code_unique" UNIQUE("source_code")
);
--> statement-breakpoint
CREATE TABLE "mq_chain_capabilities" (
	"chain_network_id" bigint PRIMARY KEY NOT NULL,
	"catalog_status" text NOT NULL,
	"normalizer_status" text NOT NULL,
	"mqnode_parser_status" text NOT NULL,
	"asset_resolver_status" text NOT NULL,
	"current_label_status" text NOT NULL,
	"timeline_status" text NOT NULL,
	"metric_status" text NOT NULL,
	"notes" text,
	"last_verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_mq_chain_capabilities_catalog" CHECK ("mq_chain_capabilities"."catalog_status" in ('unsupported', 'catalogued', 'planned', 'partial', 'test_ready', 'production_ready', 'disabled')),
	CONSTRAINT "ck_mq_chain_capabilities_normalizer" CHECK ("mq_chain_capabilities"."normalizer_status" in ('unsupported', 'catalogued', 'planned', 'partial', 'test_ready', 'production_ready', 'disabled')),
	CONSTRAINT "ck_mq_chain_capabilities_mqnode" CHECK ("mq_chain_capabilities"."mqnode_parser_status" in ('unsupported', 'catalogued', 'planned', 'partial', 'test_ready', 'production_ready', 'disabled')),
	CONSTRAINT "ck_mq_chain_capabilities_asset" CHECK ("mq_chain_capabilities"."asset_resolver_status" in ('unsupported', 'catalogued', 'planned', 'partial', 'test_ready', 'production_ready', 'disabled')),
	CONSTRAINT "ck_mq_chain_capabilities_current" CHECK ("mq_chain_capabilities"."current_label_status" in ('unsupported', 'catalogued', 'planned', 'partial', 'test_ready', 'production_ready', 'disabled')),
	CONSTRAINT "ck_mq_chain_capabilities_timeline" CHECK ("mq_chain_capabilities"."timeline_status" in ('unsupported', 'catalogued', 'planned', 'partial', 'test_ready', 'production_ready', 'disabled')),
	CONSTRAINT "ck_mq_chain_capabilities_metric" CHECK ("mq_chain_capabilities"."metric_status" in ('unsupported', 'catalogued', 'planned', 'partial', 'test_ready', 'production_ready', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "mq_chain_networks" (
	"chain_network_id" bigint PRIMARY KEY NOT NULL,
	"network_code" text NOT NULL,
	"network_name" text NOT NULL,
	"chain_family" text NOT NULL,
	"environment" text DEFAULT 'mainnet' NOT NULL,
	"caip2" text,
	"evm_chain_id" bigint,
	"slip44" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"source_id" bigint,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_chain_networks_network_code_unique" UNIQUE("network_code"),
	CONSTRAINT "mq_chain_networks_caip2_unique" UNIQUE("caip2"),
	CONSTRAINT "ck_mq_chain_networks_id_uint32" CHECK ("mq_chain_networks"."chain_network_id" between 1 and 4294967295),
	CONSTRAINT "ck_mq_chain_networks_evm_chain_id" CHECK ("mq_chain_networks"."evm_chain_id" is null or "mq_chain_networks"."evm_chain_id" > 0)
);
--> statement-breakpoint
CREATE TABLE "mq_dictionary_id_ranges" (
	"id" bigint PRIMARY KEY NOT NULL,
	"dictionary_kind" text NOT NULL,
	"range_code" text NOT NULL,
	"start_id" bigint NOT NULL,
	"end_id" bigint NOT NULL,
	"next_id" bigint NOT NULL,
	"owner_domain" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_dictionary_id_ranges_range_code_unique" UNIQUE("range_code"),
	CONSTRAINT "ck_mq_dictionary_ranges_bounds" CHECK ("mq_dictionary_id_ranges"."start_id" > 0 and "mq_dictionary_id_ranges"."end_id" >= "mq_dictionary_id_ranges"."start_id" and "mq_dictionary_id_ranges"."next_id" between "mq_dictionary_id_ranges"."start_id" and "mq_dictionary_id_ranges"."end_id" + 1)
);
--> statement-breakpoint
CREATE TABLE "mq_external_identifiers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" bigint NOT NULL,
	"identifier_type" text NOT NULL,
	"identifier_value" text NOT NULL,
	"source_id" bigint,
	"verified_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mq_kv_filter_manifest" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"build_id" bigint NOT NULL,
	"index_manifest_id" bigint,
	"index_name" text NOT NULL,
	"filter_schema_version" text NOT NULL,
	"implementation" text NOT NULL,
	"implementation_version" text NOT NULL,
	"deterministic_hash_seed" text NOT NULL,
	"item_count" integer NOT NULL,
	"false_positive_target_ppm" integer DEFAULT 1000 NOT NULL,
	"observed_false_positive_ppm" integer,
	"namespace_id" bigint,
	"metric_group_id" bigint,
	"content_hash" text NOT NULL,
	"storage_uri" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	CONSTRAINT "ck_mq_kv_filter_manifest_status" CHECK ("mq_kv_filter_manifest"."status" in ('pending', 'compiled', 'active', 'failed', 'superseded')),
	CONSTRAINT "ck_mq_kv_filter_manifest_counts" CHECK ("mq_kv_filter_manifest"."item_count" >= 0 and "mq_kv_filter_manifest"."false_positive_target_ppm" between 1 and 1000000 and ("mq_kv_filter_manifest"."observed_false_positive_ppm" is null or "mq_kv_filter_manifest"."observed_false_positive_ppm" between 0 and 1000000))
);
--> statement-breakpoint
CREATE TABLE "mq_name_aliases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" bigint NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"language_code" text,
	"source_id" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mq_protocol_components" (
	"component_id" bigint PRIMARY KEY NOT NULL,
	"protocol_id" bigint NOT NULL,
	"deployment_id" bigint,
	"component_code" text NOT NULL,
	"component_name" text NOT NULL,
	"component_type" text NOT NULL,
	"namespace_id" bigint NOT NULL,
	"address_codec_id" integer NOT NULL,
	"normalized_payload_hex" text NOT NULL,
	"role_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"confidence_score" integer NOT NULL,
	"quality_tier" integer NOT NULL,
	"valid_from_height" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"source_id" bigint NOT NULL,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_protocol_components_component_code_unique" UNIQUE("component_code"),
	CONSTRAINT "ck_mq_protocol_components_id_uint32" CHECK ("mq_protocol_components"."component_id" between 1 and 4294967295),
	CONSTRAINT "ck_mq_protocol_components_confidence" CHECK ("mq_protocol_components"."confidence_score" between 0 and 100),
	CONSTRAINT "ck_mq_protocol_components_quality" CHECK ("mq_protocol_components"."quality_tier" between 0 and 7),
	CONSTRAINT "ck_mq_protocol_components_payload_hex" CHECK ("mq_protocol_components"."normalized_payload_hex" ~ '^[0-9a-f]+$' and length("mq_protocol_components"."normalized_payload_hex") % 2 = 0)
);
--> statement-breakpoint
CREATE TABLE "mq_protocol_deployments" (
	"deployment_id" bigint PRIMARY KEY NOT NULL,
	"protocol_id" bigint NOT NULL,
	"namespace_id" bigint NOT NULL,
	"deployment_code" text NOT NULL,
	"deployment_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source_id" bigint,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_protocol_deployments_deployment_code_unique" UNIQUE("deployment_code"),
	CONSTRAINT "ck_mq_protocol_deployments_id_uint32" CHECK ("mq_protocol_deployments"."deployment_id" between 1 and 4294967295)
);
--> statement-breakpoint
CREATE TABLE "mq_tag_dict" (
	"tag_id" bigint PRIMARY KEY NOT NULL,
	"tag_code" text NOT NULL,
	"tag_name" text NOT NULL,
	"tag_group" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"source_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_tag_dict_tag_code_unique" UNIQUE("tag_code"),
	CONSTRAINT "ck_mq_tag_dict_id_uint32" CHECK ("mq_tag_dict"."tag_id" between 1 and 4294967295)
);
--> statement-breakpoint
CREATE TABLE "mq_tagset_dict" (
	"tagset_id" bigint PRIMARY KEY NOT NULL,
	"tagset_code" text NOT NULL,
	"content_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_tagset_dict_tagset_code_unique" UNIQUE("tagset_code"),
	CONSTRAINT "mq_tagset_dict_content_hash_unique" UNIQUE("content_hash"),
	CONSTRAINT "ck_mq_tagset_dict_id_uint32" CHECK ("mq_tagset_dict"."tagset_id" between 1 and 4294967295)
);
--> statement-breakpoint
CREATE TABLE "mq_tagset_members" (
	"tagset_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_tagset_members_tagset_id_tag_id_pk" PRIMARY KEY("tagset_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "mq_token_contracts" (
	"token_contract_id" bigint PRIMARY KEY NOT NULL,
	"asset_id" bigint NOT NULL,
	"namespace_id" bigint NOT NULL,
	"address_codec_id" integer NOT NULL,
	"normalized_payload_hex" text NOT NULL,
	"standard_id" integer NOT NULL,
	"decimals" integer NOT NULL,
	"issuer_entity_id" bigint,
	"status" text DEFAULT 'active' NOT NULL,
	"source_id" bigint NOT NULL,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_mq_token_contracts_id_uint32" CHECK ("mq_token_contracts"."token_contract_id" between 1 and 4294967295),
	CONSTRAINT "ck_mq_token_contracts_decimals_uint8" CHECK ("mq_token_contracts"."decimals" between 0 and 255),
	CONSTRAINT "ck_mq_token_contracts_payload_hex" CHECK ("mq_token_contracts"."normalized_payload_hex" ~ '^[0-9a-f]+$' and length("mq_token_contracts"."normalized_payload_hex") % 2 = 0)
);
--> statement-breakpoint
CREATE TABLE "mq_token_standards" (
	"standard_id" integer PRIMARY KEY NOT NULL,
	"standard_code" text NOT NULL,
	"standard_name" text NOT NULL,
	"chain_family" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"source_id" bigint,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mq_token_standards_standard_code_unique" UNIQUE("standard_code"),
	CONSTRAINT "ck_mq_token_standards_id_uint16" CHECK ("mq_token_standards"."standard_id" between 1 and 65535)
);
--> statement-breakpoint
ALTER TABLE "mq_address_candidates" ADD COLUMN "namespace_id" bigint;--> statement-breakpoint
ALTER TABLE "mq_address_candidates" ADD COLUMN "address_codec_id" integer;--> statement-breakpoint
ALTER TABLE "mq_address_registry" ADD COLUMN "namespace_id" bigint;--> statement-breakpoint
ALTER TABLE "mq_address_registry" ADD COLUMN "address_codec_id" integer;--> statement-breakpoint
ALTER TABLE "mq_address_registry" ADD COLUMN "category_id" integer;--> statement-breakpoint
ALTER TABLE "mq_address_registry" ADD COLUMN "component_id" bigint;--> statement-breakpoint
ALTER TABLE "mq_address_registry" ADD COLUMN "tagset_id" bigint;--> statement-breakpoint
ALTER TABLE "mq_dictionary_versions" ADD COLUMN "catalog_hash" text;--> statement-breakpoint
ALTER TABLE "mq_dictionary_versions" ADD COLUMN "catalog_path" text;--> statement-breakpoint
ALTER TABLE "mq_dictionary_versions" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "mq_dictionary_versions" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mq_kv_builds" ADD COLUMN "build_kind" text DEFAULT 'base' NOT NULL;--> statement-breakpoint
ALTER TABLE "mq_kv_builds" ADD COLUMN "base_build_id" bigint;--> statement-breakpoint
ALTER TABLE "mq_kv_builds" ADD COLUMN "delta_parent_build_id" bigint;--> statement-breakpoint
ALTER TABLE "mq_kv_builds" ADD COLUMN "last_committed_batch_id" bigint;--> statement-breakpoint
ALTER TABLE "mq_kv_index_manifest" ADD COLUMN "key_schema_version" text;--> statement-breakpoint
ALTER TABLE "mq_kv_index_manifest" ADD COLUMN "value_schema_version" text;--> statement-breakpoint
ALTER TABLE "mq_kv_index_manifest" ADD COLUMN "namespace_id" bigint;--> statement-breakpoint
ALTER TABLE "mq_kv_index_manifest" ADD COLUMN "metric_group_id" bigint;--> statement-breakpoint
ALTER TABLE "mq_kv_index_manifest" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "mq_metric_group_members" ADD COLUMN "namespace_id" bigint;--> statement-breakpoint
ALTER TABLE "mq_metric_group_members" ADD COLUMN "address_codec_id" integer;--> statement-breakpoint
ALTER TABLE "mq_metric_group_members" ADD COLUMN "payload_hex" text;--> statement-breakpoint
ALTER TABLE "mq_metric_group_members" ADD COLUMN "membership_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "mq_metric_groups" ADD COLUMN "namespace_id" bigint;--> statement-breakpoint
ALTER TABLE "mq_address_codecs" ADD CONSTRAINT "mq_address_codecs_source_id_mq_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."mq_catalog_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_namespaces" ADD CONSTRAINT "mq_address_namespaces_chain_network_id_mq_chain_networks_chain_network_id_fk" FOREIGN KEY ("chain_network_id") REFERENCES "public"."mq_chain_networks"("chain_network_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_namespaces" ADD CONSTRAINT "mq_address_namespaces_address_codec_id_mq_address_codecs_address_codec_id_fk" FOREIGN KEY ("address_codec_id") REFERENCES "public"."mq_address_codecs"("address_codec_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_namespaces" ADD CONSTRAINT "mq_address_namespaces_legacy_prefix_code_mq_kv_key_prefix_dict_prefix_code_fk" FOREIGN KEY ("legacy_prefix_code") REFERENCES "public"."mq_kv_key_prefix_dict"("prefix_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_namespaces" ADD CONSTRAINT "mq_address_namespaces_source_id_mq_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."mq_catalog_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_tags" ADD CONSTRAINT "mq_address_tags_registry_id_mq_address_registry_id_fk" FOREIGN KEY ("registry_id") REFERENCES "public"."mq_address_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_tags" ADD CONSTRAINT "mq_address_tags_tag_id_mq_tag_dict_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."mq_tag_dict"("tag_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_tags" ADD CONSTRAINT "mq_address_tags_source_id_mq_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."mq_catalog_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_asset_namespaces" ADD CONSTRAINT "mq_asset_namespaces_asset_id_mq_assets_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."mq_assets"("asset_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_asset_namespaces" ADD CONSTRAINT "mq_asset_namespaces_namespace_id_mq_address_namespaces_namespace_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."mq_address_namespaces"("namespace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_asset_namespaces" ADD CONSTRAINT "mq_asset_namespaces_standard_id_mq_token_standards_standard_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."mq_token_standards"("standard_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_asset_namespaces" ADD CONSTRAINT "mq_asset_namespaces_source_id_mq_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."mq_catalog_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_assets" ADD CONSTRAINT "mq_assets_source_id_mq_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."mq_catalog_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_chain_capabilities" ADD CONSTRAINT "mq_chain_capabilities_chain_network_id_mq_chain_networks_chain_network_id_fk" FOREIGN KEY ("chain_network_id") REFERENCES "public"."mq_chain_networks"("chain_network_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_chain_networks" ADD CONSTRAINT "mq_chain_networks_source_id_mq_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."mq_catalog_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_external_identifiers" ADD CONSTRAINT "mq_external_identifiers_source_id_mq_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."mq_catalog_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_filter_manifest" ADD CONSTRAINT "mq_kv_filter_manifest_build_id_mq_kv_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."mq_kv_builds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_filter_manifest" ADD CONSTRAINT "mq_kv_filter_manifest_index_manifest_id_mq_kv_index_manifest_id_fk" FOREIGN KEY ("index_manifest_id") REFERENCES "public"."mq_kv_index_manifest"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_filter_manifest" ADD CONSTRAINT "mq_kv_filter_manifest_namespace_id_mq_address_namespaces_namespace_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."mq_address_namespaces"("namespace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_filter_manifest" ADD CONSTRAINT "mq_kv_filter_manifest_metric_group_id_mq_metric_groups_id_fk" FOREIGN KEY ("metric_group_id") REFERENCES "public"."mq_metric_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_name_aliases" ADD CONSTRAINT "mq_name_aliases_source_id_mq_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."mq_catalog_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_protocol_components" ADD CONSTRAINT "mq_protocol_components_protocol_id_mq_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."mq_protocols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_protocol_components" ADD CONSTRAINT "mq_protocol_components_deployment_id_mq_protocol_deployments_deployment_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."mq_protocol_deployments"("deployment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_protocol_components" ADD CONSTRAINT "mq_protocol_components_namespace_id_mq_address_namespaces_namespace_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."mq_address_namespaces"("namespace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_protocol_components" ADD CONSTRAINT "mq_protocol_components_address_codec_id_mq_address_codecs_address_codec_id_fk" FOREIGN KEY ("address_codec_id") REFERENCES "public"."mq_address_codecs"("address_codec_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_protocol_components" ADD CONSTRAINT "mq_protocol_components_role_id_mq_kv_role_dict_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."mq_kv_role_dict"("role_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_protocol_components" ADD CONSTRAINT "mq_protocol_components_category_id_mq_category_dict_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."mq_category_dict"("category_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_protocol_components" ADD CONSTRAINT "mq_protocol_components_source_id_mq_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."mq_catalog_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_protocol_deployments" ADD CONSTRAINT "mq_protocol_deployments_protocol_id_mq_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."mq_protocols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_protocol_deployments" ADD CONSTRAINT "mq_protocol_deployments_namespace_id_mq_address_namespaces_namespace_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."mq_address_namespaces"("namespace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_protocol_deployments" ADD CONSTRAINT "mq_protocol_deployments_source_id_mq_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."mq_catalog_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_tag_dict" ADD CONSTRAINT "mq_tag_dict_source_id_mq_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."mq_catalog_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_tagset_members" ADD CONSTRAINT "mq_tagset_members_tagset_id_mq_tagset_dict_tagset_id_fk" FOREIGN KEY ("tagset_id") REFERENCES "public"."mq_tagset_dict"("tagset_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_tagset_members" ADD CONSTRAINT "mq_tagset_members_tag_id_mq_tag_dict_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."mq_tag_dict"("tag_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_token_contracts" ADD CONSTRAINT "mq_token_contracts_asset_id_mq_assets_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."mq_assets"("asset_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_token_contracts" ADD CONSTRAINT "mq_token_contracts_namespace_id_mq_address_namespaces_namespace_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."mq_address_namespaces"("namespace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_token_contracts" ADD CONSTRAINT "mq_token_contracts_address_codec_id_mq_address_codecs_address_codec_id_fk" FOREIGN KEY ("address_codec_id") REFERENCES "public"."mq_address_codecs"("address_codec_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_token_contracts" ADD CONSTRAINT "mq_token_contracts_standard_id_mq_token_standards_standard_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."mq_token_standards"("standard_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_token_contracts" ADD CONSTRAINT "mq_token_contracts_issuer_entity_id_mq_entities_id_fk" FOREIGN KEY ("issuer_entity_id") REFERENCES "public"."mq_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_token_contracts" ADD CONSTRAINT "mq_token_contracts_source_id_mq_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."mq_catalog_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_token_standards" ADD CONSTRAINT "mq_token_standards_source_id_mq_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."mq_catalog_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mq_address_codecs_family" ON "mq_address_codecs" USING btree ("address_family");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_address_namespaces_network_codec_hrp" ON "mq_address_namespaces" USING btree ("chain_network_id","address_codec_id","address_hrp");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_address_namespaces_legacy_prefix" ON "mq_address_namespaces" USING btree ("legacy_prefix_code");--> statement-breakpoint
CREATE INDEX "idx_mq_address_namespaces_network" ON "mq_address_namespaces" USING btree ("chain_network_id");--> statement-breakpoint
CREATE INDEX "idx_mq_address_namespaces_codec" ON "mq_address_namespaces" USING btree ("address_codec_id");--> statement-breakpoint
CREATE INDEX "idx_mq_address_tags_tag" ON "mq_address_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_asset_namespaces_asset_namespace" ON "mq_asset_namespaces" USING btree ("asset_id","namespace_id");--> statement-breakpoint
CREATE INDEX "idx_mq_assets_type" ON "mq_assets" USING btree ("asset_type");--> statement-breakpoint
CREATE INDEX "idx_mq_catalog_sources_type" ON "mq_catalog_sources" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "idx_mq_catalog_sources_status" ON "mq_catalog_sources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_mq_chain_networks_family" ON "mq_chain_networks" USING btree ("chain_family");--> statement-breakpoint
CREATE INDEX "idx_mq_chain_networks_environment" ON "mq_chain_networks" USING btree ("environment");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_dictionary_ranges_kind_code" ON "mq_dictionary_id_ranges" USING btree ("dictionary_kind","range_code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_external_identifiers_subject_type_value" ON "mq_external_identifiers" USING btree ("subject_kind","subject_id","identifier_type","identifier_value");--> statement-breakpoint
CREATE INDEX "idx_mq_external_identifiers_lookup" ON "mq_external_identifiers" USING btree ("identifier_type","identifier_value");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_kv_filter_manifest_build_index_scope" ON "mq_kv_filter_manifest" USING btree ("build_id","index_name","namespace_id","metric_group_id");--> statement-breakpoint
CREATE INDEX "idx_mq_kv_filter_manifest_build" ON "mq_kv_filter_manifest" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX "idx_mq_kv_filter_manifest_status" ON "mq_kv_filter_manifest" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_name_alias_subject_alias" ON "mq_name_aliases" USING btree ("subject_kind","subject_id","normalized_alias");--> statement-breakpoint
CREATE INDEX "idx_mq_name_alias_lookup" ON "mq_name_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_protocol_components_u1_key" ON "mq_protocol_components" USING btree ("namespace_id","address_codec_id","normalized_payload_hex");--> statement-breakpoint
CREATE INDEX "idx_mq_protocol_components_protocol" ON "mq_protocol_components" USING btree ("protocol_id");--> statement-breakpoint
CREATE INDEX "idx_mq_protocol_deployments_protocol" ON "mq_protocol_deployments" USING btree ("protocol_id");--> statement-breakpoint
CREATE INDEX "idx_mq_protocol_deployments_namespace" ON "mq_protocol_deployments" USING btree ("namespace_id");--> statement-breakpoint
CREATE INDEX "idx_mq_tag_dict_group" ON "mq_tag_dict" USING btree ("tag_group");--> statement-breakpoint
CREATE INDEX "idx_mq_tagset_members_tag" ON "mq_tagset_members" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_token_contracts_u1_key" ON "mq_token_contracts" USING btree ("namespace_id","address_codec_id","normalized_payload_hex");--> statement-breakpoint
CREATE INDEX "idx_mq_token_contracts_asset" ON "mq_token_contracts" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "idx_mq_token_standards_family" ON "mq_token_standards" USING btree ("chain_family");--> statement-breakpoint
ALTER TABLE "mq_address_candidates" ADD CONSTRAINT "mq_address_candidates_namespace_id_mq_address_namespaces_namespace_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."mq_address_namespaces"("namespace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_candidates" ADD CONSTRAINT "mq_address_candidates_address_codec_id_mq_address_codecs_address_codec_id_fk" FOREIGN KEY ("address_codec_id") REFERENCES "public"."mq_address_codecs"("address_codec_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_registry" ADD CONSTRAINT "mq_address_registry_namespace_id_mq_address_namespaces_namespace_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."mq_address_namespaces"("namespace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_registry" ADD CONSTRAINT "mq_address_registry_address_codec_id_mq_address_codecs_address_codec_id_fk" FOREIGN KEY ("address_codec_id") REFERENCES "public"."mq_address_codecs"("address_codec_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_registry" ADD CONSTRAINT "mq_address_registry_category_id_mq_category_dict_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."mq_category_dict"("category_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_registry" ADD CONSTRAINT "mq_address_registry_component_id_mq_protocol_components_component_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."mq_protocol_components"("component_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_address_registry" ADD CONSTRAINT "mq_address_registry_tagset_id_mq_tagset_dict_tagset_id_fk" FOREIGN KEY ("tagset_id") REFERENCES "public"."mq_tagset_dict"("tagset_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_builds" ADD CONSTRAINT "mq_kv_builds_last_committed_batch_id_mq_label_batches_id_fk" FOREIGN KEY ("last_committed_batch_id") REFERENCES "public"."mq_label_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_index_manifest" ADD CONSTRAINT "mq_kv_index_manifest_namespace_id_mq_address_namespaces_namespace_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."mq_address_namespaces"("namespace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_index_manifest" ADD CONSTRAINT "mq_kv_index_manifest_metric_group_id_mq_metric_groups_id_fk" FOREIGN KEY ("metric_group_id") REFERENCES "public"."mq_metric_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_metric_group_members" ADD CONSTRAINT "mq_metric_group_members_namespace_id_mq_address_namespaces_namespace_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."mq_address_namespaces"("namespace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_metric_group_members" ADD CONSTRAINT "mq_metric_group_members_address_codec_id_mq_address_codecs_address_codec_id_fk" FOREIGN KEY ("address_codec_id") REFERENCES "public"."mq_address_codecs"("address_codec_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_metric_groups" ADD CONSTRAINT "mq_metric_groups_namespace_id_mq_address_namespaces_namespace_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."mq_address_namespaces"("namespace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mq_candidates_u1_key" ON "mq_address_candidates" USING btree ("namespace_id","address_codec_id","payload_hex");--> statement-breakpoint
CREATE INDEX "idx_mq_registry_u1_key" ON "mq_address_registry" USING btree ("namespace_id","address_codec_id","payload_hex");--> statement-breakpoint
CREATE INDEX "idx_mq_metric_group_members_u1_key" ON "mq_metric_group_members" USING btree ("metric_group_id","namespace_id","address_codec_id","payload_hex");--> statement-breakpoint
ALTER TABLE "mq_kv_builds" ADD CONSTRAINT "ck_mq_kv_builds_kind" CHECK ("mq_kv_builds"."build_kind" in ('base', 'delta'));--> statement-breakpoint
ALTER TABLE "mq_kv_builds" ADD CONSTRAINT "ck_mq_kv_builds_parent_shape" CHECK (("mq_kv_builds"."build_kind" = 'base' and "mq_kv_builds"."delta_parent_build_id" is null) or ("mq_kv_builds"."build_kind" = 'delta' and ("mq_kv_builds"."base_build_id" is not null or "mq_kv_builds"."delta_parent_build_id" is not null)));--> statement-breakpoint
ALTER TABLE "mq_metric_group_members" ADD CONSTRAINT "ck_mq_metric_group_members_status" CHECK ("mq_metric_group_members"."membership_status" in ('active', 'removed', 'deprecated'));--> statement-breakpoint
CREATE VIEW "mq_role_dict" AS SELECT * FROM "mq_kv_role_dict";--> statement-breakpoint
CREATE VIEW "mq_u1_prefix_compatibility" AS
SELECT
  p."prefix_code",
  p."chain_code",
  p."address_family",
  n."namespace_id",
  n."address_codec_id",
  n."namespace_code"
FROM "mq_kv_key_prefix_dict" p
LEFT JOIN "mq_address_namespaces" n ON n."legacy_prefix_code" = p."prefix_code";--> statement-breakpoint
CREATE VIEW "mq_u1_prefix_conflicts" AS
SELECT 'candidate'::text AS "subject_kind", c."id" AS "subject_id", c."prefix_code", c."namespace_id", c."address_codec_id", n."namespace_id" AS "expected_namespace_id", n."address_codec_id" AS "expected_codec_id",
  CASE WHEN n."namespace_id" IS NULL THEN 'unmapped_prefix' WHEN c."namespace_id" IS NULL OR c."address_codec_id" IS NULL THEN 'u1_identity_missing' ELSE 'u1_identity_mismatch' END AS "reason"
FROM "mq_address_candidates" c
LEFT JOIN "mq_address_namespaces" n ON n."legacy_prefix_code" = c."prefix_code"
WHERE c."prefix_code" IS NOT NULL AND (n."namespace_id" IS NULL OR c."namespace_id" IS DISTINCT FROM n."namespace_id" OR c."address_codec_id" IS DISTINCT FROM n."address_codec_id")
UNION ALL
SELECT 'registry'::text, r."id", r."prefix_code", r."namespace_id", r."address_codec_id", n."namespace_id", n."address_codec_id",
  CASE WHEN n."namespace_id" IS NULL THEN 'unmapped_prefix' WHEN r."namespace_id" IS NULL OR r."address_codec_id" IS NULL THEN 'u1_identity_missing' ELSE 'u1_identity_mismatch' END
FROM "mq_address_registry" r
LEFT JOIN "mq_address_namespaces" n ON n."legacy_prefix_code" = r."prefix_code"
WHERE r."prefix_code" IS NOT NULL AND (n."namespace_id" IS NULL OR r."namespace_id" IS DISTINCT FROM n."namespace_id" OR r."address_codec_id" IS DISTINCT FROM n."address_codec_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "mq_validate_active_namespace"() RETURNS trigger AS $$
BEGIN
  IF NEW."is_active" AND NOT EXISTS (
    SELECT 1 FROM "mq_chain_networks" network
    JOIN "mq_address_codecs" codec ON codec."address_codec_id" = NEW."address_codec_id"
    WHERE network."chain_network_id" = NEW."chain_network_id"
      AND network."is_active"
      AND codec."status" NOT IN ('unsupported', 'disabled')
  ) THEN
    RAISE EXCEPTION 'active namespace requires an active network and enabled codec';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "trg_mq_validate_active_namespace" BEFORE INSERT OR UPDATE ON "mq_address_namespaces" FOR EACH ROW EXECUTE FUNCTION "mq_validate_active_namespace"();
