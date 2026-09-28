-- Additive and repeatable: replace only staff maker/checker checks with active-role approval guards.
-- Existing rows, balances, foreign keys, domain triggers and seller/rider conflicts are retained.
DELIMITER $$
DROP PROCEDURE IF EXISTS hb_single_sa_remove_checks$$
CREATE PROCEDURE hb_single_sa_remove_checks()
BEGIN
 DECLARE finished INTEGER DEFAULT 0;
 DECLARE target_table VARCHAR(64);
 DECLARE target_constraint VARCHAR(64);
 DECLARE matching CURSOR FOR
 SELECT tc.TABLE_NAME,tc.CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS tc
 JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME AND cc.TABLE_NAME=tc.TABLE_NAME
 WHERE tc.CONSTRAINT_SCHEMA=DATABASE() AND tc.CONSTRAINT_TYPE='CHECK'
 AND tc.TABLE_NAME IN ('payouts','refunds','promotions','managed_payouts','managed_supplier_payments','staff_permission_requests','parcel_cash_records')
 AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cc.CHECK_CLAUSE,CHAR(96),''),' ',''),'(',''),')',''),CHAR(10),''),CHAR(13),'')) IN ('approved_byisnullorapproved_by!=prepared_by','approved_byisnullorapproved_by<>prepared_by','approved_byisnullorapproved_by!=prepared_by','approved_byisnullorapproved_by<>prepared_by','approved_byisnullorapproved_by<>prepared_by','approved_byisnullorapproved_by!=prepared_by','high_value_approved_byisnullorapproved_byisnullorhigh_value_approved_by!=approved_by','high_value_approved_byisnullorapproved_byisnullorhigh_value_approved_by<>approved_by','high_value_approved_byisnullorapproved_byisnullorhigh_value_approved_by!=approved_by','approved_byisnullorapproved_by!=created_by','approved_byisnullorapproved_by<>created_by','approved_byisnullorapproved_by!=created_by','decided_byisnullordecided_by<>proposed_by','decided_byisnullordecided_by<>proposed_by','decided_byisnullordecided_by!=proposed_by','kind<>''remittance''orstatus<>''posted''orapproved_byisnotnullandapproved_by<>created_by','kind<>''remittance''orstatus<>''posted''orapproved_byisnotnullandapproved_by<>created_by','kind!=''remittance''orstatus!=''posted''orapproved_byisnotnullandapproved_by!=created_by');
 DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished=1;
 OPEN matching;
 remove_loop: LOOP
 FETCH matching INTO target_table,target_constraint;
 IF finished=1 THEN LEAVE remove_loop; END IF;
 SET @hb_single_sa_ddl=CONCAT('ALTER TABLE ',CHAR(96),REPLACE(target_table,CHAR(96),CONCAT(CHAR(96),CHAR(96))),CHAR(96),' DROP CONSTRAINT ',CHAR(96),REPLACE(target_constraint,CHAR(96),CONCAT(CHAR(96),CHAR(96))),CHAR(96));
 PREPARE hb_single_sa_statement FROM @hb_single_sa_ddl;
 EXECUTE hb_single_sa_statement;
 DEALLOCATE PREPARE hb_single_sa_statement;
 END LOOP;
 CLOSE matching;
