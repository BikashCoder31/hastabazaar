-- Source parity for 0122_recovery_repayment_claims. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE seller_recovery_repayment_claims(
 id VARCHAR(191) PRIMARY KEY, case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id), submitted_by VARCHAR(191) NOT NULL REFERENCES users(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 payment_reference VARCHAR(191) NOT NULL, claimed_at BIGINT NOT NULL, account_version_id VARCHAR(191) REFERENCES company_payment_account_versions(id),
 evidence_reference LONGTEXT, note LONGTEXT NOT NULL, fingerprint VARCHAR(191) NOT NULL,
 status VARCHAR(191) NOT NULL CHECK(status IN('submitted','needs_evidence','receipt_verified','not_received')),
 revision BIGINT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, first_review_due_at BIGINT NOT NULL, next_review_at BIGINT,
 receipt_id VARCHAR(191) REFERENCES company_money_receipts(id), receipt_revision BIGINT, public_message LONGTEXT,
 reviewed_by VARCHAR(191) REFERENCES users(id), reviewed_at BIGINT, operation_request_id VARCHAR(191) NOT NULL UNIQUE,
 UNIQUE(case_id,fingerprint), UNIQUE(receipt_id), CHECK(claimed_at<=created_at), CHECK(first_review_due_at>=created_at),
 CHECK(status IN('submitted','needs_evidence') AND next_review_at IS NOT NULL OR status IN('receipt_verified','not_received') AND next_review_at IS NULL),
 CHECK(status='receipt_verified' AND receipt_id IS NOT NULL AND receipt_revision IS NOT NULL OR status<>'receipt_verified' AND receipt_id IS NULL AND receipt_revision IS NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_recovery_claim_events(
 id VARCHAR(191) PRIMARY KEY, claim_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_repayment_claims(id), revision BIGINT NOT NULL,
 action VARCHAR(191) NOT NULL, actor_id VARCHAR(191) NOT NULL REFERENCES users(id), reason LONGTEXT NOT NULL, details_json LONGTEXT NOT NULL CHECK(json_valid(details_json)),
 request_id VARCHAR(191) NOT NULL UNIQUE, created_at BIGINT NOT NULL, UNIQUE(claim_id,revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_claims_case ON seller_recovery_repayment_claims(case_id,created_at);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_claim_original_owner BEFORE INSERT ON seller_recovery_repayment_claims FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id JOIN users u ON u.id=s.user_id
 WHERE c.id=NEW.case_id AND s.user_id=NEW.submitted_by AND JSON_VALUE(c.original_source_json,'$.ownerId')=NEW.submitted_by AND u.status='active')
 OR NEW.status<>'submitted' OR NEW.revision<>0 OR NEW.receipt_id IS NOT NULL) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_claim_original_owner_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_claim_original_retained BEFORE UPDATE ON seller_recovery_repayment_claims FOR EACH ROW BEGIN IF (NOT (NEW.id <=> OLD.id) OR NOT (NEW.case_id <=> OLD.case_id) OR NOT (NEW.submitted_by <=> OLD.submitted_by) OR NOT (NEW.amount_paisa <=> OLD.amount_paisa)
 OR NOT (NEW.payment_reference <=> OLD.payment_reference) OR NOT (NEW.claimed_at <=> OLD.claimed_at) OR NOT (NEW.account_version_id <=> OLD.account_version_id)
 OR NOT (NEW.evidence_reference <=> OLD.evidence_reference) OR NOT (NEW.note <=> OLD.note) OR NOT (NEW.fingerprint <=> OLD.fingerprint)
 OR NOT (NEW.created_at <=> OLD.created_at) OR NOT (NEW.first_review_due_at <=> OLD.first_review_due_at) OR NEW.revision<>OLD.revision+1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_claim_original_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_claim_verified_receipt BEFORE UPDATE ON seller_recovery_repayment_claims FOR EACH ROW BEGIN IF (NEW.status='receipt_verified' AND NOT EXISTS(SELECT 1 FROM company_money_receipts r JOIN company_receipt_controls control ON control.receipt_id=r.id WHERE r.id=NEW.receipt_id AND control.revision=NEW.receipt_revision
 AND r.kind='bank_credit' AND r.status='verified' AND r.currency='NPR' AND r.amount_minor=NEW.amount_paisa AND r.payer_user_id=NEW.submitted_by
 AND (NEW.account_version_id IS NULL OR r.account_version_id=NEW.account_version_id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=r.id AND conflict.user_id=NEW.reviewed_by)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversal WHERE reversal.receipt_id=r.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_claim_actual_attributed_receipt_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_claim_retained BEFORE DELETE ON seller_recovery_repayment_claims FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_claim_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_claim_event_immutable BEFORE UPDATE ON seller_recovery_claim_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_claim_event_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_claim_event_retained BEFORE DELETE ON seller_recovery_claim_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_claim_event_retained'; END$$
DELIMITER ;
