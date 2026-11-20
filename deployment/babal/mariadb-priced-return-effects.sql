-- Inspect exact installed definitions before each additive companion.
-- An already installed object with the reviewed definition is retained.
DELIMITER $$
BEGIN NOT ATOMIC
  IF DATABASE() IS NULL OR @@FOREIGN_KEY_CHECKS<>1 OR @@check_constraint_checks<>1 OR @@SESSION.sql_mode LIKE '%NO_BACKSLASH_ESCAPES%' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_session';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='refund_variant_pricing_effects') AND NOT ((SELECT SHA2(COALESCE(GROUP_CONCAT(item ORDER BY item SEPARATOR ''),''),256)
   FROM (SELECT SHA2(JSON_ARRAY('table',TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_COLLATION,CREATE_OPTIONS),256) AS item FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_variant_pricing_effects'
    UNION ALL SELECT SHA2(JSON_ARRAY('column',COLUMN_NAME,ORDINAL_POSITION,COLUMN_DEFAULT,IS_NULLABLE,DATA_TYPE,COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,IS_GENERATED,GENERATION_EXPRESSION,COLUMN_COMMENT),256) AS item FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_variant_pricing_effects'
    UNION ALL SELECT SHA2(JSON_ARRAY('index',INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,IGNORED),256) AS item FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_variant_pricing_effects'
    UNION ALL SELECT SHA2(JSON_ARRAY('check',CONSTRAINT_NAME,CHECK_CLAUSE,LEVEL),256) AS item FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_variant_pricing_effects'
    UNION ALL SELECT SHA2(JSON_ARRAY('fk',k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,IF(BINARY k.REFERENCED_TABLE_SCHEMA=BINARY DATABASE(),'current',k.REFERENCED_TABLE_SCHEMA),f.UPDATE_RULE,f.DELETE_RULE),256) AS item FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS f ON f.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND f.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND f.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND BINARY k.TABLE_NAME='refund_variant_pricing_effects' AND k.REFERENCED_TABLE_NAME IS NOT NULL) AS metadata_rows) <=> '69f6327ce21eb3b2899b5eb76d37e3fab35201af7a942ded90986c23ab216e21') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_variant_pricing_effects';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='refund_variant_pricing_effects' AND TRIGGER_NAME NOT IN('priced_return_effect_insert','priced_return_effect_no_update','priced_return_effect_no_delete')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_unexpected_refund_variant_pricing_effects';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='priced_return_effect_insert') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='priced_return_effect_insert') <=> 'fcd35c04f363e644e342ec798ba0222db911de27669f59c12f57de7925d798b5') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_priced_return_effect_insert';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='priced_return_effect_no_update') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='priced_return_effect_no_update') <=> 'e94f6e63a40dcc54c5d7b1c80f0b754e7450ee2eb0999dad1786231614381c15') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_priced_return_effect_no_update';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='priced_return_effect_no_delete') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='priced_return_effect_no_delete') <=> '42c1670848c3202b8c195de0111e4ec5c6898008d9dc7b34d3d898422d9b4f51') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_priced_return_effect_no_delete';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='priced_return_original_no_rewrite') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='priced_return_original_no_rewrite') <=> '6baeebd152cc90529418a7056c33abf6f8d33263dd2f13d2501b76c063fdd2d5') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_priced_return_original_no_rewrite';
  END IF;
  IF NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_cost_original_capacity') <=> '353b13f6c3c4cc172d28606f69e762467cf05a4011461fbb02cb041307fcd239')
    AND NOT EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_cost_original_capacity' AND BINARY EVENT_OBJECT_TABLE='refund_cost_allocations' AND EVENT_MANIPULATION='INSERT' AND ACTION_TIMING='BEFORE' AND ACTION_ORDER=1 AND SHA2(REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10)),256)='87ee393bd2ba31967597b9aa75f2d01c634cd51fb5ff2c6645e276f867ea87b7') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_cost_predecessor';
  END IF;
END$$
DELIMITER ;

