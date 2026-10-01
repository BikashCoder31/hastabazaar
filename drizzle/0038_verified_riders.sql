CREATE TABLE IF NOT EXISTS rider_policy_versions (version INTEGER PRIMARY KEY,proof_required INTEGER NOT NULL CHECK(proof_required=1),open_box INTEGER NOT NULL,otp_scope TEXT NOT NULL,created_by TEXT,created_at INTEGER NOT NULL);
INSERT OR IGNORE INTO rider_policy_versions(version,proof_required,open_box,otp_scope,created_at) VALUES (0,1,0,'off',0);
CREATE TABLE IF NOT EXISTS rider_profiles (
 user_id TEXT PRIMARY KEY REFERENCES users(id), status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','approved','rejected','suspended')), application_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, reviewed_by TEXT, review_note TEXT, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rider_applications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), legal_name TEXT NOT NULL, phone TEXT NOT NULL, district TEXT NOT NULL, identity_type TEXT NOT NULL, identity_number TEXT NOT NULL, object_key TEXT NOT NULL, mime_type TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rider_policy (
 id TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0, proof_required INTEGER NOT NULL DEFAULT 1 CHECK(proof_required=1), open_box INTEGER NOT NULL DEFAULT 0 CHECK(open_box IN (0,1)), otp_scope TEXT NOT NULL DEFAULT 'off' CHECK(otp_scope IN ('off','prepaid_only')), updated_by TEXT, updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO rider_policy(id) VALUES ('current');
CREATE TABLE IF NOT EXISTS rider_reports (
 id TEXT PRIMARY KEY, shipping_job_id TEXT NOT NULL REFERENCES shipping_jobs(id), rider_user_id TEXT NOT NULL REFERENCES users(id), assignment_version INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('delivered','failed_delivery','customer_unavailable')), note TEXT NOT NULL, object_key TEXT, mime_type TEXT, cash_paisa INTEGER NOT NULL DEFAULT 0 CHECK(cash_paisa>=0), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')), reviewed_by TEXT, review_note TEXT, created_at INTEGER NOT NULL, reviewed_at INTEGER, request_id TEXT NOT NULL UNIQUE, policy_version INTEGER NOT NULL, open_box INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rider_events (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, report_id TEXT, note TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rider_otp_challenges (
 shipping_job_id TEXT PRIMARY KEY REFERENCES shipping_jobs(id), rider_user_id TEXT NOT NULL, assignment_version INTEGER NOT NULL, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_rider_reports_queue ON rider_reports(status,created_at);
CREATE INDEX IF NOT EXISTS idx_rider_reports_assignment ON rider_reports(shipping_job_id,rider_user_id);
CREATE TRIGGER IF NOT EXISTS rider_application_no_update BEFORE UPDATE ON rider_applications BEGIN SELECT RAISE(ABORT,'Rider application evidence is immutable'); END;
CREATE TRIGGER IF NOT EXISTS rider_application_no_delete BEFORE DELETE ON rider_applications BEGIN SELECT RAISE(ABORT,'Rider application evidence is immutable'); END;
CREATE TRIGGER IF NOT EXISTS rider_events_no_update BEFORE UPDATE ON rider_events BEGIN SELECT RAISE(ABORT,'Rider event history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS rider_events_no_delete BEFORE DELETE ON rider_events BEGIN SELECT RAISE(ABORT,'Rider event history is immutable'); END;
DROP TRIGGER IF EXISTS rider_report_evidence_immutable;
CREATE TRIGGER IF NOT EXISTS rider_report_evidence_immutable BEFORE UPDATE ON rider_reports WHEN NEW.id<>OLD.id OR (OLD.status IN ('accepted','rejected') AND (NEW.status<>OLD.status OR NEW.reviewed_by IS NOT OLD.reviewed_by OR NEW.review_note IS NOT OLD.review_note OR NEW.reviewed_at IS NOT OLD.reviewed_at)) OR NEW.shipping_job_id<>OLD.shipping_job_id OR NEW.rider_user_id<>OLD.rider_user_id OR NEW.assignment_version<>OLD.assignment_version OR NEW.kind<>OLD.kind OR NEW.note<>OLD.note OR NEW.object_key IS NOT OLD.object_key OR NEW.mime_type IS NOT OLD.mime_type OR NEW.cash_paisa<>OLD.cash_paisa OR NEW.created_at<>OLD.created_at OR NEW.request_id<>OLD.request_id OR NEW.policy_version<>OLD.policy_version OR NEW.open_box<>OLD.open_box BEGIN SELECT RAISE(ABORT,'Rider report evidence is immutable'); END;
CREATE TRIGGER IF NOT EXISTS rider_report_no_delete BEFORE DELETE ON rider_reports BEGIN SELECT RAISE(ABORT,'Rider report evidence is immutable'); END;

CREATE TRIGGER IF NOT EXISTS rider_policy_versions_no_update BEFORE UPDATE ON rider_policy_versions BEGIN SELECT RAISE(ABORT,'Rider policy history is immutable'); END;

CREATE TRIGGER IF NOT EXISTS rider_policy_versions_no_delete BEFORE DELETE ON rider_policy_versions BEGIN SELECT RAISE(ABORT,'Rider policy history is immutable'); END;
