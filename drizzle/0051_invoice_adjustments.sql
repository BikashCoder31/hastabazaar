CREATE TABLE IF NOT EXISTS managed_invoice_adjustments (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_group_id TEXT NOT NULL REFERENCES managed_invoice_groups(id) ON DELETE RESTRICT,
  adjustment_number TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('credit_note','debit_note')),
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
  reason_code TEXT NOT NULL,
  note TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  simulation_label TEXT NOT NULL CHECK(length(trim(simulation_label))>0),
  request_id TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  issued_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_managed_invoice_adjustments_invoice ON managed_invoice_adjustments(invoice_group_id,issued_at);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS managed_invoice_adjustment_no_update BEFORE UPDATE ON managed_invoice_adjustments BEGIN SELECT RAISE(ABORT,'managed_invoice_adjustment_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS managed_invoice_adjustment_no_delete BEFORE DELETE ON managed_invoice_adjustments BEGIN SELECT RAISE(ABORT,'managed_invoice_adjustment_immutable'); END;
