-- Source only: retain incomplete private drafts and explicit frozen assistance candidates.
CREATE TABLE product_intake_workspace_versions(id TEXT PRIMARY KEY,draft_id TEXT NOT NULL REFERENCES product_intake_drafts(id),revision INTEGER NOT NULL,kind TEXT NOT NULL DEFAULT 'private' CHECK(kind IN ('private','review_only')),base_public_version_id TEXT,snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,CHECK((kind='private' AND base_public_version_id IS NULL) OR (kind='review_only' AND base_public_version_id IS NOT NULL)));
--> statement-breakpoint
CREATE TABLE product_intake_workspace_heads(draft_id TEXT PRIMARY KEY REFERENCES product_intake_drafts(id),version_id TEXT NOT NULL REFERENCES product_intake_workspace_versions(id));
--> statement-breakpoint
CREATE TABLE product_intake_media(id TEXT PRIMARY KEY,draft_id TEXT NOT NULL REFERENCES product_intake_drafts(id),owner_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,object_key TEXT NOT NULL UNIQUE,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL CHECK(size_bytes>0),original_name TEXT NOT NULL,content_digest TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('uploading','ready')),created_at INTEGER NOT NULL,completed_at INTEGER,UNIQUE(owner_id,request_id));
--> statement-breakpoint
CREATE TABLE product_intake_cases(id TEXT PRIMARY KEY,draft_id TEXT NOT NULL REFERENCES product_intake_drafts(id),cycle_number INTEGER NOT NULL DEFAULT 0 CHECK(cycle_number>=0),version_id TEXT NOT NULL REFERENCES product_intake_workspace_versions(id),revision INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL CHECK(state IN ('details_needed','submitted','in_review','waiting_seller','ready_for_decision','resolved')),first_requested_at INTEGER NOT NULL,triage_due_at INTEGER NOT NULL,triaged_at INTEGER,first_complete_at INTEGER,review_due_at INTEGER,first_reviewed_at INTEGER,last_event_id TEXT NOT NULL,active_proposal_id TEXT,CHECK(revision>=0 AND triage_due_at>=first_requested_at));
--> statement-breakpoint
CREATE TABLE product_intake_events(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES product_intake_cases(id),version_id TEXT NOT NULL REFERENCES product_intake_workspace_versions(id),event_key TEXT NOT NULL UNIQUE,kind TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),detail_json TEXT NOT NULL CHECK(json_valid(detail_json)),created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE product_intake_proposals(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES product_intake_cases(id),base_version_id TEXT NOT NULL REFERENCES product_intake_workspace_versions(id),patch_json TEXT NOT NULL CHECK(json_valid(patch_json)),source_note TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','accepted','declined','superseded')),decided_by TEXT REFERENCES users(id),decided_at INTEGER,accepted_version_id TEXT REFERENCES product_intake_workspace_versions(id));
--> statement-breakpoint
CREATE TRIGGER product_intake_workspace_immutable BEFORE UPDATE ON product_intake_workspace_versions BEGIN SELECT RAISE(ABORT,'product_intake_workspace_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER product_intake_workspace_retained BEFORE DELETE ON product_intake_workspace_versions BEGIN SELECT RAISE(ABORT,'product_intake_workspace_retained'); END;
--> statement-breakpoint
CREATE TRIGGER product_intake_event_immutable BEFORE UPDATE ON product_intake_events BEGIN SELECT RAISE(ABORT,'product_intake_event_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER product_intake_event_retained BEFORE DELETE ON product_intake_events BEGIN SELECT RAISE(ABORT,'product_intake_event_retained'); END;
--> statement-breakpoint
CREATE INDEX product_intake_media_draft ON product_intake_media(draft_id,created_at,id);
--> statement-breakpoint
CREATE INDEX product_intake_event_history ON product_intake_events(case_id,created_at,id);
--> statement-breakpoint
CREATE INDEX product_intake_proposal_history ON product_intake_proposals(case_id,created_at,id);
--> statement-breakpoint
CREATE TRIGGER product_intake_head_insert BEFORE INSERT ON product_intake_workspace_heads WHEN NOT EXISTS(SELECT 1 FROM product_intake_workspace_versions v JOIN product_intake_drafts d ON d.id=v.draft_id WHERE v.id=NEW.version_id AND d.id=NEW.draft_id AND v.revision=d.revision AND v.kind='private') BEGIN SELECT RAISE(ABORT,'product_intake_head_source'); END;
--> statement-breakpoint
CREATE TRIGGER product_intake_head_update BEFORE UPDATE ON product_intake_workspace_heads WHEN NEW.draft_id IS NOT OLD.draft_id OR NOT EXISTS(SELECT 1 FROM product_intake_workspace_versions v JOIN product_intake_drafts d ON d.id=v.draft_id JOIN product_intake_workspace_versions old ON old.id=OLD.version_id WHERE v.id=NEW.version_id AND d.id=NEW.draft_id AND v.revision=d.revision AND v.kind='private' AND v.revision>old.revision) BEGIN SELECT RAISE(ABORT,'product_intake_head_source'); END;
--> statement-breakpoint
CREATE TRIGGER product_intake_media_source BEFORE INSERT ON product_intake_media WHEN NOT EXISTS(SELECT 1 FROM product_intake_drafts WHERE id=NEW.draft_id AND owner_id=NEW.owner_id) OR NEW.mime_type NOT IN ('image/jpeg','image/png','image/webp','video/mp4') OR NEW.size_bytes>CASE WHEN NEW.mime_type='video/mp4' THEN 20971520 ELSE 5242880 END OR (NEW.state='ready')<>(NEW.completed_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'product_intake_media_source'); END;
--> statement-breakpoint
CREATE TRIGGER product_intake_media_immutable BEFORE UPDATE ON product_intake_media WHEN NEW.id IS NOT OLD.id OR NEW.draft_id IS NOT OLD.draft_id OR NEW.owner_id IS NOT OLD.owner_id OR NEW.request_id IS NOT OLD.request_id OR NEW.object_key IS NOT OLD.object_key OR NEW.mime_type IS NOT OLD.mime_type OR NEW.size_bytes IS NOT OLD.size_bytes OR NEW.original_name IS NOT OLD.original_name OR NEW.content_digest IS NOT OLD.content_digest OR NEW.created_at IS NOT OLD.created_at OR OLD.state<>'uploading' OR NEW.state<>'ready' OR NEW.completed_at IS NULL OR NEW.completed_at<OLD.created_at BEGIN SELECT RAISE(ABORT,'product_intake_media_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER product_intake_case_source BEFORE INSERT ON product_intake_cases WHEN NEW.cycle_number<>COALESCE((SELECT MAX(cycle_number)+1 FROM product_intake_cases WHERE draft_id=NEW.draft_id),0) OR NOT EXISTS(SELECT 1 FROM product_intake_workspace_versions WHERE id=NEW.version_id AND draft_id=NEW.draft_id) OR NEW.triage_due_at<>NEW.first_requested_at+86400000 OR (NEW.first_complete_at IS NULL)<>(NEW.review_due_at IS NULL) OR NEW.review_due_at<>NEW.first_complete_at+86400000 BEGIN SELECT RAISE(ABORT,'product_intake_case_source'); END;
--> statement-breakpoint
CREATE TRIGGER product_intake_case_revision BEFORE UPDATE ON product_intake_cases WHEN OLD.state='resolved' OR NEW.cycle_number<>OLD.cycle_number OR NEW.id IS NOT OLD.id OR NEW.draft_id IS NOT OLD.draft_id OR NEW.revision<>OLD.revision+1 OR NEW.first_requested_at IS NOT OLD.first_requested_at OR NEW.triage_due_at IS NOT OLD.triage_due_at OR (OLD.triaged_at IS NOT NULL AND NEW.triaged_at IS NOT OLD.triaged_at) OR (OLD.first_complete_at IS NOT NULL AND NEW.first_complete_at IS NOT OLD.first_complete_at) OR (OLD.review_due_at IS NOT NULL AND NEW.review_due_at IS NOT OLD.review_due_at) OR (OLD.first_reviewed_at IS NOT NULL AND NEW.first_reviewed_at IS NOT OLD.first_reviewed_at) OR (NEW.first_complete_at IS NULL)<>(NEW.review_due_at IS NULL) OR NEW.review_due_at<>NEW.first_complete_at+86400000 OR NOT EXISTS(SELECT 1 FROM product_intake_workspace_versions WHERE id=NEW.version_id AND draft_id=NEW.draft_id) OR (NEW.active_proposal_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_intake_proposals WHERE id=NEW.active_proposal_id AND case_id=NEW.id AND base_version_id=NEW.version_id AND state='pending')) BEGIN SELECT RAISE(ABORT,'product_intake_case_revision'); END;
--> statement-breakpoint
CREATE TRIGGER product_intake_case_retained BEFORE DELETE ON product_intake_cases BEGIN SELECT RAISE(ABORT,'product_intake_case_retained'); END;
--> statement-breakpoint
CREATE TRIGGER product_intake_event_source BEFORE INSERT ON product_intake_events WHEN NOT EXISTS(SELECT 1 FROM product_intake_cases c JOIN product_intake_workspace_versions v ON v.draft_id=c.draft_id WHERE c.id=NEW.case_id AND v.id=NEW.version_id) BEGIN SELECT RAISE(ABORT,'product_intake_event_source'); END;
--> statement-breakpoint
CREATE TRIGGER product_intake_proposal_source BEFORE INSERT ON product_intake_proposals WHEN NOT EXISTS(SELECT 1 FROM product_intake_cases c WHERE c.id=NEW.case_id AND c.version_id=NEW.base_version_id) OR NEW.state<>'pending' OR NEW.decided_by IS NOT NULL OR NEW.decided_at IS NOT NULL OR NEW.accepted_version_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'product_intake_proposal_source'); END;
--> statement-breakpoint
CREATE TRIGGER product_intake_proposal_immutable BEFORE UPDATE ON product_intake_proposals WHEN NEW.id IS NOT OLD.id OR NEW.case_id IS NOT OLD.case_id OR NEW.base_version_id IS NOT OLD.base_version_id OR NEW.patch_json IS NOT OLD.patch_json OR NEW.source_note IS NOT OLD.source_note OR NEW.actor_id IS NOT OLD.actor_id OR NEW.created_at IS NOT OLD.created_at OR OLD.state<>'pending' OR NEW.state NOT IN ('accepted','declined','superseded') OR (NEW.state IN ('accepted','declined') AND (NEW.decided_by IS NULL OR NEW.decided_at IS NULL OR NEW.decided_at<OLD.created_at)) OR (NEW.state='accepted' AND NOT EXISTS(SELECT 1 FROM product_intake_workspace_versions v JOIN product_intake_cases c ON c.draft_id=v.draft_id WHERE c.id=NEW.case_id AND v.id=NEW.accepted_version_id)) OR (NEW.state<>'accepted' AND NEW.accepted_version_id IS NOT NULL) BEGIN SELECT RAISE(ABORT,'product_intake_proposal_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER product_intake_proposal_retained BEFORE DELETE ON product_intake_proposals BEGIN SELECT RAISE(ABORT,'product_intake_proposal_retained'); END;

--> statement-breakpoint
CREATE UNIQUE INDEX intake_case_cycle ON product_intake_cases(draft_id,cycle_number);
--> statement-breakpoint
CREATE UNIQUE INDEX intake_case_active ON product_intake_cases(draft_id) WHERE state<>'resolved';

--> statement-breakpoint
CREATE UNIQUE INDEX intake_workspace_revision ON product_intake_workspace_versions(draft_id,revision) WHERE kind='private';
