CREATE TABLE "mq_source_verifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_job_id" bigint,
	"source_document_id" bigint,
	"candidate_id" bigint,
	"verification_scope" text DEFAULT 'source_job' NOT NULL,
	"source_sheet" text,
	"source_url" text,
	"source_trust" text NOT NULL,
	"status" text DEFAULT 'verified' NOT NULL,
	"notes" text,
	"verification_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"verified_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mq_source_verifications" ADD CONSTRAINT "mq_source_verifications_source_job_id_mq_source_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."mq_source_jobs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mq_source_verifications" ADD CONSTRAINT "mq_source_verifications_source_document_id_mq_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."mq_source_documents"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mq_source_verifications" ADD CONSTRAINT "mq_source_verifications_candidate_id_mq_address_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."mq_address_candidates"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mq_source_verifications" ADD CONSTRAINT "mq_source_verifications_verified_by_mq_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."mq_users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_mq_source_verifications_job" ON "mq_source_verifications" USING btree ("source_job_id");
--> statement-breakpoint
CREATE INDEX "idx_mq_source_verifications_document" ON "mq_source_verifications" USING btree ("source_document_id");
--> statement-breakpoint
CREATE INDEX "idx_mq_source_verifications_candidate" ON "mq_source_verifications" USING btree ("candidate_id");
--> statement-breakpoint
CREATE INDEX "idx_mq_source_verifications_scope" ON "mq_source_verifications" USING btree ("verification_scope");
--> statement-breakpoint
CREATE INDEX "idx_mq_source_verifications_trust" ON "mq_source_verifications" USING btree ("source_trust");