CREATE TABLE IF NOT EXISTS refund_variant_pricing_effects (
  refund_id VARCHAR(191) NOT NULL PRIMARY KEY,
  order_item_id VARCHAR(191) NOT NULL,
  policy_version VARCHAR(191) NOT NULL CHECK(BINARY policy_version='saved_variant_return_v1'),
  quantity BIGINT NOT NULL CHECK(quantity BETWEEN 1 AND 9007199254740991),
  unit_ordinals_json LONGTEXT NOT NULL CHECK(JSON_VALID(unit_ordinals_json) AND JSON_TYPE(unit_ordinals_json)='ARRAY'),
  gross_item_paisa BIGINT NOT NULL CHECK(gross_item_paisa BETWEEN 0 AND 9007199254740991),
  seller_principal_paisa BIGINT NOT NULL CHECK(seller_principal_paisa BETWEEN 0 AND gross_item_paisa),
  platform_addition_paisa BIGINT NOT NULL CHECK(platform_addition_paisa BETWEEN 0 AND gross_item_paisa),
  tax_paisa BIGINT NOT NULL CHECK(tax_paisa BETWEEN 0 AND gross_item_paisa-platform_addition_paisa),
  unallocated_merchandise_paisa BIGINT NOT NULL CHECK(unallocated_merchandise_paisa=
    CASE WHEN seller_principal_paisa>0 THEN gross_item_paisa-seller_principal_paisa ELSE 0 END),
  saved_delivery_share_paisa BIGINT NOT NULL CHECK(saved_delivery_share_paisa BETWEEN 0 AND 9007199254740991),
  retained_outbound_paisa BIGINT NOT NULL CHECK(retained_outbound_paisa BETWEEN 0 AND saved_delivery_share_paisa),
  voluntary_policy_version VARCHAR(191) CHECK(voluntary_policy_version IS NULL OR BINARY voluntary_policy_version='disclosed_voluntary_delivery_v1'),
  decision_evidence_reference VARCHAR(191) NOT NULL CHECK(CHAR_LENGTH(TRIM(decision_evidence_reference))>0),
  correct_seller_fulfillment BIGINT NOT NULL CHECK(correct_seller_fulfillment IN (0,1)),
  approved_by VARCHAR(191) NOT NULL,
  created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  CONSTRAINT priced_return_effect_refund_fk FOREIGN KEY(refund_id) REFERENCES refunds(id) ON DELETE RESTRICT,
  CONSTRAINT priced_return_effect_order_item_fk FOREIGN KEY(order_item_id) REFERENCES order_item_pricing_snapshots(order_item_id),
  CONSTRAINT priced_return_effect_approved_by_fk FOREIGN KEY(approved_by) REFERENCES users(id),
  KEY refund_variant_pricing_effects_item(order_item_id,refund_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


DELIMITER $$
CREATE TRIGGER IF NOT EXISTS priced_return_effect_insert BEFORE INSERT ON refund_variant_pricing_effects FOR EACH ROW
BEGIN
  IF EXISTS(SELECT 1 FROM refund_variant_pricing_effects WHERE refund_id=NEW.refund_id)
  THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='priced_return_effect_history_retained'; END IF;
  IF NOT JSON_VALID(NEW.unit_ordinals_json)
  THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='priced_return_effect_original_mismatch'; END IF;
  IF NOT EXISTS(
    SELECT 1
    FROM refunds AS refund
    JOIN return_requests AS request ON request.id=refund.return_request_id
    JOIN order_items AS item ON item.id=request.order_item_id AND item.order_id=refund.order_id
    JOIN orders AS purchase ON purchase.id=item.order_id
    JOIN order_item_pricing_snapshots AS pricing ON pricing.order_item_id=item.id AND pricing.order_id=item.order_id
    WHERE refund.id=NEW.refund_id AND item.id=NEW.order_item_id
      AND BINARY refund.id=BINARY NEW.refund_id AND BINARY item.id=BINARY NEW.order_item_id
      AND BINARY refund.status IN ('approved','pending_high_value_approval')
      AND BINARY refund.approved_by=BINARY NEW.approved_by AND BINARY request.reviewed_by=BINARY NEW.approved_by
      AND refund.requested_at=NEW.created_at
      AND BINARY refund.liability=BINARY request.responsibility
      AND (BINARY refund.liability NOT IN ('carrier','platform') OR NEW.correct_seller_fulfillment=1)
      AND NOT EXISTS(SELECT 1 FROM refund_cost_allocations WHERE refund_id=refund.id)
      AND BINARY JSON_VALUE(pricing.snapshot_json,'$.ruleVersion')='variant-price-addition-v1'
      AND JSON_VALUE(pricing.snapshot_json,'$.quantity')=item.quantity
      AND NEW.quantity=request.quantity AND NEW.quantity BETWEEN 1 AND item.quantity
      AND JSON_TYPE(NEW.unit_ordinals_json)='ARRAY' AND JSON_LENGTH(NEW.unit_ordinals_json)=NEW.quantity
      AND (SELECT COUNT(DISTINCT CAST(ord.value AS SIGNED))
        FROM JSON_TABLE(NEW.unit_ordinals_json,'$[*]' COLUMNS(value JSON PATH '$')) AS ord
        WHERE JSON_TYPE(ord.value)='INTEGER' AND CAST(ord.value AS SIGNED) BETWEEN 1 AND item.quantity)=NEW.quantity
      AND NOT EXISTS(
        SELECT 1 FROM refund_variant_pricing_effects AS prior
        JOIN refunds AS prior_refund ON prior_refund.id=prior.refund_id
        CROSS JOIN JSON_TABLE(prior.unit_ordinals_json,'$[*]' COLUMNS(value BIGINT PATH '$')) AS prior_unit
        WHERE prior.order_item_id=item.id AND BINARY prior_refund.status<>'rejected'
          AND prior_unit.value IN (SELECT ord.value FROM JSON_TABLE(NEW.unit_ordinals_json,'$[*]' COLUMNS(value BIGINT PATH '$')) AS ord)
      )
      AND NEW.platform_addition_paisa=CAST(JSON_VALUE(pricing.snapshot_json,'$.additionPaisa') AS SIGNED)*NEW.quantity
      AND NEW.tax_paisa=(CAST(JSON_VALUE(pricing.snapshot_json,'$.taxPaisa') AS SIGNED) DIV item.quantity)*NEW.quantity
        + (SELECT COUNT(*) FROM JSON_TABLE(NEW.unit_ordinals_json,'$[*]' COLUMNS(value BIGINT PATH '$')) AS ord
          WHERE ord.value<=CAST(JSON_VALUE(pricing.snapshot_json,'$.taxPaisa') AS SIGNED) % item.quantity)
      AND NEW.gross_item_paisa=
        (CAST(JSON_VALUE(pricing.snapshot_json,'$.commission.basePaisa') AS SIGNED) DIV item.quantity)*NEW.quantity
        + (SELECT COUNT(*) FROM JSON_TABLE(NEW.unit_ordinals_json,'$[*]' COLUMNS(value BIGINT PATH '$')) AS ord
          WHERE ord.value<=CAST(JSON_VALUE(pricing.snapshot_json,'$.commission.basePaisa') AS SIGNED) % item.quantity)
        + NEW.platform_addition_paisa + NEW.tax_paisa
      AND (NEW.seller_principal_paisa=0 OR (
        BINARY refund.liability='seller' AND BINARY request.reason<>'change_of_mind' AND NEW.correct_seller_fulfillment=0
        AND NEW.seller_principal_paisa=NEW.gross_item_paisa-NEW.platform_addition_paisa-NEW.tax_paisa
      ))
      AND refund.item_amount_paisa=NEW.gross_item_paisa
      AND refund.commission_base_refunded_paisa=NEW.seller_principal_paisa
      AND refund.delivery_amount_paisa=NEW.saved_delivery_share_paisa-NEW.retained_outbound_paisa
      AND refund.amount_paisa=refund.item_amount_paisa+refund.delivery_amount_paisa
      AND refund.wallet_credit_paisa+refund.referral_discount_paisa+refund.promo_discount_paisa<=NEW.gross_item_paisa
      AND (SELECT COALESCE(SUM(r.wallet_credit_paisa),0) FROM refunds AS r
        JOIN return_requests AS c ON c.id=r.return_request_id WHERE c.order_item_id=item.id AND BINARY r.status<>'rejected')
        <=CAST(JSON_VALUE(pricing.snapshot_json,'$.creditAppliedPaisa') AS SIGNED)
      AND (SELECT COALESCE(SUM(r.referral_discount_paisa),0) FROM refunds AS r
        JOIN return_requests AS c ON c.id=r.return_request_id WHERE c.order_item_id=item.id AND BINARY r.status<>'rejected')
        <=CAST(JSON_VALUE(pricing.snapshot_json,'$.discounts.platformReferralPaisa') AS SIGNED)
      AND (SELECT COALESCE(SUM(r.promo_discount_paisa),0) FROM refunds AS r
        JOIN return_requests AS c ON c.id=r.return_request_id WHERE c.order_item_id=item.id AND BINARY r.status<>'rejected')
        <=CAST(JSON_VALUE(pricing.snapshot_json,'$.discounts.platformPromoPaisa') AS SIGNED)
      AND (NEW.quantity<item.quantity OR (
        refund.wallet_credit_paisa=JSON_VALUE(pricing.snapshot_json,'$.creditAppliedPaisa')
        AND refund.referral_discount_paisa=JSON_VALUE(pricing.snapshot_json,'$.discounts.platformReferralPaisa')
        AND refund.promo_discount_paisa=JSON_VALUE(pricing.snapshot_json,'$.discounts.platformPromoPaisa')
      ))
      AND CASE WHEN (
        CASE WHEN JSON_VALID(purchase.delivery_rate_snapshot_json)
          THEN BINARY JSON_VALUE(purchase.delivery_rate_snapshot_json,'$.unitAllocationPolicy') END='seller_shipment_equal_units_v2'
        OR EXISTS(SELECT 1 FROM order_delivery_unit_claims WHERE refund_id=refund.id)
      ) THEN (
        (SELECT COUNT(*) FROM order_delivery_unit_claims WHERE refund_id=refund.id)=NEW.quantity
        AND (SELECT COALESCE(SUM(unit.amount_paisa),0) FROM order_delivery_unit_claims AS claim
          JOIN order_delivery_unit_allocations AS unit
            ON unit.order_item_id=claim.order_item_id AND unit.unit_ordinal=claim.unit_ordinal
          WHERE claim.refund_id=refund.id AND unit.order_id=purchase.id AND unit.order_item_id=item.id
            AND claim.unit_ordinal IN (SELECT ord.value FROM JSON_TABLE(NEW.unit_ordinals_json,'$[*]' COLUMNS(value BIGINT PATH '$')) AS ord))=NEW.saved_delivery_share_paisa
        AND NOT EXISTS(SELECT 1 FROM JSON_TABLE(NEW.unit_ordinals_json,'$[*]' COLUMNS(value BIGINT PATH '$')) AS ord WHERE NOT EXISTS(
          SELECT 1 FROM order_delivery_unit_claims AS claim
          WHERE claim.refund_id=refund.id AND claim.order_item_id=item.id AND claim.unit_ordinal=ord.value
        ))
      ) ELSE (
        (purchase.cancellation_version=0 AND purchase.delivery_charge_paisa=0 AND NEW.saved_delivery_share_paisa=0)
        OR NEW.saved_delivery_share_paisa<=CASE WHEN purchase.cancellation_version>0 THEN (
          SELECT adjustment.amount_paisa FROM order_delivery_adjustments AS adjustment
          JOIN order_cancellation_events AS cancellation ON cancellation.id=adjustment.event_id
          WHERE adjustment.order_item_id=item.id AND adjustment.order_id=purchase.id
            AND cancellation.order_id=purchase.id AND cancellation.version=purchase.cancellation_version
        ) ELSE (
          SELECT allocation.amount_paisa FROM order_delivery_allocations AS allocation
          WHERE allocation.order_item_id=item.id AND allocation.order_id=purchase.id
        ) END - (
          SELECT COALESCE(SUM(COALESCE(prior_effect.saved_delivery_share_paisa,prior_refund.delivery_amount_paisa)),0)
          FROM refunds AS prior_refund
          JOIN return_requests AS prior_case ON prior_case.id=prior_refund.return_request_id
          LEFT JOIN refund_variant_pricing_effects AS prior_effect ON prior_effect.refund_id=prior_refund.id
          WHERE prior_refund.id<>refund.id AND prior_refund.order_id=purchase.id
            AND prior_case.order_item_id=item.id AND BINARY prior_refund.status<>'rejected'
        )
      ) END
      AND (
        (NEW.voluntary_policy_version IS NULL AND NEW.retained_outbound_paisa=0)
        OR (BINARY NEW.voluntary_policy_version='disclosed_voluntary_delivery_v1' AND BINARY request.reason='change_of_mind'
          AND NEW.retained_outbound_paisa=NEW.saved_delivery_share_paisa
          AND CASE WHEN JSON_VALID(purchase.return_policy_snapshot_json) AND JSON_VALID(request.policy_snapshot_json) THEN (
            BINARY JSON_VALUE(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.version')=BINARY NEW.voluntary_policy_version
            AND BINARY JSON_VALUE(request.policy_snapshot_json,'$.voluntaryDelivery.version')=BINARY NEW.voluntary_policy_version
            AND JSON_TYPE(JSON_EXTRACT(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.legalAuthorityReference'))='STRING'
            AND CHAR_LENGTH(TRIM(JSON_VALUE(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.legalAuthorityReference')))>0
            AND BINARY JSON_VALUE(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.legalAuthorityReference')
              =BINARY JSON_VALUE(request.policy_snapshot_json,'$.voluntaryDelivery.legalAuthorityReference')
            AND JSON_TYPE(JSON_EXTRACT(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.disclosureVersion'))='STRING'
            AND CHAR_LENGTH(TRIM(JSON_VALUE(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.disclosureVersion')))>0
            AND BINARY JSON_VALUE(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.disclosureVersion')
              =BINARY JSON_VALUE(request.policy_snapshot_json,'$.voluntaryDelivery.disclosureVersion')
            AND BINARY JSON_EXTRACT(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.disclosedAtCheckout')='true'
            AND BINARY JSON_EXTRACT(request.policy_snapshot_json,'$.voluntaryDelivery.disclosedAtCheckout')='true'
            AND BINARY JSON_EXTRACT(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.outboundRefundPromised')='false'
            AND BINARY JSON_EXTRACT(request.policy_snapshot_json,'$.voluntaryDelivery.outboundRefundPromised')='false'
            AND BINARY JSON_EXTRACT(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.reversePaidByBuyer')='true'
            AND BINARY JSON_EXTRACT(request.policy_snapshot_json,'$.voluntaryDelivery.reversePaidByBuyer')='true'
          ) END
        )
      )
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='priced_return_effect_original_mismatch'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS priced_return_effect_no_update BEFORE UPDATE ON refund_variant_pricing_effects FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='priced_return_effect_history_retained'; END$$
CREATE TRIGGER IF NOT EXISTS priced_return_effect_no_delete BEFORE DELETE ON refund_variant_pricing_effects FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='priced_return_effect_history_retained'; END$$
CREATE TRIGGER IF NOT EXISTS priced_return_original_no_rewrite BEFORE UPDATE ON refunds FOR EACH ROW
BEGIN
  IF (NOT (BINARY NEW.id <=> BINARY OLD.id) OR NOT (BINARY NEW.order_id <=> BINARY OLD.order_id)
    OR NOT (BINARY NEW.return_request_id <=> BINARY OLD.return_request_id) OR NOT (NEW.amount_paisa <=> OLD.amount_paisa)
    OR NOT (NEW.item_amount_paisa <=> OLD.item_amount_paisa) OR NOT (NEW.delivery_amount_paisa <=> OLD.delivery_amount_paisa)
    OR NOT (NEW.wallet_credit_paisa <=> OLD.wallet_credit_paisa) OR NOT (NEW.referral_discount_paisa <=> OLD.referral_discount_paisa)
    OR NOT (NEW.promo_discount_paisa <=> OLD.promo_discount_paisa)
    OR NOT (NEW.commission_base_refunded_paisa <=> OLD.commission_base_refunded_paisa)
    OR NOT (BINARY NEW.approved_by <=> BINARY OLD.approved_by) OR NOT (NEW.requested_at <=> OLD.requested_at)
    OR NOT (BINARY NEW.liability <=> BINARY OLD.liability))
    AND EXISTS(SELECT 1 FROM refund_variant_pricing_effects WHERE refund_id=OLD.id)
  THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='priced_return_effect_original_retained'; END IF;
END$$
DELIMITER ;

DELIMITER $$
BEGIN NOT ATOMIC
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_cost_original_capacity' AND BINARY EVENT_OBJECT_TABLE='refund_cost_allocations' AND EVENT_MANIPULATION='INSERT' AND ACTION_TIMING='BEFORE' AND ACTION_ORDER=1 AND SHA2(REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10)),256)='87ee393bd2ba31967597b9aa75f2d01c634cd51fb5ff2c6645e276f867ea87b7') THEN
    SET @hb_pricing_cost_ddl='CREATE OR REPLACE TRIGGER refund_cost_original_capacity BEFORE INSERT ON refund_cost_allocations FOR EACH ROW
BEGIN
  IF EXISTS(
    SELECT 1 FROM refund_cost_allocations AS cost JOIN refund_variant_pricing_effects AS effect ON effect.refund_id=cost.refund_id
    WHERE cost.refund_id=NEW.refund_id AND cost.component=NEW.component
  ) THEN SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT=''original_refund_cost_retained''; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM refunds AS refund
    JOIN return_requests AS request ON request.id=refund.return_request_id
    JOIN order_items AS item ON item.id=request.order_item_id
    LEFT JOIN refund_variant_pricing_effects AS effect ON effect.refund_id=refund.id
    WHERE refund.id=NEW.refund_id
      AND (
        (effect.refund_id IS NULL
          AND NEW.amount_paisa=CASE WHEN NEW.component=''merchandise'' THEN refund.item_amount_paisa ELSE refund.delivery_amount_paisa END
          AND NEW.party=CASE WHEN NEW.component=''original_delivery'' AND request.reason=''change_of_mind'' THEN ''platform'' ELSE refund.liability END
          AND (NEW.party<>''seller'' OR NEW.seller_id=item.seller_id))
        OR (effect.refund_id IS NOT NULL AND effect.order_item_id=item.id
          AND BINARY NEW.refund_id=BINARY refund.id AND BINARY NEW.created_by=BINARY effect.approved_by AND NEW.created_at=effect.created_at
          AND (
            (BINARY NEW.component=''original_delivery'' AND BINARY NEW.party=''platform'' AND NEW.seller_id IS NULL
              AND NEW.amount_paisa=effect.saved_delivery_share_paisa-effect.retained_outbound_paisa)
            OR (BINARY NEW.component=''merchandise'' AND (
              (effect.seller_principal_paisa>0 AND NEW.amount_paisa=effect.seller_principal_paisa
                AND BINARY NEW.party=''seller'' AND BINARY NEW.seller_id=BINARY item.seller_id)
              OR (effect.seller_principal_paisa=0 AND NEW.amount_paisa=effect.gross_item_paisa
                AND BINARY NEW.party=CASE WHEN refund.liability=''seller'' THEN ''platform'' ELSE refund.liability END AND NEW.seller_id IS NULL)
            ))
          )
        )
      )
  ) THEN SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT=''refund_cost_requires_original_authorization''; END IF;
END';
    PREPARE hb_pricing_cost_statement FROM @hb_pricing_cost_ddl;
    EXECUTE hb_pricing_cost_statement;
    DEALLOCATE PREPARE hb_pricing_cost_statement;
    SET @hb_pricing_cost_ddl=NULL;
  END IF;
  IF NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_cost_original_capacity') <=> '353b13f6c3c4cc172d28606f69e762467cf05a4011461fbb02cb041307fcd239') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_cost_unverified';
  END IF;
END$$
DELIMITER ;
