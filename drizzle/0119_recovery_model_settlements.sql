-- Source only. Explicit same-model native settlement; no invented supplier defect adjustment.
CREATE TABLE managed_supplier_recovery_credits (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id), obligation_id TEXT NOT NULL REFERENCES managed_supplier_obligations(id),
 kind TEXT NOT NULL CHECK(kind IN('settlement','absorption','netting_relief','netting_withholding')),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa<>0 AND amount_paisa>=-9007199254740991 AND amount_paisa<=9007199254740991),
 actor_id TEXT NOT NULL REFERENCES users(id), request_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL,
 CHECK(kind='netting_withholding' AND amount_paisa<0 OR kind<>'netting_withholding' AND amount_paisa>0)
);
--> statement-breakpoint
CREATE INDEX fixed_recovery_obligation ON managed_supplier_recovery_credits(obligation_id);
--> statement-breakpoint
CREATE TRIGGER fixed_recovery_credit_source BEFORE INSERT ON managed_supplier_recovery_credits
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN managed_supplier_adjustments a ON a.id=c.supplier_adjustment_id JOIN managed_supplier_obligations o ON o.id=NEW.obligation_id
 WHERE c.id=NEW.case_id AND c.payout_model='fixed' AND c.seller_id=o.seller_id AND c.currency='NPR'
 AND (NEW.kind='netting_withholding' OR a.obligation_id=o.id))
BEGIN SELECT RAISE(ABORT,'fixed_recovery_original_model_required'); END;
--> statement-breakpoint
CREATE TRIGGER fixed_recovery_credit_immutable BEFORE UPDATE ON managed_supplier_recovery_credits BEGIN SELECT RAISE(ABORT,'fixed_recovery_credit_retained'); END;
--> statement-breakpoint
CREATE TRIGGER fixed_recovery_credit_retained BEFORE DELETE ON managed_supplier_recovery_credits BEGIN SELECT RAISE(ABORT,'fixed_recovery_credit_retained'); END;
--> statement-breakpoint
ALTER TABLE seller_recovery_allocations ADD COLUMN fixed_credit_id TEXT REFERENCES managed_supplier_recovery_credits(id);
--> statement-breakpoint
ALTER TABLE seller_recovery_reductions ADD COLUMN fixed_credit_id TEXT REFERENCES managed_supplier_recovery_credits(id);
--> statement-breakpoint
CREATE UNIQUE INDEX recovery_fixed_allocation_credit_once ON seller_recovery_allocations(fixed_credit_id);
--> statement-breakpoint
CREATE UNIQUE INDEX recovery_fixed_reduction_credit_once ON seller_recovery_reductions(fixed_credit_id);
--> statement-breakpoint
CREATE TRIGGER recovery_native_model_shape BEFORE INSERT ON seller_recovery_allocations
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND (
 c.payout_model='registered' AND NEW.registered_credit_id IS NOT NULL AND NEW.managed_credit_id IS NULL AND NEW.fixed_credit_id IS NULL
 OR c.payout_model='managed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NOT NULL AND NEW.fixed_credit_id IS NULL AND NEW.registered_debit_id IS NULL
 OR c.payout_model='fixed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL AND NEW.fixed_credit_id IS NOT NULL AND NEW.registered_debit_id IS NULL))
BEGIN SELECT RAISE(ABORT,'recovery_one_original_native_model_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_reduction_model_shape BEFORE INSERT ON seller_recovery_reductions
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND (
 c.payout_model='registered' AND NEW.registered_credit_id IS NOT NULL AND NEW.managed_credit_id IS NULL AND NEW.fixed_credit_id IS NULL
 OR c.payout_model='managed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NOT NULL AND NEW.fixed_credit_id IS NULL
 OR c.payout_model='fixed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL AND NEW.fixed_credit_id IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'recovery_one_original_reduction_model_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_managed_credit_required BEFORE INSERT ON seller_recovery_allocations
WHEN EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN managed_settlement_entries x ON x.id=NEW.managed_credit_id JOIN managed_entitlements e ON e.id=x.entitlement_id
 WHERE c.id=NEW.case_id AND e.seller_id=c.seller_id AND x.refund_id=c.refund_id AND x.type='dispute_adjustment' AND x.reason_code='recovery_settlement' AND x.amount_paisa=NEW.amount_paisa
 AND EXISTS(SELECT 1 FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN managed_commercial_snapshots snapshot ON snapshot.id=e.snapshot_id WHERE r.id=c.refund_id AND request.order_item_id=snapshot.order_item_id))
BEGIN SELECT RAISE(ABORT,'managed_recovery_native_credit_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_fixed_credit_required BEFORE INSERT ON seller_recovery_allocations
WHEN EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='fixed')
 AND NOT EXISTS(SELECT 1 FROM managed_supplier_recovery_credits x WHERE x.id=NEW.fixed_credit_id AND x.case_id=NEW.case_id AND x.kind='settlement' AND x.amount_paisa=NEW.amount_paisa)
BEGIN SELECT RAISE(ABORT,'fixed_recovery_native_credit_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_managed_reduction_credit BEFORE INSERT ON seller_recovery_reductions
WHEN EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN managed_settlement_entries x ON x.id=NEW.managed_credit_id JOIN managed_entitlements e ON e.id=x.entitlement_id
 WHERE c.id=NEW.case_id AND e.seller_id=c.seller_id AND x.refund_id=c.refund_id AND x.type='dispute_adjustment' AND x.reason_code='recovery_absorption' AND x.amount_paisa=NEW.amount_paisa
 AND EXISTS(SELECT 1 FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN managed_commercial_snapshots snapshot ON snapshot.id=e.snapshot_id WHERE r.id=c.refund_id AND request.order_item_id=snapshot.order_item_id))
BEGIN SELECT RAISE(ABORT,'managed_recovery_absorption_credit_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_fixed_reduction_credit BEFORE INSERT ON seller_recovery_reductions
WHEN EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='fixed')
 AND NOT EXISTS(SELECT 1 FROM managed_supplier_recovery_credits x WHERE x.id=NEW.fixed_credit_id AND x.case_id=NEW.case_id AND x.kind='absorption' AND x.amount_paisa=NEW.amount_paisa)
BEGIN SELECT RAISE(ABORT,'fixed_recovery_absorption_credit_required'); END;
