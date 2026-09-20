-- Additive R021: NULL applicant_type means legacy/unclassified; never backfill old applications.
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS applicant_type VARCHAR(20) NULL;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS registration_authority_key VARCHAR(191) GENERATED ALWAYS AS (NULLIF(registration_authority,'')) STORED;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS registration_number_key VARCHAR(191) GENERATED ALWAYS AS (NULLIF(registration_number,'')) STORED;
ALTER TABLE seller_profiles DROP INDEX IF EXISTS idx_seller_profiles_registration_unique;
CREATE UNIQUE INDEX idx_seller_profiles_registration_unique ON seller_profiles(registration_authority_key,registration_number_key);
