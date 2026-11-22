-- Source parity for 0103. Review target and historical sources before any separately authorized migration.
ALTER TABLE complaints ADD COLUMN first_due_at BIGINT;

ALTER TABLE complaints ADD COLUMN first_action_at BIGINT;

ALTER TABLE complaints ADD COLUMN next_update_at BIGINT;

ALTER TABLE complaints ADD COLUMN backup_id VARCHAR(191) REFERENCES users(id);

ALTER TABLE complaints ADD COLUMN waiting_for VARCHAR(191) NOT NULL DEFAULT 'none' CHECK(waiting_for IN('none','customer','seller','carrier','platform'));

ALTER TABLE complaints ADD COLUMN clarification_at BIGINT;

ALTER TABLE complaints ADD COLUMN clarification_due_at BIGINT;

ALTER TABLE complaints ADD COLUMN followup_revision BIGINT NOT NULL DEFAULT 0;

ALTER TABLE complaints ADD COLUMN recorded_at BIGINT;

ALTER TABLE complaints ADD COLUMN intake_channel VARCHAR(191) NOT NULL DEFAULT 'web' CHECK(intake_channel IN('web','email','support'));

ALTER TABLE complaints ADD COLUMN intake_recorded_by VARCHAR(191), ADD CONSTRAINT fk_complaint_intake_recorded_by FOREIGN KEY(intake_recorded_by) REFERENCES users(id);

ALTER TABLE complaints ADD COLUMN received_evidence_reference LONGTEXT;

CREATE TABLE aftercare_followup_events(
 id VARCHAR(191) PRIMARY KEY,source_type VARCHAR(191) NOT NULL CHECK(source_type IN('return_request','complaint')),source_id VARCHAR(191) NOT NULL,revision BIGINT NOT NULL,
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),owner_id VARCHAR(191) REFERENCES users(id),backup_id VARCHAR(191) REFERENCES users(id),waiting_for VARCHAR(191) NOT NULL,
 next_update_at BIGINT NOT NULL,next_action LONGTEXT NOT NULL,public_message LONGTEXT NOT NULL,private_note LONGTEXT NOT NULL,request_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,
 UNIQUE(actor_id,request_id),UNIQUE(source_type,source_id,revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE aftercare_followup_milestones(
 source_type VARCHAR(191) NOT NULL,source_id VARCHAR(191) NOT NULL,cycle VARCHAR(191) NOT NULL,kind VARCHAR(191) NOT NULL,event_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,
 PRIMARY KEY(source_type,source_id,cycle,kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO return_handling(case_id,first_received_at,first_due_at,first_action_at,created_at)
 SELECT r.id,r.requested_at,r.requested_at+86400000,(SELECT MIN(e.created_at) FROM return_request_events e WHERE e.return_request_id=r.id AND e.action IN('admin_approve','admin_reject','admin_request_changes')),ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000) FROM return_requests r;

UPDATE complaints SET first_due_at=created_at+86400000,first_action_at=(SELECT MIN(e.created_at) FROM complaint_events e WHERE e.complaint_id=complaints.id AND e.action IN('admin_investigate','admin_request_customer','admin_escalate','admin_resolve','admin_close','admin_reopen')) WHERE first_due_at IS NULL;

INSERT IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at)
 SELECT UUID(),'return_request',id,id,requested_at,requested_at+86400000,'continuous-v1',updated_at FROM return_requests;

INSERT IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at)
 SELECT UUID(),'complaint',id,id,created_at,created_at+86400000,'continuous-v1',updated_at FROM complaints;
