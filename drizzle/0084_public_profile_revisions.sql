-- Source-only additive profile workflow. Do not apply to the canonical local database to pass startup.
CREATE TABLE seller_public_profile_states (
 seller_id TEXT PRIMARY KEY NOT NULL REFERENCES seller_profiles(id),
 version INTEGER NOT NULL DEFAULT 0,
 current_json TEXT NOT NULL CHECK(json_valid(current_json)),
 display_name TEXT NOT NULL,
 public_city TEXT NOT NULL,
 about TEXT NOT NULL,
 specialties TEXT NOT NULL,
 legacy_sources_json TEXT NOT NULL CHECK(json_valid(legacy_sources_json)),
 provenance TEXT NOT NULL CHECK(provenance IN ('legacy_baseline','initial_minimal','reviewed_publication','reviewed_correction')),
 legacy_saved_at INTEGER,
 legacy_clock_reviewed_at INTEGER,
 legacy_clock_value INTEGER,
 legacy_clock_evidence TEXT,
 last_normal_publication_at INTEGER,
 current_revision_id TEXT,
 support_request_id TEXT,
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO seller_public_profile_states(seller_id,current_json,display_name,public_city,about,specialties,legacy_sources_json,provenance,legacy_saved_at,updated_at)
 SELECT s.id,json_object('publicName',COALESCE(p.public_name,s.trading_name),'publicCity',COALESCE(p.public_city,s.municipality),
   'about',COALESCE(s.business_description,''),'specialties','','craftExperience',json('[]'),'socialLinks',json('{}'),'media',json('[]')),
   COALESCE(p.public_name,s.trading_name),COALESCE(p.public_city,s.municipality),COALESCE(s.business_description,''),'',
   json_object('tradingName',s.trading_name,'publicName',p.public_name,'publicCity',p.public_city,'municipality',s.municipality,
     'about',s.business_description,'specialties',s.product_categories,'craftExperience',p.craft_experience_json,'socialLinks',p.social_links_json),
   'legacy_baseline',(SELECT MAX(created_at) FROM audit_logs WHERE subject_type='seller_profile' AND subject_id=s.id AND action='seller.public_profile.saved'),s.updated_at
 FROM seller_profiles s LEFT JOIN seller_participation_profiles p ON p.seller_id=s.id;
--> statement-breakpoint
CREATE TRIGGER public_profile_minimal_created AFTER INSERT ON seller_profiles
 BEGIN INSERT INTO seller_public_profile_states(seller_id,current_json,display_name,public_city,about,specialties,legacy_sources_json,provenance,updated_at)
 VALUES(NEW.id,json_object('publicName',NEW.trading_name,'publicCity',NEW.municipality,'about','','specialties','','craftExperience',json('[]'),'socialLinks',json('{}'),'media',json('[]')),
 NEW.trading_name,NEW.municipality,'','',json_object('tradingName',NEW.trading_name,'municipality',NEW.municipality,'about',NEW.business_description,'specialties',NEW.product_categories),'initial_minimal',NEW.updated_at); END;
--> statement-breakpoint
CREATE TRIGGER public_profile_initial_participation AFTER INSERT ON seller_participation_profiles
 BEGIN UPDATE seller_public_profile_states SET current_json=json_set(current_json,'$.publicName',COALESCE(NEW.public_name,json_extract(current_json,'$.publicName')),
 '$.publicCity',COALESCE(NEW.public_city,json_extract(current_json,'$.publicCity'))),display_name=COALESCE(NEW.public_name,display_name),public_city=COALESCE(NEW.public_city,public_city),
 legacy_sources_json=json_set(legacy_sources_json,'$.publicName',NEW.public_name,'$.publicCity',NEW.public_city,'$.craftExperience',NEW.craft_experience_json,'$.socialLinks',NEW.social_links_json)
 WHERE seller_id=NEW.seller_id AND provenance='initial_minimal' AND version=0
 AND NOT EXISTS(SELECT 1 FROM seller_public_profile_drafts WHERE seller_id=NEW.seller_id)
 AND NOT EXISTS(SELECT 1 FROM seller_public_profile_revisions WHERE seller_id=NEW.seller_id); END;
--> statement-breakpoint
CREATE TABLE seller_public_profile_drafts (
 seller_id TEXT PRIMARY KEY NOT NULL REFERENCES seller_profiles(id),
 owner_id TEXT NOT NULL REFERENCES users(id),
 revision TEXT NOT NULL,
 base_version INTEGER NOT NULL,
 values_json TEXT NOT NULL CHECK(json_valid(values_json)),
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE seller_public_profile_revisions (
 id TEXT PRIMARY KEY NOT NULL,
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
 sequence INTEGER NOT NULL CHECK(sequence>0),
 case_id TEXT NOT NULL REFERENCES seller_public_profile_revisions(id),
 supersedes_id TEXT REFERENCES seller_public_profile_revisions(id),
 kind TEXT NOT NULL DEFAULT 'normal' CHECK(kind IN ('normal','correction')),
 correction_case_id TEXT,
 base_version INTEGER NOT NULL,
 base_json TEXT NOT NULL CHECK(json_valid(base_json)),
 values_json TEXT NOT NULL CHECK(json_valid(values_json)),
 content_hash TEXT NOT NULL,
 draft_revision TEXT NOT NULL,
 submitted_by TEXT NOT NULL REFERENCES users(id),
 owner_id TEXT NOT NULL REFERENCES users(id),
 submitted_at INTEGER NOT NULL,
 first_submitted_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','changes_requested','rejected','approved','published','withdrawn','needs_rebase')),
 version INTEGER NOT NULL DEFAULT 0,
 reviewed_by TEXT REFERENCES users(id),
 reviewed_at INTEGER,
 review_reason TEXT,
 published_at INTEGER,
 operation_request_id TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX public_profile_one_normal_candidate ON seller_public_profile_revisions(seller_id) WHERE kind='normal' AND status IN ('submitted','approved');
--> statement-breakpoint
CREATE UNIQUE INDEX public_profile_revision_history ON seller_public_profile_revisions(seller_id,sequence);
--> statement-breakpoint
CREATE TABLE seller_public_profile_revision_media (
 revision_id TEXT NOT NULL REFERENCES seller_public_profile_revisions(id),
 media_id TEXT NOT NULL REFERENCES seller_profile_media(id),
 kind TEXT NOT NULL CHECK(kind IN ('profile_image','maker_video')),
 caption TEXT NOT NULL,
 PRIMARY KEY(revision_id,media_id),
 UNIQUE(revision_id,kind)
);
--> statement-breakpoint
DROP INDEX idx_seller_profile_media_kind;
--> statement-breakpoint
CREATE INDEX seller_profile_media_history ON seller_profile_media(seller_id,kind,uploaded_at,id);
--> statement-breakpoint
CREATE TABLE seller_public_profile_events (
 id TEXT PRIMARY KEY NOT NULL,
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
 revision_id TEXT REFERENCES seller_public_profile_revisions(id),
 correction_id TEXT REFERENCES seller_public_profile_corrections(id),
 actor_id TEXT REFERENCES users(id),
 action TEXT NOT NULL,
 reason TEXT NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER public_profile_candidate_immutable BEFORE UPDATE ON seller_public_profile_revisions
 WHEN NEW.id IS NOT OLD.id OR NEW.seller_id IS NOT OLD.seller_id OR NEW.sequence IS NOT OLD.sequence OR NEW.case_id IS NOT OLD.case_id OR NEW.supersedes_id IS NOT OLD.supersedes_id
 OR NEW.kind IS NOT OLD.kind OR NEW.correction_case_id IS NOT OLD.correction_case_id OR NEW.base_version IS NOT OLD.base_version OR NEW.base_json IS NOT OLD.base_json
 OR NEW.values_json IS NOT OLD.values_json OR NEW.content_hash IS NOT OLD.content_hash OR NEW.draft_revision IS NOT OLD.draft_revision
 OR NEW.submitted_by IS NOT OLD.submitted_by OR NEW.owner_id IS NOT OLD.owner_id OR NEW.submitted_at IS NOT OLD.submitted_at OR NEW.first_submitted_at IS NOT OLD.first_submitted_at
 OR (OLD.published_at IS NOT NULL AND (NEW.published_at IS NOT OLD.published_at OR NEW.status IS NOT OLD.status))
 BEGIN SELECT RAISE(ABORT,'public_profile_candidate_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER public_profile_candidate_retained BEFORE DELETE ON seller_public_profile_revisions
 BEGIN SELECT RAISE(ABORT,'public_profile_candidate_retained'); END;
--> statement-breakpoint
CREATE TRIGGER public_profile_event_immutable BEFORE UPDATE ON seller_public_profile_events
 BEGIN SELECT RAISE(ABORT,'public_profile_event_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER public_profile_event_retained BEFORE DELETE ON seller_public_profile_events
 BEGIN SELECT RAISE(ABORT,'public_profile_event_retained'); END;
--> statement-breakpoint
CREATE TRIGGER public_profile_revision_media_immutable BEFORE UPDATE ON seller_public_profile_revision_media
 BEGIN SELECT RAISE(ABORT,'public_profile_revision_media_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER public_profile_revision_media_retained BEFORE DELETE ON seller_public_profile_revision_media
 BEGIN SELECT RAISE(ABORT,'public_profile_revision_media_retained'); END;
--> statement-breakpoint
CREATE TRIGGER public_profile_media_identity_immutable BEFORE UPDATE ON seller_profile_media
 WHEN NEW.id IS NOT OLD.id OR NEW.seller_id IS NOT OLD.seller_id OR NEW.kind IS NOT OLD.kind OR NEW.object_key IS NOT OLD.object_key
 OR NEW.original_name IS NOT OLD.original_name OR NEW.mime_type IS NOT OLD.mime_type OR NEW.size_bytes IS NOT OLD.size_bytes OR NEW.uploaded_at IS NOT OLD.uploaded_at
 BEGIN SELECT RAISE(ABORT,'public_profile_media_identity_immutable'); END;
--> statement-breakpoint
CREATE TABLE seller_public_profile_corrections (
 id TEXT PRIMARY KEY NOT NULL,
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
 owner_id TEXT NOT NULL REFERENCES users(id),
 category TEXT NOT NULL CHECK(category IN ('wrong_detail','location_correction','privacy','compromised_link','staff_requested')),
 fields_json TEXT NOT NULL CHECK(json_valid(fields_json)),
 scope_hash TEXT NOT NULL,
 original_base_version INTEGER NOT NULL,
 original_json TEXT NOT NULL CHECK(json_valid(original_json)),
 base_version INTEGER NOT NULL,
 desired_json TEXT CHECK(desired_json IS NULL OR json_valid(desired_json)),
 requested_by TEXT NOT NULL REFERENCES users(id),
 requested_at INTEGER NOT NULL,
 reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','clarification','authorized','declined','applied','withdrawn')),
 version INTEGER NOT NULL DEFAULT 0,
 reviewed_by TEXT REFERENCES users(id),
 reviewed_at INTEGER,
 review_reason TEXT,
 next_update_at INTEGER,
 operation_request_id TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX public_profile_correction_active ON seller_public_profile_corrections(seller_id,scope_hash) WHERE status IN ('requested','clarification','authorized');
--> statement-breakpoint
CREATE TRIGGER public_profile_correction_source_immutable BEFORE UPDATE ON seller_public_profile_corrections
 WHEN NEW.id IS NOT OLD.id OR NEW.seller_id IS NOT OLD.seller_id OR NEW.owner_id IS NOT OLD.owner_id OR NEW.category IS NOT OLD.category
 OR NEW.fields_json IS NOT OLD.fields_json OR NEW.scope_hash IS NOT OLD.scope_hash OR NEW.original_base_version IS NOT OLD.original_base_version OR NEW.original_json IS NOT OLD.original_json
 OR NEW.requested_by IS NOT OLD.requested_by OR NEW.requested_at IS NOT OLD.requested_at OR NEW.reason IS NOT OLD.reason OR (OLD.status='applied' AND NEW.status IS NOT OLD.status)
 BEGIN SELECT RAISE(ABORT,'public_profile_correction_source_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER public_profile_correction_retained BEFORE DELETE ON seller_public_profile_corrections
 BEGIN SELECT RAISE(ABORT,'public_profile_correction_retained'); END;
