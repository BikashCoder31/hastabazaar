-- Source parity for 0104_refund_obligations. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE refund_obligations(
 id VARCHAR(191) PRIMARY KEY,source_kind VARCHAR(191) NOT NULL CHECK(source_kind IN('return_refund','receipt_return','service_fee','cancellation')),
 source_id VARCHAR(191) NOT NULL,order_id VARCHAR(191) REFERENCES orders(id),receipt_id VARCHAR(191) REFERENCES company_money_receipts(id),receipt_use_id VARCHAR(191) UNIQUE REFERENCES manual_receipt_uses(id),
 customer_id VARCHAR(191) NOT NULL REFERENCES users(id),cash_paisa BIGINT NOT NULL CHECK(cash_paisa>=0 AND cash_paisa<=9007199254740991),wallet_paisa BIGINT NOT NULL CHECK(wallet_paisa>=0 AND wallet_paisa<=9007199254740991),
 currency VARCHAR(191) NOT NULL CHECK(currency='NPR'),source_snapshot_json LONGTEXT NOT NULL CHECK(json_valid(source_snapshot_json)),
 state VARCHAR(191) NOT NULL DEFAULT 'open' CHECK(state IN('open','processing','uncertain','completed','blocked')),revision BIGINT NOT NULL DEFAULT 0,
 owner_id VARCHAR(191) NOT NULL REFERENCES users(id),backup_id VARCHAR(191) REFERENCES users(id),authorized_at BIGINT NOT NULL,first_finance_due_at BIGINT NOT NULL,first_finance_at BIGINT,
 next_update_at BIGINT NOT NULL,calendar_version VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,UNIQUE(source_kind,source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE refund_obligation_events(
 id VARCHAR(191) PRIMARY KEY,obligation_id VARCHAR(191) NOT NULL REFERENCES refund_obligations(id),actor_id VARCHAR(191) NOT NULL REFERENCES users(id),action VARCHAR(191) NOT NULL,
 public_message LONGTEXT NOT NULL,private_details_json LONGTEXT NOT NULL CHECK(json_valid(private_details_json)),request_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,UNIQUE(obligation_id,request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER refund_obligation_source_retained BEFORE UPDATE ON refund_obligations FOR EACH ROW BEGIN IF (NEW.id<>OLD.id OR NEW.source_kind<>OLD.source_kind OR NEW.source_id<>OLD.source_id OR NOT (NEW.order_id <=> OLD.order_id) OR NOT (NEW.receipt_id <=> OLD.receipt_id) OR NOT (NEW.receipt_use_id <=> OLD.receipt_use_id)
 OR NEW.customer_id<>OLD.customer_id OR NEW.cash_paisa<>OLD.cash_paisa OR NEW.wallet_paisa<>OLD.wallet_paisa OR NEW.currency<>OLD.currency OR NEW.source_snapshot_json<>OLD.source_snapshot_json
 OR NEW.authorized_at<>OLD.authorized_at OR NEW.first_finance_due_at<>OLD.first_finance_due_at OR NEW.calendar_version<>OLD.calendar_version OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_original_obligation_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER refund_obligation_no_delete BEFORE DELETE ON refund_obligations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_original_obligation_retained'; END$$
CREATE OR REPLACE TRIGGER refund_obligation_event_no_update BEFORE UPDATE ON refund_obligation_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_history_retained'; END$$
CREATE OR REPLACE TRIGGER refund_obligation_event_no_delete BEFORE DELETE ON refund_obligation_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_history_retained'; END$$
DELIMITER ;
