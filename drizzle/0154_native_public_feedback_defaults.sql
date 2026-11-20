-- Public extra-question publications are optional; retain every original delivery fact.
-- SQLite requires a table rebuild to remove NOT NULL. No incoming foreign keys exist
-- in the reviewed schema; foreign-key enforcement stays ON throughout this migration.
CREATE TABLE feedback_delivery_jobs_native_defaults (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE CHECK(length(request_id) BETWEEN 8 AND 191),
  form_id TEXT NOT NULL CHECK(form_id IN ('public.contact','public.feedback','public.footer-feedback')),
  config_version_id TEXT,
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
INSERT INTO feedback_delivery_jobs_native_defaults
  (id,request_id,form_id,config_version_id,payload_hash,feedback_json,status,lease_token,lease_expires_at,attempt_count,created_at,updated_at,sent_at)
SELECT id,request_id,form_id,config_version_id,payload_hash,feedback_json,status,lease_token,lease_expires_at,attempt_count,created_at,updated_at,sent_at
FROM feedback_delivery_jobs;
--> statement-breakpoint
DROP TABLE feedback_delivery_jobs;
--> statement-breakpoint
ALTER TABLE feedback_delivery_jobs_native_defaults RENAME TO feedback_delivery_jobs;
--> statement-breakpoint
CREATE INDEX idx_feedback_delivery_jobs_status_lease ON feedback_delivery_jobs(status,lease_expires_at,updated_at);
--> statement-breakpoint
CREATE INDEX idx_feedback_delivery_jobs_created ON feedback_delivery_jobs(created_at DESC,id);
--> statement-breakpoint
CREATE TRIGGER feedback_native_origin_insert BEFORE INSERT ON feedback_delivery_jobs
WHEN NEW.config_version_id IS NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM audit_logs fact JOIN audit_logs receipt
      ON HEX(receipt.id)=HEX(json_extract(fact.next_json,'$.coreReceiptId'))
    WHERE HEX(fact.id)=HEX('feedback:'||NEW.id||':submitted')
      AND HEX(fact.action)=HEX('feedback.submitted') AND fact.actor_id IS NULL
      AND HEX(fact.subject_type)=HEX('feedback_submission') AND HEX(fact.subject_id)=HEX(NEW.id)
      AND fact.created_at=NEW.created_at
      AND HEX(json_extract(fact.next_json,'$.formId'))=HEX(NEW.form_id)
      AND HEX(json_extract(fact.next_json,'$.requestId'))=HEX(NEW.request_id)
      AND HEX(json_extract(fact.next_json,'$.versionId'))=HEX('core:'||NEW.form_id||':1')
      AND HEX(json_extract(fact.next_json,'$.payloadHash'))=HEX(NEW.payload_hash)
      AND HEX(receipt.action)=HEX('form.core_answers') AND receipt.actor_id IS NULL
      AND HEX(receipt.subject_type)=HEX('feedback_submission') AND HEX(receipt.subject_id)=HEX(NEW.id)
      AND receipt.created_at=NEW.created_at
      AND HEX(json_extract(receipt.next_json,'$.formId'))=HEX(NEW.form_id)
      AND HEX(json_extract(receipt.next_json,'$.requestId'))=HEX(NEW.request_id)
      AND HEX(json_extract(receipt.next_json,'$.versionId'))=HEX('core:'||NEW.form_id||':1')
      AND json_type(receipt.next_json,'$.version')='integer' AND json_extract(receipt.next_json,'$.version')=1
      AND json_type(receipt.next_json,'$.answers')='array'
      AND json_array_length(json_extract(receipt.next_json,'$.answers'))=0
  ) THEN RAISE(ABORT,'Native feedback origin requires its exact immutable receipts') END;
