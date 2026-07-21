CREATE TABLE "mq_kv_compiled_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"build_id" bigint NOT NULL,
	"index_name" text NOT NULL,
	"ordinal" integer NOT NULL,
	"key_bytes" "bytea" NOT NULL,
	"value_bytes" "bytea" NOT NULL,
	"key_hash" text NOT NULL,
	"record_hash" text NOT NULL,
	"registry_id" bigint,
	"metric_group_id" bigint,
	"namespace_id" bigint,
	"address_codec_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_mq_kv_compiled_entries_index" CHECK ("mq_kv_compiled_entries"."index_name" in ('address_label_current', 'address_label_timeline', 'metric_group_membership')),
	CONSTRAINT "ck_mq_kv_compiled_entries_ordinal" CHECK ("mq_kv_compiled_entries"."ordinal" >= 0),
	CONSTRAINT "ck_mq_kv_compiled_entries_key_nonempty" CHECK (octet_length("mq_kv_compiled_entries"."key_bytes") > 0),
	CONSTRAINT "ck_mq_kv_compiled_entries_value_nonempty" CHECK (octet_length("mq_kv_compiled_entries"."value_bytes") > 0),
	CONSTRAINT "ck_mq_kv_compiled_entries_key_hash" CHECK ("mq_kv_compiled_entries"."key_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ck_mq_kv_compiled_entries_record_hash" CHECK ("mq_kv_compiled_entries"."record_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ck_mq_kv_compiled_entries_value_length" CHECK (("mq_kv_compiled_entries"."index_name" = 'address_label_current' and octet_length("mq_kv_compiled_entries"."value_bytes") = 56) or ("mq_kv_compiled_entries"."index_name" = 'address_label_timeline' and octet_length("mq_kv_compiled_entries"."value_bytes") = 64) or ("mq_kv_compiled_entries"."index_name" = 'metric_group_membership' and octet_length("mq_kv_compiled_entries"."value_bytes") = 24))
);
--> statement-breakpoint
CREATE TABLE "mq_kv_validation_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"build_id" bigint NOT NULL,
	"compile_request_build_id" bigint NOT NULL,
	"validation_type" text NOT NULL,
	"status" text NOT NULL,
	"dictionary_version" text NOT NULL,
	"registry_snapshot_hash" text NOT NULL,
	"canonical_row_count" integer NOT NULL,
	"postgres_compiled_row_count" integer NOT NULL,
	"rocksdb_row_count" integer NOT NULL,
	"missing_in_postgres_compiled" integer DEFAULT 0 NOT NULL,
	"extra_in_postgres_compiled" integer DEFAULT 0 NOT NULL,
	"postgres_value_mismatch_count" integer DEFAULT 0 NOT NULL,
	"missing_in_rocksdb" integer DEFAULT 0 NOT NULL,
	"extra_in_rocksdb" integer DEFAULT 0 NOT NULL,
	"rocksdb_value_mismatch_count" integer DEFAULT 0 NOT NULL,
	"duplicate_key_count" integer DEFAULT 0 NOT NULL,
	"semantic_hash_mismatch_count" integer DEFAULT 0 NOT NULL,
	"report_hash" text NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_mq_kv_validation_runs_status" CHECK ("mq_kv_validation_runs"."status" in ('running', 'passed', 'failed')),
	CONSTRAINT "ck_mq_kv_validation_runs_report_hash" CHECK ("mq_kv_validation_runs"."report_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ck_mq_kv_validation_runs_counts" CHECK ("mq_kv_validation_runs"."canonical_row_count" >= 0 and "mq_kv_validation_runs"."postgres_compiled_row_count" >= 0 and "mq_kv_validation_runs"."rocksdb_row_count" >= 0 and "mq_kv_validation_runs"."missing_in_postgres_compiled" >= 0 and "mq_kv_validation_runs"."extra_in_postgres_compiled" >= 0 and "mq_kv_validation_runs"."postgres_value_mismatch_count" >= 0 and "mq_kv_validation_runs"."missing_in_rocksdb" >= 0 and "mq_kv_validation_runs"."extra_in_rocksdb" >= 0 and "mq_kv_validation_runs"."rocksdb_value_mismatch_count" >= 0 and "mq_kv_validation_runs"."duplicate_key_count" >= 0 and "mq_kv_validation_runs"."semantic_hash_mismatch_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "mq_kv_builds" ADD COLUMN "compile_request_build_id" bigint;--> statement-breakpoint
ALTER TABLE "mq_kv_compiled_entries" ADD CONSTRAINT "mq_kv_compiled_entries_build_id_mq_kv_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."mq_kv_builds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_compiled_entries" ADD CONSTRAINT "mq_kv_compiled_entries_registry_id_mq_address_registry_id_fk" FOREIGN KEY ("registry_id") REFERENCES "public"."mq_address_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_compiled_entries" ADD CONSTRAINT "mq_kv_compiled_entries_metric_group_id_mq_metric_groups_id_fk" FOREIGN KEY ("metric_group_id") REFERENCES "public"."mq_metric_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_compiled_entries" ADD CONSTRAINT "mq_kv_compiled_entries_namespace_id_mq_address_namespaces_namespace_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."mq_address_namespaces"("namespace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_compiled_entries" ADD CONSTRAINT "mq_kv_compiled_entries_address_codec_id_mq_address_codecs_address_codec_id_fk" FOREIGN KEY ("address_codec_id") REFERENCES "public"."mq_address_codecs"("address_codec_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_validation_runs" ADD CONSTRAINT "mq_kv_validation_runs_build_id_mq_kv_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."mq_kv_builds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_validation_runs" ADD CONSTRAINT "mq_kv_validation_runs_compile_request_build_id_mq_kv_builds_id_fk" FOREIGN KEY ("compile_request_build_id") REFERENCES "public"."mq_kv_builds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_kv_compiled_entries_build_index_key" ON "mq_kv_compiled_entries" USING btree ("build_id","index_name","key_bytes");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_kv_compiled_entries_build_index_ordinal" ON "mq_kv_compiled_entries" USING btree ("build_id","index_name","ordinal");--> statement-breakpoint
CREATE INDEX "idx_mq_kv_compiled_entries_build_index_hash" ON "mq_kv_compiled_entries" USING btree ("build_id","index_name","key_hash");--> statement-breakpoint
CREATE INDEX "idx_mq_kv_compiled_entries_registry" ON "mq_kv_compiled_entries" USING btree ("registry_id");--> statement-breakpoint
CREATE INDEX "idx_mq_kv_compiled_entries_metric_group" ON "mq_kv_compiled_entries" USING btree ("metric_group_id");--> statement-breakpoint
CREATE INDEX "idx_mq_kv_compiled_entries_namespace_codec" ON "mq_kv_compiled_entries" USING btree ("namespace_id","address_codec_id");--> statement-breakpoint
CREATE INDEX "idx_mq_kv_validation_runs_build" ON "mq_kv_validation_runs" USING btree ("build_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_mq_kv_validation_runs_request" ON "mq_kv_validation_runs" USING btree ("compile_request_build_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_mq_kv_validation_runs_status" ON "mq_kv_validation_runs" USING btree ("status");--> statement-breakpoint
ALTER TABLE "mq_kv_builds" ADD CONSTRAINT "fk_mq_kv_builds_compile_request" FOREIGN KEY ("compile_request_build_id") REFERENCES "public"."mq_kv_builds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mq_kv_builds_compile_request" ON "mq_kv_builds" USING btree ("compile_request_build_id");