-- Source artifact only. Applying it requires a separately reviewed destination.
DELIMITER $$
CREATE TRIGGER core_form_receipt_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW BEGIN
 IF OLD.action IN ('form.core_answers','form.compatibility.granted','form.compatibility.revoked') AND (
 NOT(NEW.id <=> OLD.id) OR NOT(NEW.action <=> OLD.action) OR NOT(NEW.subject_type <=> OLD.subject_type)
 OR NOT(NEW.subject_id <=> OLD.subject_id) OR NOT(NEW.request_id <=> OLD.request_id)
 OR NOT(NEW.next_json <=> OLD.next_json) OR NOT(NEW.previous_json <=> OLD.previous_json)
 OR NOT(NEW.created_at <=> OLD.created_at) OR (NEW.actor_id IS NOT NULL AND NOT(NEW.actor_id <=> OLD.actor_id)))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='core_form_receipt_immutable'; END IF;
END$$
CREATE TRIGGER core_form_receipt_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW BEGIN
 IF OLD.action IN ('form.core_answers','form.compatibility.granted','form.compatibility.revoked') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='core_form_receipt_retained'; END IF;
END$$
DELIMITER ;
