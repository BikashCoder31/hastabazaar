ALTER TABLE seller_profiles ADD COLUMN applicant_type TEXT;
--> statement-breakpoint
DROP INDEX idx_seller_profiles_registration_unique;
--> statement-breakpoint
CREATE UNIQUE INDEX idx_seller_profiles_registration_unique ON seller_profiles(NULLIF(registration_authority,''),NULLIF(registration_number,''));
