CREATE TABLE IF NOT EXISTS wallet_accounts (
 user_id VARCHAR(191) PRIMARY KEY REFERENCES users(id),
 referral_code VARCHAR(32) NOT NULL UNIQUE,
 balance_paisa BIGINT NOT NULL DEFAULT 0 CHECK(balance_paisa >= 0),
 created_at BIGINT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS referral_campaign (
 id VARCHAR(32) PRIMARY KEY,
 enabled BIGINT NOT NULL DEFAULT 1,
 friend_discount_paisa BIGINT NOT NULL CHECK(friend_discount_paisa > 0),
 reward_paisa BIGINT NOT NULL CHECK(reward_paisa > 0),
 minimum_subtotal_paisa BIGINT NOT NULL CHECK(minimum_subtotal_paisa > friend_discount_paisa),
 return_window_days BIGINT NOT NULL CHECK(return_window_days >= 7),
 updated_at BIGINT NOT NULL
);
--> statement-breakpoint
INSERT INTO referral_campaign (id, enabled, friend_discount_paisa, reward_paisa, minimum_subtotal_paisa, return_window_days, updated_at)
 SELECT 'default', 1, 10000, 10000, 150000, 7, 0 WHERE NOT EXISTS (SELECT 1 FROM referral_campaign WHERE id = 'default');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS referral_redemptions (
 customer_id VARCHAR(191) PRIMARY KEY REFERENCES users(id),
 referrer_id VARCHAR(191) NOT NULL REFERENCES wallet_accounts(user_id),
 order_id VARCHAR(191) NOT NULL UNIQUE REFERENCES orders(id),
 phone_key VARCHAR(32) NOT NULL UNIQUE,
 reward_paisa BIGINT NOT NULL CHECK(reward_paisa > 0),
 wait_days BIGINT NOT NULL CHECK(wait_days >= 7),
 created_at BIGINT NOT NULL,
 CHECK(customer_id <> referrer_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS wallet_entries (
 id VARCHAR(191) PRIMARY KEY,
 user_id VARCHAR(191) NOT NULL REFERENCES wallet_accounts(user_id),
 order_id VARCHAR(191) NOT NULL REFERENCES orders(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa <> 0),
 platform_amount_paisa BIGINT NOT NULL,
 kind VARCHAR(32) NOT NULL CHECK(kind IN ('referral_reward','order_spend','cancellation','refund')),
 created_at BIGINT NOT NULL,
 CHECK(amount_paisa + platform_amount_paisa = 0),
 CHECK((kind = 'order_spend' AND amount_paisa < 0) OR (kind <> 'order_spend' AND amount_paisa > 0))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_wallet_entries_user ON wallet_entries(user_id,created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referral_redemptions(referrer_id,created_at);
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN wallet_credit_paisa BIGINT NOT NULL DEFAULT 0 CHECK(wallet_credit_paisa >= 0);
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN referral_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(referral_discount_paisa >= 0);
--> statement-breakpoint
ALTER TABLE refunds ADD COLUMN wallet_credit_paisa BIGINT NOT NULL DEFAULT 0 CHECK(wallet_credit_paisa >= 0);
--> statement-breakpoint
ALTER TABLE refunds ADD COLUMN referral_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(referral_discount_paisa >= 0);
--> statement-breakpoint
ALTER TABLE refunds ADD COLUMN credit_base_paisa BIGINT NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TRIGGER wallet_refund_lock BEFORE INSERT ON refunds FOR EACH ROW  BEGIN UPDATE orders SET updated_at=updated_at WHERE id=NEW.order_id; END;
--> statement-breakpoint
CREATE TRIGGER wallet_refund_guard BEFORE INSERT ON refunds FOR EACH ROW WHEN EXISTS (SELECT 1 FROM orders o WHERE o.id=NEW.order_id AND o.wallet_credit_paisa + o.referral_discount_paisa > 0) AND
   (NEW.credit_base_paisa <> (SELECT COALESCE(SUM(item_amount_paisa),0) FROM refunds WHERE order_id=NEW.order_id AND status <> 'rejected')
    OR NEW.wallet_credit_paisa + NEW.referral_discount_paisa > NEW.item_amount_paisa) BEGIN SELECT RAISE(ABORT, 'wallet_refund_changed_retry'); END;
--> statement-breakpoint
CREATE TRIGGER wallet_entry_balance AFTER INSERT ON wallet_entries FOR EACH ROW  BEGIN UPDATE wallet_accounts SET balance_paisa = balance_paisa + NEW.amount_paisa WHERE user_id = NEW.user_id; END;
--> statement-breakpoint
CREATE TRIGGER wallet_entry_no_update BEFORE UPDATE ON wallet_entries FOR EACH ROW  BEGIN SELECT RAISE(ABORT, 'wallet_entries_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER wallet_entry_no_delete BEFORE DELETE ON wallet_entries FOR EACH ROW  BEGIN SELECT RAISE(ABORT, 'wallet_entries_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER wallet_cancel_restore AFTER UPDATE ON orders FOR EACH ROW WHEN NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND NEW.wallet_credit_paisa > 0 BEGIN INSERT INTO wallet_entries (id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
 VALUES ('cancel:' || NEW.id,NEW.customer_id,NEW.id,NEW.wallet_credit_paisa,-NEW.wallet_credit_paisa,'cancellation',NEW.updated_at); END;
--> statement-breakpoint
CREATE TRIGGER wallet_refund_restore AFTER UPDATE ON refunds FOR EACH ROW WHEN NEW.status = 'paid' AND OLD.status <> 'paid' AND NEW.wallet_credit_paisa > 0 BEGIN INSERT INTO wallet_entries (id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
 SELECT 'refund:' || NEW.id, customer_id, id, NEW.wallet_credit_paisa, -NEW.wallet_credit_paisa, 'refund', NEW.processed_at FROM orders WHERE id = NEW.order_id; END;
--> statement-breakpoint
CREATE TRIGGER referral_first_order BEFORE INSERT ON referral_redemptions FOR EACH ROW WHEN EXISTS (SELECT 1 FROM orders WHERE (customer_id = NEW.customer_id OR (CASE WHEN LENGTH(REPLACE(customer_phone,'+','')) > 10 THEN SUBSTR(REPLACE(customer_phone,'+',''),4) ELSE REPLACE(customer_phone,'+','') END) = NEW.phone_key) AND id <> NEW.order_id AND status <> 'cancelled') BEGIN SELECT RAISE(ABORT, 'referral_first_order_only'); END;