END$$
CALL hb_single_sa_remove_checks()$$
DROP PROCEDURE hb_single_sa_remove_checks$$
DROP TRIGGER IF EXISTS payouts_single_sa_insert$$
CREATE TRIGGER payouts_single_sa_insert BEFORE INSERT ON payouts FOR EACH ROW BEGIN IF (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payouts_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS payouts_single_sa_update$$
CREATE TRIGGER payouts_single_sa_update BEFORE UPDATE ON payouts FOR EACH ROW BEGIN IF (NOT(NEW.approved_by<=>OLD.approved_by) OR NOT(NEW.prepared_by<=>OLD.prepared_by) OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payouts_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS refunds_single_sa_insert$$
CREATE TRIGGER refunds_single_sa_insert BEFORE INSERT ON refunds FOR EACH ROW BEGIN IF (NEW.high_value_approved_by=NEW.approved_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.high_value_approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refunds_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS refunds_single_sa_update$$
CREATE TRIGGER refunds_single_sa_update BEFORE UPDATE ON refunds FOR EACH ROW BEGIN IF (NOT(NEW.high_value_approved_by<=>OLD.high_value_approved_by) OR NOT(NEW.approved_by<=>OLD.approved_by) OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.high_value_approved_by=NEW.approved_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.high_value_approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refunds_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS promotions_single_sa_insert$$
CREATE TRIGGER promotions_single_sa_insert BEFORE INSERT ON promotions FOR EACH ROW BEGIN IF (NEW.approved_by=NEW.created_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promotions_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS promotions_single_sa_update$$
CREATE TRIGGER promotions_single_sa_update BEFORE UPDATE ON promotions FOR EACH ROW BEGIN IF (NOT(NEW.approved_by<=>OLD.approved_by) OR NOT(NEW.created_by<=>OLD.created_by) OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.approved_by=NEW.created_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promotions_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS managed_payouts_single_sa_insert$$
CREATE TRIGGER managed_payouts_single_sa_insert BEFORE INSERT ON managed_payouts FOR EACH ROW BEGIN IF (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_payouts_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS managed_payouts_single_sa_update$$
CREATE TRIGGER managed_payouts_single_sa_update BEFORE UPDATE ON managed_payouts FOR EACH ROW BEGIN IF (NOT(NEW.approved_by<=>OLD.approved_by) OR NOT(NEW.prepared_by<=>OLD.prepared_by) OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_payouts_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS managed_supplier_payments_single_sa_insert$$
CREATE TRIGGER managed_supplier_payments_single_sa_insert BEFORE INSERT ON managed_supplier_payments FOR EACH ROW BEGIN IF (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_supplier_payments_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS managed_supplier_payments_single_sa_update$$
CREATE TRIGGER managed_supplier_payments_single_sa_update BEFORE UPDATE ON managed_supplier_payments FOR EACH ROW BEGIN IF (NOT(NEW.approved_by<=>OLD.approved_by) OR NOT(NEW.prepared_by<=>OLD.prepared_by) OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_supplier_payments_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS staff_permission_requests_single_sa_insert$$
CREATE TRIGGER staff_permission_requests_single_sa_insert BEFORE INSERT ON staff_permission_requests FOR EACH ROW BEGIN IF (NEW.decided_by=NEW.proposed_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.decided_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='staff_permission_requests_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS staff_permission_requests_single_sa_update$$
CREATE TRIGGER staff_permission_requests_single_sa_update BEFORE UPDATE ON staff_permission_requests FOR EACH ROW BEGIN IF (NOT(NEW.decided_by<=>OLD.decided_by) OR NOT(NEW.proposed_by<=>OLD.proposed_by) OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.decided_by=NEW.proposed_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.decided_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='staff_permission_requests_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS parcel_cash_records_single_sa_insert$$
CREATE TRIGGER parcel_cash_records_single_sa_insert BEFORE INSERT ON parcel_cash_records FOR EACH ROW BEGIN IF (NEW.kind='remittance' AND NEW.status='posted' AND (NEW.approved_by IS NULL OR (NEW.rider_user_id IS NOT NULL AND NEW.rider_user_id=NEW.approved_by) OR (NEW.approved_by=NEW.created_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='parcel_cash_records_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS parcel_cash_records_single_sa_update$$
CREATE TRIGGER parcel_cash_records_single_sa_update BEFORE UPDATE ON parcel_cash_records FOR EACH ROW BEGIN IF (NEW.kind='remittance' AND NEW.status='posted' AND (NEW.approved_by IS NULL OR (NEW.rider_user_id IS NOT NULL AND NEW.rider_user_id=NEW.approved_by) OR (NEW.approved_by=NEW.created_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='parcel_cash_records_approval_requires_active_super_admin'; END IF; END$$
DELIMITER ;
