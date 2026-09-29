-- Additive first-time COD confirmation. Apply before enabling order creation on this runtime. No existing orders are backfilled.
CREATE TABLE IF NOT EXISTS first_cod_reviews (
 order_id VARCHAR(191) PRIMARY KEY NOT NULL,customer_id VARCHAR(191) NOT NULL,total_paisa BIGINT NOT NULL CHECK(total_paisa BETWEEN 500000 AND 9007199254740991),
 status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed')),created_at BIGINT NOT NULL,
 confirmed_by VARCHAR(191) NULL,confirmed_at BIGINT NULL,reason VARCHAR(500) NULL,request_id VARCHAR(100) NULL UNIQUE,
 FOREIGN KEY(order_id) REFERENCES orders(id),FOREIGN KEY(customer_id) REFERENCES users(id),FOREIGN KEY(confirmed_by) REFERENCES users(id),
 KEY idx_first_cod_reviews_status(status,created_at),
 CHECK((status='pending' AND confirmed_by IS NULL AND confirmed_at IS NULL AND reason IS NULL AND request_id IS NULL) OR (status='confirmed' AND confirmed_by IS NOT NULL AND confirmed_at>=created_at AND CHAR_LENGTH(TRIM(reason)) BETWEEN 8 AND 500 AND CHAR_LENGTH(request_id) BETWEEN 1 AND 100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DROP TRIGGER IF EXISTS first_cod_review_immutable;
DELIMITER $$
CREATE TRIGGER first_cod_review_immutable BEFORE UPDATE ON first_cod_reviews FOR EACH ROW BEGIN
 IF OLD.status='confirmed' OR NEW.order_id<>OLD.order_id OR NEW.customer_id<>OLD.customer_id OR NEW.total_paisa<>OLD.total_paisa OR NEW.created_at<>OLD.created_at THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COD confirmation evidence is immutable'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_review_confirm_active;
DELIMITER $$
CREATE TRIGGER first_cod_review_confirm_active BEFORE UPDATE ON first_cod_reviews FOR EACH ROW BEGIN
 IF NEW.status='confirmed' AND NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND status='confirmed') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COD confirmation is no longer available'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_audit_no_update;
DELIMITER $$
CREATE TRIGGER first_cod_audit_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW BEGIN
 IF OLD.action='order.first_cod_confirmed' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COD confirmation audit is immutable'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_audit_no_delete;
DELIMITER $$
CREATE TRIGGER first_cod_audit_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW BEGIN
 IF OLD.action='order.first_cod_confirmed' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COD confirmation audit is immutable'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_orders_insert;
DELIMITER $$
CREATE TRIGGER first_cod_orders_insert BEFORE INSERT ON orders FOR EACH ROW BEGIN
 IF NEW.status IN ('packing','ready_for_pickup','dispatched','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_items_insert;
DELIMITER $$
CREATE TRIGGER first_cod_items_insert BEFORE INSERT ON order_items FOR EACH ROW BEGIN
 IF NEW.fulfillment_status IN ('packing','ready_for_pickup','dispatched','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_jobs_insert;
DELIMITER $$
CREATE TRIGGER first_cod_jobs_insert BEFORE INSERT ON shipping_jobs FOR EACH ROW BEGIN
 IF NEW.direction='outbound' AND NEW.status NOT IN ('cancelled') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_parcels_insert;
DELIMITER $$
CREATE TRIGGER first_cod_parcels_insert BEFORE INSERT ON shipping_parcels FOR EACH ROW BEGIN
 IF (NEW.method IS NOT NULL OR NEW.rider_user_id IS NOT NULL OR NEW.delivered_at IS NOT NULL) AND EXISTS(SELECT 1 FROM shipping_jobs j JOIN first_cod_reviews r ON r.order_id=j.order_id WHERE j.id=NEW.shipping_job_id AND j.direction='outbound' AND r.status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_delivery_insert;
DELIMITER $$
CREATE TRIGGER first_cod_delivery_insert BEFORE INSERT ON delivery_assignments FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_shipments_insert;
DELIMITER $$
CREATE TRIGGER first_cod_shipments_insert BEFORE INSERT ON shipments FOR EACH ROW BEGIN
 IF NEW.status IN ('in_transit','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_orders_update;
DELIMITER $$
CREATE TRIGGER first_cod_orders_update BEFORE UPDATE ON orders FOR EACH ROW BEGIN
 IF NEW.status IN ('packing','ready_for_pickup','dispatched','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_items_update;
DELIMITER $$
CREATE TRIGGER first_cod_items_update BEFORE UPDATE ON order_items FOR EACH ROW BEGIN
 IF NEW.fulfillment_status IN ('packing','ready_for_pickup','dispatched','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_jobs_update;
DELIMITER $$
CREATE TRIGGER first_cod_jobs_update BEFORE UPDATE ON shipping_jobs FOR EACH ROW BEGIN
 IF NEW.direction='outbound' AND NEW.status NOT IN ('cancelled') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_parcels_update;
DELIMITER $$
CREATE TRIGGER first_cod_parcels_update BEFORE UPDATE ON shipping_parcels FOR EACH ROW BEGIN
 IF (NEW.method IS NOT NULL OR NEW.rider_user_id IS NOT NULL OR NEW.delivered_at IS NOT NULL) AND EXISTS(SELECT 1 FROM shipping_jobs j JOIN first_cod_reviews r ON r.order_id=j.order_id WHERE j.id=NEW.shipping_job_id AND j.direction='outbound' AND r.status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_delivery_update;
DELIMITER $$
CREATE TRIGGER first_cod_delivery_update BEFORE UPDATE ON delivery_assignments FOR EACH ROW BEGIN
 IF (NOT (NEW.method <=> OLD.method) OR NOT (NEW.rider_user_id <=> OLD.rider_user_id) OR NOT (NEW.courier_name <=> OLD.courier_name) OR NOT (NEW.tracking_reference <=> OLD.tracking_reference) OR NOT (NEW.tracking_url <=> OLD.tracking_url) OR NEW.latitude IS NOT NULL OR NEW.longitude IS NOT NULL) AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_shipments_update;
DELIMITER $$
CREATE TRIGGER first_cod_shipments_update BEFORE UPDATE ON shipments FOR EACH ROW BEGIN
 IF NEW.status IN ('in_transit','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
