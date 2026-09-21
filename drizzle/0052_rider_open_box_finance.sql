ALTER TABLE rider_profiles ADD COLUMN open_box_eligible INTEGER NOT NULL DEFAULT 0 CHECK(open_box_eligible IN (0,1));
--> statement-breakpoint
ALTER TABLE rider_profiles ADD COLUMN open_box_reviewed_by TEXT REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE rider_profiles ADD COLUMN open_box_reviewed_at INTEGER;
--> statement-breakpoint
ALTER TABLE shipping_parcels ADD COLUMN open_box_required INTEGER NOT NULL DEFAULT 0 CHECK(open_box_required IN (0,1));
--> statement-breakpoint
ALTER TABLE shipping_parcels ADD COLUMN open_box_snapshot_json TEXT;
--> statement-breakpoint
ALTER TABLE shipping_parcels ADD COLUMN rider_finance_snapshot_json TEXT;
--> statement-breakpoint
ALTER TABLE parcel_cash_records ADD COLUMN rider_user_id TEXT REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE rider_reports ADD COLUMN open_box_outcome TEXT NOT NULL DEFAULT 'not_applicable' CHECK(open_box_outcome IN ('not_applicable','accepted_after_inspection','accepted_outer_packaging_inner_seal_intact','inspection_declined','refused_whole_parcel_wrong_item','refused_whole_parcel_damage','refused_whole_parcel_other'));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rider_assignment_snapshots (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 shipping_job_id TEXT NOT NULL REFERENCES shipping_parcels(shipping_job_id),
 rider_user_id TEXT NOT NULL REFERENCES users(id),
 assignment_version INTEGER NOT NULL,
 open_box_snapshot_json TEXT NOT NULL,
 finance_snapshot_json TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rider_cash_obligations (
 id TEXT PRIMARY KEY,
 collection_record_id TEXT NOT NULL UNIQUE REFERENCES parcel_cash_records(id),
 shipping_job_id TEXT NOT NULL REFERENCES shipping_parcels(shipping_job_id),
 rider_user_id TEXT NOT NULL REFERENCES users(id),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
 due_at INTEGER NOT NULL,
 policy_snapshot_json TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rider_remittance_allocations (
 id TEXT PRIMARY KEY,
 remittance_record_id TEXT NOT NULL REFERENCES parcel_cash_records(id),
 obligation_id TEXT NOT NULL REFERENCES rider_cash_obligations(id),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
 allocated_by TEXT NOT NULL REFERENCES users(id),
 allocated_at INTEGER NOT NULL,
 UNIQUE(remittance_record_id,obligation_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rider_compensation_entries (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 shipping_job_id TEXT NOT NULL REFERENCES shipping_parcels(shipping_job_id),
 rider_user_id TEXT NOT NULL REFERENCES users(id),
 outcome TEXT NOT NULL CHECK(outcome IN ('completed','failed','return')),
 rate_paisa INTEGER NOT NULL CHECK(rate_paisa>=0),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>=0),
 policy_snapshot_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'earned' CHECK(status IN ('earned','held','paid','reversed')),
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_rider_cash_obligations_due ON rider_cash_obligations(rider_user_id,due_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_rider_compensation_user ON rider_compensation_entries(rider_user_id,created_at);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS rider_assignment_snapshots_no_update BEFORE UPDATE ON rider_assignment_snapshots BEGIN SELECT RAISE(ABORT,'Rider assignment snapshot is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS rider_assignment_snapshots_no_delete BEFORE DELETE ON rider_assignment_snapshots BEGIN SELECT RAISE(ABORT,'Rider assignment snapshot is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS rider_cash_obligations_no_update BEFORE UPDATE ON rider_cash_obligations BEGIN SELECT RAISE(ABORT,'Rider cash obligation is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS rider_cash_obligations_no_delete BEFORE DELETE ON rider_cash_obligations BEGIN SELECT RAISE(ABORT,'Rider cash obligation is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS rider_remittance_allocations_no_update BEFORE UPDATE ON rider_remittance_allocations BEGIN SELECT RAISE(ABORT,'Rider remittance allocation is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS rider_remittance_allocations_no_delete BEFORE DELETE ON rider_remittance_allocations BEGIN SELECT RAISE(ABORT,'Rider remittance allocation is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS rider_compensation_entries_no_update BEFORE UPDATE ON rider_compensation_entries BEGIN SELECT RAISE(ABORT,'Rider compensation history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS rider_compensation_entries_no_delete BEFORE DELETE ON rider_compensation_entries BEGIN SELECT RAISE(ABORT,'Rider compensation history is immutable'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS rider_report_evidence_immutable;
--> statement-breakpoint
CREATE TRIGGER rider_report_evidence_immutable BEFORE UPDATE ON rider_reports WHEN NEW.id<>OLD.id OR (OLD.status IN ('accepted','rejected') AND (NEW.status<>OLD.status OR NEW.reviewed_by IS NOT OLD.reviewed_by OR NEW.review_note IS NOT OLD.review_note OR NEW.reviewed_at IS NOT OLD.reviewed_at)) OR NEW.shipping_job_id<>OLD.shipping_job_id OR NEW.rider_user_id<>OLD.rider_user_id OR NEW.assignment_version<>OLD.assignment_version OR NEW.kind<>OLD.kind OR NEW.note<>OLD.note OR NEW.object_key IS NOT OLD.object_key OR NEW.mime_type IS NOT OLD.mime_type OR NEW.cash_paisa<>OLD.cash_paisa OR NEW.created_at<>OLD.created_at OR NEW.request_id<>OLD.request_id OR NEW.policy_version<>OLD.policy_version OR NEW.open_box<>OLD.open_box OR NEW.open_box_outcome<>OLD.open_box_outcome BEGIN SELECT RAISE(ABORT,'Rider report evidence is immutable'); END;
