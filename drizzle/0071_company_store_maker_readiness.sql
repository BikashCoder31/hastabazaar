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

CREATE TRIGGER managed_allocation_preserve_identity BEFORE UPDATE ON managed_payout_allocations
WHEN NEW.payout_id IS NOT OLD.payout_id OR NEW.entitlement_id IS NOT OLD.entitlement_id
  OR NEW.amount_paisa IS NOT OLD.amount_paisa OR NEW.created_at IS NOT OLD.created_at
  OR NEW.request_id IS NOT OLD.request_id OR NEW.actor_id IS NOT OLD.actor_id
  OR OLD.disposition<>'reserved' OR NEW.disposition NOT IN ('released','paid')
BEGIN SELECT RAISE(ABORT,'Managed allocation history is immutable'); END;
CREATE TRIGGER managed_allocation_no_delete BEFORE DELETE ON managed_payout_allocations
BEGIN SELECT RAISE(ABORT,'Managed allocation history is permanent'); END;
CREATE TRIGGER managed_payout_preserve_identity BEFORE UPDATE ON managed_payouts
WHEN NEW.id IS NOT OLD.id OR NEW.seller_id IS NOT OLD.seller_id OR NEW.amount_paisa IS NOT OLD.amount_paisa
  OR NEW.destination_reference IS NOT OLD.destination_reference OR NEW.request_id IS NOT OLD.request_id
  OR NEW.prepared_by IS NOT OLD.prepared_by OR NEW.created_at IS NOT OLD.created_at
  OR NEW.scheduled_for IS NOT OLD.scheduled_for OR NEW.payout_number IS NOT OLD.payout_number
  OR NEW.simulation_label IS NOT OLD.simulation_label
BEGIN SELECT RAISE(ABORT,'Managed payment identity and amount are immutable'); END;
CREATE TRIGGER managed_payout_no_delete BEFORE DELETE ON managed_payouts
BEGIN SELECT RAISE(ABORT,'Managed payment history is permanent'); END;
CREATE TRIGGER managed_payout_preserve_terminal BEFORE UPDATE ON managed_payouts
WHEN OLD.status IN ('paid','rejected','reversed') AND (NEW.status IS NOT OLD.status
  OR NEW.approved_by IS NOT OLD.approved_by OR NEW.provider_reference IS NOT OLD.provider_reference OR NEW.paid_at IS NOT OLD.paid_at)
BEGIN SELECT RAISE(ABORT,'Terminal managed payment evidence is immutable'); END;
CREATE TRIGGER managed_legacy_payout_link_no_update BEFORE UPDATE ON managed_payout_entries
BEGIN SELECT RAISE(ABORT,'Legacy managed payment links are immutable'); END;
CREATE TRIGGER managed_legacy_payout_link_no_delete BEFORE DELETE ON managed_payout_entries
BEGIN SELECT RAISE(ABORT,'Legacy managed payment links are permanent'); END;
