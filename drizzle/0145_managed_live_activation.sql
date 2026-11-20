-- Source0145 only: never apply to canonical local data to pass startup.
CREATE TABLE managed_clearance_evidence_intents(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL REFERENCES seller_profiles(id),material_scope_digest TEXT NOT NULL CHECK(length(material_scope_digest)=64),uploaded_by TEXT NOT NULL REFERENCES users(id),object_key TEXT NOT NULL UNIQUE,original_name TEXT NOT NULL,mime_type TEXT NOT NULL CHECK(mime_type IN('application/pdf','image/jpeg','image/png')),size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=5242880),content_hash TEXT NOT NULL CHECK(length(content_hash)=64),request_id TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(uploaded_by,seller_id,request_id));
--> statement-breakpoint
CREATE TABLE managed_clearance_evidence_files(id TEXT PRIMARY KEY REFERENCES managed_clearance_evidence_intents(id),retained_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE managed_live_clearances(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL REFERENCES seller_profiles(id),owner_id TEXT NOT NULL REFERENCES users(id),model TEXT NOT NULL CHECK(model='managed_sale_linked_percentage_v1'),material_scope_digest TEXT NOT NULL CHECK(length(material_scope_digest)=64),company_scope_digest TEXT NOT NULL CHECK(length(company_scope_digest)=64),financial_scope_id TEXT NOT NULL,issuer_model TEXT NOT NULL CHECK(issuer_model='company_commercial_invoice_v1'),issuer_scope_digest TEXT NOT NULL CHECK(length(issuer_scope_digest)=64),scope_json TEXT NOT NULL CHECK(json_valid(scope_json)),evidence_ids_json TEXT NOT NULL CHECK(json_valid(evidence_ids_json) AND json_array_length(evidence_ids_json)>0),issuer TEXT NOT NULL,external_reference TEXT NOT NULL,issued_at INTEGER NOT NULL,effective_from INTEGER NOT NULL,valid_until INTEGER,reviewed_by TEXT NOT NULL REFERENCES users(id),reviewed_at INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'active' CHECK(state IN('active','revoked')),request_id TEXT NOT NULL UNIQUE,reason TEXT NOT NULL,revoked_by TEXT REFERENCES users(id),revoked_at INTEGER,revocation_reason TEXT,CHECK(issued_at>0 AND effective_from>=issued_at AND reviewed_at>=effective_from AND (valid_until IS NULL OR valid_until>reviewed_at)));
--> statement-breakpoint
CREATE TABLE managed_live_activation_decisions(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL REFERENCES seller_profiles(id),owner_id TEXT NOT NULL REFERENCES users(id),model TEXT NOT NULL CHECK(model='managed_sale_linked_percentage_v1'),clearance_id TEXT NOT NULL REFERENCES managed_live_clearances(id),material_scope_digest TEXT NOT NULL,company_scope_digest TEXT NOT NULL,financial_scope_id TEXT NOT NULL,issuer_model TEXT NOT NULL CHECK(issuer_model='company_commercial_invoice_v1'),issuer_scope_digest TEXT NOT NULL,source_json TEXT NOT NULL CHECK(json_valid(source_json)),revision INTEGER NOT NULL CHECK(revision>=1),previous_decision_id TEXT REFERENCES managed_live_activation_decisions(id),actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,request_id TEXT NOT NULL UNIQUE,reason TEXT NOT NULL,UNIQUE(seller_id,revision));
--> statement-breakpoint
CREATE INDEX managed_live_clearance_scope ON managed_live_clearances(seller_id,material_scope_digest,state);
--> statement-breakpoint
CREATE INDEX managed_live_decision_seller ON managed_live_activation_decisions(seller_id,revision);
--> statement-breakpoint
CREATE TRIGGER managed_live_clearance_attestations BEFORE INSERT ON managed_live_clearances
WHEN json_extract(NEW.scope_json,'$.attestations.externalAuthenticityConfirmed') IS NOT 1 OR json_extract(NEW.scope_json,'$.attestations.supplierRegistrationTaxAssessmentConfirmed') IS NOT 1 OR json_extract(NEW.scope_json,'$.attestations.invoiceIssuerConfirmed') IS NOT 1 OR json_extract(NEW.scope_json,'$.attestations.payoutBeneficiaryConfirmed') IS NOT 1
BEGIN SELECT RAISE(ABORT,'managed_live_explicit_external_attestation_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_clearance_upload_source BEFORE INSERT ON managed_clearance_evidence_intents
WHEN NOT (EXISTS(SELECT 1 FROM seller_profiles seller JOIN users owner ON owner.id=seller.user_id JOIN users actor ON actor.id=NEW.uploaded_by JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin' WHERE seller.id=NEW.seller_id AND owner.status='active' AND EXISTS(SELECT 1 FROM user_roles owner_access WHERE owner_access.user_id=owner.id AND owner_access.role='customer') AND actor.status='active' AND seller.user_id<>actor.id AND NOT EXISTS(SELECT 1 FROM managed_maker_application_details retained WHERE retained.seller_id=seller.id AND retained.agreement_accepted_by=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_clearances retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_activation_decisions retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id))) OR NEW.object_key<>'private/managed-clearance-evidence/'||NEW.id
BEGIN SELECT RAISE(ABORT,'managed_live_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_clearance_retained_file_source BEFORE INSERT ON managed_clearance_evidence_files
WHEN NOT EXISTS(SELECT 1 FROM managed_clearance_evidence_intents intent WHERE intent.id=NEW.id AND EXISTS(SELECT 1 FROM seller_profiles seller JOIN users owner ON owner.id=seller.user_id JOIN users actor ON actor.id=intent.uploaded_by JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin' WHERE seller.id=intent.seller_id AND owner.status='active' AND EXISTS(SELECT 1 FROM user_roles owner_access WHERE owner_access.user_id=owner.id AND owner_access.role='customer') AND actor.status='active' AND seller.user_id<>actor.id AND NOT EXISTS(SELECT 1 FROM managed_maker_application_details retained WHERE retained.seller_id=seller.id AND retained.agreement_accepted_by=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_clearances retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_activation_decisions retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id)))
BEGIN SELECT RAISE(ABORT,'managed_live_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_clearance_evidence_intents_update BEFORE UPDATE ON managed_clearance_evidence_intents
WHEN 1
BEGIN SELECT RAISE(ABORT,'managed_live_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER managed_clearance_evidence_intents_delete BEFORE DELETE ON managed_clearance_evidence_intents
WHEN 1
BEGIN SELECT RAISE(ABORT,'managed_live_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER managed_clearance_evidence_files_update BEFORE UPDATE ON managed_clearance_evidence_files
WHEN 1
BEGIN SELECT RAISE(ABORT,'managed_live_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER managed_clearance_evidence_files_delete BEFORE DELETE ON managed_clearance_evidence_files
WHEN 1
BEGIN SELECT RAISE(ABORT,'managed_live_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_activation_decisions_update BEFORE UPDATE ON managed_live_activation_decisions
WHEN 1
BEGIN SELECT RAISE(ABORT,'managed_live_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_activation_decisions_delete BEFORE DELETE ON managed_live_activation_decisions
WHEN 1
BEGIN SELECT RAISE(ABORT,'managed_live_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_clearance_actor BEFORE INSERT ON managed_live_clearances
WHEN NOT (EXISTS(SELECT 1 FROM seller_profiles seller JOIN users owner ON owner.id=seller.user_id JOIN users actor ON actor.id=NEW.reviewed_by JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin' WHERE seller.id=NEW.seller_id AND owner.status='active' AND EXISTS(SELECT 1 FROM user_roles owner_access WHERE owner_access.user_id=owner.id AND owner_access.role='customer') AND actor.status='active' AND seller.user_id<>actor.id AND NOT EXISTS(SELECT 1 FROM managed_maker_application_details retained WHERE retained.seller_id=seller.id AND retained.agreement_accepted_by=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_clearances retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_activation_decisions retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id)))
BEGIN SELECT RAISE(ABORT,'managed_live_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_clearance_original BEFORE INSERT ON managed_live_clearances
WHEN NOT EXISTS(SELECT 1 FROM seller_profiles s JOIN seller_participation_profiles p ON p.seller_id=s.id JOIN seller_protected_revisions revision ON revision.seller_id=s.id JOIN seller_beneficiary_versions beneficiary ON beneficiary.seller_id=s.id AND s.payout_account_reference='BENEFICIARY:'||beneficiary.id JOIN seller_documents document ON document.id=beneficiary.document_id AND document.seller_id=s.id WHERE s.id=NEW.seller_id AND s.user_id=NEW.owner_id AND p.participation_route='managed_maker' AND p.application_stage IN('approved_for_activation','active') AND revision.identity_revision=json_extract(NEW.scope_json,'$.sources.identityRevision') AND revision.bank_revision=json_extract(NEW.scope_json,'$.sources.bankRevision') AND beneficiary.id=json_extract(NEW.scope_json,'$.sources.beneficiaryVersionId') AND beneficiary.identity_revision=revision.identity_revision AND beneficiary.verified_by<>s.user_id AND document.status='verified' AND (document.valid_until IS NULL OR document.valid_until>NEW.reviewed_at) AND json_extract(NEW.scope_json,'$.material.sellerId')=s.id AND json_extract(NEW.scope_json,'$.material.ownerId')=s.user_id)
BEGIN SELECT RAISE(ABORT,'managed_live_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_clearance_external_files BEFORE INSERT ON managed_live_clearances
WHEN NOT EXISTS(SELECT 1 FROM json_each(NEW.evidence_ids_json)) OR EXISTS(SELECT 1 FROM json_each(NEW.evidence_ids_json) evidence WHERE NOT EXISTS(SELECT 1 FROM managed_clearance_evidence_intents intent JOIN managed_clearance_evidence_files file ON file.id=intent.id WHERE intent.id=evidence.value AND intent.seller_id=NEW.seller_id AND intent.material_scope_digest=NEW.material_scope_digest))
BEGIN SELECT RAISE(ABORT,'managed_live_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_clearance_financial_scope BEFORE INSERT ON managed_live_clearances
WHEN NOT EXISTS(SELECT 1 FROM managed_live_financial_scopes financial WHERE financial.id=NEW.financial_scope_id AND financial.company_scope_digest=NEW.company_scope_digest AND financial.issuer_model=NEW.issuer_model AND financial.issuer_scope_digest=NEW.issuer_scope_digest AND financial.company_entity_reference=json_extract(NEW.scope_json,'$.material.companyIdentity.entityReference') AND json_extract(financial.issuer_snapshot_json,'$.legalName')=json_extract(NEW.scope_json,'$.material.companyIdentity.company.legalName') AND json_extract(financial.issuer_snapshot_json,'$.taxRegistrationNumber')=json_extract(NEW.scope_json,'$.material.companyIdentity.company.pan'))
BEGIN SELECT RAISE(ABORT,'managed_live_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_clearance_revocation BEFORE UPDATE ON managed_live_clearances
WHEN NEW.id IS NOT OLD.id OR NEW.seller_id IS NOT OLD.seller_id OR NEW.owner_id IS NOT OLD.owner_id OR NEW.model IS NOT OLD.model OR NEW.material_scope_digest IS NOT OLD.material_scope_digest OR NEW.company_scope_digest IS NOT OLD.company_scope_digest OR NEW.financial_scope_id IS NOT OLD.financial_scope_id OR NEW.issuer_model IS NOT OLD.issuer_model OR NEW.issuer_scope_digest IS NOT OLD.issuer_scope_digest OR NEW.scope_json IS NOT OLD.scope_json OR NEW.evidence_ids_json IS NOT OLD.evidence_ids_json OR NEW.issuer IS NOT OLD.issuer OR NEW.external_reference IS NOT OLD.external_reference OR NEW.issued_at IS NOT OLD.issued_at OR NEW.effective_from IS NOT OLD.effective_from OR NEW.valid_until IS NOT OLD.valid_until OR NEW.reviewed_by IS NOT OLD.reviewed_by OR NEW.reviewed_at IS NOT OLD.reviewed_at OR NEW.request_id IS NOT OLD.request_id OR NEW.reason IS NOT OLD.reason OR OLD.state<>'active' OR NEW.state<>'revoked' OR NEW.revision<>OLD.revision+1 OR NEW.revoked_at IS NULL OR length(NEW.revocation_reason)<8 OR NOT (EXISTS(SELECT 1 FROM seller_profiles seller JOIN users owner ON owner.id=seller.user_id JOIN users actor ON actor.id=NEW.revoked_by JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin' WHERE seller.id=NEW.seller_id  AND actor.status='active' AND seller.user_id<>actor.id AND NOT EXISTS(SELECT 1 FROM managed_maker_application_details retained WHERE retained.seller_id=seller.id AND retained.agreement_accepted_by=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_clearances retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_activation_decisions retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id)))
BEGIN SELECT RAISE(ABORT,'managed_live_clearance_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_clearance_delete BEFORE DELETE ON managed_live_clearances
WHEN 1
BEGIN SELECT RAISE(ABORT,'managed_live_clearance_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_activation_actor BEFORE INSERT ON managed_live_activation_decisions
WHEN NOT (EXISTS(SELECT 1 FROM seller_profiles seller JOIN users owner ON owner.id=seller.user_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin' WHERE seller.id=NEW.seller_id AND owner.status='active' AND EXISTS(SELECT 1 FROM user_roles owner_access WHERE owner_access.user_id=owner.id AND owner_access.role='customer') AND actor.status='active' AND seller.user_id<>actor.id AND NOT EXISTS(SELECT 1 FROM managed_maker_application_details retained WHERE retained.seller_id=seller.id AND retained.agreement_accepted_by=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_clearances retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_activation_decisions retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id)))
BEGIN SELECT RAISE(ABORT,'managed_live_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_activation_clearance BEFORE INSERT ON managed_live_activation_decisions
WHEN NOT EXISTS(SELECT 1 FROM managed_live_clearances clearance WHERE clearance.id=NEW.clearance_id AND clearance.seller_id=NEW.seller_id AND clearance.owner_id=NEW.owner_id AND clearance.model=NEW.model AND clearance.material_scope_digest=NEW.material_scope_digest AND clearance.company_scope_digest=NEW.company_scope_digest AND clearance.financial_scope_id=NEW.financial_scope_id AND clearance.issuer_model=NEW.issuer_model AND clearance.issuer_scope_digest=NEW.issuer_scope_digest AND clearance.state='active' AND clearance.effective_from<=NEW.created_at AND (clearance.valid_until IS NULL OR clearance.valid_until>NEW.created_at))
BEGIN SELECT RAISE(ABORT,'managed_live_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_activation_participation BEFORE INSERT ON managed_live_activation_decisions
WHEN NOT EXISTS(SELECT 1 FROM seller_profiles s JOIN seller_participation_profiles p ON p.seller_id=s.id JOIN managed_maker_application_details accepted ON accepted.id=json_extract(NEW.source_json,'$.acceptedManagedDetailId') JOIN seller_protected_revisions revision ON revision.seller_id=s.id WHERE s.id=NEW.seller_id AND s.user_id=NEW.owner_id AND p.participation_route='managed_maker' AND p.application_stage='active' AND p.commercial_model=NEW.model AND p.payout_beneficiary_reference=s.payout_account_reference AND p.legal_seller_reference=json_extract(accepted.agreement_snapshot_json,'$.companyAccount.entityReference') AND p.invoice_issuer_reference=p.legal_seller_reference AND accepted.seller_id=s.id AND accepted.agreement_accepted_by=s.user_id AND accepted.agreement_version=p.managed_agreement_version AND accepted.agreement_accepted_at=p.managed_agreement_accepted_at AND accepted.agreement_accepted_at<=NEW.created_at AND revision.identity_revision=json_extract(NEW.source_json,'$.sources.identityRevision') AND revision.bank_revision=json_extract(NEW.source_json,'$.sources.bankRevision'))
BEGIN SELECT RAISE(ABORT,'managed_live_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_activation_holds BEFORE INSERT ON managed_live_activation_decisions
WHEN EXISTS(SELECT 1 FROM seller_capability_holds h WHERE h.seller_id=NEW.seller_id AND h.capability='new_orders' AND h.released_at IS NULL) OR EXISTS(SELECT 1 FROM seller_restrictions r WHERE r.seller_id=NEW.seller_id AND (r.mode='disabled' OR r.mode='suspended' AND r.suspended_until>NEW.created_at))
BEGIN SELECT RAISE(ABORT,'managed_live_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_activation_revision BEFORE INSERT ON managed_live_activation_decisions
WHEN NEW.revision<>COALESCE((SELECT MAX(previous.revision) FROM managed_live_activation_decisions previous WHERE previous.seller_id=NEW.seller_id),0)+1 OR COALESCE(NEW.previous_decision_id,'')<>COALESCE((SELECT previous.id FROM managed_live_activation_decisions previous WHERE previous.seller_id=NEW.seller_id ORDER BY previous.revision DESC LIMIT 1),'')
BEGIN SELECT RAISE(ABORT,'managed_live_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_clearances_clock BEFORE INSERT ON managed_live_clearances
WHEN NEW.reviewed_at<(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-1000 OR NEW.reviewed_at>(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))+1000
BEGIN SELECT RAISE(ABORT,'managed_live_authoritative_time_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_activation_decisions_clock BEFORE INSERT ON managed_live_activation_decisions
WHEN NEW.created_at<(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))-1000 OR NEW.created_at>(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))+1000
BEGIN SELECT RAISE(ABORT,'managed_live_authoritative_time_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_activation_program BEFORE INSERT ON managed_live_activation_decisions
WHEN NOT EXISTS(SELECT 1 FROM business_setting_versions setting WHERE setting.id=(SELECT current.id FROM business_setting_versions current WHERE current.setting_key='managed_maker_program_mode' AND current.status='published' AND current.effective_from<=NEW.created_at AND (current.effective_until IS NULL OR current.effective_until>NEW.created_at) ORDER BY current.effective_from DESC,current.version DESC LIMIT 1) AND setting.id=json_extract(NEW.source_json,'$.sources.settingVersions.program') AND setting.value_json='"activation_enabled"')
BEGIN SELECT RAISE(ABORT,'managed_live_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_activation_model BEFORE INSERT ON managed_live_activation_decisions
WHEN NOT EXISTS(SELECT 1 FROM business_setting_versions setting WHERE setting.id=(SELECT current.id FROM business_setting_versions current WHERE current.setting_key='managed_maker_active_model' AND current.status='published' AND current.effective_from<=NEW.created_at AND (current.effective_until IS NULL OR current.effective_until>NEW.created_at) ORDER BY current.effective_from DESC,current.version DESC LIMIT 1) AND setting.id=json_extract(NEW.source_json,'$.sources.settingVersions.model') AND setting.value_json='"managed_sale_linked_percentage_v1"')
BEGIN SELECT RAISE(ABORT,'managed_live_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_activation_current_terms BEFORE INSERT ON managed_live_activation_decisions
WHEN NOT EXISTS(SELECT 1 FROM managed_maker_application_details accepted WHERE accepted.id=json_extract(NEW.source_json,'$.acceptedManagedDetailId') AND COALESCE(json_extract(accepted.agreement_snapshot_json,'$.settingVersionIds.retention'),'')=COALESCE((SELECT current.id FROM business_setting_versions current WHERE current.setting_key='managed_sale_linked_platform_retention_bps' AND current.status='published' AND current.effective_from<=NEW.created_at AND (current.effective_until IS NULL OR current.effective_until>NEW.created_at) ORDER BY current.effective_from DESC,current.version DESC LIMIT 1),'') AND COALESCE(json_extract(accepted.agreement_snapshot_json,'$.settingVersionIds.account'),'')=COALESCE((SELECT current.id FROM business_setting_versions current WHERE current.setting_key='managed_maker_company_account' AND current.status='published' AND current.effective_from<=NEW.created_at AND (current.effective_until IS NULL OR current.effective_until>NEW.created_at) ORDER BY current.effective_from DESC,current.version DESC LIMIT 1),''))
BEGIN SELECT RAISE(ABORT,'managed_live_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_activation_document_representative_identity BEFORE INSERT ON managed_live_activation_decisions
WHEN json_extract(NEW.source_json,'$.agreementVersion')='managed-supplier-maker-2026-10-20-v2' AND NOT EXISTS(SELECT 1 FROM seller_documents proof WHERE proof.seller_id=NEW.seller_id AND proof.kind='representative_identity' AND proof.status='verified' AND proof.reviewed_by IS NOT NULL AND proof.reviewed_by<>NEW.owner_id AND proof.reviewed_at IS NOT NULL AND (proof.valid_until IS NULL OR proof.valid_until>NEW.created_at) AND NOT EXISTS(SELECT 1 FROM seller_documents newer WHERE newer.seller_id=proof.seller_id AND newer.kind=proof.kind AND newer.status='verified' AND (newer.uploaded_at>proof.uploaded_at OR newer.uploaded_at=proof.uploaded_at AND newer.id>proof.id)))
BEGIN SELECT RAISE(ABORT,'managed_live_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER managed_live_activation_document_pan_certificate BEFORE INSERT ON managed_live_activation_decisions
WHEN json_extract(NEW.source_json,'$.agreementVersion')='managed-supplier-maker-2026-10-20-v2' AND NOT EXISTS(SELECT 1 FROM seller_documents proof WHERE proof.seller_id=NEW.seller_id AND proof.kind='pan_certificate' AND proof.status='verified' AND proof.reviewed_by IS NOT NULL AND proof.reviewed_by<>NEW.owner_id AND proof.reviewed_at IS NOT NULL AND (proof.valid_until IS NULL OR proof.valid_until>NEW.created_at) AND NOT EXISTS(SELECT 1 FROM seller_documents newer WHERE newer.seller_id=proof.seller_id AND newer.kind=proof.kind AND newer.status='verified' AND (newer.uploaded_at>proof.uploaded_at OR newer.uploaded_at=proof.uploaded_at AND newer.id>proof.id)))
BEGIN SELECT RAISE(ABORT,'managed_live_current_source_required'); END;
