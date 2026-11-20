-- Source-only counterpart of 0096. Coordination never changes availability or approvals.
CREATE TABLE product_priority_events(id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL,product_id VARCHAR(191) NOT NULL,revision INT NOT NULL CHECK(revision>=0),kind VARCHAR(32) NOT NULL CHECK(kind IN ('reported','triaged','resolved')),actor_id VARCHAR(191) NOT NULL,detail_json LONGTEXT NOT NULL CHECK(JSON_VALID(detail_json)),created_at BIGINT NOT NULL,UNIQUE(case_id,revision),FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE product_priority_cases(id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL,kind VARCHAR(32) NOT NULL CHECK(kind IN ('price_error','safety','misleading')),public_version_id VARCHAR(191),reported_by VARCHAR(191) NOT NULL,state VARCHAR(32) NOT NULL CHECK(state IN ('open','waiting_seller','resolved')),active_slot INT,revision INT NOT NULL CHECK(revision>=0),backup_id VARCHAR(191),backup_unavailable_reason TEXT NOT NULL DEFAULT '',next_update_at BIGINT,triaged_at BIGINT,last_event_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,UNIQUE(product_id,kind,active_slot),CHECK((state='resolved' AND active_slot IS NULL) OR (state<>'resolved' AND active_slot=1)),FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(public_version_id) REFERENCES product_publication_candidates(id),FOREIGN KEY(reported_by) REFERENCES users(id),FOREIGN KEY(backup_id) REFERENCES users(id),FOREIGN KEY(last_event_id) REFERENCES product_priority_events(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER product_priority_case_source BEFORE INSERT ON product_priority_cases FOR EACH ROW BEGIN
IF NEW.revision<>0 OR NEW.state<>'open' OR NEW.backup_id IS NOT NULL OR NEW.next_update_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM product_priority_events e JOIN users u ON u.id=e.actor_id WHERE e.id=NEW.last_event_id AND e.case_id=NEW.id AND e.product_id=NEW.product_id AND e.revision=0 AND e.kind='reported' AND e.actor_id=NEW.reported_by AND u.status='active') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_case_source'; END IF;
END$$
CREATE TRIGGER product_priority_task_created AFTER INSERT ON product_priority_cases FOR EACH ROW BEGIN INSERT INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline) VALUES(CONCAT('priority-',NEW.id),'product_priority',NEW.id,NEW.id,NEW.created_at,NEW.created_at,'no-agreed-deadline-v1',NEW.updated_at,0); END$$
CREATE TRIGGER product_priority_case_revision BEFORE UPDATE ON product_priority_cases FOR EACH ROW BEGIN
IF OLD.state='resolved' OR NEW.id<>OLD.id OR NEW.product_id<>OLD.product_id OR NEW.kind<>OLD.kind OR NOT(NEW.public_version_id <=> OLD.public_version_id) OR NEW.reported_by<>OLD.reported_by OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR NOT EXISTS(SELECT 1 FROM product_priority_events e JOIN review_tasks t ON t.source_type='product_priority' AND t.source_id=NEW.id AND t.source_revision=NEW.id WHERE e.id=NEW.last_event_id AND e.case_id=NEW.id AND e.product_id=NEW.product_id AND e.revision=NEW.revision AND JSON_VALUE(e.detail_json,'$.state')=NEW.state AND (JSON_VALUE(e.detail_json,'$.backupId') <=> NEW.backup_id) AND JSON_VALUE(e.detail_json,'$.backupUnavailableReason')=NEW.backup_unavailable_reason AND (JSON_VALUE(e.detail_json,'$.nextUpdateAt') <=> NEW.next_update_at) AND (JSON_VALUE(e.detail_json,'$.ownerId') <=> t.owner_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_case_revision'; END IF;
END$$
CREATE TRIGGER product_priority_event_immutable BEFORE UPDATE ON product_priority_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_event_immutable'; END$$
CREATE TRIGGER product_priority_event_retained BEFORE DELETE ON product_priority_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_event_retained'; END$$
CREATE TRIGGER product_priority_case_retained BEFORE DELETE ON product_priority_cases FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_case_retained'; END$$
DELIMITER ;

CREATE TABLE product_priority_report_media(event_id VARCHAR(191) NOT NULL,media_id VARCHAR(191) NOT NULL,PRIMARY KEY(event_id,media_id),FOREIGN KEY(event_id) REFERENCES product_priority_events(id),FOREIGN KEY(media_id) REFERENCES product_media(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER product_priority_media_source BEFORE INSERT ON product_priority_report_media FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_priority_events e JOIN product_media m ON m.product_id=e.product_id WHERE e.id=NEW.event_id AND e.kind='reported' AND m.id=NEW.media_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_media_source'; END IF;
END$$
CREATE TRIGGER product_priority_media_immutable BEFORE UPDATE ON product_priority_report_media FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_media_immutable'; END$$
CREATE TRIGGER product_priority_media_retained BEFORE DELETE ON product_priority_report_media FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_media_retained'; END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_priority_media_file_retained BEFORE UPDATE ON product_media FOR EACH ROW BEGIN
IF EXISTS(SELECT 1 FROM product_priority_report_media WHERE media_id=OLD.id) AND (BINARY NEW.id<>BINARY OLD.id OR BINARY NEW.product_id<>BINARY OLD.product_id OR BINARY NEW.object_key<>BINARY OLD.object_key OR BINARY NEW.mime_type<>BINARY OLD.mime_type OR NEW.size_bytes<>OLD.size_bytes) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_media_file_retained'; END IF;
END$$
DELIMITER ;
