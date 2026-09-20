CREATE TABLE IF NOT EXISTS business_setting_versions (
  id TEXT PRIMARY KEY,
  setting_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  value_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  revision INTEGER NOT NULL DEFAULT 1,
  change_control TEXT NOT NULL,
  effective_from INTEGER,
  effective_until INTEGER,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  submitted_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at INTEGER,
  approved_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  approved_at INTEGER,
  published_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  published_at INTEGER,
  decision_note TEXT,
  supersedes_id TEXT REFERENCES business_setting_versions(id) ON DELETE RESTRICT,
  last_request_id TEXT NOT NULL,
  UNIQUE (setting_key, version),
  UNIQUE (last_request_id),
  CHECK (status IN ('draft', 'pending_approval', 'published', 'rejected', 'cancelled')),
  CHECK (revision >= 1),
  CHECK (change_control IN ('simple', 'controlled')),
  CHECK (effective_until IS NULL OR (effective_from IS NOT NULL AND effective_until > effective_from))
);

CREATE INDEX IF NOT EXISTS idx_business_setting_versions_effective
  ON business_setting_versions (setting_key, status, effective_from, effective_until);
CREATE INDEX IF NOT EXISTS idx_business_setting_versions_review
  ON business_setting_versions (status, created_at);

CREATE TABLE IF NOT EXISTS business_setting_guards (
  id TEXT PRIMARY KEY,
  valid INTEGER NOT NULL,
  CHECK (valid = 1)
);
