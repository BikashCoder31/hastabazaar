-- Additive delivery evidence and operational clocks. Never applied by local startup.
CREATE TABLE email_delivery_attempts (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 queue_kind VARCHAR(191) NOT NULL CHECK(queue_kind IN('order','business')),
 queue_id VARCHAR(191) NOT NULL,
 claim_token VARCHAR(191) NOT NULL UNIQUE,
 attempt_number BIGINT NOT NULL CHECK(attempt_number>0),
 phase VARCHAR(191) NOT NULL CHECK(phase IN('claimed','handoff_started','accepted','captured','uncertain','not_accepted','cancelled')),
 message_id VARCHAR(191) NOT NULL,
 started_at BIGINT NOT NULL,
 transport VARCHAR(191),
 transport_key VARCHAR(191),
 provider_receipt TEXT,
 failure_category VARCHAR(191) CHECK(failure_category IN('temporary','permanent_recipient','configuration','unknown')),
 failure_code VARCHAR(191),
 config_fingerprint VARCHAR(191),
 recipient_fingerprint VARCHAR(191),
 handoff_at BIGINT,
 completed_at BIGINT,
 retry_at BIGINT,
 UNIQUE(queue_kind,queue_id,attempt_number)
);

CREATE INDEX email_delivery_attempt_queue ON email_delivery_attempts(queue_kind,queue_id,started_at);

CREATE INDEX email_delivery_attempt_fence ON email_delivery_attempts(queue_kind,queue_id,phase);

CREATE TABLE email_transport_backoff (
 transport_key VARCHAR(191) PRIMARY KEY NOT NULL,
 blocked_until BIGINT NOT NULL,
 updated_at BIGINT NOT NULL,
 config_fingerprint VARCHAR(191),
 failure_category VARCHAR(191) CHECK(failure_category IN('temporary','permanent_recipient','configuration','unknown')),
 failure_code VARCHAR(191)
);

CREATE TABLE operational_reminder_cursors (
 family VARCHAR(191) PRIMARY KEY NOT NULL,
 `cursor` TEXT NOT NULL DEFAULT '',
 revision BIGINT NOT NULL DEFAULT 0,
 lease_token VARCHAR(191),
 lease_until BIGINT
);

CREATE TABLE operational_notice_states (
 family VARCHAR(191) NOT NULL,
 source_id VARCHAR(191) NOT NULL,
 current_event_id VARCHAR(191) NOT NULL,
 current_status VARCHAR(191) NOT NULL,
 revision BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(family,source_id)
);

CREATE TABLE operational_reminder_milestones (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 family VARCHAR(191) NOT NULL,
 source_id VARCHAR(191) NOT NULL,
 milestone VARCHAR(191) NOT NULL,
 source_revision VARCHAR(191) NOT NULL,
 due_at BIGINT NOT NULL,
 created_at BIGINT NOT NULL,
 UNIQUE(family,source_id,milestone,source_revision,due_at)
);

CREATE INDEX operational_reminder_milestone_due ON operational_reminder_milestones(family,due_at,id);

DELIMITER $$
CREATE TRIGGER email_delivery_attempt_identity BEFORE UPDATE ON email_delivery_attempts FOR EACH ROW BEGIN
IF NOT(NEW.id<=>OLD.id) OR NOT(NEW.queue_kind<=>OLD.queue_kind) OR NOT(NEW.queue_id<=>OLD.queue_id) OR NOT(NEW.claim_token<=>OLD.claim_token) OR NOT(NEW.attempt_number<=>OLD.attempt_number) OR NOT(NEW.message_id<=>OLD.message_id) OR NOT(NEW.started_at<=>OLD.started_at) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_attempt_identity_immutable';
END IF;
END$$
CREATE TRIGGER email_delivery_acceptance_retained BEFORE UPDATE ON email_delivery_attempts FOR EACH ROW BEGIN
IF OLD.phase IN('accepted','captured') AND (NOT(NEW.phase<=>OLD.phase) OR NOT(NEW.transport<=>OLD.transport) OR NOT(NEW.provider_receipt<=>OLD.provider_receipt) OR NOT(NEW.completed_at<=>OLD.completed_at)) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_acceptance_immutable';
END IF;
END$$
CREATE TRIGGER email_delivery_attempt_retained BEFORE DELETE ON email_delivery_attempts FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_attempt_retained';
END$$
CREATE TRIGGER operational_reminder_milestone_immutable BEFORE UPDATE ON operational_reminder_milestones FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='reminder_milestone_immutable';
END$$
DELIMITER ;
