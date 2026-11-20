-- Source only: execute only in isolated fixtures unless a separate cutover is authorized.
CREATE TABLE seller_recovery_allocations (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),
 method TEXT NOT NULL CHECK(method IN('cash','earnings','returned_payout','carrier')),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 receipt_id TEXT REFERENCES company_money_receipts(id),
 registered_credit_id TEXT UNIQUE REFERENCES seller_ledger_entries(id),
 managed_credit_id TEXT UNIQUE REFERENCES managed_settlement_entries(id),
 evidence_reference TEXT NOT NULL, reason TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL,
 CHECK(method='earnings' AND receipt_id IS NULL OR method<>'earnings' AND receipt_id IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX recovery_receipt_allocations ON seller_recovery_allocations(receipt_id);
--> statement-breakpoint
CREATE INDEX recovery_case_allocations ON seller_recovery_allocations(case_id);
--> statement-breakpoint
CREATE TRIGGER recovery_allocation_cap BEFORE INSERT ON seller_recovery_allocations
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id
 AND c.state IN('open','part_recovered','repayment_plan','disputed') AND c.blocker IS NULL
 AND c.approved_by IS NOT NULL AND c.approved_cap_paisa<=c.confirmed_paisa
 AND NEW.amount_paisa<=c.approved_cap_paisa-c.absorbed_paisa-c.disputed_paisa-c.historical_recovered_paisa
 -COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_remaining_cap_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_cap BEFORE INSERT ON seller_recovery_allocations
WHEN NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id
 AND r.status='verified' AND r.currency='NPR'
 AND NOT EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.receipt_id=r.id AND e.kind='receipt_reversal' AND e.state<>'resolved')
 AND NEW.amount_paisa<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)
 -COALESCE((SELECT SUM(u.amount_minor) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)
 -COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_receipt_balance_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER manual_receipt_recovery_cap BEFORE INSERT ON manual_receipt_uses
WHEN NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id
 AND NEW.amount_minor<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)
 -COALESCE((SELECT SUM(u.amount_minor) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)
 -COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0))
BEGIN SELECT RAISE(ABORT,'manual_receipt_recovery_balance_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_native_credit_required BEFORE INSERT ON seller_recovery_allocations
WHEN EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_ledger_entries e ON e.id=NEW.registered_credit_id
 WHERE c.id=NEW.case_id AND e.seller_id=c.seller_id AND e.amount_paisa=NEW.amount_paisa AND e.type='recovery_settlement' AND e.refund_id IS NULL)
BEGIN SELECT RAISE(ABORT,'recovery_original_native_settlement_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_allocation_immutable BEFORE UPDATE ON seller_recovery_allocations
BEGIN SELECT RAISE(ABORT,'recovery_allocation_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_allocation_retained BEFORE DELETE ON seller_recovery_allocations
BEGIN SELECT RAISE(ABORT,'recovery_allocation_history_retained'); END;
--> statement-breakpoint
CREATE TABLE seller_recovery_reductions (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 registered_credit_id TEXT UNIQUE REFERENCES seller_ledger_entries(id), managed_credit_id TEXT UNIQUE REFERENCES managed_settlement_entries(id),
 evidence_reference TEXT NOT NULL, reason TEXT NOT NULL, collection_attempts TEXT NOT NULL,
 approved_by TEXT NOT NULL REFERENCES users(id), request_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER recovery_reduction_cap BEFORE INSERT ON seller_recovery_reductions
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.blocker IS NULL
 AND c.approved_by IS NOT NULL AND c.state IN('open','part_recovered','disputed','repayment_plan')
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.historical_recovered_paisa
 -COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_reduction_remaining_cap_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_reduction_credit BEFORE INSERT ON seller_recovery_reductions
WHEN EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_ledger_entries e ON e.id=NEW.registered_credit_id
 WHERE c.id=NEW.case_id AND e.seller_id=c.seller_id AND e.amount_paisa=NEW.amount_paisa AND e.type='recovery_absorption' AND e.refund_id IS NULL)
BEGIN SELECT RAISE(ABORT,'recovery_absorption_native_credit_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_reduction_immutable BEFORE UPDATE ON seller_recovery_reductions
BEGIN SELECT RAISE(ABORT,'recovery_reduction_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_reduction_retained BEFORE DELETE ON seller_recovery_reductions
BEGIN SELECT RAISE(ABORT,'recovery_reduction_history_retained'); END;
