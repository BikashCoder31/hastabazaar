-- Owner applied. Apply only to an approved database copy. Starts without partner rows.
CREATE TABLE delivery_partners (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(name)) BETWEEN 2 AND 120),
  status TEXT NOT NULL CHECK(status IN ('in_use','setting_up','not_in_use')),
  booking_mode TEXT NOT NULL DEFAULT 'manual' CHECK(booking_mode IN ('manual','api')),
  collects_cod INTEGER NOT NULL CHECK(collects_cod IN (0,1)),
  tracking_pattern TEXT,
  default_slot INTEGER UNIQUE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK(default_slot IS NULL OR (default_slot=1 AND status='in_use' AND booking_mode='manual'))
);
--> statement-breakpoint
ALTER TABLE shipping_parcels ADD COLUMN delivery_partner_id TEXT REFERENCES delivery_partners(id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX idx_shipping_parcels_delivery_partner ON shipping_parcels(delivery_partner_id);
