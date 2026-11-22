-- Apply only to an approved copy with application writers stopped.
-- Existing review rows retain the historical rule and all evidence.
ALTER TABLE first_cod_reviews
  -- MariaDB attaches the old minimum to the column, so replace it in this ALTER.
  MODIFY COLUMN total_paisa BIGINT NOT NULL,
  ADD COLUMN hold_source VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'first_order',
  ADD CONSTRAINT chk_first_cod_hold_source CHECK (HEX(hold_source) IN (HEX('first_order'), HEX('customer_flag'))),
  ADD CONSTRAINT chk_first_cod_hold_total CHECK (
    total_paisa BETWEEN 0 AND 9007199254740991 AND (hold_source='customer_flag' OR total_paisa>=500000)
  );

DELIMITER $$
CREATE OR REPLACE TRIGGER first_cod_review_immutable BEFORE UPDATE ON first_cod_reviews FOR EACH ROW BEGIN
  IF OLD.status='confirmed' OR NEW.order_id<>OLD.order_id OR NEW.customer_id<>OLD.customer_id
    OR NEW.total_paisa<>OLD.total_paisa OR NEW.created_at<>OLD.created_at OR NEW.hold_source<>OLD.hold_source
  THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COD confirmation evidence is immutable'; END IF;
END$$
DELIMITER ;

-- Add the flag last so a copy lacking any earlier changes stays on the old path.
ALTER TABLE users ADD COLUMN cod_confirmation_required TINYINT UNSIGNED NOT NULL DEFAULT 0
  CHECK (cod_confirmation_required IN (0, 1));
