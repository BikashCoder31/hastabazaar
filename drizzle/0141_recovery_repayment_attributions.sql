-- Source only. Never apply to the canonical local database during ordinary development.
-- The actual payer remains immutable. A case attribution is evidence, not a money allocation.
CREATE TABLE seller_recovery_repayment_attributions (
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,
 receipt_id TEXT NOT NULL UNIQUE REFERENCES company_money_receipts(id),receipt_revision INTEGER NOT NULL,
 payer_user_id TEXT NOT NULL REFERENCES users(id),owner_user_id TEXT NOT NULL REFERENCES users(id),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL UNIQUE,
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER recovery_repayment_attribution_source BEFORE INSERT ON seller_recovery_repayment_attributions
WHEN length(trim(NEW.evidence_reference))<8 OR length(NEW.evidence_reference)>1500 OR length(trim(NEW.reason))<10 OR length(NEW.reason)>1500 OR length(trim(NEW.public_message))<10 OR length(NEW.public_message)>1500 OR NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id
 JOIN company_money_receipts r ON r.id=NEW.receipt_id JOIN company_receipt_controls control ON control.receipt_id=r.id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.approved_by IS NOT NULL AND c.blocker IS NULL
 AND c.approved_cap_paisa<=c.confirmed_paisa AND c.state IN('open','part_recovered','repayment_plan','disputed') AND seller.user_id=NEW.owner_user_id AND json_extract(c.original_source_json,'$.ownerId')=NEW.owner_user_id
 AND r.kind='bank_credit' AND r.status='verified' AND r.currency='NPR' AND NOT EXISTS(SELECT 1 FROM customer_refund_reversals returned_customer WHERE returned_customer.receipt_id=r.id) AND r.payer_user_id=NEW.payer_user_id AND control.revision=NEW.receipt_revision
 AND actor.status='active' AND actor.id<>NEW.payer_user_id AND actor.id<>NEW.owner_user_id AND actor.id<>COALESCE(json_extract(c.original_source_json,'$.customerId'),'')
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=r.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversal WHERE reversal.receipt_id=r.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews review WHERE review.reversal_id=reversal.id AND review.receipt_id=r.id AND review.amount_paisa=reversal.amount_minor AND review.state='completed'))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.receipt_id=r.id)
 AND NOT EXISTS(SELECT 1 FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released')
 AND NEW.amount_paisa<=r.amount_minor-COALESCE((SELECT SUM(reversal.amount_minor) FROM company_receipt_reversals reversal WHERE reversal.receipt_id=r.id),0) AND NEW.amount_paisa<=c.approved_cap_paisa-c.absorbed_paisa-c.disputed_paisa-c.historical_recovered_paisa+c.restored_paisa-COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_repayment_attribution_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_repayment_attribution_immutable BEFORE UPDATE ON seller_recovery_repayment_attributions BEGIN SELECT RAISE(ABORT,'recovery_repayment_attribution_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_repayment_attribution_retained BEFORE DELETE ON seller_recovery_repayment_attributions BEGIN SELECT RAISE(ABORT,'recovery_repayment_attribution_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_cash_attribution_required BEFORE INSERT ON seller_recovery_allocations
WHEN NEW.method='cash' AND NOT EXISTS(SELECT 1 FROM company_money_receipts r JOIN seller_recovery_cases c ON c.id=NEW.case_id WHERE r.id=NEW.receipt_id
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id AND t.case_id<>c.id)
 AND ((r.payer_user_id=json_extract(c.original_source_json,'$.ownerId') AND NOT EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id))
 OR EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id AND t.case_id=c.id AND t.owner_user_id=json_extract(c.original_source_json,'$.ownerId') AND t.payer_user_id=r.payer_user_id
 AND NEW.amount_paisa<=t.amount_paisa-COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0))))
BEGIN SELECT RAISE(ABORT,'recovery_cash_original_or_attributed_payer_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_attributed_receipt_use BEFORE INSERT ON manual_receipt_uses
WHEN EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=NEW.receipt_id) AND NEW.kind<>'return'
BEGIN SELECT RAISE(ABORT,'recovery_attributed_receipt_original_payer_return_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_attributed_receipt_case BEFORE INSERT ON seller_recovery_allocations
WHEN EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=NEW.receipt_id AND (t.case_id<>NEW.case_id OR NEW.method<>'cash'))
BEGIN SELECT RAISE(ABORT,'recovery_attributed_receipt_original_case_required'); END;
--> statement-breakpoint
DROP TRIGGER recovery_claim_verified_receipt;
--> statement-breakpoint
CREATE TRIGGER recovery_claim_verified_receipt BEFORE UPDATE ON seller_recovery_repayment_claims
WHEN NEW.status='receipt_verified' AND NOT EXISTS(SELECT 1 FROM company_money_receipts r JOIN company_receipt_controls control ON control.receipt_id=r.id WHERE r.id=NEW.receipt_id AND control.revision=NEW.receipt_revision
 AND r.kind='bank_credit' AND r.status='verified' AND r.currency='NPR'
 AND ((r.payer_user_id=NEW.submitted_by AND r.amount_minor=NEW.amount_paisa AND NOT EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id AND t.case_id<>NEW.case_id))
 OR EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id AND t.case_id=NEW.case_id AND t.owner_user_id=NEW.submitted_by AND t.payer_user_id=r.payer_user_id AND (r.amount_minor=NEW.amount_paisa OR t.amount_paisa>=NEW.amount_paisa AND r.amount_minor>=NEW.amount_paisa)))
 AND (NEW.account_version_id IS NULL OR r.account_version_id=NEW.account_version_id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=r.id AND conflict.user_id=NEW.reviewed_by)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversal WHERE reversal.receipt_id=r.id))
BEGIN SELECT RAISE(ABORT,'recovery_claim_actual_attributed_receipt_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_attributed_receipt_customer_return BEFORE INSERT ON customer_refund_reversals
WHEN EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=NEW.receipt_id)
BEGIN SELECT RAISE(ABORT,'recovery_attributed_receipt_original_case_required'); END;
