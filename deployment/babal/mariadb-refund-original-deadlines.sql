-- Source parity for 0110_refund_original_deadlines. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE refund_obligation_deadlines(
 obligation_id VARCHAR(191) PRIMARY KEY REFERENCES refund_obligations(id),revision BIGINT NOT NULL DEFAULT 0,
 initiation_due_at BIGINT,binding_due_at BIGINT,calendar_version VARCHAR(191),
 policy_snapshot_json LONGTEXT NOT NULL CHECK(json_valid(policy_snapshot_json)),created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER refund_deadline_source_retained BEFORE UPDATE ON refund_obligation_deadlines FOR EACH ROW BEGIN IF (NEW.obligation_id<>OLD.obligation_id OR NOT (NEW.initiation_due_at <=> OLD.initiation_due_at) OR NOT (NEW.calendar_version <=> OLD.calendar_version)
 OR NEW.policy_snapshot_json<>OLD.policy_snapshot_json OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1
 OR (OLD.binding_due_at IS NOT NULL AND (NEW.binding_due_at IS NULL OR NEW.binding_due_at>OLD.binding_due_at))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='original_refund_deadline_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER refund_deadline_no_delete BEFORE DELETE ON refund_obligation_deadlines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='original_refund_deadline_retained'; END$$
CREATE OR REPLACE TRIGGER refund_physical_binding_deadline AFTER UPDATE ON return_handling FOR EACH ROW BEGIN IF ((NEW.received_at IS NOT NULL AND NOT (NEW.received_at <=> OLD.received_at)) OR NEW.waived_quantity>OLD.waived_quantity ) THEN UPDATE refund_obligation_deadlines SET revision=revision+1,binding_due_at=
 CASE WHEN binding_due_at IS NULL OR binding_due_at>(CASE WHEN NEW.waived_quantity>0 THEN (SELECT authorized_at FROM refund_obligations WHERE id=obligation_id) ELSE NEW.received_at END)+json_extract(policy_snapshot_json,'$.completionCalendarDays')*86400000
 THEN (CASE WHEN NEW.waived_quantity>0 THEN (SELECT authorized_at FROM refund_obligations WHERE id=obligation_id) ELSE NEW.received_at END)+json_extract(policy_snapshot_json,'$.completionCalendarDays')*86400000 ELSE binding_due_at END
 WHERE obligation_id IN(SELECT o.id FROM refund_obligations o JOIN refunds r ON r.id=o.source_id WHERE o.source_kind='return_refund' AND r.return_request_id=NEW.case_id)
 AND json_extract(policy_snapshot_json,'$.completionCalendarDays')>0;
 END IF; END$$
DELIMITER ;
