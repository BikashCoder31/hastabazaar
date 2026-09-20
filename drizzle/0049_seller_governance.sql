CREATE TABLE IF NOT EXISTS seller_restrictions (
  seller_id TEXT PRIMARY KEY NOT NULL REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL CHECK (mode IN ('active','suspended','disabled')),
  suspended_until INTEGER,
  obligation_mode TEXT NOT NULL CHECK (obligation_mode IN ('allow_existing','admin_review','stop_fulfillment')),
  reason_code TEXT NOT NULL,
  private_reason TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  applied_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  applied_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((mode='suspended' AND suspended_until IS NOT NULL) OR (mode<>'suspended' AND suspended_until IS NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_seller_restrictions_mode_until ON seller_restrictions(mode,suspended_until);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS seller_restriction_events (
  id TEXT PRIMARY KEY NOT NULL,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  from_mode TEXT NOT NULL,
  to_mode TEXT NOT NULL,
  suspended_until INTEGER,
  obligation_mode TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  private_reason TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_seller_restriction_events_seller ON seller_restriction_events(seller_id,created_at);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS seller_restriction_events_no_update BEFORE UPDATE ON seller_restriction_events BEGIN SELECT RAISE(ABORT,'Seller restriction history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS seller_restriction_events_no_delete BEFORE DELETE ON seller_restriction_events BEGIN SELECT RAISE(ABORT,'Seller restriction history is immutable'); END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS seller_deletion_preflights (
  id TEXT PRIMARY KEY NOT NULL,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('blocked','awaiting_retention_policy')),
  outstanding_json TEXT NOT NULL,
  retention_categories_json TEXT NOT NULL,
  requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_seller_deletion_preflight_seller ON seller_deletion_preflights(seller_id,created_at);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS seller_deletion_preflights_no_update BEFORE UPDATE ON seller_deletion_preflights BEGIN SELECT RAISE(ABORT,'Seller deletion preflights are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS seller_deletion_preflights_no_delete BEFORE DELETE ON seller_deletion_preflights BEGIN SELECT RAISE(ABORT,'Seller deletion preflights are immutable'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS order_items_require_eligible_seller;
--> statement-breakpoint
CREATE TRIGGER order_items_require_eligible_seller BEFORE INSERT ON order_items
WHEN NEW.product_id IS NOT NULL AND NOT EXISTS (
 SELECT 1
 FROM products p
 JOIN seller_profiles s ON s.id=p.seller_id
 JOIN users u ON u.id=s.user_id
 LEFT JOIN seller_participation_profiles participation ON participation.seller_id=s.id
 WHERE p.id=NEW.product_id
   AND p.status='published'
   AND u.status='active'
   AND (
     (s.status='approved' AND (participation.participation_route IS NULL OR participation.participation_route='registered_seller'))
     OR (
       participation.participation_route='managed_maker'
       AND participation.application_stage='active'
       AND participation.commercial_model IS NOT NULL
       AND participation.legal_seller_reference IS NOT NULL
       AND participation.invoice_issuer_reference IS NOT NULL
       AND participation.payout_beneficiary_reference IS NOT NULL
       AND participation.managed_agreement_version IS NOT NULL
       AND participation.managed_agreement_accepted_at IS NOT NULL
     )
   )
   AND NOT EXISTS (SELECT 1 FROM product_deletions d WHERE d.product_id=p.id)
   AND NOT EXISTS (
     SELECT 1 FROM seller_restrictions restriction
     WHERE restriction.seller_id=s.id AND (
       restriction.mode='disabled'
       OR (restriction.mode='suspended' AND restriction.suspended_until>CAST(strftime('%s','now') AS INTEGER)*1000)
     )
   )
)
BEGIN SELECT RAISE(ABORT, 'product_unavailable'); END;
