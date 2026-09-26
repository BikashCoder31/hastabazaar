CREATE TABLE IF NOT EXISTS form_config_versions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL CHECK(length(form_id) BETWEEN 1 AND 191),
  version INTEGER NOT NULL CHECK(version >= 1),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  config_json TEXT NOT NULL CHECK(json_valid(config_json) AND json_type(config_json) = 'object' AND length(CAST(config_json AS BLOB)) <= 65536),
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at INTEGER NOT NULL,
  published_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  published_at INTEGER,
  last_request_id TEXT NOT NULL UNIQUE CHECK(length(last_request_id) BETWEEN 1 AND 191),
  CHECK((status = 'draft' AND published_by IS NULL AND published_at IS NULL)
    OR (status = 'published' AND published_by IS NOT NULL AND published_at IS NOT NULL)),
  UNIQUE(form_id, version),
  UNIQUE(form_id, id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_form_config_versions_current ON form_config_versions(form_id,status,version DESC);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS trg_form_config_versions_published_update
BEFORE UPDATE ON form_config_versions
WHEN OLD.status = 'published'
BEGIN
  SELECT RAISE(ABORT, 'published form configuration is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS trg_form_config_versions_published_delete
BEFORE DELETE ON form_config_versions
WHEN OLD.status = 'published'
BEGIN
  SELECT RAISE(ABORT, 'published form configuration is immutable');
END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS form_answer_sets (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL CHECK(length(form_id) BETWEEN 1 AND 191),
  request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 1 AND 191),
  config_version_id TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK(length(subject_type) BETWEEN 1 AND 64),
  subject_id TEXT NOT NULL CHECK(length(subject_id) BETWEEN 1 AND 191),
  actor_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  answers_json TEXT NOT NULL CHECK(json_valid(answers_json) AND json_type(answers_json) = 'object' AND length(CAST(answers_json AS BLOB)) <= 131072),
  created_at INTEGER NOT NULL,
  FOREIGN KEY(form_id,config_version_id) REFERENCES form_config_versions(form_id,id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_form_answer_sets_form_request ON form_answer_sets(form_id,request_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_form_answer_sets_owner ON form_answer_sets(subject_type,subject_id,created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_form_answer_sets_version ON form_answer_sets(config_version_id,created_at);
