ALTER TABLE "mq_metric_group_rules" ALTER COLUMN "metric_group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mq_metric_group_rules" ADD COLUMN "rule_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "mq_metric_group_rules" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "mq_metric_group_rules" ADD COLUMN "source_id" bigint;--> statement-breakpoint
ALTER TABLE "mq_metric_group_rules" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "mq_metric_group_rules" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "mq_metric_group_rules" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mq_metric_group_rules" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mq_metric_group_rules" ADD CONSTRAINT "mq_metric_group_rules_source_id_mq_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."mq_catalog_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_metric_group_rules_group_version" ON "mq_metric_group_rules" USING btree ("metric_group_id","rule_version");--> statement-breakpoint
ALTER TABLE "mq_metric_group_rules" ADD CONSTRAINT "ck_mq_metric_group_rules_version" CHECK ("mq_metric_group_rules"."rule_version" > 0);--> statement-breakpoint
ALTER TABLE "mq_metric_group_rules" ADD CONSTRAINT "ck_mq_metric_group_rules_status" CHECK ("mq_metric_group_rules"."status" in ('draft', 'active', 'retired', 'disabled'));