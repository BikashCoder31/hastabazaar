-- Source-only MariaDB counterpart for drizzle/0084. Generation never applies it to a database.

CREATE TABLE seller_public_profile_states (
 seller_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES seller_profiles(id),
 version BIGINT NOT NULL DEFAULT 0,
 current_json LONGTEXT NOT NULL CHECK(json_valid(current_json)),
 display_name TEXT NOT NULL,
 public_city TEXT NOT NULL,
 about TEXT NOT NULL,
 specialties TEXT NOT NULL,
 legacy_sources_json LONGTEXT NOT NULL CHECK(json_valid(legacy_sources_json)),
 provenance VARCHAR(64) NOT NULL CHECK(provenance IN ('legacy_baseline','initial_minimal','reviewed_publication','reviewed_correction')),
 legacy_saved_at BIGINT,
 legacy_clock_reviewed_at BIGINT,
 legacy_clock_value BIGINT,
 legacy_clock_evidence TEXT,
 last_normal_publication_at BIGINT,
 current_revision_id VARCHAR(191),
 support_request_id VARCHAR(191),
 updated_at BIGINT NOT NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_public_profile_drafts (
 seller_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES seller_profiles(id),
 owner_id VARCHAR(191) NOT NULL REFERENCES users(id),
 revision VARCHAR(191) NOT NULL,
 base_version BIGINT NOT NULL,
 values_json LONGTEXT NOT NULL CHECK(json_valid(values_json)),
 updated_at BIGINT NOT NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_public_profile_revisions (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 sequence BIGINT NOT NULL CHECK(sequence>0),
 case_id VARCHAR(191) NOT NULL REFERENCES seller_public_profile_revisions(id),
 supersedes_id VARCHAR(191) REFERENCES seller_public_profile_revisions(id),
 kind VARCHAR(64) NOT NULL DEFAULT 'normal' CHECK(kind IN ('normal','correction')),
 correction_case_id VARCHAR(191),
 base_version BIGINT NOT NULL,
 base_json LONGTEXT NOT NULL CHECK(json_valid(base_json)),
 values_json LONGTEXT NOT NULL CHECK(json_valid(values_json)),
 content_hash VARCHAR(191) NOT NULL,
 draft_revision VARCHAR(191) NOT NULL,
 submitted_by VARCHAR(191) NOT NULL REFERENCES users(id),
 owner_id VARCHAR(191) NOT NULL REFERENCES users(id),
 submitted_at BIGINT NOT NULL,
 first_submitted_at BIGINT NOT NULL,
 status VARCHAR(64) NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','changes_requested','rejected','approved','published','withdrawn','needs_rebase')),
 version BIGINT NOT NULL DEFAULT 0,
 reviewed_by VARCHAR(191) REFERENCES users(id),
 reviewed_at BIGINT,
 review_reason TEXT,
 published_at BIGINT,
 operation_request_id VARCHAR(191) NOT NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_public_profile_revision_media (
 revision_id VARCHAR(191) NOT NULL REFERENCES seller_public_profile_revisions(id),
 media_id VARCHAR(191) NOT NULL REFERENCES seller_profile_media(id),
 kind VARCHAR(64) NOT NULL CHECK(kind IN ('profile_image','maker_video')),
 caption TEXT NOT NULL,
 PRIMARY KEY(revision_id,media_id),
 UNIQUE(revision_id,kind)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_public_profile_corrections (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 owner_id VARCHAR(191) NOT NULL REFERENCES users(id),
 category VARCHAR(64) NOT NULL CHECK(category IN ('wrong_detail','location_correction','privacy','compromised_link','staff_requested')),
 fields_json LONGTEXT NOT NULL CHECK(json_valid(fields_json)),
 scope_hash VARCHAR(191) NOT NULL,
 original_base_version BIGINT NOT NULL,
 original_json LONGTEXT NOT NULL CHECK(json_valid(original_json)),
 base_version BIGINT NOT NULL,
 desired_json LONGTEXT CHECK(desired_json IS NULL OR json_valid(desired_json)),
 requested_by VARCHAR(191) NOT NULL REFERENCES users(id),
 requested_at BIGINT NOT NULL,
 reason TEXT NOT NULL,
 status VARCHAR(64) NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','clarification','authorized','declined','applied','withdrawn')),
 version BIGINT NOT NULL DEFAULT 0,
 reviewed_by VARCHAR(191) REFERENCES users(id),
 reviewed_at BIGINT,
 review_reason TEXT,
 next_update_at BIGINT,
 operation_request_id VARCHAR(191) NOT NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_public_profile_events (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 revision_id VARCHAR(191) REFERENCES seller_public_profile_revisions(id),
 correction_id VARCHAR(191) REFERENCES seller_public_profile_corrections(id),
 actor_id VARCHAR(191) REFERENCES users(id),
 action VARCHAR(64) NOT NULL,
 reason TEXT NOT NULL,
 payload_json LONGTEXT NOT NULL CHECK(json_valid(payload_json)),
 created_at BIGINT NOT NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO seller_public_profile_states(seller_id,current_json,display_name,public_city,about,specialties,legacy_sources_json,provenance,legacy_saved_at,updated_at)
 SELECT s.id,json_object('publicName',COALESCE(p.public_name,s.trading_name),'publicCity',COALESCE(p.public_city,s.municipality),
   'about',COALESCE(s.business_description,''),'specialties','','craftExperience',JSON_ARRAY(),'socialLinks',JSON_OBJECT(),'media',JSON_ARRAY()),
   COALESCE(p.public_name,s.trading_name),COALESCE(p.public_city,s.municipality),COALESCE(s.business_description,''),'',
   json_object('tradingName',s.trading_name,'publicName',p.public_name,'publicCity',p.public_city,'municipality',s.municipality,
     'about',s.business_description,'specialties',s.product_categories,'craftExperience',p.craft_experience_json,'socialLinks',p.social_links_json),
   'legacy_baseline',(SELECT MAX(created_at) FROM audit_logs WHERE subject_type='seller_profile' AND subject_id=s.id AND action='seller.public_profile.saved'),s.updated_at
 FROM seller_profiles s LEFT JOIN seller_participation_profiles p ON p.seller_id=s.id;

CREATE UNIQUE INDEX public_profile_revision_history ON seller_public_profile_revisions(seller_id,sequence);

DROP INDEX idx_seller_profile_media_kind ON seller_profile_media;

CREATE INDEX seller_profile_media_history ON seller_profile_media(seller_id,kind,uploaded_at,id);

ALTER TABLE seller_public_profile_revisions ADD COLUMN active_normal_seller VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN kind='normal' AND status IN ('submitted','approved') THEN seller_id ELSE NULL END) PERSISTENT,
 ADD UNIQUE KEY public_profile_one_normal_candidate(active_normal_seller);
ALTER TABLE seller_public_profile_corrections ADD COLUMN active_scope VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN status IN ('requested','clarification','authorized') THEN scope_hash ELSE NULL END) PERSISTENT,
 ADD UNIQUE KEY public_profile_correction_active(seller_id,active_scope);

DELIMITER $$
CREATE TRIGGER public_profile_minimal_created AFTER INSERT ON seller_profiles FOR EACH ROW BEGIN
 INSERT INTO seller_public_profile_states(seller_id,current_json,display_name,public_city,about,specialties,legacy_sources_json,provenance,updated_at)
 VALUES(NEW.id,json_object('publicName',NEW.trading_name,'publicCity',NEW.municipality,'about','','specialties','','craftExperience',JSON_ARRAY(),'socialLinks',JSON_OBJECT(),'media',JSON_ARRAY()),
 NEW.trading_name,NEW.municipality,'','',json_object('tradingName',NEW.trading_name,'municipality',NEW.municipality,'about',NEW.business_description,'specialties',NEW.product_categories),'initial_minimal',NEW.updated_at);
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_initial_participation AFTER INSERT ON seller_participation_profiles FOR EACH ROW BEGIN
 UPDATE seller_public_profile_states SET current_json=json_set(current_json,'$.publicName',COALESCE(NEW.public_name,JSON_UNQUOTE(JSON_EXTRACT(current_json,'$.publicName'))),
 '$.publicCity',COALESCE(NEW.public_city,JSON_UNQUOTE(JSON_EXTRACT(current_json,'$.publicCity')))),display_name=COALESCE(NEW.public_name,display_name),public_city=COALESCE(NEW.public_city,public_city),
 legacy_sources_json=json_set(legacy_sources_json,'$.publicName',NEW.public_name,'$.publicCity',NEW.public_city,'$.craftExperience',NEW.craft_experience_json,'$.socialLinks',NEW.social_links_json)
 WHERE seller_id=NEW.seller_id AND provenance='initial_minimal' AND version=0
 AND NOT EXISTS(SELECT 1 FROM seller_public_profile_drafts WHERE seller_id=NEW.seller_id)
 AND NOT EXISTS(SELECT 1 FROM seller_public_profile_revisions WHERE seller_id=NEW.seller_id);
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_candidate_immutable BEFORE UPDATE ON seller_public_profile_revisions FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.seller_id <=> OLD.seller_id) OR NOT(NEW.sequence <=> OLD.sequence) OR NOT(NEW.case_id <=> OLD.case_id) OR NOT(NEW.supersedes_id <=> OLD.supersedes_id)
 OR NOT(NEW.kind <=> OLD.kind) OR NOT(NEW.correction_case_id <=> OLD.correction_case_id) OR NOT(NEW.base_version <=> OLD.base_version) OR NOT(NEW.base_json <=> OLD.base_json)
 OR NOT(NEW.values_json <=> OLD.values_json) OR NOT(NEW.content_hash <=> OLD.content_hash) OR NOT(NEW.draft_revision <=> OLD.draft_revision)
 OR NOT(NEW.submitted_by <=> OLD.submitted_by) OR NOT(NEW.owner_id <=> OLD.owner_id) OR NOT(NEW.submitted_at <=> OLD.submitted_at) OR NOT(NEW.first_submitted_at <=> OLD.first_submitted_at)
 OR (OLD.published_at IS NOT NULL AND (NOT(NEW.published_at <=> OLD.published_at) OR NOT(NEW.status <=> OLD.status))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_candidate_immutable'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_candidate_retained BEFORE DELETE ON seller_public_profile_revisions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_candidate_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_event_immutable BEFORE UPDATE ON seller_public_profile_events FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_event_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_event_retained BEFORE DELETE ON seller_public_profile_events FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_event_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_revision_media_immutable BEFORE UPDATE ON seller_public_profile_revision_media FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_revision_media_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_revision_media_retained BEFORE DELETE ON seller_public_profile_revision_media FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_revision_media_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_media_identity_immutable BEFORE UPDATE ON seller_profile_media FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.seller_id <=> OLD.seller_id) OR NOT(NEW.kind <=> OLD.kind) OR NOT(NEW.object_key <=> OLD.object_key)
 OR NOT(NEW.original_name <=> OLD.original_name) OR NOT(NEW.mime_type <=> OLD.mime_type) OR NOT(NEW.size_bytes <=> OLD.size_bytes) OR NOT(NEW.uploaded_at <=> OLD.uploaded_at) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_media_identity_immutable'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_correction_source_immutable BEFORE UPDATE ON seller_public_profile_corrections FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.seller_id <=> OLD.seller_id) OR NOT(NEW.owner_id <=> OLD.owner_id) OR NOT(NEW.category <=> OLD.category)
 OR NOT(NEW.fields_json <=> OLD.fields_json) OR NOT(NEW.scope_hash <=> OLD.scope_hash) OR NOT(NEW.original_base_version <=> OLD.original_base_version) OR NOT(NEW.original_json <=> OLD.original_json)
 OR NOT(NEW.requested_by <=> OLD.requested_by) OR NOT(NEW.requested_at <=> OLD.requested_at) OR NOT(NEW.reason <=> OLD.reason) OR (OLD.status='applied' AND NOT(NEW.status <=> OLD.status)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_correction_source_immutable'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_correction_retained BEFORE DELETE ON seller_public_profile_corrections FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_correction_retained';
END$$
DELIMITER ;
