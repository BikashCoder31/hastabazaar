-- Actual observation evidence; no scheduler or external contact is enabled by this schema.
CREATE TABLE service_health_observations (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 environment VARCHAR(191) NOT NULL CHECK(environment IN('production','development','local_staging','test')),
 service_key VARCHAR(191) NOT NULL,
 run_key VARCHAR(191) NOT NULL,
 observed_at BIGINT NOT NULL,
 successful BIGINT NOT NULL CHECK(successful IN(0,1)),
 functional_success BIGINT NOT NULL DEFAULT 0 CHECK(functional_success IN(0,1)),
 eligible_backlog BIGINT NOT NULL CHECK(eligible_backlog>=0),
 oldest_eligible_at BIGINT,
 progress_count BIGINT NOT NULL DEFAULT 0 CHECK(progress_count>=0),
 failure_category VARCHAR(191) CHECK(failure_category IN('provider','recipient','configuration','unknown','worker')),
 source_kind VARCHAR(191) NOT NULL CHECK(source_kind IN('sender','evaluator','watchdog')),
 UNIQUE(environment,service_key,run_key)
);

CREATE INDEX service_health_observation_clock ON service_health_observations(environment,service_key,observed_at,id);

CREATE TABLE service_health_incidents (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 environment VARCHAR(191) NOT NULL CHECK(environment IN('production','development','local_staging','test')),
 service_key VARCHAR(191) NOT NULL,
 episode BIGINT NOT NULL CHECK(episode>0),
 state VARCHAR(191) NOT NULL CHECK(state IN('detected','assigned','working','monitoring','resolved')),
 severity VARCHAR(191) NOT NULL DEFAULT 'high' CHECK(severity IN('critical','high','routine')),
 first_seen_at BIGINT NOT NULL,
 last_seen_at BIGINT NOT NULL,
 resolved_at BIGINT,
 failure_category VARCHAR(191) CHECK(failure_category IN('provider','recipient','configuration','unknown','worker')),
 revision BIGINT NOT NULL DEFAULT 0,
 UNIQUE(environment,service_key,episode)
);

ALTER TABLE service_health_incidents ADD COLUMN open_key VARCHAR(383) GENERATED ALWAYS AS (CASE WHEN state<>'resolved' THEN CONCAT(environment,':',service_key) ELSE NULL END) STORED, ADD UNIQUE KEY service_health_one_open(open_key);

CREATE TABLE service_health_guards (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 valid BIGINT NOT NULL CHECK(valid=1)
);

DELIMITER $$
CREATE TRIGGER service_health_observation_immutable BEFORE UPDATE ON service_health_observations FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='service_health_observation_immutable';
END$$
CREATE TRIGGER service_health_incident_identity BEFORE UPDATE ON service_health_incidents FOR EACH ROW BEGIN
IF NOT(NEW.id<=>OLD.id) OR NOT(NEW.environment<=>OLD.environment) OR NOT(NEW.service_key<=>OLD.service_key) OR NOT(NEW.episode<=>OLD.episode) OR NOT(NEW.first_seen_at<=>OLD.first_seen_at) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='service_health_incident_identity_immutable';
END IF;
END$$
DELIMITER ;
