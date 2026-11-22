-- Source parity for 0107_lawful_fee_refund_authorizations. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE lawful_fee_refund_authorizations(
 id VARCHAR(191) PRIMARY KEY,order_id VARCHAR(191) NOT NULL REFERENCES orders(id),customer_id VARCHAR(191) NOT NULL REFERENCES users(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 legal_basis LONGTEXT NOT NULL,case_reference VARCHAR(191) NOT NULL,evidence_reference LONGTEXT NOT NULL,
 source_snapshot_json LONGTEXT NOT NULL CHECK(json_valid(source_snapshot_json)),
 authorized_by VARCHAR(191) NOT NULL REFERENCES users(id),authorized_at BIGINT NOT NULL,
 state VARCHAR(191) NOT NULL DEFAULT 'authorized' CHECK(state IN('authorized','paid')),
 UNIQUE(order_id,case_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER lawful_fee_authorization_retained BEFORE UPDATE ON lawful_fee_refund_authorizations FOR EACH ROW BEGIN IF (NEW.id<>OLD.id OR NEW.order_id<>OLD.order_id OR NEW.customer_id<>OLD.customer_id
 OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.legal_basis<>OLD.legal_basis OR NEW.case_reference<>OLD.case_reference
 OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.source_snapshot_json<>OLD.source_snapshot_json
 OR NEW.authorized_by<>OLD.authorized_by OR NEW.authorized_at<>OLD.authorized_at OR OLD.state<>'authorized' OR NEW.state<>'paid') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='original_fee_authorization_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER lawful_fee_authorization_no_delete BEFORE DELETE ON lawful_fee_refund_authorizations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='original_fee_authorization_retained'; END$$
DELIMITER ;
