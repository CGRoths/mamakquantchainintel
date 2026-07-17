CREATE TABLE "mq_chain_aliases" (
	"alias_id" bigint PRIMARY KEY NOT NULL,
	"source_scope" text NOT NULL,
	"raw_chain_name" text NOT NULL,
	"chain_network_id" bigint,
	"namespace_id" bigint,
	"address_codec_id" integer,
	"address_type" text NOT NULL,
	"asset_hint" text,
	"token_standard_hint" text,
	"status" text NOT NULL,
	"evidence_ref" text NOT NULL,
	"source_id" bigint NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"approval_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_mq_chain_aliases_id_uint32" CHECK ("mq_chain_aliases"."alias_id" between 1 and 4294967295),
	CONSTRAINT "ck_mq_chain_aliases_status" CHECK ("mq_chain_aliases"."status" in ('approved', 'pending_mapping', 'pending_network', 'not_a_network', 'unsupported')),
	CONSTRAINT "ck_mq_chain_aliases_address_type" CHECK ("mq_chain_aliases"."address_type" in ('wallet_address', 'validator_public_key', 'staking_delegator_address', 'staking_identifier', 'consensus_identifier')),
	CONSTRAINT "ck_mq_chain_aliases_approved_mapping" CHECK ("mq_chain_aliases"."status" <> 'approved' or ("mq_chain_aliases"."chain_network_id" is not null and "mq_chain_aliases"."namespace_id" is not null and "mq_chain_aliases"."address_codec_id" is not null)),
	CONSTRAINT "ck_mq_chain_aliases_pending_unmapped" CHECK ("mq_chain_aliases"."status" not in ('pending_mapping', 'pending_network') or ("mq_chain_aliases"."chain_network_id" is null and "mq_chain_aliases"."namespace_id" is null and "mq_chain_aliases"."address_codec_id" is null)),
	CONSTRAINT "ck_mq_chain_aliases_approval_metadata" CHECK ("mq_chain_aliases"."status" in ('pending_mapping', 'pending_network') or ("mq_chain_aliases"."approved_by" is not null and "mq_chain_aliases"."approved_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "mq_address_codecs" ADD COLUMN "identifier_kind" text DEFAULT 'wallet_address' NOT NULL;--> statement-breakpoint
ALTER TABLE "mq_address_namespaces" ADD COLUMN "address_type" text DEFAULT 'wallet_address' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_address_namespaces_mapping" ON "mq_address_namespaces" USING btree ("namespace_id","chain_network_id","address_codec_id");--> statement-breakpoint
ALTER TABLE "mq_chain_aliases" ADD CONSTRAINT "mq_chain_aliases_source_id_mq_catalog_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."mq_catalog_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_chain_aliases" ADD CONSTRAINT "fk_mq_chain_aliases_namespace_mapping" FOREIGN KEY ("namespace_id","chain_network_id","address_codec_id") REFERENCES "public"."mq_address_namespaces"("namespace_id","chain_network_id","address_codec_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_chain_aliases_scope_raw_type" ON "mq_chain_aliases" USING btree ("source_scope","raw_chain_name","address_type");--> statement-breakpoint
CREATE INDEX "idx_mq_chain_aliases_lookup" ON "mq_chain_aliases" USING btree ("raw_chain_name","status");--> statement-breakpoint
CREATE INDEX "idx_mq_chain_aliases_network" ON "mq_chain_aliases" USING btree ("chain_network_id");--> statement-breakpoint
ALTER TABLE "mq_address_codecs" ADD CONSTRAINT "ck_mq_address_codecs_identifier_kind" CHECK ("mq_address_codecs"."identifier_kind" in ('wallet_address', 'wallet_or_public_key', 'wallet_or_staking_identifier', 'validator_public_key', 'staking_identifier', 'consensus_identifier'));--> statement-breakpoint
ALTER TABLE "mq_address_namespaces" ADD CONSTRAINT "ck_mq_address_namespaces_address_type" CHECK ("mq_address_namespaces"."address_type" in ('wallet_address', 'validator_public_key', 'staking_identifier', 'consensus_identifier'));
