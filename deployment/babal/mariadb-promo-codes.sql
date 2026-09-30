-- Requires the prior referral/wallet, partial-cancellation and commission migrations.
-- No enabled campaigns are seeded.
-- Promo campaigns own lifetime usage; revisions never reset counters. No campaigns are seeded.
CREATE TABLE IF NOT EXISTS promo_campaigns (
 id VARCHAR(191) PRIMARY KEY,
 code VARCHAR(32) NOT NULL UNIQUE CHECK(length(code) BETWEEN 3 AND 32 AND BINARY code REGEXP '^[A-Z0-9][A-Z0-9_-]*$'),
 -- current_revision is published/live; draft_revision never changes checkout authority.
 current_revision BIGINT, draft_revision BIGINT,
 version BIGINT NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 paused BIGINT NOT NULL DEFAULT 0 CHECK(paused IN (0,1)),
 used_count BIGINT NOT NULL DEFAULT 0 CHECK(used_count BETWEEN 0 AND 9007199254740991),
 spent_paisa BIGINT NOT NULL DEFAULT 0 CHECK(spent_paisa BETWEEN 0 AND 9007199254740991),
 created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
 CHECK(status='draft' OR current_revision IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promo_revisions (
 campaign_id VARCHAR(191) NOT NULL REFERENCES promo_campaigns(id),
 revision BIGINT NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 label VARCHAR(200) NOT NULL CHECK(CHAR_LENGTH(trim(label)) BETWEEN 1 AND 200),
 kind VARCHAR(16) NOT NULL CHECK(kind IN ('fixed','percentage')),
 fixed_paisa BIGINT, percent_bps BIGINT, max_discount_paisa BIGINT,
 minimum_subtotal_paisa BIGINT NOT NULL CHECK(minimum_subtotal_paisa BETWEEN 0 AND 9007199254740991),
 starts_at BIGINT NOT NULL CHECK(starts_at BETWEEN 0 AND 253402300799999),
 ends_at BIGINT NOT NULL CHECK(ends_at BETWEEN 1 AND 253402300799999 AND ends_at>starts_at),
 total_use_limit BIGINT NOT NULL CHECK(total_use_limit BETWEEN 1 AND 9007199254740991),
 per_customer_use_limit BIGINT NOT NULL CHECK(per_customer_use_limit BETWEEN 1 AND total_use_limit),
 budget_paisa BIGINT NOT NULL CHECK(budget_paisa BETWEEN 1 AND 9007199254740991),
 created_by VARCHAR(191) NOT NULL REFERENCES users(id), request_id VARCHAR(191) NOT NULL,
 reason LONGTEXT NOT NULL CHECK(length(trim(reason))>0), form_version_id VARCHAR(191) NOT NULL, created_at BIGINT NOT NULL,
 PRIMARY KEY(campaign_id,revision), UNIQUE(created_by,request_id),
 CHECK((kind='fixed' AND fixed_paisa IS NOT NULL AND fixed_paisa BETWEEN 1 AND 9007199254740991 AND percent_bps IS NULL AND max_discount_paisa IS NULL)
 OR (kind='percentage' AND fixed_paisa IS NULL AND percent_bps IS NOT NULL AND percent_bps BETWEEN 1 AND 10000 AND max_discount_paisa IS NOT NULL AND max_discount_paisa BETWEEN 1 AND 9007199254740991))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promo_customer_usage (
 campaign_id VARCHAR(191) NOT NULL REFERENCES promo_campaigns(id), customer_id VARCHAR(191) NOT NULL REFERENCES users(id),
 used_count BIGINT NOT NULL DEFAULT 0 CHECK(used_count BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(campaign_id,customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promo_redemptions (
 id VARCHAR(191) PRIMARY KEY, campaign_id VARCHAR(191) NOT NULL, revision BIGINT NOT NULL,
 customer_id VARCHAR(191) NOT NULL REFERENCES users(id), order_id VARCHAR(191) NOT NULL UNIQUE REFERENCES orders(id),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id), request_id VARCHAR(191) NOT NULL CHECK(length(request_id) BETWEEN 1 AND 191),
 payload_digest VARCHAR(64) NOT NULL CHECK(length(payload_digest)=64 AND BINARY payload_digest REGEXP '^[a-f0-9]{64}$'),
 response_json LONGTEXT NOT NULL CHECK(json_valid(response_json) AND JSON_TYPE(response_json)='OBJECT'),
 discount_paisa BIGINT NOT NULL CHECK(discount_paisa BETWEEN 1 AND 9007199254740991),
 subtotal_paisa BIGINT NOT NULL CHECK(subtotal_paisa BETWEEN discount_paisa AND 9007199254740991),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 253402300799999),
 UNIQUE(actor_id,request_id), FOREIGN KEY(campaign_id,revision) REFERENCES promo_revisions(campaign_id,revision), CHECK(actor_id=customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_campaign ON promo_redemptions(campaign_id,created_at,id);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_customer ON promo_redemptions(customer_id,created_at,id);

CREATE INDEX IF NOT EXISTS idx_promo_customer_usage_max ON promo_customer_usage(campaign_id,used_count);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(promo_discount_paisa BETWEEN 0 AND 9007199254740991);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_promo_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(current_promo_discount_paisa BETWEEN 0 AND 9007199254740991);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_promo_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(refunded_promo_discount_paisa BETWEEN 0 AND 9007199254740991);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS promo_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(promo_discount_paisa BETWEEN 0 AND 9007199254740991);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS current_promo_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(current_promo_discount_paisa BETWEEN 0 AND 9007199254740991);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS refunded_promo_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(refunded_promo_discount_paisa BETWEEN 0 AND 9007199254740991);

-- Inline REFERENCES can add another implicit FK when IF NOT EXISTS skips an
-- existing column. Keep an equivalent legacy FK, regardless of its name.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_campaign_id VARCHAR(191) NULL;
SET @promo_campaign_fk_exists = (
 SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE k
 JOIN information_schema.REFERENTIAL_CONSTRAINTS r
  ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
 WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND k.TABLE_NAME='orders'
  AND k.COLUMN_NAME='promo_campaign_id' AND k.REFERENCED_TABLE_SCHEMA=DATABASE()
  AND k.REFERENCED_TABLE_NAME='promo_campaigns' AND k.REFERENCED_COLUMN_NAME='id'
  AND r.DELETE_RULE IN ('RESTRICT','NO ACTION') AND r.UPDATE_RULE IN ('RESTRICT','NO ACTION')
  AND NOT EXISTS (
   SELECT 1 FROM information_schema.KEY_COLUMN_USAGE other_key
   WHERE other_key.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND other_key.TABLE_NAME=k.TABLE_NAME
    AND other_key.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND other_key.ORDINAL_POSITION<>1
  )
);
SET @promo_campaign_fk_sql = IF(@promo_campaign_fk_exists>0,'SELECT 1','ALTER TABLE orders ADD CONSTRAINT orders_promo_campaign_fk FOREIGN KEY (promo_campaign_id) REFERENCES promo_campaigns(id)');
PREPARE promo_campaign_fk_statement FROM @promo_campaign_fk_sql;
EXECUTE promo_campaign_fk_statement;
DEALLOCATE PREPARE promo_campaign_fk_statement;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_revision BIGINT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code VARCHAR(32);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_label VARCHAR(200);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_source VARCHAR(16) GENERATED ALWAYS AS (CASE WHEN promo_discount_paisa>0 THEN 'promo' WHEN referral_discount_paisa>0 THEN 'referral' ELSE 'none' END) VIRTUAL;

-- Current aggregate remains total platform discount. NULL keeps the historical original-referral fallback.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_referral_discount_paisa BIGINT GENERATED ALWAYS AS
 (CASE WHEN current_discount_paisa IS NULL THEN referral_discount_paisa ELSE current_discount_paisa-current_promo_discount_paisa END) VIRTUAL;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS referral_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(referral_discount_paisa BETWEEN 0 AND 9007199254740991);

UPDATE order_items SET referral_discount_paisa=platform_discount_paisa
 WHERE EXISTS(SELECT 1 FROM orders WHERE orders.id=order_items.order_id AND orders.referral_discount_paisa>0) AND referral_discount_paisa=0 AND promo_discount_paisa=0;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_source VARCHAR(16) GENERATED ALWAYS AS (CASE WHEN promo_discount_paisa>0 THEN 'promo' WHEN referral_discount_paisa>0 THEN 'referral' ELSE 'none' END) VIRTUAL;

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS promo_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(promo_discount_paisa BETWEEN 0 AND 9007199254740991);

DROP TRIGGER IF EXISTS promo_revisions_no_update;
DELIMITER $$
CREATE TRIGGER promo_revisions_no_update BEFORE UPDATE ON promo_revisions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_revisions_immutable';
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_revisions_no_delete;
DELIMITER $$
CREATE TRIGGER promo_revisions_no_delete BEFORE DELETE ON promo_revisions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_revisions_immutable';
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_redemptions_no_update;
DELIMITER $$
CREATE TRIGGER promo_redemptions_no_update BEFORE UPDATE ON promo_redemptions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_redemptions_immutable';
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_redemptions_no_delete;
DELIMITER $$
CREATE TRIGGER promo_redemptions_no_delete BEFORE DELETE ON promo_redemptions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_redemptions_immutable';
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_campaigns_no_delete;
DELIMITER $$
CREATE TRIGGER promo_campaigns_no_delete BEFORE DELETE ON promo_campaigns FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_campaigns_retained';
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_customer_usage_no_delete;
DELIMITER $$
CREATE TRIGGER promo_customer_usage_no_delete BEFORE DELETE ON promo_customer_usage FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_customer_usage_retained';
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_revision_limits;
DELIMITER $$
CREATE TRIGGER promo_revision_limits BEFORE INSERT ON promo_revisions FOR EACH ROW BEGIN
IF NEW.total_use_limit<(SELECT used_count FROM promo_campaigns WHERE id=NEW.campaign_id)
 OR NEW.budget_paisa<(SELECT spent_paisa FROM promo_campaigns WHERE id=NEW.campaign_id)
 OR NEW.per_customer_use_limit<COALESCE((SELECT MAX(used_count) FROM promo_customer_usage WHERE campaign_id=NEW.campaign_id),0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_limits_below_consumed'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_campaign_update_guard;
DELIMITER $$
CREATE TRIGGER promo_campaign_update_guard BEFORE UPDATE ON promo_campaigns FOR EACH ROW BEGIN
IF BINARY NEW.id<>BINARY OLD.id OR BINARY NEW.code<>BINARY OLD.code OR NEW.created_at<>OLD.created_at OR NEW.version<OLD.version
 OR (NEW.draft_revision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM promo_revisions WHERE campaign_id=NEW.id AND revision=NEW.draft_revision))
 OR NEW.used_count<OLD.used_count OR NEW.spent_paisa<OLD.spent_paisa
 OR (NEW.current_revision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM promo_revisions r WHERE r.campaign_id=NEW.id AND r.revision=NEW.current_revision
 AND r.total_use_limit>=NEW.used_count AND r.budget_paisa>=NEW.spent_paisa
 AND r.per_customer_use_limit>=COALESCE((SELECT MAX(used_count) FROM promo_customer_usage WHERE campaign_id=NEW.id),0)))
 OR NEW.used_count<>(SELECT COUNT(*) FROM promo_redemptions WHERE campaign_id=NEW.id)
 OR NEW.spent_paisa<>COALESCE((SELECT SUM(discount_paisa) FROM promo_redemptions WHERE campaign_id=NEW.id),0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_campaign_changed'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_customer_usage_update_guard;
DELIMITER $$
CREATE TRIGGER promo_customer_usage_update_guard BEFORE UPDATE ON promo_customer_usage FOR EACH ROW BEGIN
IF BINARY NEW.campaign_id<>BINARY OLD.campaign_id OR BINARY NEW.customer_id<>BINARY OLD.customer_id OR NEW.used_count<OLD.used_count
 OR NEW.used_count<>(SELECT COUNT(*) FROM promo_redemptions WHERE campaign_id=NEW.campaign_id AND customer_id=NEW.customer_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_usage_changed'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS orders_promo_insert_guard;
DELIMITER $$
CREATE TRIGGER orders_promo_insert_guard BEFORE INSERT ON orders FOR EACH ROW BEGIN
IF NEW.referral_discount_paisa>0 AND NEW.promo_discount_paisa>0
 OR NEW.current_promo_discount_paisa>NEW.promo_discount_paisa-NEW.refunded_promo_discount_paisa
 OR NEW.refunded_promo_discount_paisa>NEW.promo_discount_paisa
 OR (NEW.current_discount_paisa IS NULL AND NEW.current_promo_discount_paisa<>0)
 OR (NEW.current_discount_paisa IS NOT NULL AND (NEW.current_promo_discount_paisa>NEW.current_discount_paisa
 OR (NEW.promo_discount_paisa>0 AND NEW.current_promo_discount_paisa<>NEW.current_discount_paisa)))
 OR (NEW.promo_discount_paisa=0 AND (NEW.promo_campaign_id IS NOT NULL OR NEW.promo_revision IS NOT NULL OR NEW.promo_code IS NOT NULL OR NEW.promo_label IS NOT NULL))
 OR (NEW.promo_discount_paisa>0 AND (NEW.promo_campaign_id IS NULL OR NEW.promo_revision IS NULL OR NEW.promo_code IS NULL OR NEW.promo_label IS NULL
 OR NEW.promo_discount_paisa>NEW.item_subtotal_paisa-NEW.wallet_credit_paisa
 OR NEW.grand_total_paisa<>NEW.item_subtotal_paisa+NEW.delivery_charge_paisa+NEW.buyer_platform_fee_paisa-NEW.wallet_credit_paisa-NEW.promo_discount_paisa
 OR NOT EXISTS(SELECT 1 FROM promo_revisions r JOIN promo_campaigns c ON c.id=r.campaign_id WHERE BINARY r.campaign_id=BINARY NEW.promo_campaign_id AND r.revision=NEW.promo_revision AND BINARY c.code=BINARY NEW.promo_code AND BINARY r.label=BINARY NEW.promo_label))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_order_snapshot_invalid'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS orders_promo_update_guard;
DELIMITER $$
CREATE TRIGGER orders_promo_update_guard BEFORE UPDATE ON orders FOR EACH ROW BEGIN
IF NEW.referral_discount_paisa>0 AND NEW.promo_discount_paisa>0
 OR NEW.current_promo_discount_paisa>NEW.promo_discount_paisa-NEW.refunded_promo_discount_paisa
 OR NEW.refunded_promo_discount_paisa>NEW.promo_discount_paisa
 OR (NEW.current_discount_paisa IS NULL AND NEW.current_promo_discount_paisa<>0)
 OR (NEW.current_discount_paisa IS NOT NULL AND (NEW.current_promo_discount_paisa>NEW.current_discount_paisa
 OR (NEW.promo_discount_paisa>0 AND NEW.current_promo_discount_paisa<>NEW.current_discount_paisa)))
 OR (NEW.promo_discount_paisa=0 AND (NEW.promo_campaign_id IS NOT NULL OR NEW.promo_revision IS NOT NULL OR NEW.promo_code IS NOT NULL OR NEW.promo_label IS NOT NULL))
 OR (NEW.promo_discount_paisa>0 AND (NEW.promo_campaign_id IS NULL OR NEW.promo_revision IS NULL OR NEW.promo_code IS NULL OR NEW.promo_label IS NULL
 OR NEW.promo_discount_paisa>NEW.item_subtotal_paisa-NEW.wallet_credit_paisa
 OR NEW.grand_total_paisa<>NEW.item_subtotal_paisa+NEW.delivery_charge_paisa+NEW.buyer_platform_fee_paisa-NEW.wallet_credit_paisa-NEW.promo_discount_paisa
 OR NOT EXISTS(SELECT 1 FROM promo_revisions r JOIN promo_campaigns c ON c.id=r.campaign_id WHERE BINARY r.campaign_id=BINARY NEW.promo_campaign_id AND r.revision=NEW.promo_revision AND BINARY c.code=BINARY NEW.promo_code AND BINARY r.label=BINARY NEW.promo_label))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_order_snapshot_invalid'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS orders_promo_original_immutable;
DELIMITER $$
CREATE TRIGGER orders_promo_original_immutable BEFORE UPDATE ON orders FOR EACH ROW BEGIN
IF NOT(NEW.promo_discount_paisa <=> OLD.promo_discount_paisa AND BINARY NEW.promo_campaign_id <=> BINARY OLD.promo_campaign_id
 AND NEW.promo_revision <=> OLD.promo_revision AND BINARY NEW.promo_code <=> BINARY OLD.promo_code AND BINARY NEW.promo_label <=> BINARY OLD.promo_label) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_order_snapshot_immutable'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS order_items_promo_insert_guard;
DELIMITER $$
CREATE TRIGGER order_items_promo_insert_guard BEFORE INSERT ON order_items FOR EACH ROW BEGIN
IF NEW.promo_discount_paisa>0 AND NEW.referral_discount_paisa>0
 OR NEW.promo_discount_paisa>NEW.line_total_paisa
 OR NEW.current_promo_discount_paisa>NEW.promo_discount_paisa-NEW.refunded_promo_discount_paisa
 OR NEW.refunded_promo_discount_paisa>NEW.promo_discount_paisa
 OR (NEW.promo_discount_paisa>0 AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.order_id AND o.promo_discount_paisa>0 AND o.promo_discount_paisa>=NEW.promo_discount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_item_snapshot_invalid'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS order_items_promo_update_guard;
DELIMITER $$
CREATE TRIGGER order_items_promo_update_guard BEFORE UPDATE ON order_items FOR EACH ROW BEGIN
IF NEW.promo_discount_paisa>0 AND NEW.referral_discount_paisa>0
 OR NEW.promo_discount_paisa>NEW.line_total_paisa
 OR NEW.current_promo_discount_paisa>NEW.promo_discount_paisa-NEW.refunded_promo_discount_paisa
 OR NEW.refunded_promo_discount_paisa>NEW.promo_discount_paisa
 OR (NEW.promo_discount_paisa>0 AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.order_id AND o.promo_discount_paisa>0 AND o.promo_discount_paisa>=NEW.promo_discount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_item_snapshot_invalid'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS order_items_promo_original_immutable;
DELIMITER $$
CREATE TRIGGER order_items_promo_original_immutable BEFORE UPDATE ON order_items FOR EACH ROW BEGIN
IF NEW.promo_discount_paisa<>OLD.promo_discount_paisa OR NEW.referral_discount_paisa<>OLD.referral_discount_paisa OR (OLD.promo_discount_paisa>0 AND NOT(BINARY NEW.id <=> BINARY OLD.id AND BINARY NEW.order_id <=> BINARY OLD.order_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_item_snapshot_immutable'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_redemption_guard;
DELIMITER $$
CREATE TRIGGER promo_redemption_guard BEFORE INSERT ON promo_redemptions FOR EACH ROW BEGIN
DECLARE promo_lock VARCHAR(191); SELECT id INTO promo_lock FROM promo_campaigns WHERE id=NEW.campaign_id FOR UPDATE;
IF NOT EXISTS(SELECT 1 FROM promo_campaigns c JOIN promo_revisions r ON r.campaign_id=c.id AND r.revision=c.current_revision
 JOIN orders o ON o.id=NEW.order_id JOIN users u ON u.id=NEW.customer_id
 WHERE c.id=NEW.campaign_id AND c.current_revision=NEW.revision AND c.status='published' AND c.paused=0
 AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='customer')
 AND NEW.created_at>=r.starts_at AND NEW.created_at<r.ends_at
 AND NEW.subtotal_paisa>=r.minimum_subtotal_paisa AND o.customer_id=NEW.customer_id
 AND NEW.discount_paisa=COALESCE((SELECT SUM(promo_discount_paisa) FROM order_items WHERE order_id=NEW.order_id),0)
 AND o.promo_campaign_id=c.id AND o.promo_revision=NEW.revision AND o.promo_discount_paisa=NEW.discount_paisa AND o.item_subtotal_paisa=NEW.subtotal_paisa
 AND c.used_count<r.total_use_limit AND NEW.discount_paisa<=r.budget_paisa-c.spent_paisa
 AND COALESCE((SELECT used_count FROM promo_customer_usage WHERE campaign_id=c.id AND customer_id=NEW.customer_id),0)<r.per_customer_use_limit) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_unavailable'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_redemption_consume;
DELIMITER $$
CREATE TRIGGER promo_redemption_consume AFTER INSERT ON promo_redemptions FOR EACH ROW BEGIN
UPDATE promo_campaigns SET used_count=used_count+1,spent_paisa=spent_paisa+NEW.discount_paisa WHERE id=NEW.campaign_id;
 UPDATE promo_customer_usage SET used_count=used_count+1 WHERE campaign_id=NEW.campaign_id AND customer_id=NEW.customer_id;
 INSERT INTO promo_customer_usage(campaign_id,customer_id,used_count)
 SELECT NEW.campaign_id,NEW.customer_id,1 WHERE NOT EXISTS(SELECT 1 FROM promo_customer_usage WHERE campaign_id=NEW.campaign_id AND customer_id=NEW.customer_id);
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS wallet_refund_guard;
DELIMITER $$
CREATE TRIGGER wallet_refund_guard BEFORE INSERT ON refunds FOR EACH ROW BEGIN
IF (NEW.promo_discount_paisa>0 OR EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.order_id AND o.wallet_credit_paisa+o.referral_discount_paisa+o.promo_discount_paisa>0)) AND
 (NEW.item_amount_paisa IS NULL OR NEW.credit_base_paisa<>COALESCE((SELECT SUM(item_amount_paisa) FROM refunds WHERE order_id=NEW.order_id AND status<>'rejected'),0)
 OR NEW.wallet_credit_paisa>NEW.item_amount_paisa-NEW.referral_discount_paisa-NEW.promo_discount_paisa
 OR NEW.promo_discount_paisa>COALESCE((SELECT promo_discount_paisa FROM orders WHERE id=NEW.order_id),0)-COALESCE((SELECT SUM(promo_discount_paisa) FROM refunds WHERE order_id=NEW.order_id AND status<>'rejected'),0)
 OR (NEW.promo_discount_paisa>0 AND NEW.referral_discount_paisa>0)
 OR (NEW.referral_discount_paisa>0 AND EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND promo_discount_paisa>0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='wallet_refund_changed_retry'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS refunds_promo_offset_immutable;
DELIMITER $$
CREATE TRIGGER refunds_promo_offset_immutable BEFORE UPDATE ON refunds FOR EACH ROW BEGIN
IF NEW.promo_discount_paisa<>OLD.promo_discount_paisa THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_refund_snapshot_immutable'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_campaign_insert_guard;
DELIMITER $$
CREATE TRIGGER promo_campaign_insert_guard BEFORE INSERT ON promo_campaigns FOR EACH ROW BEGIN IF NEW.used_count<>0 OR NEW.spent_paisa<>0 OR NEW.current_revision IS NOT NULL OR NEW.draft_revision IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_campaign_initial_state'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS order_items_promo_no_delete;
DELIMITER $$
CREATE TRIGGER order_items_promo_no_delete BEFORE DELETE ON order_items FOR EACH ROW BEGIN IF OLD.promo_discount_paisa>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_item_snapshot_immutable'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS order_items_promo_sealed_insert;
DELIMITER $$
CREATE TRIGGER order_items_promo_sealed_insert BEFORE INSERT ON order_items FOR EACH ROW BEGIN IF NEW.promo_discount_paisa>0 AND EXISTS(SELECT 1 FROM promo_redemptions WHERE order_id=NEW.order_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_item_allocations_sealed'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_customer_usage_insert_guard;
DELIMITER $$
CREATE TRIGGER promo_customer_usage_insert_guard BEFORE INSERT ON promo_customer_usage FOR EACH ROW BEGIN IF NEW.used_count<>(SELECT COUNT(*) FROM promo_redemptions WHERE campaign_id=NEW.campaign_id AND customer_id=NEW.customer_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_usage_changed'; END IF; END$$
DELIMITER ;
