-- Source parity for 0114_payout_transfer_packets. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE payout_transfer_packets(
 id VARCHAR(191) PRIMARY KEY, payout_model VARCHAR(191) NOT NULL CHECK(payout_model IN('registered','managed','fixed')),
 registered_payout_id VARCHAR(191) REFERENCES payouts(id), managed_payout_id VARCHAR(191) REFERENCES managed_payouts(id), supplier_payment_id VARCHAR(191) REFERENCES managed_supplier_payments(id),
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id), beneficiary_version_id VARCHAR(191) NOT NULL REFERENCES seller_beneficiary_versions(id),
 identity_revision BIGINT NOT NULL, bank_revision BIGINT NOT NULL, source_snapshot_json LONGTEXT NOT NULL CHECK(json_valid(source_snapshot_json)),
 account_version_id VARCHAR(191) NOT NULL REFERENCES company_payment_account_versions(id), funding_statement_id VARCHAR(191) NOT NULL REFERENCES company_funding_statements(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 state VARCHAR(191) NOT NULL DEFAULT 'prepared' CHECK(state IN('prepared','approved','processing','uncertain','paid','failed','void')), revision BIGINT NOT NULL DEFAULT 0,
 prepared_by VARCHAR(191) NOT NULL REFERENCES users(id), prepared_at BIGINT NOT NULL,
 approved_by VARCHAR(191) REFERENCES users(id), approved_at BIGINT, started_by VARCHAR(191) REFERENCES users(id), started_at BIGINT,
 recorded_by VARCHAR(191) REFERENCES users(id), recorded_at BIGINT, bank_at BIGINT, transaction_identity VARCHAR(191), transaction_identity_hash VARCHAR(191) UNIQUE,
 evidence_reference LONGTEXT, failure_basis VARCHAR(191) CHECK(failure_basis IN('not_sent','no_debit','debit_returned')),
 CHECK(payout_model='registered' AND registered_payout_id IS NOT NULL AND managed_payout_id IS NULL AND supplier_payment_id IS NULL OR payout_model='managed' AND registered_payout_id IS NULL AND managed_payout_id IS NOT NULL AND supplier_payment_id IS NULL OR payout_model='fixed' AND registered_payout_id IS NULL AND managed_payout_id IS NULL AND supplier_payment_id IS NOT NULL),
 CHECK(state NOT IN('approved','processing','uncertain','paid','failed') OR approved_by IS NOT NULL AND approved_at IS NOT NULL),
 CHECK(state NOT IN('processing','uncertain','paid','failed') OR started_by IS NOT NULL AND started_at IS NOT NULL),
 CHECK(state NOT IN('uncertain','paid','failed','void') OR recorded_by IS NOT NULL AND recorded_at IS NOT NULL AND length(evidence_reference)>=8),
 CHECK(state<>'paid' OR bank_at IS NOT NULL AND transaction_identity IS NOT NULL AND transaction_identity_hash IS NOT NULL),
 CHECK(state<>'failed' OR failure_basis IS NOT NULL)

,live_registered_id VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN state NOT IN('failed','void') THEN registered_payout_id ELSE NULL END) STORED,UNIQUE KEY payout_transfer_one_registered(live_registered_id)
,live_managed_id VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN state NOT IN('failed','void') THEN managed_payout_id ELSE NULL END) STORED,UNIQUE KEY payout_transfer_one_managed(live_managed_id)
,live_fixed_id VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN state NOT IN('failed','void') THEN supplier_payment_id ELSE NULL END) STORED,UNIQUE KEY payout_transfer_one_fixed(live_fixed_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_outgoing_bank_identities(
 identity_hash VARCHAR(191) PRIMARY KEY CHECK(length(identity_hash)=64), packet_kind VARCHAR(191) NOT NULL CHECK(packet_kind IN('refund','payout')), packet_id VARCHAR(191) NOT NULL,
 account_version_id VARCHAR(191) NOT NULL REFERENCES company_payment_account_versions(id), transaction_identity VARCHAR(191) NOT NULL, amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0), bank_at BIGINT NOT NULL, recorded_at BIGINT NOT NULL,
 UNIQUE(packet_kind,packet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO company_outgoing_bank_identities(identity_hash,packet_kind,packet_id,account_version_id,transaction_identity,amount_paisa,bank_at,recorded_at)
 SELECT transaction_identity_hash,'refund',id,account_version_id,transaction_identity,amount_paisa,bank_at,recorded_at FROM outgoing_payment_packets WHERE state='paid' AND amount_paisa>0;

DELIMITER $$
CREATE OR REPLACE TRIGGER payout_transfer_source_retained BEFORE UPDATE ON payout_transfer_packets FOR EACH ROW BEGIN IF (NOT (NEW.id <=> OLD.id) OR NOT (NEW.payout_model <=> OLD.payout_model) OR NOT (NEW.registered_payout_id <=> OLD.registered_payout_id) OR NOT (NEW.managed_payout_id <=> OLD.managed_payout_id) OR NOT (NEW.supplier_payment_id <=> OLD.supplier_payment_id) OR NOT (NEW.seller_id <=> OLD.seller_id) OR NOT (NEW.beneficiary_version_id <=> OLD.beneficiary_version_id) OR NOT (NEW.identity_revision <=> OLD.identity_revision) OR NOT (NEW.bank_revision <=> OLD.bank_revision) OR NOT (NEW.source_snapshot_json <=> OLD.source_snapshot_json) OR NOT (NEW.account_version_id <=> OLD.account_version_id) OR NOT (NEW.funding_statement_id <=> OLD.funding_statement_id) OR NOT (NEW.amount_paisa <=> OLD.amount_paisa) OR NOT (NEW.prepared_by <=> OLD.prepared_by) OR NOT (NEW.prepared_at <=> OLD.prepared_at) OR NEW.revision<>OLD.revision+1 OR OLD.started_at IS NOT NULL AND (NOT (NEW.started_at <=> OLD.started_at) OR NOT (NEW.started_by <=> OLD.started_by)) OR OLD.approved_at IS NOT NULL AND (NOT (NEW.approved_at <=> OLD.approved_at) OR NOT (NEW.approved_by <=> OLD.approved_by))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_transfer_source_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER payout_transfer_retained BEFORE DELETE ON payout_transfer_packets FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_transfer_history_retained'; END$$
CREATE OR REPLACE TRIGGER payout_transfer_transition BEFORE UPDATE ON payout_transfer_packets FOR EACH ROW BEGIN IF (NOT(OLD.state='prepared' AND NEW.state IN('approved','void') OR OLD.state='approved' AND NEW.state IN('processing','void') OR OLD.state IN('processing','uncertain') AND NEW.state IN('uncertain','paid','failed'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_transfer_transition_conflict'; END IF; END$$
CREATE OR REPLACE TRIGGER outgoing_bank_identity_retained BEFORE UPDATE ON company_outgoing_bank_identities FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='actual_bank_identity_retained'; END$$
CREATE OR REPLACE TRIGGER outgoing_bank_identity_no_delete BEFORE DELETE ON company_outgoing_bank_identities FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='actual_bank_identity_retained'; END$$
CREATE OR REPLACE TRIGGER refund_actual_bank_identity BEFORE UPDATE ON outgoing_payment_packets FOR EACH ROW BEGIN IF (NEW.state='paid' AND NEW.amount_paisa>0 AND NOT EXISTS(SELECT 1 FROM company_outgoing_bank_identities b WHERE b.identity_hash=NEW.transaction_identity_hash AND b.packet_kind='refund' AND b.packet_id=NEW.id AND b.account_version_id=NEW.account_version_id AND b.amount_paisa=NEW.amount_paisa AND b.bank_at=NEW.bank_at AND b.transaction_identity=NEW.transaction_identity)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_actual_bank_identity_required'; END IF; END$$
CREATE OR REPLACE TRIGGER payout_actual_bank_identity BEFORE UPDATE ON payout_transfer_packets FOR EACH ROW BEGIN IF (NEW.state='paid' AND NOT EXISTS(SELECT 1 FROM company_outgoing_bank_identities b WHERE b.identity_hash=NEW.transaction_identity_hash AND b.packet_kind='payout' AND b.packet_id=NEW.id AND b.account_version_id=NEW.account_version_id AND b.amount_paisa=NEW.amount_paisa AND b.bank_at=NEW.bank_at AND b.transaction_identity=NEW.transaction_identity)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_actual_bank_identity_required'; END IF; END$$
CREATE OR REPLACE TRIGGER registered_actual_execution_packet BEFORE UPDATE ON payouts FOR EACH ROW BEGIN IF (NEW.status<>OLD.status AND NEW.status IN('processing','paid','failed') AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets p JOIN users u ON u.id=NEW.processed_by JOIN user_roles r ON r.user_id=u.id WHERE p.registered_payout_id=NEW.id AND p.state=NEW.status AND p.amount_paisa=NEW.amount_paisa AND u.status='active' AND r.role='super_admin' AND (CASE WHEN NEW.status='processing' THEN p.started_by ELSE p.recorded_by END)=u.id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_requires_actual_execution_packet'; END IF; END$$
DELIMITER ;
