-- Activate the policy-bound 9% setting only for future orders. Historical
-- order-item, ledger, price, commission and policy snapshots are not updated.
INSERT IGNORE INTO marketplace_settings (`key`, `value`, updated_by, updated_at)
VALUES (
  'seller_commission_bps:commission-9pct-v1',
  '900',
  NULL,
  CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS UNSIGNED)
);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS platform_discount_paisa BIGINT NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS commission_base_paisa BIGINT NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS commission_rule_version LONGTEXT NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS seller_agreement_version LONGTEXT NULL;

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS commission_base_refunded_paisa BIGINT NOT NULL DEFAULT 0;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS commission_reversal_paisa BIGINT NOT NULL DEFAULT 0;

ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS original_seal_intact BIGINT NOT NULL DEFAULT 0;

ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS settlement_terms_reference LONGTEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_ledger_refund_type_unique
  ON seller_ledger_entries (refund_id, type);
DROP INDEX IF EXISTS idx_seller_ledger_refund_unique ON seller_ledger_entries;
