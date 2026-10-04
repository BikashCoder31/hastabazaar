-- Preserve existing country values and order snapshots. Origin remains unverified until evidence is recorded.
ALTER TABLE products ADD COLUMN IF NOT EXISTS origin_evidence_status VARCHAR(32) NOT NULL DEFAULT 'unverified';
ALTER TABLE products ADD COLUMN IF NOT EXISTS origin_evidence_reference LONGTEXT NULL;
ALTER TABLE products ALTER COLUMN country_of_origin SET DEFAULT '';
