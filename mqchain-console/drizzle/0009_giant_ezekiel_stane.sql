ALTER TABLE "mq_kv_builds" DROP CONSTRAINT "ck_mq_kv_builds_parent_shape";--> statement-breakpoint
ALTER TABLE "mq_kv_builds" ADD CONSTRAINT "fk_mq_kv_builds_base" FOREIGN KEY ("base_build_id") REFERENCES "public"."mq_kv_builds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mq_kv_builds" ADD CONSTRAINT "fk_mq_kv_builds_delta_parent" FOREIGN KEY ("delta_parent_build_id") REFERENCES "public"."mq_kv_builds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_kv_builds_one_active" ON "mq_kv_builds" USING btree ("status") WHERE "mq_kv_builds"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_kv_filter_manifest_global" ON "mq_kv_filter_manifest" USING btree ("build_id","index_name") WHERE "mq_kv_filter_manifest"."namespace_id" is null and "mq_kv_filter_manifest"."metric_group_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_kv_filter_manifest_namespace" ON "mq_kv_filter_manifest" USING btree ("build_id","index_name","namespace_id") WHERE "mq_kv_filter_manifest"."namespace_id" is not null and "mq_kv_filter_manifest"."metric_group_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mq_kv_filter_manifest_metric" ON "mq_kv_filter_manifest" USING btree ("build_id","index_name","metric_group_id") WHERE "mq_kv_filter_manifest"."metric_group_id" is not null and "mq_kv_filter_manifest"."namespace_id" is null;--> statement-breakpoint
ALTER TABLE "mq_kv_builds" ADD CONSTRAINT "ck_mq_kv_builds_parent_shape" CHECK (("mq_kv_builds"."build_kind" = 'base' and "mq_kv_builds"."base_build_id" is null and "mq_kv_builds"."delta_parent_build_id" is null) or ("mq_kv_builds"."build_kind" = 'delta' and (("mq_kv_builds"."base_build_id" is not null)::int + ("mq_kv_builds"."delta_parent_build_id" is not null)::int) = 1));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mq_guard_network_namespace_deactivation() RETURNS trigger AS $$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active
    AND EXISTS (SELECT 1 FROM mq_address_namespaces WHERE chain_network_id = OLD.chain_network_id AND is_active) THEN
    RAISE EXCEPTION 'cannot deactivate network % while active namespaces reference it', OLD.chain_network_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mq_guard_codec_namespace_deactivation() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'disabled' AND NEW.status = 'disabled'
    AND EXISTS (SELECT 1 FROM mq_address_namespaces WHERE address_codec_id = OLD.address_codec_id AND is_active) THEN
    RAISE EXCEPTION 'cannot disable codec % while active namespaces reference it', OLD.address_codec_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER mq_chain_network_active_namespace_guard BEFORE UPDATE OF is_active ON mq_chain_networks FOR EACH ROW EXECUTE FUNCTION mq_guard_network_namespace_deactivation();
--> statement-breakpoint
CREATE TRIGGER mq_address_codec_active_namespace_guard BEFORE UPDATE OF status ON mq_address_codecs FOR EACH ROW EXECUTE FUNCTION mq_guard_codec_namespace_deactivation();
