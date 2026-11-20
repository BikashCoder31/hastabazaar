-- Additive storage only. No rates, bindings, approvals or acceptances are inserted.
CREATE TABLE IF NOT EXISTS commission_continuity_operations (
 id VARCHAR(191) NOT NULL,
 request_json LONGTEXT COLLATE utf8mb4_bin NOT NULL,
 source_release VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 source_commit VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
 capture_sha256 VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
 selection_sha256 VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
 basis_points BIGINT NOT NULL,
 started_at BIGINT NOT NULL,
 ends_at BIGINT NOT NULL,
 actor_id VARCHAR(191) NOT NULL,
 recorded_at BIGINT NOT NULL,
 PRIMARY KEY(id),
 CONSTRAINT continuity_operation_rate CHECK(basis_points=900),
 CONSTRAINT continuity_operation_interval CHECK(ends_at=1794334500000 AND started_at<ends_at),
 CONSTRAINT continuity_operation_recorded CHECK(recorded_at=started_at),
 CONSTRAINT continuity_operation_actor_fk FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS commission_continuity_settings (
 operation_id VARCHAR(191) NOT NULL,
 setting_key VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 setting_id VARCHAR(191) NOT NULL,
 successor_id VARCHAR(191) NOT NULL,
 current_json LONGTEXT COLLATE utf8mb4_bin NOT NULL,
 successor_json LONGTEXT COLLATE utf8mb4_bin NOT NULL,
 PRIMARY KEY(setting_id),
 UNIQUE KEY continuity_setting_successor(successor_id),
 UNIQUE KEY continuity_operation_key(operation_id,setting_key),
 CONSTRAINT continuity_setting_key CHECK(setting_key IN ('independent_seller_commission_bps','managed_sale_linked_platform_retention_bps')),
 CONSTRAINT continuity_setting_operation_fk FOREIGN KEY(operation_id) REFERENCES commission_continuity_operations(id) ON DELETE RESTRICT,
 CONSTRAINT continuity_setting_current_fk FOREIGN KEY(setting_id) REFERENCES business_setting_versions(id) ON DELETE RESTRICT,
 CONSTRAINT continuity_setting_successor_fk FOREIGN KEY(successor_id) REFERENCES business_setting_versions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS commission_continuity_sellers (
 id VARCHAR(191) NOT NULL,
 operation_id VARCHAR(191) NOT NULL,
 setting_id VARCHAR(191) NOT NULL,
 seller_id VARCHAR(191) NOT NULL,
 owner_id VARCHAR(191) NOT NULL,
 agreement_version VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 accepted_at BIGINT NOT NULL,
 audit_id VARCHAR(191) NOT NULL,
 audit_json LONGTEXT COLLATE utf8mb4_bin NOT NULL,
 PRIMARY KEY(id),
 UNIQUE KEY continuity_seller_identity(seller_id),
 UNIQUE KEY continuity_seller_audit(audit_id),
 UNIQUE KEY continuity_operation_seller(operation_id,seller_id),
 CONSTRAINT continuity_seller_operation_fk FOREIGN KEY(operation_id) REFERENCES commission_continuity_operations(id) ON DELETE RESTRICT,
 CONSTRAINT continuity_seller_setting_fk FOREIGN KEY(setting_id) REFERENCES commission_continuity_settings(setting_id) ON DELETE RESTRICT,
 CONSTRAINT continuity_seller_profile_fk FOREIGN KEY(seller_id) REFERENCES seller_profiles(id) ON DELETE RESTRICT,
 CONSTRAINT continuity_seller_owner_fk FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT continuity_seller_audit_fk FOREIGN KEY(audit_id) REFERENCES audit_logs(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DROP TRIGGER IF EXISTS commission_continuity_operations_no_update;
CREATE TRIGGER commission_continuity_operations_no_update BEFORE UPDATE ON commission_continuity_operations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable';
DROP TRIGGER IF EXISTS commission_continuity_operations_no_delete;
CREATE TRIGGER commission_continuity_operations_no_delete BEFORE DELETE ON commission_continuity_operations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable';
DROP TRIGGER IF EXISTS commission_continuity_operations_no_replace;
DELIMITER $$
CREATE TRIGGER commission_continuity_operations_no_replace BEFORE INSERT ON commission_continuity_operations FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM commission_continuity_operations WHERE id=NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS commission_continuity_settings_no_update;
CREATE TRIGGER commission_continuity_settings_no_update BEFORE UPDATE ON commission_continuity_settings FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable';
DROP TRIGGER IF EXISTS commission_continuity_settings_no_delete;
CREATE TRIGGER commission_continuity_settings_no_delete BEFORE DELETE ON commission_continuity_settings FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable';
DROP TRIGGER IF EXISTS commission_continuity_settings_no_replace;
DELIMITER $$
CREATE TRIGGER commission_continuity_settings_no_replace BEFORE INSERT ON commission_continuity_settings FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM commission_continuity_settings WHERE setting_id=NEW.setting_id OR successor_id=NEW.successor_id OR (operation_id=NEW.operation_id AND setting_key=NEW.setting_key)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS commission_continuity_sellers_no_update;
CREATE TRIGGER commission_continuity_sellers_no_update BEFORE UPDATE ON commission_continuity_sellers FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable';
DROP TRIGGER IF EXISTS commission_continuity_sellers_no_delete;
CREATE TRIGGER commission_continuity_sellers_no_delete BEFORE DELETE ON commission_continuity_sellers FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable';
DROP TRIGGER IF EXISTS commission_continuity_sellers_no_replace;
DELIMITER $$
CREATE TRIGGER commission_continuity_sellers_no_replace BEFORE INSERT ON commission_continuity_sellers FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM commission_continuity_sellers WHERE id=NEW.id OR seller_id=NEW.seller_id OR audit_id=NEW.audit_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable'; END IF;
END$$
DELIMITER ;
