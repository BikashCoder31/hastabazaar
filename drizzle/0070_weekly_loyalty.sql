-- Prospective weekly earning. Existing immutable fixed claims and revisions remain unchanged.
ALTER TABLE loyalty_revisions ADD COLUMN weekly_points_json TEXT;
--> statement-breakpoint
ALTER TABLE loyalty_revisions ADD COLUMN grace_enabled INTEGER NOT NULL DEFAULT 0 CHECK(grace_enabled IN (0,1));
--> statement-breakpoint
ALTER TABLE loyalty_daily_claims ADD COLUMN cycle_day INTEGER CHECK(cycle_day IS NULL OR (typeof(cycle_day)='integer' AND cycle_day BETWEEN 1 AND 7));
--> statement-breakpoint
ALTER TABLE loyalty_daily_claims ADD COLUMN cycle_number INTEGER CHECK(cycle_number IS NULL OR (typeof(cycle_number)='integer' AND cycle_number BETWEEN 1 AND 9007199254740991));
--> statement-breakpoint
ALTER TABLE loyalty_daily_claims ADD COLUMN grace_used INTEGER CHECK(grace_used IS NULL OR grace_used IN (0,1));
--> statement-breakpoint
ALTER TABLE loyalty_daily_claims ADD COLUMN grace_applied INTEGER CHECK(grace_applied IS NULL OR grace_applied IN (0,1));
--> statement-breakpoint
ALTER TABLE loyalty_daily_claims ADD COLUMN cycle_reset_reason TEXT CHECK(cycle_reset_reason IS NULL OR cycle_reset_reason IN ('first_claim','missed_day','cycle_complete'));
--> statement-breakpoint
CREATE INDEX idx_loyalty_claims_calendar ON loyalty_daily_claims(user_id,local_date);
--> statement-breakpoint
CREATE VIEW loyalty_latest_claims AS SELECT d.* FROM loyalty_daily_claims d WHERE NOT EXISTS(SELECT 1 FROM loyalty_daily_claims newer WHERE newer.user_id=d.user_id AND newer.local_date>d.local_date);
--> statement-breakpoint
CREATE TRIGGER loyalty_weekly_revision_guard BEFORE INSERT ON loyalty_revisions FOR EACH ROW WHEN
 (NEW.weekly_points_json IS NULL AND NEW.grace_enabled<>0)
 OR (NEW.weekly_points_json IS NOT NULL AND (
  json_valid(NEW.weekly_points_json)<>1 OR json_type(NEW.weekly_points_json)<>'array' OR json_array_length(NEW.weekly_points_json)<>7
  OR EXISTS(SELECT 1 FROM json_each(NEW.weekly_points_json) WHERE type<>'integer' OR value<1 OR value>9007199254740991)
  OR EXISTS(SELECT 1 FROM json_each(NEW.weekly_points_json) WHERE CAST(key AS INTEGER)>0 AND value<=json_extract(NEW.weekly_points_json,'$['||(CAST(key AS INTEGER)-1)||']'))
  OR (SELECT SUM(value) FROM json_each(NEW.weekly_points_json))>9007199254740991
  OR NEW.daily_points<>json_extract(NEW.weekly_points_json,'$[0]')
  OR NEW.daily_budget_points IS NULL OR NEW.daily_budget_points<json_extract(NEW.weekly_points_json,'$[6]')
  OR NEW.lifetime_budget_points IS NULL OR NEW.lifetime_budget_points<json_extract(NEW.weekly_points_json,'$[6]')
 )) BEGIN SELECT RAISE(ABORT,'loyalty_weekly_terms_invalid'); END;
