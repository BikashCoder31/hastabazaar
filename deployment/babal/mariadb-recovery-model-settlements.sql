-- Source parity for 0119_recovery_model_settlements. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE managed_supplier_recovery_credits(
 id VARCHAR(191) PRIMARY KEY, case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id), obligation_id VARCHAR(191) NOT NULL REFERENCES managed_supplier_obligations(id),
 kind VARCHAR(191) NOT NULL CHECK(kind IN('settlement','absorption','netting_relief','netting_withholding')),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa<>0 AND amount_paisa>=-9007199254740991 AND amount_paisa<=9007199254740991),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id), request_id VARCHAR(191) NOT NULL UNIQUE, created_at BIGINT NOT NULL,
 CHECK(kind='netting_withholding' AND amount_paisa<0 OR kind<>'netting_withholding' AND amount_paisa>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX fixed_recovery_obligation ON managed_supplier_recovery_credits(obligation_id);

ALTER TABLE seller_recovery_allocations ADD COLUMN fixed_credit_id VARCHAR(191), ADD CONSTRAINT fk_recovery_allocation_fixed_credit FOREIGN KEY(fixed_credit_id) REFERENCES managed_supplier_recovery_credits(id);
CREATE UNIQUE INDEX recovery_fixed_allocation_credit_once ON seller_recovery_allocations(fixed_credit_id);
ALTER TABLE seller_recovery_reductions ADD COLUMN fixed_credit_id VARCHAR(191), ADD CONSTRAINT fk_recovery_reduction_fixed_credit FOREIGN KEY(fixed_credit_id) REFERENCES managed_supplier_recovery_credits(id);
CREATE UNIQUE INDEX recovery_fixed_reduction_credit_once ON seller_recovery_reductions(fixed_credit_id);

DELIMITER $$
CREATE OR REPLACE TRIGGER fixed_recovery_credit_source BEFORE INSERT ON managed_supplier_recovery_credits FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN managed_supplier_adjustments a ON a.id=c.supplier_adjustment_id JOIN managed_supplier_obligations o ON o.id=NEW.obligation_id
 WHERE c.id=NEW.case_id AND c.payout_model='fixed' AND c.seller_id=o.seller_id AND c.currency='NPR'
 AND (NEW.kind='netting_withholding' OR a.obligation_id=o.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixed_recovery_original_model_required'; END IF; END$$
CREATE OR REPLACE TRIGGER fixed_recovery_credit_immutable BEFORE UPDATE ON managed_supplier_recovery_credits FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixed_recovery_credit_retained'; END$$
CREATE OR REPLACE TRIGGER fixed_recovery_credit_retained BEFORE DELETE ON managed_supplier_recovery_credits FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixed_recovery_credit_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_native_model_shape BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND (
 c.payout_model='registered' AND NEW.registered_credit_id IS NOT NULL AND NEW.managed_credit_id IS NULL AND NEW.fixed_credit_id IS NULL
 OR c.payout_model='managed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NOT NULL AND NEW.fixed_credit_id IS NULL AND NEW.registered_debit_id IS NULL
 OR c.payout_model='fixed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL AND NEW.fixed_credit_id IS NOT NULL AND NEW.registered_debit_id IS NULL))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_one_original_native_model_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_reduction_model_shape BEFORE INSERT ON seller_recovery_reductions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND (
 c.payout_model='registered' AND NEW.registered_credit_id IS NOT NULL AND NEW.managed_credit_id IS NULL AND NEW.fixed_credit_id IS NULL
 OR c.payout_model='managed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NOT NULL AND NEW.fixed_credit_id IS NULL
 OR c.payout_model='fixed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL AND NEW.fixed_credit_id IS NOT NULL))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_one_original_reduction_model_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_managed_credit_required BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN managed_settlement_entries x ON x.id=NEW.managed_credit_id JOIN managed_entitlements e ON e.id=x.entitlement_id
 WHERE c.id=NEW.case_id AND e.seller_id=c.seller_id AND x.refund_id=c.refund_id AND x.type='dispute_adjustment' AND x.reason_code='recovery_settlement' AND x.amount_paisa=NEW.amount_paisa
 AND EXISTS(SELECT 1 FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN managed_commercial_snapshots snapshot ON snapshot.id=e.snapshot_id WHERE r.id=c.refund_id AND request.order_item_id=snapshot.order_item_id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_recovery_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_fixed_credit_required BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='fixed')
 AND NOT EXISTS(SELECT 1 FROM managed_supplier_recovery_credits x WHERE x.id=NEW.fixed_credit_id AND x.case_id=NEW.case_id AND x.kind='settlement' AND x.amount_paisa=NEW.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixed_recovery_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_managed_reduction_credit BEFORE INSERT ON seller_recovery_reductions FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN managed_settlement_entries x ON x.id=NEW.managed_credit_id JOIN managed_entitlements e ON e.id=x.entitlement_id
 WHERE c.id=NEW.case_id AND e.seller_id=c.seller_id AND x.refund_id=c.refund_id AND x.type='dispute_adjustment' AND x.reason_code='recovery_absorption' AND x.amount_paisa=NEW.amount_paisa
 AND EXISTS(SELECT 1 FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN managed_commercial_snapshots snapshot ON snapshot.id=e.snapshot_id WHERE r.id=c.refund_id AND request.order_item_id=snapshot.order_item_id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_recovery_absorption_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_fixed_reduction_credit BEFORE INSERT ON seller_recovery_reductions FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='fixed')
 AND NOT EXISTS(SELECT 1 FROM managed_supplier_recovery_credits x WHERE x.id=NEW.fixed_credit_id AND x.case_id=NEW.case_id AND x.kind='absorption' AND x.amount_paisa=NEW.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixed_recovery_absorption_credit_required'; END IF; END$$
DELIMITER ;
