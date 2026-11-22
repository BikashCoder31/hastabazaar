CREATE TABLE review_tasks (
 id VARCHAR(191) COLLATE utf8mb4_bin PRIMARY KEY,
 source_type VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 source_id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 source_revision VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 started_at BIGINT NOT NULL,
 due_at BIGINT NOT NULL,
 calendar_version VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 owner_id VARCHAR(191) NULL,
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at BIGINT NOT NULL,
 UNIQUE KEY review_tasks_source(source_type,source_id,source_revision),
 KEY review_tasks_due(due_at,owner_id),
 FOREIGN KEY(owner_id) REFERENCES users(id),
 CHECK(due_at>=started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER review_task_preserve_clock BEFORE UPDATE ON review_tasks FOR EACH ROW BEGIN
 IF NOT(NEW.source_type <=> OLD.source_type) OR NOT(NEW.source_id <=> OLD.source_id) OR NOT(NEW.source_revision <=> OLD.source_revision)
 OR NOT(NEW.started_at <=> OLD.started_at) OR NOT(NEW.due_at <=> OLD.due_at) OR NOT(NEW.calendar_version <=> OLD.calendar_version)
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='review_task_source_clock_immutable'; END IF;
END$$
DELIMITER ;
