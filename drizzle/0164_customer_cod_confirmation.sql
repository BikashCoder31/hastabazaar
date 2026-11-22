-- Apply only to an approved copy, in one transaction as documented in the fix-list board.
-- SQLite must rebuild the review table to admit low-value held orders without changing
-- the historical first-order rule. Copy all existing evidence before the table swap.
CREATE TABLE first_cod_reviews_0164 (
 order_id TEXT PRIMARY KEY NOT NULL REFERENCES orders(id),
 customer_id TEXT NOT NULL REFERENCES users(id),
 total_paisa INTEGER NOT NULL CHECK(typeof(total_paisa)='integer' AND total_paisa BETWEEN 0 AND 9007199254740991),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed')),
 created_at INTEGER NOT NULL,
 confirmed_by TEXT REFERENCES users(id), confirmed_at INTEGER, reason TEXT, request_id TEXT UNIQUE,
 hold_source TEXT NOT NULL DEFAULT 'first_order' CHECK(hold_source IN ('first_order','customer_flag')),
 CHECK(hold_source='customer_flag' OR total_paisa>=500000),
 CHECK((status='pending' AND confirmed_by IS NULL AND confirmed_at IS NULL AND reason IS NULL AND request_id IS NULL) OR (status='confirmed' AND confirmed_by IS NOT NULL AND confirmed_at>=created_at AND length(trim(reason)) BETWEEN 8 AND 500 AND length(request_id) BETWEEN 1 AND 100))
);
--> statement-breakpoint
INSERT INTO first_cod_reviews_0164(order_id,customer_id,total_paisa,status,created_at,confirmed_by,confirmed_at,reason,request_id)
SELECT order_id,customer_id,total_paisa,status,created_at,confirmed_by,confirmed_at,reason,request_id
  FROM first_cod_reviews;
