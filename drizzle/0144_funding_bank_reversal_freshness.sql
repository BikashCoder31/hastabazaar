-- Source only. Canonical/live migration remains held.
-- A later actual bank reversal requires an independently reverified balance, never an inferred replacement.
CREATE TRIGGER funding_bank_reversal_new_0 BEFORE INSERT ON outgoing_payment_packets
WHEN NEW.amount_paisa>0 AND NEW.funding_statement_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=NEW.funding_statement_id AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed JOIN company_money_receipts receipt ON receipt.id=reversed.receipt_id JOIN company_payment_account_versions bank_version ON bank_version.id=receipt.account_version_id WHERE bank_version.account_id=s.account_id AND reversed.bank_at>s.as_of))
BEGIN SELECT RAISE(ABORT,'funding_reverify_bank_balance_after_reversal_required'); END;
--> statement-breakpoint
CREATE TRIGGER funding_bank_reversal_unsent_0 BEFORE UPDATE ON outgoing_payment_packets
WHEN NEW.amount_paisa>0 AND OLD.state IN('prepared','approved') AND NEW.state IN('prepared','approved','processing') AND NOT EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=NEW.funding_statement_id AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed JOIN company_money_receipts receipt ON receipt.id=reversed.receipt_id JOIN company_payment_account_versions bank_version ON bank_version.id=receipt.account_version_id WHERE bank_version.account_id=s.account_id AND reversed.bank_at>s.as_of))
BEGIN SELECT RAISE(ABORT,'funding_reverify_bank_balance_after_reversal_required'); END;
--> statement-breakpoint
CREATE TRIGGER funding_bank_reversal_new_1 BEFORE INSERT ON payout_transfer_packets
WHEN NEW.amount_paisa>0 AND NEW.funding_statement_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=NEW.funding_statement_id AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed JOIN company_money_receipts receipt ON receipt.id=reversed.receipt_id JOIN company_payment_account_versions bank_version ON bank_version.id=receipt.account_version_id WHERE bank_version.account_id=s.account_id AND reversed.bank_at>s.as_of))
BEGIN SELECT RAISE(ABORT,'funding_reverify_bank_balance_after_reversal_required'); END;
--> statement-breakpoint
CREATE TRIGGER funding_bank_reversal_unsent_1 BEFORE UPDATE ON payout_transfer_packets
WHEN NEW.amount_paisa>0 AND OLD.state IN('prepared','approved') AND NEW.state IN('prepared','approved','processing') AND NOT EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=NEW.funding_statement_id AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed JOIN company_money_receipts receipt ON receipt.id=reversed.receipt_id JOIN company_payment_account_versions bank_version ON bank_version.id=receipt.account_version_id WHERE bank_version.account_id=s.account_id AND reversed.bank_at>s.as_of))
BEGIN SELECT RAISE(ABORT,'funding_reverify_bank_balance_after_reversal_required'); END;
--> statement-breakpoint
CREATE TRIGGER funding_bank_reversal_reservation BEFORE UPDATE ON company_funding_accounts
WHEN NEW.statement_id=OLD.statement_id AND NEW.revision<>OLD.revision AND NOT EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=OLD.statement_id AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed JOIN company_money_receipts receipt ON receipt.id=reversed.receipt_id JOIN company_payment_account_versions bank_version ON bank_version.id=receipt.account_version_id WHERE bank_version.account_id=s.account_id AND reversed.bank_at>s.as_of))
BEGIN SELECT RAISE(ABORT,'funding_reverify_bank_balance_after_reversal_required'); END;
