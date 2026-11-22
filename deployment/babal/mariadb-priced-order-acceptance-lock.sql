-- Inspect exact installed definitions before each additive companion.
-- An already installed object with the reviewed definition is retained.
DELIMITER $$
BEGIN NOT ATOMIC
  IF DATABASE() IS NULL OR @@FOREIGN_KEY_CHECKS<>1 OR @@check_constraint_checks<>1 OR @@SESSION.sql_mode LIKE '%NO_BACKSLASH_ESCAPES%' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_session';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='priced_order_acceptance_insert') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='priced_order_acceptance_insert') <=> '04aaad92ca7c9f8708f29bd0b8a87286f2a057f2993dd4a13fe40f9695e24493') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_priced_order_acceptance_insert';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='priced_order_acceptance_update') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='priced_order_acceptance_update') <=> '875b07556b750cdc5111dfa316a409fcf3efe7c22dbe83cbf42136e9d218594e') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_priced_order_acceptance_update';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='priced_order_acceptance_delete') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='priced_order_acceptance_delete') <=> 'd2f8e1d1b6b7e82e2a1bfbdfecaf04876f507ebb8636523180ed9f495d8c3503') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_priced_order_acceptance_delete';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='priced_order_acceptance_snapshot_insert') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='priced_order_acceptance_snapshot_insert') <=> '699be656d633b175caf3d05a6010be8cb36c9fefde6467d9d34e2b0ea1087a50') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_priced_order_acceptance_snapshot_insert';
  END IF;
END$$
DELIMITER ;

-- A priced purchase retains its original terms after the pricing capability is disabled.
DELIMITER $$
CREATE TRIGGER IF NOT EXISTS priced_order_acceptance_insert BEFORE INSERT ON order_policy_acceptances FOR EACH ROW
BEGIN
  IF EXISTS(
    SELECT 1 FROM order_policy_acceptances AS retained
    WHERE (retained.id=NEW.id OR retained.order_id=NEW.order_id OR retained.request_id=NEW.request_id)
      AND EXISTS(SELECT 1 FROM order_item_pricing_snapshots WHERE order_id=retained.order_id)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='priced_order_acceptance_immutable';
  END IF;

  IF EXISTS(SELECT 1 FROM order_item_pricing_snapshots WHERE order_id=NEW.order_id) THEN
    IF NOT JSON_VALID(NEW.terms_snapshot_json) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='priced_order_acceptance_mismatch';
    END IF;
    IF NOT (JSON_TYPE(JSON_EXTRACT(NEW.terms_snapshot_json,'$.variantPricingRuleVersion')) <=> 'STRING')
      OR NOT (JSON_TYPE(JSON_EXTRACT(NEW.terms_snapshot_json,'$.reviewedQuote.lines')) <=> 'ARRAY') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='priced_order_acceptance_mismatch';
    END IF;
    IF (SELECT COUNT(*) FROM JSON_TABLE(NEW.terms_snapshot_json,'$.reviewedQuote.lines[*]'
          COLUMNS(terms JSON PATH '$')) AS line
        WHERE JSON_CONTAINS_PATH(line.terms,'one','$.pricingRuleVersion'))
      <> (SELECT COUNT(*) FROM order_item_pricing_snapshots WHERE order_id=NEW.order_id)
      OR EXISTS(
        SELECT 1 FROM order_item_pricing_snapshots AS priced
        JOIN order_items AS item ON item.id=priced.order_item_id
        WHERE priced.order_id=NEW.order_id AND NOT EXISTS(
          SELECT 1 FROM JSON_TABLE(NEW.terms_snapshot_json,'$.reviewedQuote.lines[*]'
            COLUMNS(terms JSON PATH '$')) AS line
          WHERE BINARY JSON_VALUE(line.terms,'$.pricingRuleVersion')=BINARY JSON_VALUE(priced.snapshot_json,'$.ruleVersion')
            AND BINARY JSON_VALUE(NEW.terms_snapshot_json,'$.variantPricingRuleVersion')=BINARY JSON_VALUE(priced.snapshot_json,'$.ruleVersion')
            AND BINARY JSON_VALUE(line.terms,'$.offerId')=BINARY JSON_VALUE(priced.snapshot_json,'$.offerId')
            AND BINARY JSON_VALUE(line.terms,'$.offerVersionId')=BINARY JSON_VALUE(priced.snapshot_json,'$.offerVersionId')
            AND BINARY JSON_VALUE(line.terms,'$.publicVersionId')=BINARY JSON_VALUE(priced.snapshot_json,'$.publicVersionId')
            AND BINARY JSON_VALUE(line.terms,'$.sellerId')=BINARY item.seller_id
            AND JSON_TYPE(JSON_EXTRACT(line.terms,'$.quantity'))='INTEGER'
            AND JSON_VALUE(line.terms,'$.quantity')=JSON_VALUE(priced.snapshot_json,'$.quantity')
            AND JSON_TYPE(JSON_EXTRACT(line.terms,'$.pricePaisa'))='INTEGER'
            AND JSON_VALUE(line.terms,'$.pricePaisa')=JSON_VALUE(priced.snapshot_json,'$.customerUnitPaisa')
        )
      ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='priced_order_acceptance_mismatch';
    END IF;
  END IF;
END$$

CREATE TRIGGER IF NOT EXISTS priced_order_acceptance_update BEFORE UPDATE ON order_policy_acceptances FOR EACH ROW
BEGIN
  IF EXISTS(
    SELECT 1 FROM order_policy_acceptances AS retained
    WHERE retained.id<>OLD.id
      AND (retained.id=NEW.id OR retained.order_id=NEW.order_id OR retained.request_id=NEW.request_id)
      AND EXISTS(SELECT 1 FROM order_item_pricing_snapshots WHERE order_id=retained.order_id)
  ) OR (
    EXISTS(SELECT 1 FROM order_item_pricing_snapshots WHERE order_id IN(OLD.order_id,NEW.order_id))
    AND (
      NOT (BINARY NEW.id <=> BINARY OLD.id) OR NOT (BINARY NEW.order_id <=> BINARY OLD.order_id)
      OR NOT (BINARY NEW.policy_version <=> BINARY OLD.policy_version)
      OR NOT (BINARY NEW.terms_snapshot_json <=> BINARY OLD.terms_snapshot_json)
      OR NOT (BINARY NEW.acceptance_method <=> BINARY OLD.acceptance_method)
      OR NOT (BINARY NEW.request_id <=> BINARY OLD.request_id) OR NOT (NEW.accepted_at <=> OLD.accepted_at)
      OR NOT (BINARY NEW.actor_user_id <=> BINARY OLD.actor_user_id)
    )
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='priced_order_acceptance_immutable';
  END IF;
END$$

CREATE TRIGGER IF NOT EXISTS priced_order_acceptance_delete BEFORE DELETE ON order_policy_acceptances FOR EACH ROW
BEGIN
  IF EXISTS(SELECT 1 FROM order_item_pricing_snapshots WHERE order_id=OLD.order_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='priced_order_acceptance_immutable';
  END IF;
END$$

CREATE TRIGGER IF NOT EXISTS priced_order_acceptance_snapshot_insert BEFORE INSERT ON order_item_pricing_snapshots FOR EACH ROW
BEGIN
  IF EXISTS(SELECT 1 FROM order_policy_acceptances WHERE order_id=NEW.order_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_item_pricing_immutable';
  END IF;
END$$
DELIMITER ;
