-- Source-only parity for 0101; no canonical/live execution.
ALTER TABLE return_requests ADD COLUMN recorded_at BIGINT,
 ADD COLUMN intake_channel VARCHAR(20) NOT NULL DEFAULT 'web' CHECK(intake_channel IN('web','email','support')),
 ADD COLUMN intake_recorded_by VARCHAR(191) REFERENCES users(id),
 ADD COLUMN received_evidence_reference LONGTEXT, ADD COLUMN delivered_at_snapshot BIGINT;
DELIMITER //
CREATE TRIGGER return_received_source_retained BEFORE UPDATE ON return_requests FOR EACH ROW
BEGIN IF NOT (NEW.requested_at <=> OLD.requested_at AND NEW.recorded_at <=> OLD.recorded_at AND NEW.intake_channel <=> OLD.intake_channel AND NEW.intake_recorded_by <=> OLD.intake_recorded_by AND NEW.received_evidence_reference <=> OLD.received_evidence_reference AND NEW.delivered_at_snapshot <=> OLD.delivered_at_snapshot AND NEW.policy_snapshot_json <=> OLD.policy_snapshot_json AND NEW.order_item_id <=> OLD.order_item_id AND NEW.quantity <=> OLD.quantity) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_original_received_source_immutable'; END IF; END//
DELIMITER ;
