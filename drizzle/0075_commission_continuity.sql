-- Purpose-specific preservation of original 9% economics and original consent.
-- This migration creates storage only; no operation or consent is inserted.
CREATE TABLE commission_continuity_operations (
 id TEXT PRIMARY KEY, request_json TEXT NOT NULL, source_release TEXT NOT NULL,
 source_commit TEXT NOT NULL, capture_sha256 TEXT NOT NULL, selection_sha256 TEXT NOT NULL,
 basis_points INTEGER NOT NULL CHECK(basis_points=900),
 started_at INTEGER NOT NULL, ends_at INTEGER NOT NULL CHECK(ends_at=1794334500000 AND started_at<ends_at),
 actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 recorded_at INTEGER NOT NULL CHECK(recorded_at=started_at)
);
CREATE TABLE commission_continuity_settings (
 operation_id TEXT NOT NULL REFERENCES commission_continuity_operations(id) ON DELETE RESTRICT,
 setting_key TEXT NOT NULL, setting_id TEXT PRIMARY KEY REFERENCES business_setting_versions(id) ON DELETE RESTRICT,
 successor_id TEXT NOT NULL UNIQUE REFERENCES business_setting_versions(id) ON DELETE RESTRICT,
 current_json TEXT NOT NULL, successor_json TEXT NOT NULL,
 UNIQUE(operation_id,setting_key),
 CHECK(setting_key IN ('independent_seller_commission_bps','managed_sale_linked_platform_retention_bps'))
);
CREATE TABLE commission_continuity_sellers (
 id TEXT PRIMARY KEY, operation_id TEXT NOT NULL REFERENCES commission_continuity_operations(id) ON DELETE RESTRICT,
 setting_id TEXT NOT NULL REFERENCES commission_continuity_settings(setting_id) ON DELETE RESTRICT,
 seller_id TEXT NOT NULL UNIQUE REFERENCES seller_profiles(id) ON DELETE RESTRICT,
 owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 agreement_version TEXT NOT NULL, accepted_at INTEGER NOT NULL,
 audit_id TEXT NOT NULL UNIQUE REFERENCES audit_logs(id) ON DELETE RESTRICT, audit_json TEXT NOT NULL,
 UNIQUE(operation_id,seller_id)
);
CREATE TRIGGER commission_continuity_operations_no_update BEFORE UPDATE ON commission_continuity_operations BEGIN SELECT RAISE(ABORT,'continuity immutable'); END;
CREATE TRIGGER commission_continuity_operations_no_delete BEFORE DELETE ON commission_continuity_operations BEGIN SELECT RAISE(ABORT,'continuity immutable'); END;
CREATE TRIGGER commission_continuity_operations_no_replace BEFORE INSERT ON commission_continuity_operations WHEN EXISTS(SELECT 1 FROM commission_continuity_operations WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'continuity immutable'); END;
CREATE TRIGGER commission_continuity_settings_no_update BEFORE UPDATE ON commission_continuity_settings BEGIN SELECT RAISE(ABORT,'continuity immutable'); END;
CREATE TRIGGER commission_continuity_settings_no_delete BEFORE DELETE ON commission_continuity_settings BEGIN SELECT RAISE(ABORT,'continuity immutable'); END;
CREATE TRIGGER commission_continuity_settings_no_replace BEFORE INSERT ON commission_continuity_settings WHEN EXISTS(SELECT 1 FROM commission_continuity_settings WHERE setting_id=NEW.setting_id OR successor_id=NEW.successor_id OR (operation_id=NEW.operation_id AND setting_key=NEW.setting_key)) BEGIN SELECT RAISE(ABORT,'continuity immutable'); END;
CREATE TRIGGER commission_continuity_sellers_no_update BEFORE UPDATE ON commission_continuity_sellers BEGIN SELECT RAISE(ABORT,'continuity immutable'); END;
CREATE TRIGGER commission_continuity_sellers_no_delete BEFORE DELETE ON commission_continuity_sellers BEGIN SELECT RAISE(ABORT,'continuity immutable'); END;
CREATE TRIGGER commission_continuity_sellers_no_replace BEFORE INSERT ON commission_continuity_sellers WHEN EXISTS(SELECT 1 FROM commission_continuity_sellers WHERE id=NEW.id OR seller_id=NEW.seller_id OR audit_id=NEW.audit_id) BEGIN SELECT RAISE(ABORT,'continuity immutable'); END;
