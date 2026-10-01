CREATE TABLE IF NOT EXISTS delivery_rate_versions (
 id VARCHAR(191) PRIMARY KEY, config_json TEXT NOT NULL, created_by VARCHAR(191) REFERENCES users(id), reason TEXT NOT NULL, created_at BIGINT NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO delivery_rate_versions(id,config_json,reason,created_at) VALUES ('initial-150-180-250','{"zones":{"valley":15000,"terai":18000,"nationwide":25000},"districts":{}}','Original approved delivery tariff',0);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS delivery_rate_current (id VARCHAR(32) PRIMARY KEY,version_id VARCHAR(191) NOT NULL REFERENCES delivery_rate_versions(id));
--> statement-breakpoint
INSERT OR IGNORE INTO delivery_rate_current(id,version_id) VALUES ('default','initial-150-180-250');
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN delivery_rate_snapshot_json TEXT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS parcel_courier_costs (
 id VARCHAR(191) PRIMARY KEY, shipping_job_id VARCHAR(191) NOT NULL REFERENCES shipping_parcels(shipping_job_id), amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0), evidence_reference VARCHAR(120) NOT NULL, created_by VARCHAR(191) NOT NULL REFERENCES users(id), note TEXT NOT NULL, created_at BIGINT NOT NULL, UNIQUE(shipping_job_id,evidence_reference)
);

--> statement-breakpoint
CREATE TRIGGER delivery_rate_versions_no_update BEFORE UPDATE ON delivery_rate_versions FOR EACH ROW BEGIN SELECT RAISE(ABORT,'delivery_record_immutable'); END;

--> statement-breakpoint
CREATE TRIGGER delivery_rate_versions_no_delete BEFORE DELETE ON delivery_rate_versions FOR EACH ROW BEGIN SELECT RAISE(ABORT,'delivery_record_immutable'); END;

--> statement-breakpoint
CREATE TRIGGER parcel_courier_costs_no_update BEFORE UPDATE ON parcel_courier_costs FOR EACH ROW BEGIN SELECT RAISE(ABORT,'delivery_record_immutable'); END;

--> statement-breakpoint
CREATE TRIGGER parcel_courier_costs_no_delete BEFORE DELETE ON parcel_courier_costs FOR EACH ROW BEGIN SELECT RAISE(ABORT,'delivery_record_immutable'); END;
