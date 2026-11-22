-- Source only. No automatic backfill or stock creation; explicit reviewed mapping owns the transition.
CREATE TABLE product_offer_versions(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),matrix_json TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE product_offer_decisions(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),version_id TEXT NOT NULL REFERENCES product_offer_versions(id),action TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TRIGGER offer_decision_immutable BEFORE UPDATE ON product_offer_decisions BEGIN SELECT RAISE(ABORT,'offer_decision_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER offer_decision_retained BEFORE DELETE ON product_offer_decisions BEGIN SELECT RAISE(ABORT,'offer_decision_retained'); END;
--> statement-breakpoint
CREATE TABLE product_offer_heads(product_id TEXT PRIMARY KEY REFERENCES products(id),revision INTEGER NOT NULL CHECK(revision>=0),candidate_version_id TEXT REFERENCES product_offer_versions(id),current_version_id TEXT REFERENCES product_offer_versions(id),inventory_mapped INTEGER NOT NULL DEFAULT 0 CHECK(inventory_mapped IN (0,1)),updated_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE product_offer_identities(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),platform_sku TEXT NOT NULL UNIQUE,physical_json TEXT NOT NULL,stock_family_key TEXT NOT NULL,base_unit TEXT NOT NULL CHECK(base_unit IN ('piece','gram','millilitre')),units_per_offer INTEGER NOT NULL CHECK(units_per_offer>0),created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX product_offer_identity_product ON product_offer_identities(product_id);
--> statement-breakpoint
CREATE TABLE product_offer_current(offer_id TEXT PRIMARY KEY REFERENCES product_offer_identities(id),product_id TEXT NOT NULL REFERENCES products(id),version_id TEXT NOT NULL REFERENCES product_offer_versions(id),offer_json TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX product_offer_current_product ON product_offer_current(product_id);
--> statement-breakpoint
CREATE TABLE offer_stock(offer_id TEXT PRIMARY KEY REFERENCES product_offer_identities(id),available INTEGER NOT NULL CHECK(available>=0),reserved INTEGER NOT NULL CHECK(reserved>=0),revision INTEGER NOT NULL CHECK(revision>=0),paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0,1)),needs_reconfirmation INTEGER NOT NULL DEFAULT 0 CHECK(needs_reconfirmation IN (0,1)),confirmed_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE offer_stock_events(id TEXT PRIMARY KEY,offer_id TEXT NOT NULL REFERENCES product_offer_identities(id),kind TEXT NOT NULL,available_delta INTEGER NOT NULL,reserved_delta INTEGER NOT NULL,related_offer_id TEXT REFERENCES product_offer_identities(id),reason TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX offer_stock_events_history ON offer_stock_events(offer_id,created_at);
--> statement-breakpoint
CREATE TABLE offer_stock_reservations(id TEXT PRIMARY KEY,offer_id TEXT NOT NULL REFERENCES product_offer_identities(id),version_id TEXT NOT NULL REFERENCES product_offer_versions(id),customer_id TEXT REFERENCES users(id),quantity INTEGER NOT NULL CHECK(quantity>0),snapshot_json TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('reserved','released','consumed')),revision INTEGER NOT NULL CHECK(revision>=0),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX offer_reservation_offer ON offer_stock_reservations(offer_id,state);
--> statement-breakpoint
CREATE TABLE order_item_offer_snapshots(order_item_id TEXT PRIMARY KEY REFERENCES order_items(id),offer_id TEXT NOT NULL REFERENCES product_offer_identities(id),version_id TEXT NOT NULL REFERENCES product_offer_versions(id),reservation_id TEXT UNIQUE REFERENCES offer_stock_reservations(id),snapshot_json TEXT NOT NULL,legacy_mapping INTEGER NOT NULL CHECK(legacy_mapping IN (0,1)),created_at INTEGER NOT NULL);
--> statement-breakpoint
ALTER TABLE order_items ADD COLUMN offer_reservation_id TEXT REFERENCES offer_stock_reservations(id);
--> statement-breakpoint
CREATE UNIQUE INDEX order_item_offer_reservation_unique ON order_items(offer_reservation_id);
--> statement-breakpoint
DROP TRIGGER order_items_require_available_inventory;
--> statement-breakpoint
DROP TRIGGER order_items_reserve_inventory;
--> statement-breakpoint
CREATE TRIGGER order_items_require_available_inventory BEFORE INSERT ON order_items BEGIN
 SELECT CASE WHEN NEW.product_id IS NULL OR NOT EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND status='published') THEN RAISE(ABORT,'product_unavailable') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM product_offer_heads WHERE product_id=NEW.product_id AND inventory_mapped=1) AND (NEW.offer_reservation_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND inventory_quantity>=NEW.quantity)) THEN RAISE(ABORT,'product_unavailable') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM product_offer_heads WHERE product_id=NEW.product_id AND inventory_mapped=1) AND NOT EXISTS(SELECT 1 FROM offer_stock_reservations r JOIN product_offer_identities i ON i.id=r.offer_id JOIN orders o ON o.id=NEW.order_id WHERE r.id=NEW.offer_reservation_id AND i.product_id=NEW.product_id AND r.state='reserved' AND r.quantity=NEW.quantity AND r.customer_id IS o.customer_id AND json_extract(r.snapshot_json,'$.sellingPaisa')=NEW.unit_price_paisa AND json_extract(r.snapshot_json,'$.sku')=NEW.sku_snapshot) THEN RAISE(ABORT,'exact_offer_reservation_required') END;
