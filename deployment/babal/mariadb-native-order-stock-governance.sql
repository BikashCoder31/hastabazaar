-- Restore seller governance lost when 0088 replaced the native inventory guard.
-- Legacy inventory is still decremented only by the existing conditional AFTER trigger.
DELIMITER $$
CREATE OR REPLACE TRIGGER order_items_require_available_inventory BEFORE INSERT ON order_items FOR EACH ROW
BEGIN
  DECLARE product_seller VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;
  DECLARE legacy_stock BIGINT DEFAULT NULL;
  DECLARE mapped_inventory TINYINT DEFAULT 0;

  SELECT p.seller_id, p.inventory_quantity INTO product_seller, legacy_stock
    FROM products p
    WHERE p.id=NEW.product_id AND p.status='published'
    FOR UPDATE;
  IF product_seller IS NULL OR NOT EXISTS (
    SELECT 1
    FROM seller_profiles s
    JOIN users u ON u.id=s.user_id
    LEFT JOIN seller_participation_profiles participation ON participation.seller_id=s.id
    WHERE s.id=product_seller
      AND u.status='active'
      AND (
        (s.status='approved' AND (participation.participation_route IS NULL OR participation.participation_route='registered_seller'))
        OR (
          participation.participation_route='managed_maker'
          AND participation.application_stage='active'
          AND participation.commercial_model IS NOT NULL
          AND participation.legal_seller_reference IS NOT NULL
          AND participation.invoice_issuer_reference IS NOT NULL
          AND participation.payout_beneficiary_reference IS NOT NULL
          AND participation.managed_agreement_version IS NOT NULL
          AND participation.managed_agreement_accepted_at IS NOT NULL
        )
      )
    FOR UPDATE
  ) OR EXISTS (
    SELECT 1 FROM product_deletions d WHERE d.product_id=NEW.product_id FOR UPDATE
  ) OR EXISTS (
    SELECT 1 FROM seller_restrictions restriction
    WHERE restriction.seller_id=product_seller AND (
      restriction.mode='disabled'
      OR (restriction.mode='suspended' AND restriction.suspended_until>UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)
    )
    FOR UPDATE
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_unavailable';
  END IF;

  SELECT h.inventory_mapped INTO mapped_inventory
    FROM product_offer_heads h WHERE h.product_id=NEW.product_id FOR UPDATE;
  IF mapped_inventory=1 THEN
    IF NOT EXISTS (
      SELECT 1
      FROM offer_stock_reservations r
      JOIN product_offer_identities i ON i.id=r.offer_id
      JOIN orders o ON o.id=NEW.order_id
      WHERE r.id=NEW.offer_reservation_id AND i.product_id=NEW.product_id
        AND r.state='reserved' AND r.quantity=NEW.quantity AND r.customer_id <=> o.customer_id
        AND JSON_UNQUOTE(JSON_EXTRACT(r.snapshot_json,'$.sellingPaisa'))=NEW.unit_price_paisa
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(r.snapshot_json,'$.sku'))=BINARY NEW.sku_snapshot
      FOR UPDATE
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='exact_offer_reservation_required';
    END IF;
  ELSEIF NEW.offer_reservation_id IS NOT NULL OR NOT COALESCE(legacy_stock>=NEW.quantity,0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_unavailable';
  END IF;
END$$
DELIMITER ;
