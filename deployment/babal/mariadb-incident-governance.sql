-- Incident governance extends the existing health episode; no parallel business queue.
ALTER TABLE service_health_observations ADD COLUMN evidence_scope LONGTEXT;
CREATE TABLE service_incident_governance (
 incident_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES service_health_incidents(id),
 title LONGTEXT NOT NULL DEFAULT 'Service incident',
 impact_class VARCHAR(191) NOT NULL DEFAULT 'ordinary' CHECK(impact_class IN('ordinary','privacy','security','financial_integrity')),
 impact_summary LONGTEXT NOT NULL DEFAULT 'Impact not yet assessed',
 failure_signature VARCHAR(191) NOT NULL,
 release_reference VARCHAR(191),
 configuration_reference VARCHAR(191),
 owner_id VARCHAR(191) REFERENCES users(id),
 backup_id VARCHAR(191) REFERENCES users(id),
 acknowledged_at BIGINT,
 acknowledged_by VARCHAR(191) REFERENCES users(id),
 plan_text LONGTEXT,
 plan_at BIGINT,
 first_review_at BIGINT,
 next_action LONGTEXT,
 next_update_at BIGINT,
 acknowledge_due_at BIGINT NOT NULL,
 plan_due_at BIGINT NOT NULL,
 update_interval_ms BIGINT NOT NULL CHECK(update_interval_ms>0),
 closure_required BIGINT NOT NULL DEFAULT 1 CHECK(closure_required IN(0,1)),
 closure_authorized_revision BIGINT,
 closed_by VARCHAR(191) REFERENCES users(id),
 resolution_cause LONGTEXT,
 recovery_first_observation_id VARCHAR(191) REFERENCES service_health_observations(id),
 recovery_last_observation_id VARCHAR(191) REFERENCES service_health_observations(id),
 merged_into VARCHAR(191) REFERENCES service_health_incidents(id),
 legacy_incident_id VARCHAR(191) UNIQUE REFERENCES operational_incidents(id),
 prior_incident_id VARCHAR(191) REFERENCES service_health_incidents(id),
 revision BIGINT NOT NULL DEFAULT 0,
 updated_at BIGINT NOT NULL,
 CHECK(owner_id IS NULL OR backup_id IS NULL OR owner_id<>backup_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX service_incident_due ON service_incident_governance(acknowledge_due_at,next_update_at,incident_id);
CREATE TABLE service_incident_events (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 incident_id VARCHAR(191) NOT NULL REFERENCES service_health_incidents(id),
 request_id VARCHAR(191) NOT NULL UNIQUE,
 actor_id VARCHAR(191) REFERENCES users(id),
 action VARCHAR(191) NOT NULL,
 from_revision VARCHAR(191),
 to_revision VARCHAR(191) NOT NULL,
 governance_revision BIGINT NOT NULL,
 facts_json LONGTEXT NOT NULL,
 occurred_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX service_incident_event_history ON service_incident_events(incident_id,occurred_at,id);
CREATE TABLE service_incident_links (
 incident_id VARCHAR(191) NOT NULL REFERENCES service_health_incidents(id),
 source_type VARCHAR(191) NOT NULL CHECK(source_type IN('order','seller','payment','refund','return_request','complaint','incident')),
 source_id VARCHAR(191) NOT NULL,
 linked_by VARCHAR(191) NOT NULL REFERENCES users(id),
 linked_at BIGINT NOT NULL,
 PRIMARY KEY(incident_id,source_type,source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE service_incident_legacy_links (
 legacy_incident_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES operational_incidents(id),
 incident_id VARCHAR(191) NOT NULL REFERENCES service_health_incidents(id),
 mapped_by VARCHAR(191) NOT NULL REFERENCES users(id),
 mapped_at BIGINT NOT NULL,
 legacy_status VARCHAR(191) NOT NULL,
 legacy_updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER service_incident_events_no_update BEFORE UPDATE ON service_incident_events FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='incident_history_immutable';
END$$
CREATE TRIGGER service_incident_events_no_delete BEFORE DELETE ON service_incident_events FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='incident_history_retained';
END$$
CREATE TRIGGER service_incident_links_no_delete BEFORE DELETE ON service_incident_links FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='incident_source_link_retained';
END$$
CREATE TRIGGER service_incident_legacy_link_no_update BEFORE UPDATE ON service_incident_legacy_links FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='incident_legacy_mapping_immutable';
END$$
CREATE TRIGGER service_incident_legacy_link_no_delete BEFORE DELETE ON service_incident_legacy_links FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='incident_legacy_mapping_retained';
END$$
CREATE TRIGGER service_incident_governed_close BEFORE UPDATE ON service_health_incidents FOR EACH ROW BEGIN
IF NEW.state='resolved' AND OLD.state<>'resolved' AND EXISTS(SELECT 1 FROM service_incident_governance g WHERE g.incident_id=OLD.id AND (g.closure_required=1 OR g.impact_class<>'ordinary') AND (g.closure_authorized_revision IS NULL OR g.closure_authorized_revision<>NEW.revision OR g.closed_by IS NULL)) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='incident_governance_closure_required';
END IF;
END$$
DELIMITER ;
