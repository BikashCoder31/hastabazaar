-- Execution evidence wraps native contractual payouts; it never creates another entitlement.
CREATE TABLE payout_transfer_packets (
 id TEXT PRIMARY KEY, payout_model TEXT NOT NULL CHECK(payout_model IN('registered','managed','fixed')),
 registered_payout_id TEXT REFERENCES payouts(id), managed_payout_id TEXT REFERENCES managed_payouts(id), supplier_payment_id TEXT REFERENCES managed_supplier_payments(id),
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id), beneficiary_version_id TEXT NOT NULL REFERENCES seller_beneficiary_versions(id),
 identity_revision INTEGER NOT NULL, bank_revision INTEGER NOT NULL, source_snapshot_json TEXT NOT NULL CHECK(json_valid(source_snapshot_json)),
 account_version_id TEXT NOT NULL REFERENCES company_payment_account_versions(id), funding_statement_id TEXT NOT NULL REFERENCES company_funding_statements(id),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 state TEXT NOT NULL DEFAULT 'prepared' CHECK(state IN('prepared','approved','processing','uncertain','paid','failed','void')), revision INTEGER NOT NULL DEFAULT 0,
 prepared_by TEXT NOT NULL REFERENCES users(id), prepared_at INTEGER NOT NULL,
 approved_by TEXT REFERENCES users(id), approved_at INTEGER, started_by TEXT REFERENCES users(id), started_at INTEGER,
 recorded_by TEXT REFERENCES users(id), recorded_at INTEGER, bank_at INTEGER, transaction_identity TEXT, transaction_identity_hash TEXT UNIQUE,
 evidence_reference TEXT, failure_basis TEXT CHECK(failure_basis IN('not_sent','no_debit','debit_returned')),
 CHECK(payout_model='registered' AND registered_payout_id IS NOT NULL AND managed_payout_id IS NULL AND supplier_payment_id IS NULL OR payout_model='managed' AND registered_payout_id IS NULL AND managed_payout_id IS NOT NULL AND supplier_payment_id IS NULL OR payout_model='fixed' AND registered_payout_id IS NULL AND managed_payout_id IS NULL AND supplier_payment_id IS NOT NULL),
 CHECK(state NOT IN('approved','processing','uncertain','paid','failed') OR approved_by IS NOT NULL AND approved_at IS NOT NULL),
 CHECK(state NOT IN('processing','uncertain','paid','failed') OR started_by IS NOT NULL AND started_at IS NOT NULL),
 CHECK(state NOT IN('uncertain','paid','failed','void') OR recorded_by IS NOT NULL AND recorded_at IS NOT NULL AND length(evidence_reference)>=8),
 CHECK(state<>'paid' OR bank_at IS NOT NULL AND transaction_identity IS NOT NULL AND transaction_identity_hash IS NOT NULL),
 CHECK(state<>'failed' OR failure_basis IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX payout_transfer_one_registered ON payout_transfer_packets(registered_payout_id) WHERE state NOT IN('failed','void');
--> statement-breakpoint
CREATE UNIQUE INDEX payout_transfer_one_managed ON payout_transfer_packets(managed_payout_id) WHERE state NOT IN('failed','void');
--> statement-breakpoint
CREATE UNIQUE INDEX payout_transfer_one_fixed ON payout_transfer_packets(supplier_payment_id) WHERE state NOT IN('failed','void');
--> statement-breakpoint
CREATE TRIGGER payout_transfer_source_retained BEFORE UPDATE ON payout_transfer_packets WHEN NEW.id IS NOT OLD.id OR NEW.payout_model IS NOT OLD.payout_model OR NEW.registered_payout_id IS NOT OLD.registered_payout_id OR NEW.managed_payout_id IS NOT OLD.managed_payout_id OR NEW.supplier_payment_id IS NOT OLD.supplier_payment_id OR NEW.seller_id IS NOT OLD.seller_id OR NEW.beneficiary_version_id IS NOT OLD.beneficiary_version_id OR NEW.identity_revision IS NOT OLD.identity_revision OR NEW.bank_revision IS NOT OLD.bank_revision OR NEW.source_snapshot_json IS NOT OLD.source_snapshot_json OR NEW.account_version_id IS NOT OLD.account_version_id OR NEW.funding_statement_id IS NOT OLD.funding_statement_id OR NEW.amount_paisa IS NOT OLD.amount_paisa OR NEW.prepared_by IS NOT OLD.prepared_by OR NEW.prepared_at IS NOT OLD.prepared_at OR NEW.revision<>OLD.revision+1 OR OLD.started_at IS NOT NULL AND (NEW.started_at IS NOT OLD.started_at OR NEW.started_by IS NOT OLD.started_by) OR OLD.approved_at IS NOT NULL AND (NEW.approved_at IS NOT OLD.approved_at OR NEW.approved_by IS NOT OLD.approved_by) BEGIN SELECT RAISE(ABORT,'payout_transfer_source_retained'); END;
--> statement-breakpoint
CREATE TRIGGER payout_transfer_retained BEFORE DELETE ON payout_transfer_packets BEGIN SELECT RAISE(ABORT,'payout_transfer_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER payout_transfer_transition BEFORE UPDATE ON payout_transfer_packets WHEN NOT(OLD.state='prepared' AND NEW.state IN('approved','void') OR OLD.state='approved' AND NEW.state IN('processing','void') OR OLD.state IN('processing','uncertain') AND NEW.state IN('uncertain','paid','failed')) BEGIN SELECT RAISE(ABORT,'payout_transfer_transition_conflict'); END;
--> statement-breakpoint
CREATE TABLE company_outgoing_bank_identities (
 identity_hash TEXT PRIMARY KEY CHECK(length(identity_hash)=64), packet_kind TEXT NOT NULL CHECK(packet_kind IN('refund','payout')), packet_id TEXT NOT NULL,
 account_version_id TEXT NOT NULL REFERENCES company_payment_account_versions(id), transaction_identity TEXT NOT NULL, amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0), bank_at INTEGER NOT NULL, recorded_at INTEGER NOT NULL,
 UNIQUE(packet_kind,packet_id)
);
--> statement-breakpoint
INSERT INTO company_outgoing_bank_identities(identity_hash,packet_kind,packet_id,account_version_id,transaction_identity,amount_paisa,bank_at,recorded_at)
 SELECT transaction_identity_hash,'refund',id,account_version_id,transaction_identity,amount_paisa,bank_at,recorded_at FROM outgoing_payment_packets WHERE state='paid' AND amount_paisa>0;
--> statement-breakpoint
CREATE TRIGGER outgoing_bank_identity_retained BEFORE UPDATE ON company_outgoing_bank_identities BEGIN SELECT RAISE(ABORT,'actual_bank_identity_retained'); END;
--> statement-breakpoint
CREATE TRIGGER outgoing_bank_identity_no_delete BEFORE DELETE ON company_outgoing_bank_identities BEGIN SELECT RAISE(ABORT,'actual_bank_identity_retained'); END;
--> statement-breakpoint
CREATE TRIGGER refund_actual_bank_identity BEFORE UPDATE ON outgoing_payment_packets WHEN NEW.state='paid' AND NEW.amount_paisa>0 AND NOT EXISTS(SELECT 1 FROM company_outgoing_bank_identities b WHERE b.identity_hash=NEW.transaction_identity_hash AND b.packet_kind='refund' AND b.packet_id=NEW.id AND b.account_version_id=NEW.account_version_id AND b.amount_paisa=NEW.amount_paisa AND b.bank_at=NEW.bank_at AND b.transaction_identity=NEW.transaction_identity) BEGIN SELECT RAISE(ABORT,'refund_actual_bank_identity_required'); END;
--> statement-breakpoint
CREATE TRIGGER payout_actual_bank_identity BEFORE UPDATE ON payout_transfer_packets WHEN NEW.state='paid' AND NOT EXISTS(SELECT 1 FROM company_outgoing_bank_identities b WHERE b.identity_hash=NEW.transaction_identity_hash AND b.packet_kind='payout' AND b.packet_id=NEW.id AND b.account_version_id=NEW.account_version_id AND b.amount_paisa=NEW.amount_paisa AND b.bank_at=NEW.bank_at AND b.transaction_identity=NEW.transaction_identity) BEGIN SELECT RAISE(ABORT,'payout_actual_bank_identity_required'); END;
--> statement-breakpoint
CREATE TRIGGER registered_actual_execution_packet BEFORE UPDATE ON payouts WHEN NEW.status<>OLD.status AND NEW.status IN('processing','paid','failed') AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets p JOIN users u ON u.id=NEW.processed_by JOIN user_roles r ON r.user_id=u.id WHERE p.registered_payout_id=NEW.id AND p.state=NEW.status AND p.amount_paisa=NEW.amount_paisa AND u.status='active' AND r.role='super_admin' AND (CASE WHEN NEW.status='processing' THEN p.started_by ELSE p.recorded_by END)=u.id) BEGIN SELECT RAISE(ABORT,'payout_requires_actual_execution_packet'); END;
