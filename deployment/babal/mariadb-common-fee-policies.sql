-- Source-only counterpart of 0089. Does not change any existing fee or acceptance.
CREATE TABLE commission_common_policies (
 id VARCHAR(191) PRIMARY KEY,registered_setting_id VARCHAR(191) NOT NULL UNIQUE,managed_setting_id VARCHAR(191) NOT NULL UNIQUE,basis_points BIGINT NOT NULL CHECK(basis_points BETWEEN 0 AND 10000),effective_at BIGINT NOT NULL,published_at BIGINT NOT NULL,published_by VARCHAR(191) NOT NULL,reason VARCHAR(1000) NOT NULL,terms_text LONGTEXT NOT NULL,replaces_id VARCHAR(191),
 CHECK(effective_at>=published_at+1296000000),FOREIGN KEY(registered_setting_id) REFERENCES business_setting_versions(id),FOREIGN KEY(managed_setting_id) REFERENCES business_setting_versions(id),FOREIGN KEY(published_by) REFERENCES users(id),FOREIGN KEY(replaces_id) REFERENCES commission_common_policies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE commission_common_cancellations (
 policy_id VARCHAR(191) PRIMARY KEY,replacement_id VARCHAR(191),actor_id VARCHAR(191) NOT NULL,reason VARCHAR(1000) NOT NULL,created_at BIGINT NOT NULL,event_id VARCHAR(191) NOT NULL UNIQUE,
 FOREIGN KEY(policy_id) REFERENCES commission_common_policies(id),FOREIGN KEY(replacement_id) REFERENCES commission_common_policies(id),FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE commission_terms_cases (
 id VARCHAR(191) PRIMARY KEY,seller_id VARCHAR(191) NOT NULL,source_version_id VARCHAR(191) NOT NULL,offer_key VARCHAR(191) NOT NULL,route VARCHAR(40) NOT NULL CHECK(route IN ('registered_seller','managed_maker')),state VARCHAR(30) NOT NULL CHECK(state IN ('open','accepted','replaced')),revision BIGINT NOT NULL DEFAULT 1,published_at BIGINT NOT NULL,effective_at BIGINT NOT NULL,created_at BIGINT NOT NULL,observed_at BIGINT NOT NULL,last_notice_event_id VARCHAR(191),last_staff_event_id VARCHAR(191),last_contact_at BIGINT,last_reply_at BIGINT,hold_reviewed_at BIGINT,super_admin_reviewed_at BIGINT,next_review_at BIGINT,technical_issue_at BIGINT,technical_owner_id VARCHAR(191),technical_resolved_at BIGINT,delivery_issue_at BIGINT,delivery_resolved_at BIGINT,
 UNIQUE(seller_id,offer_key),FOREIGN KEY(seller_id) REFERENCES seller_profiles(id),FOREIGN KEY(source_version_id) REFERENCES business_setting_versions(id),FOREIGN KEY(technical_owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE commission_terms_events (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL,event_key VARCHAR(191) NOT NULL UNIQUE,kind VARCHAR(60) NOT NULL,due_at BIGINT NOT NULL,created_at BIGINT NOT NULL,routine BIGINT NOT NULL CHECK(routine IN (0,1)),actor_id VARCHAR(191),detail_json LONGTEXT NOT NULL,
 FOREIGN KEY(case_id) REFERENCES commission_terms_cases(id),FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE commission_terms_email_controls (
 seller_id VARCHAR(191) PRIMARY KEY,revision BIGINT NOT NULL DEFAULT 0,last_routine_queued_at BIGINT,last_routine_sent_at BIGINT,last_personal_contact_at BIGINT,last_routine_message_id VARCHAR(191),routine_claim_token VARCHAR(191),routine_claim_message_id VARCHAR(191),routine_claim_until BIGINT NOT NULL DEFAULT 0,
 FOREIGN KEY(seller_id) REFERENCES seller_profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE commission_terms_hold_batches(id VARCHAR(191) PRIMARY KEY,created_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE commission_terms_hold_batch_events(event_id VARCHAR(191) PRIMARY KEY,batch_id VARCHAR(191) NOT NULL,FOREIGN KEY(event_id) REFERENCES commission_terms_events(id),FOREIGN KEY(batch_id) REFERENCES commission_terms_hold_batches(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE commission_terms_scan_state(id VARCHAR(191) PRIMARY KEY CHECK(id='default'),`cursor` VARCHAR(191) NOT NULL DEFAULT '',revision BIGINT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO commission_terms_scan_state(id) VALUES('default');

DELIMITER $$
CREATE TRIGGER common_fee_policy_immutable BEFORE UPDATE ON commission_common_policies FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='common_fee_policy_immutable'; END$$
CREATE TRIGGER common_fee_policy_retained BEFORE DELETE ON commission_common_policies FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='common_fee_policy_retained'; END$$
CREATE TRIGGER common_fee_cancellation_immutable BEFORE UPDATE ON commission_common_cancellations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='common_fee_cancellation_immutable'; END$$
CREATE TRIGGER common_fee_cancellation_retained BEFORE DELETE ON commission_common_cancellations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='common_fee_cancellation_retained'; END$$
CREATE TRIGGER commission_terms_event_immutable BEFORE UPDATE ON commission_terms_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='commission_terms_event_immutable'; END$$
CREATE TRIGGER commission_terms_event_retained BEFORE DELETE ON commission_terms_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='commission_terms_event_retained'; END$$
DELIMITER ;
