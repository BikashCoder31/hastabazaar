-- Additive delivery evidence and operational clocks. Never applied by local startup.
CREATE TABLE email_delivery_attempts (
 id TEXT PRIMARY KEY NOT NULL,
 queue_kind TEXT NOT NULL CHECK(queue_kind IN('order','business')),
 queue_id TEXT NOT NULL,
 claim_token TEXT NOT NULL UNIQUE,
 attempt_number INTEGER NOT NULL CHECK(attempt_number>0),
 phase TEXT NOT NULL CHECK(phase IN('claimed','handoff_started','accepted','captured','uncertain','not_accepted','cancelled')),
 message_id TEXT NOT NULL,
 started_at INTEGER NOT NULL,
 transport TEXT,
 transport_key TEXT,
 provider_receipt TEXT,
 failure_category TEXT CHECK(failure_category IN('temporary','permanent_recipient','configuration','unknown')),
 failure_code TEXT,
 config_fingerprint TEXT,
 recipient_fingerprint TEXT,
 handoff_at INTEGER,
 completed_at INTEGER,
 retry_at INTEGER,
 UNIQUE(queue_kind,queue_id,attempt_number)
);
--> statement-breakpoint
CREATE INDEX email_delivery_attempt_queue ON email_delivery_attempts(queue_kind,queue_id,started_at);
--> statement-breakpoint
CREATE INDEX email_delivery_attempt_fence ON email_delivery_attempts(queue_kind,queue_id,phase);
--> statement-breakpoint
CREATE TABLE email_transport_backoff (
 transport_key TEXT PRIMARY KEY NOT NULL,
 blocked_until INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 config_fingerprint TEXT,
 failure_category TEXT CHECK(failure_category IN('temporary','permanent_recipient','configuration','unknown')),
 failure_code TEXT
);
--> statement-breakpoint
CREATE TABLE operational_reminder_cursors (
 family TEXT PRIMARY KEY NOT NULL,
 cursor TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT,
 lease_until INTEGER
);
--> statement-breakpoint
CREATE TABLE operational_notice_states (
 family TEXT NOT NULL,
 source_id TEXT NOT NULL,
 current_event_id TEXT NOT NULL,
 current_status TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(family,source_id)
);
--> statement-breakpoint
CREATE TABLE operational_reminder_milestones (
 id TEXT PRIMARY KEY NOT NULL,
 family TEXT NOT NULL,
 source_id TEXT NOT NULL,
 milestone TEXT NOT NULL,
 source_revision TEXT NOT NULL,
 due_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(family,source_id,milestone,source_revision,due_at)
);
--> statement-breakpoint
CREATE INDEX operational_reminder_milestone_due ON operational_reminder_milestones(family,due_at,id);
--> statement-breakpoint
CREATE TRIGGER email_delivery_attempt_identity BEFORE UPDATE ON email_delivery_attempts
WHEN NEW.id IS NOT OLD.id OR NEW.queue_kind IS NOT OLD.queue_kind OR NEW.queue_id IS NOT OLD.queue_id OR NEW.claim_token IS NOT OLD.claim_token OR NEW.attempt_number IS NOT OLD.attempt_number OR NEW.message_id IS NOT OLD.message_id OR NEW.started_at IS NOT OLD.started_at
BEGIN SELECT RAISE(ABORT,'delivery_attempt_identity_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER email_delivery_acceptance_retained BEFORE UPDATE ON email_delivery_attempts
WHEN OLD.phase IN('accepted','captured') AND (NEW.phase IS NOT OLD.phase OR NEW.transport IS NOT OLD.transport OR NEW.provider_receipt IS NOT OLD.provider_receipt OR NEW.completed_at IS NOT OLD.completed_at)
BEGIN SELECT RAISE(ABORT,'delivery_acceptance_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER email_delivery_attempt_retained BEFORE DELETE ON email_delivery_attempts
BEGIN SELECT RAISE(ABORT,'delivery_attempt_retained'); END;
--> statement-breakpoint
CREATE TRIGGER operational_reminder_milestone_immutable BEFORE UPDATE ON operational_reminder_milestones
BEGIN SELECT RAISE(ABORT,'reminder_milestone_immutable'); END;
