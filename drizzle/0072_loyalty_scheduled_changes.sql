-- Additive scheduling metadata. Existing current rules, drafts and counters stay intact.
ALTER TABLE loyalty_config ADD COLUMN scheduled_revision INTEGER REFERENCES loyalty_revisions(revision);
--> statement-breakpoint
ALTER TABLE loyalty_config ADD COLUMN scheduled_for INTEGER;
--> statement-breakpoint
ALTER TABLE loyalty_config ADD COLUMN scheduled_unpause INTEGER NOT NULL DEFAULT 0 CHECK(scheduled_unpause IN (0,1));
--> statement-breakpoint
CREATE TRIGGER loyalty_schedule_insert_guard BEFORE INSERT ON loyalty_config
WHEN (NEW.scheduled_revision IS NULL)<>(NEW.scheduled_for IS NULL)
  OR (NEW.scheduled_revision IS NULL AND NEW.scheduled_unpause<>0)
  OR (NEW.scheduled_revision IS NOT NULL AND (
    typeof(NEW.scheduled_revision)<>'integer' OR typeof(NEW.scheduled_for)<>'integer' OR NEW.scheduled_for<0
    OR NEW.scheduled_revision=NEW.current_revision OR NEW.scheduled_revision=NEW.draft_revision
    OR NOT EXISTS(SELECT 1 FROM loyalty_revisions r WHERE r.revision=NEW.scheduled_revision AND r.starts_at=NEW.scheduled_for)))
BEGIN SELECT RAISE(ABORT,'Invalid scheduled loyalty rules'); END;
--> statement-breakpoint

-- Existing claim posting remains the sole points engine. Due changes must be
-- promoted in that same guarded transaction before any new source claim.
CREATE TRIGGER loyalty_schedule_claim_guard BEFORE INSERT ON loyalty_daily_claims
WHEN EXISTS(SELECT 1 FROM loyalty_config WHERE id='default' AND scheduled_revision IS NOT NULL AND scheduled_for<=NEW.created_at)
BEGIN SELECT RAISE(ABORT,'loyalty_scheduled_rules_due'); END;
--> statement-breakpoint
CREATE TRIGGER loyalty_schedule_update_guard BEFORE UPDATE ON loyalty_config
WHEN (NEW.scheduled_revision IS NULL)<>(NEW.scheduled_for IS NULL)
  OR (NEW.scheduled_revision IS NULL AND NEW.scheduled_unpause<>0)
  OR (NEW.scheduled_revision IS NOT NULL AND (
    typeof(NEW.scheduled_revision)<>'integer' OR typeof(NEW.scheduled_for)<>'integer' OR NEW.scheduled_for<0
    OR NEW.scheduled_revision=NEW.current_revision OR NEW.scheduled_revision=NEW.draft_revision
    OR NOT EXISTS(SELECT 1 FROM loyalty_revisions r WHERE r.revision=NEW.scheduled_revision AND r.starts_at=NEW.scheduled_for)))
BEGIN SELECT RAISE(ABORT,'Invalid scheduled loyalty rules'); END;
