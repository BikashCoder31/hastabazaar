CREATE TABLE IF NOT EXISTS rider_policy_versions (version BIGINT PRIMARY KEY,proof_required BIGINT NOT NULL CHECK(proof_required=1),open_box BIGINT NOT NULL,otp_scope VARCHAR(191) NOT NULL,created_by VARCHAR(191),created_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO rider_policy_versions(version,proof_required,open_box,otp_scope,created_at) VALUES (0,1,0,'off',0);
CREATE TABLE IF NOT EXISTS rider_profiles (
 user_id VARCHAR(191) PRIMARY KEY REFERENCES users(id), status VARCHAR(191) NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','approved','rejected','suspended')), application_id VARCHAR(191) NOT NULL, version BIGINT NOT NULL DEFAULT 0, reviewed_by VARCHAR(191), review_note TEXT, updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS rider_applications (
 id VARCHAR(191) PRIMARY KEY, user_id VARCHAR(191) NOT NULL REFERENCES users(id), legal_name VARCHAR(191) NOT NULL, phone VARCHAR(191) NOT NULL, district VARCHAR(191) NOT NULL, identity_type VARCHAR(191) NOT NULL, identity_number VARCHAR(191) NOT NULL, object_key VARCHAR(500) NOT NULL, mime_type VARCHAR(191) NOT NULL, created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS rider_policy (
 id VARCHAR(191) PRIMARY KEY, version BIGINT NOT NULL DEFAULT 0, proof_required BIGINT NOT NULL DEFAULT 1 CHECK(proof_required=1), open_box BIGINT NOT NULL DEFAULT 0 CHECK(open_box IN (0,1)), otp_scope VARCHAR(191) NOT NULL DEFAULT 'off' CHECK(otp_scope IN ('off','prepaid_only')), updated_by VARCHAR(191), updated_at BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO rider_policy(id) VALUES ('current');
CREATE TABLE IF NOT EXISTS rider_reports (
 id VARCHAR(191) PRIMARY KEY, shipping_job_id VARCHAR(191) NOT NULL REFERENCES shipping_jobs(id), rider_user_id VARCHAR(191) NOT NULL REFERENCES users(id), assignment_version BIGINT NOT NULL, kind VARCHAR(191) NOT NULL CHECK(kind IN ('delivered','failed_delivery','customer_unavailable')), note TEXT NOT NULL, object_key VARCHAR(191), mime_type VARCHAR(191), cash_paisa BIGINT NOT NULL DEFAULT 0 CHECK(cash_paisa>=0), status VARCHAR(191) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')), reviewed_by VARCHAR(191), review_note TEXT, created_at BIGINT NOT NULL, reviewed_at BIGINT, request_id VARCHAR(191) NOT NULL UNIQUE, policy_version BIGINT NOT NULL, open_box BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS rider_events (
 id VARCHAR(191) PRIMARY KEY, user_id VARCHAR(191) NOT NULL, actor_id VARCHAR(191) NOT NULL, action VARCHAR(191) NOT NULL, report_id VARCHAR(191), note TEXT NOT NULL, created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS rider_otp_challenges (
 shipping_job_id VARCHAR(191) PRIMARY KEY REFERENCES shipping_jobs(id), rider_user_id VARCHAR(191) NOT NULL, assignment_version BIGINT NOT NULL, code_hash VARCHAR(191) NOT NULL, expires_at BIGINT NOT NULL, attempts BIGINT NOT NULL DEFAULT 0, consumed_at BIGINT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX IF NOT EXISTS idx_rider_reports_queue ON rider_reports(status,created_at);
CREATE INDEX IF NOT EXISTS idx_rider_reports_assignment ON rider_reports(shipping_job_id,rider_user_id);

DROP TRIGGER IF EXISTS rider_application_no_update;
DELIMITER $$
CREATE TRIGGER rider_application_no_update BEFORE UPDATE ON rider_applications FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rider evidence history is immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS rider_application_no_delete;
DELIMITER $$
CREATE TRIGGER rider_application_no_delete BEFORE DELETE ON rider_applications FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rider evidence history is immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS rider_events_no_update;
DELIMITER $$
CREATE TRIGGER rider_events_no_update BEFORE UPDATE ON rider_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rider evidence history is immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS rider_events_no_delete;
DELIMITER $$
CREATE TRIGGER rider_events_no_delete BEFORE DELETE ON rider_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rider evidence history is immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS rider_report_no_delete;
DELIMITER $$
CREATE TRIGGER rider_report_no_delete BEFORE DELETE ON rider_reports FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rider evidence history is immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS rider_report_evidence_immutable;
DELIMITER $$
CREATE TRIGGER rider_report_evidence_immutable BEFORE UPDATE ON rider_reports FOR EACH ROW BEGIN IF (OLD.status IN ('accepted','rejected') AND NOT (NEW.status <=> OLD.status AND NEW.reviewed_by <=> OLD.reviewed_by AND NEW.review_note <=> OLD.review_note AND NEW.reviewed_at <=> OLD.reviewed_at)) OR NOT (NEW.id <=> OLD.id AND NEW.shipping_job_id <=> OLD.shipping_job_id AND NEW.rider_user_id <=> OLD.rider_user_id AND NEW.assignment_version <=> OLD.assignment_version AND NEW.kind <=> OLD.kind AND NEW.note <=> OLD.note AND NEW.object_key <=> OLD.object_key AND NEW.mime_type <=> OLD.mime_type AND NEW.cash_paisa <=> OLD.cash_paisa AND NEW.created_at <=> OLD.created_at AND NEW.request_id <=> OLD.request_id AND NEW.policy_version <=> OLD.policy_version AND NEW.open_box <=> OLD.open_box) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rider report evidence is immutable'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS rider_policy_versions_no_update;
DELIMITER $$
CREATE TRIGGER rider_policy_versions_no_update BEFORE UPDATE ON rider_policy_versions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rider policy history is immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS rider_policy_versions_no_delete;
DELIMITER $$
CREATE TRIGGER rider_policy_versions_no_delete BEFORE DELETE ON rider_policy_versions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rider policy history is immutable'; END$$
DELIMITER ;
