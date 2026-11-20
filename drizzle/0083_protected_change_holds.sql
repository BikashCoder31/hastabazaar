-- Additive source migration. Never run against the canonical local database to pass startup.
CREATE TABLE seller_protected_revisions (
 seller_id TEXT PRIMARY KEY REFERENCES seller_profiles(id),
 identity_revision INTEGER NOT NULL DEFAULT 0,
 bank_revision INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
INSERT INTO seller_protected_revisions(seller_id) SELECT id FROM seller_profiles;
--> statement-breakpoint
CREATE TRIGGER seller_protected_revision_created AFTER INSERT ON seller_profiles
BEGIN INSERT INTO seller_protected_revisions(seller_id) VALUES(NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER seller_identity_revision_changed AFTER UPDATE ON seller_profiles
WHEN NEW.legal_name IS NOT OLD.legal_name OR NEW.applicant_type IS NOT OLD.applicant_type OR NEW.tax_registration_number IS NOT OLD.tax_registration_number
 OR NEW.representative_name IS NOT OLD.representative_name OR NEW.registration_number IS NOT OLD.registration_number
 OR NEW.registration_authority IS NOT OLD.registration_authority OR NEW.tax_mode IS NOT OLD.tax_mode
BEGIN UPDATE seller_protected_revisions SET identity_revision=identity_revision+1 WHERE seller_id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER seller_bank_revision_changed AFTER UPDATE OF payout_account_reference ON seller_profiles
WHEN NEW.payout_account_reference IS NOT OLD.payout_account_reference
BEGIN UPDATE seller_protected_revisions SET bank_revision=bank_revision+1 WHERE seller_id=NEW.id; END;
--> statement-breakpoint
ALTER TABLE seller_documents ADD COLUMN valid_until INTEGER;
--> statement-breakpoint
CREATE TRIGGER seller_evidence_revision_changed AFTER UPDATE ON seller_documents
WHEN NEW.status IS NOT OLD.status OR NEW.valid_until IS NOT OLD.valid_until
BEGIN UPDATE seller_protected_revisions SET
 identity_revision=identity_revision+CASE WHEN NEW.kind<>'bank_verification' THEN 1 ELSE 0 END,
 bank_revision=bank_revision+CASE WHEN NEW.kind='bank_verification' THEN 1 ELSE 0 END WHERE seller_id=NEW.seller_id; END;
--> statement-breakpoint
CREATE TRIGGER seller_identity_facts_revision_changed AFTER INSERT ON managed_maker_application_details
WHEN EXISTS(SELECT 1 FROM managed_maker_application_details previous WHERE previous.seller_id=NEW.seller_id AND previous.id<>NEW.id
 AND previous.id=(SELECT id FROM managed_maker_application_details WHERE seller_id=NEW.seller_id AND id<>NEW.id ORDER BY created_at DESC,id DESC LIMIT 1)
 AND (previous.government_id_type IS NOT NEW.government_id_type OR previous.government_id_description IS NOT NEW.government_id_description OR previous.personal_pan IS NOT NEW.personal_pan))
BEGIN UPDATE seller_protected_revisions SET identity_revision=identity_revision+1 WHERE seller_id=NEW.seller_id; END;
--> statement-breakpoint
CREATE TABLE seller_protected_change_cases (
 id TEXT PRIMARY KEY NOT NULL,
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
 kind TEXT NOT NULL CHECK(kind IN ('identity','bank')),
 classification TEXT NOT NULL CHECK(classification IN ('unclassified','material','identity_evidence_only','bank')),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','verified','rejected','withdrawn','closed')),
 source_request_id TEXT UNIQUE REFERENCES seller_document_change_requests(id),
 source_document_id TEXT REFERENCES seller_documents(id),
 original_identity_revision INTEGER NOT NULL,
 original_bank_reference TEXT,
 scope_json TEXT NOT NULL,
 proposed_json TEXT,
 replacement_document_id TEXT REFERENCES seller_documents(id),
 invalid_current INTEGER NOT NULL DEFAULT 0 CHECK(invalid_current IN (0,1)),
 version INTEGER NOT NULL DEFAULT 0,
 requested_by TEXT REFERENCES users(id),
 reason TEXT NOT NULL,
 requested_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 reviewed_by TEXT REFERENCES users(id),
 reviewed_at INTEGER,
 review_reason TEXT,
 evidence_reference TEXT,
 operation_request_id TEXT NOT NULL,
 CHECK(source_request_id IS NULL OR id=source_request_id)
);
--> statement-breakpoint
CREATE INDEX seller_protected_cases_seller ON seller_protected_change_cases(seller_id,status);
--> statement-breakpoint
CREATE TABLE seller_capability_holds (
 id TEXT PRIMARY KEY NOT NULL,
 case_id TEXT NOT NULL REFERENCES seller_protected_change_cases(id),
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
 capability TEXT NOT NULL CHECK(capability IN ('new_orders','payouts')),
 reason TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 released_at INTEGER,
 released_by TEXT REFERENCES users(id),
 release_reason TEXT,
 release_request_id TEXT,
 CHECK((released_at IS NULL AND release_reason IS NULL AND release_request_id IS NULL) OR
 (released_at IS NOT NULL AND release_reason IS NOT NULL AND release_request_id IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX seller_capability_hold_active ON seller_capability_holds(case_id,capability) WHERE released_at IS NULL;
--> statement-breakpoint
CREATE INDEX seller_capability_hold_lookup ON seller_capability_holds(seller_id,capability,released_at);
--> statement-breakpoint
CREATE TABLE seller_payout_review_blocks (
 payout_model TEXT NOT NULL CHECK(payout_model IN ('registered','managed','fixed')),
 payout_id TEXT NOT NULL,
 case_id TEXT NOT NULL REFERENCES seller_protected_change_cases(id),
 disposition TEXT NOT NULL CHECK(disposition IN ('reprepare','reconcile')),
 original_status TEXT NOT NULL,
 original_destination TEXT NOT NULL,
 original_amount_paisa INTEGER NOT NULL CHECK(original_amount_paisa>0),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(payout_model,payout_id,case_id)
);
--> statement-breakpoint
CREATE TABLE seller_beneficiary_versions (
 id TEXT PRIMARY KEY NOT NULL,
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
 case_id TEXT NOT NULL REFERENCES seller_protected_change_cases(id),
 document_id TEXT NOT NULL REFERENCES seller_documents(id),
 details_json TEXT NOT NULL,
 identity_revision INTEGER NOT NULL,
 ownership_basis TEXT NOT NULL CHECK(ownership_basis IN ('same_person','same_legal_entity')),
 verification_reference TEXT NOT NULL,
 review_reason TEXT NOT NULL,
 verified_by TEXT REFERENCES users(id),
 verified_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER protected_case_source_immutable BEFORE UPDATE ON seller_protected_change_cases
WHEN NEW.id IS NOT OLD.id OR NEW.seller_id IS NOT OLD.seller_id OR NEW.kind IS NOT OLD.kind OR NEW.source_request_id IS NOT OLD.source_request_id
 OR NEW.source_document_id IS NOT OLD.source_document_id OR NEW.original_identity_revision IS NOT OLD.original_identity_revision
 OR NEW.original_bank_reference IS NOT OLD.original_bank_reference OR NEW.requested_at IS NOT OLD.requested_at
 OR NEW.reason IS NOT OLD.reason OR NEW.scope_json IS NOT OLD.scope_json OR NEW.invalid_current IS NOT OLD.invalid_current
 OR (NEW.requested_by IS NOT NULL AND NEW.requested_by IS NOT OLD.requested_by)
BEGIN SELECT RAISE(ABORT,'protected_case_source_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER protected_case_retained BEFORE DELETE ON seller_protected_change_cases
BEGIN SELECT RAISE(ABORT,'protected_case_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER capability_hold_immutable BEFORE UPDATE ON seller_capability_holds
WHEN NEW.id IS NOT OLD.id OR NEW.case_id IS NOT OLD.case_id OR NEW.seller_id IS NOT OLD.seller_id OR NEW.capability IS NOT OLD.capability
 OR NEW.reason IS NOT OLD.reason OR NEW.created_at IS NOT OLD.created_at
 OR (OLD.released_at IS NOT NULL AND (NEW.released_at IS NOT OLD.released_at OR NEW.release_reason IS NOT OLD.release_reason
 OR NEW.release_request_id IS NOT OLD.release_request_id OR (NEW.released_by IS NOT NULL AND NEW.released_by IS NOT OLD.released_by)))
BEGIN SELECT RAISE(ABORT,'capability_hold_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER capability_hold_retained BEFORE DELETE ON seller_capability_holds
BEGIN SELECT RAISE(ABORT,'capability_hold_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER payout_review_block_immutable BEFORE UPDATE ON seller_payout_review_blocks
BEGIN SELECT RAISE(ABORT,'payout_review_block_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER payout_review_block_retained BEFORE DELETE ON seller_payout_review_blocks
BEGIN SELECT RAISE(ABORT,'payout_review_block_retained'); END;
--> statement-breakpoint
CREATE TRIGGER beneficiary_version_immutable BEFORE UPDATE ON seller_beneficiary_versions
BEGIN SELECT RAISE(ABORT,'beneficiary_version_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER beneficiary_version_retained BEFORE DELETE ON seller_beneficiary_versions
BEGIN SELECT RAISE(ABORT,'beneficiary_version_retained'); END;
--> statement-breakpoint
CREATE TABLE seller_protected_change_permissions (
 id TEXT PRIMARY KEY NOT NULL,
 case_id TEXT NOT NULL REFERENCES seller_protected_change_cases(id),
 scope_json TEXT NOT NULL,
 identity_revision INTEGER NOT NULL,
 bank_revision INTEGER NOT NULL,
 reviewed_by TEXT REFERENCES users(id),
 reviewed_at INTEGER NOT NULL,
 reason TEXT NOT NULL,
 used_document_id TEXT REFERENCES seller_documents(id),
 used_at INTEGER,
 CHECK((used_document_id IS NULL AND used_at IS NULL) OR (used_document_id IS NOT NULL AND used_at IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE seller_protected_change_cases ADD COLUMN active_permission_id TEXT REFERENCES seller_protected_change_permissions(id);
--> statement-breakpoint
CREATE TABLE seller_protected_change_events (
 id TEXT PRIMARY KEY NOT NULL,
 case_id TEXT NOT NULL REFERENCES seller_protected_change_cases(id),
 actor_id TEXT REFERENCES users(id),
 action TEXT NOT NULL,
 reason TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER protected_permission_immutable BEFORE UPDATE ON seller_protected_change_permissions
WHEN NEW.id IS NOT OLD.id OR NEW.case_id IS NOT OLD.case_id OR NEW.scope_json IS NOT OLD.scope_json OR NEW.identity_revision IS NOT OLD.identity_revision
 OR NEW.bank_revision IS NOT OLD.bank_revision OR NEW.reviewed_at IS NOT OLD.reviewed_at OR NEW.reason IS NOT OLD.reason
 OR (NEW.reviewed_by IS NOT NULL AND NEW.reviewed_by IS NOT OLD.reviewed_by)
 OR (OLD.used_at IS NOT NULL AND (NEW.used_at IS NOT OLD.used_at OR NEW.used_document_id IS NOT OLD.used_document_id))
BEGIN SELECT RAISE(ABORT,'protected_permission_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER protected_permission_retained BEFORE DELETE ON seller_protected_change_permissions
BEGIN SELECT RAISE(ABORT,'protected_permission_retained'); END;
--> statement-breakpoint
CREATE TRIGGER protected_change_event_immutable BEFORE UPDATE ON seller_protected_change_events
BEGIN SELECT RAISE(ABORT,'protected_change_event_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER protected_change_event_retained BEFORE DELETE ON seller_protected_change_events
BEGIN SELECT RAISE(ABORT,'protected_change_event_retained'); END;
--> statement-breakpoint
ALTER TABLE seller_documents ADD COLUMN protected_change_id TEXT REFERENCES seller_protected_change_cases(id);
--> statement-breakpoint
CREATE TABLE seller_identity_fact_versions (
 id TEXT PRIMARY KEY NOT NULL,
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
 case_id TEXT NOT NULL UNIQUE REFERENCES seller_protected_change_cases(id),
 identity_revision INTEGER NOT NULL,
 facts_json TEXT NOT NULL CHECK(json_valid(facts_json)),
 verified_by TEXT REFERENCES users(id),
 verified_at INTEGER NOT NULL,
 verification_reference TEXT NOT NULL,
 review_reason TEXT NOT NULL,
 UNIQUE(seller_id,identity_revision)
);
--> statement-breakpoint
CREATE TRIGGER protected_identity_facts_immutable BEFORE UPDATE ON seller_identity_fact_versions
BEGIN SELECT RAISE(ABORT,'protected_identity_facts_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER protected_identity_facts_retained BEFORE DELETE ON seller_identity_fact_versions
BEGIN SELECT RAISE(ABORT,'protected_identity_facts_retained'); END;
--> statement-breakpoint
CREATE TRIGGER protected_document_case_immutable BEFORE UPDATE ON seller_documents
WHEN OLD.protected_change_id IS NOT NULL AND NEW.protected_change_id IS NOT OLD.protected_change_id
BEGIN SELECT RAISE(ABORT,'protected_document_case_immutable'); END;
--> statement-breakpoint
CREATE TABLE seller_payout_packet_dispositions (
 id TEXT PRIMARY KEY NOT NULL,
 case_id TEXT NOT NULL REFERENCES seller_protected_change_cases(id),
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
 payout_model TEXT NOT NULL CHECK(payout_model IN ('registered','managed','fixed')),
 old_payout_id TEXT NOT NULL,
 original_status TEXT NOT NULL,
 original_destination TEXT NOT NULL,
 original_amount_paisa INTEGER NOT NULL,
 evidence_reference TEXT NOT NULL,
 reason TEXT NOT NULL,
 actor_id TEXT REFERENCES users(id),
 created_at INTEGER NOT NULL,
 UNIQUE(payout_model,old_payout_id)
);
--> statement-breakpoint
CREATE TABLE seller_payout_packet_replacements (
 disposition_id TEXT PRIMARY KEY NOT NULL REFERENCES seller_payout_packet_dispositions(id),
 new_payout_id TEXT NOT NULL,
 actor_id TEXT REFERENCES users(id),
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER protected_packet_disposition_immutable BEFORE UPDATE ON seller_payout_packet_dispositions
BEGIN SELECT RAISE(ABORT,'protected_packet_disposition_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER protected_packet_disposition_retained BEFORE DELETE ON seller_payout_packet_dispositions
BEGIN SELECT RAISE(ABORT,'protected_packet_disposition_retained'); END;
--> statement-breakpoint
CREATE TRIGGER protected_packet_replacement_immutable BEFORE UPDATE ON seller_payout_packet_replacements
BEGIN SELECT RAISE(ABORT,'protected_packet_replacement_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER protected_packet_replacement_retained BEFORE DELETE ON seller_payout_packet_replacements
BEGIN SELECT RAISE(ABORT,'protected_packet_replacement_retained'); END;
