-- Requires maintained referral/wallet, gift-card, partial-cancellation and promo migrations.

-- Trigger-owned posting: repositories insert sources only, never double-post ledgers/counters.

CREATE TABLE IF NOT EXISTS loyalty_config (
 id VARCHAR(32) PRIMARY KEY CHECK(BINARY id='default'),
 version BIGINT NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 current_revision BIGINT NOT NULL DEFAULT 0, draft_revision BIGINT,
 paused BIGINT NOT NULL DEFAULT 1 CHECK(paused IN (0,1)),
 issued_points BIGINT NOT NULL DEFAULT 0 CHECK(issued_points BETWEEN 0 AND 9007199254740991),
 redeemed_points BIGINT NOT NULL DEFAULT 0 CHECK(redeemed_points BETWEEN 0 AND issued_points),
 credited_paisa BIGINT NOT NULL DEFAULT 0 CHECK(credited_paisa BETWEEN 0 AND 9007199254740991),
 locked_points_per_block BIGINT, locked_credit_paisa_per_block BIGINT,
 CHECK((issued_points=0 AND locked_points_per_block IS NULL AND locked_credit_paisa_per_block IS NULL) OR (issued_points>0 AND locked_points_per_block IS NOT NULL AND locked_credit_paisa_per_block IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loyalty_revisions (
 revision BIGINT PRIMARY KEY CHECK(revision BETWEEN 0 AND 9007199254740991),
 enabled BIGINT NOT NULL CHECK(enabled IN (0,1)),
 daily_points BIGINT NOT NULL CHECK(daily_points BETWEEN 1 AND 9007199254740991),
 points_per_block BIGINT NOT NULL CHECK(points_per_block BETWEEN 1 AND 9007199254740991),
 credit_paisa_per_block BIGINT NOT NULL CHECK(credit_paisa_per_block BETWEEN 1 AND 9007199254740991),
 starts_at BIGINT CHECK(starts_at IS NULL OR (starts_at BETWEEN 0 AND 253402300799999)),
 ends_at BIGINT CHECK(ends_at IS NULL OR (ends_at BETWEEN 1 AND 253402300799999 AND starts_at IS NOT NULL AND ends_at>starts_at)),
 daily_budget_points BIGINT CHECK(daily_budget_points IS NULL OR (daily_budget_points BETWEEN daily_points AND 9007199254740991)),
 lifetime_budget_points BIGINT CHECK(lifetime_budget_points IS NULL OR (lifetime_budget_points BETWEEN daily_points AND 9007199254740991)),
 created_by VARCHAR(191) REFERENCES users(id), request_id VARCHAR(191) COLLATE utf8mb4_nopad_bin CHECK(request_id IS NULL OR CHAR_LENGTH(request_id) BETWEEN 1 AND 191),
 reason LONGTEXT NOT NULL CHECK(CHAR_LENGTH(trim(reason))>0), form_version_id VARCHAR(191),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 253402300799999),
 UNIQUE(created_by,request_id),
 CHECK(enabled=0 OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND daily_budget_points IS NOT NULL AND lifetime_budget_points IS NOT NULL)),
 CHECK(revision=0 OR (created_by IS NOT NULL AND request_id IS NOT NULL AND form_version_id IS NOT NULL)),
 CHECK(revision<>0 OR (enabled=0 AND created_by IS NULL AND request_id IS NULL AND form_version_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO loyalty_revisions(revision,enabled,daily_points,points_per_block,credit_paisa_per_block,reason,created_at) SELECT 0,0,10,100,1000,'Disabled migration defaults',0 WHERE NOT EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=0);

INSERT INTO loyalty_config(id) SELECT 'default' WHERE NOT EXISTS(SELECT 1 FROM loyalty_config WHERE id='default');

CREATE TABLE IF NOT EXISTS loyalty_accounts (
 user_id VARCHAR(191) PRIMARY KEY REFERENCES users(id),
 balance_points BIGINT NOT NULL DEFAULT 0 CHECK(balance_points BETWEEN 0 AND 9007199254740991),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 253402300799999)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loyalty_daily_claims (
 id VARCHAR(191) PRIMARY KEY,
 user_id VARCHAR(191) NOT NULL REFERENCES loyalty_accounts(user_id), actor_id VARCHAR(191) NOT NULL REFERENCES users(id),
 request_id VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL CHECK(CHAR_LENGTH(request_id) BETWEEN 1 AND 191),
 payload_digest VARCHAR(64) COLLATE utf8mb4_nopad_bin NOT NULL CHECK(CHAR_LENGTH(payload_digest)=64 AND BINARY payload_digest REGEXP '^[a-f0-9]{64}$'),
 revision BIGINT NOT NULL REFERENCES loyalty_revisions(revision),
 local_date VARCHAR(10) NOT NULL CHECK(CHAR_LENGTH(local_date)=10),
 awarded_points BIGINT NOT NULL CHECK(awarded_points BETWEEN 1 AND 9007199254740991),
 response_json LONGTEXT NOT NULL CHECK(json_valid(response_json) AND JSON_TYPE(response_json)='OBJECT'),
 form_version_id VARCHAR(191) NOT NULL CHECK(CHAR_LENGTH(form_version_id) BETWEEN 1 AND 191),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 253402300799999),
 UNIQUE(user_id,local_date), UNIQUE(user_id,request_id), CHECK(BINARY actor_id=BINARY user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loyalty_redemptions (
 id VARCHAR(191) PRIMARY KEY,
 user_id VARCHAR(191) NOT NULL REFERENCES loyalty_accounts(user_id), actor_id VARCHAR(191) NOT NULL REFERENCES users(id),
 request_id VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL CHECK(CHAR_LENGTH(request_id) BETWEEN 1 AND 191),
 payload_digest VARCHAR(64) COLLATE utf8mb4_nopad_bin NOT NULL CHECK(CHAR_LENGTH(payload_digest)=64 AND BINARY payload_digest REGEXP '^[a-f0-9]{64}$'),
 revision BIGINT NOT NULL REFERENCES loyalty_revisions(revision),
 points BIGINT NOT NULL CHECK(points BETWEEN 1 AND 9007199254740991),
 credit_paisa BIGINT NOT NULL CHECK(credit_paisa BETWEEN 1 AND 9007199254740991),
 response_json LONGTEXT NOT NULL CHECK(json_valid(response_json) AND JSON_TYPE(response_json)='OBJECT'),
 form_version_id VARCHAR(191) NOT NULL CHECK(CHAR_LENGTH(form_version_id) BETWEEN 1 AND 191),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 253402300799999),
 UNIQUE(user_id,request_id), CHECK(BINARY actor_id=BINARY user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loyalty_points_entries (
 id VARCHAR(191) PRIMARY KEY, user_id VARCHAR(191) NOT NULL REFERENCES loyalty_accounts(user_id),
 points BIGINT NOT NULL CHECK(points BETWEEN -9007199254740991 AND 9007199254740991 AND points<>0),
 kind VARCHAR(32) NOT NULL CHECK(BINARY kind IN ('daily_claim','redemption')),
 claim_id VARCHAR(191) UNIQUE REFERENCES loyalty_daily_claims(id), redemption_id VARCHAR(191) UNIQUE REFERENCES loyalty_redemptions(id),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 253402300799999),
 CHECK((BINARY kind='daily_claim' AND points>0 AND claim_id IS NOT NULL AND redemption_id IS NULL) OR (BINARY kind='redemption' AND points<0 AND redemption_id IS NOT NULL AND claim_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loyalty_day_issuance (
 local_date VARCHAR(10) PRIMARY KEY CHECK(CHAR_LENGTH(local_date)=10),
 issued_points BIGINT NOT NULL CHECK(issued_points BETWEEN 1 AND 9007199254740991)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_loyalty_claims_user ON loyalty_daily_claims(user_id,created_at,id);

CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_user ON loyalty_redemptions(user_id,created_at,id);

CREATE INDEX IF NOT EXISTS idx_loyalty_entries_user ON loyalty_points_entries(user_id,created_at,id);

-- Replace both restrictive gift-era checks; preserve gift uniqueness, conservation/sign and historical posting triggers.
ALTER TABLE wallet_entries ADD COLUMN IF NOT EXISTS loyalty_redemption_id VARCHAR(191) NULL, ADD FOREIGN KEY IF NOT EXISTS wallet_entries_loyalty_redemption_fk (loyalty_redemption_id) REFERENCES loyalty_redemptions(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_entries_loyalty ON wallet_entries(loyalty_redemption_id);
ALTER TABLE wallet_entries DROP CONSTRAINT IF EXISTS chk_wallet_kind;
ALTER TABLE wallet_entries DROP CONSTRAINT IF EXISTS chk_wallet_gift_source;
ALTER TABLE wallet_entries ADD CONSTRAINT IF NOT EXISTS chk_wallet_kind CHECK(BINARY kind IN ('referral_reward','order_spend','cancellation','refund','gift_card','loyalty_redemption'));
ALTER TABLE wallet_entries ADD CONSTRAINT IF NOT EXISTS chk_wallet_gift_source CHECK((kind='gift_card' AND order_id IS NULL AND gift_card_id IS NOT NULL AND loyalty_redemption_id IS NULL) OR (kind='loyalty_redemption' AND order_id IS NULL AND gift_card_id IS NULL AND loyalty_redemption_id IS NOT NULL) OR (kind NOT IN ('gift_card','loyalty_redemption') AND order_id IS NOT NULL AND gift_card_id IS NULL AND loyalty_redemption_id IS NULL));
ALTER TABLE wallet_entries ADD CONSTRAINT IF NOT EXISTS chk_wallet_safe_amount CHECK(amount_paisa BETWEEN -9007199254740991 AND 9007199254740991 AND platform_amount_paisa BETWEEN -9007199254740991 AND 9007199254740991);

DROP TRIGGER IF EXISTS wallet_entry_safe_balance;
DELIMITER $$
CREATE TRIGGER wallet_entry_safe_balance BEFORE INSERT ON wallet_entries FOR EACH ROW BEGIN IF NEW.amount_paisa>9007199254740991-(SELECT balance_paisa FROM wallet_accounts WHERE BINARY user_id=BINARY NEW.user_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='wallet_balance_overflow'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS wallet_loyalty_source_guard;
DELIMITER $$
CREATE TRIGGER wallet_loyalty_source_guard BEFORE INSERT ON wallet_entries FOR EACH ROW BEGIN IF BINARY NEW.kind='loyalty_redemption' AND NOT EXISTS(SELECT 1 FROM loyalty_redemptions r JOIN loyalty_points_entries e ON BINARY e.redemption_id=BINARY r.id WHERE BINARY r.id=BINARY NEW.loyalty_redemption_id AND BINARY r.user_id=BINARY NEW.user_id AND r.credit_paisa=NEW.amount_paisa AND BINARY e.user_id=BINARY r.user_id AND e.points=-r.points AND BINARY NEW.id=BINARY CONCAT('loyalty:',r.id) AND NEW.created_at=r.created_at) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_source_mismatch'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_revision_limits;
DELIMITER $$
CREATE TRIGGER loyalty_revision_limits BEFORE INSERT ON loyalty_revisions FOR EACH ROW BEGIN IF NEW.revision>0 AND (
 ((SELECT issued_points FROM loyalty_config)>0 AND (NEW.points_per_block<>(SELECT locked_points_per_block FROM loyalty_config) OR NEW.credit_paisa_per_block<>(SELECT locked_credit_paisa_per_block FROM loyalty_config)))
 OR (NEW.lifetime_budget_points IS NOT NULL AND NEW.lifetime_budget_points<(SELECT issued_points FROM loyalty_config))
 OR (NEW.daily_budget_points IS NOT NULL AND NEW.daily_budget_points<COALESCE((SELECT MAX(issued_points) FROM loyalty_day_issuance),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_terms_below_consumed'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_config_guard;
DELIMITER $$
CREATE TRIGGER loyalty_config_guard BEFORE UPDATE ON loyalty_config FOR EACH ROW BEGIN IF NOT(BINARY NEW.id <=> BINARY OLD.id) OR NEW.version<OLD.version
 OR NOT EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=NEW.current_revision)
 OR (NEW.draft_revision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=NEW.draft_revision))
 OR NEW.issued_points<>COALESCE((SELECT SUM(awarded_points) FROM loyalty_daily_claims),0)
 OR NEW.redeemed_points<>COALESCE((SELECT SUM(points) FROM loyalty_redemptions),0)
 OR NEW.credited_paisa<>COALESCE((SELECT SUM(credit_paisa) FROM loyalty_redemptions),0)
 OR (OLD.issued_points>0 AND (NEW.locked_points_per_block<>OLD.locked_points_per_block OR NEW.locked_credit_paisa_per_block<>OLD.locked_credit_paisa_per_block))
 OR (NEW.issued_points>0 AND NOT EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=NEW.current_revision AND points_per_block=NEW.locked_points_per_block AND credit_paisa_per_block=NEW.locked_credit_paisa_per_block))
 OR EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=NEW.current_revision AND ((lifetime_budget_points IS NOT NULL AND lifetime_budget_points<NEW.issued_points) OR (daily_budget_points IS NOT NULL AND daily_budget_points<COALESCE((SELECT MAX(issued_points) FROM loyalty_day_issuance),0)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_config_changed'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_accounts_initial;
DELIMITER $$
CREATE TRIGGER loyalty_accounts_initial BEFORE INSERT ON loyalty_accounts FOR EACH ROW BEGIN IF NEW.balance_points<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_initial_balance'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_accounts_guard;
DELIMITER $$
CREATE TRIGGER loyalty_accounts_guard BEFORE UPDATE ON loyalty_accounts FOR EACH ROW BEGIN IF NOT(BINARY NEW.user_id <=> BINARY OLD.user_id) OR NEW.created_at<>OLD.created_at OR NEW.balance_points<>COALESCE((SELECT SUM(points) FROM loyalty_points_entries WHERE BINARY user_id=BINARY NEW.user_id),0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_account_changed'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_day_insert_guard;
DELIMITER $$
CREATE TRIGGER loyalty_day_insert_guard BEFORE INSERT ON loyalty_day_issuance FOR EACH ROW BEGIN IF NEW.issued_points<>COALESCE((SELECT SUM(awarded_points) FROM loyalty_daily_claims WHERE local_date=NEW.local_date),0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_day_changed'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_day_update_guard;
DELIMITER $$
CREATE TRIGGER loyalty_day_update_guard BEFORE UPDATE ON loyalty_day_issuance FOR EACH ROW BEGIN IF NOT(BINARY NEW.local_date <=> BINARY OLD.local_date) OR NEW.issued_points<>COALESCE((SELECT SUM(awarded_points) FROM loyalty_daily_claims WHERE local_date=NEW.local_date),0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_day_changed'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_claim_guard;
DELIMITER $$
CREATE TRIGGER loyalty_claim_guard BEFORE INSERT ON loyalty_daily_claims FOR EACH ROW BEGIN IF NEW.local_date<>DATE_FORMAT(TIMESTAMPADD(SECOND, NEW.created_at DIV 1000+20700, '1970-01-01'),'%Y-%m-%d')
 OR NOT EXISTS(SELECT 1 FROM loyalty_config c JOIN loyalty_revisions r ON r.revision=c.current_revision JOIN users u ON BINARY u.id=BINARY NEW.user_id JOIN loyalty_accounts a ON a.user_id=u.id
 WHERE c.paused=0 AND r.enabled=1 AND r.revision=NEW.revision AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='customer')
 AND NEW.created_at>=r.starts_at AND NEW.created_at<r.ends_at AND NEW.awarded_points=r.daily_points
 AND NEW.awarded_points<=r.lifetime_budget_points-c.issued_points
 AND NEW.awarded_points<=r.daily_budget_points-COALESCE((SELECT issued_points FROM loyalty_day_issuance WHERE local_date=NEW.local_date),0)
 AND NEW.awarded_points<=9007199254740991-a.balance_points)
 OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.claimId')) <=> BINARY NEW.id) OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.localDate')) <=> BINARY NEW.local_date)
 OR NOT(BINARY JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.awardedPoints')) <=> BINARY 'INTEGER') OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.awardedPoints')) <=> BINARY NEW.awarded_points)
 OR NOT(BINARY JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.balancePoints')) <=> BINARY 'INTEGER') OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.balancePoints')) <=> BINARY (SELECT balance_points+NEW.awarded_points FROM loyalty_accounts WHERE BINARY user_id=BINARY NEW.user_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_claim_unavailable'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_claim_post;
DELIMITER $$
CREATE TRIGGER loyalty_claim_post AFTER INSERT ON loyalty_daily_claims FOR EACH ROW BEGIN INSERT INTO loyalty_points_entries(id,user_id,points,kind,claim_id,created_at) VALUES (CONCAT('claim:',NEW.id),NEW.user_id,NEW.awarded_points,'daily_claim',NEW.id,NEW.created_at);
 UPDATE loyalty_day_issuance SET issued_points=issued_points+NEW.awarded_points WHERE local_date=NEW.local_date;
 INSERT INTO loyalty_day_issuance(local_date,issued_points) SELECT NEW.local_date,NEW.awarded_points WHERE NOT EXISTS(SELECT 1 FROM loyalty_day_issuance WHERE local_date=NEW.local_date);
 UPDATE loyalty_config SET issued_points=issued_points+NEW.awarded_points,locked_points_per_block=(SELECT points_per_block FROM loyalty_revisions WHERE revision=NEW.revision),locked_credit_paisa_per_block=(SELECT credit_paisa_per_block FROM loyalty_revisions WHERE revision=NEW.revision);
 END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_redemption_guard;
DELIMITER $$
CREATE TRIGGER loyalty_redemption_guard BEFORE INSERT ON loyalty_redemptions FOR EACH ROW BEGIN IF NOT EXISTS(SELECT 1 FROM loyalty_config c JOIN loyalty_revisions r ON r.revision=c.current_revision JOIN users u ON BINARY u.id=BINARY NEW.user_id JOIN loyalty_accounts a ON a.user_id=u.id JOIN wallet_accounts w ON w.user_id=u.id
 WHERE r.revision=NEW.revision AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='customer')
 AND NEW.points<=a.balance_points AND NEW.points%r.points_per_block=0
 -- Division bounds the integer product before evaluating it; no floating-point financial conversion.
 AND NEW.points DIV r.points_per_block<=9007199254740991 DIV r.credit_paisa_per_block
 AND NEW.credit_paisa=(NEW.points DIV r.points_per_block)*r.credit_paisa_per_block
 AND NEW.credit_paisa<=9007199254740991-w.balance_paisa AND NEW.credit_paisa<=9007199254740991-c.credited_paisa)
 OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.redemptionId')) <=> BINARY NEW.id)
 OR NOT(BINARY JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.points')) <=> BINARY 'INTEGER') OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.points')) <=> BINARY NEW.points)
 OR NOT(BINARY JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.creditPaisa')) <=> BINARY 'INTEGER') OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.creditPaisa')) <=> BINARY NEW.credit_paisa)
 OR NOT(BINARY JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.balancePoints')) <=> BINARY 'INTEGER') OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.balancePoints')) <=> BINARY (SELECT balance_points-NEW.points FROM loyalty_accounts WHERE BINARY user_id=BINARY NEW.user_id))
 OR NOT(BINARY JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.walletBalancePaisa')) <=> BINARY 'INTEGER') OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.walletBalancePaisa')) <=> BINARY (SELECT balance_paisa+NEW.credit_paisa FROM wallet_accounts WHERE BINARY user_id=BINARY NEW.user_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_redemption_invalid'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_redemption_post;
DELIMITER $$
CREATE TRIGGER loyalty_redemption_post AFTER INSERT ON loyalty_redemptions FOR EACH ROW BEGIN INSERT INTO loyalty_points_entries(id,user_id,points,kind,redemption_id,created_at) VALUES (CONCAT('redeem:',NEW.id),NEW.user_id,-NEW.points,'redemption',NEW.id,NEW.created_at);
 INSERT INTO wallet_entries(id,user_id,amount_paisa,platform_amount_paisa,kind,loyalty_redemption_id,created_at) VALUES (CONCAT('loyalty:',NEW.id),NEW.user_id,NEW.credit_paisa,-NEW.credit_paisa,'loyalty_redemption',NEW.id,NEW.created_at);
 UPDATE loyalty_config SET redeemed_points=redeemed_points+NEW.points,credited_paisa=credited_paisa+NEW.credit_paisa;
 END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_points_source_guard;
DELIMITER $$
CREATE TRIGGER loyalty_points_source_guard BEFORE INSERT ON loyalty_points_entries FOR EACH ROW BEGIN IF (BINARY NEW.kind='daily_claim' AND NOT EXISTS(SELECT 1 FROM loyalty_daily_claims WHERE BINARY id=BINARY NEW.claim_id AND BINARY user_id=BINARY NEW.user_id AND awarded_points=NEW.points AND BINARY NEW.id=BINARY CONCAT('claim:',id) AND created_at=NEW.created_at))
 OR (BINARY NEW.kind='redemption' AND NOT EXISTS(SELECT 1 FROM loyalty_redemptions WHERE BINARY id=BINARY NEW.redemption_id AND BINARY user_id=BINARY NEW.user_id AND points=-NEW.points AND BINARY NEW.id=BINARY CONCAT('redeem:',id) AND created_at=NEW.created_at)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_points_source_mismatch'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_points_balance;
DELIMITER $$
CREATE TRIGGER loyalty_points_balance AFTER INSERT ON loyalty_points_entries FOR EACH ROW BEGIN UPDATE loyalty_accounts SET balance_points=balance_points+NEW.points WHERE BINARY user_id=BINARY NEW.user_id; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_revisions_no_update;
DELIMITER $$
CREATE TRIGGER loyalty_revisions_no_update BEFORE UPDATE ON loyalty_revisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_revisions_no_delete;
DELIMITER $$
CREATE TRIGGER loyalty_revisions_no_delete BEFORE DELETE ON loyalty_revisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_points_entries_no_update;
DELIMITER $$
CREATE TRIGGER loyalty_points_entries_no_update BEFORE UPDATE ON loyalty_points_entries FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_points_entries_no_delete;
DELIMITER $$
CREATE TRIGGER loyalty_points_entries_no_delete BEFORE DELETE ON loyalty_points_entries FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_daily_claims_no_update;
DELIMITER $$
CREATE TRIGGER loyalty_daily_claims_no_update BEFORE UPDATE ON loyalty_daily_claims FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_daily_claims_no_delete;
DELIMITER $$
CREATE TRIGGER loyalty_daily_claims_no_delete BEFORE DELETE ON loyalty_daily_claims FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_redemptions_no_update;
DELIMITER $$
CREATE TRIGGER loyalty_redemptions_no_update BEFORE UPDATE ON loyalty_redemptions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_redemptions_no_delete;
DELIMITER $$
CREATE TRIGGER loyalty_redemptions_no_delete BEFORE DELETE ON loyalty_redemptions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_config_no_delete;
DELIMITER $$
CREATE TRIGGER loyalty_config_no_delete BEFORE DELETE ON loyalty_config FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_retained'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_accounts_no_delete;
DELIMITER $$
CREATE TRIGGER loyalty_accounts_no_delete BEFORE DELETE ON loyalty_accounts FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_retained'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_day_issuance_no_delete;
DELIMITER $$
CREATE TRIGGER loyalty_day_issuance_no_delete BEFORE DELETE ON loyalty_day_issuance FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_retained'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_config_initial;
DELIMITER $$
CREATE TRIGGER loyalty_config_initial BEFORE INSERT ON loyalty_config FOR EACH ROW BEGIN IF NEW.issued_points<>0 OR NEW.redeemed_points<>0 OR NEW.credited_paisa<>0 OR NEW.current_revision<>0 OR NEW.draft_revision IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_config_initial'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_config_no_replace;
DELIMITER $$
CREATE TRIGGER loyalty_config_no_replace BEFORE INSERT ON loyalty_config FOR EACH ROW BEGIN IF EXISTS(SELECT 1 FROM loyalty_config WHERE id=NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='financial_history_immutable'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_revisions_no_replace;
DELIMITER $$
CREATE TRIGGER loyalty_revisions_no_replace BEFORE INSERT ON loyalty_revisions FOR EACH ROW BEGIN IF EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=NEW.revision OR (NEW.created_by IS NOT NULL AND NEW.request_id IS NOT NULL AND BINARY created_by=BINARY NEW.created_by AND BINARY request_id=BINARY NEW.request_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='financial_history_immutable'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS wallet_entries_no_replace;
DELIMITER $$
CREATE TRIGGER wallet_entries_no_replace BEFORE INSERT ON wallet_entries FOR EACH ROW BEGIN IF EXISTS(SELECT 1 FROM wallet_entries WHERE id=NEW.id OR (NEW.gift_card_id IS NOT NULL AND BINARY gift_card_id=BINARY NEW.gift_card_id) OR (NEW.loyalty_redemption_id IS NOT NULL AND BINARY loyalty_redemption_id=BINARY NEW.loyalty_redemption_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='financial_history_immutable'; END IF; END$$
DELIMITER ;

-- Weekly loyalty cycle extension
-- Additive and repeatable: legacy revisions/claims retain NULL cycle metadata.
ALTER TABLE loyalty_revisions ADD COLUMN IF NOT EXISTS weekly_points_json LONGTEXT NULL CHECK(weekly_points_json IS NULL OR JSON_VALID(weekly_points_json)), ADD COLUMN IF NOT EXISTS grace_enabled BIGINT NOT NULL DEFAULT 0 CHECK(grace_enabled IN (0,1));
ALTER TABLE loyalty_daily_claims ADD COLUMN IF NOT EXISTS cycle_day BIGINT NULL CHECK(cycle_day IS NULL OR cycle_day BETWEEN 1 AND 7),
 ADD COLUMN IF NOT EXISTS cycle_number BIGINT NULL CHECK(cycle_number IS NULL OR cycle_number BETWEEN 1 AND 9007199254740991),
 ADD COLUMN IF NOT EXISTS grace_used BIGINT NULL CHECK(grace_used IS NULL OR grace_used IN (0,1)),
 ADD COLUMN IF NOT EXISTS grace_applied BIGINT NULL CHECK(grace_applied IS NULL OR grace_applied IN (0,1)),
 ADD COLUMN IF NOT EXISTS cycle_reset_reason VARCHAR(32) COLLATE utf8mb4_bin NULL CHECK(cycle_reset_reason IS NULL OR BINARY cycle_reset_reason IN ('first_claim','missed_day','cycle_complete'));
CREATE INDEX IF NOT EXISTS idx_loyalty_claims_calendar ON loyalty_daily_claims(user_id,local_date);
CREATE OR REPLACE VIEW loyalty_latest_claims AS SELECT d.* FROM loyalty_daily_claims d WHERE NOT EXISTS(SELECT 1 FROM loyalty_daily_claims newer WHERE BINARY newer.user_id=BINARY d.user_id AND newer.local_date>d.local_date);

DROP TRIGGER IF EXISTS loyalty_weekly_revision_guard;
DELIMITER $$
CREATE TRIGGER loyalty_weekly_revision_guard BEFORE INSERT ON loyalty_revisions FOR EACH ROW BEGIN
 DECLARE day_index INT DEFAULT 0;
 DECLARE prior_points DECIMAL(30,0) DEFAULT 0;
 DECLARE next_points DECIMAL(30,0);
 DECLARE cycle_total DECIMAL(40,0) DEFAULT 0;
 IF NEW.weekly_points_json IS NULL THEN
  IF NEW.grace_enabled<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_weekly_terms_invalid'; END IF;
 ELSE
  IF JSON_VALID(NEW.weekly_points_json)<>1 OR NOT(JSON_TYPE(NEW.weekly_points_json)<=>'ARRAY') OR JSON_LENGTH(NEW.weekly_points_json)<>7 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_weekly_terms_invalid'; END IF;
  WHILE day_index<7 DO
   IF NOT(JSON_TYPE(JSON_EXTRACT(NEW.weekly_points_json,CONCAT('$[',day_index,']')))<=>'INTEGER') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_weekly_terms_invalid'; END IF;
   SET next_points=CAST(JSON_UNQUOTE(JSON_EXTRACT(NEW.weekly_points_json,CONCAT('$[',day_index,']'))) AS DECIMAL(30,0));
   IF next_points<=prior_points OR next_points>9007199254740991 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_weekly_terms_invalid'; END IF;
   IF day_index=0 AND NEW.daily_points<>next_points THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_weekly_terms_invalid'; END IF;
   SET cycle_total=cycle_total+next_points;
   SET prior_points=next_points;
   SET day_index=day_index+1;
  END WHILE;
  IF cycle_total>9007199254740991 OR NEW.daily_budget_points IS NULL OR NEW.daily_budget_points<prior_points OR NEW.lifetime_budget_points IS NULL OR NEW.lifetime_budget_points<prior_points THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_weekly_terms_invalid'; END IF;
 END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_claim_guard;
DELIMITER $$
CREATE TRIGGER loyalty_claim_guard BEFORE INSERT ON loyalty_daily_claims FOR EACH ROW BEGIN IF NEW.local_date<>DATE_FORMAT(TIMESTAMPADD(SECOND, NEW.created_at DIV 1000+20700, '1970-01-01'),'%Y-%m-%d')
 OR NOT EXISTS(SELECT 1 FROM loyalty_config c JOIN loyalty_revisions r ON r.revision=c.current_revision JOIN users u ON BINARY u.id=BINARY NEW.user_id JOIN loyalty_accounts a ON a.user_id=u.id
 WHERE c.paused=0 AND r.enabled=1 AND r.revision=NEW.revision AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='customer')
 AND NEW.created_at>=r.starts_at AND NEW.created_at<r.ends_at AND NEW.awarded_points=CASE WHEN r.weekly_points_json IS NULL THEN r.daily_points ELSE CAST(JSON_UNQUOTE(JSON_EXTRACT(r.weekly_points_json,CONCAT('$[',NEW.cycle_day-1,']'))) AS UNSIGNED) END
 AND NEW.awarded_points<=r.lifetime_budget_points-c.issued_points
 AND NEW.awarded_points<=r.daily_budget_points-COALESCE((SELECT issued_points FROM loyalty_day_issuance WHERE local_date=NEW.local_date),0)
 AND NEW.awarded_points<=9007199254740991-a.balance_points)
 OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.claimId')) <=> BINARY NEW.id) OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.localDate')) <=> BINARY NEW.local_date)
 OR NOT(BINARY JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.awardedPoints')) <=> BINARY 'INTEGER') OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.awardedPoints')) <=> BINARY NEW.awarded_points)
 OR NOT(BINARY JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.balancePoints')) <=> BINARY 'INTEGER') OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.balancePoints')) <=> BINARY (SELECT balance_points+NEW.awarded_points FROM loyalty_accounts WHERE BINARY user_id=BINARY NEW.user_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_claim_unavailable'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_weekly_claim_guard;
DELIMITER $$
CREATE TRIGGER loyalty_weekly_claim_guard BEFORE INSERT ON loyalty_daily_claims FOR EACH ROW BEGIN IF NOT EXISTS(
 SELECT 1 FROM loyalty_config c JOIN loyalty_revisions r ON r.revision=c.current_revision LEFT JOIN loyalty_latest_claims p ON BINARY p.user_id=BINARY NEW.user_id
 WHERE c.id='default' AND r.revision=NEW.revision AND (
  (r.weekly_points_json IS NULL AND NEW.cycle_day IS NULL AND NEW.cycle_number IS NULL AND NEW.grace_used IS NULL AND NEW.grace_applied IS NULL AND NEW.cycle_reset_reason IS NULL AND JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle')) IS NULL)
  OR (r.weekly_points_json IS NOT NULL AND (p.local_date IS NULL OR NEW.local_date>p.local_date)
   AND NEW.cycle_day=CASE WHEN ((DATEDIFF(NEW.local_date,p.local_date)=1 AND p.cycle_day<7) OR (DATEDIFF(NEW.local_date,p.local_date)=2 AND r.grace_enabled=1 AND p.grace_used=0 AND p.cycle_day<7)) THEN p.cycle_day+1 ELSE 1 END
   AND NEW.cycle_number=CASE WHEN p.cycle_day IS NULL THEN 1 WHEN ((DATEDIFF(NEW.local_date,p.local_date)=1 AND p.cycle_day<7) OR (DATEDIFF(NEW.local_date,p.local_date)=2 AND r.grace_enabled=1 AND p.grace_used=0 AND p.cycle_day<7)) THEN p.cycle_number ELSE p.cycle_number+1 END
   AND NEW.grace_used=CASE WHEN (DATEDIFF(NEW.local_date,p.local_date)=2 AND r.grace_enabled=1 AND p.grace_used=0 AND p.cycle_day<7) THEN 1 WHEN (DATEDIFF(NEW.local_date,p.local_date)=1 AND p.cycle_day<7) THEN p.grace_used ELSE 0 END
   AND NEW.grace_applied=CASE WHEN (DATEDIFF(NEW.local_date,p.local_date)=2 AND r.grace_enabled=1 AND p.grace_used=0 AND p.cycle_day<7) THEN 1 ELSE 0 END
   AND (BINARY NEW.cycle_reset_reason <=> BINARY CASE WHEN p.cycle_day IS NULL THEN 'first_claim' WHEN ((DATEDIFF(NEW.local_date,p.local_date)=1 AND p.cycle_day<7) OR (DATEDIFF(NEW.local_date,p.local_date)=2 AND r.grace_enabled=1 AND p.grace_used=0 AND p.cycle_day<7)) THEN NULL WHEN DATEDIFF(NEW.local_date,p.local_date)=1 AND p.cycle_day=7 THEN 'cycle_complete' ELSE 'missed_day' END)
   AND JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle'))='OBJECT'
   AND JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle.day'))='INTEGER' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.cycle.day')) AS UNSIGNED)=NEW.cycle_day
   AND JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle.number'))='INTEGER' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.cycle.number')) AS UNSIGNED)=NEW.cycle_number
   AND JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle.graceUsed'))='BOOLEAN' AND BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.cycle.graceUsed'))=BINARY IF(NEW.grace_used=1,'true','false')
   AND JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle.graceApplied'))='BOOLEAN' AND BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.cycle.graceApplied'))=BINARY IF(NEW.grace_applied=1,'true','false')
   AND JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle.resetReason')) IN ('NULL','STRING') AND (BINARY (CASE WHEN JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle.resetReason'))='NULL' THEN NULL ELSE JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.cycle.resetReason')) END) <=> BINARY NEW.cycle_reset_reason)
   AND JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle.lastClaimDate')) IN ('NULL','STRING') AND (BINARY (CASE WHEN JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle.lastClaimDate'))='NULL' THEN NULL ELSE JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.cycle.lastClaimDate')) END) <=> BINARY p.local_date)
  )
 )) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_weekly_claim_invalid'; END IF; END$$
DELIMITER ;
