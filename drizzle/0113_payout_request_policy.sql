ALTER TABLE payout_requests ADD COLUMN purpose TEXT CHECK(purpose IS NULL OR purpose='seller_earnings_payout');
--> statement-breakpoint
ALTER TABLE payout_requests ADD COLUMN first_finance_due_at INTEGER;
--> statement-breakpoint
ALTER TABLE payout_requests ADD COLUMN calendar_version TEXT;
--> statement-breakpoint
CREATE TRIGGER payout_request_policy_retained BEFORE UPDATE ON payout_requests WHEN NEW.purpose IS NOT OLD.purpose OR NEW.first_finance_due_at IS NOT OLD.first_finance_due_at OR NEW.calendar_version IS NOT OLD.calendar_version OR NEW.seller_note<>OLD.seller_note OR NEW.created_at<>OLD.created_at BEGIN SELECT RAISE(ABORT,'payout_original_request_retained'); END;
--> statement-breakpoint
CREATE TRIGGER payout_request_policy_complete BEFORE INSERT ON payout_requests WHEN NEW.purpose IS NOT NULL AND (NEW.first_finance_due_at IS NULL OR NEW.first_finance_due_at<>NEW.created_at+86400000 OR NEW.calendar_version IS NULL OR NEW.calendar_version<>'continuous-v1') BEGIN SELECT RAISE(ABORT,'payout_original_review_target_required'); END;
