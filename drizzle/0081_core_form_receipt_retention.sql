-- Core-only form history is stored with its parent transaction in audit_logs.
-- Keep the submitted snapshot immutable; privacy erasure may anonymize the actor.
CREATE TRIGGER core_form_receipt_no_update BEFORE UPDATE ON audit_logs
WHEN OLD.action IN ('form.core_answers','form.compatibility.granted','form.compatibility.revoked') AND (
 NEW.id IS NOT OLD.id OR NEW.action IS NOT OLD.action OR NEW.subject_type IS NOT OLD.subject_type
 OR NEW.subject_id IS NOT OLD.subject_id OR NEW.request_id IS NOT OLD.request_id
 OR NEW.next_json IS NOT OLD.next_json OR NEW.previous_json IS NOT OLD.previous_json
 OR NEW.created_at IS NOT OLD.created_at OR (NEW.actor_id IS NOT NULL AND NEW.actor_id IS NOT OLD.actor_id))
BEGIN SELECT RAISE(ABORT,'core_form_receipt_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER core_form_receipt_no_delete BEFORE DELETE ON audit_logs WHEN OLD.action IN ('form.core_answers','form.compatibility.granted','form.compatibility.revoked')
BEGIN SELECT RAISE(ABORT,'core_form_receipt_retained'); END;
