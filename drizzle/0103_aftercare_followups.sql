-- Additive release source; execute only in isolated fixtures until a later approved cutover.
ALTER TABLE complaints ADD COLUMN first_due_at INTEGER;
--> statement-breakpoint
ALTER TABLE complaints ADD COLUMN first_action_at INTEGER;
--> statement-breakpoint
ALTER TABLE complaints ADD COLUMN next_update_at INTEGER;
--> statement-breakpoint
ALTER TABLE complaints ADD COLUMN backup_id TEXT REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE complaints ADD COLUMN waiting_for TEXT NOT NULL DEFAULT 'none' CHECK(waiting_for IN('none','customer','seller','carrier','platform'));
--> statement-breakpoint
ALTER TABLE complaints ADD COLUMN clarification_at INTEGER;
--> statement-breakpoint
ALTER TABLE complaints ADD COLUMN clarification_due_at INTEGER;
--> statement-breakpoint
ALTER TABLE complaints ADD COLUMN followup_revision INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE complaints ADD COLUMN recorded_at INTEGER;
--> statement-breakpoint
ALTER TABLE complaints ADD COLUMN intake_channel TEXT NOT NULL DEFAULT 'web' CHECK(intake_channel IN('web','email','support'));
--> statement-breakpoint
ALTER TABLE complaints ADD COLUMN intake_recorded_by TEXT REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE complaints ADD COLUMN received_evidence_reference TEXT;
--> statement-breakpoint
CREATE TABLE aftercare_followup_events(
 id TEXT PRIMARY KEY,source_type TEXT NOT NULL CHECK(source_type IN('return_request','complaint')),source_id TEXT NOT NULL,revision INTEGER NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id),owner_id TEXT REFERENCES users(id),backup_id TEXT REFERENCES users(id),waiting_for TEXT NOT NULL,
 next_update_at INTEGER NOT NULL,next_action TEXT NOT NULL,public_message TEXT NOT NULL,private_note TEXT NOT NULL,request_id TEXT NOT NULL,created_at INTEGER NOT NULL,
 UNIQUE(actor_id,request_id),UNIQUE(source_type,source_id,revision)
);
--> statement-breakpoint
CREATE TABLE aftercare_followup_milestones(
 source_type TEXT NOT NULL,source_id TEXT NOT NULL,cycle TEXT NOT NULL,kind TEXT NOT NULL,event_id TEXT NOT NULL,created_at INTEGER NOT NULL,
 PRIMARY KEY(source_type,source_id,cycle,kind)
);
--> statement-breakpoint
CREATE TRIGGER aftercare_followup_history BEFORE UPDATE ON aftercare_followup_events BEGIN SELECT RAISE(ABORT,'aftercare_followup_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER aftercare_followup_history_retained BEFORE DELETE ON aftercare_followup_events BEGIN SELECT RAISE(ABORT,'aftercare_followup_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER complaint_original_clock AFTER INSERT ON complaints BEGIN
 UPDATE complaints SET first_due_at=NEW.created_at+86400000,recorded_at=COALESCE(NEW.recorded_at,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) WHERE id=NEW.id;
 INSERT OR IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at)
 VALUES(lower(hex(randomblob(16))),'complaint',NEW.id,NEW.id,NEW.created_at,NEW.created_at+86400000,'continuous-v1',NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER return_original_review_task AFTER INSERT ON return_requests BEGIN
 INSERT OR IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at)
 VALUES(lower(hex(randomblob(16))),'return_request',NEW.id,NEW.id,NEW.requested_at,NEW.requested_at+86400000,'continuous-v1',NEW.requested_at);
END;
--> statement-breakpoint
CREATE TRIGGER return_clarification_clock AFTER INSERT ON return_request_events WHEN NEW.action='admin_request_changes' BEGIN
 UPDATE return_handling SET waiting_for='customer',clarification_at=NEW.created_at,clarification_due_at=NEW.created_at+172800000,revision=revision+1 WHERE case_id=NEW.return_request_id;
