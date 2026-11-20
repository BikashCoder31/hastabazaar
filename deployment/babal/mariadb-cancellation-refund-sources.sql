-- Source parity for 0111_cancellation_refund_sources. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE cancellation_refund_sources(
 id VARCHAR(191) PRIMARY KEY REFERENCES order_cancellation_events(id),order_id VARCHAR(191) NOT NULL REFERENCES orders(id),customer_id VARCHAR(191) REFERENCES users(id),
 cash_paisa BIGINT NOT NULL CHECK(cash_paisa>=0),wallet_restored_paisa BIGINT NOT NULL CHECK(wallet_restored_paisa>=0),
 revised_payable_paisa BIGINT NOT NULL CHECK(revised_payable_paisa>=0),actual_collected_paisa BIGINT NOT NULL CHECK(actual_collected_paisa>=cash_paisa),
 source_snapshot_json LONGTEXT NOT NULL CHECK(json_valid(source_snapshot_json)),state VARCHAR(191) NOT NULL DEFAULT 'authorized' CHECK(state IN('authorized','paid')),authorized_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER cancellation_refund_source_retained BEFORE UPDATE ON cancellation_refund_sources FOR EACH ROW BEGIN IF (NEW.id<>OLD.id OR NEW.order_id<>OLD.order_id OR NOT (NEW.customer_id <=> OLD.customer_id) OR NEW.cash_paisa<>OLD.cash_paisa OR NEW.wallet_restored_paisa<>OLD.wallet_restored_paisa OR NEW.revised_payable_paisa<>OLD.revised_payable_paisa OR NEW.actual_collected_paisa<>OLD.actual_collected_paisa OR NEW.source_snapshot_json<>OLD.source_snapshot_json OR NEW.authorized_at<>OLD.authorized_at OR OLD.state<>'authorized' OR NEW.state<>'paid' OR NOT EXISTS(SELECT 1 FROM refund_obligations r JOIN outgoing_payment_packets p ON p.obligation_id=r.id WHERE r.source_kind='cancellation' AND r.source_id=OLD.id AND p.state='paid' AND p.amount_paisa=OLD.cash_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cancellation_original_cash_source_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER cancellation_refund_source_no_delete BEFORE DELETE ON cancellation_refund_sources FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cancellation_original_cash_source_retained'; END$$
CREATE OR REPLACE TRIGGER cancellation_refund_source_original_event BEFORE INSERT ON cancellation_refund_sources FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM order_cancellation_events e JOIN orders o ON o.id=e.order_id WHERE e.id=NEW.id AND e.order_id=NEW.order_id AND (o.customer_id <=> NEW.customer_id) AND e.wallet_restored_paisa=NEW.wallet_restored_paisa AND e.created_at=NEW.authorized_at AND json_extract(e.next_json,'$.total')=NEW.revised_payable_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cancellation_original_event_required'; END IF; END$$
DELIMITER ;
