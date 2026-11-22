-- Source only; never apply to canonical data merely to pass startup.
CREATE TABLE refund_destination_heads(obligation_id TEXT PRIMARY KEY REFERENCES refund_obligations(id),version_id TEXT,revision INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE refund_destination_versions(
 id TEXT PRIMARY KEY,obligation_id TEXT NOT NULL REFERENCES refund_obligations(id),number INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 0,
 details_json TEXT NOT NULL CHECK(json_valid(details_json)),relationship TEXT NOT NULL CHECK(relationship IN('original_payer','own_account','authorized_nominee')),
 customer_authorization TEXT NOT NULL,evidence_reference TEXT NOT NULL,submitted_by TEXT NOT NULL REFERENCES users(id),session_hash TEXT NOT NULL,authenticated_at INTEGER NOT NULL,created_at INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN('submitted','verified','rejected')),verified_by TEXT REFERENCES users(id),verified_at INTEGER,verification_reference TEXT,
 UNIQUE(obligation_id,number),CHECK(status<>'verified' OR verified_by IS NOT NULL AND verified_at IS NOT NULL AND verification_reference IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE company_funding_accounts(account_id TEXT PRIMARY KEY REFERENCES company_payment_accounts(id),statement_id TEXT,revision INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE company_funding_statements(
 id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES company_payment_accounts(id),account_version_id TEXT NOT NULL REFERENCES company_payment_account_versions(id),
 statement_identity TEXT NOT NULL,as_of INTEGER NOT NULL,cash_paisa INTEGER NOT NULL CHECK(cash_paisa>=0 AND cash_paisa<=9007199254740991),restricted_paisa INTEGER NOT NULL CHECK(restricted_paisa>=0 AND restricted_paisa<=cash_paisa),
 evidence_reference TEXT NOT NULL,restrictions_reference TEXT NOT NULL,verified_by TEXT NOT NULL REFERENCES users(id),recorded_at INTEGER NOT NULL,UNIQUE(account_id,statement_identity)
);
--> statement-breakpoint
CREATE TABLE outgoing_payment_packets(
 id TEXT PRIMARY KEY,obligation_id TEXT NOT NULL REFERENCES refund_obligations(id),funding_statement_id TEXT REFERENCES company_funding_statements(id),account_version_id TEXT REFERENCES company_payment_account_versions(id),
 destination_version_id TEXT REFERENCES refund_destination_versions(id),amount_paisa INTEGER NOT NULL CHECK(amount_paisa>=0 AND amount_paisa<=9007199254740991),currency TEXT NOT NULL CHECK(currency='NPR'),
 state TEXT NOT NULL CHECK(state IN('prepared','approved','processing','uncertain','paid','failed','void')),revision INTEGER NOT NULL DEFAULT 0,
 prepared_by TEXT NOT NULL REFERENCES users(id),approved_by TEXT REFERENCES users(id),started_by TEXT REFERENCES users(id),recorded_by TEXT REFERENCES users(id),
 prepared_at INTEGER NOT NULL,approved_at INTEGER,started_at INTEGER,recorded_at INTEGER,bank_at INTEGER,transaction_identity TEXT,transaction_identity_hash TEXT UNIQUE,evidence_reference TEXT,
 CHECK(amount_paisa=0 OR funding_statement_id IS NOT NULL AND account_version_id IS NOT NULL AND destination_version_id IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX outgoing_one_live_attempt ON outgoing_payment_packets(obligation_id) WHERE state NOT IN('failed','void');
--> statement-breakpoint
CREATE TRIGGER refund_destination_source_retained BEFORE UPDATE ON refund_destination_versions WHEN NEW.id<>OLD.id OR NEW.obligation_id<>OLD.obligation_id OR NEW.number<>OLD.number OR NEW.details_json<>OLD.details_json OR NEW.relationship<>OLD.relationship OR NEW.customer_authorization<>OLD.customer_authorization OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.submitted_by<>OLD.submitted_by OR NEW.session_hash<>OLD.session_hash OR NEW.authenticated_at<>OLD.authenticated_at OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR OLD.status<>'submitted' BEGIN SELECT RAISE(ABORT,'refund_destination_snapshot_retained'); END;
--> statement-breakpoint
CREATE TRIGGER refund_destination_no_delete BEFORE DELETE ON refund_destination_versions BEGIN SELECT RAISE(ABORT,'refund_destination_snapshot_retained'); END;
--> statement-breakpoint
CREATE TRIGGER company_funding_statement_no_update BEFORE UPDATE ON company_funding_statements BEGIN SELECT RAISE(ABORT,'funding_statement_evidence_retained'); END;
--> statement-breakpoint
CREATE TRIGGER company_funding_statement_no_delete BEFORE DELETE ON company_funding_statements BEGIN SELECT RAISE(ABORT,'funding_statement_evidence_retained'); END;
--> statement-breakpoint
CREATE TRIGGER outgoing_packet_snapshot_retained BEFORE UPDATE ON outgoing_payment_packets WHEN NEW.id<>OLD.id OR NEW.obligation_id<>OLD.obligation_id OR NEW.funding_statement_id IS NOT OLD.funding_statement_id OR NEW.account_version_id IS NOT OLD.account_version_id OR NEW.destination_version_id IS NOT OLD.destination_version_id OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.currency<>OLD.currency OR NEW.prepared_by<>OLD.prepared_by OR NEW.prepared_at<>OLD.prepared_at OR NEW.revision<>OLD.revision+1 OR OLD.state IN('paid','failed','void') BEGIN SELECT RAISE(ABORT,'outgoing_packet_snapshot_retained'); END;
--> statement-breakpoint
CREATE TRIGGER outgoing_packet_no_delete BEFORE DELETE ON outgoing_payment_packets BEGIN SELECT RAISE(ABORT,'outgoing_packet_snapshot_retained'); END;

--> statement-breakpoint
CREATE TRIGGER outgoing_packet_ordered_transition BEFORE UPDATE ON outgoing_payment_packets WHEN NOT (
 OLD.state='prepared' AND NEW.state IN('approved','void') OR OLD.state='approved' AND NEW.state IN('processing','void') OR OLD.state IN('processing','uncertain') AND NEW.state IN('uncertain','paid','failed'))
 BEGIN SELECT RAISE(ABORT,'outgoing_packet_transition_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER refund_execution_packet_required BEFORE UPDATE ON refunds WHEN NEW.status<>OLD.status AND NEW.status IN('processing','paid','failed') BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM outgoing_payment_packets p JOIN refund_obligations o ON o.id=p.obligation_id JOIN users u ON u.id=NEW.processed_by JOIN user_roles role ON role.user_id=u.id
  WHERE o.source_kind='return_refund' AND o.source_id=NEW.id AND p.state=NEW.status AND p.amount_paisa=NEW.amount_paisa-NEW.wallet_credit_paisa-NEW.referral_discount_paisa-NEW.promo_discount_paisa
  AND u.status='active' AND role.role='super_admin' AND (CASE WHEN NEW.status='processing' THEN p.started_by ELSE p.recorded_by END)=u.id
  AND (NEW.status<>'paid' OR p.amount_paisa=0 OR p.bank_at IS NOT NULL AND p.transaction_identity_hash IS NOT NULL AND length(p.evidence_reference)>=8))
 THEN RAISE(ABORT,'refund_requires_actual_execution_packet') END;
END;
