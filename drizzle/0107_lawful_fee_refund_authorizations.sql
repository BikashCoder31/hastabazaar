-- Additive source; apply only to disposable validation fixtures during this work.
CREATE TABLE lawful_fee_refund_authorizations(
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),customer_id TEXT NOT NULL REFERENCES users(id),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 legal_basis TEXT NOT NULL,case_reference TEXT NOT NULL,evidence_reference TEXT NOT NULL,
 source_snapshot_json TEXT NOT NULL CHECK(json_valid(source_snapshot_json)),
 authorized_by TEXT NOT NULL REFERENCES users(id),authorized_at INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'authorized' CHECK(state IN('authorized','paid')),
 UNIQUE(order_id,case_reference)
);
--> statement-breakpoint
CREATE TRIGGER lawful_fee_authorization_retained BEFORE UPDATE ON lawful_fee_refund_authorizations
 WHEN NEW.id<>OLD.id OR NEW.order_id<>OLD.order_id OR NEW.customer_id<>OLD.customer_id
 OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.legal_basis<>OLD.legal_basis OR NEW.case_reference<>OLD.case_reference
 OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.source_snapshot_json<>OLD.source_snapshot_json
 OR NEW.authorized_by<>OLD.authorized_by OR NEW.authorized_at<>OLD.authorized_at OR OLD.state<>'authorized' OR NEW.state<>'paid'
 BEGIN SELECT RAISE(ABORT,'original_fee_authorization_retained'); END;
--> statement-breakpoint
CREATE TRIGGER lawful_fee_authorization_no_delete BEFORE DELETE ON lawful_fee_refund_authorizations
 BEGIN SELECT RAISE(ABORT,'original_fee_authorization_retained'); END;
