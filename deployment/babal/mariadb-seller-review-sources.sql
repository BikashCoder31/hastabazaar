-- Source-only MariaDB counterpart of 0085; no database is changed by generation.
ALTER TABLE review_tasks ADD COLUMN has_deadline BIGINT NOT NULL DEFAULT 1 CHECK(has_deadline IN (0,1));

UPDATE review_tasks SET has_deadline=0 WHERE source_type='public_profile_correction';

DELIMITER $$
CREATE TRIGGER review_task_deadline_policy_immutable BEFORE UPDATE ON review_tasks FOR EACH ROW BEGIN
IF NOT(NEW.has_deadline <=> OLD.has_deadline) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='review_task_deadline_policy_immutable';
END IF;
END$$
DELIMITER ;

INSERT IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline)
 SELECT REPLACE(UUID(),'-',''),'seller_application',s.id,s.id,s.created_at,s.created_at,'no-agreed-deadline-v1',s.updated_at,0 FROM seller_profiles s;

INSERT IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline)
 SELECT REPLACE(UUID(),'-',''),'seller_document',d.id,d.id,d.uploaded_at,d.uploaded_at,'no-agreed-deadline-v1',d.uploaded_at,0 FROM seller_documents d
 WHERE d.kind IN ('representative_identity','pan_certificate') AND d.protected_change_id IS NULL;

DELIMITER $$
CREATE TRIGGER seller_application_review_task_created AFTER INSERT ON seller_profiles FOR EACH ROW BEGIN
INSERT IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline)
 VALUES(REPLACE(UUID(),'-',''),'seller_application',NEW.id,NEW.id,NEW.created_at,NEW.created_at,'no-agreed-deadline-v1',NEW.updated_at,0);
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER seller_document_review_task_created AFTER INSERT ON seller_documents FOR EACH ROW BEGIN
IF NEW.kind IN ('representative_identity','pan_certificate') AND NEW.protected_change_id IS NULL THEN
INSERT IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline)
 VALUES(REPLACE(UUID(),'-',''),'seller_document',NEW.id,NEW.id,NEW.uploaded_at,NEW.uploaded_at,'no-agreed-deadline-v1',NEW.uploaded_at,0);
END IF;
END$$
DELIMITER ;
