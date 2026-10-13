CREATE TABLE managed_maker_application_details (
  id TEXT PRIMARY KEY NOT NULL,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
  government_id_type TEXT NOT NULL CHECK (government_id_type IN ('citizenship','national_id','passport','driving_licence','other_government_id')),
  government_id_description TEXT NOT NULL DEFAULT '',
  personal_pan TEXT CHECK (personal_pan IS NULL OR (length(personal_pan)=9 AND personal_pan NOT GLOB '*[^0-9]*')),
  identity_document_id TEXT NOT NULL REFERENCES seller_documents(id),
  agreement_version TEXT NOT NULL,
  agreement_accepted_at INTEGER NOT NULL CHECK (agreement_accepted_at > 0),
  agreement_accepted_by TEXT NOT NULL REFERENCES users(id),
  agreement_snapshot_json TEXT NOT NULL CHECK (json_valid(agreement_snapshot_json)),
  created_at INTEGER NOT NULL
);
CREATE INDEX managed_maker_details_seller ON managed_maker_application_details(seller_id, created_at);
CREATE TRIGGER managed_maker_details_no_update BEFORE UPDATE ON managed_maker_application_details
BEGIN SELECT RAISE(ABORT,'Managed Maker agreement evidence is immutable'); END;
CREATE TRIGGER managed_maker_details_no_delete BEFORE DELETE ON managed_maker_application_details
BEGIN SELECT RAISE(ABORT,'Managed Maker agreement evidence is immutable'); END;
