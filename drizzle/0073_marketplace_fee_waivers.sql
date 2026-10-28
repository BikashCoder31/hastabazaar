-- Additive only: existing commission terms, orders and ledger amounts are untouched.
-- All timestamps are UTC epoch milliseconds. No campaigns or fee snapshots are seeded.
CREATE TABLE marketplace_fee_waiver_control (
 id TEXT PRIMARY KEY NOT NULL CHECK(id='default'),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(typeof(revision)='integer' AND revision BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
INSERT INTO marketplace_fee_waiver_control(id,revision) VALUES ('default',0);
--> statement-breakpoint
CREATE TABLE marketplace_fee_waiver_campaigns (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991),
 updated_at INTEGER NOT NULL CHECK(typeof(updated_at)='integer' AND updated_at BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE marketplace_fee_waiver_revisions (
 campaign_id VARCHAR(191) NOT NULL REFERENCES marketplace_fee_waiver_campaigns(id),
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
 state VARCHAR(16) NOT NULL CHECK(state IN ('draft','published','paused','ended')),
 name VARCHAR(100) NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 description TEXT NOT NULL CHECK(length(description)<=1000),
 starts_at INTEGER NOT NULL CHECK(typeof(starts_at)='integer' AND starts_at BETWEEN 0 AND 9007199254740991),
 ends_at INTEGER NOT NULL CHECK(typeof(ends_at)='integer' AND ends_at BETWEEN 1 AND 9007199254740991 AND ends_at>starts_at),
 created_by VARCHAR(191) NOT NULL REFERENCES users(id),
 request_id VARCHAR(191) NOT NULL UNIQUE,
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(campaign_id,revision)
);
--> statement-breakpoint
CREATE TABLE marketplace_fee_waiver_requests (
 request_id VARCHAR(191) PRIMARY KEY NOT NULL CHECK(length(request_id) BETWEEN 1 AND 191),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),
 auth_subject VARCHAR(191) NOT NULL,
 command_json TEXT NOT NULL CHECK(json_valid(command_json) AND json_type(command_json)='object'),
 response_json TEXT NOT NULL CHECK(json_valid(response_json) AND json_type(response_json)='object'),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE order_item_marketplace_fees (
 order_item_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES order_items(id),
 standard_bps INTEGER NOT NULL CHECK(typeof(standard_bps)='integer' AND standard_bps BETWEEN 0 AND 10000),
 base_paisa INTEGER NOT NULL CHECK(typeof(base_paisa)='integer' AND base_paisa BETWEEN 0 AND 9007199254740991),
 standard_paisa INTEGER NOT NULL CHECK(typeof(standard_paisa)='integer' AND standard_paisa BETWEEN 0 AND 9007199254740991),
 waived_paisa INTEGER NOT NULL CHECK(typeof(waived_paisa)='integer' AND waived_paisa BETWEEN 0 AND 9007199254740991),
 net_paisa INTEGER NOT NULL CHECK(typeof(net_paisa)='integer' AND net_paisa BETWEEN 0 AND 9007199254740991),
 campaign_id VARCHAR(191),
 campaign_revision INTEGER,
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991),
 FOREIGN KEY(campaign_id,campaign_revision) REFERENCES marketplace_fee_waiver_revisions(campaign_id,revision),
 CHECK(standard_paisa-waived_paisa=net_paisa),
 CHECK((campaign_id IS NULL AND campaign_revision IS NULL AND waived_paisa=0) OR
       (campaign_id IS NOT NULL AND campaign_revision IS NOT NULL AND waived_paisa=standard_paisa AND net_paisa=0))
);
--> statement-breakpoint
CREATE INDEX idx_marketplace_fee_waiver_history ON marketplace_fee_waiver_revisions(campaign_id,created_at,revision);
--> statement-breakpoint
CREATE INDEX idx_order_item_marketplace_fees_campaign ON order_item_marketplace_fees(campaign_id,campaign_revision);
--> statement-breakpoint
CREATE TRIGGER marketplace_fee_waiver_revisions_no_update BEFORE UPDATE ON marketplace_fee_waiver_revisions BEGIN SELECT RAISE(ABORT,'fee_waiver_revision_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_fee_waiver_revisions_no_delete BEFORE DELETE ON marketplace_fee_waiver_revisions BEGIN SELECT RAISE(ABORT,'fee_waiver_revision_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_fee_waiver_requests_no_update BEFORE UPDATE ON marketplace_fee_waiver_requests BEGIN SELECT RAISE(ABORT,'fee_waiver_request_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_fee_waiver_requests_no_delete BEFORE DELETE ON marketplace_fee_waiver_requests BEGIN SELECT RAISE(ABORT,'fee_waiver_request_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_fee_waiver_campaigns_no_delete BEFORE DELETE ON marketplace_fee_waiver_campaigns BEGIN SELECT RAISE(ABORT,'fee_waiver_campaign_retained'); END;
--> statement-breakpoint
CREATE TRIGGER order_item_marketplace_fees_no_update BEFORE UPDATE ON order_item_marketplace_fees BEGIN SELECT RAISE(ABORT,'marketplace_fee_snapshot_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER order_item_marketplace_fees_no_delete BEFORE DELETE ON order_item_marketplace_fees BEGIN SELECT RAISE(ABORT,'marketplace_fee_snapshot_immutable'); END;
