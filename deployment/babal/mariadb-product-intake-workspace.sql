-- Source-only MariaDB counterpart of 0092. No database execution.

CREATE TABLE product_intake_workspace_versions(id VARCHAR(191) PRIMARY KEY,draft_id VARCHAR(191) NOT NULL,revision BIGINT NOT NULL,kind VARCHAR(191) NOT NULL DEFAULT 'private' CHECK(kind IN ('private','review_only')),base_public_version_id VARCHAR(191),snapshot_json LONGTEXT NOT NULL CHECK(json_valid(snapshot_json)),created_by VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,private_revision BIGINT GENERATED ALWAYS AS (CASE WHEN kind='private' THEN revision ELSE NULL END) STORED,UNIQUE(draft_id,private_revision),CHECK((kind='private' AND base_public_version_id IS NULL) OR (kind='review_only' AND base_public_version_id IS NOT NULL)),FOREIGN KEY(draft_id) REFERENCES product_intake_drafts(id),FOREIGN KEY(created_by) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_intake_workspace_heads(draft_id VARCHAR(191) PRIMARY KEY,version_id VARCHAR(191) NOT NULL,FOREIGN KEY(draft_id) REFERENCES product_intake_drafts(id),FOREIGN KEY(version_id) REFERENCES product_intake_workspace_versions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_intake_media(id VARCHAR(191) PRIMARY KEY,draft_id VARCHAR(191) NOT NULL,owner_id VARCHAR(191) NOT NULL,request_id VARCHAR(191) NOT NULL,object_key VARCHAR(512) NOT NULL UNIQUE,mime_type VARCHAR(191) NOT NULL,size_bytes BIGINT NOT NULL CHECK(size_bytes>0),original_name VARCHAR(191) NOT NULL,content_digest VARCHAR(191) NOT NULL,state VARCHAR(191) NOT NULL CHECK(state IN ('uploading','ready')),created_at BIGINT NOT NULL,completed_at BIGINT,UNIQUE(owner_id,request_id),FOREIGN KEY(draft_id) REFERENCES product_intake_drafts(id),FOREIGN KEY(owner_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_intake_cases(id VARCHAR(191) PRIMARY KEY,draft_id VARCHAR(191) NOT NULL,cycle_number BIGINT NOT NULL DEFAULT 0 CHECK(cycle_number>=0),version_id VARCHAR(191) NOT NULL,revision BIGINT NOT NULL DEFAULT 0,state VARCHAR(191) NOT NULL CHECK(state IN ('details_needed','submitted','in_review','waiting_seller','ready_for_decision','resolved')),first_requested_at BIGINT NOT NULL,triage_due_at BIGINT NOT NULL,triaged_at BIGINT,first_complete_at BIGINT,review_due_at BIGINT,first_reviewed_at BIGINT,last_event_id VARCHAR(191) NOT NULL,active_proposal_id VARCHAR(191),active_draft_id VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN state<>'resolved' THEN draft_id ELSE NULL END) STORED,UNIQUE(draft_id,cycle_number),UNIQUE(active_draft_id),CHECK(revision>=0 AND triage_due_at>=first_requested_at),FOREIGN KEY(draft_id) REFERENCES product_intake_drafts(id),FOREIGN KEY(version_id) REFERENCES product_intake_workspace_versions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_intake_events(id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL,version_id VARCHAR(191) NOT NULL,event_key VARCHAR(191) NOT NULL UNIQUE,kind VARCHAR(191) NOT NULL,actor_id VARCHAR(191) NOT NULL,detail_json LONGTEXT NOT NULL CHECK(json_valid(detail_json)),created_at BIGINT NOT NULL,FOREIGN KEY(case_id) REFERENCES product_intake_cases(id),FOREIGN KEY(version_id) REFERENCES product_intake_workspace_versions(id),FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_intake_proposals(id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL,base_version_id VARCHAR(191) NOT NULL,patch_json LONGTEXT NOT NULL CHECK(json_valid(patch_json)),source_note TEXT NOT NULL,actor_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,state VARCHAR(191) NOT NULL CHECK(state IN ('pending','accepted','declined','superseded')),decided_by VARCHAR(191),decided_at BIGINT,accepted_version_id VARCHAR(191),FOREIGN KEY(case_id) REFERENCES product_intake_cases(id),FOREIGN KEY(base_version_id) REFERENCES product_intake_workspace_versions(id),FOREIGN KEY(actor_id) REFERENCES users(id),FOREIGN KEY(decided_by) REFERENCES users(id),FOREIGN KEY(accepted_version_id) REFERENCES product_intake_workspace_versions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER product_intake_workspace_immutable BEFORE UPDATE ON product_intake_workspace_versions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_workspace_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_workspace_retained BEFORE DELETE ON product_intake_workspace_versions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_workspace_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_event_immutable BEFORE UPDATE ON product_intake_events FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_event_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_event_retained BEFORE DELETE ON product_intake_events FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_event_retained';
END$$
DELIMITER ;

CREATE INDEX product_intake_media_draft ON product_intake_media(draft_id,created_at,id);

CREATE INDEX product_intake_event_history ON product_intake_events(case_id,created_at,id);

CREATE INDEX product_intake_proposal_history ON product_intake_proposals(case_id,created_at,id);

DELIMITER $$
CREATE TRIGGER product_intake_head_insert BEFORE INSERT ON product_intake_workspace_heads FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_intake_workspace_versions v JOIN product_intake_drafts d ON d.id=v.draft_id WHERE v.id=NEW.version_id AND d.id=NEW.draft_id AND v.revision=d.revision AND v.kind='private') THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_head_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_head_update BEFORE UPDATE ON product_intake_workspace_heads FOR EACH ROW BEGIN
IF NOT (NEW.draft_id <=> OLD.draft_id) OR NOT EXISTS(SELECT 1 FROM product_intake_workspace_versions v JOIN product_intake_drafts d ON d.id=v.draft_id JOIN product_intake_workspace_versions prior_version ON prior_version.id=OLD.version_id WHERE v.id=NEW.version_id AND d.id=NEW.draft_id AND v.revision=d.revision AND v.kind='private' AND v.revision>prior_version.revision) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_head_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_media_source BEFORE INSERT ON product_intake_media FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_intake_drafts WHERE id=NEW.draft_id AND owner_id=NEW.owner_id) OR NEW.mime_type NOT IN ('image/jpeg','image/png','image/webp','video/mp4') OR NEW.size_bytes>CASE WHEN NEW.mime_type='video/mp4' THEN 20971520 ELSE 5242880 END OR (NEW.state='ready')<>(NEW.completed_at IS NOT NULL) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_media_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_media_immutable BEFORE UPDATE ON product_intake_media FOR EACH ROW BEGIN
IF NOT (NEW.id <=> OLD.id) OR NOT (NEW.draft_id <=> OLD.draft_id) OR NOT (NEW.owner_id <=> OLD.owner_id) OR NOT (NEW.request_id <=> OLD.request_id) OR NOT (NEW.object_key <=> OLD.object_key) OR NOT (NEW.mime_type <=> OLD.mime_type) OR NOT (NEW.size_bytes <=> OLD.size_bytes) OR NOT (NEW.original_name <=> OLD.original_name) OR NOT (NEW.content_digest <=> OLD.content_digest) OR NOT (NEW.created_at <=> OLD.created_at) OR OLD.state<>'uploading' OR NEW.state<>'ready' OR NEW.completed_at IS NULL OR NEW.completed_at<OLD.created_at THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_media_immutable';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_case_source BEFORE INSERT ON product_intake_cases FOR EACH ROW BEGIN
IF NEW.cycle_number<>COALESCE((SELECT MAX(cycle_number)+1 FROM product_intake_cases WHERE draft_id=NEW.draft_id),0) OR NOT EXISTS(SELECT 1 FROM product_intake_workspace_versions WHERE id=NEW.version_id AND draft_id=NEW.draft_id) OR NEW.triage_due_at<>NEW.first_requested_at+86400000 OR (NEW.first_complete_at IS NULL)<>(NEW.review_due_at IS NULL) OR NEW.review_due_at<>NEW.first_complete_at+86400000 THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_case_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_case_revision BEFORE UPDATE ON product_intake_cases FOR EACH ROW BEGIN
IF OLD.state='resolved' OR NEW.cycle_number<>OLD.cycle_number OR NOT (NEW.id <=> OLD.id) OR NOT (NEW.draft_id <=> OLD.draft_id) OR NEW.revision<>OLD.revision+1 OR NOT (NEW.first_requested_at <=> OLD.first_requested_at) OR NOT (NEW.triage_due_at <=> OLD.triage_due_at) OR (OLD.triaged_at IS NOT NULL AND NOT (NEW.triaged_at <=> OLD.triaged_at)) OR (OLD.first_complete_at IS NOT NULL AND NOT (NEW.first_complete_at <=> OLD.first_complete_at)) OR (OLD.review_due_at IS NOT NULL AND NOT (NEW.review_due_at <=> OLD.review_due_at)) OR (OLD.first_reviewed_at IS NOT NULL AND NOT (NEW.first_reviewed_at <=> OLD.first_reviewed_at)) OR (NEW.first_complete_at IS NULL)<>(NEW.review_due_at IS NULL) OR NEW.review_due_at<>NEW.first_complete_at+86400000 OR NOT EXISTS(SELECT 1 FROM product_intake_workspace_versions WHERE id=NEW.version_id AND draft_id=NEW.draft_id) OR (NEW.active_proposal_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_intake_proposals WHERE id=NEW.active_proposal_id AND case_id=NEW.id AND base_version_id=NEW.version_id AND state='pending')) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_case_revision';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_case_retained BEFORE DELETE ON product_intake_cases FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_case_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_event_source BEFORE INSERT ON product_intake_events FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_intake_cases c JOIN product_intake_workspace_versions v ON v.draft_id=c.draft_id WHERE c.id=NEW.case_id AND v.id=NEW.version_id) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_event_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_proposal_source BEFORE INSERT ON product_intake_proposals FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_intake_cases c WHERE c.id=NEW.case_id AND c.version_id=NEW.base_version_id) OR NEW.state<>'pending' OR NEW.decided_by IS NOT NULL OR NEW.decided_at IS NOT NULL OR NEW.accepted_version_id IS NOT NULL THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_proposal_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_proposal_immutable BEFORE UPDATE ON product_intake_proposals FOR EACH ROW BEGIN
IF NOT (NEW.id <=> OLD.id) OR NOT (NEW.case_id <=> OLD.case_id) OR NOT (NEW.base_version_id <=> OLD.base_version_id) OR NOT (NEW.patch_json <=> OLD.patch_json) OR NOT (NEW.source_note <=> OLD.source_note) OR NOT (NEW.actor_id <=> OLD.actor_id) OR NOT (NEW.created_at <=> OLD.created_at) OR OLD.state<>'pending' OR NEW.state NOT IN ('accepted','declined','superseded') OR (NEW.state IN ('accepted','declined') AND (NEW.decided_by IS NULL OR NEW.decided_at IS NULL OR NEW.decided_at<OLD.created_at)) OR (NEW.state='accepted' AND NOT EXISTS(SELECT 1 FROM product_intake_workspace_versions v JOIN product_intake_cases c ON c.draft_id=v.draft_id WHERE c.id=NEW.case_id AND v.id=NEW.accepted_version_id)) OR (NEW.state<>'accepted' AND NEW.accepted_version_id IS NOT NULL) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_proposal_immutable';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_proposal_retained BEFORE DELETE ON product_intake_proposals FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_proposal_retained';
END$$
DELIMITER ;
