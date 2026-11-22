-- Source artifact only. Parity for drizzle/0083; no existing database is changed by generation.
CREATE TABLE seller_protected_revisions (
 seller_id VARCHAR(191) PRIMARY KEY REFERENCES seller_profiles(id),
 identity_revision BIGINT NOT NULL DEFAULT 0,
 bank_revision BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO seller_protected_revisions(seller_id) SELECT id FROM seller_profiles;

DELIMITER $$
CREATE TRIGGER seller_protected_revision_created AFTER INSERT ON seller_profiles FOR EACH ROW BEGIN
 INSERT INTO seller_protected_revisions(seller_id) VALUES(NEW.id);
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER seller_identity_revision_changed AFTER UPDATE ON seller_profiles FOR EACH ROW BEGIN
 IF NOT(NEW.legal_name <=> OLD.legal_name) OR NOT(NEW.applicant_type <=> OLD.applicant_type) OR NOT(NEW.tax_registration_number <=> OLD.tax_registration_number)
 OR NOT(NEW.representative_name <=> OLD.representative_name) OR NOT(NEW.registration_number <=> OLD.registration_number)
 OR NOT(NEW.registration_authority <=> OLD.registration_authority) OR NOT(NEW.tax_mode <=> OLD.tax_mode) THEN
 UPDATE seller_protected_revisions SET identity_revision=identity_revision+1 WHERE seller_id=NEW.id;
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER seller_bank_revision_changed AFTER UPDATE ON seller_profiles FOR EACH ROW BEGIN
 IF NOT(NEW.payout_account_reference <=> OLD.payout_account_reference) THEN
 UPDATE seller_protected_revisions SET bank_revision=bank_revision+1 WHERE seller_id=NEW.id;
 END IF;
END$$
DELIMITER ;

ALTER TABLE seller_documents ADD COLUMN valid_until BIGINT;

DELIMITER $$
CREATE TRIGGER seller_evidence_revision_changed AFTER UPDATE ON seller_documents FOR EACH ROW BEGIN
 IF NOT(NEW.status <=> OLD.status) OR NOT(NEW.valid_until <=> OLD.valid_until) THEN
 UPDATE seller_protected_revisions SET
 identity_revision=identity_revision+CASE WHEN NEW.kind<>'bank_verification' THEN 1 ELSE 0 END,
 bank_revision=bank_revision+CASE WHEN NEW.kind='bank_verification' THEN 1 ELSE 0 END WHERE seller_id=NEW.seller_id;
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER seller_identity_facts_revision_changed AFTER INSERT ON managed_maker_application_details FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM managed_maker_application_details previous WHERE previous.seller_id=NEW.seller_id AND previous.id<>NEW.id
 AND previous.id=(SELECT id FROM managed_maker_application_details WHERE seller_id=NEW.seller_id AND id<>NEW.id ORDER BY created_at DESC,id DESC LIMIT 1)
 AND (NOT(previous.government_id_type <=> NEW.government_id_type) OR NOT(previous.government_id_description <=> NEW.government_id_description) OR NOT(previous.personal_pan <=> NEW.personal_pan))) THEN
 UPDATE seller_protected_revisions SET identity_revision=identity_revision+1 WHERE seller_id=NEW.seller_id;
 END IF;
END$$
DELIMITER ;

