-- Source parity for 0105_refund_execution_sources. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE refund_destination_heads(obligation_id VARCHAR(191) PRIMARY KEY REFERENCES refund_obligations(id),version_id VARCHAR(191),revision BIGINT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE refund_destination_versions(
 id VARCHAR(191) PRIMARY KEY,obligation_id VARCHAR(191) NOT NULL REFERENCES refund_obligations(id),number BIGINT NOT NULL,revision BIGINT NOT NULL DEFAULT 0,
 details_json LONGTEXT NOT NULL CHECK(json_valid(details_json)),relationship VARCHAR(191) NOT NULL CHECK(relationship IN('original_payer','own_account','authorized_nominee')),
 customer_authorization LONGTEXT NOT NULL,evidence_reference LONGTEXT NOT NULL,submitted_by VARCHAR(191) NOT NULL REFERENCES users(id),session_hash VARCHAR(191) NOT NULL,authenticated_at BIGINT NOT NULL,created_at BIGINT NOT NULL,
 status VARCHAR(191) NOT NULL CHECK(status IN('submitted','verified','rejected')),verified_by VARCHAR(191) REFERENCES users(id),verified_at BIGINT,verification_reference LONGTEXT,
 UNIQUE(obligation_id,number),CHECK(status<>'verified' OR verified_by IS NOT NULL AND verified_at IS NOT NULL AND verification_reference IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_funding_accounts(account_id VARCHAR(191) PRIMARY KEY REFERENCES company_payment_accounts(id),statement_id VARCHAR(191),revision BIGINT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_funding_statements(
 id VARCHAR(191) PRIMARY KEY,account_id VARCHAR(191) NOT NULL REFERENCES company_payment_accounts(id),account_version_id VARCHAR(191) NOT NULL REFERENCES company_payment_account_versions(id),
 statement_identity VARCHAR(200) COLLATE utf8mb4_bin NOT NULL,as_of BIGINT NOT NULL,cash_paisa BIGINT NOT NULL CHECK(cash_paisa>=0 AND cash_paisa<=9007199254740991),restricted_paisa BIGINT NOT NULL CHECK(restricted_paisa>=0 AND restricted_paisa<=cash_paisa),
 evidence_reference LONGTEXT NOT NULL,restrictions_reference LONGTEXT NOT NULL,verified_by VARCHAR(191) NOT NULL REFERENCES users(id),recorded_at BIGINT NOT NULL,UNIQUE(account_id,statement_identity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE outgoing_payment_packets(
 id VARCHAR(191) PRIMARY KEY,obligation_id VARCHAR(191) NOT NULL REFERENCES refund_obligations(id),funding_statement_id VARCHAR(191) REFERENCES company_funding_statements(id),account_version_id VARCHAR(191) REFERENCES company_payment_account_versions(id),
 destination_version_id VARCHAR(191) REFERENCES refund_destination_versions(id),amount_paisa BIGINT NOT NULL CHECK(amount_paisa>=0 AND amount_paisa<=9007199254740991),currency VARCHAR(191) NOT NULL CHECK(currency='NPR'),
 state VARCHAR(191) NOT NULL CHECK(state IN('prepared','approved','processing','uncertain','paid','failed','void')),revision BIGINT NOT NULL DEFAULT 0,
 prepared_by VARCHAR(191) NOT NULL REFERENCES users(id),approved_by VARCHAR(191) REFERENCES users(id),started_by VARCHAR(191) REFERENCES users(id),recorded_by VARCHAR(191) REFERENCES users(id),
 prepared_at BIGINT NOT NULL,approved_at BIGINT,started_at BIGINT,recorded_at BIGINT,bank_at BIGINT,transaction_identity VARCHAR(191),transaction_identity_hash VARCHAR(191) UNIQUE,evidence_reference LONGTEXT,
 CHECK(amount_paisa=0 OR funding_statement_id IS NOT NULL AND account_version_id IS NOT NULL AND destination_version_id IS NOT NULL)

,live_obligation_id VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN state NOT IN('failed','void') THEN obligation_id ELSE NULL END) STORED,UNIQUE KEY outgoing_one_live_attempt(live_obligation_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER refund_destination_source_retained BEFORE UPDATE ON refund_destination_versions FOR EACH ROW BEGIN IF (NEW.id<>OLD.id OR NEW.obligation_id<>OLD.obligation_id OR NEW.number<>OLD.number OR NEW.details_json<>OLD.details_json OR NEW.relationship<>OLD.relationship OR NEW.customer_authorization<>OLD.customer_authorization OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.submitted_by<>OLD.submitted_by OR NEW.session_hash<>OLD.session_hash OR NEW.authenticated_at<>OLD.authenticated_at OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR OLD.status<>'submitted') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_destination_snapshot_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER refund_destination_no_delete BEFORE DELETE ON refund_destination_versions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_destination_snapshot_retained'; END$$
CREATE OR REPLACE TRIGGER company_funding_statement_no_update BEFORE UPDATE ON company_funding_statements FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='funding_statement_evidence_retained'; END$$
CREATE OR REPLACE TRIGGER company_funding_statement_no_delete BEFORE DELETE ON company_funding_statements FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='funding_statement_evidence_retained'; END$$
CREATE OR REPLACE TRIGGER outgoing_packet_snapshot_retained BEFORE UPDATE ON outgoing_payment_packets FOR EACH ROW BEGIN IF (NEW.id<>OLD.id OR NEW.obligation_id<>OLD.obligation_id OR NOT (NEW.funding_statement_id <=> OLD.funding_statement_id) OR NOT (NEW.account_version_id <=> OLD.account_version_id) OR NOT (NEW.destination_version_id <=> OLD.destination_version_id) OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.currency<>OLD.currency OR NEW.prepared_by<>OLD.prepared_by OR NEW.prepared_at<>OLD.prepared_at OR NEW.revision<>OLD.revision+1 OR OLD.state IN('paid','failed','void')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='outgoing_packet_snapshot_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER outgoing_packet_no_delete BEFORE DELETE ON outgoing_payment_packets FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='outgoing_packet_snapshot_retained'; END$$
CREATE OR REPLACE TRIGGER outgoing_packet_ordered_transition BEFORE UPDATE ON outgoing_payment_packets FOR EACH ROW BEGIN IF (NOT (
 OLD.state='prepared' AND NEW.state IN('approved','void') OR OLD.state='approved' AND NEW.state IN('processing','void') OR OLD.state IN('processing','uncertain') AND NEW.state IN('uncertain','paid','failed'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='outgoing_packet_transition_conflict'; END IF; END$$
CREATE OR REPLACE TRIGGER refund_execution_packet_required BEFORE UPDATE ON refunds FOR EACH ROW BEGIN IF (NEW.status<>OLD.status AND NEW.status IN('processing','paid','failed') AND (NOT EXISTS(SELECT 1 FROM outgoing_payment_packets p JOIN refund_obligations o ON o.id=p.obligation_id JOIN users u ON u.id=NEW.processed_by JOIN user_roles role ON role.user_id=u.id
  WHERE o.source_kind='return_refund' AND o.source_id=NEW.id AND p.state=NEW.status AND p.amount_paisa=NEW.amount_paisa-NEW.wallet_credit_paisa-NEW.referral_discount_paisa-NEW.promo_discount_paisa
  AND u.status='active' AND role.role='super_admin' AND (CASE WHEN NEW.status='processing' THEN p.started_by ELSE p.recorded_by END)=u.id
  AND (NEW.status<>'paid' OR p.amount_paisa=0 OR p.bank_at IS NOT NULL AND p.transaction_identity_hash IS NOT NULL AND length(p.evidence_reference)>=8)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_requires_actual_execution_packet'; END IF; END$$
DELIMITER ;
