-- Promo campaigns own lifetime usage; revisions never reset counters. No campaigns are seeded.
CREATE TABLE promo_campaigns (
 id VARCHAR(191) PRIMARY KEY,
 code VARCHAR(32) NOT NULL UNIQUE CHECK(length(code) BETWEEN 3 AND 32 AND code NOT GLOB '*[^A-Z0-9_-]*' AND substr(code,1,1) GLOB '[A-Z0-9]'),
 -- current_revision is published/live; draft_revision never changes checkout authority.
 current_revision INTEGER, draft_revision INTEGER,
 version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(version)='integer' AND version BETWEEN 1 AND 9007199254740991),
 status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0,1)),
 used_count INTEGER NOT NULL DEFAULT 0 CHECK(typeof(used_count)='integer' AND used_count BETWEEN 0 AND 9007199254740991),
 spent_paisa INTEGER NOT NULL DEFAULT 0 CHECK(typeof(spent_paisa)='integer' AND spent_paisa BETWEEN 0 AND 9007199254740991),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 CHECK(status='draft' OR current_revision IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE promo_revisions (
 campaign_id VARCHAR(191) NOT NULL REFERENCES promo_campaigns(id),
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
 label VARCHAR(200) NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 200),
 kind VARCHAR(16) NOT NULL CHECK(kind IN ('fixed','percentage')),
 fixed_paisa INTEGER, percent_bps INTEGER, max_discount_paisa INTEGER,
 minimum_subtotal_paisa INTEGER NOT NULL CHECK(typeof(minimum_subtotal_paisa)='integer' AND minimum_subtotal_paisa BETWEEN 0 AND 9007199254740991),
 starts_at INTEGER NOT NULL CHECK(typeof(starts_at)='integer' AND starts_at BETWEEN 0 AND 253402300799999),
 ends_at INTEGER NOT NULL CHECK(typeof(ends_at)='integer' AND ends_at BETWEEN 1 AND 253402300799999 AND ends_at>starts_at),
 total_use_limit INTEGER NOT NULL CHECK(typeof(total_use_limit)='integer' AND total_use_limit BETWEEN 1 AND 9007199254740991),
 per_customer_use_limit INTEGER NOT NULL CHECK(typeof(per_customer_use_limit)='integer' AND per_customer_use_limit BETWEEN 1 AND total_use_limit),
 budget_paisa INTEGER NOT NULL CHECK(typeof(budget_paisa)='integer' AND budget_paisa BETWEEN 1 AND 9007199254740991),
 created_by VARCHAR(191) NOT NULL REFERENCES users(id), request_id VARCHAR(191) NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason))>0), form_version_id VARCHAR(191) NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(campaign_id,revision), UNIQUE(created_by,request_id),
 CHECK((kind='fixed' AND typeof(fixed_paisa)='integer' AND fixed_paisa BETWEEN 1 AND 9007199254740991 AND percent_bps IS NULL AND max_discount_paisa IS NULL)
 OR (kind='percentage' AND fixed_paisa IS NULL AND typeof(percent_bps)='integer' AND percent_bps BETWEEN 1 AND 10000 AND typeof(max_discount_paisa)='integer' AND max_discount_paisa BETWEEN 1 AND 9007199254740991))
);
--> statement-breakpoint
CREATE TABLE promo_customer_usage (
 campaign_id VARCHAR(191) NOT NULL REFERENCES promo_campaigns(id), customer_id VARCHAR(191) NOT NULL REFERENCES users(id),
 used_count INTEGER NOT NULL DEFAULT 0 CHECK(typeof(used_count)='integer' AND used_count BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(campaign_id,customer_id)
);
--> statement-breakpoint
CREATE TABLE promo_redemptions (
 id VARCHAR(191) PRIMARY KEY, campaign_id VARCHAR(191) NOT NULL, revision INTEGER NOT NULL,
 customer_id VARCHAR(191) NOT NULL REFERENCES users(id), order_id VARCHAR(191) NOT NULL UNIQUE REFERENCES orders(id),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id), request_id VARCHAR(191) NOT NULL CHECK(length(request_id) BETWEEN 1 AND 191),
 payload_digest VARCHAR(64) NOT NULL CHECK(length(payload_digest)=64 AND payload_digest NOT GLOB '*[^a-f0-9]*'),
 response_json TEXT NOT NULL CHECK(json_valid(response_json) AND json_type(response_json)='object'),
 discount_paisa INTEGER NOT NULL CHECK(typeof(discount_paisa)='integer' AND discount_paisa BETWEEN 1 AND 9007199254740991),
 subtotal_paisa INTEGER NOT NULL CHECK(typeof(subtotal_paisa)='integer' AND subtotal_paisa BETWEEN discount_paisa AND 9007199254740991),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 253402300799999),
 UNIQUE(actor_id,request_id), FOREIGN KEY(campaign_id,revision) REFERENCES promo_revisions(campaign_id,revision), CHECK(actor_id=customer_id)
);
--> statement-breakpoint
CREATE INDEX idx_promo_redemptions_campaign ON promo_redemptions(campaign_id,created_at,id);
--> statement-breakpoint
CREATE INDEX idx_promo_redemptions_customer ON promo_redemptions(customer_id,created_at,id);
--> statement-breakpoint
CREATE INDEX idx_promo_customer_usage_max ON promo_customer_usage(campaign_id,used_count);
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN promo_discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(typeof(promo_discount_paisa)='integer' AND promo_discount_paisa BETWEEN 0 AND 9007199254740991);
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN current_promo_discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(typeof(current_promo_discount_paisa)='integer' AND current_promo_discount_paisa BETWEEN 0 AND 9007199254740991);
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN refunded_promo_discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(typeof(refunded_promo_discount_paisa)='integer' AND refunded_promo_discount_paisa BETWEEN 0 AND 9007199254740991);
--> statement-breakpoint
ALTER TABLE order_items ADD COLUMN promo_discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(typeof(promo_discount_paisa)='integer' AND promo_discount_paisa BETWEEN 0 AND 9007199254740991);
--> statement-breakpoint
ALTER TABLE order_items ADD COLUMN current_promo_discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(typeof(current_promo_discount_paisa)='integer' AND current_promo_discount_paisa BETWEEN 0 AND 9007199254740991);
--> statement-breakpoint
ALTER TABLE order_items ADD COLUMN refunded_promo_discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(typeof(refunded_promo_discount_paisa)='integer' AND refunded_promo_discount_paisa BETWEEN 0 AND 9007199254740991);
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN promo_campaign_id VARCHAR(191) REFERENCES promo_campaigns(id);
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN promo_revision INTEGER;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN promo_code VARCHAR(32);
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN promo_label VARCHAR(200);
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN discount_source VARCHAR(16) GENERATED ALWAYS AS (CASE WHEN promo_discount_paisa>0 THEN 'promo' WHEN referral_discount_paisa>0 THEN 'referral' ELSE 'none' END) VIRTUAL;
--> statement-breakpoint
-- Current aggregate remains total platform discount. NULL keeps the historical original-referral fallback.
ALTER TABLE orders ADD COLUMN current_referral_discount_paisa INTEGER GENERATED ALWAYS AS
 (CASE WHEN current_discount_paisa IS NULL THEN referral_discount_paisa ELSE current_discount_paisa-current_promo_discount_paisa END) VIRTUAL;
