CREATE TABLE "mq_metric_group_members" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"snapshot_id" bigint,
	"metric_group_id" bigint,
	"registry_id" bigint,
	"chain_code" text NOT NULL,
	"normalized_address" text NOT NULL,
	"entity_id" bigint,
	"role_id" integer,
	"confidence_score" integer NOT NULL,
	"flags" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mq_metric_group_membership_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"metric_group_id" bigint,
	"kv_build_id" bigint,
	"metric_group_code" text NOT NULL,
	"dictionary_version" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"manifest_hash" text,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "mq_metric_group_members" ADD CONSTRAINT "mq_metric_group_members_snapshot_id_mq_metric_group_membership_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."mq_metric_group_membership_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_metric_group_members" ADD CONSTRAINT "mq_metric_group_members_metric_group_id_mq_metric_groups_id_fk" FOREIGN KEY ("metric_group_id") REFERENCES "public"."mq_metric_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_metric_group_members" ADD CONSTRAINT "mq_metric_group_members_registry_id_mq_address_registry_id_fk" FOREIGN KEY ("registry_id") REFERENCES "public"."mq_address_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_metric_group_members" ADD CONSTRAINT "mq_metric_group_members_entity_id_mq_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."mq_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_metric_group_members" ADD CONSTRAINT "mq_metric_group_members_role_id_mq_kv_role_dict_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."mq_kv_role_dict"("role_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_metric_group_membership_snapshots" ADD CONSTRAINT "mq_metric_group_membership_snapshots_metric_group_id_mq_metric_groups_id_fk" FOREIGN KEY ("metric_group_id") REFERENCES "public"."mq_metric_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_metric_group_membership_snapshots" ADD CONSTRAINT "mq_metric_group_membership_snapshots_kv_build_id_mq_kv_builds_id_fk" FOREIGN KEY ("kv_build_id") REFERENCES "public"."mq_kv_builds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_metric_group_membership_snapshots" ADD CONSTRAINT "mq_metric_group_membership_snapshots_created_by_mq_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."mq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_metric_group_members_snapshot_registry" ON "mq_metric_group_members" USING btree ("snapshot_id","registry_id");--> statement-breakpoint
CREATE INDEX "idx_mq_metric_group_members_group" ON "mq_metric_group_members" USING btree ("metric_group_id");--> statement-breakpoint
CREATE INDEX "idx_mq_metric_group_members_registry" ON "mq_metric_group_members" USING btree ("registry_id");--> statement-breakpoint
CREATE INDEX "idx_mq_metric_group_members_address" ON "mq_metric_group_members" USING btree ("chain_code","normalized_address");--> statement-breakpoint
CREATE INDEX "idx_mq_metric_member_snapshot_group" ON "mq_metric_group_membership_snapshots" USING btree ("metric_group_id");--> statement-breakpoint
CREATE INDEX "idx_mq_metric_member_snapshot_build" ON "mq_metric_group_membership_snapshots" USING btree ("kv_build_id");--> statement-breakpoint
CREATE INDEX "idx_mq_metric_member_snapshot_status" ON "mq_metric_group_membership_snapshots" USING btree ("status");