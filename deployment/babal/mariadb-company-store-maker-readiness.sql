-- Additive 0071 companion. Requires form catalog, maker identity and managed commerce.
-- Never infer or backfill acceptance, commercial snapshots or payment allocations.
ALTER TABLE managed_maker_application_details ADD COLUMN IF NOT EXISTS agreement_language VARCHAR(8) NULL CHECK(agreement_language IS NULL OR BINARY agreement_language IN ('en','ne'));
ALTER TABLE managed_maker_application_details ADD COLUMN IF NOT EXISTS agreement_form_version_id VARCHAR(191) COLLATE utf8mb4_nopad_bin NULL,
 ADD FOREIGN KEY IF NOT EXISTS managed_detail_form_version_fk (agreement_form_version_id) REFERENCES form_config_versions(id);
ALTER TABLE seller_participation_profiles ADD COLUMN IF NOT EXISTS accepted_managed_detail_id VARCHAR(191) NULL,
 ADD FOREIGN KEY IF NOT EXISTS participation_accepted_detail_fk (accepted_managed_detail_id) REFERENCES managed_maker_application_details(id);
ALTER TABLE managed_commercial_snapshots ADD COLUMN IF NOT EXISTS accepted_managed_detail_id VARCHAR(191) NULL,
 ADD COLUMN IF NOT EXISTS maker_name_snapshot TEXT NULL,
 ADD COLUMN IF NOT EXISTS company_store_name_snapshot TEXT NULL,
 ADD COLUMN IF NOT EXISTS company_legal_name_snapshot TEXT NULL,
 ADD FOREIGN KEY IF NOT EXISTS commercial_accepted_detail_fk (accepted_managed_detail_id) REFERENCES managed_maker_application_details(id);
ALTER TABLE seller_route_transition_applications ADD COLUMN IF NOT EXISTS registered_terms_snapshot_json LONGTEXT NULL CHECK(registered_terms_snapshot_json IS NULL OR JSON_VALID(registered_terms_snapshot_json));

CREATE TABLE IF NOT EXISTS managed_payout_allocations (
 payout_id VARCHAR(191) NOT NULL,
 entitlement_id VARCHAR(191) NOT NULL,
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa<>0),
 disposition VARCHAR(16) COLLATE utf8mb4_bin NOT NULL CHECK(BINARY disposition IN ('reserved','released','paid')),
 created_at BIGINT NOT NULL,
 terminal_at BIGINT NULL,
 request_id VARCHAR(191) NOT NULL,
 actor_id VARCHAR(191) NOT NULL,
 -- Match the parent entitlement ID collation: FK-equivalent case/space variants
 -- must reserve the same parent rather than evade the unique key.
 reserved_entitlement_key VARCHAR(191) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS (CASE WHEN BINARY disposition='reserved' THEN entitlement_id ELSE NULL END) STORED,
 PRIMARY KEY(payout_id,entitlement_id),
 UNIQUE KEY managed_allocation_one_reservation(reserved_entitlement_key),
 FOREIGN KEY(payout_id) REFERENCES managed_payouts(id) ON DELETE RESTRICT,
 FOREIGN KEY(entitlement_id) REFERENCES managed_entitlements(id) ON DELETE RESTRICT,
 FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT managed_allocation_terminal_shape CHECK((BINARY disposition='reserved' AND terminal_at IS NULL) OR (BINARY disposition<>'reserved' AND terminal_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER IF NOT EXISTS managed_allocation_preserve_identity BEFORE UPDATE ON managed_payout_allocations FOR EACH ROW
BEGIN
 IF NOT(BINARY NEW.payout_id<=>BINARY OLD.payout_id) OR NOT(BINARY NEW.entitlement_id<=>BINARY OLD.entitlement_id)
 OR NOT(NEW.amount_paisa<=>OLD.amount_paisa) OR NOT(NEW.created_at<=>OLD.created_at)
 OR NOT(BINARY NEW.request_id<=>BINARY OLD.request_id) OR NOT(BINARY NEW.actor_id<=>BINARY OLD.actor_id)
 OR BINARY OLD.disposition<>'reserved' OR BINARY NEW.disposition NOT IN ('released','paid')
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Managed allocation history is immutable'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS managed_allocation_no_delete BEFORE DELETE ON managed_payout_allocations FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Managed allocation history is permanent'; END$$
CREATE TRIGGER IF NOT EXISTS managed_payout_preserve_identity BEFORE UPDATE ON managed_payouts FOR EACH ROW
BEGIN
 IF NOT(BINARY NEW.id<=>BINARY OLD.id) OR NOT(BINARY NEW.seller_id<=>BINARY OLD.seller_id) OR NOT(NEW.amount_paisa<=>OLD.amount_paisa)
 OR NOT(BINARY NEW.destination_reference<=>BINARY OLD.destination_reference) OR NOT(BINARY NEW.request_id<=>BINARY OLD.request_id)
 OR NOT(BINARY NEW.prepared_by<=>BINARY OLD.prepared_by) OR NOT(NEW.created_at<=>OLD.created_at)
 OR NOT(NEW.scheduled_for<=>OLD.scheduled_for) OR NOT(BINARY NEW.payout_number<=>BINARY OLD.payout_number)
 OR NOT(BINARY NEW.simulation_label<=>BINARY OLD.simulation_label)
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Managed payment identity and amount are immutable'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS managed_payout_no_delete BEFORE DELETE ON managed_payouts FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Managed payment history is permanent'; END$$
CREATE TRIGGER IF NOT EXISTS managed_payout_preserve_terminal BEFORE UPDATE ON managed_payouts FOR EACH ROW
BEGIN
 IF BINARY OLD.status IN ('paid','rejected','reversed') AND (NOT(BINARY NEW.status<=>BINARY OLD.status)
 OR NOT(BINARY NEW.approved_by<=>BINARY OLD.approved_by) OR NOT(BINARY NEW.provider_reference<=>BINARY OLD.provider_reference) OR NOT(NEW.paid_at<=>OLD.paid_at))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Terminal managed payment evidence is immutable'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS managed_legacy_payout_link_no_update BEFORE UPDATE ON managed_payout_entries FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Legacy managed payment links are immutable'; END$$
CREATE TRIGGER IF NOT EXISTS managed_legacy_payout_link_no_delete BEFORE DELETE ON managed_payout_entries FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Legacy managed payment links are permanent'; END$$
DELIMITER ;
