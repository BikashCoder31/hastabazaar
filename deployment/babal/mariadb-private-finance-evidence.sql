-- Source parity for 0108_private_finance_evidence. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE finance_evidence_intents(
 id VARCHAR(191) PRIMARY KEY,scope_kind VARCHAR(191) NOT NULL CHECK(scope_kind IN('obligation','company_account','order')),
 scope_id VARCHAR(191) NOT NULL,uploaded_by VARCHAR(191) NOT NULL REFERENCES users(id),object_key VARCHAR(191) NOT NULL UNIQUE,
 original_name LONGTEXT NOT NULL,mime_type VARCHAR(191) NOT NULL,size_bytes BIGINT NOT NULL CHECK(size_bytes>0 AND size_bytes<=5242880),
 content_hash VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE finance_evidence_files(id VARCHAR(191) PRIMARY KEY REFERENCES finance_evidence_intents(id),retained_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER finance_evidence_intent_no_update BEFORE UPDATE ON finance_evidence_intents FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='private_finance_evidence_retained'; END$$
CREATE OR REPLACE TRIGGER finance_evidence_intent_no_delete BEFORE DELETE ON finance_evidence_intents FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='private_finance_evidence_retained'; END$$
CREATE OR REPLACE TRIGGER finance_evidence_file_no_update BEFORE UPDATE ON finance_evidence_files FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='private_finance_evidence_retained'; END$$
CREATE OR REPLACE TRIGGER finance_evidence_file_no_delete BEFORE DELETE ON finance_evidence_files FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='private_finance_evidence_retained'; END$$
DELIMITER ;