CREATE TABLE seller_protected_change_cases (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 kind VARCHAR(191) NOT NULL CHECK(kind IN ('identity','bank')),
 classification VARCHAR(191) NOT NULL CHECK(classification IN ('unclassified','material','identity_evidence_only','bank')),
 status VARCHAR(191) NOT NULL DEFAULT 'open' CHECK(status IN ('open','verified','rejected','withdrawn','closed')),
 source_request_id VARCHAR(191) UNIQUE REFERENCES seller_document_change_requests(id),
 source_document_id VARCHAR(191) REFERENCES seller_documents(id),
 original_identity_revision BIGINT NOT NULL,
 original_bank_reference TEXT,
 scope_json LONGTEXT NOT NULL,
 proposed_json LONGTEXT,
 replacement_document_id VARCHAR(191) REFERENCES seller_documents(id),
 invalid_current BIGINT NOT NULL DEFAULT 0 CHECK(invalid_current IN (0,1)),
 version BIGINT NOT NULL DEFAULT 0,
 requested_by VARCHAR(191) REFERENCES users(id),
 reason TEXT NOT NULL,
 requested_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL,
 reviewed_by VARCHAR(191) REFERENCES users(id),
 reviewed_at BIGINT,
 review_reason TEXT,
 evidence_reference TEXT,
 operation_request_id VARCHAR(191) NOT NULL,
 CHECK(source_request_id IS NULL OR id=source_request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX seller_protected_cases_seller ON seller_protected_change_cases(seller_id,status);

CREATE TABLE seller_capability_holds (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 case_id VARCHAR(191) NOT NULL REFERENCES seller_protected_change_cases(id),
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 capability VARCHAR(191) NOT NULL CHECK(capability IN ('new_orders','payouts')),
 reason TEXT NOT NULL,
 created_at BIGINT NOT NULL,
 released_at BIGINT,
 released_by VARCHAR(191) REFERENCES users(id),
 release_reason TEXT,
 release_request_id VARCHAR(191),
 CHECK((released_at IS NULL AND release_reason IS NULL AND release_request_id IS NULL) OR
 (released_at IS NOT NULL AND release_reason IS NOT NULL AND release_request_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE seller_capability_holds ADD COLUMN active_case_id VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN released_at IS NULL THEN case_id ELSE NULL END) STORED, ADD UNIQUE KEY seller_capability_hold_active(active_case_id,capability);

CREATE INDEX seller_capability_hold_lookup ON seller_capability_holds(seller_id,capability,released_at);

CREATE TABLE seller_payout_review_blocks (
 payout_model VARCHAR(191) NOT NULL CHECK(payout_model IN ('registered','managed','fixed')),
 payout_id VARCHAR(191) NOT NULL,
 case_id VARCHAR(191) NOT NULL REFERENCES seller_protected_change_cases(id),
 disposition VARCHAR(191) NOT NULL CHECK(disposition IN ('reprepare','reconcile')),
 original_status VARCHAR(191) NOT NULL,
 original_destination TEXT NOT NULL,
 original_amount_paisa BIGINT NOT NULL CHECK(original_amount_paisa>0),
 created_at BIGINT NOT NULL,
 PRIMARY KEY(payout_model,payout_id,case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_beneficiary_versions (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 case_id VARCHAR(191) NOT NULL REFERENCES seller_protected_change_cases(id),
 document_id VARCHAR(191) NOT NULL REFERENCES seller_documents(id),
 details_json LONGTEXT NOT NULL,
 identity_revision BIGINT NOT NULL,
 ownership_basis VARCHAR(191) NOT NULL CHECK(ownership_basis IN ('same_person','same_legal_entity')),
 verification_reference TEXT NOT NULL,
 review_reason TEXT NOT NULL,
 verified_by VARCHAR(191) REFERENCES users(id),
 verified_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER protected_case_source_immutable BEFORE UPDATE ON seller_protected_change_cases FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.seller_id <=> OLD.seller_id) OR NOT(NEW.kind <=> OLD.kind) OR NOT(NEW.source_request_id <=> OLD.source_request_id)
 OR NOT(NEW.source_document_id <=> OLD.source_document_id) OR NOT(NEW.original_identity_revision <=> OLD.original_identity_revision)
 OR NOT(NEW.original_bank_reference <=> OLD.original_bank_reference) OR NOT(NEW.requested_at <=> OLD.requested_at)
 OR NOT(NEW.reason <=> OLD.reason) OR NOT(NEW.scope_json <=> OLD.scope_json) OR NOT(NEW.invalid_current <=> OLD.invalid_current)
 OR (NOT(NEW.requested_by <=> NULL) AND NOT(NEW.requested_by <=> OLD.requested_by)) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_case_source_immutable';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_case_retained BEFORE DELETE ON seller_protected_change_cases FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_case_history_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER capability_hold_immutable BEFORE UPDATE ON seller_capability_holds FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.case_id <=> OLD.case_id) OR NOT(NEW.seller_id <=> OLD.seller_id) OR NOT(NEW.capability <=> OLD.capability)
 OR NOT(NEW.reason <=> OLD.reason) OR NOT(NEW.created_at <=> OLD.created_at)
 OR (NOT(OLD.released_at <=> NULL) AND (NOT(NEW.released_at <=> OLD.released_at) OR NOT(NEW.release_reason <=> OLD.release_reason)
 OR NOT(NEW.release_request_id <=> OLD.release_request_id) OR (NOT(NEW.released_by <=> NULL) AND NOT(NEW.released_by <=> OLD.released_by)))) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='capability_hold_history_immutable';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER capability_hold_retained BEFORE DELETE ON seller_capability_holds FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='capability_hold_history_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER payout_review_block_immutable BEFORE UPDATE ON seller_payout_review_blocks FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_review_block_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER payout_review_block_retained BEFORE DELETE ON seller_payout_review_blocks FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_review_block_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER beneficiary_version_immutable BEFORE UPDATE ON seller_beneficiary_versions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='beneficiary_version_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER beneficiary_version_retained BEFORE DELETE ON seller_beneficiary_versions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='beneficiary_version_retained';
END$$
DELIMITER ;

CREATE TABLE seller_protected_change_permissions (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 case_id VARCHAR(191) NOT NULL REFERENCES seller_protected_change_cases(id),
 scope_json LONGTEXT NOT NULL,
 identity_revision BIGINT NOT NULL,
 bank_revision BIGINT NOT NULL,
 reviewed_by VARCHAR(191) REFERENCES users(id),
 reviewed_at BIGINT NOT NULL,
 reason TEXT NOT NULL,
 used_document_id VARCHAR(191) REFERENCES seller_documents(id),
 used_at BIGINT,
 CHECK((used_document_id IS NULL AND used_at IS NULL) OR (used_document_id IS NOT NULL AND used_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preserve the permission FK without reusing an existing implicit InnoDB constraint name.
ALTER TABLE seller_protected_change_cases ADD COLUMN active_permission_id VARCHAR(191),
 ADD CONSTRAINT fk_protected_case_active_permission FOREIGN KEY(active_permission_id) REFERENCES seller_protected_change_permissions(id);

CREATE TABLE seller_protected_change_events (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 case_id VARCHAR(191) NOT NULL REFERENCES seller_protected_change_cases(id),
 actor_id VARCHAR(191) REFERENCES users(id),
 action VARCHAR(191) NOT NULL,
 reason TEXT NOT NULL,
 payload_json LONGTEXT NOT NULL,
 created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER protected_permission_immutable BEFORE UPDATE ON seller_protected_change_permissions FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.case_id <=> OLD.case_id) OR NOT(NEW.scope_json <=> OLD.scope_json) OR NOT(NEW.identity_revision <=> OLD.identity_revision)
 OR NOT(NEW.bank_revision <=> OLD.bank_revision) OR NOT(NEW.reviewed_at <=> OLD.reviewed_at) OR NOT(NEW.reason <=> OLD.reason)
 OR (NOT(NEW.reviewed_by <=> NULL) AND NOT(NEW.reviewed_by <=> OLD.reviewed_by))
 OR (NOT(OLD.used_at <=> NULL) AND (NOT(NEW.used_at <=> OLD.used_at) OR NOT(NEW.used_document_id <=> OLD.used_document_id))) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_permission_immutable';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_permission_retained BEFORE DELETE ON seller_protected_change_permissions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_permission_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_change_event_immutable BEFORE UPDATE ON seller_protected_change_events FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_change_event_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_change_event_retained BEFORE DELETE ON seller_protected_change_events FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_change_event_retained';
END$$
DELIMITER ;

ALTER TABLE seller_documents ADD COLUMN protected_change_id VARCHAR(191) REFERENCES seller_protected_change_cases(id);

CREATE TABLE seller_identity_fact_versions (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 case_id VARCHAR(191) NOT NULL UNIQUE REFERENCES seller_protected_change_cases(id),
 identity_revision BIGINT NOT NULL,
 facts_json LONGTEXT NOT NULL CHECK(JSON_VALID(facts_json)),
 verified_by VARCHAR(191) REFERENCES users(id),
 verified_at BIGINT NOT NULL,
 verification_reference TEXT NOT NULL,
 review_reason TEXT NOT NULL,
 UNIQUE(seller_id,identity_revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER protected_identity_facts_immutable BEFORE UPDATE ON seller_identity_fact_versions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_identity_facts_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_identity_facts_retained BEFORE DELETE ON seller_identity_fact_versions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_identity_facts_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_document_case_immutable BEFORE UPDATE ON seller_documents FOR EACH ROW BEGIN
 IF NOT(OLD.protected_change_id <=> NULL) AND NOT(NEW.protected_change_id <=> OLD.protected_change_id) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_document_case_immutable';
 END IF;
END$$
DELIMITER ;

CREATE TABLE seller_payout_packet_dispositions (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 case_id VARCHAR(191) NOT NULL REFERENCES seller_protected_change_cases(id),
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 payout_model VARCHAR(191) NOT NULL CHECK(payout_model IN ('registered','managed','fixed')),
 old_payout_id VARCHAR(191) NOT NULL,
 original_status VARCHAR(191) NOT NULL,
 original_destination TEXT NOT NULL,
 original_amount_paisa BIGINT NOT NULL,
 evidence_reference TEXT NOT NULL,
 reason TEXT NOT NULL,
 actor_id VARCHAR(191) REFERENCES users(id),
 created_at BIGINT NOT NULL,
 UNIQUE(payout_model,old_payout_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_payout_packet_replacements (
 disposition_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES seller_payout_packet_dispositions(id),
 new_payout_id VARCHAR(191) NOT NULL,
 actor_id VARCHAR(191) REFERENCES users(id),
 created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER protected_packet_disposition_immutable BEFORE UPDATE ON seller_payout_packet_dispositions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_packet_disposition_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_packet_disposition_retained BEFORE DELETE ON seller_payout_packet_dispositions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_packet_disposition_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_packet_replacement_immutable BEFORE UPDATE ON seller_payout_packet_replacements FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_packet_replacement_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_packet_replacement_retained BEFORE DELETE ON seller_payout_packet_replacements FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_packet_replacement_retained';
END$$
DELIMITER ;
