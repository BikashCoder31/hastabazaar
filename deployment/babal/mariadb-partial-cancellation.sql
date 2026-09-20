ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_total_paisa BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_subtotal_paisa BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_delivery_paisa BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_wallet_paisa BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_discount_paisa BIGINT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS made_to_order_snapshot BIGINT;
CREATE TABLE IF NOT EXISTS order_cancellation_events (id VARCHAR(191) PRIMARY KEY,order_id VARCHAR(191) NOT NULL REFERENCES orders(id),actor_id VARCHAR(191),version BIGINT NOT NULL,seller_ids_json LONGTEXT NOT NULL,original_allocations_json LONGTEXT NOT NULL,previous_json LONGTEXT NOT NULL,next_json LONGTEXT NOT NULL,note LONGTEXT NOT NULL,wallet_restored_paisa BIGINT NOT NULL CHECK(wallet_restored_paisa>=0),discount_removed_paisa BIGINT NOT NULL CHECK(discount_removed_paisa>=0),item_removed_paisa BIGINT NOT NULL CHECK(item_removed_paisa>=0),created_at BIGINT NOT NULL,UNIQUE(order_id,version)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS order_cancellation_reviews (id VARCHAR(191) PRIMARY KEY,order_id VARCHAR(191) NOT NULL REFERENCES orders(id),seller_ids_json LONGTEXT NOT NULL,note LONGTEXT NOT NULL,status VARCHAR(191) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),requested_by VARCHAR(191),reviewed_by VARCHAR(191),review_note LONGTEXT,created_at BIGINT NOT NULL,reviewed_at BIGINT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX IF NOT EXISTS idx_cancellation_review_queue ON order_cancellation_reviews(status,created_at);
DROP TRIGGER IF EXISTS wallet_cancel_restore;
DELIMITER $$
CREATE TRIGGER wallet_cancel_restore AFTER UPDATE ON orders FOR EACH ROW BEGIN
IF NEW.status='cancelled' AND OLD.status<>'cancelled' THEN
INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
SELECT CONCAT('cancel:',NEW.id),NEW.customer_id,NEW.id,NEW.wallet_credit_paisa-COALESCE(SUM(amount_paisa),0),-(NEW.wallet_credit_paisa-COALESCE(SUM(amount_paisa),0)),'cancellation',NEW.updated_at FROM wallet_entries WHERE order_id=NEW.id AND kind IN ('cancellation','refund') HAVING NEW.wallet_credit_paisa>COALESCE(SUM(amount_paisa),0);
END IF; END$$
DELIMITER ;
DROP TRIGGER IF EXISTS cancellation_event_no_update;
DELIMITER $$
CREATE TRIGGER cancellation_event_no_update BEFORE UPDATE ON order_cancellation_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancellation accounting is immutable'; END$$
DELIMITER ;
DROP TRIGGER IF EXISTS cancellation_event_no_delete;
DELIMITER $$
CREATE TRIGGER cancellation_event_no_delete BEFORE DELETE ON order_cancellation_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancellation accounting is immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS cancellation_review_immutable;
DELIMITER $$
CREATE TRIGGER cancellation_review_immutable BEFORE UPDATE ON order_cancellation_reviews FOR EACH ROW BEGIN IF NOT (NEW.id <=> OLD.id AND NEW.order_id <=> OLD.order_id AND NEW.seller_ids_json <=> OLD.seller_ids_json AND NEW.note <=> OLD.note AND NEW.requested_by <=> OLD.requested_by AND NEW.created_at <=> OLD.created_at) OR (OLD.status<>'pending' AND NOT (NEW.status <=> OLD.status AND NEW.reviewed_by <=> OLD.reviewed_by AND NEW.review_note <=> OLD.review_note AND NEW.reviewed_at <=> OLD.reviewed_at)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancellation review history is immutable'; END IF; END$$
DELIMITER ;
DROP TRIGGER IF EXISTS cancellation_review_no_delete;
DELIMITER $$
CREATE TRIGGER cancellation_review_no_delete BEFORE DELETE ON order_cancellation_reviews FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancellation review history is immutable'; END$$
DELIMITER ;

ALTER TABLE orders ADD CONSTRAINT IF NOT EXISTS chk_cancellation_totals CHECK((current_total_paisa IS NULL AND current_subtotal_paisa IS NULL AND current_delivery_paisa IS NULL AND current_wallet_paisa IS NULL AND current_discount_paisa IS NULL) OR (current_total_paisa IS NOT NULL AND current_total_paisa>=0 AND current_total_paisa<=9007199254740991 AND current_subtotal_paisa IS NOT NULL AND current_subtotal_paisa>=0 AND current_subtotal_paisa<=9007199254740991 AND current_delivery_paisa IS NOT NULL AND current_delivery_paisa>=0 AND current_delivery_paisa<=9007199254740991 AND current_wallet_paisa IS NOT NULL AND current_wallet_paisa>=0 AND current_wallet_paisa<=9007199254740991 AND current_discount_paisa IS NOT NULL AND current_discount_paisa>=0 AND current_discount_paisa<=9007199254740991 AND current_total_paisa=current_subtotal_paisa+current_delivery_paisa-current_wallet_paisa-current_discount_paisa));
