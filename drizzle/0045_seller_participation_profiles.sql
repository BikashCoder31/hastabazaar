DROP INDEX IF EXISTS idx_seller_profiles_tax_number_unique;
--> statement-breakpoint
CREATE UNIQUE INDEX idx_seller_profiles_tax_number_unique
ON seller_profiles(NULLIF(tax_registration_number, ''));
--> statement-breakpoint
CREATE TABLE seller_participation_profiles (
  seller_id TEXT PRIMARY KEY NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  participation_route TEXT NOT NULL,
  application_stage TEXT NOT NULL,
  tax_status TEXT,
  public_name TEXT NOT NULL,
  public_city TEXT NOT NULL,
  craft_experience_json TEXT NOT NULL DEFAULT '[]',
  social_links_json TEXT NOT NULL DEFAULT '{}',
  commercial_model TEXT,
  legal_seller_reference TEXT,
  invoice_issuer_reference TEXT,
  payout_beneficiary_reference TEXT,
  return_destination_type TEXT NOT NULL DEFAULT 'maker_address',
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CONSTRAINT seller_participation_route CHECK(participation_route IN ('registered_seller','managed_maker')),
  CONSTRAINT seller_participation_stage CHECK(application_stage IN ('draft','submitted','under_review','changes_requested','approved_for_activation','active','rejected','suspended')),
  CONSTRAINT seller_participation_tax CHECK(tax_status IS NULL OR tax_status IN ('business_pan_only','vat_registered')),
  CONSTRAINT seller_participation_model CHECK(commercial_model IS NULL OR commercial_model IN ('managed_sale_linked_percentage_v1','managed_fixed_supplier_price_v1')),
  CONSTRAINT seller_participation_return_destination CHECK(return_destination_type IN ('maker_address','hastabazaar_collection_point')),
  CONSTRAINT seller_participation_version CHECK(version >= 1)
);
--> statement-breakpoint
CREATE INDEX idx_seller_participation_review
ON seller_participation_profiles(participation_route, application_stage, created_at);
--> statement-breakpoint
CREATE TABLE seller_participation_guards (
  id TEXT PRIMARY KEY NOT NULL,
  valid INTEGER NOT NULL,
  CONSTRAINT seller_participation_guard_valid CHECK(valid = 1)
);
--> statement-breakpoint
CREATE TABLE seller_operational_addresses (
  id TEXT PRIMARY KEY NOT NULL,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  same_as_address_id TEXT REFERENCES seller_operational_addresses(id) ON DELETE SET NULL,
  province TEXT NOT NULL,
  district TEXT NOT NULL,
  municipality TEXT NOT NULL,
  ward TEXT,
  locality TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CONSTRAINT seller_address_purpose CHECK(purpose IN ('verification','pickup','returns','invoice')),
  CONSTRAINT seller_address_private CHECK(is_public = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_seller_addresses_purpose
ON seller_operational_addresses(seller_id, purpose);
--> statement-breakpoint
CREATE TABLE seller_profile_media (
  id TEXT PRIMARY KEY NOT NULL,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  object_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  moderation_status TEXT NOT NULL DEFAULT 'pending',
  uploaded_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT seller_profile_media_kind CHECK(kind IN ('profile_image','maker_video')),
  CONSTRAINT seller_profile_media_status CHECK(moderation_status IN ('pending','approved','rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_seller_profile_media_kind
ON seller_profile_media(seller_id, kind);
--> statement-breakpoint
INSERT INTO seller_participation_profiles (
  seller_id, participation_route, application_stage, tax_status,
  public_name, public_city, craft_experience_json, social_links_json,
  commercial_model, legal_seller_reference, invoice_issuer_reference,
  payout_beneficiary_reference, return_destination_type, version,
  created_at, updated_at
)
SELECT
  id,
  'registered_seller',
  CASE status
    WHEN 'approved' THEN 'active'
    WHEN 'needs_changes' THEN 'changes_requested'
    ELSE status
  END,
  CASE WHEN tax_mode IN ('VAT','BOTH') THEN 'vat_registered' ELSE 'business_pan_only' END,
  trading_name,
  municipality,
  '[]',
  '{}',
  NULL,
  CASE WHEN status = 'approved' THEN id ELSE NULL END,
  CASE WHEN status = 'approved' THEN id ELSE NULL END,
  CASE WHEN status = 'approved' THEN id ELSE NULL END,
  'maker_address',
  1,
  created_at,
  updated_at
FROM seller_profiles;
--> statement-breakpoint
INSERT INTO seller_operational_addresses (
  id, seller_id, purpose, same_as_address_id, province, district,
  municipality, ward, locality, is_public, created_at, updated_at
)
SELECT
  'verification-' || id, id, 'verification', NULL, province, district,
  municipality, ward, locality, 0, created_at, updated_at
FROM seller_profiles;
