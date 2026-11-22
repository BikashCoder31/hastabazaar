-- Source parity for 0112_cancelled_delivery_allocations. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE order_delivery_adjustments(
 event_id VARCHAR(191) NOT NULL REFERENCES order_cancellation_events(id),order_item_id VARCHAR(191) NOT NULL REFERENCES order_items(id),order_id VARCHAR(191) NOT NULL REFERENCES orders(id),seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>=0),original_quantity BIGINT NOT NULL CHECK(original_quantity>0),policy_version VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,
 PRIMARY KEY(event_id,order_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER delivery_adjustment_original_event BEFORE INSERT ON order_delivery_adjustments FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM order_cancellation_events e JOIN order_items i ON i.order_id=e.order_id WHERE e.id=NEW.event_id AND e.order_id=NEW.order_id AND i.id=NEW.order_item_id AND i.seller_id=NEW.seller_id AND i.quantity=NEW.original_quantity AND i.fulfillment_status<>'cancelled' AND e.created_at=NEW.created_at)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_adjustment_original_event_required'; END IF; END$$
CREATE OR REPLACE TRIGGER delivery_adjustment_no_update BEFORE UPDATE ON order_delivery_adjustments FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_adjustment_history_retained'; END$$
CREATE OR REPLACE TRIGGER delivery_adjustment_no_delete BEFORE DELETE ON order_delivery_adjustments FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_adjustment_history_retained'; END$$
DELIMITER ;
