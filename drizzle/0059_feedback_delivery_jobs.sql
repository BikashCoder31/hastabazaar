-- One global request key across contact, feedback and footer intake prevents source switching.
CREATE TABLE IF NOT EXISTS feedback_delivery_jobs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE CHECK(length(request_id) BETWEEN 8 AND 191),
  form_id TEXT NOT NULL CHECK(form_id IN ('public.contact','public.feedback','public.footer-feedback')),
  config_version_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
  feedback_json TEXT NOT NULL CHECK(json_valid(feedback_json) AND json_type(feedback_json)='object' AND length(CAST(feedback_json AS BLOB))<=8192),
  status TEXT NOT NULL CHECK(status IN ('pending','leased','sending','failed','sent')),
  lease_token TEXT,
  lease_expires_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 5),
  created_at INTEGER NOT NULL CHECK(created_at>=0),
  updated_at INTEGER NOT NULL CHECK(updated_at>=created_at),
  sent_at INTEGER,
  FOREIGN KEY(form_id,config_version_id) REFERENCES form_config_versions(form_id,id) ON DELETE RESTRICT,
  CHECK((status IN ('leased','sending') AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status IN ('pending','failed','sent') AND lease_token IS NULL AND lease_expires_at IS NULL)),
  CHECK((status='sent' AND sent_at IS NOT NULL) OR (status<>'sent' AND sent_at IS NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_feedback_delivery_jobs_status_lease ON feedback_delivery_jobs(status,lease_expires_at,updated_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_feedback_delivery_jobs_created ON feedback_delivery_jobs(created_at DESC,id);
