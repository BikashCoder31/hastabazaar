CREATE TABLE refund_variant_pricing_effects (
  refund_id TEXT NOT NULL PRIMARY KEY REFERENCES refunds(id) ON DELETE RESTRICT,
  order_item_id TEXT NOT NULL REFERENCES order_item_pricing_snapshots(order_item_id),
  policy_version TEXT NOT NULL CHECK(policy_version='saved_variant_return_v1'),
  quantity INTEGER NOT NULL CHECK(typeof(quantity)='integer' AND quantity BETWEEN 1 AND 9007199254740991),
  unit_ordinals_json TEXT NOT NULL CHECK(json_valid(unit_ordinals_json) AND json_type(unit_ordinals_json)='array'),
  gross_item_paisa INTEGER NOT NULL CHECK(typeof(gross_item_paisa)='integer' AND gross_item_paisa BETWEEN 0 AND 9007199254740991),
  seller_principal_paisa INTEGER NOT NULL CHECK(typeof(seller_principal_paisa)='integer' AND seller_principal_paisa BETWEEN 0 AND gross_item_paisa),
  platform_addition_paisa INTEGER NOT NULL CHECK(typeof(platform_addition_paisa)='integer' AND platform_addition_paisa BETWEEN 0 AND gross_item_paisa),
  tax_paisa INTEGER NOT NULL CHECK(typeof(tax_paisa)='integer' AND tax_paisa BETWEEN 0 AND gross_item_paisa-platform_addition_paisa),
  unallocated_merchandise_paisa INTEGER NOT NULL CHECK(typeof(unallocated_merchandise_paisa)='integer' AND unallocated_merchandise_paisa=
    CASE WHEN seller_principal_paisa>0 THEN gross_item_paisa-seller_principal_paisa ELSE 0 END),
  saved_delivery_share_paisa INTEGER NOT NULL CHECK(typeof(saved_delivery_share_paisa)='integer' AND saved_delivery_share_paisa BETWEEN 0 AND 9007199254740991),
  retained_outbound_paisa INTEGER NOT NULL CHECK(typeof(retained_outbound_paisa)='integer' AND retained_outbound_paisa BETWEEN 0 AND saved_delivery_share_paisa),
  voluntary_policy_version TEXT CHECK(voluntary_policy_version IS NULL OR voluntary_policy_version='disclosed_voluntary_delivery_v1'),
  decision_evidence_reference TEXT NOT NULL CHECK(length(trim(decision_evidence_reference))>0 AND length(decision_evidence_reference)<=191),
  correct_seller_fulfillment INTEGER NOT NULL CHECK(typeof(correct_seller_fulfillment)='integer' AND correct_seller_fulfillment IN (0,1)),
  approved_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE INDEX refund_variant_pricing_effects_item ON refund_variant_pricing_effects(order_item_id,refund_id);
--> statement-breakpoint
CREATE TRIGGER priced_return_effect_insert BEFORE INSERT ON refund_variant_pricing_effects
BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM refund_variant_pricing_effects WHERE refund_id=NEW.refund_id
  ) THEN RAISE(ABORT,'priced_return_effect_history_retained') END;
  SELECT CASE WHEN NOT json_valid(NEW.unit_ordinals_json) THEN RAISE(ABORT,'priced_return_effect_original_mismatch') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1
    FROM refunds AS refund
    JOIN return_requests AS request ON request.id=refund.return_request_id
    JOIN order_items AS item ON item.id=request.order_item_id AND item.order_id=refund.order_id
    JOIN orders AS purchase ON purchase.id=item.order_id
    JOIN order_item_pricing_snapshots AS pricing ON pricing.order_item_id=item.id AND pricing.order_id=item.order_id
    WHERE refund.id=NEW.refund_id AND item.id=NEW.order_item_id AND refund.status IN ('approved','pending_high_value_approval')
      AND refund.approved_by=NEW.approved_by AND request.reviewed_by=NEW.approved_by AND refund.requested_at=NEW.created_at
      AND refund.liability=request.responsibility
      AND (refund.liability NOT IN ('carrier','platform') OR NEW.correct_seller_fulfillment=1)
      AND NOT EXISTS(SELECT 1 FROM refund_cost_allocations WHERE refund_id=refund.id)
      AND json_extract(pricing.snapshot_json,'$.ruleVersion')='variant-price-addition-v1'
      AND json_extract(pricing.snapshot_json,'$.quantity')=item.quantity
      AND NEW.quantity=request.quantity AND NEW.quantity BETWEEN 1 AND item.quantity
      AND json_type(NEW.unit_ordinals_json)='array' AND json_array_length(NEW.unit_ordinals_json)=NEW.quantity
      AND (SELECT COUNT(DISTINCT u.value) FROM json_each(NEW.unit_ordinals_json) AS u
        WHERE u.type='integer' AND u.value BETWEEN 1 AND item.quantity)=NEW.quantity
      AND NOT EXISTS(
        SELECT 1 FROM refund_variant_pricing_effects AS prior
        JOIN refunds AS prior_refund ON prior_refund.id=prior.refund_id
        JOIN json_each(prior.unit_ordinals_json) AS prior_unit
        WHERE prior.order_item_id=item.id AND prior_refund.status<>'rejected'
          AND prior_unit.value IN (SELECT value FROM json_each(NEW.unit_ordinals_json))
      )
      AND NEW.platform_addition_paisa=json_extract(pricing.snapshot_json,'$.additionPaisa')*NEW.quantity
      AND NEW.tax_paisa=CAST(json_extract(pricing.snapshot_json,'$.taxPaisa') / item.quantity AS INTEGER)*NEW.quantity
        + (SELECT COUNT(*) FROM json_each(NEW.unit_ordinals_json) AS u
          WHERE u.value<=json_extract(pricing.snapshot_json,'$.taxPaisa') % item.quantity)
      AND NEW.gross_item_paisa=
        CAST(json_extract(pricing.snapshot_json,'$.commission.basePaisa') / item.quantity AS INTEGER)*NEW.quantity
        + (SELECT COUNT(*) FROM json_each(NEW.unit_ordinals_json) AS u
          WHERE u.value<=json_extract(pricing.snapshot_json,'$.commission.basePaisa') % item.quantity)
        + NEW.platform_addition_paisa + NEW.tax_paisa
      AND (NEW.seller_principal_paisa=0 OR (
        refund.liability='seller' AND request.reason<>'change_of_mind' AND NEW.correct_seller_fulfillment=0
        AND NEW.seller_principal_paisa=NEW.gross_item_paisa-NEW.platform_addition_paisa-NEW.tax_paisa
      ))
      AND refund.item_amount_paisa=NEW.gross_item_paisa
      AND refund.commission_base_refunded_paisa=NEW.seller_principal_paisa
      AND refund.delivery_amount_paisa=NEW.saved_delivery_share_paisa-NEW.retained_outbound_paisa
      AND refund.amount_paisa=refund.item_amount_paisa+refund.delivery_amount_paisa
      AND refund.wallet_credit_paisa+refund.referral_discount_paisa+refund.promo_discount_paisa<=NEW.gross_item_paisa
      AND (SELECT COALESCE(SUM(r.wallet_credit_paisa),0) FROM refunds AS r
        JOIN return_requests AS c ON c.id=r.return_request_id WHERE c.order_item_id=item.id AND r.status<>'rejected')
        <=json_extract(pricing.snapshot_json,'$.creditAppliedPaisa')
      AND (SELECT COALESCE(SUM(r.referral_discount_paisa),0) FROM refunds AS r
        JOIN return_requests AS c ON c.id=r.return_request_id WHERE c.order_item_id=item.id AND r.status<>'rejected')
        <=json_extract(pricing.snapshot_json,'$.discounts.platformReferralPaisa')
      AND (SELECT COALESCE(SUM(r.promo_discount_paisa),0) FROM refunds AS r
        JOIN return_requests AS c ON c.id=r.return_request_id WHERE c.order_item_id=item.id AND r.status<>'rejected')
        <=json_extract(pricing.snapshot_json,'$.discounts.platformPromoPaisa')
      AND (NEW.quantity<item.quantity OR (
        refund.wallet_credit_paisa=json_extract(pricing.snapshot_json,'$.creditAppliedPaisa')
        AND refund.referral_discount_paisa=json_extract(pricing.snapshot_json,'$.discounts.platformReferralPaisa')
        AND refund.promo_discount_paisa=json_extract(pricing.snapshot_json,'$.discounts.platformPromoPaisa')
      ))
      AND CASE WHEN (
        CASE WHEN json_valid(purchase.delivery_rate_snapshot_json)
          THEN json_extract(purchase.delivery_rate_snapshot_json,'$.unitAllocationPolicy') END='seller_shipment_equal_units_v2'
        OR EXISTS(SELECT 1 FROM order_delivery_unit_claims WHERE refund_id=refund.id)
      ) THEN (
        (SELECT COUNT(*) FROM order_delivery_unit_claims WHERE refund_id=refund.id)=NEW.quantity
        AND (SELECT COALESCE(SUM(unit.amount_paisa),0) FROM order_delivery_unit_claims AS claim
          JOIN order_delivery_unit_allocations AS unit
            ON unit.order_item_id=claim.order_item_id AND unit.unit_ordinal=claim.unit_ordinal
          WHERE claim.refund_id=refund.id AND unit.order_id=purchase.id AND unit.order_item_id=item.id
            AND claim.unit_ordinal IN (SELECT value FROM json_each(NEW.unit_ordinals_json)))=NEW.saved_delivery_share_paisa
        AND NOT EXISTS(SELECT 1 FROM json_each(NEW.unit_ordinals_json) AS ordinal WHERE NOT EXISTS(
          SELECT 1 FROM order_delivery_unit_claims AS claim
          WHERE claim.refund_id=refund.id AND claim.order_item_id=item.id AND claim.unit_ordinal=ordinal.value
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
            AND prior_case.order_item_id=item.id AND prior_refund.status<>'rejected'
        )
      ) END
      AND (
        (NEW.voluntary_policy_version IS NULL AND NEW.retained_outbound_paisa=0)
        OR (NEW.voluntary_policy_version='disclosed_voluntary_delivery_v1' AND request.reason='change_of_mind'
          AND NEW.retained_outbound_paisa=NEW.saved_delivery_share_paisa
          AND CASE WHEN json_valid(purchase.return_policy_snapshot_json) AND json_valid(request.policy_snapshot_json) THEN (
            json_extract(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.version')=NEW.voluntary_policy_version
            AND json_extract(request.policy_snapshot_json,'$.voluntaryDelivery.version')=NEW.voluntary_policy_version
            AND json_type(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.legalAuthorityReference')='text'
            AND length(trim(json_extract(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.legalAuthorityReference')))>0
            AND json_extract(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.legalAuthorityReference')
              =json_extract(request.policy_snapshot_json,'$.voluntaryDelivery.legalAuthorityReference')
            AND json_type(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.disclosureVersion')='text'
            AND length(trim(json_extract(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.disclosureVersion')))>0
            AND json_extract(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.disclosureVersion')
              =json_extract(request.policy_snapshot_json,'$.voluntaryDelivery.disclosureVersion')
            AND json_type(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.disclosedAtCheckout')='true'
            AND json_type(request.policy_snapshot_json,'$.voluntaryDelivery.disclosedAtCheckout')='true'
            AND json_type(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.outboundRefundPromised')='false'
            AND json_type(request.policy_snapshot_json,'$.voluntaryDelivery.outboundRefundPromised')='false'
            AND json_type(purchase.return_policy_snapshot_json,'$.voluntaryDelivery.reversePaidByBuyer')='true'
            AND json_type(request.policy_snapshot_json,'$.voluntaryDelivery.reversePaidByBuyer')='true'
          ) END
        )
      )
  ) THEN RAISE(ABORT,'priced_return_effect_original_mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER priced_return_effect_no_update BEFORE UPDATE ON refund_variant_pricing_effects
BEGIN SELECT RAISE(ABORT,'priced_return_effect_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER priced_return_effect_no_delete BEFORE DELETE ON refund_variant_pricing_effects
BEGIN SELECT RAISE(ABORT,'priced_return_effect_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER priced_return_original_no_rewrite BEFORE UPDATE OF id,order_id,return_request_id,amount_paisa,item_amount_paisa,
  delivery_amount_paisa,wallet_credit_paisa,referral_discount_paisa,promo_discount_paisa,commission_base_refunded_paisa,
  approved_by,requested_at,liability ON refunds
WHEN (NEW.id IS NOT OLD.id OR NEW.order_id IS NOT OLD.order_id OR NEW.return_request_id IS NOT OLD.return_request_id
  OR NEW.amount_paisa IS NOT OLD.amount_paisa OR NEW.item_amount_paisa IS NOT OLD.item_amount_paisa
  OR NEW.delivery_amount_paisa IS NOT OLD.delivery_amount_paisa OR NEW.wallet_credit_paisa IS NOT OLD.wallet_credit_paisa
  OR NEW.referral_discount_paisa IS NOT OLD.referral_discount_paisa OR NEW.promo_discount_paisa IS NOT OLD.promo_discount_paisa
  OR NEW.commission_base_refunded_paisa IS NOT OLD.commission_base_refunded_paisa OR NEW.approved_by IS NOT OLD.approved_by
  OR NEW.requested_at IS NOT OLD.requested_at OR NEW.liability IS NOT OLD.liability)
  AND EXISTS(SELECT 1 FROM refund_variant_pricing_effects WHERE refund_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'priced_return_effect_original_retained'); END;
--> statement-breakpoint
DROP TRIGGER refund_cost_original_capacity;
--> statement-breakpoint
CREATE TRIGGER refund_cost_original_capacity BEFORE INSERT ON refund_cost_allocations
BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM refund_cost_allocations AS cost JOIN refund_variant_pricing_effects AS effect ON effect.refund_id=cost.refund_id
    WHERE cost.refund_id=NEW.refund_id AND cost.component=NEW.component
  ) THEN RAISE(ABORT,'original_refund_cost_retained') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM refunds AS refund
    JOIN return_requests AS request ON request.id=refund.return_request_id
    JOIN order_items AS item ON item.id=request.order_item_id
    LEFT JOIN refund_variant_pricing_effects AS effect ON effect.refund_id=refund.id
    WHERE refund.id=NEW.refund_id
      AND (
        (effect.refund_id IS NULL
          AND NEW.amount_paisa=CASE WHEN NEW.component='merchandise' THEN refund.item_amount_paisa ELSE refund.delivery_amount_paisa END
          AND NEW.party=CASE WHEN NEW.component='original_delivery' AND request.reason='change_of_mind' THEN 'platform' ELSE refund.liability END
          AND (NEW.party<>'seller' OR NEW.seller_id=item.seller_id))
        OR (effect.refund_id IS NOT NULL AND effect.order_item_id=item.id
          AND NEW.created_by=effect.approved_by AND NEW.created_at=effect.created_at
          AND (
            (NEW.component='original_delivery' AND NEW.party='platform' AND NEW.seller_id IS NULL
              AND NEW.amount_paisa=effect.saved_delivery_share_paisa-effect.retained_outbound_paisa)
            OR (NEW.component='merchandise' AND (
              (effect.seller_principal_paisa>0 AND NEW.amount_paisa=effect.seller_principal_paisa
                AND NEW.party='seller' AND NEW.seller_id=item.seller_id)
              OR (effect.seller_principal_paisa=0 AND NEW.amount_paisa=effect.gross_item_paisa
                AND NEW.party=CASE WHEN refund.liability='seller' THEN 'platform' ELSE refund.liability END AND NEW.seller_id IS NULL)
            ))
          )
        )
      )
  ) THEN RAISE(ABORT,'refund_cost_requires_original_authorization') END;
END;
