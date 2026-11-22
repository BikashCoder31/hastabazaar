-- Source only. Priority coordination never changes availability, product approval or orders.
CREATE TABLE product_priority_events(id TEXT PRIMARY KEY,case_id TEXT NOT NULL,product_id TEXT NOT NULL REFERENCES products(id),revision INTEGER NOT NULL CHECK(revision>=0),kind TEXT NOT NULL CHECK(kind IN ('reported','triaged','resolved')),actor_id TEXT NOT NULL REFERENCES users(id),detail_json TEXT NOT NULL CHECK(json_valid(detail_json)),created_at INTEGER NOT NULL,UNIQUE(case_id,revision));
--> statement-breakpoint
CREATE TABLE product_priority_cases(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),kind TEXT NOT NULL CHECK(kind IN ('price_error','safety','misleading')),public_version_id TEXT REFERENCES product_publication_candidates(id),reported_by TEXT NOT NULL REFERENCES users(id),state TEXT NOT NULL CHECK(state IN ('open','waiting_seller','resolved')),active_slot INTEGER,revision INTEGER NOT NULL CHECK(revision>=0),backup_id TEXT REFERENCES users(id),backup_unavailable_reason TEXT NOT NULL DEFAULT '',next_update_at INTEGER,triaged_at INTEGER,last_event_id TEXT NOT NULL REFERENCES product_priority_events(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(product_id,kind,active_slot),CHECK((state='resolved' AND active_slot IS NULL) OR (state<>'resolved' AND active_slot=1)));
--> statement-breakpoint
CREATE TRIGGER product_priority_case_source BEFORE INSERT ON product_priority_cases WHEN NEW.revision<>0 OR NEW.state<>'open' OR NEW.backup_id IS NOT NULL OR NEW.next_update_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM product_priority_events e JOIN users u ON u.id=e.actor_id WHERE e.id=NEW.last_event_id AND e.case_id=NEW.id AND e.product_id=NEW.product_id AND e.revision=0 AND e.kind='reported' AND e.actor_id=NEW.reported_by AND u.status='active') BEGIN SELECT RAISE(ABORT,'product_priority_case_source'); END;
--> statement-breakpoint
CREATE TRIGGER product_priority_task_created AFTER INSERT ON product_priority_cases BEGIN INSERT INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline) VALUES('priority-'||NEW.id,'product_priority',NEW.id,NEW.id,NEW.created_at,NEW.created_at,'no-agreed-deadline-v1',NEW.updated_at,0); END;
--> statement-breakpoint
CREATE TRIGGER product_priority_case_revision BEFORE UPDATE ON product_priority_cases WHEN OLD.state='resolved' OR NEW.id<>OLD.id OR NEW.product_id<>OLD.product_id OR NEW.kind<>OLD.kind OR NEW.public_version_id IS NOT OLD.public_version_id OR NEW.reported_by<>OLD.reported_by OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR NOT EXISTS(SELECT 1 FROM product_priority_events e JOIN review_tasks t ON t.source_type='product_priority' AND t.source_id=NEW.id AND t.source_revision=NEW.id WHERE e.id=NEW.last_event_id AND e.case_id=NEW.id AND e.product_id=NEW.product_id AND e.revision=NEW.revision AND json_extract(e.detail_json,'$.state')=NEW.state AND json_extract(e.detail_json,'$.backupId') IS NEW.backup_id AND json_extract(e.detail_json,'$.backupUnavailableReason')=NEW.backup_unavailable_reason AND json_extract(e.detail_json,'$.nextUpdateAt') IS NEW.next_update_at AND json_extract(e.detail_json,'$.ownerId') IS t.owner_id) BEGIN SELECT RAISE(ABORT,'product_priority_case_revision'); END;
--> statement-breakpoint
CREATE TRIGGER product_priority_event_immutable BEFORE UPDATE ON product_priority_events BEGIN SELECT RAISE(ABORT,'product_priority_event_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER product_priority_event_retained BEFORE DELETE ON product_priority_events BEGIN SELECT RAISE(ABORT,'product_priority_event_retained'); END;
--> statement-breakpoint
CREATE TRIGGER product_priority_case_retained BEFORE DELETE ON product_priority_cases BEGIN SELECT RAISE(ABORT,'product_priority_case_retained'); END;

--> statement-breakpoint
CREATE TABLE product_priority_report_media(event_id TEXT NOT NULL REFERENCES product_priority_events(id),media_id TEXT NOT NULL REFERENCES product_media(id),PRIMARY KEY(event_id,media_id));
--> statement-breakpoint
CREATE TRIGGER product_priority_media_source BEFORE INSERT ON product_priority_report_media WHEN NOT EXISTS(SELECT 1 FROM product_priority_events e JOIN product_media m ON m.product_id=e.product_id WHERE e.id=NEW.event_id AND e.kind='reported' AND m.id=NEW.media_id) BEGIN SELECT RAISE(ABORT,'product_priority_media_source'); END;
--> statement-breakpoint
CREATE TRIGGER product_priority_media_immutable BEFORE UPDATE ON product_priority_report_media BEGIN SELECT RAISE(ABORT,'product_priority_media_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER product_priority_media_retained BEFORE DELETE ON product_priority_report_media BEGIN SELECT RAISE(ABORT,'product_priority_media_retained'); END;

--> statement-breakpoint
CREATE TRIGGER product_priority_media_file_retained BEFORE UPDATE ON product_media WHEN EXISTS(SELECT 1 FROM product_priority_report_media WHERE media_id=OLD.id) AND (NEW.id<>OLD.id OR NEW.product_id<>OLD.product_id OR NEW.object_key<>OLD.object_key OR NEW.mime_type<>OLD.mime_type OR NEW.size_bytes<>OLD.size_bytes) BEGIN SELECT RAISE(ABORT,'product_priority_media_file_retained'); END;
