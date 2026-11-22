-- Source only: 0098 parity. Never apply to the canonical database to bypass startup.

ALTER TABLE offer_stock_events MODIFY actor_id VARCHAR(191) NULL;

CREATE TABLE manual_payment_windows(
 order_id VARCHAR(191) PRIMARY KEY ,
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 issued_at BIGINT NOT NULL,
 deadline_at BIGINT NOT NULL,
 buffer_end_at BIGINT NOT NULL,
 calendar_version VARCHAR(191) NOT NULL,
 last_event_id VARCHAR(191) NOT NULL,
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 paid_at BIGINT,
 closed_at BIGINT,
 released_at BIGINT,
 closure_reason LONGTEXT,
 CHECK(deadline_at=issued_at+86400000),
 CHECK(buffer_end_at>deadline_at),
 CHECK(paid_at IS NULL OR closed_at IS NULL),
 CHECK(released_at IS NULL OR paid_at IS NOT NULL),
 FOREIGN KEY(order_id) REFERENCES orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manual_payment_claims(
 id VARCHAR(191) PRIMARY KEY,
 order_id VARCHAR(191) NOT NULL UNIQUE ,
 customer_id VARCHAR(191) NOT NULL ,
 claimed_amount_paisa BIGINT NOT NULL CHECK(claimed_amount_paisa>0 AND claimed_amount_paisa<=9007199254740991),
 payment_date VARCHAR(191) NOT NULL,
 bank_reference VARCHAR(191),
 note LONGTEXT NOT NULL,
 evidence_ids_json LONGTEXT NOT NULL CHECK(json_valid(evidence_ids_json)),
 first_submitted_at BIGINT NOT NULL,
 current_state VARCHAR(191) NOT NULL CHECK(current_state IN('submitted','clarified','needs_information','rejected','withdrawn','matched')),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at BIGINT NOT NULL,
 FOREIGN KEY(order_id) REFERENCES manual_payment_windows(order_id),
 FOREIGN KEY(customer_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manual_payment_claim_events(
 id VARCHAR(191) PRIMARY KEY,
 claim_id VARCHAR(191) NOT NULL ,
 order_id VARCHAR(191) NOT NULL ,
 revision BIGINT NOT NULL,
 state VARCHAR(191) NOT NULL CHECK(state IN('submitted','clarified','needs_information','rejected','withdrawn','matched')),
 snapshot_json LONGTEXT NOT NULL CHECK(json_valid(snapshot_json)),
 actor_id VARCHAR(191) NOT NULL ,
 occurred_at BIGINT NOT NULL,
 request_id VARCHAR(191) NOT NULL,
 UNIQUE(claim_id,revision),
 FOREIGN KEY(claim_id) REFERENCES manual_payment_claims(id),
 FOREIGN KEY(order_id) REFERENCES manual_payment_windows(order_id),
 FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manual_payment_claim_files(
 id VARCHAR(191) PRIMARY KEY,
 order_id VARCHAR(191) NOT NULL ,
 uploaded_by VARCHAR(191) NOT NULL ,
 object_key VARCHAR(255) NOT NULL UNIQUE,
 original_name VARCHAR(255) NOT NULL,
 mime_type VARCHAR(191) NOT NULL,
 size_bytes BIGINT NOT NULL CHECK(size_bytes>0),
 created_at BIGINT NOT NULL,
 FOREIGN KEY(order_id) REFERENCES manual_payment_windows(order_id),
 FOREIGN KEY(uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_money_receipts(
 id VARCHAR(191) PRIMARY KEY,
 kind VARCHAR(191) NOT NULL CHECK(kind IN('bank_credit','cash_handover')),
 account_version_id VARCHAR(191) ,
 source_identity_hash CHAR(64) NOT NULL UNIQUE CHECK(length(source_identity_hash)=64),
 transaction_identity VARCHAR(200) NOT NULL,
 bank_at BIGINT NOT NULL,
 confirmed_at BIGINT NOT NULL,
 amount_minor BIGINT NOT NULL CHECK(amount_minor>0 AND amount_minor<=9007199254740991),
 currency CHAR(3) NOT NULL CHECK(length(currency)=3),
 payer_reference VARCHAR(500) NOT NULL,
 payer_user_id VARCHAR(191) ,
 collector_user_id VARCHAR(191) ,
 evidence_reference VARCHAR(500) NOT NULL,
 verification_reason LONGTEXT NOT NULL,
 status VARCHAR(191) NOT NULL CHECK(status IN('verified','unmatched','reversed')),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 created_by VARCHAR(191) NOT NULL ,
 CHECK(kind<>'bank_credit' OR account_version_id IS NOT NULL),
 CHECK(kind<>'cash_handover' OR account_version_id IS NULL),
 FOREIGN KEY(account_version_id) REFERENCES company_payment_account_versions(id),
 FOREIGN KEY(payer_user_id) REFERENCES users(id),
 FOREIGN KEY(collector_user_id) REFERENCES users(id),
 FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_receipt_conflicts(
 receipt_id VARCHAR(191) NOT NULL ,
 user_id VARCHAR(191) NOT NULL ,
 recorded_by VARCHAR(191) NOT NULL ,
 recorded_at BIGINT NOT NULL,
 PRIMARY KEY(receipt_id,user_id),
 FOREIGN KEY(receipt_id) REFERENCES company_money_receipts(id),
 FOREIGN KEY(user_id) REFERENCES users(id),
 FOREIGN KEY(recorded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manual_receipt_uses(
 id VARCHAR(191) PRIMARY KEY,
 receipt_id VARCHAR(191) NOT NULL ,
 kind VARCHAR(191) NOT NULL CHECK(kind IN('order','cod','return')),
 target_id VARCHAR(191) NOT NULL,
 amount_minor BIGINT NOT NULL CHECK(amount_minor>0 AND amount_minor<=9007199254740991),
 state VARCHAR(191) NOT NULL CHECK(state IN('allocated','reserved','returned','released')),
 created_by VARCHAR(191) NOT NULL ,
 created_at BIGINT NOT NULL,
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 FOREIGN KEY(receipt_id) REFERENCES company_money_receipts(id),
 FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manual_payment_allocations(
 id VARCHAR(191) PRIMARY KEY,
 receipt_use_id VARCHAR(191) NOT NULL UNIQUE ,
 receipt_id VARCHAR(191) NOT NULL ,
 order_id VARCHAR(191) NOT NULL ,
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0),
 allocated_at BIGINT NOT NULL,
 actor_id VARCHAR(191) NOT NULL ,
 matching_basis LONGTEXT NOT NULL,
 exception_json LONGTEXT CHECK(exception_json IS NULL OR json_valid(exception_json)),
 FOREIGN KEY(receipt_use_id) REFERENCES manual_receipt_uses(id),
 FOREIGN KEY(receipt_id) REFERENCES company_money_receipts(id),
 FOREIGN KEY(order_id) REFERENCES manual_payment_windows(order_id),
 FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_receipt_reversals(
 id VARCHAR(191) PRIMARY KEY,
 receipt_id VARCHAR(191) NOT NULL ,
 source_identity_hash VARCHAR(191) NOT NULL UNIQUE CHECK(CHAR_LENGTH(source_identity_hash)=64),
 transaction_identity VARCHAR(200) NOT NULL,
 amount_minor BIGINT NOT NULL CHECK(amount_minor>0 AND amount_minor<=9007199254740991),
 actor_id VARCHAR(191) NOT NULL ,
 evidence_reference VARCHAR(500) NOT NULL,
 reason LONGTEXT NOT NULL,
 bank_at BIGINT NOT NULL,
 recorded_at BIGINT NOT NULL,
 FOREIGN KEY(receipt_id) REFERENCES company_money_receipts(id),
 FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manual_payment_exceptions(
 id VARCHAR(191) PRIMARY KEY,
 source_key VARCHAR(191) NOT NULL UNIQUE,
 order_id VARCHAR(191) ,
 receipt_id VARCHAR(191) ,
 kind VARCHAR(191) NOT NULL,
 last_event_id VARCHAR(191) NOT NULL,
 state VARCHAR(191) NOT NULL CHECK(state IN('open','waiting','resolved')),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 reason LONGTEXT NOT NULL,
 owner_id VARCHAR(191) ,
 backup_id VARCHAR(191) ,
 created_at BIGINT NOT NULL,
 triaged_at BIGINT,
 next_update_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL,
 FOREIGN KEY(order_id) REFERENCES orders(id),
 FOREIGN KEY(receipt_id) REFERENCES company_money_receipts(id),
 FOREIGN KEY(owner_id) REFERENCES users(id),
 FOREIGN KEY(backup_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_receipt_controls(
 receipt_id VARCHAR(191) PRIMARY KEY ,
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 FOREIGN KEY(receipt_id) REFERENCES company_money_receipts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX manual_claim_event_cutoff ON manual_payment_claim_events(order_id,occurred_at,revision);

CREATE INDEX manual_receipt_use_balance ON manual_receipt_uses(receipt_id,state);

CREATE INDEX manual_order_allocations ON manual_payment_allocations(order_id,allocated_at);

CREATE VIEW manual_payment_cutoffs AS SELECT w.*,
 CASE WHEN EXISTS(SELECT 1 FROM manual_payment_claim_events e WHERE e.order_id=w.order_id AND e.occurred_at<w.deadline_at
  AND e.state IN('submitted','clarified','needs_information') AND NOT EXISTS(SELECT 1 FROM manual_payment_claim_events later WHERE later.order_id=e.order_id AND later.occurred_at<w.deadline_at AND (later.occurred_at>e.occurred_at OR later.occurred_at=e.occurred_at AND later.revision>e.revision)))
  OR COALESCE((SELECT SUM(a.amount_paisa) FROM manual_payment_allocations a WHERE a.order_id=w.order_id AND a.allocated_at<w.deadline_at AND COALESCE((SELECT SUM(r.amount_minor) FROM company_receipt_reversals r WHERE r.receipt_id=a.receipt_id AND r.recorded_at<w.deadline_at),0)<(SELECT amount_minor FROM company_money_receipts WHERE id=a.receipt_id)),0)>0
 THEN w.buffer_end_at ELSE w.deadline_at END AS cutoff_at FROM manual_payment_windows w;

DELIMITER $$
CREATE TRIGGER manual_window_source BEFORE INSERT ON manual_payment_windows FOR EACH ROW BEGIN
 IF NOT EXISTS(SELECT 1 FROM company_payment_instructions i JOIN orders o ON o.id=i.order_id WHERE i.order_id=NEW.order_id AND i.amount_paisa=NEW.amount_paisa AND i.issued_at=NEW.issued_at AND i.deadline_at=NEW.deadline_at AND i.calendar_version=NEW.calendar_version AND o.payment_mode='prepaid' AND o.payment_status='unpaid') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_window_original_instructions_required'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_window_identity BEFORE UPDATE ON manual_payment_windows FOR EACH ROW BEGIN
 IF NEW.order_id<>OLD.order_id OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.issued_at<>OLD.issued_at OR NEW.deadline_at<>OLD.deadline_at OR NEW.buffer_end_at<>OLD.buffer_end_at OR NEW.calendar_version<>OLD.calendar_version OR NEW.revision<>OLD.revision+1 OR OLD.paid_at IS NOT NULL AND NOT (NEW.paid_at <=> OLD.paid_at) OR OLD.closed_at IS NOT NULL AND NOT (NEW.closed_at <=> OLD.closed_at) OR OLD.released_at IS NOT NULL AND NOT (NEW.released_at <=> OLD.released_at) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_window_original_terms_immutable';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_receipt_use_cap BEFORE INSERT ON manual_receipt_uses FOR EACH ROW BEGIN
 IF NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id AND r.status='verified' AND NOT EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.receipt_id=r.id AND e.kind='receipt_reversal' AND e.state<>'resolved') AND NEW.amount_minor<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)-COALESCE((SELECT SUM(u.amount_minor) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_receipt_balance_exceeded'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_receipt_use_transition BEFORE UPDATE ON manual_receipt_uses FOR EACH ROW BEGIN
 IF NEW.id<>OLD.id OR NEW.receipt_id<>OLD.receipt_id OR NEW.kind<>OLD.kind OR NEW.target_id<>OLD.target_id OR NEW.amount_minor<>OLD.amount_minor OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR OLD.state<>'reserved' OR NEW.state NOT IN('returned','released') THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_receipt_use_immutable';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_allocation_source BEFORE INSERT ON manual_payment_allocations FOR EACH ROW BEGIN
 IF NOT EXISTS(SELECT 1 FROM manual_receipt_uses u JOIN company_money_receipts r ON r.id=u.receipt_id WHERE u.id=NEW.receipt_use_id AND u.receipt_id=NEW.receipt_id AND u.kind='order' AND u.target_id=NEW.order_id AND u.amount_minor=NEW.amount_paisa AND u.state='allocated' AND r.status='verified' AND r.currency='NPR' AND r.kind='bank_credit') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_allocation_verified_credit_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM manual_payment_cutoffs w JOIN orders o ON o.id=w.order_id WHERE w.order_id=NEW.order_id AND w.closed_at IS NULL AND w.paid_at IS NULL AND o.status NOT IN('cancelled','delivered','dispatched') AND NEW.allocated_at<w.cutoff_at) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_allocation_window_closed'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_preparation_held BEFORE UPDATE ON order_items FOR EACH ROW BEGIN
 IF NEW.fulfillment_status NOT IN('confirmed','cancelled') AND EXISTS(SELECT 1 FROM manual_payment_windows w WHERE w.order_id=NEW.order_id AND (w.paid_at IS NULL OR w.released_at IS NULL OR w.closed_at IS NOT NULL)) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_fulfillment_held';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_parcel_held BEFORE INSERT ON shipping_jobs FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM manual_payment_windows w WHERE w.order_id=NEW.order_id AND (w.paid_at IS NULL OR w.released_at IS NULL OR w.closed_at IS NOT NULL)) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_fulfillment_held';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_windows_retained BEFORE DELETE ON manual_payment_windows FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_windows_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_claims_retained BEFORE DELETE ON manual_payment_claims FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_claims_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_claim_events_retained BEFORE DELETE ON manual_payment_claim_events FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_claim_events_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_claim_files_retained BEFORE DELETE ON manual_payment_claim_files FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_claim_files_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_money_receipts_retained BEFORE DELETE ON company_money_receipts FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_money_receipts_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_receipt_conflicts_retained BEFORE DELETE ON company_receipt_conflicts FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_receipt_conflicts_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_receipt_uses_retained BEFORE DELETE ON manual_receipt_uses FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_receipt_uses_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_allocations_retained BEFORE DELETE ON manual_payment_allocations FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_allocations_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_receipt_reversals_retained BEFORE DELETE ON company_receipt_reversals FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_receipt_reversals_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_exceptions_retained BEFORE DELETE ON manual_payment_exceptions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_exceptions_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_claim_events_immutable BEFORE UPDATE ON manual_payment_claim_events FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_claim_events_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_claim_files_immutable BEFORE UPDATE ON manual_payment_claim_files FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_claim_files_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_receipt_conflicts_immutable BEFORE UPDATE ON company_receipt_conflicts FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_receipt_conflicts_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_allocations_immutable BEFORE UPDATE ON manual_payment_allocations FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_allocations_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_receipt_reversals_immutable BEFORE UPDATE ON company_receipt_reversals FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_receipt_reversals_immutable';
END$$
DELIMITER ;

CREATE VIEW manual_payment_balances AS SELECT o.id AS order_id,
 CASE WHEN o.current_total_paisa IS NULL THEN o.grand_total_paisa ELSE o.current_total_paisa+COALESCE((SELECT JSON_VALUE(e.next_json,'$.platformServiceFeePaisa') FROM order_cancellation_events e WHERE e.order_id=o.id ORDER BY e.version DESC LIMIT 1),o.buyer_platform_fee_paisa) END AS payable_paisa,
 COALESCE((SELECT SUM(a.amount_paisa) FROM manual_payment_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.order_id=o.id AND r.status='verified'),0) AS received_paisa FROM orders o JOIN manual_payment_windows w ON w.order_id=o.id;

DELIMITER $$
CREATE TRIGGER manual_allocation_amount_and_time BEFORE INSERT ON manual_payment_allocations FOR EACH ROW BEGIN
 IF NEW.allocated_at<>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED) OR NOT EXISTS(SELECT 1 FROM manual_payment_balances b WHERE b.order_id=NEW.order_id AND NEW.amount_paisa<=b.payable_paisa-b.received_paisa) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_allocation_amount_or_time_changed'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_claim_original_age BEFORE UPDATE ON manual_payment_claims FOR EACH ROW BEGIN
 IF NEW.id<>OLD.id OR NEW.order_id<>OLD.order_id OR NEW.customer_id<>OLD.customer_id OR NEW.first_submitted_at<>OLD.first_submitted_at OR NEW.revision<>OLD.revision+1 THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_claim_original_age_immutable';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_claim_owner BEFORE INSERT ON manual_payment_claims FOR EACH ROW BEGIN
 IF NEW.first_submitted_at<>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED) OR NOT EXISTS(SELECT 1 FROM orders o JOIN users u ON u.id=o.customer_id WHERE o.id=NEW.order_id AND o.customer_id=NEW.customer_id AND u.status='active') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_claim_owner_required'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_claim_event_source BEFORE INSERT ON manual_payment_claim_events FOR EACH ROW BEGIN
 IF NEW.occurred_at<>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED) OR NOT EXISTS(SELECT 1 FROM manual_payment_claims c WHERE c.id=NEW.claim_id AND c.order_id=NEW.order_id AND c.revision=NEW.revision AND c.current_state=NEW.state) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_claim_current_event_required'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_window_paid_and_expired BEFORE UPDATE ON manual_payment_windows FOR EACH ROW BEGIN
 IF OLD.paid_at IS NULL AND NEW.paid_at IS NOT NULL AND (NEW.paid_at<>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED) OR NOT EXISTS(SELECT 1 FROM manual_payment_cutoffs w JOIN manual_payment_balances b ON b.order_id=w.order_id WHERE w.order_id=NEW.order_id AND w.closed_at IS NULL AND NEW.paid_at<w.cutoff_at AND b.received_paisa>=b.payable_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_not_confirmed'; END IF;
 IF OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL AND (NEW.closed_at<>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED) OR NOT EXISTS(SELECT 1 FROM manual_payment_cutoffs w WHERE w.order_id=NEW.order_id AND w.paid_at IS NULL AND (NEW.closed_at>=w.cutoff_at OR NEW.closure_reason='order_cancelled' AND EXISTS(SELECT 1 FROM orders o WHERE o.id=w.order_id AND o.status='cancelled')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_not_expired'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_order_payment_source BEFORE UPDATE ON orders FOR EACH ROW BEGIN
 IF NEW.payment_mode='prepaid' AND NEW.payment_status='paid' AND EXISTS(SELECT 1 FROM manual_payment_windows WHERE order_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM manual_payment_windows WHERE order_id=NEW.id AND paid_at IS NOT NULL AND closed_at IS NULL) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_not_confirmed';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_receipt_original_fact BEFORE UPDATE ON company_money_receipts FOR EACH ROW BEGIN
 IF NEW.id<>OLD.id OR NEW.kind<>OLD.kind OR NOT (NEW.account_version_id <=> OLD.account_version_id) OR NEW.source_identity_hash<>OLD.source_identity_hash OR NEW.transaction_identity<>OLD.transaction_identity OR NEW.bank_at<>OLD.bank_at OR NEW.confirmed_at<>OLD.confirmed_at OR NEW.amount_minor<>OLD.amount_minor OR NEW.currency<>OLD.currency OR NEW.payer_reference<>OLD.payer_reference OR NOT (NEW.payer_user_id <=> OLD.payer_user_id) OR NOT (NEW.collector_user_id <=> OLD.collector_user_id) OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.verification_reason<>OLD.verification_reason OR NEW.created_by<>OLD.created_by OR NEW.revision<>OLD.revision+1 OR NEW.status<>'reversed' OR OLD.status='reversed' OR COALESCE((SELECT SUM(amount_minor) FROM company_receipt_reversals WHERE receipt_id=OLD.id),0)<>OLD.amount_minor THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_receipt_original_fact_immutable';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_receipt_controls_retained BEFORE DELETE ON company_receipt_controls FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_receipt_control_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_receipt_controls_revision BEFORE UPDATE ON company_receipt_controls FOR EACH ROW BEGIN
 IF NEW.receipt_id<>OLD.receipt_id OR NEW.revision<>OLD.revision+1 THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_receipt_control_revision';
 END IF;
END$$
DELIMITER ;

CREATE TABLE manual_payment_reminders(order_id VARCHAR(191) PRIMARY KEY,event_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,FOREIGN KEY(order_id) REFERENCES manual_payment_windows(order_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER manual_payment_reminder_immutable BEFORE UPDATE ON manual_payment_reminders FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_reminder_immutable'; END$$
CREATE TRIGGER manual_payment_reminder_retained BEFORE DELETE ON manual_payment_reminders FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_reminder_retained'; END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_reversal_cap BEFORE INSERT ON company_receipt_reversals FOR EACH ROW BEGIN
 IF NEW.recorded_at<>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED) OR NEW.bank_at>NEW.recorded_at OR NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id AND r.kind='bank_credit' AND NEW.amount_minor<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_reversal_balance_or_time_changed'; END IF;
END$$
CREATE TRIGGER manual_reversal_preparation_held BEFORE UPDATE ON order_items FOR EACH ROW BEGIN
 IF NEW.fulfillment_status<>OLD.fulfillment_status AND NEW.fulfillment_status IN('packing','ready_for_pickup','dispatched') AND EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.order_id=NEW.order_id AND e.kind='receipt_reversal' AND e.state<>'resolved') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_reversal_fulfillment_held'; END IF;
END$$
CREATE TRIGGER manual_reversal_parcel_held BEFORE INSERT ON shipping_jobs FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.order_id=NEW.order_id AND e.kind='receipt_reversal' AND e.state<>'resolved') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_reversal_fulfillment_held'; END IF;
END$$
DELIMITER ;


CREATE TABLE cod_company_receipt_allocations(
 id VARCHAR(191) PRIMARY KEY,
 receipt_use_id VARCHAR(191) NOT NULL UNIQUE,
 receipt_id VARCHAR(191) NOT NULL,
 shipping_job_id VARCHAR(191) NOT NULL,
 cash_record_id VARCHAR(191) NOT NULL,
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0),
 approved_by VARCHAR(191) NOT NULL,
 evidence_reference VARCHAR(500) NOT NULL,
 created_at BIGINT NOT NULL,
 FOREIGN KEY(receipt_use_id) REFERENCES manual_receipt_uses(id),
 FOREIGN KEY(receipt_id) REFERENCES company_money_receipts(id),
 FOREIGN KEY(shipping_job_id) REFERENCES shipping_jobs(id),
 FOREIGN KEY(approved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX cod_receipt_job ON cod_company_receipt_allocations(shipping_job_id);

CREATE INDEX cod_receipt_cash_record ON cod_company_receipt_allocations(cash_record_id);

CREATE TABLE cod_approved_deductions(
 id VARCHAR(191) PRIMARY KEY,
 shipping_job_id VARCHAR(191) NOT NULL,
 courier_cost_id VARCHAR(191) NOT NULL,
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0),
 approved_by VARCHAR(191) NOT NULL,
 terms_evidence VARCHAR(500) NOT NULL,
 party_allocation_json LONGTEXT NOT NULL CHECK(json_valid(party_allocation_json)),
 created_at BIGINT NOT NULL,
 FOREIGN KEY(shipping_job_id) REFERENCES shipping_jobs(id),
 FOREIGN KEY(courier_cost_id) REFERENCES parcel_courier_costs(id),
 FOREIGN KEY(approved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER cod_receipt_allocation_cap BEFORE INSERT ON cod_company_receipt_allocations FOR EACH ROW BEGIN
 IF NOT EXISTS(SELECT 1 FROM manual_receipt_uses u JOIN company_money_receipts r ON r.id=u.receipt_id WHERE u.id=NEW.receipt_use_id AND u.kind='cod' AND u.target_id=NEW.shipping_job_id AND u.receipt_id=NEW.receipt_id AND u.amount_minor=NEW.amount_paisa AND u.state='allocated' AND r.status='verified' AND r.currency='NPR') OR NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_actual_receipt_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM shipping_parcels p WHERE p.shipping_job_id=NEW.shipping_job_id AND NEW.amount_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a WHERE a.shipping_job_id=p.shipping_job_id),0)+COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.shipping_job_id=p.shipping_job_id),0)<=p.collected_paisa) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_collection_allocation_exceeded'; END IF;
 IF EXISTS(SELECT 1 FROM parcel_cash_records c WHERE c.id=NEW.cash_record_id AND (c.shipping_job_id<>NEW.shipping_job_id OR c.kind<>'remittance' OR c.status NOT IN('pending','posted') OR NEW.amount_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a WHERE a.cash_record_id=c.id),0)>c.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_claim_allocation_changed'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER cod_deduction_cap BEFORE INSERT ON cod_approved_deductions FOR EACH ROW BEGIN
 IF NOT EXISTS(SELECT 1 FROM parcel_courier_costs c WHERE c.id=NEW.courier_cost_id AND c.shipping_job_id=NEW.shipping_job_id AND NEW.amount_paisa+COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.courier_cost_id=c.id),0)<=c.amount_paisa) OR NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin') OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(NEW.party_allocation_json,'$.party')),'')<>'company' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_authorized_company_cost_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM shipping_parcels p WHERE p.shipping_job_id=NEW.shipping_job_id AND NEW.amount_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a WHERE a.shipping_job_id=p.shipping_job_id),0)+COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.shipping_job_id=p.shipping_job_id),0)<=p.collected_paisa) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_collection_allocation_exceeded'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER cod_posted_receipt_insert BEFORE INSERT ON parcel_cash_records FOR EACH ROW BEGIN
 IF NEW.kind='remittance' AND NEW.status='posted' AND NEW.amount_paisa<>COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a WHERE a.cash_record_id=NEW.id AND a.shipping_job_id=NEW.shipping_job_id AND a.approved_by=NEW.approved_by),0) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_actual_receipt_allocation_required';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER cod_posted_receipt_update BEFORE UPDATE ON parcel_cash_records FOR EACH ROW BEGIN
 IF OLD.status<>'posted' AND NEW.kind='remittance' AND NEW.status='posted' AND NEW.amount_paisa<>COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a WHERE a.cash_record_id=NEW.id AND a.shipping_job_id=NEW.shipping_job_id AND a.approved_by=NEW.approved_by),0) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_actual_receipt_allocation_required';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER cod_receipt_allocations_immutable BEFORE UPDATE ON cod_company_receipt_allocations FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_receipt_allocations_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER cod_receipt_allocations_retained BEFORE DELETE ON cod_company_receipt_allocations FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_receipt_allocations_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER cod_deductions_immutable BEFORE UPDATE ON cod_approved_deductions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_deductions_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER cod_deductions_retained BEFORE DELETE ON cod_approved_deductions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_deductions_retained';
END$$
DELIMITER ;

CREATE VIEW cod_reconciliation_balances AS SELECT p.shipping_job_id,p.cod_due_paisa,p.collected_paisa,p.remitted_paisa AS reported_remittance_paisa,
 COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a JOIN parcel_cash_records c ON c.id=a.cash_record_id WHERE a.shipping_job_id=p.shipping_job_id AND c.status='posted'),0) AS actual_cash_paisa,
 COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.shipping_job_id=p.shipping_job_id),0) AS approved_deductions_paisa,
 p.collected_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a JOIN parcel_cash_records c ON c.id=a.cash_record_id WHERE a.shipping_job_id=p.shipping_job_id AND c.status='posted'),0)-COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.shipping_job_id=p.shipping_job_id),0) AS remaining_paisa,
 EXISTS(SELECT 1 FROM manual_payment_exceptions e JOIN shipping_jobs j ON j.order_id=e.order_id WHERE j.id=p.shipping_job_id AND e.kind='receipt_reversal' AND e.state<>'resolved') AS correction_held
 FROM shipping_parcels p;

CREATE TABLE manual_payment_exception_events(id VARCHAR(191) PRIMARY KEY,exception_id VARCHAR(191) NOT NULL,revision BIGINT NOT NULL,actor_id VARCHAR(191) NOT NULL,owner_id VARCHAR(191),backup_id VARCHAR(191),state VARCHAR(32) NOT NULL,note LONGTEXT NOT NULL,next_update_at BIGINT NOT NULL,created_at BIGINT NOT NULL,UNIQUE(exception_id,revision),FOREIGN KEY(exception_id) REFERENCES manual_payment_exceptions(id),FOREIGN KEY(actor_id) REFERENCES users(id),FOREIGN KEY(owner_id) REFERENCES users(id),FOREIGN KEY(backup_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER manual_exception_events_immutable BEFORE UPDATE ON manual_payment_exception_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_exception_events_immutable'; END$$
CREATE TRIGGER manual_exception_events_retained BEFORE DELETE ON manual_payment_exception_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_exception_events_retained'; END$$
DELIMITER ;
