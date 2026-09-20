-- Activates the policy-bound 9% setting for future orders without changing
-- the legacy setting key or any historical order/ledger snapshot.
INSERT OR IGNORE INTO marketplace_settings (key, value, updated_by, updated_at)
VALUES (
  'seller_commission_bps:commission-9pct-v1',
  '900',
  NULL,
  unixepoch() * 1000
);

ALTER TABLE order_items ADD COLUMN platform_discount_paisa INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN commission_base_paisa INTEGER;
ALTER TABLE order_items ADD COLUMN commission_rule_version TEXT;
ALTER TABLE order_items ADD COLUMN seller_agreement_version TEXT;

ALTER TABLE refunds ADD COLUMN commission_base_refunded_paisa INTEGER NOT NULL DEFAULT 0;
ALTER TABLE refunds ADD COLUMN commission_reversal_paisa INTEGER NOT NULL DEFAULT 0;

ALTER TABLE return_requests ADD COLUMN original_seal_intact INTEGER NOT NULL DEFAULT 0;

ALTER TABLE seller_profiles ADD COLUMN settlement_terms_reference TEXT;

DROP INDEX IF EXISTS idx_seller_ledger_refund_unique;
CREATE UNIQUE INDEX idx_seller_ledger_refund_type_unique
  ON seller_ledger_entries (refund_id, type);
