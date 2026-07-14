DROP INDEX "uq_mq_address_namespaces_legacy_prefix";--> statement-breakpoint
CREATE INDEX "idx_mq_address_namespaces_legacy_prefix" ON "mq_address_namespaces" USING btree ("legacy_prefix_code");