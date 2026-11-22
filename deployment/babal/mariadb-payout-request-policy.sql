-- Additive source only. Existing rows retain NULL policy provenance; never execute on canonical/live data without the later cutover instruction.
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS purpose VARCHAR(191) NULL CHECK(purpose IS NULL OR purpose='seller_earnings_payout');
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS first_finance_due_at BIGINT NULL;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS calendar_version VARCHAR(191) NULL;
DELIMITER $$
CREATE OR REPLACE TRIGGER payout_request_policy_retained BEFORE UPDATE ON payout_requests FOR EACH ROW BEGIN IF NOT (NEW.purpose <=> OLD.purpose) OR NOT (NEW.first_finance_due_at <=> OLD.first_finance_due_at) OR NOT (NEW.calendar_version <=> OLD.calendar_version) OR NEW.seller_note<>OLD.seller_note OR NEW.created_at<>OLD.created_at THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_original_request_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER payout_request_policy_complete BEFORE INSERT ON payout_requests FOR EACH ROW BEGIN IF NEW.purpose IS NOT NULL AND (NEW.first_finance_due_at IS NULL OR NEW.first_finance_due_at<>NEW.created_at+86400000 OR NEW.calendar_version IS NULL OR NEW.calendar_version<>'continuous-v1') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_original_review_target_required'; END IF; END$$
DELIMITER ;
