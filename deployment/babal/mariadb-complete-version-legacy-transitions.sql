-- Explicit separately reviewed cutover only. No startup/backlog normalization.
CREATE TABLE complete_version_legacy_transitions (
 source_request_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES seller_document_change_requests(id),
 case_id VARCHAR(191) NOT NULL UNIQUE REFERENCES seller_protected_change_cases(id),
 cutover_key VARCHAR(191) NOT NULL,
 transition_operation_id VARCHAR(191) NOT NULL UNIQUE,
 source_fingerprint VARCHAR(191) NOT NULL CHECK(length(source_fingerprint)=64 AND source_fingerprint NOT REGEXP BINARY '[^0-9a-f]'),
 source_snapshot_json LONGTEXT NOT NULL CHECK(json_valid(source_snapshot_json)),
 original_operation_id VARCHAR(191),
 historical_request_identity_revision BIGINT CHECK(historical_request_identity_revision IS NULL),
 historical_request_bank_reference VARCHAR(191) CHECK(historical_request_bank_reference IS NULL),
 baseline_basis VARCHAR(191) NOT NULL CHECK(BINARY baseline_basis=BINARY 'cutover_observation'),
 observed_identity_revision BIGINT NOT NULL CHECK(observed_identity_revision>=0),
 observed_bank_reference LONGTEXT,
 observed_at BIGINT NOT NULL CHECK(observed_at>=0),
 original_requested_at BIGINT NOT NULL CHECK(original_requested_at>=0),
 review_task_id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL REFERENCES review_tasks(id),
 existing_task_preserved BIGINT NOT NULL CHECK(existing_task_preserved IN(0,1)),
 first_review_due_at BIGINT NOT NULL,
 deadline_started_at BIGINT NOT NULL CHECK(deadline_started_at>=0),
 cutover_at BIGINT NOT NULL CHECK(cutover_at>=0),
 initiated_by VARCHAR(191) NOT NULL REFERENCES users(id),
 CHECK(hex(case_id)=hex(source_request_id)),
 CHECK(existing_task_preserved=1 OR first_review_due_at>=cutover_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER legacy_transition_link_guard BEFORE INSERT ON complete_version_legacy_transitions FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM seller_document_change_requests r JOIN seller_protected_change_cases c ON hex(c.source_request_id)=hex(r.id)
 JOIN review_tasks t ON hex(t.id)=hex(NEW.review_task_id) AND hex(t.source_type)=hex('document_change') AND hex(t.source_id)=hex(r.id) AND hex(t.source_revision)=hex(CASE WHEN NEW.existing_task_preserved=1 THEN r.id ELSE NEW.transition_operation_id END)
 WHERE hex(r.id)=hex(NEW.source_request_id) AND hex(c.id)=hex(NEW.case_id) AND hex(c.seller_id)=hex(r.seller_id) AND hex(c.source_document_id)=hex(r.document_id)
 AND hex(NEW.transition_operation_id)=hex(c.operation_request_id) AND c.requested_at=r.requested_at AND NEW.observed_at=NEW.cutover_at AND c.updated_at=NEW.cutover_at
 AND hex(NEW.baseline_basis)=hex('cutover_observation') AND NEW.observed_identity_revision=c.original_identity_revision AND (BINARY NEW.observed_bank_reference<=>BINARY c.original_bank_reference) AND (BINARY NEW.original_operation_id<=>BINARY r.operation_request_id) AND NEW.original_requested_at=r.requested_at AND NEW.first_review_due_at=t.due_at) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='legacy_transition_source_link_required';
END IF;
END$$
CREATE TRIGGER legacy_transition_immutable BEFORE UPDATE ON complete_version_legacy_transitions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='legacy_transition_immutable';
END$$
CREATE TRIGGER legacy_transition_retained BEFORE DELETE ON complete_version_legacy_transitions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='legacy_transition_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE OR REPLACE TRIGGER seller_identity_revision_changed AFTER UPDATE ON seller_profiles FOR EACH ROW BEGIN
 IF NOT(BINARY NEW.legal_name<=>BINARY OLD.legal_name) OR NOT(BINARY NEW.applicant_type<=>BINARY OLD.applicant_type) OR NOT(BINARY NEW.tax_registration_number<=>BINARY OLD.tax_registration_number)
 OR NOT(BINARY NEW.representative_name<=>BINARY OLD.representative_name) OR NOT(BINARY NEW.registration_number<=>BINARY OLD.registration_number)
 OR NOT(BINARY NEW.registration_authority<=>BINARY OLD.registration_authority) OR NOT(BINARY NEW.tax_mode<=>BINARY OLD.tax_mode) THEN
 UPDATE seller_protected_revisions SET identity_revision=identity_revision+1 WHERE seller_id=NEW.id;
 END IF;
END$$
CREATE OR REPLACE TRIGGER seller_bank_revision_changed AFTER UPDATE ON seller_profiles FOR EACH ROW BEGIN
 IF NOT(BINARY NEW.payout_account_reference<=>BINARY OLD.payout_account_reference) THEN
 UPDATE seller_protected_revisions SET bank_revision=bank_revision+1 WHERE seller_id=NEW.id;
 END IF;
END$$
DELIMITER ;
