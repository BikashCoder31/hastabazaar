-- Reviewed additive migration. Never run automatically at local startup.
-- Existing orders, seller commission agreements and ledger values are untouched.
CREATE TABLE IF NOT EXISTS marketplace_fee_waiver_control (
 id VARCHAR(191) PRIMARY KEY CHECK(id='default'),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO marketplace_fee_waiver_control(id,revision) VALUES ('default',0);

CREATE TABLE IF NOT EXISTS marketplace_fee_waiver_campaigns (
 id VARCHAR(191) COLLATE utf8mb4_bin PRIMARY KEY NOT NULL,
 revision BIGINT NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 updated_at BIGINT NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketplace_fee_waiver_revisions (
 campaign_id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 revision BIGINT NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 state VARCHAR(16) NOT NULL CHECK(state IN ('draft','published','paused','ended')),
 name VARCHAR(100) NOT NULL CHECK(CHAR_LENGTH(trim(name)) BETWEEN 1 AND 100),
 description TEXT NOT NULL CHECK(CHAR_LENGTH(description)<=1000),
 starts_at BIGINT NOT NULL CHECK(starts_at BETWEEN 0 AND 9007199254740991),
 ends_at BIGINT NOT NULL CHECK(ends_at BETWEEN 1 AND 9007199254740991 AND ends_at>starts_at),
 created_by VARCHAR(191) NOT NULL,
 request_id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL UNIQUE,
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(campaign_id,revision),
 FOREIGN KEY(campaign_id) REFERENCES marketplace_fee_waiver_campaigns(id),
 FOREIGN KEY(created_by) REFERENCES users(id),
 INDEX idx_marketplace_fee_waiver_history(campaign_id,created_at,revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketplace_fee_waiver_requests (
 request_id VARCHAR(191) COLLATE utf8mb4_bin PRIMARY KEY NOT NULL CHECK(CHAR_LENGTH(request_id) BETWEEN 1 AND 191),
 actor_id VARCHAR(191) NOT NULL,
 auth_subject VARCHAR(191) NOT NULL,
 command_json LONGTEXT NOT NULL CHECK(json_valid(command_json) AND JSON_TYPE(command_json)='OBJECT'),
 response_json LONGTEXT NOT NULL CHECK(json_valid(response_json) AND JSON_TYPE(response_json)='OBJECT'),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_item_marketplace_fees (
 order_item_id VARCHAR(191) PRIMARY KEY NOT NULL,
 standard_bps BIGINT NOT NULL CHECK(standard_bps BETWEEN 0 AND 10000),
 base_paisa BIGINT NOT NULL CHECK(base_paisa BETWEEN 0 AND 9007199254740991),
 standard_paisa BIGINT NOT NULL CHECK(standard_paisa BETWEEN 0 AND 9007199254740991),
 waived_paisa BIGINT NOT NULL CHECK(waived_paisa BETWEEN 0 AND 9007199254740991),
 net_paisa BIGINT NOT NULL CHECK(net_paisa BETWEEN 0 AND 9007199254740991),
 campaign_id VARCHAR(191) COLLATE utf8mb4_bin,
 campaign_revision BIGINT,
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 FOREIGN KEY(order_item_id) REFERENCES order_items(id),
 FOREIGN KEY(campaign_id,campaign_revision) REFERENCES marketplace_fee_waiver_revisions(campaign_id,revision),
 CHECK(standard_paisa-waived_paisa=net_paisa),
 CHECK((campaign_id IS NULL AND campaign_revision IS NULL AND waived_paisa=0) OR
       (campaign_id IS NOT NULL AND campaign_revision IS NOT NULL AND waived_paisa=standard_paisa AND net_paisa=0)),
 INDEX idx_order_item_marketplace_fees_campaign(campaign_id,campaign_revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS marketplace_fee_waiver_revisions_no_update;
CREATE TRIGGER marketplace_fee_waiver_revisions_no_update BEFORE UPDATE ON marketplace_fee_waiver_revisions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fee_waiver_revision_immutable';
DROP TRIGGER IF EXISTS marketplace_fee_waiver_revisions_no_delete;
CREATE TRIGGER marketplace_fee_waiver_revisions_no_delete BEFORE DELETE ON marketplace_fee_waiver_revisions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fee_waiver_revision_immutable';
DROP TRIGGER IF EXISTS marketplace_fee_waiver_requests_no_update;
CREATE TRIGGER marketplace_fee_waiver_requests_no_update BEFORE UPDATE ON marketplace_fee_waiver_requests FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fee_waiver_request_immutable';
DROP TRIGGER IF EXISTS marketplace_fee_waiver_requests_no_delete;
CREATE TRIGGER marketplace_fee_waiver_requests_no_delete BEFORE DELETE ON marketplace_fee_waiver_requests FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fee_waiver_request_immutable';
DROP TRIGGER IF EXISTS marketplace_fee_waiver_campaigns_no_delete;
CREATE TRIGGER marketplace_fee_waiver_campaigns_no_delete BEFORE DELETE ON marketplace_fee_waiver_campaigns FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fee_waiver_campaign_retained';
DROP TRIGGER IF EXISTS order_item_marketplace_fees_no_update;
CREATE TRIGGER order_item_marketplace_fees_no_update BEFORE UPDATE ON order_item_marketplace_fees FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='marketplace_fee_snapshot_immutable';
DROP TRIGGER IF EXISTS order_item_marketplace_fees_no_delete;
CREATE TRIGGER order_item_marketplace_fees_no_delete BEFORE DELETE ON order_item_marketplace_fees FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='marketplace_fee_snapshot_immutable';
