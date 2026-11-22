-- Source parity for 0120_recovery_model_netting. Disposable validation targets only; canonical/live execution remains held.


ALTER TABLE seller_recovery_allocations ADD COLUMN managed_debit_id VARCHAR(191), ADD CONSTRAINT fk_recovery_allocation_managed_debit FOREIGN KEY(managed_debit_id) REFERENCES managed_settlement_entries(id);
CREATE UNIQUE INDEX recovery_managed_netting_debit_once ON seller_recovery_allocations(managed_debit_id);
ALTER TABLE seller_recovery_allocations ADD COLUMN fixed_debit_id VARCHAR(191), ADD CONSTRAINT fk_recovery_allocation_fixed_debit FOREIGN KEY(fixed_debit_id) REFERENCES managed_supplier_recovery_credits(id);
CREATE UNIQUE INDEX recovery_fixed_netting_debit_once ON seller_recovery_allocations(fixed_debit_id);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_native_model_shape BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND (
 c.payout_model='registered' AND NEW.registered_credit_id IS NOT NULL AND NEW.managed_credit_id IS NULL AND NEW.fixed_credit_id IS NULL AND NEW.managed_debit_id IS NULL AND NEW.fixed_debit_id IS NULL
  AND (NEW.method='earnings' AND NEW.registered_debit_id IS NOT NULL OR NEW.method<>'earnings' AND NEW.registered_debit_id IS NULL)
 OR c.payout_model='managed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NOT NULL AND NEW.fixed_credit_id IS NULL AND NEW.registered_debit_id IS NULL AND NEW.fixed_debit_id IS NULL
  AND (NEW.method='earnings' AND NEW.managed_debit_id IS NOT NULL OR NEW.method<>'earnings' AND NEW.managed_debit_id IS NULL)
 OR c.payout_model='fixed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL AND NEW.fixed_credit_id IS NOT NULL AND NEW.registered_debit_id IS NULL AND NEW.managed_debit_id IS NULL
  AND (NEW.method='earnings' AND NEW.fixed_debit_id IS NOT NULL OR NEW.method<>'earnings' AND NEW.fixed_debit_id IS NULL)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_one_original_native_model_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_managed_credit_required BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN managed_settlement_entries x ON x.id=NEW.managed_credit_id JOIN managed_entitlements e ON e.id=x.entitlement_id
 WHERE c.id=NEW.case_id AND e.seller_id=c.seller_id AND x.refund_id=c.refund_id AND x.type='dispute_adjustment' AND x.amount_paisa=NEW.amount_paisa
 AND EXISTS(SELECT 1 FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN managed_commercial_snapshots snapshot ON snapshot.id=e.snapshot_id WHERE r.id=c.refund_id AND request.order_item_id=snapshot.order_item_id)
 AND (NEW.method<>'earnings' AND x.reason_code='recovery_settlement'
  OR NEW.method='earnings' AND x.reason_code='recovery_netting_relief' AND EXISTS(SELECT 1 FROM managed_settlement_entries debit JOIN managed_entitlements future ON future.id=debit.entitlement_id
   WHERE debit.id=NEW.managed_debit_id AND debit.type='dispute_adjustment' AND debit.reason_code='recovery_netting_withholding' AND debit.refund_id IS NULL AND debit.amount_paisa=-NEW.amount_paisa AND future.seller_id=c.seller_id)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_recovery_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_fixed_credit_required BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='fixed')
 AND NOT EXISTS(SELECT 1 FROM managed_supplier_recovery_credits x WHERE x.id=NEW.fixed_credit_id AND x.case_id=NEW.case_id AND x.amount_paisa=NEW.amount_paisa
  AND (NEW.method<>'earnings' AND x.kind='settlement'
   OR NEW.method='earnings' AND x.kind='netting_relief' AND EXISTS(SELECT 1 FROM managed_supplier_recovery_credits debit
     WHERE debit.id=NEW.fixed_debit_id AND debit.case_id=NEW.case_id AND debit.kind='netting_withholding' AND debit.amount_paisa=-NEW.amount_paisa)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixed_recovery_native_credit_required'; END IF; END$$
DELIMITER ;