--> statement-breakpoint
ALTER TABLE order_items ADD COLUMN referral_discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(typeof(referral_discount_paisa)='integer' AND referral_discount_paisa BETWEEN 0 AND 9007199254740991);
--> statement-breakpoint
UPDATE order_items SET referral_discount_paisa=platform_discount_paisa
 WHERE EXISTS(SELECT 1 FROM orders WHERE orders.id=order_items.order_id AND orders.referral_discount_paisa>0);
--> statement-breakpoint
ALTER TABLE order_items ADD COLUMN discount_source VARCHAR(16) GENERATED ALWAYS AS (CASE WHEN promo_discount_paisa>0 THEN 'promo' WHEN referral_discount_paisa>0 THEN 'referral' ELSE 'none' END) VIRTUAL;
--> statement-breakpoint
ALTER TABLE refunds ADD COLUMN promo_discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(typeof(promo_discount_paisa)='integer' AND promo_discount_paisa BETWEEN 0 AND 9007199254740991);
--> statement-breakpoint
CREATE TRIGGER promo_revisions_no_update BEFORE UPDATE ON promo_revisions FOR EACH ROW BEGIN SELECT RAISE(ABORT,'promo_revisions_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER promo_revisions_no_delete BEFORE DELETE ON promo_revisions FOR EACH ROW BEGIN SELECT RAISE(ABORT,'promo_revisions_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER promo_redemptions_no_update BEFORE UPDATE ON promo_redemptions FOR EACH ROW BEGIN SELECT RAISE(ABORT,'promo_redemptions_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER promo_redemptions_no_delete BEFORE DELETE ON promo_redemptions FOR EACH ROW BEGIN SELECT RAISE(ABORT,'promo_redemptions_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER promo_campaigns_no_delete BEFORE DELETE ON promo_campaigns FOR EACH ROW BEGIN SELECT RAISE(ABORT,'promo_campaigns_retained'); END;
--> statement-breakpoint
CREATE TRIGGER promo_customer_usage_no_delete BEFORE DELETE ON promo_customer_usage FOR EACH ROW BEGIN SELECT RAISE(ABORT,'promo_customer_usage_retained'); END;
--> statement-breakpoint
CREATE TRIGGER promo_revision_limits BEFORE INSERT ON promo_revisions FOR EACH ROW WHEN NEW.total_use_limit<(SELECT used_count FROM promo_campaigns WHERE id=NEW.campaign_id)
 OR NEW.budget_paisa<(SELECT spent_paisa FROM promo_campaigns WHERE id=NEW.campaign_id)
 OR NEW.per_customer_use_limit<COALESCE((SELECT MAX(used_count) FROM promo_customer_usage WHERE campaign_id=NEW.campaign_id),0) BEGIN SELECT RAISE(ABORT,'promo_limits_below_consumed'); END;
--> statement-breakpoint
CREATE TRIGGER promo_campaign_update_guard BEFORE UPDATE ON promo_campaigns FOR EACH ROW WHEN NEW.id<>OLD.id OR NEW.code<>OLD.code OR NEW.created_at<>OLD.created_at OR NEW.version<OLD.version
 OR (NEW.draft_revision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM promo_revisions WHERE campaign_id=NEW.id AND revision=NEW.draft_revision))
 OR NEW.used_count<OLD.used_count OR NEW.spent_paisa<OLD.spent_paisa
 OR (NEW.current_revision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM promo_revisions r WHERE r.campaign_id=NEW.id AND r.revision=NEW.current_revision
 AND r.total_use_limit>=NEW.used_count AND r.budget_paisa>=NEW.spent_paisa
 AND r.per_customer_use_limit>=COALESCE((SELECT MAX(used_count) FROM promo_customer_usage WHERE campaign_id=NEW.id),0)))
 OR NEW.used_count<>(SELECT COUNT(*) FROM promo_redemptions WHERE campaign_id=NEW.id)
 OR NEW.spent_paisa<>COALESCE((SELECT SUM(discount_paisa) FROM promo_redemptions WHERE campaign_id=NEW.id),0) BEGIN SELECT RAISE(ABORT,'promo_campaign_changed'); END;