--> statement-breakpoint
DROP TRIGGER loyalty_claim_guard;
--> statement-breakpoint
CREATE TRIGGER loyalty_claim_guard BEFORE INSERT ON loyalty_daily_claims FOR EACH ROW WHEN
 NEW.local_date<>strftime('%Y-%m-%d',NEW.created_at/1000,'unixepoch','+5 hours','+45 minutes')
 OR NOT EXISTS(SELECT 1 FROM loyalty_config c JOIN loyalty_revisions r ON r.revision=c.current_revision JOIN users u ON u.id=NEW.user_id JOIN loyalty_accounts a ON a.user_id=u.id
 WHERE c.paused=0 AND r.enabled=1 AND r.revision=NEW.revision AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='customer')
 AND NEW.created_at>=r.starts_at AND NEW.created_at<r.ends_at AND NEW.awarded_points=CASE WHEN r.weekly_points_json IS NULL THEN r.daily_points ELSE json_extract(r.weekly_points_json,'$['||(NEW.cycle_day-1)||']') END
 AND NEW.awarded_points<=r.lifetime_budget_points-c.issued_points
 AND NEW.awarded_points<=r.daily_budget_points-COALESCE((SELECT issued_points FROM loyalty_day_issuance WHERE local_date=NEW.local_date),0)
 AND NEW.awarded_points<=9007199254740991-a.balance_points)
 OR json_extract(NEW.response_json,'$.claimId') IS NOT NEW.id OR json_extract(NEW.response_json,'$.localDate') IS NOT NEW.local_date
 OR json_type(NEW.response_json,'$.awardedPoints') IS NOT 'integer' OR json_extract(NEW.response_json,'$.awardedPoints') IS NOT NEW.awarded_points
 OR json_type(NEW.response_json,'$.balancePoints') IS NOT 'integer' OR json_extract(NEW.response_json,'$.balancePoints') IS NOT (SELECT balance_points+NEW.awarded_points FROM loyalty_accounts WHERE user_id=NEW.user_id)
 BEGIN SELECT RAISE(ABORT,'loyalty_claim_unavailable'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_weekly_claim_guard BEFORE INSERT ON loyalty_daily_claims FOR EACH ROW WHEN NOT EXISTS(
 SELECT 1 FROM loyalty_config c JOIN loyalty_revisions r ON r.revision=c.current_revision LEFT JOIN loyalty_latest_claims p ON p.user_id=NEW.user_id
 WHERE c.id='default' AND r.revision=NEW.revision AND (
  (r.weekly_points_json IS NULL AND NEW.cycle_day IS NULL AND NEW.cycle_number IS NULL AND NEW.grace_used IS NULL AND NEW.grace_applied IS NULL AND NEW.cycle_reset_reason IS NULL AND json_type(NEW.response_json,'$.cycle') IS NULL)
  OR (r.weekly_points_json IS NOT NULL AND (p.local_date IS NULL OR NEW.local_date>p.local_date)
   AND NEW.cycle_day=(CASE WHEN ((CAST(julianday(NEW.local_date)-julianday(p.local_date) AS INTEGER)=1 AND p.cycle_day<7) OR (CAST(julianday(NEW.local_date)-julianday(p.local_date) AS INTEGER)=2 AND r.grace_enabled=1 AND p.grace_used=0 AND p.cycle_day<7)) THEN p.cycle_day+1 ELSE 1 END) AND NEW.cycle_number=(CASE WHEN p.cycle_day IS NULL THEN 1 WHEN ((CAST(julianday(NEW.local_date)-julianday(p.local_date) AS INTEGER)=1 AND p.cycle_day<7) OR (CAST(julianday(NEW.local_date)-julianday(p.local_date) AS INTEGER)=2 AND r.grace_enabled=1 AND p.grace_used=0 AND p.cycle_day<7)) THEN p.cycle_number ELSE p.cycle_number+1 END)
   AND NEW.grace_used=(CASE WHEN (CAST(julianday(NEW.local_date)-julianday(p.local_date) AS INTEGER)=2 AND r.grace_enabled=1 AND p.grace_used=0 AND p.cycle_day<7) THEN 1 WHEN (CAST(julianday(NEW.local_date)-julianday(p.local_date) AS INTEGER)=1 AND p.cycle_day<7) THEN p.grace_used ELSE 0 END) AND NEW.grace_applied=(CASE WHEN (CAST(julianday(NEW.local_date)-julianday(p.local_date) AS INTEGER)=2 AND r.grace_enabled=1 AND p.grace_used=0 AND p.cycle_day<7) THEN 1 ELSE 0 END)
   AND NEW.cycle_reset_reason IS (CASE WHEN p.cycle_day IS NULL THEN 'first_claim' WHEN ((CAST(julianday(NEW.local_date)-julianday(p.local_date) AS INTEGER)=1 AND p.cycle_day<7) OR (CAST(julianday(NEW.local_date)-julianday(p.local_date) AS INTEGER)=2 AND r.grace_enabled=1 AND p.grace_used=0 AND p.cycle_day<7)) THEN NULL WHEN CAST(julianday(NEW.local_date)-julianday(p.local_date) AS INTEGER)=1 AND p.cycle_day=7 THEN 'cycle_complete' ELSE 'missed_day' END)
   AND json_type(NEW.response_json,'$.cycle')='object'
   AND json_type(NEW.response_json,'$.cycle.day')='integer' AND json_extract(NEW.response_json,'$.cycle.day')=NEW.cycle_day
   AND json_type(NEW.response_json,'$.cycle.number')='integer' AND json_extract(NEW.response_json,'$.cycle.number')=NEW.cycle_number
   AND json_type(NEW.response_json,'$.cycle.graceUsed') IN ('true','false') AND json_extract(NEW.response_json,'$.cycle.graceUsed')=NEW.grace_used
   AND json_type(NEW.response_json,'$.cycle.graceApplied') IN ('true','false') AND json_extract(NEW.response_json,'$.cycle.graceApplied')=NEW.grace_applied
   AND json_type(NEW.response_json,'$.cycle.resetReason') IN ('null','text') AND json_extract(NEW.response_json,'$.cycle.resetReason') IS NEW.cycle_reset_reason
   AND json_type(NEW.response_json,'$.cycle.lastClaimDate') IN ('null','text') AND json_extract(NEW.response_json,'$.cycle.lastClaimDate') IS p.local_date
  )
 )) BEGIN SELECT RAISE(ABORT,'loyalty_weekly_claim_invalid'); END;
