-- Task coordination only; authoritative decisions remain in their source records.
CREATE TABLE review_tasks (
 id TEXT PRIMARY KEY NOT NULL,
 source_type TEXT NOT NULL,
 source_id TEXT NOT NULL,
 source_revision TEXT NOT NULL,
 started_at INTEGER NOT NULL,
 due_at INTEGER NOT NULL,
 calendar_version TEXT NOT NULL,
 owner_id TEXT REFERENCES users(id),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at INTEGER NOT NULL,
 UNIQUE(source_type,source_id,source_revision),
 CHECK(due_at>=started_at)
);
--> statement-breakpoint
CREATE INDEX review_tasks_due ON review_tasks(due_at,owner_id);
--> statement-breakpoint
CREATE TRIGGER review_task_preserve_clock BEFORE UPDATE ON review_tasks
WHEN NEW.source_type IS NOT OLD.source_type OR NEW.source_id IS NOT OLD.source_id OR NEW.source_revision IS NOT OLD.source_revision
 OR NEW.started_at IS NOT OLD.started_at OR NEW.due_at IS NOT OLD.due_at OR NEW.calendar_version IS NOT OLD.calendar_version
BEGIN SELECT RAISE(ABORT,'review_task_source_clock_immutable'); END;
