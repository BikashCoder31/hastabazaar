-- Source only. Apply only to isolated fixtures until a separately authorized cutover.
-- A seller report never creates a bank receipt, allocation or native money entry.
CREATE TABLE seller_recovery_repayment_claims (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id), submitted_by TEXT NOT NULL REFERENCES users(id),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 payment_reference TEXT NOT NULL, claimed_at INTEGER NOT NULL, account_version_id TEXT REFERENCES company_payment_account_versions(id),
 evidence_reference TEXT, note TEXT NOT NULL, fingerprint TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('submitted','needs_evidence','receipt_verified','not_received')),
 revision INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, first_review_due_at INTEGER NOT NULL, next_review_at INTEGER,
 receipt_id TEXT REFERENCES company_money_receipts(id), receipt_revision INTEGER, public_message TEXT,
 reviewed_by TEXT REFERENCES users(id), reviewed_at INTEGER, operation_request_id TEXT NOT NULL UNIQUE,
 UNIQUE(case_id,fingerprint), UNIQUE(receipt_id), CHECK(claimed_at<=created_at), CHECK(first_review_due_at>=created_at),
 CHECK(status IN('submitted','needs_evidence') AND next_review_at IS NOT NULL OR status IN('receipt_verified','not_received') AND next_review_at IS NULL),
 CHECK(status='receipt_verified' AND receipt_id IS NOT NULL AND receipt_revision IS NOT NULL OR status<>'receipt_verified' AND receipt_id IS NULL AND receipt_revision IS NULL)
);
--> statement-breakpoint
CREATE INDEX recovery_claims_case ON seller_recovery_repayment_claims(case_id,created_at);
--> statement-breakpoint
CREATE TRIGGER recovery_claim_original_owner BEFORE INSERT ON seller_recovery_repayment_claims
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id JOIN users u ON u.id=s.user_id
 WHERE c.id=NEW.case_id AND s.user_id=NEW.submitted_by AND json_extract(c.original_source_json,'$.ownerId')=NEW.submitted_by AND u.status='active')
 OR NEW.status<>'submitted' OR NEW.revision<>0 OR NEW.receipt_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'recovery_claim_original_owner_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_claim_original_retained BEFORE UPDATE ON seller_recovery_repayment_claims
WHEN NEW.id IS NOT OLD.id OR NEW.case_id IS NOT OLD.case_id OR NEW.submitted_by IS NOT OLD.submitted_by OR NEW.amount_paisa IS NOT OLD.amount_paisa
 OR NEW.payment_reference IS NOT OLD.payment_reference OR NEW.claimed_at IS NOT OLD.claimed_at OR NEW.account_version_id IS NOT OLD.account_version_id
 OR NEW.evidence_reference IS NOT OLD.evidence_reference OR NEW.note IS NOT OLD.note OR NEW.fingerprint IS NOT OLD.fingerprint
 OR NEW.created_at IS NOT OLD.created_at OR NEW.first_review_due_at IS NOT OLD.first_review_due_at OR NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'recovery_claim_original_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_claim_verified_receipt BEFORE UPDATE ON seller_recovery_repayment_claims
WHEN NEW.status='receipt_verified' AND NOT EXISTS(SELECT 1 FROM company_money_receipts r JOIN company_receipt_controls control ON control.receipt_id=r.id WHERE r.id=NEW.receipt_id AND control.revision=NEW.receipt_revision
 AND r.kind='bank_credit' AND r.status='verified' AND r.currency='NPR' AND r.amount_minor=NEW.amount_paisa AND r.payer_user_id=NEW.submitted_by
 AND (NEW.account_version_id IS NULL OR r.account_version_id=NEW.account_version_id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=r.id AND conflict.user_id=NEW.reviewed_by)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversal WHERE reversal.receipt_id=r.id))
BEGIN SELECT RAISE(ABORT,'recovery_claim_actual_attributed_receipt_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_claim_retained BEFORE DELETE ON seller_recovery_repayment_claims BEGIN SELECT RAISE(ABORT,'recovery_claim_retained'); END;
--> statement-breakpoint
CREATE TABLE seller_recovery_claim_events (
 id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES seller_recovery_repayment_claims(id), revision INTEGER NOT NULL,
 action TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, details_json TEXT NOT NULL CHECK(json_valid(details_json)),
 request_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, UNIQUE(claim_id,revision)
);
--> statement-breakpoint
CREATE TRIGGER recovery_claim_event_immutable BEFORE UPDATE ON seller_recovery_claim_events BEGIN SELECT RAISE(ABORT,'recovery_claim_event_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_claim_event_retained BEFORE DELETE ON seller_recovery_claim_events BEGIN SELECT RAISE(ABORT,'recovery_claim_event_retained'); END;