--> statement-breakpoint
CREATE TRIGGER promo_customer_usage_update_guard BEFORE UPDATE ON promo_customer_usage FOR EACH ROW WHEN NEW.campaign_id<>OLD.campaign_id OR NEW.customer_id<>OLD.customer_id OR NEW.used_count<OLD.used_count
 OR NEW.used_count<>(SELECT COUNT(*) FROM promo_redemptions WHERE campaign_id=NEW.campaign_id AND customer_id=NEW.customer_id) BEGIN SELECT RAISE(ABORT,'promo_usage_changed'); END;
--> statement-breakpoint
CREATE TRIGGER orders_promo_insert_guard BEFORE INSERT ON orders FOR EACH ROW WHEN NEW.referral_discount_paisa>0 AND NEW.promo_discount_paisa>0
 OR NEW.current_promo_discount_paisa>NEW.promo_discount_paisa-NEW.refunded_promo_discount_paisa
 OR NEW.refunded_promo_discount_paisa>NEW.promo_discount_paisa
 OR (NEW.current_discount_paisa IS NULL AND NEW.current_promo_discount_paisa<>0)
 OR (NEW.current_discount_paisa IS NOT NULL AND (NEW.current_promo_discount_paisa>NEW.current_discount_paisa
 OR (NEW.promo_discount_paisa>0 AND NEW.current_promo_discount_paisa<>NEW.current_discount_paisa)))
 OR (NEW.promo_discount_paisa=0 AND (NEW.promo_campaign_id IS NOT NULL OR NEW.promo_revision IS NOT NULL OR NEW.promo_code IS NOT NULL OR NEW.promo_label IS NOT NULL))
 OR (NEW.promo_discount_paisa>0 AND (NEW.promo_campaign_id IS NULL OR NEW.promo_revision IS NULL OR NEW.promo_code IS NULL OR NEW.promo_label IS NULL
 OR NEW.promo_discount_paisa>NEW.item_subtotal_paisa-NEW.wallet_credit_paisa
 OR NEW.grand_total_paisa<>NEW.item_subtotal_paisa+NEW.delivery_charge_paisa+NEW.buyer_platform_fee_paisa-NEW.wallet_credit_paisa-NEW.promo_discount_paisa
 OR NOT EXISTS(SELECT 1 FROM promo_revisions r JOIN promo_campaigns c ON c.id=r.campaign_id WHERE r.campaign_id=NEW.promo_campaign_id AND r.revision=NEW.promo_revision AND c.code=NEW.promo_code AND r.label=NEW.promo_label))) BEGIN SELECT RAISE(ABORT,'promo_order_snapshot_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER orders_promo_update_guard BEFORE UPDATE ON orders FOR EACH ROW WHEN NEW.referral_discount_paisa>0 AND NEW.promo_discount_paisa>0
 OR NEW.current_promo_discount_paisa>NEW.promo_discount_paisa-NEW.refunded_promo_discount_paisa
 OR NEW.refunded_promo_discount_paisa>NEW.promo_discount_paisa
 OR (NEW.current_discount_paisa IS NULL AND NEW.current_promo_discount_paisa<>0)
 OR (NEW.current_discount_paisa IS NOT NULL AND (NEW.current_promo_discount_paisa>NEW.current_discount_paisa
 OR (NEW.promo_discount_paisa>0 AND NEW.current_promo_discount_paisa<>NEW.current_discount_paisa)))
 OR (NEW.promo_discount_paisa=0 AND (NEW.promo_campaign_id IS NOT NULL OR NEW.promo_revision IS NOT NULL OR NEW.promo_code IS NOT NULL OR NEW.promo_label IS NOT NULL))
 OR (NEW.promo_discount_paisa>0 AND (NEW.promo_campaign_id IS NULL OR NEW.promo_revision IS NULL OR NEW.promo_code IS NULL OR NEW.promo_label IS NULL
 OR NEW.promo_discount_paisa>NEW.item_subtotal_paisa-NEW.wallet_credit_paisa
 OR NEW.grand_total_paisa<>NEW.item_subtotal_paisa+NEW.delivery_charge_paisa+NEW.buyer_platform_fee_paisa-NEW.wallet_credit_paisa-NEW.promo_discount_paisa
 OR NOT EXISTS(SELECT 1 FROM promo_revisions r JOIN promo_campaigns c ON c.id=r.campaign_id WHERE r.campaign_id=NEW.promo_campaign_id AND r.revision=NEW.promo_revision AND c.code=NEW.promo_code AND r.label=NEW.promo_label))) BEGIN SELECT RAISE(ABORT,'promo_order_snapshot_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER orders_promo_original_immutable BEFORE UPDATE ON orders FOR EACH ROW WHEN NOT(NEW.promo_discount_paisa IS OLD.promo_discount_paisa AND NEW.promo_campaign_id IS OLD.promo_campaign_id
 AND NEW.promo_revision IS OLD.promo_revision AND NEW.promo_code IS OLD.promo_code AND NEW.promo_label IS OLD.promo_label) BEGIN SELECT RAISE(ABORT,'promo_order_snapshot_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER order_items_promo_insert_guard BEFORE INSERT ON order_items FOR EACH ROW WHEN NEW.promo_discount_paisa>0 AND NEW.referral_discount_paisa>0
 OR NEW.promo_discount_paisa>NEW.line_total_paisa
 OR NEW.current_promo_discount_paisa>NEW.promo_discount_paisa-NEW.refunded_promo_discount_paisa
 OR NEW.refunded_promo_discount_paisa>NEW.promo_discount_paisa
 OR (NEW.promo_discount_paisa>0 AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.order_id AND o.promo_discount_paisa>0 AND o.promo_discount_paisa>=NEW.promo_discount_paisa)) BEGIN SELECT RAISE(ABORT,'promo_item_snapshot_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER order_items_promo_update_guard BEFORE UPDATE ON order_items FOR EACH ROW WHEN NEW.promo_discount_paisa>0 AND NEW.referral_discount_paisa>0
 OR NEW.promo_discount_paisa>NEW.line_total_paisa
 OR NEW.current_promo_discount_paisa>NEW.promo_discount_paisa-NEW.refunded_promo_discount_paisa
 OR NEW.refunded_promo_discount_paisa>NEW.promo_discount_paisa
 OR (NEW.promo_discount_paisa>0 AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.order_id AND o.promo_discount_paisa>0 AND o.promo_discount_paisa>=NEW.promo_discount_paisa)) BEGIN SELECT RAISE(ABORT,'promo_item_snapshot_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER order_items_promo_original_immutable BEFORE UPDATE ON order_items FOR EACH ROW WHEN NEW.promo_discount_paisa<>OLD.promo_discount_paisa OR NEW.referral_discount_paisa<>OLD.referral_discount_paisa OR (OLD.promo_discount_paisa>0 AND (NEW.id<>OLD.id OR NEW.order_id<>OLD.order_id)) BEGIN SELECT RAISE(ABORT,'promo_item_snapshot_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER promo_redemption_guard BEFORE INSERT ON promo_redemptions FOR EACH ROW WHEN NOT EXISTS(SELECT 1 FROM promo_campaigns c JOIN promo_revisions r ON r.campaign_id=c.id AND r.revision=c.current_revision
 JOIN orders o ON o.id=NEW.order_id JOIN users u ON u.id=NEW.customer_id
 WHERE c.id=NEW.campaign_id AND c.current_revision=NEW.revision AND c.status='published' AND c.paused=0
 AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='customer')
 AND NEW.created_at>=r.starts_at AND NEW.created_at<r.ends_at
 AND NEW.subtotal_paisa>=r.minimum_subtotal_paisa AND o.customer_id=NEW.customer_id
 AND NEW.discount_paisa=COALESCE((SELECT SUM(promo_discount_paisa) FROM order_items WHERE order_id=NEW.order_id),0)
 AND o.promo_campaign_id=c.id AND o.promo_revision=NEW.revision AND o.promo_discount_paisa=NEW.discount_paisa AND o.item_subtotal_paisa=NEW.subtotal_paisa
 AND c.used_count<r.total_use_limit AND NEW.discount_paisa<=r.budget_paisa-c.spent_paisa
 AND COALESCE((SELECT used_count FROM promo_customer_usage WHERE campaign_id=c.id AND customer_id=NEW.customer_id),0)<r.per_customer_use_limit) BEGIN SELECT RAISE(ABORT,'promo_unavailable'); END;
--> statement-breakpoint
CREATE TRIGGER promo_redemption_consume AFTER INSERT ON promo_redemptions FOR EACH ROW BEGIN UPDATE promo_campaigns SET used_count=used_count+1,spent_paisa=spent_paisa+NEW.discount_paisa WHERE id=NEW.campaign_id;
 UPDATE promo_customer_usage SET used_count=used_count+1 WHERE campaign_id=NEW.campaign_id AND customer_id=NEW.customer_id;
 INSERT INTO promo_customer_usage(campaign_id,customer_id,used_count)
 SELECT NEW.campaign_id,NEW.customer_id,1 WHERE NOT EXISTS(SELECT 1 FROM promo_customer_usage WHERE campaign_id=NEW.campaign_id AND customer_id=NEW.customer_id); END;
--> statement-breakpoint
DROP TRIGGER wallet_refund_guard;
--> statement-breakpoint
CREATE TRIGGER wallet_refund_guard BEFORE INSERT ON refunds FOR EACH ROW WHEN (NEW.promo_discount_paisa>0 OR EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.order_id AND o.wallet_credit_paisa+o.referral_discount_paisa+o.promo_discount_paisa>0)) AND
 (NEW.item_amount_paisa IS NULL OR NEW.credit_base_paisa<>COALESCE((SELECT SUM(item_amount_paisa) FROM refunds WHERE order_id=NEW.order_id AND status<>'rejected'),0)
 OR NEW.wallet_credit_paisa>NEW.item_amount_paisa-NEW.referral_discount_paisa-NEW.promo_discount_paisa
 OR NEW.promo_discount_paisa>COALESCE((SELECT promo_discount_paisa FROM orders WHERE id=NEW.order_id),0)-COALESCE((SELECT SUM(promo_discount_paisa) FROM refunds WHERE order_id=NEW.order_id AND status<>'rejected'),0)
 OR (NEW.promo_discount_paisa>0 AND NEW.referral_discount_paisa>0)
 OR (NEW.referral_discount_paisa>0 AND EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND promo_discount_paisa>0))) BEGIN SELECT RAISE(ABORT,'wallet_refund_changed_retry'); END;