--> statement-breakpoint
DROP TRIGGER first_cod_orders_insert;
--> statement-breakpoint
DROP TRIGGER first_cod_items_insert;
--> statement-breakpoint
DROP TRIGGER first_cod_jobs_insert;
--> statement-breakpoint
DROP TRIGGER first_cod_parcels_insert;
--> statement-breakpoint
DROP TRIGGER first_cod_delivery_insert;
--> statement-breakpoint
DROP TRIGGER first_cod_shipments_insert;
--> statement-breakpoint
DROP TRIGGER first_cod_orders_update;
--> statement-breakpoint
DROP TRIGGER first_cod_items_update;
--> statement-breakpoint
DROP TRIGGER first_cod_jobs_update;
--> statement-breakpoint
DROP TRIGGER first_cod_parcels_update;
--> statement-breakpoint
DROP TRIGGER first_cod_delivery_update;
--> statement-breakpoint
DROP TRIGGER first_cod_shipments_update;
--> statement-breakpoint
DROP TABLE first_cod_reviews;
--> statement-breakpoint
ALTER TABLE first_cod_reviews_0164 RENAME TO first_cod_reviews;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_first_cod_reviews_status ON first_cod_reviews(status,created_at);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS first_cod_review_immutable BEFORE UPDATE ON first_cod_reviews WHEN OLD.status='confirmed' OR NEW.order_id<>OLD.order_id OR NEW.customer_id<>OLD.customer_id OR NEW.total_paisa<>OLD.total_paisa OR NEW.created_at<>OLD.created_at OR NEW.hold_source<>OLD.hold_source BEGIN SELECT RAISE(ABORT,'COD confirmation evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS first_cod_review_no_delete BEFORE DELETE ON first_cod_reviews BEGIN SELECT RAISE(ABORT,'COD confirmation evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS first_cod_review_confirm_active BEFORE UPDATE ON first_cod_reviews WHEN NEW.status='confirmed' AND NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND status='confirmed') BEGIN SELECT RAISE(ABORT,'COD confirmation is no longer available'); END;
--> statement-breakpoint
-- Additive guard: SQL CHECK accepts UNKNOWN for nullable values. Require complete confirmation evidence without rewriting any existing row.
CREATE TRIGGER IF NOT EXISTS first_cod_evidence_complete_insert BEFORE INSERT ON first_cod_reviews WHEN NEW.status='confirmed' AND (NEW.confirmed_by IS NULL OR NEW.confirmed_at IS NULL OR NEW.reason IS NULL OR NEW.request_id IS NULL OR NEW.confirmed_at<NEW.created_at OR length(trim(NEW.reason)) NOT BETWEEN 8 AND 500 OR length(NEW.request_id) NOT BETWEEN 1 AND 100) BEGIN SELECT RAISE(ABORT,'COD confirmation requires complete staff evidence'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS first_cod_evidence_complete_update BEFORE UPDATE ON first_cod_reviews WHEN NEW.status='confirmed' AND (NEW.confirmed_by IS NULL OR NEW.confirmed_at IS NULL OR NEW.reason IS NULL OR NEW.request_id IS NULL OR NEW.confirmed_at<NEW.created_at OR length(trim(NEW.reason)) NOT BETWEEN 8 AND 500 OR length(NEW.request_id) NOT BETWEEN 1 AND 100) BEGIN SELECT RAISE(ABORT,'COD confirmation requires complete staff evidence'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS first_cod_orders_insert BEFORE INSERT ON orders WHEN NEW.status IN ('packing','ready_for_pickup','dispatched','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.id AND status='pending') BEGIN SELECT RAISE(ABORT,'First-time COD order awaits staff confirmation'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS first_cod_items_insert BEFORE INSERT ON order_items WHEN NEW.fulfillment_status IN ('packing','ready_for_pickup','dispatched','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') BEGIN SELECT RAISE(ABORT,'First-time COD order awaits staff confirmation'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS first_cod_jobs_insert BEFORE INSERT ON shipping_jobs WHEN NEW.direction='outbound' AND NEW.status NOT IN ('cancelled') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') BEGIN SELECT RAISE(ABORT,'First-time COD order awaits staff confirmation'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS first_cod_parcels_insert BEFORE INSERT ON shipping_parcels WHEN (NEW.method IS NOT NULL OR NEW.rider_user_id IS NOT NULL OR NEW.delivered_at IS NOT NULL) AND EXISTS(SELECT 1 FROM shipping_jobs j JOIN first_cod_reviews r ON r.order_id=j.order_id WHERE j.id=NEW.shipping_job_id AND j.direction='outbound' AND r.status='pending') BEGIN SELECT RAISE(ABORT,'First-time COD order awaits staff confirmation'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS first_cod_delivery_insert BEFORE INSERT ON delivery_assignments WHEN EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') BEGIN SELECT RAISE(ABORT,'First-time COD order awaits staff confirmation'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS first_cod_shipments_insert BEFORE INSERT ON shipments WHEN NEW.status IN ('in_transit','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') BEGIN SELECT RAISE(ABORT,'First-time COD order awaits staff confirmation'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS first_cod_orders_update BEFORE UPDATE ON orders WHEN NEW.status IN ('packing','ready_for_pickup','dispatched','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.id AND status='pending') BEGIN SELECT RAISE(ABORT,'First-time COD order awaits staff confirmation'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS first_cod_items_update BEFORE UPDATE ON order_items WHEN NEW.fulfillment_status IN ('packing','ready_for_pickup','dispatched','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') BEGIN SELECT RAISE(ABORT,'First-time COD order awaits staff confirmation'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS first_cod_jobs_update BEFORE UPDATE ON shipping_jobs WHEN NEW.direction='outbound' AND NEW.status NOT IN ('cancelled') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') BEGIN SELECT RAISE(ABORT,'First-time COD order awaits staff confirmation'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS first_cod_parcels_update BEFORE UPDATE ON shipping_parcels WHEN (NEW.method IS NOT NULL OR NEW.rider_user_id IS NOT NULL OR NEW.delivered_at IS NOT NULL) AND EXISTS(SELECT 1 FROM shipping_jobs j JOIN first_cod_reviews r ON r.order_id=j.order_id WHERE j.id=NEW.shipping_job_id AND j.direction='outbound' AND r.status='pending') BEGIN SELECT RAISE(ABORT,'First-time COD order awaits staff confirmation'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS first_cod_delivery_update BEFORE UPDATE ON delivery_assignments WHEN (NEW.method IS NOT OLD.method OR NEW.rider_user_id IS NOT OLD.rider_user_id OR NEW.courier_name IS NOT OLD.courier_name OR NEW.tracking_reference IS NOT OLD.tracking_reference OR NEW.tracking_url IS NOT OLD.tracking_url OR NEW.latitude IS NOT NULL OR NEW.longitude IS NOT NULL) AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') BEGIN SELECT RAISE(ABORT,'First-time COD order awaits staff confirmation'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS first_cod_shipments_update BEFORE UPDATE ON shipments WHEN NEW.status IN ('in_transit','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') BEGIN SELECT RAISE(ABORT,'First-time COD order awaits staff confirmation'); END;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN cod_confirmation_required INTEGER NOT NULL DEFAULT 0
  CHECK (cod_confirmation_required IN (0, 1));
