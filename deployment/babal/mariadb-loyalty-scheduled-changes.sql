-- Additive 0072 companion. Requires the current weekly loyalty companion.
-- Existing rules, drafts, pause state, points and financial records stay intact.
ALTER TABLE loyalty_config ADD COLUMN IF NOT EXISTS scheduled_revision BIGINT NULL,
 ADD COLUMN IF NOT EXISTS scheduled_for BIGINT NULL,
 ADD COLUMN IF NOT EXISTS scheduled_unpause BIGINT NOT NULL DEFAULT 0 CHECK(scheduled_unpause IN (0,1)),
 ADD FOREIGN KEY IF NOT EXISTS loyalty_scheduled_revision_fk (scheduled_revision) REFERENCES loyalty_revisions(revision);

DELIMITER $$
CREATE TRIGGER IF NOT EXISTS loyalty_schedule_insert_guard BEFORE INSERT ON loyalty_config FOR EACH ROW
BEGIN
 IF (NEW.scheduled_revision IS NULL)<>(NEW.scheduled_for IS NULL)
 OR (NEW.scheduled_revision IS NULL AND NEW.scheduled_unpause<>0)
 OR (NEW.scheduled_revision IS NOT NULL AND (NEW.scheduled_for<0
 OR NEW.scheduled_revision=NEW.current_revision OR NEW.scheduled_revision=NEW.draft_revision
 OR NOT EXISTS(SELECT 1 FROM loyalty_revisions r WHERE r.revision=NEW.scheduled_revision AND r.starts_at=NEW.scheduled_for)))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid scheduled loyalty rules'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS loyalty_schedule_update_guard BEFORE UPDATE ON loyalty_config FOR EACH ROW
BEGIN
 IF (NEW.scheduled_revision IS NULL)<>(NEW.scheduled_for IS NULL)
 OR (NEW.scheduled_revision IS NULL AND NEW.scheduled_unpause<>0)
 OR (NEW.scheduled_revision IS NOT NULL AND (NEW.scheduled_for<0
 OR NEW.scheduled_revision=NEW.current_revision OR NEW.scheduled_revision=NEW.draft_revision
 OR NOT EXISTS(SELECT 1 FROM loyalty_revisions r WHERE r.revision=NEW.scheduled_revision AND r.starts_at=NEW.scheduled_for)))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid scheduled loyalty rules'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS loyalty_schedule_claim_guard BEFORE INSERT ON loyalty_daily_claims FOR EACH ROW
BEGIN
 IF EXISTS(SELECT 1 FROM loyalty_config WHERE BINARY id='default' AND scheduled_revision IS NOT NULL AND scheduled_for<=NEW.created_at)
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_scheduled_rules_due'; END IF;
END$$
DELIMITER ;
