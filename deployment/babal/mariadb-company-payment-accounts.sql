-- Source-only MariaDB counterpart of 0086. Generation never applies this schema or supplies bank data.
CREATE TABLE company_payment_accounts (
 id VARCHAR(191) PRIMARY KEY NOT NULL,revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),latest_version_id VARCHAR(191),
 last_event_id VARCHAR(191) NOT NULL,created_by VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,
 FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_payment_account_identities (
 identity_hash VARCHAR(64) PRIMARY KEY NOT NULL CHECK(CHAR_LENGTH(identity_hash)=64),account_id VARCHAR(191) NOT NULL,
 FOREIGN KEY (account_id) REFERENCES company_payment_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_payment_account_versions (
 id VARCHAR(191) PRIMARY KEY NOT NULL,account_id VARCHAR(191) NOT NULL,number BIGINT NOT NULL CHECK(number>0),
 supersedes_id VARCHAR(191),identity_hash VARCHAR(64) NOT NULL,revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 status VARCHAR(40) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','awaiting_verification','verified','inactive')),
 details_json LONGTEXT NOT NULL CHECK(json_valid(details_json) AND JSON_TYPE(details_json)='OBJECT'),
 evidence_reference VARCHAR(500) NOT NULL CHECK(CHAR_LENGTH(trim(evidence_reference)) BETWEEN 8 AND 500),
 conflicts_json LONGTEXT NOT NULL CHECK(json_valid(conflicts_json) AND JSON_TYPE(conflicts_json)='ARRAY'),
 created_by VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,submitted_at BIGINT,
 verified_by VARCHAR(191),verified_at BIGINT,verification_reference VARCHAR(500),
 UNIQUE(account_id,number),CHECK(status NOT IN ('awaiting_verification','verified') OR submitted_at IS NOT NULL),
 CHECK(status<>'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND CHAR_LENGTH(trim(verification_reference))>=8)),
 FOREIGN KEY (account_id) REFERENCES company_payment_accounts(id),
 FOREIGN KEY (supersedes_id) REFERENCES company_payment_account_versions(id),
 FOREIGN KEY (identity_hash) REFERENCES company_payment_account_identities(identity_hash),
 FOREIGN KEY (created_by) REFERENCES users(id),
 FOREIGN KEY (verified_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_payment_account_current (
 currency VARCHAR(3) PRIMARY KEY NOT NULL CHECK(currency='NPR'),version_id VARCHAR(191),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),updated_by VARCHAR(191),updated_at BIGINT NOT NULL,
 FOREIGN KEY (version_id) REFERENCES company_payment_account_versions(id),
 FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO company_payment_account_current(currency,version_id,revision,updated_at) VALUES('NPR',NULL,0,0);

CREATE TABLE company_payment_account_events (
 id VARCHAR(191) PRIMARY KEY NOT NULL,account_id VARCHAR(191) NOT NULL,version_id VARCHAR(191) NOT NULL,
 actor_id VARCHAR(191) NOT NULL,action VARCHAR(100) NOT NULL,reason VARCHAR(1000) NOT NULL CHECK(CHAR_LENGTH(trim(reason)) BETWEEN 10 AND 1000),created_at BIGINT NOT NULL,
 FOREIGN KEY (account_id) REFERENCES company_payment_accounts(id),
 FOREIGN KEY (version_id) REFERENCES company_payment_account_versions(id),
 FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_payment_instructions (
 order_id VARCHAR(191) PRIMARY KEY NOT NULL,account_version_id VARCHAR(191) NOT NULL,
 snapshot_json LONGTEXT NOT NULL CHECK(json_valid(snapshot_json) AND JSON_TYPE(snapshot_json)='OBJECT'),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),currency VARCHAR(3) NOT NULL CHECK(currency='NPR'),
 payment_reference VARCHAR(191) NOT NULL UNIQUE,issued_at BIGINT NOT NULL,deadline_at BIGINT NOT NULL CHECK(deadline_at=issued_at+86400000),
 calendar_version VARCHAR(100) NOT NULL,issued_by VARCHAR(191) NOT NULL,request_id VARCHAR(191) NOT NULL UNIQUE,
 FOREIGN KEY (order_id) REFERENCES orders(id),
 FOREIGN KEY (account_version_id) REFERENCES company_payment_account_versions(id),
 FOREIGN KEY (issued_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER company_account_head_valid BEFORE UPDATE ON company_payment_accounts FOR EACH ROW BEGIN
IF NEW.revision<>OLD.revision+1 OR BINARY NEW.id<>BINARY OLD.id OR BINARY NEW.created_by<>BINARY OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT EXISTS(SELECT 1 FROM company_payment_account_versions WHERE id=NEW.latest_version_id AND account_id=NEW.id) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_head_conflict';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_version_immutable BEFORE UPDATE ON company_payment_account_versions FOR EACH ROW BEGIN
IF BINARY NEW.id<>BINARY OLD.id OR BINARY NEW.account_id<>BINARY OLD.account_id OR NEW.number<>OLD.number OR NOT(NEW.supersedes_id <=> OLD.supersedes_id)
 OR BINARY NEW.identity_hash<>BINARY OLD.identity_hash OR BINARY NEW.details_json<>BINARY OLD.details_json OR BINARY NEW.evidence_reference<>BINARY OLD.evidence_reference OR BINARY NEW.conflicts_json<>BINARY OLD.conflicts_json
 OR BINARY NEW.created_by<>BINARY OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1
 OR (OLD.submitted_at IS NOT NULL AND NOT(NEW.submitted_at <=> OLD.submitted_at))
 OR (OLD.verified_at IS NOT NULL AND (NOT(NEW.verified_by <=> OLD.verified_by) OR NOT(NEW.verified_at <=> OLD.verified_at) OR NOT(NEW.verification_reference <=> OLD.verification_reference)))
 OR NOT ((OLD.status='draft' AND NEW.status='awaiting_verification') OR (OLD.status='awaiting_verification' AND NEW.status='verified') OR (OLD.status='verified' AND NEW.status='verified') OR (OLD.status<>'inactive' AND NEW.status='inactive')) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_version_immutable';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_selector_valid BEFORE UPDATE ON company_payment_account_current FOR EACH ROW BEGIN
IF NEW.currency<>OLD.currency OR NEW.revision<>OLD.revision+1 OR (NEW.version_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM company_payment_account_versions v JOIN company_payment_accounts a ON a.id=v.account_id
 WHERE v.id=NEW.version_id AND a.latest_version_id=v.id AND v.status='verified' AND JSON_UNQUOTE(JSON_EXTRACT(v.details_json,'$.currency'))=NEW.currency AND JSON_UNQUOTE(JSON_EXTRACT(v.details_json,'$.purpose')) IN ('receiving','both'))) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_selector_conflict';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_retention BEFORE DELETE ON company_payment_accounts FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_immutable_history';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_selector_retention BEFORE DELETE ON company_payment_account_current FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_immutable_history';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_identity_immutable BEFORE UPDATE ON company_payment_account_identities FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_immutable_history';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_identity_retention BEFORE DELETE ON company_payment_account_identities FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_immutable_history';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_version_retention BEFORE DELETE ON company_payment_account_versions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_immutable_history';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_event_immutable BEFORE UPDATE ON company_payment_account_events FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_immutable_history';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_event_retention BEFORE DELETE ON company_payment_account_events FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_immutable_history';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_instruction_immutable BEFORE UPDATE ON company_payment_instructions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_instruction_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_instruction_retention BEFORE DELETE ON company_payment_instructions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_instruction_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_review_task_created AFTER UPDATE ON company_payment_account_versions FOR EACH ROW BEGIN
IF NEW.status='awaiting_verification' AND OLD.status='draft' THEN
INSERT INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline)
 VALUES(REPLACE(UUID(),'-',''),'company_account',NEW.id,NEW.id,NEW.submitted_at,NEW.submitted_at,'no-agreed-deadline-v1',NEW.submitted_at,0);
END IF;
END$$
DELIMITER ;
