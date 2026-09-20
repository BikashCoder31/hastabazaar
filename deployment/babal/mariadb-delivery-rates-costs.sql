CREATE TABLE IF NOT EXISTS delivery_rate_versions (
 id VARCHAR(191) PRIMARY KEY, config_json TEXT NOT NULL, created_by VARCHAR(191) REFERENCES users(id), reason TEXT NOT NULL, created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO delivery_rate_versions(id,config_json,reason,created_at) VALUES ('initial-150-180-250','{"zones":{"valley":15000,"terai":18000,"nationwide":25000},"districts":{}}','Original approved delivery tariff',0);

CREATE TABLE IF NOT EXISTS delivery_rate_current (id VARCHAR(32) PRIMARY KEY,version_id VARCHAR(191) NOT NULL REFERENCES delivery_rate_versions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO delivery_rate_current(id,version_id) VALUES ('default','initial-150-180-250');

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_rate_snapshot_json TEXT;

CREATE TABLE IF NOT EXISTS parcel_courier_costs (
 id VARCHAR(191) PRIMARY KEY, shipping_job_id VARCHAR(191) NOT NULL REFERENCES shipping_parcels(shipping_job_id), amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0), evidence_reference VARCHAR(120) NOT NULL, created_by VARCHAR(191) NOT NULL REFERENCES users(id), note TEXT NOT NULL, created_at BIGINT NOT NULL, UNIQUE(shipping_job_id,evidence_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS delivery_rate_versions_no_update;
DELIMITER $$
CREATE TRIGGER delivery_rate_versions_no_update BEFORE UPDATE ON delivery_rate_versions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_record_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS delivery_rate_versions_no_delete;
DELIMITER $$
CREATE TRIGGER delivery_rate_versions_no_delete BEFORE DELETE ON delivery_rate_versions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_record_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS parcel_courier_costs_no_update;
DELIMITER $$
CREATE TRIGGER parcel_courier_costs_no_update BEFORE UPDATE ON parcel_courier_costs FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_record_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS parcel_courier_costs_no_delete;
DELIMITER $$
CREATE TRIGGER parcel_courier_costs_no_delete BEFORE DELETE ON parcel_courier_costs FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_record_immutable'; END$$
DELIMITER ;
