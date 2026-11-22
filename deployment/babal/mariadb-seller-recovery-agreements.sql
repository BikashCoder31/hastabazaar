-- Source parity for 0118_seller_recovery_agreements. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE seller_recovery_proposals(
 id VARCHAR(191) PRIMARY KEY, case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id), case_revision BIGINT NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id), payout_model VARCHAR(191) NOT NULL CHECK(payout_model IN('registered','managed','fixed')),
 currency VARCHAR(191) NOT NULL CHECK(currency='NPR'), amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 identity_revision BIGINT NOT NULL CHECK(identity_revision>=0), source_json LONGTEXT NOT NULL CHECK(json_valid(source_json)),
 installments_json LONGTEXT NOT NULL CHECK(json_valid(installments_json)), netting_authorized BIGINT NOT NULL CHECK(netting_authorized IN(0,1)),
 accepted_terms_json LONGTEXT NOT NULL CHECK(json_valid(accepted_terms_json)), terms_digest VARCHAR(191) NOT NULL CHECK(length(terms_digest)=64),
 contact_details LONGTEXT NOT NULL, next_review_at BIGINT NOT NULL, accepted_by VARCHAR(191) NOT NULL REFERENCES users(id), accepted_at BIGINT NOT NULL,
 request_id VARCHAR(191) NOT NULL UNIQUE, UNIQUE(case_id,case_revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE seller_recovery_allocations ADD COLUMN registered_debit_id VARCHAR(191), ADD CONSTRAINT fk_recovery_allocation_registered_debit FOREIGN KEY(registered_debit_id) REFERENCES seller_ledger_entries(id);
CREATE UNIQUE INDEX recovery_netting_debit_once ON seller_recovery_allocations(registered_debit_id);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_proposal_immutable BEFORE UPDATE ON seller_recovery_proposals FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_agreement_history_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_proposal_retained BEFORE DELETE ON seller_recovery_proposals FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_agreement_history_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_native_credit_required BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_ledger_entries e ON e.id=NEW.registered_credit_id
 WHERE c.id=NEW.case_id AND e.seller_id=c.seller_id AND e.amount_paisa=NEW.amount_paisa AND e.refund_id IS NULL
 AND (NEW.method<>'earnings' AND e.type='recovery_settlement' AND NEW.registered_debit_id IS NULL
  OR NEW.method='earnings' AND e.type='recovery_netting_relief'
   AND EXISTS(SELECT 1 FROM seller_ledger_entries d WHERE d.id=NEW.registered_debit_id AND d.seller_id=c.seller_id AND d.amount_paisa=-NEW.amount_paisa AND d.type='recovery_netting_withholding' AND d.refund_id IS NULL)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_original_native_settlement_required'; END IF; END$$
DELIMITER ;
