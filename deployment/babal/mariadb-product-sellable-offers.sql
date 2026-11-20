-- Source-only counterpart of 0088. No backfill, execution, or automatic stock creation.
CREATE TABLE product_offer_versions (id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL ,matrix_json LONGTEXT NOT NULL,created_by VARCHAR(191) NOT NULL ,created_at BIGINT NOT NULL, FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (created_by) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_offer_decisions (id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL ,version_id VARCHAR(191) NOT NULL ,action VARCHAR(191) NOT NULL,actor_id VARCHAR(191) NOT NULL ,reason VARCHAR(1000) NOT NULL,created_at BIGINT NOT NULL, FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (version_id) REFERENCES product_offer_versions(id), FOREIGN KEY (actor_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_offer_heads (product_id VARCHAR(191) PRIMARY KEY ,revision BIGINT NOT NULL CHECK(revision>=0),candidate_version_id VARCHAR(191) ,current_version_id VARCHAR(191) ,inventory_mapped BIGINT NOT NULL DEFAULT 0 CHECK(inventory_mapped IN (0,1)),updated_at BIGINT NOT NULL, FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (candidate_version_id) REFERENCES product_offer_versions(id), FOREIGN KEY (current_version_id) REFERENCES product_offer_versions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_offer_identities (id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL,platform_sku VARCHAR(191) NOT NULL UNIQUE,physical_json LONGTEXT NOT NULL,stock_family_key VARCHAR(191) NOT NULL,base_unit VARCHAR(191) NOT NULL CHECK(BINARY base_unit IN ('piece','gram','millilitre')),units_per_offer BIGINT NOT NULL CHECK(units_per_offer>0),created_at BIGINT NOT NULL, FOREIGN KEY (product_id) REFERENCES products(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX product_offer_identity_product ON product_offer_identities(product_id);

CREATE TABLE product_offer_current (offer_id VARCHAR(191) PRIMARY KEY ,product_id VARCHAR(191) NOT NULL ,version_id VARCHAR(191) NOT NULL ,offer_json LONGTEXT NOT NULL, FOREIGN KEY (offer_id) REFERENCES product_offer_identities(id), FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (version_id) REFERENCES product_offer_versions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX product_offer_current_product ON product_offer_current(product_id);

CREATE TABLE offer_stock (offer_id VARCHAR(191) PRIMARY KEY ,available BIGINT NOT NULL CHECK(available>=0),reserved BIGINT NOT NULL CHECK(reserved>=0),revision BIGINT NOT NULL CHECK(revision>=0),paused BIGINT NOT NULL DEFAULT 0 CHECK(paused IN (0,1)),needs_reconfirmation BIGINT NOT NULL DEFAULT 0 CHECK(needs_reconfirmation IN (0,1)),confirmed_at BIGINT NOT NULL,updated_at BIGINT NOT NULL, FOREIGN KEY (offer_id) REFERENCES product_offer_identities(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE offer_stock_events (id VARCHAR(191) PRIMARY KEY,offer_id VARCHAR(191) NOT NULL ,kind VARCHAR(191) NOT NULL,available_delta BIGINT NOT NULL,reserved_delta BIGINT NOT NULL,related_offer_id VARCHAR(191) ,reason VARCHAR(1000) NOT NULL,actor_id VARCHAR(191) NOT NULL ,request_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL, FOREIGN KEY (offer_id) REFERENCES product_offer_identities(id), FOREIGN KEY (related_offer_id) REFERENCES product_offer_identities(id), FOREIGN KEY (actor_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX offer_stock_events_history ON offer_stock_events(offer_id,created_at);

CREATE TABLE offer_stock_reservations (id VARCHAR(191) PRIMARY KEY,offer_id VARCHAR(191) NOT NULL ,version_id VARCHAR(191) NOT NULL ,customer_id VARCHAR(191) ,quantity BIGINT NOT NULL CHECK(quantity>0),snapshot_json LONGTEXT NOT NULL,state VARCHAR(191) NOT NULL CHECK(BINARY state IN ('reserved','released','consumed')),revision BIGINT NOT NULL CHECK(revision>=0),created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL, FOREIGN KEY (offer_id) REFERENCES product_offer_identities(id), FOREIGN KEY (version_id) REFERENCES product_offer_versions(id), FOREIGN KEY (customer_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX offer_reservation_offer ON offer_stock_reservations(offer_id,state);

CREATE TABLE order_item_offer_snapshots (order_item_id VARCHAR(191) PRIMARY KEY ,offer_id VARCHAR(191) NOT NULL ,version_id VARCHAR(191) NOT NULL ,reservation_id VARCHAR(191) UNIQUE ,snapshot_json LONGTEXT NOT NULL,legacy_mapping BIGINT NOT NULL CHECK(legacy_mapping IN (0,1)),created_at BIGINT NOT NULL, FOREIGN KEY (order_item_id) REFERENCES order_items(id), FOREIGN KEY (offer_id) REFERENCES product_offer_identities(id), FOREIGN KEY (version_id) REFERENCES product_offer_versions(id), FOREIGN KEY (reservation_id) REFERENCES offer_stock_reservations(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE order_items ADD COLUMN offer_reservation_id VARCHAR(191), ADD CONSTRAINT order_items_offer_reservation_fk FOREIGN KEY (offer_reservation_id) REFERENCES offer_stock_reservations(id);
CREATE UNIQUE INDEX order_item_offer_reservation_unique ON order_items(offer_reservation_id);
DROP TRIGGER IF EXISTS order_items_require_available_inventory;
DROP TRIGGER IF EXISTS order_items_reserve_inventory;
DELIMITER $$
CREATE TRIGGER order_items_require_available_inventory BEFORE INSERT ON order_items FOR EACH ROW BEGIN
 IF NEW.product_id IS NULL OR NOT EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND status='published') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM product_offer_heads WHERE product_id=NEW.product_id AND inventory_mapped=1) AND (NEW.offer_reservation_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND inventory_quantity>=NEW.quantity)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM product_offer_heads WHERE product_id=NEW.product_id AND inventory_mapped=1) AND NOT EXISTS(SELECT 1 FROM offer_stock_reservations r JOIN product_offer_identities i ON i.id=r.offer_id JOIN orders o ON o.id=NEW.order_id WHERE r.id=NEW.offer_reservation_id AND i.product_id=NEW.product_id AND r.state='reserved' AND r.quantity=NEW.quantity AND r.customer_id <=> o.customer_id AND JSON_UNQUOTE(JSON_EXTRACT(r.snapshot_json,'$.sellingPaisa'))=NEW.unit_price_paisa AND BINARY JSON_UNQUOTE(JSON_EXTRACT(r.snapshot_json,'$.sku'))=BINARY NEW.sku_snapshot) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='exact_offer_reservation_required'; END IF;
END$$
CREATE TRIGGER order_items_reserve_inventory AFTER INSERT ON order_items FOR EACH ROW BEGIN
 IF NEW.offer_reservation_id IS NULL THEN
  UPDATE products SET inventory_quantity=inventory_quantity-NEW.quantity,updated_at=UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 WHERE id=NEW.product_id AND inventory_quantity>=NEW.quantity;
  IF ROW_COUNT()<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_unavailable'; END IF;
 END IF;
END$$
CREATE TRIGGER order_items_capture_offer AFTER INSERT ON order_items FOR EACH ROW BEGIN
 IF NEW.offer_reservation_id IS NOT NULL THEN INSERT INTO order_item_offer_snapshots(order_item_id,offer_id,version_id,reservation_id,snapshot_json,legacy_mapping,created_at) SELECT NEW.id,r.offer_id,r.version_id,r.id,r.snapshot_json,0,NEW.created_at FROM offer_stock_reservations r WHERE r.id=NEW.offer_reservation_id; END IF;
END$$
CREATE TRIGGER order_items_offer_reference_immutable BEFORE UPDATE ON order_items FOR EACH ROW BEGIN
 IF NOT (BINARY NEW.offer_reservation_id <=> BINARY OLD.offer_reservation_id) OR (OLD.offer_reservation_id IS NOT NULL AND (NOT (BINARY NEW.product_id <=> BINARY OLD.product_id) OR BINARY NEW.seller_id<>BINARY OLD.seller_id OR NEW.quantity<>OLD.quantity OR NEW.unit_price_paisa<>OLD.unit_price_paisa OR BINARY NEW.sku_snapshot<>BINARY OLD.sku_snapshot)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_offer_reference_immutable'; END IF;
END$$
CREATE TRIGGER offer_decision_immutable BEFORE UPDATE ON product_offer_decisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_decision_immutable'; END$$
CREATE TRIGGER offer_decision_retained BEFORE DELETE ON product_offer_decisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_decision_retained'; END$$
CREATE TRIGGER offer_versions_immutable BEFORE UPDATE ON product_offer_versions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_version_immutable'; END$$
CREATE TRIGGER offer_versions_retained BEFORE DELETE ON product_offer_versions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_version_retained'; END$$
CREATE TRIGGER offer_identities_immutable BEFORE UPDATE ON product_offer_identities FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_identity_immutable'; END$$
CREATE TRIGGER offer_identities_retained BEFORE DELETE ON product_offer_identities FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_identity_retained'; END$$
CREATE TRIGGER offer_heads_revision BEFORE UPDATE ON product_offer_heads FOR EACH ROW BEGIN IF BINARY NEW.product_id<>BINARY OLD.product_id OR NEW.revision<>OLD.revision+1 OR NEW.inventory_mapped<OLD.inventory_mapped THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_head_revision'; END IF; END$$
CREATE TRIGGER offer_stock_revision BEFORE UPDATE ON offer_stock FOR EACH ROW BEGIN IF BINARY NEW.offer_id<>BINARY OLD.offer_id OR NEW.revision<>OLD.revision+1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_stock_revision'; END IF; END$$
CREATE TRIGGER offer_stock_retained BEFORE DELETE ON offer_stock FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_stock_retained'; END$$
CREATE TRIGGER offer_stock_event_immutable BEFORE UPDATE ON offer_stock_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_event_immutable'; END$$
CREATE TRIGGER offer_stock_event_retained BEFORE DELETE ON offer_stock_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_event_retained'; END$$
CREATE TRIGGER offer_reservation_immutable BEFORE UPDATE ON offer_stock_reservations FOR EACH ROW BEGIN IF BINARY NEW.id<>BINARY OLD.id OR BINARY NEW.offer_id<>BINARY OLD.offer_id OR BINARY NEW.version_id<>BINARY OLD.version_id OR NOT (BINARY NEW.customer_id <=> BINARY OLD.customer_id) OR NEW.quantity<>OLD.quantity OR BINARY NEW.snapshot_json<>BINARY OLD.snapshot_json OR NEW.created_at<>OLD.created_at OR BINARY OLD.state<>'reserved' OR BINARY NEW.state NOT IN ('released','consumed') OR NEW.revision<>OLD.revision+1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_reservation_immutable'; END IF; END$$
CREATE TRIGGER offer_reservation_retained BEFORE DELETE ON offer_stock_reservations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_reservation_retained'; END$$
CREATE TRIGGER order_offer_snapshot_immutable BEFORE UPDATE ON order_item_offer_snapshots FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_offer_snapshot_immutable'; END$$
CREATE TRIGGER order_offer_snapshot_retained BEFORE DELETE ON order_item_offer_snapshots FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_offer_snapshot_retained'; END$$
CREATE TRIGGER mapped_product_inventory_protected BEFORE UPDATE ON products FOR EACH ROW BEGIN IF NEW.inventory_quantity<>OLD.inventory_quantity AND EXISTS(SELECT 1 FROM product_offer_heads WHERE product_id=OLD.id AND inventory_mapped=1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_inventory_requires_exact_offer'; END IF; END$$
DELIMITER ;
