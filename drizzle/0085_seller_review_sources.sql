-- Source artifact only. Initial applications/evidence have no invented review deadline.
ALTER TABLE review_tasks ADD COLUMN has_deadline INTEGER NOT NULL DEFAULT 1 CHECK(has_deadline IN (0,1));
--> statement-breakpoint
UPDATE review_tasks SET has_deadline=0 WHERE source_type='public_profile_correction';
--> statement-breakpoint
CREATE TRIGGER review_task_deadline_policy_immutable BEFORE UPDATE ON review_tasks
WHEN NEW.has_deadline IS NOT OLD.has_deadline
BEGIN SELECT RAISE(ABORT,'review_task_deadline_policy_immutable'); END;
--> statement-breakpoint
INSERT OR IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline)
 SELECT lower(hex(randomblob(16))),'seller_application',s.id,s.id,s.created_at,s.created_at,'no-agreed-deadline-v1',s.updated_at,0 FROM seller_profiles s;
--> statement-breakpoint
INSERT OR IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline)
 SELECT lower(hex(randomblob(16))),'seller_document',d.id,d.id,d.uploaded_at,d.uploaded_at,'no-agreed-deadline-v1',d.uploaded_at,0 FROM seller_documents d
 WHERE d.kind IN ('representative_identity','pan_certificate') AND d.protected_change_id IS NULL;
--> statement-breakpoint
CREATE TRIGGER seller_application_review_task_created AFTER INSERT ON seller_profiles
BEGIN INSERT OR IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline)
 VALUES(lower(hex(randomblob(16))),'seller_application',NEW.id,NEW.id,NEW.created_at,NEW.created_at,'no-agreed-deadline-v1',NEW.updated_at,0); END;
--> statement-breakpoint
CREATE TRIGGER seller_document_review_task_created AFTER INSERT ON seller_documents
WHEN NEW.kind IN ('representative_identity','pan_certificate') AND NEW.protected_change_id IS NULL
BEGIN INSERT OR IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline)
 VALUES(lower(hex(randomblob(16))),'seller_document',NEW.id,NEW.id,NEW.uploaded_at,NEW.uploaded_at,'no-agreed-deadline-v1',NEW.uploaded_at,0); END;
