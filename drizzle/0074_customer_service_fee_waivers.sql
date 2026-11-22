-- Additive only: seller campaigns, accepted terms and original order money are retained.
-- UTC epoch milliseconds and integer paisa. Seed only the empty customer control.
CREATE TABLE customer_fee_waiver_control (
 id TEXT PRIMARY KEY NOT NULL CHECK(id='default'),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(typeof(revision)='integer' AND revision BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
INSERT INTO customer_fee_waiver_control(id,revision) VALUES ('default',0);
--> statement-breakpoint
CREATE TABLE customer_fee_waiver_campaigns (
 id VARCHAR(191) COLLATE BINARY PRIMARY KEY NOT NULL,
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991),
 updated_at INTEGER NOT NULL CHECK(typeof(updated_at)='integer' AND updated_at BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE customer_fee_waiver_revisions (
 campaign_id VARCHAR(191) COLLATE BINARY NOT NULL REFERENCES customer_fee_waiver_campaigns(id),
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
 state VARCHAR(16) NOT NULL CHECK(state IN ('draft','published','paused','ended')),
 name VARCHAR(100) NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 description TEXT NOT NULL CHECK(length(description)<=1000),
 starts_at INTEGER NOT NULL CHECK(typeof(starts_at)='integer' AND starts_at BETWEEN 0 AND 9007199254740991),
 ends_at INTEGER NOT NULL CHECK(typeof(ends_at)='integer' AND ends_at BETWEEN 1 AND 9007199254740991 AND ends_at>starts_at),
 created_by VARCHAR(191) NOT NULL REFERENCES users(id),
 request_id VARCHAR(191) COLLATE BINARY NOT NULL UNIQUE,
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(campaign_id,revision)
);
--> statement-breakpoint
CREATE TABLE customer_fee_waiver_requests (
 request_id VARCHAR(191) COLLATE BINARY PRIMARY KEY NOT NULL CHECK(length(request_id) BETWEEN 1 AND 191),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),
 auth_subject VARCHAR(191) NOT NULL,
 command_json TEXT NOT NULL CHECK(json_valid(command_json) AND json_type(command_json)='object'),
 response_json TEXT NOT NULL CHECK(json_valid(response_json) AND json_type(response_json)='object'),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE order_customer_service_fees (
 order_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES orders(id),
 policy_enabled INTEGER NOT NULL CHECK(typeof(policy_enabled)='integer' AND policy_enabled IN (0,1)),
 policy_amount_paisa INTEGER NOT NULL CHECK(typeof(policy_amount_paisa)='integer' AND policy_amount_paisa BETWEEN 0 AND 100000),
 policy_version_id VARCHAR(191),
 standard_paisa INTEGER NOT NULL CHECK(typeof(standard_paisa)='integer' AND standard_paisa BETWEEN 0 AND 9007199254740991),
 waived_paisa INTEGER NOT NULL CHECK(typeof(waived_paisa)='integer' AND waived_paisa BETWEEN 0 AND 9007199254740991),
 net_paisa INTEGER NOT NULL CHECK(typeof(net_paisa)='integer' AND net_paisa BETWEEN 0 AND 9007199254740991),
 campaign_id VARCHAR(191) COLLATE BINARY,
 campaign_revision INTEGER CHECK(campaign_revision IS NULL OR (typeof(campaign_revision)='integer' AND campaign_revision BETWEEN 1 AND 9007199254740991)),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991),
 FOREIGN KEY(campaign_id,campaign_revision) REFERENCES customer_fee_waiver_revisions(campaign_id,revision),
 CONSTRAINT customer_fee_policy_standard CHECK((policy_enabled=1 AND standard_paisa=policy_amount_paisa) OR (policy_enabled=0 AND standard_paisa=0)),
 CONSTRAINT customer_fee_reconciled CHECK(standard_paisa-waived_paisa=net_paisa),
 CONSTRAINT customer_fee_full_waiver CHECK((campaign_id IS NULL AND campaign_revision IS NULL AND waived_paisa=0) OR
       (campaign_id IS NOT NULL AND campaign_revision IS NOT NULL AND standard_paisa>0 AND waived_paisa=standard_paisa AND net_paisa=0))
);
--> statement-breakpoint
CREATE INDEX idx_customer_fee_waiver_history ON customer_fee_waiver_revisions(campaign_id,created_at,revision);
--> statement-breakpoint
CREATE INDEX idx_order_customer_service_fees_campaign ON order_customer_service_fees(campaign_id,campaign_revision);
--> statement-breakpoint
-- Reject duplicate immutable identities before REPLACE can implicitly delete them,
-- including when the connection's recursive_triggers setting is OFF.
CREATE TRIGGER customer_fee_waiver_revisions_no_replace BEFORE INSERT ON customer_fee_waiver_revisions WHEN EXISTS(SELECT 1 FROM customer_fee_waiver_revisions WHERE (campaign_id=NEW.campaign_id AND revision=NEW.revision) OR request_id=NEW.request_id) BEGIN SELECT RAISE(ABORT,'customer_fee_waiver_revision_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER customer_fee_waiver_requests_no_replace BEFORE INSERT ON customer_fee_waiver_requests WHEN EXISTS(SELECT 1 FROM customer_fee_waiver_requests WHERE request_id=NEW.request_id) BEGIN SELECT RAISE(ABORT,'customer_fee_waiver_request_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER order_customer_service_fees_no_replace BEFORE INSERT ON order_customer_service_fees WHEN EXISTS(SELECT 1 FROM order_customer_service_fees WHERE order_id=NEW.order_id) BEGIN SELECT RAISE(ABORT,'customer_fee_snapshot_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER customer_fee_waiver_revisions_no_update BEFORE UPDATE ON customer_fee_waiver_revisions BEGIN SELECT RAISE(ABORT,'customer_fee_waiver_revision_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER customer_fee_waiver_revisions_no_delete BEFORE DELETE ON customer_fee_waiver_revisions BEGIN SELECT RAISE(ABORT,'customer_fee_waiver_revision_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER customer_fee_waiver_requests_no_update BEFORE UPDATE ON customer_fee_waiver_requests BEGIN SELECT RAISE(ABORT,'customer_fee_waiver_request_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER customer_fee_waiver_requests_no_delete BEFORE DELETE ON customer_fee_waiver_requests BEGIN SELECT RAISE(ABORT,'customer_fee_waiver_request_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER customer_fee_waiver_campaigns_no_delete BEFORE DELETE ON customer_fee_waiver_campaigns BEGIN SELECT RAISE(ABORT,'customer_fee_waiver_campaign_retained'); END;
--> statement-breakpoint
CREATE TRIGGER order_customer_service_fees_no_update BEFORE UPDATE ON order_customer_service_fees BEGIN SELECT RAISE(ABORT,'customer_fee_snapshot_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER order_customer_service_fees_no_delete BEFORE DELETE ON order_customer_service_fees BEGIN SELECT RAISE(ABORT,'customer_fee_snapshot_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER order_customer_service_fees_match_order BEFORE INSERT ON order_customer_service_fees WHEN NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND buyer_platform_fee_paisa=NEW.net_paisa) BEGIN SELECT RAISE(ABORT,'customer_fee_order_mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER orders_preserve_customer_service_fee BEFORE UPDATE ON orders WHEN EXISTS(SELECT 1 FROM order_customer_service_fees WHERE order_id=OLD.id AND (NEW.id<>OLD.id OR net_paisa<>NEW.buyer_platform_fee_paisa)) BEGIN SELECT RAISE(ABORT,'customer_fee_order_mismatch'); END;
