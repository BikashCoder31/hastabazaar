-- Source-only case-specific consent. No historic agreement is reinterpreted.
CREATE TABLE seller_recovery_proposals (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id), case_revision INTEGER NOT NULL,
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id), payout_model TEXT NOT NULL CHECK(payout_model IN('registered','managed','fixed')),
 currency TEXT NOT NULL CHECK(currency='NPR'), amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 identity_revision INTEGER NOT NULL CHECK(identity_revision>=0), source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 installments_json TEXT NOT NULL CHECK(json_valid(installments_json)), netting_authorized INTEGER NOT NULL CHECK(netting_authorized IN(0,1)),
 accepted_terms_json TEXT NOT NULL CHECK(json_valid(accepted_terms_json)), terms_digest TEXT NOT NULL CHECK(length(terms_digest)=64),
 contact_details TEXT NOT NULL, next_review_at INTEGER NOT NULL, accepted_by TEXT NOT NULL REFERENCES users(id), accepted_at INTEGER NOT NULL,
 request_id TEXT NOT NULL UNIQUE, UNIQUE(case_id,case_revision)
);
--> statement-breakpoint
CREATE TRIGGER recovery_proposal_immutable BEFORE UPDATE ON seller_recovery_proposals BEGIN SELECT RAISE(ABORT,'recovery_agreement_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_proposal_retained BEFORE DELETE ON seller_recovery_proposals BEGIN SELECT RAISE(ABORT,'recovery_agreement_history_retained'); END;
--> statement-breakpoint
ALTER TABLE seller_recovery_allocations ADD COLUMN registered_debit_id TEXT REFERENCES seller_ledger_entries(id);
--> statement-breakpoint
CREATE UNIQUE INDEX recovery_netting_debit_once ON seller_recovery_allocations(registered_debit_id);
--> statement-breakpoint
DROP TRIGGER recovery_native_credit_required;
--> statement-breakpoint
CREATE TRIGGER recovery_native_credit_required BEFORE INSERT ON seller_recovery_allocations
WHEN EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_ledger_entries e ON e.id=NEW.registered_credit_id
 WHERE c.id=NEW.case_id AND e.seller_id=c.seller_id AND e.amount_paisa=NEW.amount_paisa AND e.refund_id IS NULL
 AND (NEW.method<>'earnings' AND e.type='recovery_settlement' AND NEW.registered_debit_id IS NULL
  OR NEW.method='earnings' AND e.type='recovery_netting_relief'
   AND EXISTS(SELECT 1 FROM seller_ledger_entries d WHERE d.id=NEW.registered_debit_id AND d.seller_id=c.seller_id AND d.amount_paisa=-NEW.amount_paisa AND d.type='recovery_netting_withholding' AND d.refund_id IS NULL)))
BEGIN SELECT RAISE(ABORT,'recovery_original_native_settlement_required'); END;
