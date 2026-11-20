-- Additive opt-in contracts. Existing audit/outbox rows remain unchanged.
ALTER TABLE audit_logs ADD COLUMN command_key TEXT;
--> statement-breakpoint
ALTER TABLE audit_logs ADD COLUMN command_digest TEXT;
--> statement-breakpoint
ALTER TABLE audit_logs ADD COLUMN command_result_json TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX audit_command_key_unique ON audit_logs(command_key);
--> statement-breakpoint
CREATE TRIGGER audit_command_complete BEFORE INSERT ON audit_logs
WHEN (NEW.command_key IS NOT NULL OR NEW.command_digest IS NOT NULL OR NEW.command_result_json IS NOT NULL)
AND (NEW.command_key IS NULL OR length(NEW.command_key)<>64 OR NEW.command_digest IS NULL OR length(NEW.command_digest)<>64 OR NEW.command_result_json IS NULL OR json_valid(NEW.command_result_json)=0)
BEGIN SELECT RAISE(ABORT,'command_receipt_incomplete'); END;
--> statement-breakpoint
CREATE TRIGGER audit_command_no_update BEFORE UPDATE ON audit_logs WHEN OLD.command_key IS NOT NULL
AND (NEW.command_key IS NOT OLD.command_key OR NEW.command_digest IS NOT OLD.command_digest OR NEW.command_result_json IS NOT OLD.command_result_json
OR NEW.action IS NOT OLD.action OR NEW.subject_type IS NOT OLD.subject_type OR NEW.subject_id IS NOT OLD.subject_id OR NEW.request_id IS NOT OLD.request_id OR NEW.created_at IS NOT OLD.created_at
OR (NEW.actor_id IS NOT NULL AND NEW.actor_id IS NOT OLD.actor_id))
BEGIN SELECT RAISE(ABORT,'command_receipt_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_command_no_delete BEFORE DELETE ON audit_logs WHEN OLD.command_key IS NOT NULL
BEGIN SELECT RAISE(ABORT,'command_receipt_retained'); END;
--> statement-breakpoint
ALTER TABLE notification_messages ADD COLUMN source_event_id TEXT;
--> statement-breakpoint
ALTER TABLE notification_messages ADD COLUMN source_revision TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX notification_source_recipient_channel ON notification_messages(source_event_id,source_revision,recipient_user_id,channel);
