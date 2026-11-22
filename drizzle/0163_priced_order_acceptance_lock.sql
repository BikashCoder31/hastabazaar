-- A priced purchase retains its original terms after the pricing capability is disabled.
CREATE TRIGGER priced_order_acceptance_insert BEFORE INSERT ON order_policy_acceptances BEGIN
  -- REPLACE can delete a colliding row without calling its DELETE triggers.
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM order_policy_acceptances AS retained
    WHERE (retained.id=NEW.id OR retained.order_id=NEW.order_id OR retained.request_id=NEW.request_id)
      AND EXISTS(SELECT 1 FROM order_item_pricing_snapshots WHERE order_id=retained.order_id)
  ) THEN RAISE(ABORT,'priced_order_acceptance_immutable') END;

  -- Checkout inserts pricing snapshots before the original acceptance in the same batch.
  SELECT CASE WHEN EXISTS(SELECT 1 FROM order_item_pricing_snapshots WHERE order_id=NEW.order_id) THEN
    CASE
      WHEN NOT json_valid(NEW.terms_snapshot_json)
        THEN RAISE(ABORT,'priced_order_acceptance_mismatch')
      WHEN json_type(NEW.terms_snapshot_json,'$.variantPricingRuleVersion') IS NOT 'text'
        OR json_type(NEW.terms_snapshot_json,'$.reviewedQuote.lines') IS NOT 'array'
        THEN RAISE(ABORT,'priced_order_acceptance_mismatch')
      WHEN (SELECT COUNT(*) FROM json_each(NEW.terms_snapshot_json,'$.reviewedQuote.lines') AS line
        WHERE json_type(NEW.terms_snapshot_json,line.fullkey||'.pricingRuleVersion') IS NOT NULL)
      <> (SELECT COUNT(*) FROM order_item_pricing_snapshots WHERE order_id=NEW.order_id)
        THEN RAISE(ABORT,'priced_order_acceptance_mismatch')
      WHEN EXISTS(
        SELECT 1 FROM order_item_pricing_snapshots AS priced
        JOIN order_items AS item ON item.id=priced.order_item_id
        WHERE priced.order_id=NEW.order_id AND NOT EXISTS(
          SELECT 1 FROM json_each(NEW.terms_snapshot_json,'$.reviewedQuote.lines') AS line
          WHERE json_extract(NEW.terms_snapshot_json,line.fullkey||'.pricingRuleVersion')
              =json_extract(priced.snapshot_json,'$.ruleVersion')
            AND json_extract(NEW.terms_snapshot_json,'$.variantPricingRuleVersion')
              =json_extract(priced.snapshot_json,'$.ruleVersion')
            AND json_extract(NEW.terms_snapshot_json,line.fullkey||'.offerId')=json_extract(priced.snapshot_json,'$.offerId')
            AND json_extract(NEW.terms_snapshot_json,line.fullkey||'.offerVersionId')=json_extract(priced.snapshot_json,'$.offerVersionId')
            AND json_extract(NEW.terms_snapshot_json,line.fullkey||'.publicVersionId')=json_extract(priced.snapshot_json,'$.publicVersionId')
            AND json_extract(NEW.terms_snapshot_json,line.fullkey||'.sellerId')=item.seller_id
            AND json_type(NEW.terms_snapshot_json,line.fullkey||'.quantity')='integer'
            AND json_extract(NEW.terms_snapshot_json,line.fullkey||'.quantity')=json_extract(priced.snapshot_json,'$.quantity')
            AND json_type(NEW.terms_snapshot_json,line.fullkey||'.pricePaisa')='integer'
            AND json_extract(NEW.terms_snapshot_json,line.fullkey||'.pricePaisa')=json_extract(priced.snapshot_json,'$.customerUnitPaisa')
        )
      ) THEN RAISE(ABORT,'priced_order_acceptance_mismatch')
    END END;
END;
--> statement-breakpoint
CREATE TRIGGER priced_order_acceptance_update BEFORE UPDATE ON order_policy_acceptances WHEN
  EXISTS(
    SELECT 1 FROM order_policy_acceptances AS retained
    WHERE retained.id<>OLD.id
      AND (retained.id=NEW.id OR retained.order_id=NEW.order_id OR retained.request_id=NEW.request_id)
      AND EXISTS(SELECT 1 FROM order_item_pricing_snapshots WHERE order_id=retained.order_id)
  ) OR (
    EXISTS(SELECT 1 FROM order_item_pricing_snapshots WHERE order_id IN(OLD.order_id,NEW.order_id))
    AND (
      NEW.id IS NOT OLD.id OR NEW.order_id IS NOT OLD.order_id OR NEW.policy_version IS NOT OLD.policy_version
      OR NEW.terms_snapshot_json IS NOT OLD.terms_snapshot_json OR NEW.acceptance_method IS NOT OLD.acceptance_method
      OR NEW.request_id IS NOT OLD.request_id OR NEW.accepted_at IS NOT OLD.accepted_at
      -- The actor's user row is already gone when the foreign key sets this column to NULL.
      OR (NEW.actor_user_id IS NOT OLD.actor_user_id AND (
        NEW.actor_user_id IS NOT NULL OR EXISTS(SELECT 1 FROM users WHERE id=OLD.actor_user_id)
      ))
    )
  )
BEGIN
  SELECT RAISE(ABORT,'priced_order_acceptance_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER priced_order_acceptance_delete BEFORE DELETE ON order_policy_acceptances
WHEN EXISTS(SELECT 1 FROM order_item_pricing_snapshots WHERE order_id=OLD.order_id)
BEGIN
  SELECT RAISE(ABORT,'priced_order_acceptance_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER priced_order_acceptance_snapshot_insert BEFORE INSERT ON order_item_pricing_snapshots
WHEN EXISTS(SELECT 1 FROM order_policy_acceptances WHERE order_id=NEW.order_id)
BEGIN
  SELECT RAISE(ABORT,'order_item_pricing_immutable');
END;
