-- Append-only private evidence; deliberately no legacy acceptance backfill.
CREATE TABLE IF NOT EXISTS managed_maker_application_details (
  id VARCHAR(191) PRIMARY KEY NOT NULL,
  seller_id VARCHAR(191) NOT NULL,
  government_id_type VARCHAR(32) NOT NULL CHECK (government_id_type IN ('citizenship','national_id','passport','driving_licence','other_government_id')),
  government_id_description VARCHAR(200) NOT NULL DEFAULT '',
  personal_pan VARCHAR(9) NULL CHECK (personal_pan IS NULL OR personal_pan REGEXP '^[0-9]{9}$'),
  identity_document_id VARCHAR(191) NOT NULL,
  agreement_version VARCHAR(191) NOT NULL,
  agreement_accepted_at BIGINT NOT NULL CHECK (agreement_accepted_at > 0),
  agreement_accepted_by VARCHAR(191) NOT NULL,
  agreement_snapshot_json LONGTEXT NOT NULL CHECK (JSON_VALID(agreement_snapshot_json)),
  created_at BIGINT NOT NULL,
  INDEX managed_maker_details_seller(seller_id, created_at),
  FOREIGN KEY (seller_id) REFERENCES seller_profiles(id),
  FOREIGN KEY (identity_document_id) REFERENCES seller_documents(id),
  FOREIGN KEY (agreement_accepted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER IF NOT EXISTS managed_maker_details_no_update BEFORE UPDATE ON managed_maker_application_details FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Managed Maker agreement evidence is immutable'; END$$
CREATE TRIGGER IF NOT EXISTS managed_maker_details_no_delete BEFORE DELETE ON managed_maker_application_details FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Managed Maker agreement evidence is immutable'; END$$
DELIMITER ;
