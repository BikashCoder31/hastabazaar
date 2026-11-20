-- Source only. Never apply to the canonical database to pass startup.
ALTER TABLE seller_recovery_cases ADD COLUMN liability_reduced_paisa INTEGER NOT NULL DEFAULT 0 CHECK(liability_reduced_paisa>=0 AND liability_reduced_paisa<=9007199254740991);
--> statement-breakpoint
ALTER TABLE seller_recovery_cases ADD COLUMN restored_paisa INTEGER NOT NULL DEFAULT 0 CHECK(restored_paisa>=0 AND restored_paisa<=9007199254740991);
--> statement-breakpoint
CREATE TABLE seller_recovery_liability_corrections (
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,
 old_confirmed_paisa INTEGER NOT NULL,new_confirmed_paisa INTEGER NOT NULL,
 old_absorbed_paisa INTEGER NOT NULL,new_absorbed_paisa INTEGER NOT NULL,
 native_credit_paisa INTEGER NOT NULL,restored_paisa INTEGER NOT NULL,
 registered_credit_id TEXT UNIQUE REFERENCES seller_ledger_entries(id),managed_credit_id TEXT UNIQUE REFERENCES managed_settlement_entries(id),
 fixed_obligation_id TEXT REFERENCES managed_supplier_obligations(id),
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,review_due_at INTEGER NOT NULL,
 UNIQUE(case_id,case_revision),
 CHECK(new_confirmed_paisa>=0 AND new_confirmed_paisa<old_confirmed_paisa AND old_confirmed_paisa<=9007199254740991),
 CHECK(old_absorbed_paisa>=0 AND old_absorbed_paisa<=old_confirmed_paisa AND new_absorbed_paisa=CASE WHEN old_absorbed_paisa<new_confirmed_paisa THEN old_absorbed_paisa ELSE new_confirmed_paisa END),
 CHECK(native_credit_paisa=old_confirmed_paisa-old_absorbed_paisa-new_confirmed_paisa+new_absorbed_paisa),
 CHECK(restored_paisa>=0 AND restored_paisa<=native_credit_paisa)
);
--> statement-breakpoint
CREATE INDEX recovery_correction_fixed_source ON seller_recovery_liability_corrections(fixed_obligation_id);
--> statement-breakpoint
CREATE TABLE seller_recovery_restorations (
 id TEXT PRIMARY KEY,correction_id TEXT NOT NULL REFERENCES seller_recovery_liability_corrections(id),case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),
 allocation_id TEXT REFERENCES seller_recovery_allocations(id),method TEXT NOT NULL CHECK(method IN('cash','earnings','returned_payout','carrier')),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 UNIQUE(correction_id,allocation_id),CHECK(allocation_id IS NOT NULL OR method='earnings')
);
--> statement-breakpoint
CREATE UNIQUE INDEX recovery_historical_restoration_once ON seller_recovery_restorations(correction_id) WHERE allocation_id IS NULL;
--> statement-breakpoint
CREATE INDEX recovery_restored_allocation ON seller_recovery_restorations(allocation_id);
--> statement-breakpoint
CREATE TRIGGER recovery_correction_current_source BEFORE INSERT ON seller_recovery_liability_corrections
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision
 AND c.confirmed_paisa=NEW.old_confirmed_paisa AND c.absorbed_paisa=NEW.old_absorbed_paisa AND c.blocker IS NULL
 AND NEW.restored_paisa=MAX(0,c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa-NEW.new_confirmed_paisa+NEW.new_absorbed_paisa)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (r.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals v WHERE v.receipt_id=r.id)))
 AND (
  c.payout_model='registered' AND NEW.managed_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL AND
   (NEW.native_credit_paisa=0 AND NEW.registered_credit_id IS NULL OR EXISTS(SELECT 1 FROM seller_ledger_entries e WHERE e.id=NEW.registered_credit_id AND e.seller_id=c.seller_id AND e.type='recovery_correction' AND e.refund_id IS NULL AND e.amount_paisa=NEW.native_credit_paisa))
  OR c.payout_model='managed' AND NEW.registered_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL AND
   (NEW.native_credit_paisa=0 AND NEW.managed_credit_id IS NULL OR EXISTS(SELECT 1 FROM managed_settlement_entries e JOIN managed_entitlements entitlement ON entitlement.id=e.entitlement_id WHERE e.id=NEW.managed_credit_id AND entitlement.seller_id=c.seller_id AND e.refund_id=c.refund_id AND e.reason_code='recovery_correction' AND e.type='dispute_adjustment' AND e.amount_paisa=NEW.native_credit_paisa))
  OR c.payout_model='fixed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL AND EXISTS(SELECT 1 FROM managed_supplier_adjustments a JOIN managed_supplier_obligations o ON o.id=a.obligation_id WHERE a.id=c.supplier_adjustment_id AND o.id=NEW.fixed_obligation_id AND o.seller_id=c.seller_id)
 ))
