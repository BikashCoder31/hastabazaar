-- Inspect exact installed definitions before each additive companion.
-- An already installed object with the reviewed definition is retained.
DELIMITER $$
BEGIN NOT ATOMIC
  IF DATABASE() IS NULL OR @@FOREIGN_KEY_CHECKS<>1 OR @@check_constraint_checks<>1 OR @@SESSION.sql_mode LIKE '%NO_BACKSLASH_ESCAPES%' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_session';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_item_pricing_snapshots') AND NOT ((SELECT SHA2(COALESCE(GROUP_CONCAT(item ORDER BY item SEPARATOR ''),''),256)
   FROM (SELECT SHA2(JSON_ARRAY('table',TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_COLLATION,CREATE_OPTIONS),256) AS item FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_item_pricing_snapshots'
    UNION ALL SELECT SHA2(JSON_ARRAY('column',COLUMN_NAME,ORDINAL_POSITION,COLUMN_DEFAULT,IS_NULLABLE,DATA_TYPE,COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,IS_GENERATED,GENERATION_EXPRESSION,COLUMN_COMMENT),256) AS item FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_item_pricing_snapshots'
    UNION ALL SELECT SHA2(JSON_ARRAY('index',INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,IGNORED),256) AS item FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_item_pricing_snapshots'
    UNION ALL SELECT SHA2(JSON_ARRAY('check',CONSTRAINT_NAME,CHECK_CLAUSE,LEVEL),256) AS item FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_item_pricing_snapshots'
    UNION ALL SELECT SHA2(JSON_ARRAY('fk',k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,IF(BINARY k.REFERENCED_TABLE_SCHEMA=BINARY DATABASE(),'current',k.REFERENCED_TABLE_SCHEMA),f.UPDATE_RULE,f.DELETE_RULE),256) AS item FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS f ON f.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND f.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND f.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND BINARY k.TABLE_NAME='order_item_pricing_snapshots' AND k.REFERENCED_TABLE_NAME IS NOT NULL) AS metadata_rows) <=> '22ef18e2ee10e3c6e32622122ddef77b6be09eb08227b9c9b8794d83cb6756e2') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_order_item_pricing_snapshots';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='order_item_pricing_snapshots' AND TRIGGER_NAME NOT IN('order_item_pricing_snapshot_insert','order_item_pricing_snapshot_no_update','order_item_pricing_snapshot_no_delete','priced_order_acceptance_snapshot_insert')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_unexpected_order_item_pricing_snapshots';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='priced_order_acceptance_snapshot_insert') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='priced_order_acceptance_snapshot_insert') <=> '699be656d633b175caf3d05a6010be8cb36c9fefde6467d9d34e2b0ea1087a50') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_priced_order_acceptance_snapshot_insert';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='order_item_pricing_snapshot_insert') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='order_item_pricing_snapshot_insert') <=> 'f66207ad8ebb1e558a902969ea70a41db91245f01cb6ecb3179a10bca43b62d0') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_order_item_pricing_snapshot_insert';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='order_item_pricing_snapshot_no_update') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='order_item_pricing_snapshot_no_update') <=> '88b3420df40f7051fd37c784a3cc6d56933ea76445885c46ddee0c40f2822193') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_order_item_pricing_snapshot_no_update';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='order_item_pricing_snapshot_no_delete') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='order_item_pricing_snapshot_no_delete') <=> '205e546d67e792ab4b5737dde3c5f752aa736fa81d00e7d68e648e8014f2230e') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_order_item_pricing_snapshot_no_delete';
  END IF;
END$$
DELIMITER ;

