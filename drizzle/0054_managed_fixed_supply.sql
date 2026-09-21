CREATE TABLE IF NOT EXISTS managed_supply_records (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_proposed INTEGER NOT NULL CHECK(quantity_proposed>0),
  quantity_accepted INTEGER CHECK(quantity_accepted IS NULL OR quantity_accepted>=0),
  agreed_unit_paisa INTEGER NOT NULL CHECK(agreed_unit_paisa>0),
  accepted_total_paisa INTEGER CHECK(accepted_total_paisa IS NULL OR accepted_total_paisa>=0),
  status TEXT NOT NULL CHECK(status IN ('proposed','accepted','rejected','cancelled')),
  possession_status TEXT NOT NULL CHECK(possession_status IN ('not_received','received','returned')),
  quality_status TEXT NOT NULL CHECK(quality_status IN ('not_inspected','accepted','rejected')),
  ownership_record_status TEXT NOT NULL CHECK(ownership_record_status IN ('not_recorded','simulated_terms_recorded')),
  risk_record_status TEXT NOT NULL CHECK(risk_record_status IN ('not_recorded','simulated_terms_recorded')),
  evidence_reference TEXT,
  agreement_version TEXT NOT NULL,
  agreement_language TEXT NOT NULL CHECK(agreement_language IN ('en','ne')),
  payout_beneficiary_reference TEXT NOT NULL,
  simulation_label TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  decision_reason TEXT,
  proposal_request_id TEXT NOT NULL UNIQUE,
  decision_request_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  CHECK(decided_by IS NULL OR decided_by<>created_by),
  CHECK(status<>'accepted' OR (quantity_accepted>0 AND accepted_total_paisa=quantity_accepted*agreed_unit_paisa AND possession_status='received' AND quality_status='accepted'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_managed_supply_seller_status ON managed_supply_records(seller_id,status,created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS managed_supplier_obligations (
  id TEXT PRIMARY KEY REFERENCES managed_supply_records(id) ON DELETE RESTRICT,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  original_amount_paisa INTEGER NOT NULL CHECK(original_amount_paisa>0),
  payout_beneficiary_reference TEXT NOT NULL,
  agreement_version TEXT NOT NULL,
  agreement_language TEXT NOT NULL CHECK(agreement_language IN ('en','ne')),
  status TEXT NOT NULL DEFAULT 'owed' CHECK(status IN ('owed','held','eligible','part_paid','paid','reversed')),
  owed_at INTEGER NOT NULL,
  eligible_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS managed_supplier_adjustments (
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL REFERENCES managed_supplier_obligations(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('cancellation','rejection','defect')),
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
  reason TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS managed_supplier_payments (
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL REFERENCES managed_supplier_obligations(id) ON DELETE RESTRICT,
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
  status TEXT NOT NULL CHECK(status IN ('prepared','approved','paid','failed','cancelled')),
  destination_reference TEXT NOT NULL,
  simulation_label TEXT NOT NULL,
  prepared_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  paid_at INTEGER,
  CHECK(approved_by IS NULL OR approved_by<>prepared_by)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_managed_supplier_payment_obligation ON managed_supplier_payments(obligation_id,status);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS managed_supplier_obligation_no_update BEFORE UPDATE ON managed_supplier_obligations BEGIN SELECT RAISE(ABORT,'Managed supplier obligation is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS managed_supplier_obligation_no_delete BEFORE DELETE ON managed_supplier_obligations BEGIN SELECT RAISE(ABORT,'Managed supplier obligation is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS managed_supplier_adjustment_no_update BEFORE UPDATE ON managed_supplier_adjustments BEGIN SELECT RAISE(ABORT,'Managed supplier adjustment is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS managed_supplier_adjustment_no_delete BEFORE DELETE ON managed_supplier_adjustments BEGIN SELECT RAISE(ABORT,'Managed supplier adjustment is immutable'); END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS seller_route_transition_applications (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  from_route TEXT NOT NULL CHECK(from_route='managed_maker'),
  to_route TEXT NOT NULL CHECK(to_route='registered_seller'),
  status TEXT NOT NULL CHECK(status IN ('submitted','under_review','changes_requested','rejected','scheduled','applied','cancelled')),
  legal_name TEXT NOT NULL,
  registration_authority TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  tax_mode TEXT NOT NULL CHECK(tax_mode IN ('PAN','VAT','BOTH')),
  tax_registration_number TEXT NOT NULL,
  evidence_references_json TEXT NOT NULL,
  agreement_version TEXT NOT NULL,
  agreement_language TEXT NOT NULL CHECK(agreement_language IN ('en','ne')),
  agreement_accepted_at INTEGER NOT NULL,
  requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  review_reason TEXT,
  effective_at INTEGER,
  applied_at INTEGER,
  request_id TEXT NOT NULL UNIQUE,
  decision_request_id TEXT UNIQUE,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK(reviewed_by IS NULL OR reviewed_by<>requested_by)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_route_transition_open ON seller_route_transition_applications(seller_id) WHERE status IN ('submitted','under_review','changes_requested','scheduled');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_seller_route_transition_due ON seller_route_transition_applications(status,effective_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS seller_agreement_acceptance_history (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  agreement_version TEXT NOT NULL,
  language_presented TEXT NOT NULL CHECK(language_presented IN ('en','ne')),
  commission_setting_version_id TEXT REFERENCES business_setting_versions(id) ON DELETE RESTRICT,
  commission_bps INTEGER NOT NULL CHECK(commission_bps BETWEEN 0 AND 10000),
  acceptance_request_id TEXT NOT NULL UNIQUE,
  accepted_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  accepted_at INTEGER NOT NULL,
  simulation_label TEXT,
  UNIQUE(seller_id,agreement_version,language_presented,commission_setting_version_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_seller_agreement_acceptance_current ON seller_agreement_acceptance_history(seller_id,commission_setting_version_id,accepted_at);
