-- Additive migration; no historic order emails are backfilled.
CREATE TABLE IF NOT EXISTS order_email_jobs (
 id VARCHAR(191) PRIMARY KEY,
 order_id VARCHAR(191) NOT NULL REFERENCES orders(id),
 order_status VARCHAR(32) NOT NULL,
 created_at BIGINT NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'queued',
 attempts BIGINT NOT NULL DEFAULT 0,
 next_attempt_at BIGINT NOT NULL DEFAULT 0,
 lease_until BIGINT NOT NULL DEFAULT 0,
 claim_token VARCHAR(64),
 sent_at BIGINT,
 failure_code VARCHAR(64)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_email_event ON order_email_jobs(order_id,order_status);

CREATE INDEX IF NOT EXISTS idx_order_email_due ON order_email_jobs(status,next_attempt_at,lease_until);

DROP TRIGGER IF EXISTS queue_order_email_insert;
DELIMITER $$
CREATE TRIGGER queue_order_email_insert AFTER INSERT ON orders FOR EACH ROW BEGIN
 IF NEW.status IN ('confirmed','packing','ready_for_pickup','dispatched','delivered','cancelled') THEN INSERT IGNORE INTO order_email_jobs(id,order_id,order_status,created_at) VALUES (CONCAT(NEW.id,':',NEW.status),NEW.id,NEW.status,NEW.updated_at); END IF;
 END$$
DELIMITER ;

DROP TRIGGER IF EXISTS queue_order_email_update;
DELIMITER $$
CREATE TRIGGER queue_order_email_update AFTER UPDATE ON orders FOR EACH ROW BEGIN
 IF NEW.status IN ('confirmed','packing','ready_for_pickup','dispatched','delivered','cancelled') AND OLD.status <> NEW.status THEN INSERT IGNORE INTO order_email_jobs(id,order_id,order_status,created_at) VALUES (CONCAT(NEW.id,':',NEW.status),NEW.id,NEW.status,NEW.updated_at); END IF;
 END$$
DELIMITER ;
