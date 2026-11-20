-- Source only. Applies to isolated fixtures; never repair canonical startup data.
ALTER TABLE return_requests ADD COLUMN recorded_at INTEGER;
--> statement-breakpoint
ALTER TABLE return_requests ADD COLUMN intake_channel TEXT NOT NULL DEFAULT 'web' CHECK(intake_channel IN('web','email','support'));
--> statement-breakpoint
ALTER TABLE return_requests ADD COLUMN intake_recorded_by TEXT REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE return_requests ADD COLUMN received_evidence_reference TEXT;
--> statement-breakpoint
ALTER TABLE return_requests ADD COLUMN delivered_at_snapshot INTEGER;
--> statement-breakpoint
CREATE TRIGGER return_received_source_retained BEFORE UPDATE ON return_requests
 WHEN NEW.requested_at IS NOT OLD.requested_at OR NEW.recorded_at IS NOT OLD.recorded_at OR NEW.intake_channel IS NOT OLD.intake_channel OR NEW.intake_recorded_by IS NOT OLD.intake_recorded_by OR NEW.received_evidence_reference IS NOT OLD.received_evidence_reference OR NEW.delivered_at_snapshot IS NOT OLD.delivered_at_snapshot OR NEW.policy_snapshot_json IS NOT OLD.policy_snapshot_json OR NEW.order_item_id IS NOT OLD.order_item_id OR NEW.quantity IS NOT OLD.quantity
 BEGIN SELECT RAISE(ABORT,'return_original_received_source_immutable'); END;
