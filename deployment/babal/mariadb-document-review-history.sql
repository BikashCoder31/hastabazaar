-- Source artifact only. No existing database is changed by generating this file.
CREATE TABLE IF NOT EXISTS seller_document_change_requests (
 id VARCHAR(191) PRIMARY KEY, seller_id VARCHAR(191) NOT NULL, document_id VARCHAR(191) NOT NULL,
 requested_by VARCHAR(191) NOT NULL, reason TEXT NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','approved','rejected','completed')),
 requested_at BIGINT NOT NULL, reviewed_by VARCHAR(191), reviewed_at BIGINT, review_reason TEXT,
 KEY idx_seller_document_change_requests_seller(seller_id,status),
 FOREIGN KEY(seller_id) REFERENCES seller_profiles(id), FOREIGN KEY(document_id) REFERENCES seller_documents(id),
 FOREIGN KEY(requested_by) REFERENCES users(id), FOREIGN KEY(reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Preserve the replacement FK with a unique name; inline REFERENCES can reuse an existing implicit InnoDB name during ALTER.
ALTER TABLE seller_document_change_requests ADD COLUMN IF NOT EXISTS replacement_document_id VARCHAR(191),
 ADD CONSTRAINT fk_doc_change_replacement_document FOREIGN KEY(replacement_document_id) REFERENCES seller_documents(id);
ALTER TABLE seller_document_change_requests ADD COLUMN IF NOT EXISTS operation_request_id VARCHAR(191);
ALTER TABLE seller_document_change_requests ADD COLUMN IF NOT EXISTS active_permission_id VARCHAR(191);
ALTER TABLE seller_documents ADD COLUMN IF NOT EXISTS review_request_id VARCHAR(191);
CREATE TABLE seller_document_replacement_permissions (
 id VARCHAR(191) PRIMARY KEY,request_id VARCHAR(191) NOT NULL,document_id VARCHAR(191) NOT NULL,expected_review_id VARCHAR(191),
 reviewed_by VARCHAR(191) NOT NULL,reviewed_at BIGINT NOT NULL,reason TEXT NOT NULL,used_document_id VARCHAR(191) UNIQUE,used_at BIGINT,
 FOREIGN KEY(request_id) REFERENCES seller_document_change_requests(id),FOREIGN KEY(document_id) REFERENCES seller_documents(id),
 FOREIGN KEY(reviewed_by) REFERENCES users(id),FOREIGN KEY(used_document_id) REFERENCES seller_documents(id),
 KEY seller_document_permission_request(request_id,reviewed_at),
 CHECK((used_document_id IS NULL AND used_at IS NULL) OR (used_document_id IS NOT NULL AND used_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER seller_document_permission_immutable BEFORE UPDATE ON seller_document_replacement_permissions FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.request_id <=> OLD.request_id) OR NOT(NEW.document_id <=> OLD.document_id)
 OR NOT(NEW.expected_review_id <=> OLD.expected_review_id) OR NOT(NEW.reviewed_by <=> OLD.reviewed_by)
 OR NOT(NEW.reviewed_at <=> OLD.reviewed_at) OR NOT(NEW.reason <=> OLD.reason)
 OR (OLD.used_document_id IS NOT NULL AND (NOT(NEW.used_document_id <=> OLD.used_document_id) OR NOT(NEW.used_at <=> OLD.used_at)))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_document_permission_immutable'; END IF;
END$$
CREATE TRIGGER seller_document_permission_retained BEFORE DELETE ON seller_document_replacement_permissions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_document_permission_retained';
END$$
CREATE TRIGGER seller_document_identity_immutable BEFORE UPDATE ON seller_documents FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.seller_id <=> OLD.seller_id) OR NOT(NEW.kind <=> OLD.kind)
 OR NOT(NEW.object_key <=> OLD.object_key) OR NOT(NEW.original_name <=> OLD.original_name)
 OR NOT(NEW.mime_type <=> OLD.mime_type) OR NOT(NEW.size_bytes <=> OLD.size_bytes) OR NOT(NEW.uploaded_at <=> OLD.uploaded_at)
 OR (OLD.status='verified' AND (NOT(NEW.status <=> OLD.status) OR NOT(NEW.reviewed_at <=> OLD.reviewed_at)
 OR (NEW.reviewed_by IS NOT NULL AND NOT(NEW.reviewed_by <=> OLD.reviewed_by)) OR NOT(NEW.review_request_id <=> OLD.review_request_id)))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_document_version_immutable'; END IF;
END$$
CREATE TRIGGER seller_document_reviewed_retained BEFORE DELETE ON seller_documents FOR EACH ROW BEGIN
 IF OLD.status='verified' OR EXISTS(SELECT 1 FROM seller_document_change_requests WHERE document_id=OLD.id OR replacement_document_id=OLD.id)
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_document_history_retained'; END IF;
END$$
CREATE TRIGGER seller_document_request_identity_immutable BEFORE UPDATE ON seller_document_change_requests FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.seller_id <=> OLD.seller_id) OR NOT(NEW.document_id <=> OLD.document_id)
 OR NOT(NEW.requested_by <=> OLD.requested_by) OR NOT(NEW.reason <=> OLD.reason) OR NOT(NEW.requested_at <=> OLD.requested_at)
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_document_request_immutable'; END IF;
END$$
CREATE TRIGGER seller_document_request_retained BEFORE DELETE ON seller_document_change_requests FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_document_request_retained';
END$$
CREATE TRIGGER seller_document_audit_immutable BEFORE UPDATE ON audit_logs FOR EACH ROW BEGIN
 IF OLD.action LIKE 'seller.document.%' AND (NOT(NEW.id <=> OLD.id) OR NOT(NEW.action <=> OLD.action)
 OR NOT(NEW.subject_type <=> OLD.subject_type) OR NOT(NEW.subject_id <=> OLD.subject_id) OR NOT(NEW.reason <=> OLD.reason)
 OR NOT(NEW.previous_json <=> OLD.previous_json) OR NOT(NEW.next_json <=> OLD.next_json) OR NOT(NEW.request_id <=> OLD.request_id)
 OR NOT(NEW.created_at <=> OLD.created_at) OR (NEW.actor_id IS NOT NULL AND NOT(NEW.actor_id <=> OLD.actor_id)))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_document_audit_immutable'; END IF;
END$$
CREATE TRIGGER seller_document_audit_retained BEFORE DELETE ON audit_logs FOR EACH ROW BEGIN
 IF OLD.action LIKE 'seller.document.%' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_document_audit_retained'; END IF;
END$$
DELIMITER ;
