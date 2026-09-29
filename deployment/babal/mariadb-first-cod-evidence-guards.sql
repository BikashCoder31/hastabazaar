-- Additive approval evidence guard; no existing rows are changed.
DROP TRIGGER IF EXISTS first_cod_evidence_complete_insert;
DELIMITER $$
CREATE TRIGGER first_cod_evidence_complete_insert BEFORE INSERT ON first_cod_reviews FOR EACH ROW BEGIN
 IF NEW.status='confirmed' AND (NEW.confirmed_by IS NULL OR NEW.confirmed_at IS NULL OR NEW.reason IS NULL OR NEW.request_id IS NULL OR NEW.confirmed_at<NEW.created_at OR CHAR_LENGTH(TRIM(NEW.reason)) NOT BETWEEN 8 AND 500 OR CHAR_LENGTH(NEW.request_id) NOT BETWEEN 1 AND 100) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COD confirmation requires complete staff evidence'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_evidence_complete_update;
DELIMITER $$
CREATE TRIGGER first_cod_evidence_complete_update BEFORE UPDATE ON first_cod_reviews FOR EACH ROW BEGIN
 IF NEW.status='confirmed' AND (NEW.confirmed_by IS NULL OR NEW.confirmed_at IS NULL OR NEW.reason IS NULL OR NEW.request_id IS NULL OR NEW.confirmed_at<NEW.created_at OR CHAR_LENGTH(TRIM(NEW.reason)) NOT BETWEEN 8 AND 500 OR CHAR_LENGTH(NEW.request_id) NOT BETWEEN 1 AND 100) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COD confirmation requires complete staff evidence'; END IF;
END$$
DELIMITER ;

-- Keep durable holds even when cancelled; deletion would otherwise remove lifecycle guards.
DROP TRIGGER IF EXISTS first_cod_review_no_delete;
DELIMITER $$
CREATE TRIGGER first_cod_review_no_delete BEFORE DELETE ON first_cod_reviews FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COD confirmation evidence is immutable';
END$$
DELIMITER ;
