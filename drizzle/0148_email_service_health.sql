-- Actual observation evidence; no scheduler or external contact is enabled by this schema.
CREATE TABLE service_health_observations (
 id TEXT PRIMARY KEY NOT NULL,
 environment TEXT NOT NULL CHECK(environment IN('production','development','local_staging','test')),
 service_key TEXT NOT NULL,
 run_key TEXT NOT NULL,
 observed_at INTEGER NOT NULL,
 successful INTEGER NOT NULL CHECK(successful IN(0,1)),
 functional_success INTEGER NOT NULL DEFAULT 0 CHECK(functional_success IN(0,1)),
 eligible_backlog INTEGER NOT NULL CHECK(eligible_backlog>=0),
 oldest_eligible_at INTEGER,
 progress_count INTEGER NOT NULL DEFAULT 0 CHECK(progress_count>=0),
 failure_category TEXT CHECK(failure_category IN('provider','recipient','configuration','unknown','worker')),
 source_kind TEXT NOT NULL CHECK(source_kind IN('sender','evaluator','watchdog')),
 UNIQUE(environment,service_key,run_key)
);
--> statement-breakpoint
CREATE INDEX service_health_observation_clock ON service_health_observations(environment,service_key,observed_at,id);
--> statement-breakpoint
CREATE TABLE service_health_incidents (
 id TEXT PRIMARY KEY NOT NULL,
 environment TEXT NOT NULL CHECK(environment IN('production','development','local_staging','test')),
 service_key TEXT NOT NULL,
 episode INTEGER NOT NULL CHECK(episode>0),
 state TEXT NOT NULL CHECK(state IN('detected','assigned','working','monitoring','resolved')),
 severity TEXT NOT NULL DEFAULT 'high' CHECK(severity IN('critical','high','routine')),
 first_seen_at INTEGER NOT NULL,
 last_seen_at INTEGER NOT NULL,
 resolved_at INTEGER,
 failure_category TEXT CHECK(failure_category IN('provider','recipient','configuration','unknown','worker')),
 revision INTEGER NOT NULL DEFAULT 0,
 UNIQUE(environment,service_key,episode)
);
--> statement-breakpoint
CREATE UNIQUE INDEX service_health_one_open ON service_health_incidents(environment,service_key) WHERE state<>'resolved';
--> statement-breakpoint
CREATE TABLE service_health_guards (
 id TEXT PRIMARY KEY NOT NULL,
 valid INTEGER NOT NULL CHECK(valid=1)
);
--> statement-breakpoint
CREATE TRIGGER service_health_observation_immutable BEFORE UPDATE ON service_health_observations
BEGIN SELECT RAISE(ABORT,'service_health_observation_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER service_health_incident_identity BEFORE UPDATE ON service_health_incidents
WHEN NEW.id IS NOT OLD.id OR NEW.environment IS NOT OLD.environment OR NEW.service_key IS NOT OLD.service_key OR NEW.episode IS NOT OLD.episode OR NEW.first_seen_at IS NOT OLD.first_seen_at
BEGIN SELECT RAISE(ABORT,'service_health_incident_identity_immutable'); END;
