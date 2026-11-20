-- Source only. Apply exclusively to an independently authorized destination.
-- Rebuild the two linked tables with foreign_keys ON; retain every original row.
CREATE TABLE native_form_health_observations_upgrade (
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
 evidence_kind TEXT NOT NULL CHECK(evidence_kind IN('runtime','form_answer_set','core_receipt','native_command')),
 evidence_id TEXT,
 observed_at INTEGER NOT NULL CHECK(observed_at>=0),
 CHECK((phase='load' AND outcome IN('compatible','fallback','blocked') AND evidence_kind='runtime' AND evidence_id IS NULL) OR (phase='save' AND outcome='saved' AND evidence_kind IN('form_answer_set','core_receipt','native_command') AND evidence_id IS NOT NULL)),
 UNIQUE(evidence_kind,evidence_id)
);
--> statement-breakpoint
INSERT INTO native_form_health_observations_upgrade SELECT * FROM form_health_observations;
--> statement-breakpoint
CREATE TABLE native_form_health_links_upgrade (
 observation_id TEXT NOT NULL REFERENCES native_form_health_observations_upgrade(id),
 incident_id TEXT NOT NULL REFERENCES service_health_incidents(id),
 retained_at INTEGER NOT NULL,
 PRIMARY KEY(observation_id,incident_id)
);
--> statement-breakpoint
INSERT INTO native_form_health_links_upgrade SELECT * FROM form_health_incident_links;
--> statement-breakpoint
DROP TRIGGER form_health_incident_link_no_delete;
--> statement-breakpoint
DROP TABLE form_health_incident_links;
--> statement-breakpoint
DROP TRIGGER form_health_observation_no_delete;
--> statement-breakpoint
DROP TABLE form_health_observations;
--> statement-breakpoint
ALTER TABLE native_form_health_observations_upgrade RENAME TO form_health_observations;
--> statement-breakpoint
ALTER TABLE native_form_health_links_upgrade RENAME TO form_health_incident_links;
--> statement-breakpoint
CREATE INDEX form_health_scope_clock ON form_health_observations(environment,release_id,form_id,observed_at,id);
--> statement-breakpoint
CREATE TRIGGER form_health_observation_retained BEFORE UPDATE ON form_health_observations BEGIN SELECT RAISE(ABORT,'form_health_observation_retained'); END;
--> statement-breakpoint
CREATE TRIGGER form_health_incident_link_retained BEFORE UPDATE ON form_health_incident_links BEGIN SELECT RAISE(ABORT,'form_health_incident_link_retained'); END;
--> statement-breakpoint
CREATE TRIGGER form_health_observation_no_delete BEFORE DELETE ON form_health_observations BEGIN SELECT RAISE(ABORT,'form_health_cleanup_not_enabled'); END;
--> statement-breakpoint
CREATE TRIGGER form_health_incident_link_no_delete BEFORE DELETE ON form_health_incident_links BEGIN SELECT RAISE(ABORT,'form_health_incident_evidence_retained'); END;
--> statement-breakpoint
-- Existing command guards already retain action/digest/result/source/time.
-- Retain the original provenance too, including NULL on historical receipts:
-- adding present-day scope to an old receipt is never a permitted amendment.
CREATE TRIGGER native_form_command_provenance_retained BEFORE UPDATE ON audit_logs
WHEN OLD.command_key IS NOT NULL AND (NEW.id IS NOT OLD.id OR NEW.next_json IS NOT OLD.next_json)
BEGIN SELECT RAISE(ABORT,'native_form_command_provenance_retained'); END;
