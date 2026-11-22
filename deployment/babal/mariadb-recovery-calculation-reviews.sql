-- Generated source parity for 0132; execution remains held.
CREATE TABLE seller_recovery_calculation_reviews(
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 submitted_by VARCHAR(191) NOT NULL REFERENCES users(id),reason TEXT NOT NULL,evidence_reference TEXT,
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,due_at BIGINT NOT NULL CHECK(due_at>created_at)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_recovery_calculation_answers(
 id VARCHAR(191) PRIMARY KEY,review_id VARCHAR(191) NOT NULL UNIQUE REFERENCES seller_recovery_calculation_reviews(id),case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),reason TEXT NOT NULL,public_message TEXT NOT NULL,source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_calculation_case ON seller_recovery_calculation_reviews(case_id,created_at);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_calculation_current_owner BEFORE INSERT ON seller_recovery_calculation_reviews FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users owner ON owner.id=seller.user_id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND owner.id=NEW.submitted_by AND owner.status='active' AND (CASE WHEN c.exposure_paisa>c.confirmed_paisa THEN c.exposure_paisa ELSE c.confirmed_paisa END)-c.absorbed_paisa-c.disputed_paisa<=0)
 OR EXISTS(SELECT 1 FROM seller_recovery_calculation_reviews prior WHERE prior.case_id=NEW.case_id AND NOT EXISTS(SELECT 1 FROM seller_recovery_calculation_answers answered WHERE answered.review_id=prior.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_calculation_current_owner_or_pending_review_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_calculation_current_reviewer BEFORE INSERT ON seller_recovery_calculation_answers FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_calculation_reviews request JOIN seller_recovery_cases c ON c.id=request.case_id
 JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE request.id=NEW.review_id AND request.case_id=NEW.case_id AND c.revision=NEW.case_revision AND actor.status='active' AND actor.id<>seller.user_id
 AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_calculation_current_independent_reviewer_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_calculation_reviews_immutable BEFORE UPDATE ON seller_recovery_calculation_reviews FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_calculation_history_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_calculation_reviews_retained BEFORE DELETE ON seller_recovery_calculation_reviews FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_calculation_history_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_calculation_answers_immutable BEFORE UPDATE ON seller_recovery_calculation_answers FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_calculation_history_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_calculation_answers_retained BEFORE DELETE ON seller_recovery_calculation_answers FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_calculation_history_retained'; END$$
DELIMITER ;
