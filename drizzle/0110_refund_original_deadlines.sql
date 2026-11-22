CREATE TABLE refund_obligation_deadlines(
 obligation_id TEXT PRIMARY KEY REFERENCES refund_obligations(id),revision INTEGER NOT NULL DEFAULT 0,
 initiation_due_at INTEGER,binding_due_at INTEGER,calendar_version TEXT,
 policy_snapshot_json TEXT NOT NULL CHECK(json_valid(policy_snapshot_json)),created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER refund_deadline_source_retained BEFORE UPDATE ON refund_obligation_deadlines WHEN
 NEW.obligation_id<>OLD.obligation_id OR NEW.initiation_due_at IS NOT OLD.initiation_due_at OR NEW.calendar_version IS NOT OLD.calendar_version
 OR NEW.policy_snapshot_json<>OLD.policy_snapshot_json OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1
 OR (OLD.binding_due_at IS NOT NULL AND (NEW.binding_due_at IS NULL OR NEW.binding_due_at>OLD.binding_due_at))
 BEGIN SELECT RAISE(ABORT,'original_refund_deadline_retained'); END;
--> statement-breakpoint
CREATE TRIGGER refund_deadline_no_delete BEFORE DELETE ON refund_obligation_deadlines BEGIN SELECT RAISE(ABORT,'original_refund_deadline_retained'); END;
--> statement-breakpoint
CREATE TRIGGER refund_physical_binding_deadline AFTER UPDATE ON return_handling WHEN (NEW.received_at IS NOT NULL AND NEW.received_at IS NOT OLD.received_at) OR NEW.waived_quantity>OLD.waived_quantity BEGIN
 UPDATE refund_obligation_deadlines SET revision=revision+1,binding_due_at=
 CASE WHEN binding_due_at IS NULL OR binding_due_at>(CASE WHEN NEW.waived_quantity>0 THEN (SELECT authorized_at FROM refund_obligations WHERE id=obligation_id) ELSE NEW.received_at END)+json_extract(policy_snapshot_json,'$.completionCalendarDays')*86400000
 THEN (CASE WHEN NEW.waived_quantity>0 THEN (SELECT authorized_at FROM refund_obligations WHERE id=obligation_id) ELSE NEW.received_at END)+json_extract(policy_snapshot_json,'$.completionCalendarDays')*86400000 ELSE binding_due_at END
 WHERE obligation_id IN(SELECT o.id FROM refund_obligations o JOIN refunds r ON r.id=o.source_id WHERE o.source_kind='return_refund' AND r.return_request_id=NEW.case_id)
 AND json_extract(policy_snapshot_json,'$.completionCalendarDays')>0;
END;