--> statement-breakpoint
CREATE TRIGGER refunds_promo_offset_immutable BEFORE UPDATE ON refunds FOR EACH ROW WHEN NEW.promo_discount_paisa<>OLD.promo_discount_paisa BEGIN SELECT RAISE(ABORT,'promo_refund_snapshot_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER promo_campaign_insert_guard BEFORE INSERT ON promo_campaigns FOR EACH ROW WHEN NEW.used_count<>0 OR NEW.spent_paisa<>0 OR NEW.current_revision IS NOT NULL OR NEW.draft_revision IS NOT NULL BEGIN SELECT RAISE(ABORT,'promo_campaign_initial_state'); END;
--> statement-breakpoint
CREATE TRIGGER order_items_promo_no_delete BEFORE DELETE ON order_items FOR EACH ROW WHEN OLD.promo_discount_paisa>0 BEGIN SELECT RAISE(ABORT,'promo_item_snapshot_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER order_items_promo_sealed_insert BEFORE INSERT ON order_items FOR EACH ROW WHEN NEW.promo_discount_paisa>0 AND EXISTS(SELECT 1 FROM promo_redemptions WHERE order_id=NEW.order_id) BEGIN SELECT RAISE(ABORT,'promo_item_allocations_sealed'); END;

--> statement-breakpoint
CREATE TRIGGER promo_customer_usage_insert_guard BEFORE INSERT ON promo_customer_usage FOR EACH ROW WHEN NEW.used_count<>(SELECT COUNT(*) FROM promo_redemptions WHERE campaign_id=NEW.campaign_id AND customer_id=NEW.customer_id) BEGIN SELECT RAISE(ABORT,'promo_usage_changed'); END;
