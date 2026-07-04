CREATE OR REPLACE FUNCTION "mq_prevent_audit_event_mutation"()
RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'MQCHAIN audit table % is append-only; % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "mq_approval_events_prevent_update" ON "mq_approval_events";
--> statement-breakpoint
CREATE TRIGGER "mq_approval_events_prevent_update"
BEFORE UPDATE ON "mq_approval_events"
FOR EACH ROW EXECUTE FUNCTION "mq_prevent_audit_event_mutation"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "mq_approval_events_prevent_delete" ON "mq_approval_events";
--> statement-breakpoint
CREATE TRIGGER "mq_approval_events_prevent_delete"
BEFORE DELETE ON "mq_approval_events"
FOR EACH ROW EXECUTE FUNCTION "mq_prevent_audit_event_mutation"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "mq_audit_log_prevent_update" ON "mq_audit_log";
--> statement-breakpoint
CREATE TRIGGER "mq_audit_log_prevent_update"
BEFORE UPDATE ON "mq_audit_log"
FOR EACH ROW EXECUTE FUNCTION "mq_prevent_audit_event_mutation"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "mq_audit_log_prevent_delete" ON "mq_audit_log";
--> statement-breakpoint
CREATE TRIGGER "mq_audit_log_prevent_delete"
BEFORE DELETE ON "mq_audit_log"
FOR EACH ROW EXECUTE FUNCTION "mq_prevent_audit_event_mutation"();
