ALTER TABLE seller_participation_profiles ADD COLUMN managed_agreement_version TEXT;
--> statement-breakpoint
ALTER TABLE seller_participation_profiles ADD COLUMN managed_agreement_language TEXT CHECK(managed_agreement_language IS NULL OR managed_agreement_language IN ('en','ne'));
--> statement-breakpoint
ALTER TABLE seller_participation_profiles ADD COLUMN managed_agreement_accepted_at INTEGER;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS managed_commercial_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  order_item_id TEXT NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE RESTRICT,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  participation_route TEXT NOT NULL CHECK(participation_route='managed_maker'),
  commercial_model TEXT NOT NULL CHECK(commercial_model IN ('managed_sale_linked_percentage_v1','managed_fixed_supplier_price_v1')),
  legal_seller_reference TEXT NOT NULL,
  invoice_issuer_reference TEXT NOT NULL,
  payout_beneficiary_reference TEXT NOT NULL,
  agreement_version TEXT NOT NULL,
  agreement_language TEXT NOT NULL CHECK(agreement_language IN ('en','ne')),
  terms_setting_version_id TEXT,
  delivery_hold_days INTEGER NOT NULL DEFAULT 7 CHECK(delivery_hold_days BETWEEN 0 AND 365),
  hold_setting_version_id TEXT,
  product_value_paisa INTEGER NOT NULL CHECK(product_value_paisa>=0),
  maker_funded_discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(maker_funded_discount_paisa>=0),
  platform_funded_discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(platform_funded_discount_paisa>=0),
  eligible_base_paisa INTEGER NOT NULL CHECK(eligible_base_paisa>=0),
  platform_retention_bps INTEGER NOT NULL DEFAULT 0 CHECK(platform_retention_bps BETWEEN 0 AND 10000),
  platform_retained_paisa INTEGER NOT NULL DEFAULT 0 CHECK(platform_retained_paisa>=0),
  maker_entitlement_paisa INTEGER NOT NULL DEFAULT 0 CHECK(maker_entitlement_paisa>=0),
  agreed_supplier_amount_paisa INTEGER CHECK(agreed_supplier_amount_paisa IS NULL OR agreed_supplier_amount_paisa>=0),
  simulation_label TEXT NOT NULL CHECK(length(trim(simulation_label))>0),
  created_at INTEGER NOT NULL,
  CHECK(platform_retained_paisa+maker_entitlement_paisa=eligible_base_paisa),
  CHECK(commercial_model<>'managed_fixed_supplier_price_v1' OR platform_retained_paisa=0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_managed_snapshots_seller_created ON managed_commercial_snapshots(seller_id,created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS managed_entitlements (
  id TEXT PRIMARY KEY NOT NULL,
  snapshot_id TEXT NOT NULL UNIQUE REFERENCES managed_commercial_snapshots(id) ON DELETE RESTRICT,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK(status IN ('calculated','earned','held','eligible','part_paid','paid','reversed')),
  calculated_paisa INTEGER NOT NULL CHECK(calculated_paisa>=0),
  earned_at INTEGER,
  hold_until INTEGER,
  eligible_at INTEGER,
  paid_at INTEGER,
  dispute_hold_reason TEXT,
  dispute_review_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_managed_entitlements_status ON managed_entitlements(status,eligible_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS managed_settlement_entries (
  id TEXT PRIMARY KEY NOT NULL,
  entitlement_id TEXT NOT NULL REFERENCES managed_entitlements(id) ON DELETE RESTRICT,
  refund_id TEXT REFERENCES refunds(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK(type IN ('earned','refund_adjustment','dispute_adjustment','defect_adjustment','payout','payout_reversal')),
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa<>0),
  base_amount_paisa INTEGER CHECK(base_amount_paisa IS NULL OR base_amount_paisa>=0),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  reason_code TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_managed_settlement_entitlement ON managed_settlement_entries(entitlement_id,created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS managed_payouts (
  id TEXT PRIMARY KEY NOT NULL,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  payout_number TEXT NOT NULL UNIQUE,
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
  status TEXT NOT NULL CHECK(status IN ('prepared','approved','processing','paid','failed','rejected','reversed')),
  destination_reference TEXT NOT NULL,
  simulation_label TEXT NOT NULL CHECK(length(trim(simulation_label))>0),
  prepared_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  scheduled_for INTEGER NOT NULL,
  provider_reference TEXT,
  request_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  paid_at INTEGER,
  CHECK(approved_by IS NULL OR approved_by<>prepared_by)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_managed_payouts_status ON managed_payouts(status,scheduled_for);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS managed_payout_entries (
  payout_id TEXT NOT NULL REFERENCES managed_payouts(id) ON DELETE RESTRICT,
  settlement_entry_id TEXT NOT NULL UNIQUE REFERENCES managed_settlement_entries(id) ON DELETE RESTRICT,
  PRIMARY KEY(payout_id,settlement_entry_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS managed_invoice_groups (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  issuer_reference TEXT NOT NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  snapshot_json TEXT NOT NULL,
  barcode_payload TEXT NOT NULL,
  qr_payload TEXT NOT NULL,
  simulation_label TEXT NOT NULL CHECK(length(trim(simulation_label))>0),
  status TEXT NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','voided')),
  request_id TEXT NOT NULL UNIQUE,
  issued_at INTEGER NOT NULL,
  voided_at INTEGER,
  UNIQUE(order_id,issuer_reference)
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS managed_snapshot_no_update BEFORE UPDATE ON managed_commercial_snapshots BEGIN SELECT RAISE(ABORT,'managed_snapshot_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS managed_snapshot_no_delete BEFORE DELETE ON managed_commercial_snapshots BEGIN SELECT RAISE(ABORT,'managed_snapshot_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS managed_settlement_entry_no_update BEFORE UPDATE ON managed_settlement_entries BEGIN SELECT RAISE(ABORT,'managed_settlement_entry_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS managed_settlement_entry_no_delete BEFORE DELETE ON managed_settlement_entries BEGIN SELECT RAISE(ABORT,'managed_settlement_entry_immutable'); END;
