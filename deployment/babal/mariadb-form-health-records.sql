-- Additive source only. No canonical migration or diagnostic cleanup is authorized.
ALTER TABLE form_answer_sets ADD COLUMN health_environment VARCHAR(191) CHECK(health_environment IN('production','development','local_staging','test'));

ALTER TABLE form_answer_sets ADD COLUMN health_release_id VARCHAR(191);

CREATE TABLE form_health_observations (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 support_reference VARCHAR(191) NOT NULL UNIQUE,
 environment VARCHAR(191) NOT NULL CHECK(environment IN('production','development','local_staging','test','unknown')),
 release_id VARCHAR(191) NOT NULL,
 form_id VARCHAR(191) NOT NULL,
 form_version BIGINT,
 journey VARCHAR(191) NOT NULL,
 phase VARCHAR(191) NOT NULL CHECK(phase IN('load','save')),
 outcome VARCHAR(191) NOT NULL CHECK(outcome IN('compatible','fallback','blocked','saved')),
 category VARCHAR(191) CHECK(category IN('definition_unavailable','definition_invalid','read_unavailable','durable_submission')),
 evidence_kind VARCHAR(191) NOT NULL CHECK(evidence_kind IN('runtime','form_answer_set','core_receipt')),
 evidence_id VARCHAR(191),
 observed_at BIGINT NOT NULL CHECK(observed_at>=0),
 CHECK((phase='load' AND outcome IN('compatible','fallback','blocked') AND evidence_kind='runtime' AND evidence_id IS NULL) OR (phase='save' AND outcome='saved' AND evidence_kind IN('form_answer_set','core_receipt') AND evidence_id IS NOT NULL)),
 UNIQUE(evidence_kind,evidence_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX form_health_scope_clock ON form_health_observations(environment,release_id,form_id,observed_at,id);

CREATE TABLE form_health_incident_links (
 observation_id VARCHAR(191) NOT NULL REFERENCES form_health_observations(id),
 incident_id VARCHAR(191) NOT NULL REFERENCES service_health_incidents(id),
 retained_at BIGINT NOT NULL,
 PRIMARY KEY(observation_id,incident_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;









CREATE TABLE file_health_observations (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 support_reference VARCHAR(191) NOT NULL UNIQUE,
 environment VARCHAR(191) NOT NULL CHECK(environment IN('production','development','local_staging','test','unknown')),
 release_id VARCHAR(191) NOT NULL,
 access_kind VARCHAR(191) NOT NULL CHECK(access_kind IN('public','private')),
 outcome VARCHAR(191) NOT NULL CHECK(outcome IN('read','blocked')),
 category VARCHAR(191) CHECK(category='storage_read_failed'),
 observed_at BIGINT NOT NULL CHECK(observed_at>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX file_health_scope_clock ON file_health_observations(environment,release_id,access_kind,observed_at,id);

CREATE TABLE file_health_incident_links (
 observation_id VARCHAR(191) NOT NULL REFERENCES file_health_observations(id),
 incident_id VARCHAR(191) NOT NULL REFERENCES service_health_incidents(id),
 retained_at BIGINT NOT NULL,
 PRIMARY KEY(observation_id,incident_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER form_health_observation_retained BEFORE UPDATE ON form_health_observations FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='form_health_observation_retained';
END$$
CREATE TRIGGER form_health_incident_link_retained BEFORE UPDATE ON form_health_incident_links FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='form_health_incident_link_retained';
END$$
CREATE TRIGGER form_health_observation_no_delete BEFORE DELETE ON form_health_observations FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='form_health_cleanup_not_enabled';
END$$
CREATE TRIGGER form_health_incident_link_no_delete BEFORE DELETE ON form_health_incident_links FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='form_health_incident_evidence_retained';
END$$
CREATE TRIGGER file_health_observation_retained BEFORE UPDATE ON file_health_observations FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='file_health_observation_retained';
END$$
CREATE TRIGGER file_health_observation_no_delete BEFORE DELETE ON file_health_observations FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='file_health_cleanup_not_enabled';
END$$
CREATE TRIGGER file_health_incident_link_retained BEFORE UPDATE ON file_health_incident_links FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='file_health_incident_link_retained';
END$$
CREATE TRIGGER file_health_incident_link_no_delete BEFORE DELETE ON file_health_incident_links FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='file_health_incident_evidence_retained';
END$$
DELIMITER ;
