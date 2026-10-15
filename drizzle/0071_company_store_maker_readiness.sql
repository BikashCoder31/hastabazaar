-- Additive only. Existing immutable evidence and sales remain unchanged.
ALTER TABLE managed_maker_application_details ADD COLUMN agreement_language TEXT CHECK(agreement_language IS NULL OR agreement_language IN ('en','ne'));
ALTER TABLE managed_maker_application_details ADD COLUMN agreement_form_version_id TEXT REFERENCES form_config_versions(id);
ALTER TABLE seller_participation_profiles ADD COLUMN accepted_managed_detail_id TEXT REFERENCES managed_maker_application_details(id);
ALTER TABLE managed_commercial_snapshots ADD COLUMN accepted_managed_detail_id TEXT REFERENCES managed_maker_application_details(id);
ALTER TABLE managed_commercial_snapshots ADD COLUMN maker_name_snapshot TEXT;
ALTER TABLE managed_commercial_snapshots ADD COLUMN company_store_name_snapshot TEXT;
ALTER TABLE managed_commercial_snapshots ADD COLUMN company_legal_name_snapshot TEXT;
ALTER TABLE seller_route_transition_applications ADD COLUMN registered_terms_snapshot_json TEXT CHECK(registered_terms_snapshot_json IS NULL OR json_valid(registered_terms_snapshot_json));

CREATE TABLE managed_payout_allocations (
  payout_id TEXT NOT NULL REFERENCES managed_payouts(id) ON DELETE RESTRICT,
  entitlement_id TEXT NOT NULL REFERENCES managed_entitlements(id) ON DELETE RESTRICT,
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa<>0),
  disposition TEXT NOT NULL CHECK(disposition IN ('reserved','released','paid')),
  created_at INTEGER NOT NULL,
  terminal_at INTEGER,
  request_id TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  PRIMARY KEY(payout_id,entitlement_id),
  CHECK((disposition='reserved' AND terminal_at IS NULL) OR (disposition<>'reserved' AND terminal_at IS NOT NULL))
);
CREATE UNIQUE INDEX managed_allocation_one_reservation ON managed_payout_allocations(entitlement_id) WHERE disposition='reserved';