END;
--> statement-breakpoint
CREATE TRIGGER feedback_native_origin_update BEFORE UPDATE ON feedback_delivery_jobs
WHEN NEW.config_version_id IS NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM audit_logs fact JOIN audit_logs receipt
      ON HEX(receipt.id)=HEX(json_extract(fact.next_json,'$.coreReceiptId'))
    WHERE HEX(fact.id)=HEX('feedback:'||NEW.id||':submitted')
      AND HEX(fact.action)=HEX('feedback.submitted') AND fact.actor_id IS NULL
      AND HEX(fact.subject_type)=HEX('feedback_submission') AND HEX(fact.subject_id)=HEX(NEW.id)
      AND fact.created_at=NEW.created_at
      AND HEX(json_extract(fact.next_json,'$.formId'))=HEX(NEW.form_id)
      AND HEX(json_extract(fact.next_json,'$.requestId'))=HEX(NEW.request_id)
      AND HEX(json_extract(fact.next_json,'$.versionId'))=HEX('core:'||NEW.form_id||':1')
      AND HEX(json_extract(fact.next_json,'$.payloadHash'))=HEX(NEW.payload_hash)
      AND HEX(receipt.action)=HEX('form.core_answers') AND receipt.actor_id IS NULL
      AND HEX(receipt.subject_type)=HEX('feedback_submission') AND HEX(receipt.subject_id)=HEX(NEW.id)
      AND receipt.created_at=NEW.created_at
      AND HEX(json_extract(receipt.next_json,'$.formId'))=HEX(NEW.form_id)
      AND HEX(json_extract(receipt.next_json,'$.requestId'))=HEX(NEW.request_id)
      AND HEX(json_extract(receipt.next_json,'$.versionId'))=HEX('core:'||NEW.form_id||':1')
      AND json_type(receipt.next_json,'$.version')='integer' AND json_extract(receipt.next_json,'$.version')=1
      AND json_type(receipt.next_json,'$.answers')='array'
      AND json_array_length(json_extract(receipt.next_json,'$.answers'))=0
  ) THEN RAISE(ABORT,'Native feedback origin requires its exact immutable receipts') END;
END;
--> statement-breakpoint
CREATE TRIGGER feedback_native_facts_immutable BEFORE UPDATE ON feedback_delivery_jobs
WHEN OLD.config_version_id IS NULL AND (
  NEW.id IS NOT OLD.id OR NEW.request_id IS NOT OLD.request_id OR NEW.form_id IS NOT OLD.form_id
  OR NEW.config_version_id IS NOT OLD.config_version_id OR NEW.payload_hash IS NOT OLD.payload_hash
  OR NEW.feedback_json IS NOT OLD.feedback_json OR NEW.created_at IS NOT OLD.created_at)
BEGIN
  SELECT RAISE(ABORT,'Original native feedback facts are immutable');
END;
--> statement-breakpoint
-- Native parent facts contain references/hashes, not the private feedback body.
-- Preserve the established audit privacy exception: an actor may become NULL.
CREATE TRIGGER feedback_native_proof_immutable BEFORE UPDATE ON audit_logs
WHEN HEX(OLD.action)=HEX('feedback.submitted') AND (
  NEW.id IS NOT OLD.id OR NEW.action IS NOT OLD.action OR NEW.subject_type IS NOT OLD.subject_type
  OR NEW.subject_id IS NOT OLD.subject_id OR NEW.request_id IS NOT OLD.request_id
  OR NEW.next_json IS NOT OLD.next_json OR NEW.previous_json IS NOT OLD.previous_json
  OR NEW.created_at IS NOT OLD.created_at OR (NEW.actor_id IS NOT NULL AND NEW.actor_id IS NOT OLD.actor_id))
BEGIN
  SELECT RAISE(ABORT,'Native feedback parent proof is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER feedback_native_proof_retained BEFORE DELETE ON audit_logs
WHEN HEX(OLD.action)=HEX('feedback.submitted')
BEGIN
  SELECT RAISE(ABORT,'Native feedback parent proof is retained');
END;
