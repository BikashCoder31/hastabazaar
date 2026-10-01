CREATE TABLE IF NOT EXISTS address_locations (
 address_id TEXT PRIMARY KEY NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,
 latitude REAL NOT NULL, longitude REAL NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS delivery_assignments (
 order_id TEXT PRIMARY KEY NOT NULL REFERENCES orders(id),
 method TEXT NOT NULL CHECK(method IN ('own_rider','courier')),
 rider_user_id TEXT REFERENCES users(id), courier_name TEXT, tracking_url TEXT, tracking_reference TEXT,
 latitude REAL, longitude REAL, accuracy REAL, position_at INTEGER,
 assigned_by TEXT NOT NULL REFERENCES users(id), updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS clear_closed_delivery_location AFTER UPDATE OF status ON orders
WHEN NEW.status <> 'dispatched'
BEGIN UPDATE delivery_assignments SET latitude=NULL,longitude=NULL,accuracy=NULL,position_at=NULL WHERE order_id=NEW.id; END;
