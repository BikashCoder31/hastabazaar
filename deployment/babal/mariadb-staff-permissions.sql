-- Additive: no overrides means existing Admin permissions are retained.
CREATE TABLE IF NOT EXISTS staff_permission_profiles (
 user_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES users(id),
 permissions_json TEXT NOT NULL,
 last_request_id TEXT,
 version BIGINT NOT NULL DEFAULT 0,
 updated_by VARCHAR(191) NOT NULL REFERENCES users(id),
 updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS staff_permission_requests (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 user_id VARCHAR(191) NOT NULL REFERENCES users(id),
 permissions_json TEXT NOT NULL,
 expected_version BIGINT NOT NULL,
 preset_name TEXT,
 reason TEXT NOT NULL,
 proposed_by VARCHAR(191) NOT NULL REFERENCES users(id),
 proposed_at BIGINT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 decided_by VARCHAR(191) REFERENCES users(id),
 decided_at BIGINT,
 decision_note TEXT,
 decision_token TEXT,
 CHECK(decided_by IS NULL OR decided_by <> proposed_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS staff_permission_presets (
 id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES staff_permission_requests(id),
 name TEXT NOT NULL,
 permissions_json TEXT NOT NULL,
 created_by VARCHAR(191) NOT NULL REFERENCES users(id),
 created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS staff_permission_guards (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 valid BIGINT NOT NULL CHECK(valid = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