BEGIN SELECT RAISE(ABORT,'recovery_correction_current_original_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_restoration_source BEFORE INSERT ON seller_recovery_restorations
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections correction JOIN seller_recovery_cases c ON c.id=correction.case_id
 WHERE correction.id=NEW.correction_id AND c.id=NEW.case_id AND c.revision=correction.case_revision
 AND NEW.amount_paisa<=correction.restored_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.correction_id=correction.id),0)
 AND (NEW.allocation_id IS NULL AND NEW.method='earnings' AND NEW.amount_paisa<=c.historical_recovered_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.case_id=c.id AND r.allocation_id IS NULL),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.case_id=c.id AND a.method=NEW.method AND NEW.amount_paisa<=a.amount_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.allocation_id=a.id),0))))
BEGIN SELECT RAISE(ABORT,'recovery_restoration_original_collection_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_correction_projection BEFORE UPDATE ON seller_recovery_cases
WHEN NEW.liability_reduced_paisa<>COALESCE((SELECT SUM(x.old_confirmed_paisa-x.new_confirmed_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)
 OR NEW.restored_paisa<>COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id AND x.restored_paisa<>COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.correction_id=x.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_correction_complete_projection_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_correction_immutable BEFORE UPDATE ON seller_recovery_liability_corrections BEGIN SELECT RAISE(ABORT,'recovery_correction_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_correction_retained BEFORE DELETE ON seller_recovery_liability_corrections BEGIN SELECT RAISE(ABORT,'recovery_correction_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_restoration_immutable BEFORE UPDATE ON seller_recovery_restorations BEGIN SELECT RAISE(ABORT,'recovery_restoration_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_restoration_retained BEFORE DELETE ON seller_recovery_restorations BEGIN SELECT RAISE(ABORT,'recovery_restoration_retained'); END;
--> statement-breakpoint
DROP TRIGGER recovery_allocation_cap;
--> statement-breakpoint
CREATE TRIGGER recovery_allocation_cap BEFORE INSERT ON seller_recovery_allocations
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id
 AND c.state IN('open','part_recovered','repayment_plan','disputed') AND c.blocker IS NULL
 AND c.approved_by IS NOT NULL AND c.approved_cap_paisa<=c.confirmed_paisa
 AND NEW.amount_paisa<=c.approved_cap_paisa-c.absorbed_paisa-c.disputed_paisa-c.historical_recovered_paisa+c.restored_paisa
 -COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_remaining_cap_exceeded'); END;

--> statement-breakpoint
DROP TRIGGER recovery_reduction_cap;
--> statement-breakpoint
CREATE TRIGGER recovery_reduction_cap BEFORE INSERT ON seller_recovery_reductions
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.blocker IS NULL
 AND c.approved_by IS NOT NULL AND c.state IN('open','part_recovered','disputed','repayment_plan')
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.historical_recovered_paisa+c.restored_paisa
 -COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_reduction_remaining_cap_exceeded'); END;
