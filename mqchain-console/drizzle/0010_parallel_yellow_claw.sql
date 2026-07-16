CREATE TABLE "mq_network_change_proposals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"change_type" text NOT NULL,
	"network_id" bigint,
	"proposed_values" jsonb NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	CONSTRAINT "ck_mq_network_change_proposals_type" CHECK ("mq_network_change_proposals"."change_type" in ('create', 'update', 'activate', 'deactivate', 'capability_update')),
	CONSTRAINT "ck_mq_network_change_proposals_status" CHECK ("mq_network_change_proposals"."status" in ('pending', 'approved', 'rejected', 'applied'))
);
--> statement-breakpoint
ALTER TABLE "mq_chain_capabilities" ADD COLUMN "support_tier" integer;--> statement-breakpoint
ALTER TABLE "mq_chain_capabilities" ADD COLUMN "catalog_state" text DEFAULT 'catalogued' NOT NULL;--> statement-breakpoint
ALTER TABLE "mq_chain_capabilities" ADD COLUMN "label_readiness" text DEFAULT 'not_ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "mq_chain_capabilities" ADD COLUMN "runtime_readiness" text DEFAULT 'not_ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "mq_chain_capabilities" ADD COLUMN "mqnode_integration_test_ref" text;--> statement-breakpoint
ALTER TABLE "mq_chain_capabilities" ADD COLUMN "metric_integration_test_ref" text;--> statement-breakpoint
UPDATE "mq_chain_capabilities"
SET "metric_status" = 'planned', "updated_at" = now()
WHERE "metric_status" in ('test_ready', 'production_ready') AND "metric_integration_test_ref" is null;--> statement-breakpoint
UPDATE "mq_chain_capabilities"
SET
  "support_tier" = CASE
    WHEN "chain_network_id" in (1, 2, 4, 7, 8) THEN 1
    WHEN "chain_network_id" in (3, 5, 6, 9, 14) THEN 2
    ELSE null
  END,
  "catalog_state" = 'catalogued',
  "label_readiness" = CASE
    WHEN "chain_network_id" in (1, 2, 4, 7, 8) THEN 'test_ready'
    WHEN "chain_network_id" in (3, 5, 6, 9, 14) THEN 'prepared'
    ELSE 'not_ready'
  END,
  "runtime_readiness" = 'not_ready',
  "updated_at" = now();--> statement-breakpoint
ALTER TABLE "mq_network_change_proposals" ADD CONSTRAINT "mq_network_change_proposals_requested_by_mq_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."mq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_network_change_proposals" ADD CONSTRAINT "mq_network_change_proposals_reviewed_by_mq_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."mq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mq_network_change_proposals_status" ON "mq_network_change_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_mq_network_change_proposals_network" ON "mq_network_change_proposals" USING btree ("network_id");--> statement-breakpoint
ALTER TABLE "mq_chain_capabilities" ADD CONSTRAINT "ck_mq_chain_capabilities_support_tier" CHECK ("mq_chain_capabilities"."support_tier" is null or "mq_chain_capabilities"."support_tier" in (1, 2));--> statement-breakpoint
ALTER TABLE "mq_chain_capabilities" ADD CONSTRAINT "ck_mq_chain_capabilities_catalog_state" CHECK ("mq_chain_capabilities"."catalog_state" in ('catalogued', 'disabled'));--> statement-breakpoint
ALTER TABLE "mq_chain_capabilities" ADD CONSTRAINT "ck_mq_chain_capabilities_label_readiness" CHECK ("mq_chain_capabilities"."label_readiness" in ('not_ready', 'prepared', 'test_ready', 'production_ready'));--> statement-breakpoint
ALTER TABLE "mq_chain_capabilities" ADD CONSTRAINT "ck_mq_chain_capabilities_runtime_readiness" CHECK ("mq_chain_capabilities"."runtime_readiness" in ('not_ready', 'prepared', 'test_ready', 'production_ready'));--> statement-breakpoint
ALTER TABLE "mq_chain_capabilities" ADD CONSTRAINT "ck_mq_chain_capabilities_mqnode_evidence" CHECK ("mq_chain_capabilities"."mqnode_parser_status" not in ('test_ready', 'production_ready') or "mq_chain_capabilities"."mqnode_integration_test_ref" is not null);--> statement-breakpoint
ALTER TABLE "mq_chain_capabilities" ADD CONSTRAINT "ck_mq_chain_capabilities_metric_evidence" CHECK ("mq_chain_capabilities"."metric_status" not in ('test_ready', 'production_ready') or "mq_chain_capabilities"."metric_integration_test_ref" is not null);
--> statement-breakpoint
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
      SELECT 1
      FROM mq_network_change_proposals proposal
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
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER mq_chain_network_proposal_activation_guard
BEFORE INSERT OR UPDATE OF is_active ON mq_chain_networks
FOR EACH ROW EXECUTE FUNCTION mq_guard_network_proposal_activation();
