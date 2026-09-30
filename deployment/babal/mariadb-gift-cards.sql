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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE wallet_entries MODIFY COLUMN order_id VARCHAR(191) NULL;
-- ALTER ... ADD COLUMN ... REFERENCES restarts MariaDB's implicit FK names and
-- can also add another FK when IF NOT EXISTS skips an existing column. Separate
-- column creation from the named FK, retaining any equivalent legacy constraint.
ALTER TABLE wallet_entries ADD COLUMN IF NOT EXISTS gift_card_id VARCHAR(191) NULL;
SET @gift_card_fk_exists = (
 SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE k
 JOIN information_schema.REFERENTIAL_CONSTRAINTS r
  ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
 WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND k.TABLE_NAME='wallet_entries'
  AND k.COLUMN_NAME='gift_card_id' AND k.REFERENCED_TABLE_SCHEMA=DATABASE()
  AND k.REFERENCED_TABLE_NAME='gift_cards' AND k.REFERENCED_COLUMN_NAME='id'
  AND r.DELETE_RULE IN ('RESTRICT','NO ACTION') AND r.UPDATE_RULE IN ('RESTRICT','NO ACTION')
  AND NOT EXISTS (
   SELECT 1 FROM information_schema.KEY_COLUMN_USAGE other_key
   WHERE other_key.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND other_key.TABLE_NAME=k.TABLE_NAME
    AND other_key.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND other_key.ORDINAL_POSITION<>1
  )
);
SET @gift_card_fk_sql = IF(@gift_card_fk_exists>0,'SELECT 1','ALTER TABLE wallet_entries ADD CONSTRAINT wallet_entries_gift_card_fk FOREIGN KEY (gift_card_id) REFERENCES gift_cards(id)');
PREPARE gift_card_fk_statement FROM @gift_card_fk_sql;
EXECUTE gift_card_fk_statement;
DEALLOCATE PREPARE gift_card_fk_statement;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_entries_gift_card ON wallet_entries(gift_card_id);
-- The existing kind CHECK has a generated MariaDB name; remove only its exact known expression.
SET @gift_kind_check = (SELECT CONSTRAINT_NAME FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='wallet_entries' AND CHECK_CLAUSE LIKE '%kind%referral_reward%order_spend%cancellation%refund%' LIMIT 1);
SET @gift_kind_sql = IF(@gift_kind_check IS NULL,'SELECT 1',IF(@gift_kind_check='kind','ALTER TABLE wallet_entries MODIFY COLUMN kind VARCHAR(32) NOT NULL',CONCAT('ALTER TABLE wallet_entries DROP CONSTRAINT `',REPLACE(@gift_kind_check,'`','``'),'`')));
PREPARE gift_kind_statement FROM @gift_kind_sql;
EXECUTE gift_kind_statement;
DEALLOCATE PREPARE gift_kind_statement;
ALTER TABLE wallet_entries ADD CONSTRAINT IF NOT EXISTS chk_wallet_kind CHECK(kind IN ('referral_reward','order_spend','cancellation','refund','gift_card'));
ALTER TABLE wallet_entries ADD CONSTRAINT IF NOT EXISTS chk_wallet_gift_source CHECK((kind='gift_card' AND order_id IS NULL AND gift_card_id IS NOT NULL) OR (kind<>'gift_card' AND order_id IS NOT NULL AND gift_card_id IS NULL));
DROP TRIGGER IF EXISTS gift_card_no_delete;
DELIMITER $$
CREATE TRIGGER gift_card_no_delete BEFORE DELETE ON gift_cards FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='gift_cards_immutable'; END$$
DELIMITER ;
DROP TRIGGER IF EXISTS gift_card_update_guard;
DELIMITER $$
CREATE TRIGGER gift_card_update_guard BEFORE UPDATE ON gift_cards FOR EACH ROW BEGIN IF OLD.redeemed_by IS NOT NULL OR NEW.id<>OLD.id OR NEW.code_hash<>OLD.code_hash OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.issued_by<>OLD.issued_by OR NEW.issuance_request_id<>OLD.issuance_request_id OR NEW.issued_at<>OLD.issued_at THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='gift_cards_immutable'; END IF; END$$
DELIMITER ;
DROP TRIGGER IF EXISTS wallet_gift_source_guard;
DELIMITER $$
CREATE TRIGGER wallet_gift_source_guard BEFORE INSERT ON wallet_entries FOR EACH ROW BEGIN IF NEW.kind='gift_card' AND NOT EXISTS(SELECT 1 FROM gift_cards WHERE id=NEW.gift_card_id AND redeemed_by=NEW.user_id AND amount_paisa=NEW.amount_paisa) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='gift_card_source_mismatch'; END IF; END$$
DELIMITER ;
