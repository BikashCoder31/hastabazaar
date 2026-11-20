-- Additive source only. No canonical migration or diagnostic cleanup is authorized.
ALTER TABLE form_answer_sets ADD COLUMN health_environment TEXT CHECK(health_environment IN('production','development','local_staging','test'));
--> statement-breakpoint
ALTER TABLE form_answer_sets ADD COLUMN health_release_id TEXT;
--> statement-breakpoint
CREATE TABLE form_health_observations (
 id TEXT PRIMARY KEY NOT NULL,
 support_reference TEXT NOT NULL UNIQUE,
 environment TEXT NOT NULL CHECK(environment IN('production','development','local_staging','test','unknown')),
 release_id TEXT NOT NULL,
 form_id TEXT NOT NULL,
 form_version INTEGER,
 journey TEXT NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN('load','save')),
 outcome TEXT NOT NULL CHECK(outcome IN('compatible','fallback','blocked','saved')),
 category TEXT CHECK(category IN('definition_unavailable','definition_invalid','read_unavailable','durable_submission')),
 evidence_kind TEXT NOT NULL CHECK(evidence_kind IN('runtime','form_answer_set','core_receipt')),
 evidence_id TEXT,
 observed_at INTEGER NOT NULL CHECK(observed_at>=0),
 CHECK((phase='load' AND outcome IN('compatible','fallback','blocked') AND evidence_kind='runtime' AND evidence_id IS NULL) OR (phase='save' AND outcome='saved' AND evidence_kind IN('form_answer_set','core_receipt') AND evidence_id IS NOT NULL)),
 UNIQUE(evidence_kind,evidence_id)
);
--> statement-breakpoint
CREATE INDEX form_health_scope_clock ON form_health_observations(environment,release_id,form_id,observed_at,id);
--> statement-breakpoint
CREATE TABLE form_health_incident_links (
 observation_id TEXT NOT NULL REFERENCES form_health_observations(id),
 incident_id TEXT NOT NULL REFERENCES service_health_incidents(id),
 retained_at INTEGER NOT NULL,
 PRIMARY KEY(observation_id,incident_id)
);
--> statement-breakpoint
CREATE TRIGGER form_health_observation_retained BEFORE UPDATE ON form_health_observations BEGIN SELECT RAISE(ABORT,'form_health_observation_retained'); END;
--> statement-breakpoint
CREATE TRIGGER form_health_incident_link_retained BEFORE UPDATE ON form_health_incident_links BEGIN SELECT RAISE(ABORT,'form_health_incident_link_retained'); END;
--> statement-breakpoint
CREATE TRIGGER form_health_observation_no_delete BEFORE DELETE ON form_health_observations BEGIN SELECT RAISE(ABORT,'form_health_cleanup_not_enabled'); END;
--> statement-breakpoint
CREATE TRIGGER form_health_incident_link_no_delete BEFORE DELETE ON form_health_incident_links BEGIN SELECT RAISE(ABORT,'form_health_incident_evidence_retained'); END;
--> statement-breakpoint
CREATE TABLE file_health_observations (
 id TEXT PRIMARY KEY NOT NULL,
 support_reference TEXT NOT NULL UNIQUE,
 environment TEXT NOT NULL CHECK(environment IN('production','development','local_staging','test','unknown')),
 release_id TEXT NOT NULL,
 access_kind TEXT NOT NULL CHECK(access_kind IN('public','private')),
 outcome TEXT NOT NULL CHECK(outcome IN('read','blocked')),
 category TEXT CHECK(category='storage_read_failed'),
 observed_at INTEGER NOT NULL CHECK(observed_at>=0)
);
--> statement-breakpoint
CREATE INDEX file_health_scope_clock ON file_health_observations(environment,release_id,access_kind,observed_at,id);
--> statement-breakpoint
CREATE TABLE file_health_incident_links (
 observation_id TEXT NOT NULL REFERENCES file_health_observations(id),
 incident_id TEXT NOT NULL REFERENCES service_health_incidents(id),
 retained_at INTEGER NOT NULL,
 PRIMARY KEY(observation_id,incident_id)
);
--> statement-breakpoint
CREATE TRIGGER file_health_observation_retained BEFORE UPDATE ON file_health_observations BEGIN SELECT RAISE(ABORT,'file_health_observation_retained'); END;
--> statement-breakpoint
CREATE TRIGGER file_health_observation_no_delete BEFORE DELETE ON file_health_observations BEGIN SELECT RAISE(ABORT,'file_health_cleanup_not_enabled'); END;
--> statement-breakpoint
CREATE TRIGGER file_health_incident_link_retained BEFORE UPDATE ON file_health_incident_links BEGIN SELECT RAISE(ABORT,'file_health_incident_link_retained'); END;
--> statement-breakpoint
CREATE TRIGGER file_health_incident_link_no_delete BEFORE DELETE ON file_health_incident_links BEGIN SELECT RAISE(ABORT,'file_health_incident_evidence_retained'); END;