DELIMITER //
CREATE TRIGGER aftercare_followup_history BEFORE UPDATE ON aftercare_followup_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='aftercare_followup_history_immutable'; END//
CREATE TRIGGER aftercare_followup_history_retained BEFORE DELETE ON aftercare_followup_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='aftercare_followup_history_retained'; END//
CREATE TRIGGER complaint_original_clock BEFORE INSERT ON complaints FOR EACH ROW BEGIN SET NEW.first_due_at=NEW.created_at+86400000; SET NEW.recorded_at=COALESCE(NEW.recorded_at,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)); END//
CREATE TRIGGER complaint_original_review_task AFTER INSERT ON complaints FOR EACH ROW BEGIN INSERT IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at)
 VALUES(UUID(),'complaint',NEW.id,NEW.id,NEW.created_at,NEW.created_at+86400000,'continuous-v1',NEW.created_at); END//
CREATE TRIGGER return_original_review_task AFTER INSERT ON return_requests FOR EACH ROW BEGIN INSERT IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at)
 VALUES(UUID(),'return_request',NEW.id,NEW.id,NEW.requested_at,NEW.requested_at+86400000,'continuous-v1',NEW.requested_at); END//
CREATE TRIGGER return_clarification_clock AFTER INSERT ON return_request_events FOR EACH ROW BEGIN IF NEW.action='admin_request_changes' THEN UPDATE return_handling SET waiting_for='customer',clarification_at=NEW.created_at,clarification_due_at=NEW.created_at+172800000,revision=revision+1 WHERE case_id=NEW.return_request_id; END IF; END//
CREATE TRIGGER return_reply_ends_clarification AFTER INSERT ON return_request_events FOR EACH ROW BEGIN IF NEW.action IN('customer_clarified','seller_responded','admin_approve','admin_reject') THEN UPDATE return_handling SET waiting_for='none',revision=revision+1 WHERE case_id=NEW.return_request_id AND (NEW.action IN('admin_approve','admin_reject') OR NEW.action='customer_clarified' AND waiting_for='customer' OR NEW.action='seller_responded' AND waiting_for='seller'); END IF; END//
CREATE TRIGGER complaint_meaningful_action AFTER INSERT ON complaint_events FOR EACH ROW BEGIN IF NEW.action IN('admin_investigate','admin_request_customer','admin_escalate','admin_resolve','admin_close','admin_reopen') THEN UPDATE complaints SET first_action_at=COALESCE(first_action_at,NEW.created_at),waiting_for=CASE WHEN NEW.action='admin_request_customer' THEN 'customer' ELSE 'none' END,
 clarification_at=CASE WHEN NEW.action='admin_request_customer' THEN NEW.created_at ELSE clarification_at END,clarification_due_at=CASE WHEN NEW.action='admin_request_customer' THEN NEW.created_at+172800000 ELSE clarification_due_at END,
 followup_revision=followup_revision+1 WHERE id=NEW.complaint_id; END IF; END//
CREATE TRIGGER complaint_reply_ends_clarification AFTER INSERT ON complaint_events FOR EACH ROW BEGIN IF NEW.action IN('customer_replied','seller_responded') THEN UPDATE complaints SET waiting_for='none',followup_revision=followup_revision+1 WHERE id=NEW.complaint_id AND (NEW.action='customer_replied' AND waiting_for='customer' OR NEW.action='seller_responded' AND waiting_for='seller'); END IF; END//
CREATE TRIGGER complaint_original_received_retained BEFORE UPDATE ON complaints FOR EACH ROW BEGIN IF NOT(NEW.created_at <=> OLD.created_at) OR OLD.first_due_at IS NOT NULL AND NOT(NEW.first_due_at <=> OLD.first_due_at) OR OLD.first_action_at IS NOT NULL AND NOT(NEW.first_action_at <=> OLD.first_action_at) OR OLD.recorded_at IS NOT NULL AND NOT(NEW.recorded_at <=> OLD.recorded_at) OR NOT(NEW.intake_channel <=> OLD.intake_channel) OR NOT(NEW.intake_recorded_by <=> OLD.intake_recorded_by) OR NOT(NEW.received_evidence_reference <=> OLD.received_evidence_reference) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='complaint_original_received_source_immutable'; END IF; END//
CREATE TRIGGER return_handling_retained BEFORE DELETE ON return_handling FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_handling_retained'; END//
DELIMITER ;
