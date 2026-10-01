CREATE TABLE IF NOT EXISTS gift_cards (
 id VARCHAR(191) PRIMARY KEY,
 code_hash VARCHAR(64) NOT NULL UNIQUE,
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa BETWEEN 1 AND 9007199254740991),
 issued_by VARCHAR(191) NOT NULL REFERENCES users(id),
 issuance_request_id VARCHAR(100) NOT NULL UNIQUE,
 issued_at BIGINT NOT NULL,
 redeemed_by VARCHAR(191) REFERENCES users(id),
 redeemed_at BIGINT,
 redemption_request_id VARCHAR(100) UNIQUE,
 CHECK((redeemed_by IS NULL AND redeemed_at IS NULL AND redemption_request_id IS NULL) OR (redeemed_by IS NOT NULL AND redeemed_at IS NOT NULL AND redemption_request_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE wallet_entries_gift_new (
 id VARCHAR(191) PRIMARY KEY,
 user_id VARCHAR(191) NOT NULL REFERENCES wallet_accounts(user_id),
 order_id VARCHAR(191) REFERENCES orders(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa <> 0),
 platform_amount_paisa BIGINT NOT NULL,
 kind VARCHAR(32) NOT NULL CHECK(kind IN ('referral_reward','order_spend','cancellation','refund','gift_card')),
 gift_card_id VARCHAR(191) UNIQUE REFERENCES gift_cards(id),
 created_at BIGINT NOT NULL,
 CHECK((kind='gift_card' AND order_id IS NULL AND gift_card_id IS NOT NULL) OR (kind<>'gift_card' AND order_id IS NOT NULL AND gift_card_id IS NULL)),
 CHECK(amount_paisa + platform_amount_paisa = 0),
 CHECK((kind = 'order_spend' AND amount_paisa < 0) OR (kind <> 'order_spend' AND amount_paisa > 0))
);
--> statement-breakpoint
INSERT INTO wallet_entries_gift_new(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at) SELECT id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at FROM wallet_entries;
--> statement-breakpoint
DROP TRIGGER wallet_entry_no_delete;
--> statement-breakpoint
DROP TRIGGER wallet_entry_no_update;
--> statement-breakpoint
DROP TRIGGER wallet_entry_balance;
--> statement-breakpoint
DROP TRIGGER wallet_cancel_restore;
--> statement-breakpoint
DROP TRIGGER wallet_refund_restore;
--> statement-breakpoint
DROP TABLE wallet_entries;
--> statement-breakpoint
ALTER TABLE wallet_entries_gift_new RENAME TO wallet_entries;
--> statement-breakpoint
CREATE INDEX idx_wallet_entries_user ON wallet_entries(user_id,created_at);
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
--> statement-breakpoint
CREATE TRIGGER gift_card_no_delete BEFORE DELETE ON gift_cards BEGIN SELECT RAISE(ABORT,'gift_cards_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER gift_card_update_guard BEFORE UPDATE ON gift_cards WHEN OLD.redeemed_by IS NOT NULL OR NEW.id<>OLD.id OR NEW.code_hash<>OLD.code_hash OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.issued_by<>OLD.issued_by OR NEW.issuance_request_id<>OLD.issuance_request_id OR NEW.issued_at<>OLD.issued_at BEGIN SELECT RAISE(ABORT,'gift_cards_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER wallet_gift_source_guard BEFORE INSERT ON wallet_entries WHEN NEW.kind='gift_card' AND NOT EXISTS(SELECT 1 FROM gift_cards WHERE id=NEW.gift_card_id AND redeemed_by=NEW.user_id AND amount_paisa=NEW.amount_paisa) BEGIN SELECT RAISE(ABORT,'gift_card_source_mismatch'); END;
