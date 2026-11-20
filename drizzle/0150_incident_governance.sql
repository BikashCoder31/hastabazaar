-- Incident governance extends the existing health episode; no parallel business queue.
ALTER TABLE service_health_observations ADD COLUMN evidence_scope TEXT;
CREATE TABLE service_incident_governance (
 incident_id TEXT PRIMARY KEY NOT NULL REFERENCES service_health_incidents(id),
 title TEXT NOT NULL DEFAULT 'Service incident',
 impact_class TEXT NOT NULL DEFAULT 'ordinary' CHECK(impact_class IN('ordinary','privacy','security','financial_integrity')),
 impact_summary TEXT NOT NULL DEFAULT 'Impact not yet assessed',
 failure_signature TEXT NOT NULL,
 release_reference TEXT,
 configuration_reference TEXT,
 owner_id TEXT REFERENCES users(id),
 backup_id TEXT REFERENCES users(id),
 acknowledged_at INTEGER,
 acknowledged_by TEXT REFERENCES users(id),
 plan_text TEXT,
 plan_at INTEGER,
 first_review_at INTEGER,
 next_action TEXT,
 next_update_at INTEGER,
 acknowledge_due_at INTEGER NOT NULL,
 plan_due_at INTEGER NOT NULL,
 update_interval_ms INTEGER NOT NULL CHECK(update_interval_ms>0),
 closure_required INTEGER NOT NULL DEFAULT 1 CHECK(closure_required IN(0,1)),
 closure_authorized_revision INTEGER,
 closed_by TEXT REFERENCES users(id),
 resolution_cause TEXT,
 recovery_first_observation_id TEXT REFERENCES service_health_observations(id),
 recovery_last_observation_id TEXT REFERENCES service_health_observations(id),
 merged_into TEXT REFERENCES service_health_incidents(id),
 legacy_incident_id TEXT UNIQUE REFERENCES operational_incidents(id),
 prior_incident_id TEXT REFERENCES service_health_incidents(id),
 revision INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL,
 CHECK(owner_id IS NULL OR backup_id IS NULL OR owner_id<>backup_id)
);
CREATE INDEX service_incident_due ON service_incident_governance(acknowledge_due_at,next_update_at,incident_id);
CREATE TABLE service_incident_events (
 id TEXT PRIMARY KEY NOT NULL,
 incident_id TEXT NOT NULL REFERENCES service_health_incidents(id),
 request_id TEXT NOT NULL UNIQUE,
 actor_id TEXT REFERENCES users(id),
 action TEXT NOT NULL,
 from_revision TEXT,
 to_revision TEXT NOT NULL,
 governance_revision INTEGER NOT NULL,
 facts_json TEXT NOT NULL,
 occurred_at INTEGER NOT NULL
);
CREATE INDEX service_incident_event_history ON service_incident_events(incident_id,occurred_at,id);
CREATE TABLE service_incident_links (
 incident_id TEXT NOT NULL REFERENCES service_health_incidents(id),
 source_type TEXT NOT NULL CHECK(source_type IN('order','seller','payment','refund','return_request','complaint','incident')),
 source_id TEXT NOT NULL,
 linked_by TEXT NOT NULL REFERENCES users(id),
 linked_at INTEGER NOT NULL,
 PRIMARY KEY(incident_id,source_type,source_id)
);
CREATE TABLE service_incident_legacy_links (
 legacy_incident_id TEXT PRIMARY KEY NOT NULL REFERENCES operational_incidents(id),
 incident_id TEXT NOT NULL REFERENCES service_health_incidents(id),
 mapped_by TEXT NOT NULL REFERENCES users(id),
 mapped_at INTEGER NOT NULL,
 legacy_status TEXT NOT NULL,
 legacy_updated_at INTEGER NOT NULL
);
CREATE TRIGGER service_incident_events_no_update BEFORE UPDATE ON service_incident_events BEGIN SELECT RAISE(ABORT,'incident_history_immutable'); END;
CREATE TRIGGER service_incident_events_no_delete BEFORE DELETE ON service_incident_events BEGIN SELECT RAISE(ABORT,'incident_history_retained'); END;
CREATE TRIGGER service_incident_links_no_delete BEFORE DELETE ON service_incident_links BEGIN SELECT RAISE(ABORT,'incident_source_link_retained'); END;
CREATE TRIGGER service_incident_legacy_link_no_update BEFORE UPDATE ON service_incident_legacy_links BEGIN SELECT RAISE(ABORT,'incident_legacy_mapping_immutable'); END;
CREATE TRIGGER service_incident_legacy_link_no_delete BEFORE DELETE ON service_incident_legacy_links BEGIN SELECT RAISE(ABORT,'incident_legacy_mapping_retained'); END;
CREATE TRIGGER service_incident_governed_close BEFORE UPDATE ON service_health_incidents
WHEN NEW.state='resolved' AND OLD.state<>'resolved' AND EXISTS(SELECT 1 FROM service_incident_governance g WHERE g.incident_id=OLD.id AND (g.closure_required=1 OR g.impact_class<>'ordinary') AND (g.closure_authorized_revision IS NULL OR g.closure_authorized_revision<>NEW.revision OR g.closed_by IS NULL))
BEGIN SELECT RAISE(ABORT,'incident_governance_closure_required'); END;
