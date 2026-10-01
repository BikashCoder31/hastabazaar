CREATE TABLE IF NOT EXISTS exception_work_items (
 id VARCHAR(191) PRIMARY KEY,source_key VARCHAR(700) NOT NULL UNIQUE,order_id VARCHAR(191) NOT NULL,shipping_job_id VARCHAR(191) NOT NULL,kind VARCHAR(40) NOT NULL,cash_record_id VARCHAR(191),status VARCHAR(20) NOT NULL DEFAULT 'open',owner_id VARCHAR(191),next_action TEXT NOT NULL,version INT NOT NULL DEFAULT 0,created_by VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,resolved_at BIGINT,evidence TEXT,
 FOREIGN KEY(shipping_job_id) REFERENCES shipping_jobs(id),FOREIGN KEY(owner_id) REFERENCES users(id),FOREIGN KEY(created_by) REFERENCES users(id),CHECK(status IN ('open','resolved')),CHECK(kind IN ('failed_delivery','customer_unavailable','incorrect_cash','cancelled_parcel')),
 INDEX idx_exception_work_queue(status,updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS exception_work_events (
 id VARCHAR(191) PRIMARY KEY,work_id VARCHAR(191) NOT NULL,actor_id VARCHAR(191) NOT NULL,action VARCHAR(40) NOT NULL,owner_id VARCHAR(191),next_action TEXT NOT NULL,note TEXT NOT NULL,evidence TEXT,payload_json LONGTEXT NOT NULL,created_at BIGINT NOT NULL,
 FOREIGN KEY(work_id) REFERENCES exception_work_items(id),FOREIGN KEY(actor_id) REFERENCES users(id),INDEX idx_exception_work_history(work_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DROP TRIGGER IF EXISTS exception_work_events_no_update;
DELIMITER $$
CREATE TRIGGER exception_work_events_no_update BEFORE UPDATE ON exception_work_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='exception_history_immutable'; END$$
DELIMITER ;
DROP TRIGGER IF EXISTS exception_work_events_no_delete;
DELIMITER $$
CREATE TRIGGER exception_work_events_no_delete BEFORE DELETE ON exception_work_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='exception_history_immutable'; END$$
DELIMITER ;
