ALTER TABLE seller_document_change_requests ADD COLUMN replacement_document_id TEXT REFERENCES seller_documents(id);
--> statement-breakpoint
ALTER TABLE seller_document_change_requests ADD COLUMN operation_request_id TEXT;
--> statement-breakpoint
ALTER TABLE seller_document_change_requests ADD COLUMN active_permission_id TEXT;
--> statement-breakpoint
ALTER TABLE seller_documents ADD COLUMN review_request_id TEXT;
--> statement-breakpoint
CREATE TABLE seller_document_replacement_permissions (
 id TEXT PRIMARY KEY NOT NULL,
 request_id TEXT NOT NULL REFERENCES seller_document_change_requests(id),
 document_id TEXT NOT NULL REFERENCES seller_documents(id),
 expected_review_id TEXT,
 reviewed_by TEXT NOT NULL REFERENCES users(id),
 reviewed_at INTEGER NOT NULL,
 reason TEXT NOT NULL,
 used_document_id TEXT UNIQUE REFERENCES seller_documents(id),
 used_at INTEGER,
 CHECK((used_document_id IS NULL AND used_at IS NULL) OR (used_document_id IS NOT NULL AND used_at IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX seller_document_permission_request ON seller_document_replacement_permissions(request_id,reviewed_at);
--> statement-breakpoint
CREATE TRIGGER seller_document_permission_immutable BEFORE UPDATE ON seller_document_replacement_permissions
WHEN NEW.id IS NOT OLD.id OR NEW.request_id IS NOT OLD.request_id OR NEW.document_id IS NOT OLD.document_id
 OR NEW.expected_review_id IS NOT OLD.expected_review_id OR NEW.reviewed_by IS NOT OLD.reviewed_by
 OR NEW.reviewed_at IS NOT OLD.reviewed_at OR NEW.reason IS NOT OLD.reason
 OR (OLD.used_document_id IS NOT NULL AND (NEW.used_document_id IS NOT OLD.used_document_id OR NEW.used_at IS NOT OLD.used_at))
BEGIN SELECT RAISE(ABORT,'seller_document_permission_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER seller_document_permission_retained BEFORE DELETE ON seller_document_replacement_permissions
BEGIN SELECT RAISE(ABORT,'seller_document_permission_retained'); END;
--> statement-breakpoint
CREATE TRIGGER seller_document_identity_immutable BEFORE UPDATE ON seller_documents
WHEN NEW.id IS NOT OLD.id OR NEW.seller_id IS NOT OLD.seller_id OR NEW.kind IS NOT OLD.kind
 OR NEW.object_key IS NOT OLD.object_key OR NEW.original_name IS NOT OLD.original_name
 OR NEW.mime_type IS NOT OLD.mime_type OR NEW.size_bytes IS NOT OLD.size_bytes OR NEW.uploaded_at IS NOT OLD.uploaded_at
 OR (OLD.status='verified' AND (NEW.status IS NOT OLD.status OR NEW.reviewed_at IS NOT OLD.reviewed_at
   OR (NEW.reviewed_by IS NOT NULL AND NEW.reviewed_by IS NOT OLD.reviewed_by) OR NEW.review_request_id IS NOT OLD.review_request_id))
BEGIN SELECT RAISE(ABORT,'seller_document_version_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER seller_document_reviewed_retained BEFORE DELETE ON seller_documents
WHEN OLD.status='verified' OR EXISTS(SELECT 1 FROM seller_document_change_requests WHERE document_id=OLD.id OR replacement_document_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'seller_document_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER seller_document_request_identity_immutable BEFORE UPDATE ON seller_document_change_requests
WHEN NEW.id IS NOT OLD.id OR NEW.seller_id IS NOT OLD.seller_id OR NEW.document_id IS NOT OLD.document_id
 OR NEW.requested_by IS NOT OLD.requested_by OR NEW.reason IS NOT OLD.reason OR NEW.requested_at IS NOT OLD.requested_at
BEGIN SELECT RAISE(ABORT,'seller_document_request_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER seller_document_request_retained BEFORE DELETE ON seller_document_change_requests
BEGIN SELECT RAISE(ABORT,'seller_document_request_retained'); END;
--> statement-breakpoint
CREATE TRIGGER seller_document_audit_immutable BEFORE UPDATE ON audit_logs
WHEN OLD.action LIKE 'seller.document.%' AND (NEW.id IS NOT OLD.id OR NEW.action IS NOT OLD.action
 OR NEW.subject_type IS NOT OLD.subject_type OR NEW.subject_id IS NOT OLD.subject_id OR NEW.reason IS NOT OLD.reason
 OR NEW.previous_json IS NOT OLD.previous_json OR NEW.next_json IS NOT OLD.next_json OR NEW.request_id IS NOT OLD.request_id
 OR NEW.created_at IS NOT OLD.created_at OR (NEW.actor_id IS NOT NULL AND NEW.actor_id IS NOT OLD.actor_id))
BEGIN SELECT RAISE(ABORT,'seller_document_audit_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER seller_document_audit_retained BEFORE DELETE ON audit_logs WHEN OLD.action LIKE 'seller.document.%'
BEGIN SELECT RAISE(ABORT,'seller_document_audit_retained'); END;
