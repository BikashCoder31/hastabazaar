-- Additive security migration. Back up first; never import a base/reset schema.
CREATE TABLE IF NOT EXISTS account_email_verifications (
 user_id VARCHAR(191) PRIMARY KEY NOT NULL, email VARCHAR(254) NOT NULL, verified_at BIGINT NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Preserve existing reservation behavior and serialize against seller/user status changes.
DROP TRIGGER IF EXISTS order_items_require_available_inventory;
DELIMITER $$
CREATE TRIGGER order_items_require_available_inventory BEFORE INSERT ON order_items FOR EACH ROW BEGIN
 DECLARE seller_state VARCHAR(40) DEFAULT NULL;
 DECLARE owner_state VARCHAR(40) DEFAULT NULL;
 DECLARE seller_id_value VARCHAR(191) DEFAULT NULL;
 DECLARE owner_id_value VARCHAR(191) DEFAULT NULL;
 IF NEW.product_id IS NOT NULL THEN
  SELECT seller_id INTO seller_id_value FROM products WHERE id=NEW.product_id;
  SELECT user_id,status INTO owner_id_value,seller_state FROM seller_profiles WHERE id=seller_id_value FOR UPDATE;
  SELECT status INTO owner_state FROM users WHERE id=owner_id_value FOR UPDATE;
  IF seller_state IS NULL OR seller_state<>'approved' OR owner_state IS NULL OR owner_state<>'active' THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_unavailable';
  END IF;
  UPDATE products SET inventory_quantity=inventory_quantity-NEW.quantity
   WHERE id=NEW.product_id AND seller_id=seller_id_value AND status='published' AND inventory_quantity>=NEW.quantity
   AND NOT EXISTS(SELECT 1 FROM product_deletions d WHERE d.product_id=NEW.product_id);
  IF ROW_COUNT() <> 1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_unavailable'; END IF;
 END IF;
END$$
DELIMITER ;
