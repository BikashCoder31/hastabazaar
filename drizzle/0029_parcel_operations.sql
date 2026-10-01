CREATE TABLE IF NOT EXISTS shipping_parcels (
 shipping_job_id VARCHAR(191) PRIMARY KEY REFERENCES shipping_jobs(id),
 cod_due_paisa BIGINT NOT NULL CHECK(cod_due_paisa>=0),
 collected_paisa BIGINT NOT NULL DEFAULT 0 CHECK(collected_paisa>=0 AND collected_paisa<=cod_due_paisa),
 remitted_paisa BIGINT NOT NULL DEFAULT 0 CHECK(remitted_paisa>=0 AND remitted_paisa<=collected_paisa),
 version BIGINT NOT NULL DEFAULT 0,
 operation_request_id VARCHAR(191),
 method VARCHAR(32),
 rider_user_id VARCHAR(191) REFERENCES users(id),
 courier_name VARCHAR(120),
 tracking_url TEXT,
 latitude DOUBLE,
 longitude DOUBLE,
 accuracy DOUBLE,
 position_at BIGINT,
 delivered_at BIGINT,
 created_at BIGINT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS parcel_cash_records (
 id VARCHAR(191) PRIMARY KEY,
 shipping_job_id VARCHAR(191) NOT NULL REFERENCES shipping_parcels(shipping_job_id),
 kind VARCHAR(32) NOT NULL CHECK(kind IN ('collection','remittance')),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0),
 evidence_reference VARCHAR(120) NOT NULL,
 status VARCHAR(32) NOT NULL CHECK(status IN ('pending','posted','rejected')),
 created_by VARCHAR(191) NOT NULL REFERENCES users(id),
 approved_by VARCHAR(191) REFERENCES users(id),
 created_at BIGINT NOT NULL,
 approved_at BIGINT,
 CHECK(kind<>'remittance' OR status<>'posted' OR (approved_by IS NOT NULL AND approved_by<>created_by)),
 UNIQUE(kind,evidence_reference)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS parcel_operation_events (
 id VARCHAR(191) PRIMARY KEY,
 order_id VARCHAR(191) NOT NULL REFERENCES orders(id),
 shipping_job_id VARCHAR(191) REFERENCES shipping_parcels(shipping_job_id),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),
 action VARCHAR(40) NOT NULL,
 payload_json TEXT NOT NULL,
 note TEXT NOT NULL,
 created_at BIGINT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_parcel_cash_status ON parcel_cash_records(status,created_at);

--> statement-breakpoint
CREATE TRIGGER parcel_cash_posted_no_update BEFORE UPDATE ON parcel_cash_records FOR EACH ROW WHEN OLD.status='posted' BEGIN SELECT RAISE(ABORT,'posted_cash_immutable'); END;

--> statement-breakpoint
CREATE TRIGGER parcel_cash_posted_no_delete BEFORE DELETE ON parcel_cash_records FOR EACH ROW WHEN OLD.status='posted' BEGIN SELECT RAISE(ABORT,'posted_cash_immutable'); END;

--> statement-breakpoint
CREATE TRIGGER clear_closed_parcel_location AFTER UPDATE ON shipping_jobs FOR EACH ROW WHEN NEW.status<>'dispatched' BEGIN UPDATE shipping_parcels SET latitude=NULL,longitude=NULL,accuracy=NULL,position_at=NULL WHERE shipping_job_id=NEW.id; END;

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS operation_transaction_guards(id VARCHAR(191) PRIMARY KEY,valid BIGINT NOT NULL CHECK(valid=1));

--> statement-breakpoint
CREATE TRIGGER close_cancelled_order_parcels AFTER UPDATE ON orders FOR EACH ROW WHEN NEW.status='cancelled' AND OLD.status<>'cancelled' BEGIN UPDATE shipping_jobs SET status='cancelled',updated_at=NEW.updated_at WHERE order_id=NEW.id AND direction='outbound' AND status<>'cancelled'; END;
