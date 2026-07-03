CREATE TABLE "mq_kv_index_manifest" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"build_id" bigint,
	"index_name" text NOT NULL,
	"dictionary_version" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"storage_uri" text,
	"manifest_hash" text,
	"last_committed_batch_id" bigint,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mq_kv_index_shards" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"manifest_id" bigint,
	"shard_id" text NOT NULL,
	"shard_key" text NOT NULL,
	"shard_hash" text,
	"storage_uri" text,
	"row_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mq_kv_index_manifest" ADD CONSTRAINT "mq_kv_index_manifest_build_id_mq_kv_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."mq_kv_builds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_index_manifest" ADD CONSTRAINT "mq_kv_index_manifest_last_committed_batch_id_mq_label_batches_id_fk" FOREIGN KEY ("last_committed_batch_id") REFERENCES "public"."mq_label_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_index_manifest" ADD CONSTRAINT "mq_kv_index_manifest_created_by_mq_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."mq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_index_shards" ADD CONSTRAINT "mq_kv_index_shards_manifest_id_mq_kv_index_manifest_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."mq_kv_index_manifest"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_kv_index_manifest_build_index" ON "mq_kv_index_manifest" USING btree ("build_id","index_name");--> statement-breakpoint
CREATE INDEX "idx_mq_kv_index_manifest_index" ON "mq_kv_index_manifest" USING btree ("index_name");--> statement-breakpoint
CREATE INDEX "idx_mq_kv_index_manifest_status" ON "mq_kv_index_manifest" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_mq_kv_index_manifest_batch" ON "mq_kv_index_manifest" USING btree ("last_committed_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_kv_index_shards_manifest_shard" ON "mq_kv_index_shards" USING btree ("manifest_id","shard_id");--> statement-breakpoint
CREATE INDEX "idx_mq_kv_index_shards_manifest" ON "mq_kv_index_shards" USING btree ("manifest_id");--> statement-breakpoint
CREATE INDEX "idx_mq_kv_index_shards_key" ON "mq_kv_index_shards" USING btree ("shard_key");