END;
--> statement-breakpoint
CREATE TRIGGER order_items_reserve_inventory AFTER INSERT ON order_items WHEN NEW.offer_reservation_id IS NULL BEGIN UPDATE products SET inventory_quantity=inventory_quantity-NEW.quantity,updated_at=CAST(strftime('%s','now') AS integer)*1000 WHERE id=NEW.product_id; END;
--> statement-breakpoint
CREATE TRIGGER order_items_capture_offer AFTER INSERT ON order_items WHEN NEW.offer_reservation_id IS NOT NULL BEGIN INSERT INTO order_item_offer_snapshots(order_item_id,offer_id,version_id,reservation_id,snapshot_json,legacy_mapping,created_at) SELECT NEW.id,r.offer_id,r.version_id,r.id,r.snapshot_json,0,NEW.created_at FROM offer_stock_reservations r WHERE r.id=NEW.offer_reservation_id; END;
--> statement-breakpoint
CREATE TRIGGER order_items_offer_reference_immutable BEFORE UPDATE ON order_items WHEN NEW.offer_reservation_id IS NOT OLD.offer_reservation_id OR (OLD.offer_reservation_id IS NOT NULL AND (NEW.product_id IS NOT OLD.product_id OR NEW.seller_id<>OLD.seller_id OR NEW.quantity<>OLD.quantity OR NEW.unit_price_paisa<>OLD.unit_price_paisa OR NEW.sku_snapshot<>OLD.sku_snapshot)) BEGIN SELECT RAISE(ABORT,'order_offer_reference_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER offer_versions_immutable BEFORE UPDATE ON product_offer_versions BEGIN SELECT RAISE(ABORT,'offer_version_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER offer_versions_retained BEFORE DELETE ON product_offer_versions BEGIN SELECT RAISE(ABORT,'offer_version_retained'); END;
--> statement-breakpoint
CREATE TRIGGER offer_identities_immutable BEFORE UPDATE ON product_offer_identities BEGIN SELECT RAISE(ABORT,'offer_identity_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER offer_identities_retained BEFORE DELETE ON product_offer_identities BEGIN SELECT RAISE(ABORT,'offer_identity_retained'); END;
--> statement-breakpoint
CREATE TRIGGER offer_heads_revision BEFORE UPDATE ON product_offer_heads WHEN NEW.product_id<>OLD.product_id OR NEW.revision<>OLD.revision+1 OR NEW.inventory_mapped<OLD.inventory_mapped BEGIN SELECT RAISE(ABORT,'offer_head_revision'); END;
--> statement-breakpoint
CREATE TRIGGER offer_stock_revision BEFORE UPDATE ON offer_stock WHEN NEW.offer_id<>OLD.offer_id OR NEW.revision<>OLD.revision+1 BEGIN SELECT RAISE(ABORT,'offer_stock_revision'); END;
--> statement-breakpoint
CREATE TRIGGER offer_stock_retained BEFORE DELETE ON offer_stock BEGIN SELECT RAISE(ABORT,'offer_stock_retained'); END;
--> statement-breakpoint
CREATE TRIGGER offer_stock_event_immutable BEFORE UPDATE ON offer_stock_events BEGIN SELECT RAISE(ABORT,'offer_event_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER offer_stock_event_retained BEFORE DELETE ON offer_stock_events BEGIN SELECT RAISE(ABORT,'offer_event_retained'); END;
--> statement-breakpoint
CREATE TRIGGER offer_reservation_immutable BEFORE UPDATE ON offer_stock_reservations WHEN NEW.id<>OLD.id OR NEW.offer_id<>OLD.offer_id OR NEW.version_id<>OLD.version_id OR NEW.customer_id IS NOT OLD.customer_id OR NEW.quantity<>OLD.quantity OR NEW.snapshot_json<>OLD.snapshot_json OR NEW.created_at<>OLD.created_at OR OLD.state<>'reserved' OR NEW.state NOT IN ('released','consumed') OR NEW.revision<>OLD.revision+1 BEGIN SELECT RAISE(ABORT,'offer_reservation_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER offer_reservation_retained BEFORE DELETE ON offer_stock_reservations BEGIN SELECT RAISE(ABORT,'offer_reservation_retained'); END;
--> statement-breakpoint
CREATE TRIGGER order_offer_snapshot_immutable BEFORE UPDATE ON order_item_offer_snapshots BEGIN SELECT RAISE(ABORT,'order_offer_snapshot_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER order_offer_snapshot_retained BEFORE DELETE ON order_item_offer_snapshots BEGIN SELECT RAISE(ABORT,'order_offer_snapshot_retained'); END;
--> statement-breakpoint
CREATE TRIGGER mapped_product_inventory_protected BEFORE UPDATE OF inventory_quantity ON products WHEN NEW.inventory_quantity<>OLD.inventory_quantity AND EXISTS(SELECT 1 FROM product_offer_heads WHERE product_id=OLD.id AND inventory_mapped=1) BEGIN SELECT RAISE(ABORT,'offer_inventory_requires_exact_offer'); END;
