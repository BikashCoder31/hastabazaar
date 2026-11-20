-- Source parity for 0106_original_delivery_allocations. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE order_delivery_allocations(
 order_item_id VARCHAR(191) PRIMARY KEY REFERENCES order_items(id),
 order_id VARCHAR(191) NOT NULL REFERENCES orders(id),
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>=0),
 original_quantity BIGINT NOT NULL CHECK(original_quantity>0),
 policy_version VARCHAR(191) NOT NULL CHECK(policy_version='original_seller_item_largest_remainder_v1'),
 created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX order_delivery_allocations_order_idx ON order_delivery_allocations(order_id);

DELIMITER $$
CREATE OR REPLACE TRIGGER order_delivery_allocation_no_update BEFORE UPDATE ON order_delivery_allocations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Original delivery allocation is immutable'; END$$
CREATE OR REPLACE TRIGGER order_delivery_allocation_no_delete BEFORE DELETE ON order_delivery_allocations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Original delivery allocation is immutable'; END$$
DELIMITER ;
