-- Reviewed additive migration. Never run automatically at local startup.
-- No existing campaign, acceptance, order money, commission or personal-PAN row is changed.
CREATE TABLE IF NOT EXISTS customer_fee_waiver_control (
 id VARCHAR(191) PRIMARY KEY CHECK(id='default'),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO customer_fee_waiver_control(id,revision) VALUES ('default',0);

CREATE TABLE IF NOT EXISTS customer_fee_waiver_campaigns (
 id VARCHAR(191) COLLATE utf8mb4_bin PRIMARY KEY NOT NULL,
 revision BIGINT NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 updated_at BIGINT NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_fee_waiver_revisions (
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
 CONSTRAINT customer_fee_revision_campaign_fk FOREIGN KEY(campaign_id) REFERENCES customer_fee_waiver_campaigns(id),
 CONSTRAINT customer_fee_revision_actor_fk FOREIGN KEY(created_by) REFERENCES users(id),
 INDEX idx_customer_fee_waiver_history(campaign_id,created_at,revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_fee_waiver_requests (
 request_id VARCHAR(191) COLLATE utf8mb4_bin PRIMARY KEY NOT NULL CHECK(CHAR_LENGTH(request_id) BETWEEN 1 AND 191),
 actor_id VARCHAR(191) NOT NULL,
 auth_subject VARCHAR(191) NOT NULL,
 command_json LONGTEXT NOT NULL CHECK(json_valid(command_json) AND JSON_TYPE(command_json)='OBJECT'),
 response_json LONGTEXT NOT NULL CHECK(json_valid(response_json) AND JSON_TYPE(response_json)='OBJECT'),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 CONSTRAINT customer_fee_request_actor_fk FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_customer_service_fees (
 order_id VARCHAR(191) PRIMARY KEY NOT NULL,
 policy_enabled BIGINT NOT NULL CHECK(policy_enabled IN (0,1)),
 policy_amount_paisa BIGINT NOT NULL CHECK(policy_amount_paisa BETWEEN 0 AND 100000),
 policy_version_id VARCHAR(191),
 standard_paisa BIGINT NOT NULL CHECK(standard_paisa BETWEEN 0 AND 9007199254740991),
 waived_paisa BIGINT NOT NULL CHECK(waived_paisa BETWEEN 0 AND 9007199254740991),
 net_paisa BIGINT NOT NULL CHECK(net_paisa BETWEEN 0 AND 9007199254740991),
 campaign_id VARCHAR(191) COLLATE utf8mb4_bin,
 campaign_revision BIGINT CHECK(campaign_revision IS NULL OR campaign_revision BETWEEN 1 AND 9007199254740991),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 CONSTRAINT customer_fee_evidence_order_fk FOREIGN KEY(order_id) REFERENCES orders(id),
 CONSTRAINT customer_fee_evidence_revision_fk FOREIGN KEY(campaign_id,campaign_revision) REFERENCES customer_fee_waiver_revisions(campaign_id,revision),
 CONSTRAINT customer_fee_policy_standard CHECK((policy_enabled=1 AND standard_paisa=policy_amount_paisa) OR (policy_enabled=0 AND standard_paisa=0)),
 CONSTRAINT customer_fee_reconciled CHECK(standard_paisa-waived_paisa=net_paisa),
 CONSTRAINT customer_fee_full_waiver CHECK((campaign_id IS NULL AND campaign_revision IS NULL AND waived_paisa=0) OR
       (campaign_id IS NOT NULL AND campaign_revision IS NOT NULL AND standard_paisa>0 AND waived_paisa=standard_paisa AND net_paisa=0)),
 INDEX idx_order_customer_service_fees_campaign(campaign_id,campaign_revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Duplicate immutable identities are rejected before any replacement semantics.
DROP TRIGGER IF EXISTS customer_fee_waiver_revisions_no_replace;
DELIMITER $$
CREATE TRIGGER customer_fee_waiver_revisions_no_replace BEFORE INSERT ON customer_fee_waiver_revisions FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM customer_fee_waiver_revisions WHERE (campaign_id=NEW.campaign_id AND revision=NEW.revision) OR request_id=NEW.request_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_revision_immutable'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS customer_fee_waiver_requests_no_replace;
DELIMITER $$
CREATE TRIGGER customer_fee_waiver_requests_no_replace BEFORE INSERT ON customer_fee_waiver_requests FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM customer_fee_waiver_requests WHERE request_id=NEW.request_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_request_immutable'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS order_customer_service_fees_no_replace;
DELIMITER $$
CREATE TRIGGER order_customer_service_fees_no_replace BEFORE INSERT ON order_customer_service_fees FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM order_customer_service_fees WHERE order_id=NEW.order_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_snapshot_immutable'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS customer_fee_waiver_revisions_no_update;
CREATE TRIGGER customer_fee_waiver_revisions_no_update BEFORE UPDATE ON customer_fee_waiver_revisions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_revision_immutable';
DROP TRIGGER IF EXISTS customer_fee_waiver_revisions_no_delete;
CREATE TRIGGER customer_fee_waiver_revisions_no_delete BEFORE DELETE ON customer_fee_waiver_revisions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_revision_immutable';
DROP TRIGGER IF EXISTS customer_fee_waiver_requests_no_update;
CREATE TRIGGER customer_fee_waiver_requests_no_update BEFORE UPDATE ON customer_fee_waiver_requests FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_request_immutable';
DROP TRIGGER IF EXISTS customer_fee_waiver_requests_no_delete;
CREATE TRIGGER customer_fee_waiver_requests_no_delete BEFORE DELETE ON customer_fee_waiver_requests FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_request_immutable';
DROP TRIGGER IF EXISTS customer_fee_waiver_campaigns_no_delete;
CREATE TRIGGER customer_fee_waiver_campaigns_no_delete BEFORE DELETE ON customer_fee_waiver_campaigns FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_campaign_retained';
DROP TRIGGER IF EXISTS order_customer_service_fees_no_update;
CREATE TRIGGER order_customer_service_fees_no_update BEFORE UPDATE ON order_customer_service_fees FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_snapshot_immutable';
DROP TRIGGER IF EXISTS order_customer_service_fees_no_delete;
CREATE TRIGGER order_customer_service_fees_no_delete BEFORE DELETE ON order_customer_service_fees FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_snapshot_immutable';
DROP TRIGGER IF EXISTS order_customer_service_fees_match_order;
DELIMITER $$
CREATE TRIGGER order_customer_service_fees_match_order BEFORE INSERT ON order_customer_service_fees FOR EACH ROW BEGIN
 IF NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND buyer_platform_fee_paisa=NEW.net_paisa) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_order_mismatch'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS orders_preserve_customer_service_fee;
DELIMITER $$
CREATE TRIGGER orders_preserve_customer_service_fee BEFORE UPDATE ON orders FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM order_customer_service_fees WHERE order_id=OLD.id AND (NEW.id<>OLD.id OR net_paisa<>NEW.buyer_platform_fee_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_order_mismatch'; END IF;
END$$
DELIMITER ;
