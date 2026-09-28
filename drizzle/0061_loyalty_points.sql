-- Loyalty financial rows use epoch milliseconds. Trigger-owned posting is atomic with the source insert.
CREATE TABLE loyalty_config (
 id VARCHAR(32) PRIMARY KEY CHECK(id='default'),
 version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(version)='integer' AND version BETWEEN 1 AND 9007199254740991),
 current_revision INTEGER NOT NULL DEFAULT 0, draft_revision INTEGER,
 paused INTEGER NOT NULL DEFAULT 1 CHECK(paused IN (0,1)),
 issued_points INTEGER NOT NULL DEFAULT 0 CHECK(typeof(issued_points)='integer' AND issued_points BETWEEN 0 AND 9007199254740991),
 redeemed_points INTEGER NOT NULL DEFAULT 0 CHECK(typeof(redeemed_points)='integer' AND redeemed_points BETWEEN 0 AND issued_points),
 credited_paisa INTEGER NOT NULL DEFAULT 0 CHECK(typeof(credited_paisa)='integer' AND credited_paisa BETWEEN 0 AND 9007199254740991),
 locked_points_per_block INTEGER, locked_credit_paisa_per_block INTEGER,
 CHECK((issued_points=0 AND locked_points_per_block IS NULL AND locked_credit_paisa_per_block IS NULL) OR (issued_points>0 AND locked_points_per_block IS NOT NULL AND locked_credit_paisa_per_block IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE loyalty_revisions (
 revision INTEGER PRIMARY KEY CHECK(typeof(revision)='integer' AND revision BETWEEN 0 AND 9007199254740991),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 daily_points INTEGER NOT NULL CHECK(typeof(daily_points)='integer' AND daily_points BETWEEN 1 AND 9007199254740991),
 points_per_block INTEGER NOT NULL CHECK(typeof(points_per_block)='integer' AND points_per_block BETWEEN 1 AND 9007199254740991),
 credit_paisa_per_block INTEGER NOT NULL CHECK(typeof(credit_paisa_per_block)='integer' AND credit_paisa_per_block BETWEEN 1 AND 9007199254740991),
 starts_at INTEGER CHECK(starts_at IS NULL OR (typeof(starts_at)='integer' AND starts_at BETWEEN 0 AND 253402300799999)),
 ends_at INTEGER CHECK(ends_at IS NULL OR (typeof(ends_at)='integer' AND ends_at BETWEEN 1 AND 253402300799999 AND starts_at IS NOT NULL AND ends_at>starts_at)),
 daily_budget_points INTEGER CHECK(daily_budget_points IS NULL OR (typeof(daily_budget_points)='integer' AND daily_budget_points BETWEEN daily_points AND 9007199254740991)),
 lifetime_budget_points INTEGER CHECK(lifetime_budget_points IS NULL OR (typeof(lifetime_budget_points)='integer' AND lifetime_budget_points BETWEEN daily_points AND 9007199254740991)),
 created_by VARCHAR(191) REFERENCES users(id), request_id VARCHAR(191) CHECK(request_id IS NULL OR length(request_id) BETWEEN 1 AND 191),
 reason TEXT NOT NULL CHECK(length(trim(reason))>0), form_version_id VARCHAR(191),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 253402300799999),
 UNIQUE(created_by,request_id),
 CHECK(enabled=0 OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND daily_budget_points IS NOT NULL AND lifetime_budget_points IS NOT NULL)),
 CHECK(revision=0 OR (created_by IS NOT NULL AND request_id IS NOT NULL AND form_version_id IS NOT NULL)),
 CHECK(revision<>0 OR (enabled=0 AND created_by IS NULL AND request_id IS NULL AND form_version_id IS NULL))
);
--> statement-breakpoint
INSERT INTO loyalty_revisions(revision,enabled,daily_points,points_per_block,credit_paisa_per_block,reason,created_at) VALUES (0,0,10,100,1000,'Disabled migration defaults',0);
--> statement-breakpoint
INSERT INTO loyalty_config(id) VALUES ('default');
--> statement-breakpoint
CREATE TABLE loyalty_accounts (
 user_id VARCHAR(191) PRIMARY KEY REFERENCES users(id),
 balance_points INTEGER NOT NULL DEFAULT 0 CHECK(typeof(balance_points)='integer' AND balance_points BETWEEN 0 AND 9007199254740991),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 253402300799999)
);
--> statement-breakpoint
CREATE TABLE loyalty_daily_claims (
 id VARCHAR(191) PRIMARY KEY,
 user_id VARCHAR(191) NOT NULL REFERENCES loyalty_accounts(user_id), actor_id VARCHAR(191) NOT NULL REFERENCES users(id),
 request_id VARCHAR(191) NOT NULL CHECK(length(request_id) BETWEEN 1 AND 191),
 payload_digest VARCHAR(64) NOT NULL CHECK(length(payload_digest)=64 AND payload_digest NOT GLOB '*[^a-f0-9]*'),
 revision INTEGER NOT NULL REFERENCES loyalty_revisions(revision),
 local_date VARCHAR(10) NOT NULL CHECK(length(local_date)=10),
 awarded_points INTEGER NOT NULL CHECK(typeof(awarded_points)='integer' AND awarded_points BETWEEN 1 AND 9007199254740991),
 response_json TEXT NOT NULL CHECK(json_valid(response_json) AND json_type(response_json)='object'),
 form_version_id VARCHAR(191) NOT NULL CHECK(length(form_version_id) BETWEEN 1 AND 191),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 253402300799999),
 UNIQUE(user_id,local_date), UNIQUE(user_id,request_id), CHECK(actor_id=user_id)
);
--> statement-breakpoint
CREATE TABLE loyalty_redemptions (
 id VARCHAR(191) PRIMARY KEY,
 user_id VARCHAR(191) NOT NULL REFERENCES loyalty_accounts(user_id), actor_id VARCHAR(191) NOT NULL REFERENCES users(id),
 request_id VARCHAR(191) NOT NULL CHECK(length(request_id) BETWEEN 1 AND 191),
 payload_digest VARCHAR(64) NOT NULL CHECK(length(payload_digest)=64 AND payload_digest NOT GLOB '*[^a-f0-9]*'),
 revision INTEGER NOT NULL REFERENCES loyalty_revisions(revision),
 points INTEGER NOT NULL CHECK(typeof(points)='integer' AND points BETWEEN 1 AND 9007199254740991),
 credit_paisa INTEGER NOT NULL CHECK(typeof(credit_paisa)='integer' AND credit_paisa BETWEEN 1 AND 9007199254740991),
 response_json TEXT NOT NULL CHECK(json_valid(response_json) AND json_type(response_json)='object'),
 form_version_id VARCHAR(191) NOT NULL CHECK(length(form_version_id) BETWEEN 1 AND 191),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 253402300799999),
 UNIQUE(user_id,request_id), CHECK(actor_id=user_id)
);
--> statement-breakpoint
CREATE TABLE loyalty_points_entries (
 id VARCHAR(191) PRIMARY KEY, user_id VARCHAR(191) NOT NULL REFERENCES loyalty_accounts(user_id),
 points INTEGER NOT NULL CHECK(typeof(points)='integer' AND points BETWEEN -9007199254740991 AND 9007199254740991 AND points<>0),
 kind VARCHAR(32) NOT NULL CHECK(kind IN ('daily_claim','redemption')),
 claim_id VARCHAR(191) UNIQUE REFERENCES loyalty_daily_claims(id), redemption_id VARCHAR(191) UNIQUE REFERENCES loyalty_redemptions(id),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 253402300799999),
 CHECK((kind='daily_claim' AND points>0 AND claim_id IS NOT NULL AND redemption_id IS NULL) OR (kind='redemption' AND points<0 AND redemption_id IS NOT NULL AND claim_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE loyalty_day_issuance (
 local_date VARCHAR(10) PRIMARY KEY CHECK(length(local_date)=10),
 issued_points INTEGER NOT NULL CHECK(typeof(issued_points)='integer' AND issued_points BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
CREATE INDEX idx_loyalty_claims_user ON loyalty_daily_claims(user_id,created_at,id);
--> statement-breakpoint
CREATE INDEX idx_loyalty_redemptions_user ON loyalty_redemptions(user_id,created_at,id);
--> statement-breakpoint
CREATE INDEX idx_loyalty_entries_user ON loyalty_points_entries(user_id,created_at,id);
--> statement-breakpoint
CREATE TABLE wallet_entries_loyalty_new (
 id VARCHAR(191) PRIMARY KEY,
 user_id VARCHAR(191) NOT NULL REFERENCES wallet_accounts(user_id), order_id VARCHAR(191) REFERENCES orders(id),
 amount_paisa INTEGER NOT NULL CHECK(typeof(amount_paisa)='integer' AND amount_paisa BETWEEN -9007199254740991 AND 9007199254740991 AND amount_paisa<>0),
 platform_amount_paisa INTEGER NOT NULL CHECK(typeof(platform_amount_paisa)='integer' AND platform_amount_paisa BETWEEN -9007199254740991 AND 9007199254740991),
 kind VARCHAR(32) NOT NULL CHECK(kind IN ('referral_reward','order_spend','cancellation','refund','gift_card','loyalty_redemption')),
 gift_card_id VARCHAR(191) UNIQUE REFERENCES gift_cards(id), created_at BIGINT NOT NULL,
 loyalty_redemption_id VARCHAR(191) UNIQUE REFERENCES loyalty_redemptions(id),
 CHECK((kind='gift_card' AND order_id IS NULL AND gift_card_id IS NOT NULL AND loyalty_redemption_id IS NULL)
 OR (kind='loyalty_redemption' AND order_id IS NULL AND gift_card_id IS NULL AND loyalty_redemption_id IS NOT NULL)
 OR (kind NOT IN ('gift_card','loyalty_redemption') AND order_id IS NOT NULL AND gift_card_id IS NULL AND loyalty_redemption_id IS NULL)),
 CHECK(amount_paisa+platform_amount_paisa=0),
 CHECK((kind='order_spend' AND amount_paisa<0) OR (kind<>'order_spend' AND amount_paisa>0))
);
--> statement-breakpoint
-- Copy before balance triggers are installed: historical rows never post a second credit.
INSERT INTO wallet_entries_loyalty_new(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,gift_card_id,created_at) SELECT id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,gift_card_id,created_at FROM wallet_entries;
--> statement-breakpoint
DROP TRIGGER wallet_cancel_restore;
--> statement-breakpoint
DROP TRIGGER wallet_refund_restore;
--> statement-breakpoint
DROP TABLE wallet_entries;
--> statement-breakpoint
ALTER TABLE wallet_entries_loyalty_new RENAME TO wallet_entries;
--> statement-breakpoint
CREATE INDEX idx_wallet_entries_user ON wallet_entries(user_id,created_at);
--> statement-breakpoint
CREATE TRIGGER wallet_entry_balance AFTER INSERT ON wallet_entries FOR EACH ROW BEGIN UPDATE wallet_accounts SET balance_paisa=balance_paisa+NEW.amount_paisa WHERE user_id=NEW.user_id; END;
--> statement-breakpoint
CREATE TRIGGER wallet_entry_safe_balance BEFORE INSERT ON wallet_entries FOR EACH ROW WHEN NEW.amount_paisa>9007199254740991-(SELECT balance_paisa FROM wallet_accounts WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'wallet_balance_overflow'); END;
--> statement-breakpoint
CREATE TRIGGER wallet_entry_no_update BEFORE UPDATE ON wallet_entries FOR EACH ROW BEGIN SELECT RAISE(ABORT,'wallet_entries_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER wallet_entry_no_delete BEFORE DELETE ON wallet_entries FOR EACH ROW BEGIN SELECT RAISE(ABORT,'wallet_entries_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER wallet_gift_source_guard BEFORE INSERT ON wallet_entries WHEN NEW.kind='gift_card' AND NOT EXISTS(SELECT 1 FROM gift_cards WHERE id=NEW.gift_card_id AND redeemed_by=NEW.user_id AND amount_paisa=NEW.amount_paisa) BEGIN SELECT RAISE(ABORT,'gift_card_source_mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER wallet_loyalty_source_guard BEFORE INSERT ON wallet_entries WHEN NEW.kind='loyalty_redemption' AND NOT EXISTS(SELECT 1 FROM loyalty_redemptions r JOIN loyalty_points_entries e ON e.redemption_id=r.id WHERE r.id=NEW.loyalty_redemption_id AND r.user_id=NEW.user_id AND r.credit_paisa=NEW.amount_paisa AND e.user_id=r.user_id AND e.points=-r.points AND NEW.id='loyalty:'||r.id AND NEW.created_at=r.created_at) BEGIN SELECT RAISE(ABORT,'loyalty_source_mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER wallet_cancel_restore AFTER UPDATE ON orders FOR EACH ROW WHEN NEW.status='cancelled' AND OLD.status<>'cancelled' BEGIN
INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
SELECT 'cancel:'||NEW.id,NEW.customer_id,NEW.id,NEW.wallet_credit_paisa-COALESCE(SUM(amount_paisa),0),-(NEW.wallet_credit_paisa-COALESCE(SUM(amount_paisa),0)),'cancellation',NEW.updated_at FROM wallet_entries WHERE order_id=NEW.id AND kind IN ('cancellation','refund') HAVING NEW.wallet_credit_paisa>COALESCE(SUM(amount_paisa),0);
END;
--> statement-breakpoint
CREATE TRIGGER wallet_refund_restore AFTER UPDATE ON refunds FOR EACH ROW WHEN NEW.status = 'paid' AND OLD.status <> 'paid' AND NEW.wallet_credit_paisa > 0 BEGIN INSERT INTO wallet_entries (id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
 SELECT 'refund:' || NEW.id, customer_id, id, NEW.wallet_credit_paisa, -NEW.wallet_credit_paisa, 'refund', NEW.processed_at FROM orders WHERE id = NEW.order_id; END;
--> statement-breakpoint
CREATE TRIGGER loyalty_revision_limits BEFORE INSERT ON loyalty_revisions FOR EACH ROW WHEN NEW.revision>0 AND (
 ((SELECT issued_points FROM loyalty_config)>0 AND (NEW.points_per_block<>(SELECT locked_points_per_block FROM loyalty_config) OR NEW.credit_paisa_per_block<>(SELECT locked_credit_paisa_per_block FROM loyalty_config)))
 OR (NEW.lifetime_budget_points IS NOT NULL AND NEW.lifetime_budget_points<(SELECT issued_points FROM loyalty_config))
 OR (NEW.daily_budget_points IS NOT NULL AND NEW.daily_budget_points<COALESCE((SELECT MAX(issued_points) FROM loyalty_day_issuance),0))) BEGIN SELECT RAISE(ABORT,'loyalty_terms_below_consumed'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_config_guard BEFORE UPDATE ON loyalty_config FOR EACH ROW WHEN NEW.id<>OLD.id OR NEW.version<OLD.version
 OR NOT EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=NEW.current_revision)
 OR (NEW.draft_revision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=NEW.draft_revision))
 OR NEW.issued_points<>COALESCE((SELECT SUM(awarded_points) FROM loyalty_daily_claims),0)
 OR NEW.redeemed_points<>COALESCE((SELECT SUM(points) FROM loyalty_redemptions),0)
 OR NEW.credited_paisa<>COALESCE((SELECT SUM(credit_paisa) FROM loyalty_redemptions),0)
 OR (OLD.issued_points>0 AND (NEW.locked_points_per_block<>OLD.locked_points_per_block OR NEW.locked_credit_paisa_per_block<>OLD.locked_credit_paisa_per_block))
 OR (NEW.issued_points>0 AND NOT EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=NEW.current_revision AND points_per_block=NEW.locked_points_per_block AND credit_paisa_per_block=NEW.locked_credit_paisa_per_block))
 OR EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=NEW.current_revision AND ((lifetime_budget_points IS NOT NULL AND lifetime_budget_points<NEW.issued_points) OR (daily_budget_points IS NOT NULL AND daily_budget_points<COALESCE((SELECT MAX(issued_points) FROM loyalty_day_issuance),0)))) BEGIN SELECT RAISE(ABORT,'loyalty_config_changed'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_accounts_initial BEFORE INSERT ON loyalty_accounts FOR EACH ROW WHEN NEW.balance_points<>0 BEGIN SELECT RAISE(ABORT,'loyalty_initial_balance'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_accounts_guard BEFORE UPDATE ON loyalty_accounts FOR EACH ROW WHEN NEW.user_id<>OLD.user_id OR NEW.created_at<>OLD.created_at OR NEW.balance_points<>COALESCE((SELECT SUM(points) FROM loyalty_points_entries WHERE user_id=NEW.user_id),0) BEGIN SELECT RAISE(ABORT,'loyalty_account_changed'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_day_insert_guard BEFORE INSERT ON loyalty_day_issuance FOR EACH ROW WHEN NEW.issued_points<>COALESCE((SELECT SUM(awarded_points) FROM loyalty_daily_claims WHERE local_date=NEW.local_date),0) BEGIN SELECT RAISE(ABORT,'loyalty_day_changed'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_day_update_guard BEFORE UPDATE ON loyalty_day_issuance FOR EACH ROW WHEN NEW.local_date<>OLD.local_date OR NEW.issued_points<>COALESCE((SELECT SUM(awarded_points) FROM loyalty_daily_claims WHERE local_date=NEW.local_date),0) BEGIN SELECT RAISE(ABORT,'loyalty_day_changed'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_claim_guard BEFORE INSERT ON loyalty_daily_claims FOR EACH ROW WHEN
 NEW.local_date<>strftime('%Y-%m-%d',NEW.created_at/1000,'unixepoch','+5 hours','+45 minutes')
 OR NOT EXISTS(SELECT 1 FROM loyalty_config c JOIN loyalty_revisions r ON r.revision=c.current_revision JOIN users u ON u.id=NEW.user_id JOIN loyalty_accounts a ON a.user_id=u.id
 WHERE c.paused=0 AND r.enabled=1 AND r.revision=NEW.revision AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='customer')
 AND NEW.created_at>=r.starts_at AND NEW.created_at<r.ends_at AND NEW.awarded_points=r.daily_points
 AND NEW.awarded_points<=r.lifetime_budget_points-c.issued_points
 AND NEW.awarded_points<=r.daily_budget_points-COALESCE((SELECT issued_points FROM loyalty_day_issuance WHERE local_date=NEW.local_date),0)
 AND NEW.awarded_points<=9007199254740991-a.balance_points)
 OR json_extract(NEW.response_json,'$.claimId') IS NOT NEW.id OR json_extract(NEW.response_json,'$.localDate') IS NOT NEW.local_date
 OR json_type(NEW.response_json,'$.awardedPoints') IS NOT 'integer' OR json_extract(NEW.response_json,'$.awardedPoints') IS NOT NEW.awarded_points
 OR json_type(NEW.response_json,'$.balancePoints') IS NOT 'integer' OR json_extract(NEW.response_json,'$.balancePoints') IS NOT (SELECT balance_points+NEW.awarded_points FROM loyalty_accounts WHERE user_id=NEW.user_id)
 BEGIN SELECT RAISE(ABORT,'loyalty_claim_unavailable'); END;
--> statement-breakpoint
-- Posting order: source claim exists, points ledger balances account, day and singleton consume issuance.
CREATE TRIGGER loyalty_claim_post AFTER INSERT ON loyalty_daily_claims FOR EACH ROW BEGIN
 INSERT INTO loyalty_points_entries(id,user_id,points,kind,claim_id,created_at) VALUES ('claim:'||NEW.id,NEW.user_id,NEW.awarded_points,'daily_claim',NEW.id,NEW.created_at);
 UPDATE loyalty_day_issuance SET issued_points=issued_points+NEW.awarded_points WHERE local_date=NEW.local_date;
 INSERT INTO loyalty_day_issuance(local_date,issued_points) SELECT NEW.local_date,NEW.awarded_points WHERE NOT EXISTS(SELECT 1 FROM loyalty_day_issuance WHERE local_date=NEW.local_date);
 UPDATE loyalty_config SET issued_points=issued_points+NEW.awarded_points,locked_points_per_block=(SELECT points_per_block FROM loyalty_revisions WHERE revision=NEW.revision),locked_credit_paisa_per_block=(SELECT credit_paisa_per_block FROM loyalty_revisions WHERE revision=NEW.revision);
 END;
--> statement-breakpoint
CREATE TRIGGER loyalty_redemption_guard BEFORE INSERT ON loyalty_redemptions FOR EACH ROW WHEN
 NOT EXISTS(SELECT 1 FROM loyalty_config c JOIN loyalty_revisions r ON r.revision=c.current_revision JOIN users u ON u.id=NEW.user_id JOIN loyalty_accounts a ON a.user_id=u.id JOIN wallet_accounts w ON w.user_id=u.id
 WHERE r.revision=NEW.revision AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='customer')
 AND NEW.points<=a.balance_points AND NEW.points%r.points_per_block=0
 -- Division bounds the integer product before evaluating it; no floating-point financial conversion.
 AND NEW.points/r.points_per_block<=9007199254740991/r.credit_paisa_per_block
 AND NEW.credit_paisa=(NEW.points/r.points_per_block)*r.credit_paisa_per_block
 AND NEW.credit_paisa<=9007199254740991-w.balance_paisa AND NEW.credit_paisa<=9007199254740991-c.credited_paisa)
 OR json_extract(NEW.response_json,'$.redemptionId') IS NOT NEW.id
 OR json_type(NEW.response_json,'$.points') IS NOT 'integer' OR json_extract(NEW.response_json,'$.points') IS NOT NEW.points
 OR json_type(NEW.response_json,'$.creditPaisa') IS NOT 'integer' OR json_extract(NEW.response_json,'$.creditPaisa') IS NOT NEW.credit_paisa
 OR json_type(NEW.response_json,'$.balancePoints') IS NOT 'integer' OR json_extract(NEW.response_json,'$.balancePoints') IS NOT (SELECT balance_points-NEW.points FROM loyalty_accounts WHERE user_id=NEW.user_id)
 OR json_type(NEW.response_json,'$.walletBalancePaisa') IS NOT 'integer' OR json_extract(NEW.response_json,'$.walletBalancePaisa') IS NOT (SELECT balance_paisa+NEW.credit_paisa FROM wallet_accounts WHERE user_id=NEW.user_id)
 BEGIN SELECT RAISE(ABORT,'loyalty_redemption_invalid'); END;
--> statement-breakpoint
-- A source insert owns both ledgers; failure of wallet credit rolls back the source, debit, balances and counters.
CREATE TRIGGER loyalty_redemption_post AFTER INSERT ON loyalty_redemptions FOR EACH ROW BEGIN
 INSERT INTO loyalty_points_entries(id,user_id,points,kind,redemption_id,created_at) VALUES ('redeem:'||NEW.id,NEW.user_id,-NEW.points,'redemption',NEW.id,NEW.created_at);
 INSERT INTO wallet_entries(id,user_id,amount_paisa,platform_amount_paisa,kind,loyalty_redemption_id,created_at) VALUES ('loyalty:'||NEW.id,NEW.user_id,NEW.credit_paisa,-NEW.credit_paisa,'loyalty_redemption',NEW.id,NEW.created_at);
 UPDATE loyalty_config SET redeemed_points=redeemed_points+NEW.points,credited_paisa=credited_paisa+NEW.credit_paisa;
 END;
--> statement-breakpoint
CREATE TRIGGER loyalty_points_source_guard BEFORE INSERT ON loyalty_points_entries FOR EACH ROW WHEN
 (NEW.kind='daily_claim' AND NOT EXISTS(SELECT 1 FROM loyalty_daily_claims WHERE id=NEW.claim_id AND user_id=NEW.user_id AND awarded_points=NEW.points AND NEW.id='claim:'||id AND created_at=NEW.created_at))
 OR (NEW.kind='redemption' AND NOT EXISTS(SELECT 1 FROM loyalty_redemptions WHERE id=NEW.redemption_id AND user_id=NEW.user_id AND points=-NEW.points AND NEW.id='redeem:'||id AND created_at=NEW.created_at))
 BEGIN SELECT RAISE(ABORT,'loyalty_points_source_mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_points_balance AFTER INSERT ON loyalty_points_entries FOR EACH ROW BEGIN UPDATE loyalty_accounts SET balance_points=balance_points+NEW.points WHERE user_id=NEW.user_id; END;
--> statement-breakpoint
CREATE TRIGGER loyalty_revisions_no_update BEFORE UPDATE ON loyalty_revisions FOR EACH ROW BEGIN SELECT RAISE(ABORT,'loyalty_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_revisions_no_delete BEFORE DELETE ON loyalty_revisions FOR EACH ROW BEGIN SELECT RAISE(ABORT,'loyalty_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_points_entries_no_update BEFORE UPDATE ON loyalty_points_entries FOR EACH ROW BEGIN SELECT RAISE(ABORT,'loyalty_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_points_entries_no_delete BEFORE DELETE ON loyalty_points_entries FOR EACH ROW BEGIN SELECT RAISE(ABORT,'loyalty_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_daily_claims_no_update BEFORE UPDATE ON loyalty_daily_claims FOR EACH ROW BEGIN SELECT RAISE(ABORT,'loyalty_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_daily_claims_no_delete BEFORE DELETE ON loyalty_daily_claims FOR EACH ROW BEGIN SELECT RAISE(ABORT,'loyalty_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_redemptions_no_update BEFORE UPDATE ON loyalty_redemptions FOR EACH ROW BEGIN SELECT RAISE(ABORT,'loyalty_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_redemptions_no_delete BEFORE DELETE ON loyalty_redemptions FOR EACH ROW BEGIN SELECT RAISE(ABORT,'loyalty_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_config_no_delete BEFORE DELETE ON loyalty_config FOR EACH ROW BEGIN SELECT RAISE(ABORT,'loyalty_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_accounts_no_delete BEFORE DELETE ON loyalty_accounts FOR EACH ROW BEGIN SELECT RAISE(ABORT,'loyalty_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_day_issuance_no_delete BEFORE DELETE ON loyalty_day_issuance FOR EACH ROW BEGIN SELECT RAISE(ABORT,'loyalty_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_config_initial BEFORE INSERT ON loyalty_config FOR EACH ROW WHEN NEW.issued_points<>0 OR NEW.redeemed_points<>0 OR NEW.credited_paisa<>0 OR NEW.current_revision<>0 OR NEW.draft_revision IS NOT NULL BEGIN SELECT RAISE(ABORT,'loyalty_config_initial'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_config_no_replace BEFORE INSERT ON loyalty_config FOR EACH ROW WHEN EXISTS(SELECT 1 FROM loyalty_config WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'financial_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_revisions_no_replace BEFORE INSERT ON loyalty_revisions FOR EACH ROW WHEN EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=NEW.revision OR (NEW.created_by IS NOT NULL AND NEW.request_id IS NOT NULL AND created_by=NEW.created_by AND request_id=NEW.request_id)) BEGIN SELECT RAISE(ABORT,'financial_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER wallet_entries_no_replace BEFORE INSERT ON wallet_entries FOR EACH ROW WHEN EXISTS(SELECT 1 FROM wallet_entries WHERE id=NEW.id OR (NEW.gift_card_id IS NOT NULL AND gift_card_id=NEW.gift_card_id) OR (NEW.loyalty_redemption_id IS NOT NULL AND loyalty_redemption_id=NEW.loyalty_redemption_id)) BEGIN SELECT RAISE(ABORT,'financial_history_immutable'); END;
