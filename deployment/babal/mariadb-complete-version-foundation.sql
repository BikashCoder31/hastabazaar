-- Additive opt-in contracts; execution requires separately reviewed destination.
ALTER TABLE audit_logs ADD COLUMN command_key VARCHAR(64) COLLATE utf8mb4_bin NULL,
 ADD COLUMN command_digest VARCHAR(64) COLLATE utf8mb4_bin NULL,
 ADD COLUMN command_result_json LONGTEXT COLLATE utf8mb4_bin NULL;
CREATE UNIQUE INDEX audit_command_key_unique ON audit_logs(command_key);
ALTER TABLE notification_messages ADD COLUMN source_event_id VARCHAR(191) COLLATE utf8mb4_bin NULL,
 ADD COLUMN source_revision VARCHAR(191) COLLATE utf8mb4_bin NULL;
CREATE UNIQUE INDEX notification_source_recipient_channel ON notification_messages(source_event_id,source_revision,recipient_user_id,channel);
DELIMITER $$
CREATE TRIGGER audit_command_complete BEFORE INSERT ON audit_logs FOR EACH ROW BEGIN
 IF (NEW.command_key IS NOT NULL OR NEW.command_digest IS NOT NULL OR NEW.command_result_json IS NOT NULL)
 AND (NEW.command_key IS NULL OR CHAR_LENGTH(NEW.command_key)<>64 OR NEW.command_digest IS NULL OR CHAR_LENGTH(NEW.command_digest)<>64 OR NEW.command_result_json IS NULL OR JSON_VALID(NEW.command_result_json)=0)
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='command_receipt_incomplete'; END IF;
END$$
CREATE TRIGGER audit_command_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW BEGIN
 IF OLD.command_key IS NOT NULL AND (NOT(NEW.command_key <=> OLD.command_key) OR NOT(NEW.command_digest <=> OLD.command_digest) OR NOT(NEW.command_result_json <=> OLD.command_result_json)
 OR NOT(NEW.action <=> OLD.action) OR NOT(NEW.subject_type <=> OLD.subject_type) OR NOT(NEW.subject_id <=> OLD.subject_id) OR NOT(NEW.request_id <=> OLD.request_id) OR NOT(NEW.created_at <=> OLD.created_at)
 OR (NEW.actor_id IS NOT NULL AND NOT(NEW.actor_id <=> OLD.actor_id)))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='command_receipt_immutable'; END IF;
END$$
CREATE TRIGGER audit_command_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW BEGIN
 IF OLD.command_key IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='command_receipt_retained'; END IF;
END$$
DELIMITER ;
