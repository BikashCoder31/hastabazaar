-- Additive governance records only. No actual roster, role or permission is seeded.
CREATE TABLE staff_invitation_grants (
 invitation_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES staff_invitations(id),permissions_json LONGTEXT NOT NULL CHECK(json_valid(permissions_json) AND JSON_TYPE(permissions_json)='ARRAY'),
 grant_version BIGINT NOT NULL DEFAULT 1 CHECK(grant_version>0),created_by VARCHAR(191) NOT NULL REFERENCES users(id),created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_duties (
 id VARCHAR(191) PRIMARY KEY NOT NULL, department VARCHAR(191) NOT NULL, label LONGTEXT NOT NULL,
 required_permission VARCHAR(191) NOT NULL, reserved_super_admin BIGINT NOT NULL CHECK(reserved_super_admin IN (0,1)),
 primary_user_id VARCHAR(191) REFERENCES users(id), revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at BIGINT NOT NULL, updated_by VARCHAR(191) NOT NULL REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_duty_backups (
 duty_id VARCHAR(191) NOT NULL REFERENCES team_duties(id), user_id VARCHAR(191) NOT NULL REFERENCES users(id),
 position BIGINT NOT NULL CHECK(position>=0), PRIMARY KEY(duty_id,user_id), UNIQUE(duty_id,position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE team_availability (
 id VARCHAR(191) PRIMARY KEY NOT NULL,user_id VARCHAR(191) NOT NULL REFERENCES users(id),starts_at BIGINT NOT NULL,ends_at BIGINT NOT NULL,
 available BIGINT NOT NULL CHECK(available IN(0,1)),reason LONGTEXT NOT NULL,revision BIGINT NOT NULL DEFAULT 0,
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),created_at BIGINT NOT NULL,CHECK(ends_at>starts_at),UNIQUE(user_id,revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_handoffs (
 id VARCHAR(191) PRIMARY KEY NOT NULL,duty_id VARCHAR(191) NOT NULL REFERENCES team_duties(id),from_user_id VARCHAR(191) REFERENCES users(id),
 to_user_id VARCHAR(191) NOT NULL REFERENCES users(id),starts_at BIGINT NOT NULL,ends_at BIGINT NOT NULL,
 state VARCHAR(191) NOT NULL CHECK(state IN('pending','accepted','cancelled')),revision BIGINT NOT NULL DEFAULT 0,
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),created_at BIGINT NOT NULL,accepted_at BIGINT,
 CHECK(ends_at>starts_at),CHECK(from_user_id IS NULL OR from_user_id<>to_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_access_reviews (
 id VARCHAR(191) PRIMARY KEY NOT NULL,user_id VARCHAR(191) NOT NULL REFERENCES users(id),grant_version BIGINT NOT NULL,
 completed_at BIGINT NOT NULL,reviewer_id VARCHAR(191) NOT NULL REFERENCES users(id),reason LONGTEXT NOT NULL,
 request_id VARCHAR(191) NOT NULL,UNIQUE(reviewer_id,request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_checkpoints (
 id VARCHAR(191) PRIMARY KEY NOT NULL,duty_id VARCHAR(191) NOT NULL REFERENCES team_duties(id),nepal_date VARCHAR(191) NOT NULL,
 kind VARCHAR(191) NOT NULL CHECK(kind IN('payout_queue','reconciliation')),due_at BIGINT NOT NULL,
 completed_at BIGINT,completed_by VARCHAR(191) REFERENCES users(id),next_action LONGTEXT,
 revision BIGINT NOT NULL DEFAULT 0,UNIQUE(nepal_date,kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_procedures (
 id VARCHAR(191) PRIMARY KEY NOT NULL,family VARCHAR(191) NOT NULL,version BIGINT NOT NULL CHECK(version>0),title LONGTEXT NOT NULL,
 body LONGTEXT NOT NULL,owner_id VARCHAR(191) REFERENCES users(id),published_at BIGINT NOT NULL,retired_at BIGINT,
 native_source_type VARCHAR(191) CHECK(native_source_type IS NULL OR native_source_type='internal_legal_procedure'),
 native_source_id VARCHAR(191) REFERENCES audit_logs(id),native_source_sha256 VARCHAR(191),
 UNIQUE(family,version),
 CHECK((native_source_type IS NULL AND native_source_id IS NULL AND native_source_sha256 IS NULL) OR (native_source_type='internal_legal_procedure' AND native_source_id IS NOT NULL AND native_source_sha256 IS NOT NULL AND length(native_source_sha256)=64 AND body=''))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_procedure_assignments (
 procedure_id VARCHAR(191) NOT NULL REFERENCES team_procedures(id),user_id VARCHAR(191) NOT NULL REFERENCES users(id),
 assigned_at BIGINT NOT NULL,acknowledged_at BIGINT,PRIMARY KEY(procedure_id,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_governance_tasks (
 id VARCHAR(191) PRIMARY KEY NOT NULL,kind VARCHAR(191) NOT NULL,source_id VARCHAR(191) NOT NULL,duty_id VARCHAR(191) REFERENCES team_duties(id),
 subject_user_id VARCHAR(191) REFERENCES users(id),created_at BIGINT NOT NULL,due_at BIGINT NOT NULL,
 state VARCHAR(191) NOT NULL CHECK(state IN('open','completed','superseded')),revision BIGINT NOT NULL DEFAULT 0,
 completed_at BIGINT,source_reference_json LONGTEXT NOT NULL DEFAULT '{}' CHECK(json_valid(source_reference_json)),UNIQUE(kind,source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_governance_events (
 id VARCHAR(191) PRIMARY KEY NOT NULL,source_type VARCHAR(191) NOT NULL,source_id VARCHAR(191) NOT NULL,action VARCHAR(191) NOT NULL,
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),created_at BIGINT NOT NULL,reason LONGTEXT NOT NULL,
 details_json LONGTEXT NOT NULL CHECK(json_valid(details_json)),request_id VARCHAR(191) NOT NULL,
 UNIQUE(actor_id,request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;















CREATE INDEX team_handoffs_current ON team_handoffs(duty_id,state,starts_at,ends_at);

CREATE INDEX team_governance_tasks_scan ON team_governance_tasks(state,id);

CREATE INDEX team_governance_tasks_subject ON team_governance_tasks(kind,subject_user_id,state);

DELIMITER $$
CREATE TRIGGER team_no_self_backup BEFORE INSERT ON team_duty_backups FOR EACH ROW BEGIN
IF EXISTS(SELECT 1 FROM team_duties WHERE id=NEW.duty_id AND primary_user_id=NEW.user_id) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='team_primary_cannot_back_own_absence';
END IF;
END$$
CREATE TRIGGER team_event_immutable BEFORE UPDATE ON team_governance_events FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='team_governance_history_immutable';
END$$
CREATE TRIGGER team_event_retained BEFORE DELETE ON team_governance_events FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='team_governance_history_retained';
END$$
CREATE TRIGGER team_access_review_immutable BEFORE UPDATE ON team_access_reviews FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='team_access_review_immutable';
END$$
CREATE TRIGGER team_access_review_retained BEFORE DELETE ON team_access_reviews FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='team_access_review_retained';
END$$
CREATE TRIGGER team_ack_original BEFORE UPDATE ON team_procedure_assignments FOR EACH ROW BEGIN
IF BINARY NEW.procedure_id<>BINARY OLD.procedure_id OR BINARY NEW.user_id<>BINARY OLD.user_id OR BINARY NEW.assigned_at<>BINARY OLD.assigned_at OR (OLD.acknowledged_at IS NOT NULL AND (NEW.acknowledged_at IS NULL OR BINARY NEW.acknowledged_at<>BINARY OLD.acknowledged_at)) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='team_acknowledgment_original_retained';
END IF;
END$$
CREATE TRIGGER team_procedure_original_immutable BEFORE UPDATE ON team_procedures FOR EACH ROW BEGIN
IF BINARY NEW.family<>BINARY OLD.family OR BINARY NEW.version<>BINARY OLD.version OR BINARY NEW.title<>BINARY OLD.title OR BINARY NEW.body<>BINARY OLD.body OR BINARY NEW.published_at<>BINARY OLD.published_at OR (NEW.native_source_type IS NULL)<>(OLD.native_source_type IS NULL) OR BINARY NEW.native_source_type<>BINARY OLD.native_source_type OR (NEW.native_source_id IS NULL)<>(OLD.native_source_id IS NULL) OR BINARY NEW.native_source_id<>BINARY OLD.native_source_id OR (NEW.native_source_sha256 IS NULL)<>(OLD.native_source_sha256 IS NULL) OR BINARY NEW.native_source_sha256<>BINARY OLD.native_source_sha256 THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='team_procedure_version_immutable';
END IF;
END$$
CREATE TRIGGER team_task_original_clock BEFORE UPDATE ON team_governance_tasks FOR EACH ROW BEGIN
IF BINARY NEW.created_at<>BINARY OLD.created_at OR BINARY NEW.due_at<>BINARY OLD.due_at OR BINARY NEW.kind<>BINARY OLD.kind OR BINARY NEW.source_id<>BINARY OLD.source_id OR BINARY NEW.source_reference_json<>BINARY OLD.source_reference_json THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='team_task_original_clock_immutable';
END IF;
END$$
DELIMITER ;
