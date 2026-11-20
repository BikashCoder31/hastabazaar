-- Additive governance records only. No actual roster, role or permission is seeded.
CREATE TABLE staff_invitation_grants (
 invitation_id TEXT PRIMARY KEY NOT NULL REFERENCES staff_invitations(id),permissions_json TEXT NOT NULL CHECK(json_valid(permissions_json) AND json_type(permissions_json)='array'),
 grant_version INTEGER NOT NULL DEFAULT 1 CHECK(grant_version>0),created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE team_duties (
 id TEXT PRIMARY KEY NOT NULL, department TEXT NOT NULL, label TEXT NOT NULL,
 required_permission TEXT NOT NULL, reserved_super_admin INTEGER NOT NULL CHECK(reserved_super_admin IN (0,1)),
 primary_user_id TEXT REFERENCES users(id), revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL REFERENCES users(id)
);
--> statement-breakpoint
CREATE TABLE team_duty_backups (
 duty_id TEXT NOT NULL REFERENCES team_duties(id), user_id TEXT NOT NULL REFERENCES users(id),
 position INTEGER NOT NULL CHECK(position>=0), PRIMARY KEY(duty_id,user_id), UNIQUE(duty_id,position)
);
--> statement-breakpoint
CREATE TRIGGER team_no_self_backup BEFORE INSERT ON team_duty_backups WHEN EXISTS(SELECT 1 FROM team_duties WHERE id=NEW.duty_id AND primary_user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'team_primary_cannot_back_own_absence'); END;
--> statement-breakpoint
CREATE TABLE team_availability (
 id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),starts_at INTEGER NOT NULL,ends_at INTEGER NOT NULL,
 available INTEGER NOT NULL CHECK(available IN(0,1)),reason TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,
 actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,CHECK(ends_at>starts_at),UNIQUE(user_id,revision)
);
--> statement-breakpoint
CREATE TABLE team_handoffs (
 id TEXT PRIMARY KEY NOT NULL,duty_id TEXT NOT NULL REFERENCES team_duties(id),from_user_id TEXT REFERENCES users(id),
 to_user_id TEXT NOT NULL REFERENCES users(id),starts_at INTEGER NOT NULL,ends_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN('pending','accepted','cancelled')),revision INTEGER NOT NULL DEFAULT 0,
 actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,accepted_at INTEGER,
 CHECK(ends_at>starts_at),CHECK(from_user_id IS NULL OR from_user_id<>to_user_id)
);
--> statement-breakpoint
CREATE TABLE team_access_reviews (
 id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),grant_version INTEGER NOT NULL,
 completed_at INTEGER NOT NULL,reviewer_id TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,
 request_id TEXT NOT NULL,UNIQUE(reviewer_id,request_id)
);
--> statement-breakpoint
CREATE TABLE team_checkpoints (
 id TEXT PRIMARY KEY NOT NULL,duty_id TEXT NOT NULL REFERENCES team_duties(id),nepal_date TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('payout_queue','reconciliation')),due_at INTEGER NOT NULL,
 completed_at INTEGER,completed_by TEXT REFERENCES users(id),next_action TEXT,
 revision INTEGER NOT NULL DEFAULT 0,UNIQUE(nepal_date,kind)
);
--> statement-breakpoint
CREATE TABLE team_procedures (
 id TEXT PRIMARY KEY NOT NULL,family TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),title TEXT NOT NULL,
 body TEXT NOT NULL,owner_id TEXT REFERENCES users(id),published_at INTEGER NOT NULL,retired_at INTEGER,
 native_source_type TEXT CHECK(native_source_type IS NULL OR native_source_type='internal_legal_procedure'),
 native_source_id TEXT REFERENCES audit_logs(id),native_source_sha256 TEXT,
 UNIQUE(family,version),
 CHECK((native_source_type IS NULL AND native_source_id IS NULL AND native_source_sha256 IS NULL) OR (native_source_type='internal_legal_procedure' AND native_source_id IS NOT NULL AND native_source_sha256 IS NOT NULL AND length(native_source_sha256)=64 AND body=''))
);
--> statement-breakpoint
CREATE TABLE team_procedure_assignments (
 procedure_id TEXT NOT NULL REFERENCES team_procedures(id),user_id TEXT NOT NULL REFERENCES users(id),
 assigned_at INTEGER NOT NULL,acknowledged_at INTEGER,PRIMARY KEY(procedure_id,user_id)
);
--> statement-breakpoint
CREATE TABLE team_governance_tasks (
 id TEXT PRIMARY KEY NOT NULL,kind TEXT NOT NULL,source_id TEXT NOT NULL,duty_id TEXT REFERENCES team_duties(id),
 subject_user_id TEXT REFERENCES users(id),created_at INTEGER NOT NULL,due_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN('open','completed','superseded')),revision INTEGER NOT NULL DEFAULT 0,
 completed_at INTEGER,source_reference_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(source_reference_json)),UNIQUE(kind,source_id)
);
--> statement-breakpoint
CREATE TABLE team_governance_events (
 id TEXT PRIMARY KEY NOT NULL,source_type TEXT NOT NULL,source_id TEXT NOT NULL,action TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,reason TEXT NOT NULL,
 details_json TEXT NOT NULL CHECK(json_valid(details_json)),request_id TEXT NOT NULL,
 UNIQUE(actor_id,request_id)
);
--> statement-breakpoint
CREATE TRIGGER team_event_immutable BEFORE UPDATE ON team_governance_events BEGIN SELECT RAISE(ABORT,'team_governance_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER team_event_retained BEFORE DELETE ON team_governance_events BEGIN SELECT RAISE(ABORT,'team_governance_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER team_access_review_immutable BEFORE UPDATE ON team_access_reviews BEGIN SELECT RAISE(ABORT,'team_access_review_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER team_access_review_retained BEFORE DELETE ON team_access_reviews BEGIN SELECT RAISE(ABORT,'team_access_review_retained'); END;
--> statement-breakpoint
CREATE TRIGGER team_ack_original BEFORE UPDATE ON team_procedure_assignments WHEN NEW.procedure_id<>OLD.procedure_id OR NEW.user_id<>OLD.user_id OR NEW.assigned_at<>OLD.assigned_at OR (OLD.acknowledged_at IS NOT NULL AND (NEW.acknowledged_at IS NULL OR NEW.acknowledged_at<>OLD.acknowledged_at)) BEGIN SELECT RAISE(ABORT,'team_acknowledgment_original_retained'); END;
--> statement-breakpoint
CREATE TRIGGER team_procedure_original_immutable BEFORE UPDATE ON team_procedures WHEN NEW.family<>OLD.family OR NEW.version<>OLD.version OR NEW.title<>OLD.title OR NEW.body<>OLD.body OR NEW.published_at<>OLD.published_at OR (NEW.native_source_type IS NULL)<>(OLD.native_source_type IS NULL) OR NEW.native_source_type<>OLD.native_source_type OR (NEW.native_source_id IS NULL)<>(OLD.native_source_id IS NULL) OR NEW.native_source_id<>OLD.native_source_id OR (NEW.native_source_sha256 IS NULL)<>(OLD.native_source_sha256 IS NULL) OR NEW.native_source_sha256<>OLD.native_source_sha256 BEGIN SELECT RAISE(ABORT,'team_procedure_version_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER team_task_original_clock BEFORE UPDATE ON team_governance_tasks WHEN NEW.created_at<>OLD.created_at OR NEW.due_at<>OLD.due_at OR NEW.kind<>OLD.kind OR NEW.source_id<>OLD.source_id OR NEW.source_reference_json<>OLD.source_reference_json BEGIN SELECT RAISE(ABORT,'team_task_original_clock_immutable'); END;
--> statement-breakpoint
CREATE INDEX team_handoffs_current ON team_handoffs(duty_id,state,starts_at,ends_at);
--> statement-breakpoint
CREATE INDEX team_governance_tasks_scan ON team_governance_tasks(state,id);
--> statement-breakpoint
CREATE INDEX team_governance_tasks_subject ON team_governance_tasks(kind,subject_user_id,state);
--> statement-breakpoint
