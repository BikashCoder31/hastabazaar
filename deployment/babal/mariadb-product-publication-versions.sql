-- Source-only MariaDB counterpart of 0093. No database execution.

CREATE TABLE product_publication_candidates(id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL,case_id VARCHAR(191) NOT NULL,workspace_version_id VARCHAR(191) NOT NULL,offer_version_id VARCHAR(191) NOT NULL UNIQUE,category_version_id VARCHAR(191) NOT NULL,base_version_id VARCHAR(191),created_by VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(case_id) REFERENCES product_intake_cases(id),FOREIGN KEY(workspace_version_id) REFERENCES product_intake_workspace_versions(id),FOREIGN KEY(offer_version_id) REFERENCES product_offer_versions(id),FOREIGN KEY(category_version_id) REFERENCES category_template_versions(id),FOREIGN KEY(base_version_id) REFERENCES product_publication_candidates(id),FOREIGN KEY(created_by) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_publication_links(draft_id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL UNIQUE,base_version_id VARCHAR(191),revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),FOREIGN KEY(draft_id) REFERENCES product_intake_drafts(id),FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(base_version_id) REFERENCES product_publication_candidates(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_publication_decisions(id VARCHAR(191) PRIMARY KEY,version_id VARCHAR(191) NOT NULL,action VARCHAR(191) NOT NULL CHECK(action IN ('approve_only','approve_and_publish','publish_approved','request_changes','reject')),review_json LONGTEXT NOT NULL CHECK(json_valid(review_json)),public_json LONGTEXT CHECK(public_json IS NULL OR json_valid(public_json)),ordering_facts_ready BIGINT NOT NULL DEFAULT 0 CHECK(ordering_facts_ready IN (0,1)),actor_id VARCHAR(191) NOT NULL,reason TEXT NOT NULL,created_at BIGINT NOT NULL,FOREIGN KEY(version_id) REFERENCES product_publication_candidates(id),FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_publication_heads(product_id VARCHAR(191) PRIMARY KEY,revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),pending_version_id VARCHAR(191),current_version_id VARCHAR(191),approved_decision_id VARCHAR(191),current_publication_id VARCHAR(191),last_event_id VARCHAR(191) NOT NULL,updated_at BIGINT NOT NULL,FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(pending_version_id) REFERENCES product_publication_candidates(id),FOREIGN KEY(current_version_id) REFERENCES product_publication_candidates(id),FOREIGN KEY(approved_decision_id) REFERENCES product_publication_decisions(id),FOREIGN KEY(current_publication_id) REFERENCES product_publication_decisions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_publication_media(version_id VARCHAR(191) NOT NULL,media_id VARCHAR(191) NOT NULL,sort_order BIGINT NOT NULL CHECK(sort_order>=0),PRIMARY KEY(version_id,media_id),UNIQUE(version_id,sort_order),FOREIGN KEY(version_id) REFERENCES product_publication_candidates(id),FOREIGN KEY(media_id) REFERENCES product_media(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX product_publication_candidates_case ON product_publication_candidates(case_id,created_at);

DELIMITER $$
CREATE TRIGGER product_publication_link_source BEFORE INSERT ON product_publication_links FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_intake_drafts d JOIN products p ON p.seller_id=d.seller_id WHERE d.id=NEW.draft_id AND p.id=NEW.product_id) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_link_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_link_revision BEFORE UPDATE ON product_publication_links FOR EACH ROW BEGIN
IF NOT(NEW.draft_id <=> OLD.draft_id) OR NOT(NEW.product_id <=> OLD.product_id) OR NEW.revision<>OLD.revision+1 OR NOT EXISTS(SELECT 1 FROM product_publication_heads WHERE product_id=NEW.product_id AND current_version_id <=> NEW.base_version_id) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_link_revision';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_candidate_source BEFORE INSERT ON product_publication_candidates FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_intake_cases c JOIN product_publication_links l ON l.draft_id=c.draft_id JOIN product_intake_workspace_versions v ON v.id=c.version_id JOIN product_offer_versions o ON o.product_id=l.product_id JOIN category_template_versions category ON category.category_id=JSON_VALUE(v.snapshot_json,'$.categoryId') WHERE c.id=NEW.case_id AND c.version_id=NEW.workspace_version_id AND l.product_id=NEW.product_id AND ((v.kind='private' AND l.base_version_id <=> NEW.base_version_id) OR (v.kind='review_only' AND v.base_public_version_id=NEW.base_version_id AND EXISTS(SELECT 1 FROM product_publication_heads h WHERE h.product_id=l.product_id AND h.current_version_id=NEW.base_version_id))) AND o.id=NEW.offer_version_id AND JSON_COMPACT(o.matrix_json)=JSON_COMPACT(JSON_EXTRACT(v.snapshot_json,'$.offers')) AND category.id=NEW.category_version_id) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_candidate_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_candidate_immutable BEFORE UPDATE ON product_publication_candidates FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_candidate_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_candidate_retained BEFORE DELETE ON product_publication_candidates FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_candidate_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_decision_immutable BEFORE UPDATE ON product_publication_decisions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_decision_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_decision_retained BEFORE DELETE ON product_publication_decisions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_decision_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_head_revision BEFORE UPDATE ON product_publication_heads FOR EACH ROW BEGIN
IF NOT(NEW.product_id <=> OLD.product_id) OR NEW.revision<>OLD.revision+1 THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_head_revision';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_head_source_insert BEFORE INSERT ON product_publication_heads FOR EACH ROW BEGIN
IF (NEW.pending_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_publication_candidates WHERE id=NEW.pending_version_id AND product_id=NEW.product_id)) OR NEW.current_version_id IS NOT NULL OR NEW.current_publication_id IS NOT NULL OR NEW.approved_decision_id IS NOT NULL THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_head_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_head_source_update BEFORE UPDATE ON product_publication_heads FOR EACH ROW BEGIN
IF (NEW.pending_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_publication_candidates WHERE id=NEW.pending_version_id AND product_id=NEW.product_id)) OR (NEW.current_version_id IS NULL)<>(NEW.current_publication_id IS NULL) OR (NEW.current_publication_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_publication_decisions d JOIN product_publication_candidates c ON c.id=d.version_id WHERE d.id=NEW.current_publication_id AND c.id=NEW.current_version_id AND c.product_id=NEW.product_id AND d.action IN ('approve_and_publish','publish_approved') AND d.public_json IS NOT NULL)) OR (NEW.approved_decision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_publication_decisions d JOIN product_publication_candidates c ON c.id=d.version_id WHERE d.id=NEW.approved_decision_id AND c.product_id=NEW.product_id AND d.action IN ('approve_only','approve_and_publish') AND d.public_json IS NOT NULL)) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_head_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_media_source BEFORE INSERT ON product_publication_media FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_publication_candidates c JOIN product_intake_workspace_versions v ON v.id=c.workspace_version_id JOIN product_media m ON m.product_id=c.product_id WHERE c.id=NEW.version_id AND m.id=NEW.media_id AND JSON_CONTAINS(JSON_EXTRACT(v.snapshot_json,'$.mediaIds'),JSON_QUOTE(NEW.media_id))) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_media_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_media_immutable BEFORE UPDATE ON product_publication_media FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_media_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_media_retained BEFORE DELETE ON product_publication_media FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_media_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_review_only_source BEFORE INSERT ON product_intake_workspace_versions FOR EACH ROW BEGIN
IF NEW.kind='review_only' AND NOT EXISTS(SELECT 1 FROM product_intake_drafts d JOIN product_publication_links l ON l.draft_id=d.id JOIN product_publication_heads h ON h.product_id=l.product_id WHERE d.id=NEW.draft_id AND d.revision=NEW.revision AND d.owner_id=NEW.created_by AND h.current_version_id=NEW.base_public_version_id) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_review_only_source';
END IF;
END$$
DELIMITER ;
