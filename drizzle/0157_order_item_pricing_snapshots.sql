CREATE TABLE order_item_pricing_snapshots (
  order_item_id TEXT NOT NULL PRIMARY KEY REFERENCES order_items(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json) AND json_type(snapshot_json)='object'),
  created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE INDEX order_item_pricing_snapshots_order ON order_item_pricing_snapshots(order_id, order_item_id);
--> statement-breakpoint
CREATE TRIGGER order_item_pricing_snapshot_insert BEFORE INSERT ON order_item_pricing_snapshots BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM order_item_pricing_snapshots WHERE order_item_id=NEW.order_item_id
  ) THEN RAISE(ABORT,'order_item_pricing_immutable') END;
  SELECT CASE WHEN NOT json_valid(NEW.snapshot_json) THEN RAISE(ABORT,'order_item_pricing_mismatch') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1
    FROM order_items AS item
    JOIN orders AS purchase ON purchase.id=item.order_id
    JOIN order_item_offer_snapshots AS offer ON offer.order_item_id=item.id
      AND offer.reservation_id=item.offer_reservation_id AND offer.legacy_mapping=0
    LEFT JOIN managed_commercial_snapshots AS managed ON managed.order_item_id=item.id
    WHERE item.id=NEW.order_item_id AND item.order_id=NEW.order_id AND item.created_at=NEW.created_at
      AND json_extract(NEW.snapshot_json,'$.ruleVersion')='variant-price-addition-v1'
      AND json_extract(NEW.snapshot_json,'$.offerId')=offer.offer_id
      AND json_extract(NEW.snapshot_json,'$.offerVersionId')=offer.version_id
      AND json_extract(NEW.snapshot_json,'$.publicVersionId')=json_extract(offer.snapshot_json,'$.publicVersionId')
      AND json_type(NEW.snapshot_json,'$.publicVersionId')='text'
      AND json_type(NEW.snapshot_json,'$.returnEligible') IN ('true','false')
      AND json_extract(NEW.snapshot_json,'$.returnEligible')=item.return_eligible_snapshot
      AND json_type(NEW.snapshot_json,'$.quantity')='integer'
      AND json_extract(NEW.snapshot_json,'$.quantity')=item.quantity
      AND item.quantity BETWEEN 1 AND 1000
      AND json_type(NEW.snapshot_json,'$.sellerBasePaisa')='integer'
      AND json_extract(NEW.snapshot_json,'$.sellerBasePaisa')=item.unit_price_paisa
      AND json_extract(offer.snapshot_json,'$.sellingPaisa')=item.unit_price_paisa
      AND item.unit_price_paisa BETWEEN 1 AND 9007199254740991
      AND json_type(NEW.snapshot_json,'$.additionPaisa')='integer'
      AND json_extract(NEW.snapshot_json,'$.additionPaisa') BETWEEN 0 AND 9007199254740991
      AND json_extract(NEW.snapshot_json,'$.additionPaisa')=CASE
        WHEN item.return_eligible_snapshot=1 THEN CASE WHEN item.unit_price_paisa<40000 THEN 4000 ELSE 8000 END
        ELSE 100 * (CAST(item.unit_price_paisa / 2000 AS INTEGER)
          + CASE WHEN item.unit_price_paisa % 2000 >= 1000 THEN 1 ELSE 0 END)
      END
      AND json_type(NEW.snapshot_json,'$.customerUnitPaisa')='integer'
      AND json_extract(NEW.snapshot_json,'$.customerUnitPaisa') BETWEEN 1 AND 9007199254740991
      AND json_extract(NEW.snapshot_json,'$.customerUnitPaisa')=item.unit_price_paisa+json_extract(NEW.snapshot_json,'$.additionPaisa')
      AND json_type(NEW.snapshot_json,'$.discounts.sellerFundedPaisa')='integer'
      AND json_extract(NEW.snapshot_json,'$.discounts.sellerFundedPaisa')=item.seller_discount_paisa
      AND item.seller_discount_paisa>=0
      AND item.line_total_paisa=item.unit_price_paisa*item.quantity-item.seller_discount_paisa
      AND item.line_total_paisa BETWEEN 0 AND 9007199254740991
      AND json_type(NEW.snapshot_json,'$.discounts.platformPromoPaisa')='integer'
      AND json_extract(NEW.snapshot_json,'$.discounts.platformPromoPaisa')=item.promo_discount_paisa
      AND json_type(NEW.snapshot_json,'$.discounts.platformReferralPaisa')='integer'
      AND json_extract(NEW.snapshot_json,'$.discounts.platformReferralPaisa')=item.referral_discount_paisa
      AND item.platform_discount_paisa=item.promo_discount_paisa+item.referral_discount_paisa
      AND json_type(NEW.snapshot_json,'$.discounts.promoCampaignId') IN ('text','null')
      AND json_extract(NEW.snapshot_json,'$.discounts.promoCampaignId') IS purchase.promo_campaign_id
      AND json_type(NEW.snapshot_json,'$.discounts.promoVersion') IN ('integer','null')
      AND json_extract(NEW.snapshot_json,'$.discounts.promoVersion') IS purchase.promo_revision
      AND json_type(NEW.snapshot_json,'$.taxPaisa')='integer'
      AND json_extract(NEW.snapshot_json,'$.taxPaisa')=item.tax_paisa AND item.tax_paisa>=0
      AND json_type(NEW.snapshot_json,'$.customerSubtotalPaisa')='integer'
      AND json_extract(NEW.snapshot_json,'$.customerSubtotalPaisa') BETWEEN 1 AND 9007199254740991
      AND json_extract(NEW.snapshot_json,'$.customerSubtotalPaisa')=json_extract(NEW.snapshot_json,'$.customerUnitPaisa')*item.quantity
      AND item.seller_discount_paisa+item.platform_discount_paisa<=json_extract(NEW.snapshot_json,'$.customerSubtotalPaisa')
      AND json_type(NEW.snapshot_json,'$.customerTotalPaisa')='integer'
      AND json_extract(NEW.snapshot_json,'$.customerTotalPaisa') BETWEEN 0 AND 9007199254740991
      AND json_extract(NEW.snapshot_json,'$.customerTotalPaisa')=
        json_extract(NEW.snapshot_json,'$.customerSubtotalPaisa')-item.seller_discount_paisa-item.platform_discount_paisa+item.tax_paisa
      AND json_type(NEW.snapshot_json,'$.creditAppliedPaisa')='integer'
      AND json_extract(NEW.snapshot_json,'$.creditAppliedPaisa') BETWEEN 0 AND purchase.wallet_credit_paisa
      AND json_type(NEW.snapshot_json,'$.cashPayablePaisa')='integer'
      AND json_extract(NEW.snapshot_json,'$.cashPayablePaisa') BETWEEN 0 AND 9007199254740991
      AND json_extract(NEW.snapshot_json,'$.cashPayablePaisa')=
        json_extract(NEW.snapshot_json,'$.customerTotalPaisa')-json_extract(NEW.snapshot_json,'$.creditAppliedPaisa')
      AND json_extract(NEW.snapshot_json,'$.commission.ruleVersion')=item.commission_rule_version
      AND json_type(NEW.snapshot_json,'$.commission.settingVersionId') IN ('text','null')
      AND json_type(NEW.snapshot_json,'$.commission.acceptanceId') IN ('text','null')
      AND json_type(NEW.snapshot_json,'$.commission.bps')='integer'
      AND json_type(NEW.snapshot_json,'$.commission.basePaisa')='integer'
      AND json_extract(NEW.snapshot_json,'$.commission.basePaisa')=item.line_total_paisa
      AND json_type(NEW.snapshot_json,'$.commission.amountPaisa')='integer'
      AND json_extract(NEW.snapshot_json,'$.commission.amountPaisa') BETWEEN 0 AND item.line_total_paisa
      AND (
        (json_extract(NEW.snapshot_json,'$.commission.kind')='registered'
          AND managed.order_item_id IS NULL
          AND json_extract(NEW.snapshot_json,'$.commission.agreementVersion')=item.seller_agreement_version
          AND json_extract(NEW.snapshot_json,'$.commission.bps')=item.commission_bps
          AND json_extract(NEW.snapshot_json,'$.commission.basePaisa')=item.commission_base_paisa
          AND json_extract(NEW.snapshot_json,'$.commission.amountPaisa')=item.commission_paisa
        ) OR
        (json_extract(NEW.snapshot_json,'$.commission.kind')='managed_sale_linked'
          AND managed.record_kind='live' AND managed.commercial_model='managed_sale_linked_percentage_v1'
          AND managed.seller_id=item.seller_id
          AND managed.product_value_paisa=item.unit_price_paisa*item.quantity
          AND managed.maker_funded_discount_paisa=item.seller_discount_paisa
          AND managed.platform_funded_discount_paisa=item.platform_discount_paisa
          AND json_extract(NEW.snapshot_json,'$.commission.agreementVersion')=managed.agreement_version
          AND json_extract(NEW.snapshot_json,'$.commission.settingVersionId') IS managed.terms_setting_version_id
          AND json_extract(NEW.snapshot_json,'$.commission.acceptanceId') IS managed.accepted_managed_detail_id
          AND json_extract(NEW.snapshot_json,'$.commission.bps')=managed.platform_retention_bps
          AND json_extract(NEW.snapshot_json,'$.commission.basePaisa')=managed.eligible_base_paisa
          AND json_extract(NEW.snapshot_json,'$.commission.amountPaisa')=managed.platform_retained_paisa
        )
      )
  ) THEN RAISE(ABORT,'order_item_pricing_mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER order_item_pricing_snapshot_no_update BEFORE UPDATE ON order_item_pricing_snapshots
BEGIN SELECT RAISE(ABORT,'order_item_pricing_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER order_item_pricing_snapshot_no_delete BEFORE DELETE ON order_item_pricing_snapshots
BEGIN SELECT RAISE(ABORT,'order_item_pricing_immutable'); END;
