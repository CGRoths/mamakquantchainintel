CREATE TABLE "mq_dictionary_proposals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"proposal_kind" text NOT NULL,
	"proposed_code" text NOT NULL,
	"proposed_name" text NOT NULL,
	"target_references" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"proposed_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_job_id" bigint,
	"source_document_id" bigint,
	"candidate_id" bigint,
	"affected_row_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	CONSTRAINT "ck_mq_dictionary_proposals_kind" CHECK ("mq_dictionary_proposals"."proposal_kind" in ('entity', 'protocol', 'role', 'component', 'category', 'tag', 'alias', 'network', 'codec')),
	CONSTRAINT "ck_mq_dictionary_proposals_status" CHECK ("mq_dictionary_proposals"."status" in ('pending', 'approved', 'rejected', 'applied'))
);
--> statement-breakpoint
ALTER TABLE "mq_dictionary_proposals" ADD CONSTRAINT "mq_dictionary_proposals_source_job_id_mq_source_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."mq_source_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_dictionary_proposals" ADD CONSTRAINT "mq_dictionary_proposals_source_document_id_mq_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."mq_source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_dictionary_proposals" ADD CONSTRAINT "mq_dictionary_proposals_candidate_id_mq_address_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."mq_address_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_dictionary_proposals" ADD CONSTRAINT "mq_dictionary_proposals_requested_by_mq_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."mq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_dictionary_proposals" ADD CONSTRAINT "mq_dictionary_proposals_reviewed_by_mq_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."mq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mq_dictionary_proposals_status" ON "mq_dictionary_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_mq_dictionary_proposals_kind" ON "mq_dictionary_proposals" USING btree ("proposal_kind");--> statement-breakpoint
CREATE INDEX "idx_mq_dictionary_proposals_source_job" ON "mq_dictionary_proposals" USING btree ("source_job_id");