CREATE TABLE IF NOT EXISTS order_item_pricing_snapshots (
  order_item_id VARCHAR(191) NOT NULL PRIMARY KEY,
  order_id VARCHAR(191) NOT NULL,
  snapshot_json LONGTEXT NOT NULL CHECK(JSON_VALID(snapshot_json) AND JSON_TYPE(snapshot_json)='OBJECT'),
  created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  CONSTRAINT order_item_pricing_snapshot_item_fk FOREIGN KEY (order_item_id) REFERENCES order_items(id),
  CONSTRAINT order_item_pricing_snapshot_order_fk FOREIGN KEY (order_id) REFERENCES orders(id),
  KEY order_item_pricing_snapshots_order(order_id, order_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


DELIMITER $$
CREATE TRIGGER IF NOT EXISTS order_item_pricing_snapshot_insert BEFORE INSERT ON order_item_pricing_snapshots FOR EACH ROW
BEGIN
  DECLARE addition, customer_unit, customer_subtotal, customer_total, credit_applied, cash_payable DECIMAL(25,0);
  IF EXISTS(SELECT 1 FROM order_item_pricing_snapshots WHERE order_item_id=NEW.order_item_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_item_pricing_immutable';
  END IF;
  IF NOT JSON_VALID(NEW.snapshot_json) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_item_pricing_mismatch';
  END IF;
  SET addition=JSON_VALUE(NEW.snapshot_json,'$.additionPaisa'),
      customer_unit=JSON_VALUE(NEW.snapshot_json,'$.customerUnitPaisa'),
      customer_subtotal=JSON_VALUE(NEW.snapshot_json,'$.customerSubtotalPaisa'),
      customer_total=JSON_VALUE(NEW.snapshot_json,'$.customerTotalPaisa'),
      credit_applied=JSON_VALUE(NEW.snapshot_json,'$.creditAppliedPaisa'),
      cash_payable=JSON_VALUE(NEW.snapshot_json,'$.cashPayablePaisa');
  IF NOT EXISTS(
    SELECT 1
    FROM order_items AS item
    JOIN orders AS purchase ON purchase.id=item.order_id
    JOIN order_item_offer_snapshots AS offer ON offer.order_item_id=item.id
      AND offer.reservation_id=item.offer_reservation_id AND offer.legacy_mapping=0
    LEFT JOIN managed_commercial_snapshots AS managed ON managed.order_item_id=item.id
    WHERE item.id=NEW.order_item_id AND BINARY item.id=BINARY NEW.order_item_id
      AND BINARY item.order_id=BINARY NEW.order_id AND item.created_at=NEW.created_at
      AND BINARY JSON_VALUE(NEW.snapshot_json,'$.ruleVersion')='variant-price-addition-v1'
      AND BINARY JSON_VALUE(NEW.snapshot_json,'$.offerId')=BINARY offer.offer_id
      AND BINARY JSON_VALUE(NEW.snapshot_json,'$.offerVersionId')=BINARY offer.version_id
      AND BINARY JSON_VALUE(NEW.snapshot_json,'$.publicVersionId')=BINARY JSON_VALUE(offer.snapshot_json,'$.publicVersionId')
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.publicVersionId'))='STRING'
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.returnEligible'))='BOOLEAN'
      AND (JSON_UNQUOTE(JSON_EXTRACT(NEW.snapshot_json,'$.returnEligible'))='true')=item.return_eligible_snapshot
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.quantity'))='INTEGER'
      AND JSON_VALUE(NEW.snapshot_json,'$.quantity')=item.quantity
      AND item.quantity BETWEEN 1 AND 1000
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.sellerBasePaisa'))='INTEGER'
      AND JSON_VALUE(NEW.snapshot_json,'$.sellerBasePaisa')=item.unit_price_paisa
      AND JSON_VALUE(offer.snapshot_json,'$.sellingPaisa')=item.unit_price_paisa
      AND item.unit_price_paisa BETWEEN 1 AND 9007199254740991
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.additionPaisa'))='INTEGER'
      AND addition BETWEEN 0 AND 9007199254740991
      AND addition=CASE
        WHEN item.return_eligible_snapshot=1 THEN CASE WHEN item.unit_price_paisa<40000 THEN 4000 ELSE 8000 END
        ELSE 100 * ((item.unit_price_paisa DIV 2000)
          + CASE WHEN item.unit_price_paisa % 2000 >= 1000 THEN 1 ELSE 0 END)
      END
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.customerUnitPaisa'))='INTEGER'
      AND customer_unit BETWEEN 1 AND 9007199254740991
      AND customer_unit=item.unit_price_paisa+addition
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.discounts.sellerFundedPaisa'))='INTEGER'
      AND JSON_VALUE(NEW.snapshot_json,'$.discounts.sellerFundedPaisa')=item.seller_discount_paisa
      AND item.seller_discount_paisa>=0
      AND item.line_total_paisa=item.unit_price_paisa*item.quantity-item.seller_discount_paisa
      AND item.line_total_paisa BETWEEN 0 AND 9007199254740991
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.discounts.platformPromoPaisa'))='INTEGER'
      AND JSON_VALUE(NEW.snapshot_json,'$.discounts.platformPromoPaisa')=item.promo_discount_paisa
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.discounts.platformReferralPaisa'))='INTEGER'
      AND JSON_VALUE(NEW.snapshot_json,'$.discounts.platformReferralPaisa')=item.referral_discount_paisa
      AND item.platform_discount_paisa=item.promo_discount_paisa+item.referral_discount_paisa
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.discounts.promoCampaignId')) IN ('STRING','NULL')
      AND (BINARY JSON_VALUE(NEW.snapshot_json,'$.discounts.promoCampaignId') <=> BINARY purchase.promo_campaign_id)
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.discounts.promoVersion')) IN ('INTEGER','NULL')
      AND (JSON_VALUE(NEW.snapshot_json,'$.discounts.promoVersion') <=> purchase.promo_revision)
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.taxPaisa'))='INTEGER'
      AND JSON_VALUE(NEW.snapshot_json,'$.taxPaisa')=item.tax_paisa AND item.tax_paisa>=0
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.customerSubtotalPaisa'))='INTEGER'
      AND customer_subtotal BETWEEN 1 AND 9007199254740991
      AND customer_subtotal=customer_unit*item.quantity
      AND item.seller_discount_paisa+item.platform_discount_paisa<=customer_subtotal
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.customerTotalPaisa'))='INTEGER'
      AND customer_total BETWEEN 0 AND 9007199254740991
      AND customer_total=customer_subtotal-item.seller_discount_paisa-item.platform_discount_paisa+item.tax_paisa
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.creditAppliedPaisa'))='INTEGER'
      AND credit_applied BETWEEN 0 AND purchase.wallet_credit_paisa
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.cashPayablePaisa'))='INTEGER'
      AND cash_payable BETWEEN 0 AND 9007199254740991
      AND cash_payable=customer_total-credit_applied
      AND BINARY JSON_VALUE(NEW.snapshot_json,'$.commission.ruleVersion')=BINARY item.commission_rule_version
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.commission.settingVersionId')) IN ('STRING','NULL')
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.commission.acceptanceId')) IN ('STRING','NULL')
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.commission.bps'))='INTEGER'
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.commission.basePaisa'))='INTEGER'
      AND JSON_VALUE(NEW.snapshot_json,'$.commission.basePaisa')=item.line_total_paisa
      AND JSON_TYPE(JSON_EXTRACT(NEW.snapshot_json,'$.commission.amountPaisa'))='INTEGER'
      AND CAST(JSON_VALUE(NEW.snapshot_json,'$.commission.amountPaisa') AS DECIMAL(25,0)) BETWEEN 0 AND item.line_total_paisa
      AND (
        (BINARY JSON_VALUE(NEW.snapshot_json,'$.commission.kind')='registered'
          AND managed.order_item_id IS NULL
          AND BINARY JSON_VALUE(NEW.snapshot_json,'$.commission.agreementVersion')=BINARY item.seller_agreement_version
          AND JSON_VALUE(NEW.snapshot_json,'$.commission.bps')=item.commission_bps
          AND JSON_VALUE(NEW.snapshot_json,'$.commission.basePaisa')=item.commission_base_paisa
          AND JSON_VALUE(NEW.snapshot_json,'$.commission.amountPaisa')=item.commission_paisa
        ) OR
        (BINARY JSON_VALUE(NEW.snapshot_json,'$.commission.kind')='managed_sale_linked'
          AND managed.record_kind='live' AND managed.commercial_model='managed_sale_linked_percentage_v1'
          AND managed.seller_id=item.seller_id
          AND managed.product_value_paisa=item.unit_price_paisa*item.quantity
          AND managed.maker_funded_discount_paisa=item.seller_discount_paisa
          AND managed.platform_funded_discount_paisa=item.platform_discount_paisa
          AND BINARY JSON_VALUE(NEW.snapshot_json,'$.commission.agreementVersion')=BINARY managed.agreement_version
          AND (BINARY JSON_VALUE(NEW.snapshot_json,'$.commission.settingVersionId') <=> BINARY managed.terms_setting_version_id)
          AND (BINARY JSON_VALUE(NEW.snapshot_json,'$.commission.acceptanceId') <=> BINARY managed.accepted_managed_detail_id)
          AND JSON_VALUE(NEW.snapshot_json,'$.commission.bps')=managed.platform_retention_bps
          AND JSON_VALUE(NEW.snapshot_json,'$.commission.basePaisa')=managed.eligible_base_paisa
          AND JSON_VALUE(NEW.snapshot_json,'$.commission.amountPaisa')=managed.platform_retained_paisa
        )
      )
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_item_pricing_mismatch';
  END IF;
END$$
CREATE TRIGGER IF NOT EXISTS order_item_pricing_snapshot_no_update BEFORE UPDATE ON order_item_pricing_snapshots FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_item_pricing_immutable'; END$$
CREATE TRIGGER IF NOT EXISTS order_item_pricing_snapshot_no_delete BEFORE DELETE ON order_item_pricing_snapshots FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_item_pricing_immutable'; END$$
DELIMITER ;
