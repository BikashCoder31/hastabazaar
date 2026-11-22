// Selected schema storage references. SQL fragments are shared by D1 and native.
/** @type {Readonly<Record<string, readonly string[]>>} */
export const MEDIA_REFERENCE_COLUMNS = {
  product_media: ['object_key'],
  seller_documents: ['object_key'],
  seller_application_draft_uploads: ['object_key'],
  seller_profile_media: ['object_key'],
  category_media: ['object_key'],
  return_evidence: ['object_key'],
  review_photos: ['object_key'],
  homepage_hero_media: ['object_key'],
  rider_applications: ['object_key'],
  rider_reports: ['object_key'],
  product_intake_media: ['object_key'],
  product_legacy_media_copies: ['source_object_key'],
  manual_payment_claim_files: ['object_key'],
  finance_evidence_intents: ['object_key'],
  managed_clearance_evidence_intents: ['object_key'],
};

/** @type {Readonly<Partial<Record<string, string>>>} */
export const MEDIA_REFERENCE_WITHOUT_OBJECT = {
  seller_application_draft_uploads: "r.status IN ('uploading', 'deleting')",
  product_intake_media: "r.state = 'uploading' AND r.completed_at IS NULL",
  finance_evidence_intents:
    'r.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM finance_evidence_files f WHERE f.id = r.id)',
  managed_clearance_evidence_intents:
    'r.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM managed_clearance_evidence_files f WHERE f.id = r.id)',
};
