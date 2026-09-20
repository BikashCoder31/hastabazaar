-- Additive: no overrides means existing Admin permissions are retained.
CREATE TABLE IF NOT EXISTS staff_permission_profiles (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
 permissions_json TEXT NOT NULL,
 last_request_id TEXT,
 version INTEGER NOT NULL DEFAULT 0,
 updated_by TEXT NOT NULL REFERENCES users(id),
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS staff_permission_requests (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 permissions_json TEXT NOT NULL,
 expected_version INTEGER NOT NULL,
 preset_name TEXT,
 reason TEXT NOT NULL,
 proposed_by TEXT NOT NULL REFERENCES users(id),
 proposed_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 decided_by TEXT REFERENCES users(id),
 decided_at INTEGER,
 decision_note TEXT,
 decision_token TEXT,
 CHECK(decided_by IS NULL OR decided_by <> proposed_by)
);
CREATE TABLE IF NOT EXISTS staff_permission_presets (
 id TEXT PRIMARY KEY NOT NULL REFERENCES staff_permission_requests(id),
 name TEXT NOT NULL,
 permissions_json TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS staff_permission_guards (
 id TEXT PRIMARY KEY NOT NULL,
 valid INTEGER NOT NULL CHECK(valid = 1)
);