END;
--> statement-breakpoint
CREATE TRIGGER return_reply_ends_clarification AFTER INSERT ON return_request_events WHEN NEW.action IN('customer_clarified','seller_responded','admin_approve','admin_reject') BEGIN
 UPDATE return_handling SET waiting_for='none',revision=revision+1 WHERE case_id=NEW.return_request_id AND (NEW.action IN('admin_approve','admin_reject') OR NEW.action='customer_clarified' AND waiting_for='customer' OR NEW.action='seller_responded' AND waiting_for='seller');
END;
--> statement-breakpoint
CREATE TRIGGER complaint_meaningful_action AFTER INSERT ON complaint_events WHEN NEW.action IN('admin_investigate','admin_request_customer','admin_escalate','admin_resolve','admin_close','admin_reopen') BEGIN
 UPDATE complaints SET first_action_at=COALESCE(first_action_at,NEW.created_at),waiting_for=CASE WHEN NEW.action='admin_request_customer' THEN 'customer' ELSE 'none' END,
 clarification_at=CASE WHEN NEW.action='admin_request_customer' THEN NEW.created_at ELSE clarification_at END,clarification_due_at=CASE WHEN NEW.action='admin_request_customer' THEN NEW.created_at+172800000 ELSE clarification_due_at END,
 followup_revision=followup_revision+1 WHERE id=NEW.complaint_id;
END;
--> statement-breakpoint
CREATE TRIGGER complaint_reply_ends_clarification AFTER INSERT ON complaint_events WHEN NEW.action IN('customer_replied','seller_responded') BEGIN
 UPDATE complaints SET waiting_for='none',followup_revision=followup_revision+1 WHERE id=NEW.complaint_id AND (NEW.action='customer_replied' AND waiting_for='customer' OR NEW.action='seller_responded' AND waiting_for='seller');
END;
--> statement-breakpoint
CREATE TRIGGER complaint_original_received_retained BEFORE UPDATE ON complaints
 WHEN NEW.created_at IS NOT OLD.created_at OR OLD.first_due_at IS NOT NULL AND NEW.first_due_at IS NOT OLD.first_due_at OR OLD.first_action_at IS NOT NULL AND NEW.first_action_at IS NOT OLD.first_action_at OR OLD.recorded_at IS NOT NULL AND NEW.recorded_at IS NOT OLD.recorded_at OR NEW.intake_channel IS NOT OLD.intake_channel OR NEW.intake_recorded_by IS NOT OLD.intake_recorded_by OR NEW.received_evidence_reference IS NOT OLD.received_evidence_reference
 BEGIN SELECT RAISE(ABORT,'complaint_original_received_source_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER return_handling_retained BEFORE DELETE ON return_handling BEGIN SELECT RAISE(ABORT,'return_handling_retained'); END;
--> statement-breakpoint
-- Preserve known original request/review timestamps in historical records; never infer receipt, inspection, payment or replacement delivery.
INSERT OR IGNORE INTO return_handling(case_id,first_received_at,first_due_at,first_action_at,created_at)
 SELECT r.id,r.requested_at,r.requested_at+86400000,(SELECT MIN(e.created_at) FROM return_request_events e WHERE e.return_request_id=r.id AND e.action IN('admin_approve','admin_reject','admin_request_changes')),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) FROM return_requests r;
--> statement-breakpoint
UPDATE complaints SET first_due_at=created_at+86400000,first_action_at=(SELECT MIN(e.created_at) FROM complaint_events e WHERE e.complaint_id=complaints.id AND e.action IN('admin_investigate','admin_request_customer','admin_escalate','admin_resolve','admin_close','admin_reopen')) WHERE first_due_at IS NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at)
 SELECT lower(hex(randomblob(16))),'return_request',id,id,requested_at,requested_at+86400000,'continuous-v1',updated_at FROM return_requests;
--> statement-breakpoint
INSERT OR IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at)
 SELECT lower(hex(randomblob(16))),'complaint',id,id,created_at,created_at+86400000,'continuous-v1',updated_at FROM complaints;
