-- Schema-only bootstrap prerequisites. No policy activation or historical backfill.
-- MariaDB 10.11+. Quiesce writers and preserve a reviewed backup before applying.
-- Every metadata and duplicate check precedes the first ALTER. DDL auto-commits.
-- on interruption re-inspect before resuming. Completed replay performs no DDL.
-- Anonymous compound block avoids creating/replacing any persistent routine.
DELIMITER $$
BEGIN NOT ATOMIC
 DECLARE old_index_count INT DEFAULT 0;
 DECLARE new_index_count INT DEFAULT 0;
 IF DATABASE() IS NULL OR @@FOREIGN_KEY_CHECKS<>1 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bootstrap_prerequisites_database_or_fk_state';
 END IF;
 IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME IN ('order_items','return_requests','seller_profiles','seller_ledger_entries')
  AND TABLE_TYPE='BASE TABLE' AND ENGINE='InnoDB' AND TABLE_COLLATION='utf8mb4_unicode_ci')<>4 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bootstrap_prerequisites_parent_metadata';
 END IF;
 IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='commission_base_paisa')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='commission_base_paisa' AND DATA_TYPE='bigint' AND COLUMN_TYPE IN ('bigint','bigint(20)')
   AND IS_NULLABLE='YES' AND (COLUMN_DEFAULT IS NULL OR COLUMN_DEFAULT='NULL')
   AND EXTRA='' AND COALESCE(GENERATION_EXPRESSION,'')=''
   AND CHARACTER_SET_NAME IS NULL AND COLLATION_NAME IS NULL) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bootstrap_prerequisites_commission_base_paisa_metadata';
 END IF;
 IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='commission_rule_version')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='commission_rule_version' AND DATA_TYPE='longtext' AND COLUMN_TYPE ='longtext'
   AND IS_NULLABLE='YES' AND (COLUMN_DEFAULT IS NULL OR COLUMN_DEFAULT='NULL')
   AND EXTRA='' AND COALESCE(GENERATION_EXPRESSION,'')=''
   AND CHARACTER_SET_NAME='utf8mb4' AND COLLATION_NAME='utf8mb4_unicode_ci') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bootstrap_prerequisites_commission_rule_version_metadata';
 END IF;
 IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='seller_agreement_version')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='seller_agreement_version' AND DATA_TYPE='longtext' AND COLUMN_TYPE ='longtext'
   AND IS_NULLABLE='YES' AND (COLUMN_DEFAULT IS NULL OR COLUMN_DEFAULT='NULL')
   AND EXTRA='' AND COALESCE(GENERATION_EXPRESSION,'')=''
   AND CHARACTER_SET_NAME='utf8mb4' AND COLLATION_NAME='utf8mb4_unicode_ci') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bootstrap_prerequisites_seller_agreement_version_metadata';
 END IF;
 IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='return_requests' AND COLUMN_NAME='original_seal_intact')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='return_requests' AND COLUMN_NAME='original_seal_intact' AND DATA_TYPE='bigint' AND COLUMN_TYPE IN ('bigint','bigint(20)')
   AND IS_NULLABLE='NO' AND COLUMN_DEFAULT='0'
   AND EXTRA='' AND COALESCE(GENERATION_EXPRESSION,'')=''
   AND CHARACTER_SET_NAME IS NULL AND COLLATION_NAME IS NULL) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bootstrap_prerequisites_original_seal_intact_metadata';
 END IF;
 IF EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seller_profiles' AND COLUMN_NAME='settlement_terms_reference')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seller_profiles' AND COLUMN_NAME='settlement_terms_reference' AND DATA_TYPE='longtext' AND COLUMN_TYPE ='longtext'
   AND IS_NULLABLE='YES' AND (COLUMN_DEFAULT IS NULL OR COLUMN_DEFAULT='NULL')
   AND EXTRA='' AND COALESCE(GENERATION_EXPRESSION,'')=''
   AND CHARACTER_SET_NAME='utf8mb4' AND COLLATION_NAME='utf8mb4_unicode_ci') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bootstrap_prerequisites_settlement_terms_reference_metadata';
 END IF;
 IF (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seller_ledger_entries'
  AND ((COLUMN_NAME='refund_id' AND IS_NULLABLE='YES' AND (COLUMN_DEFAULT IS NULL OR COLUMN_DEFAULT='NULL'))
    OR (COLUMN_NAME='type' AND IS_NULLABLE='NO' AND COLUMN_DEFAULT IS NULL))
  AND COLUMN_TYPE='varchar(191)' AND CHARACTER_SET_NAME='utf8mb4' AND COLLATION_NAME='utf8mb4_unicode_ci'
  AND EXTRA='' AND COALESCE(GENERATION_EXPRESSION,'')='')<>2 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bootstrap_prerequisites_ledger_columns';
 END IF;
 SELECT COUNT(*) INTO old_index_count FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seller_ledger_entries' AND INDEX_NAME='idx_seller_ledger_refund_unique';
 SELECT COUNT(*) INTO new_index_count FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seller_ledger_entries' AND INDEX_NAME='idx_seller_ledger_refund_type_unique';
 IF old_index_count NOT IN (0,1) OR new_index_count NOT IN (0,2) OR (old_index_count=0 AND new_index_count=0) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bootstrap_prerequisites_index_checkpoint';
 END IF;
 IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seller_ledger_entries'
  AND INDEX_NAME IN ('idx_seller_ledger_refund_unique','idx_seller_ledger_refund_type_unique')
  AND (NON_UNIQUE<>0 OR INDEX_TYPE<>'BTREE' OR SUB_PART IS NOT NULL OR IGNORED<>'NO'
   OR COLLATION IS NULL OR COLLATION<>'A' OR COLUMN_NAME IS NULL
   OR NOT ((SEQ_IN_INDEX=1 AND COLUMN_NAME='refund_id')
     OR (INDEX_NAME='idx_seller_ledger_refund_type_unique' AND SEQ_IN_INDEX=2 AND COLUMN_NAME='type')))) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bootstrap_prerequisites_index_metadata';
 END IF;
 IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seller_ledger_entries'
  AND NON_UNIQUE=0 AND INDEX_NAME NOT IN ('idx_seller_ledger_refund_unique','idx_seller_ledger_refund_type_unique')
  GROUP BY INDEX_NAME HAVING COUNT(*)=1 AND MAX(COLUMN_NAME)='refund_id') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bootstrap_prerequisites_alternate_refund_uniqueness';
 END IF;
 IF EXISTS (SELECT 1 FROM seller_ledger_entries WHERE refund_id IS NOT NULL GROUP BY refund_id,type HAVING COUNT(*)>1) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bootstrap_prerequisites_duplicate_refund_type';
 END IF;
 -- All preconditions above are read-only. Known partial additions resume below.
 SET @hb_bootstrap_ddl='';
 IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='commission_base_paisa') THEN
  SET @hb_bootstrap_ddl=CONCAT(@hb_bootstrap_ddl,IF(@hb_bootstrap_ddl='','',', '),'ADD COLUMN commission_base_paisa BIGINT NULL');
 END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='commission_rule_version') THEN
  SET @hb_bootstrap_ddl=CONCAT(@hb_bootstrap_ddl,IF(@hb_bootstrap_ddl='','',', '),'ADD COLUMN commission_rule_version LONGTEXT NULL');
 END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_items' AND COLUMN_NAME='seller_agreement_version') THEN
  SET @hb_bootstrap_ddl=CONCAT(@hb_bootstrap_ddl,IF(@hb_bootstrap_ddl='','',', '),'ADD COLUMN seller_agreement_version LONGTEXT NULL');
 END IF;
 IF @hb_bootstrap_ddl<>'' THEN
  SET @hb_bootstrap_ddl=CONCAT('ALTER TABLE order_items ',@hb_bootstrap_ddl);
  PREPARE hb_bootstrap_stmt FROM @hb_bootstrap_ddl;
  EXECUTE hb_bootstrap_stmt;
  DEALLOCATE PREPARE hb_bootstrap_stmt;
 END IF;
 SET @hb_bootstrap_ddl='';
 IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='return_requests' AND COLUMN_NAME='original_seal_intact') THEN
  SET @hb_bootstrap_ddl=CONCAT(@hb_bootstrap_ddl,IF(@hb_bootstrap_ddl='','',', '),'ADD COLUMN original_seal_intact BIGINT NOT NULL DEFAULT 0');
 END IF;
 IF @hb_bootstrap_ddl<>'' THEN
  SET @hb_bootstrap_ddl=CONCAT('ALTER TABLE return_requests ',@hb_bootstrap_ddl);
  PREPARE hb_bootstrap_stmt FROM @hb_bootstrap_ddl;
  EXECUTE hb_bootstrap_stmt;
  DEALLOCATE PREPARE hb_bootstrap_stmt;
 END IF;
 SET @hb_bootstrap_ddl='';
 IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seller_profiles' AND COLUMN_NAME='settlement_terms_reference') THEN
  SET @hb_bootstrap_ddl=CONCAT(@hb_bootstrap_ddl,IF(@hb_bootstrap_ddl='','',', '),'ADD COLUMN settlement_terms_reference LONGTEXT NULL');
 END IF;
 IF @hb_bootstrap_ddl<>'' THEN
  SET @hb_bootstrap_ddl=CONCAT('ALTER TABLE seller_profiles ',@hb_bootstrap_ddl);
  PREPARE hb_bootstrap_stmt FROM @hb_bootstrap_ddl;
  EXECUTE hb_bootstrap_stmt;
  DEALLOCATE PREPARE hb_bootstrap_stmt;
 END IF;
 SET @hb_bootstrap_ddl=NULL;
 IF new_index_count=0 THEN
  ALTER TABLE seller_ledger_entries ADD UNIQUE INDEX idx_seller_ledger_refund_type_unique (refund_id,type);
 END IF;
 IF old_index_count=1 THEN
  ALTER TABLE seller_ledger_entries DROP INDEX idx_seller_ledger_refund_unique;
 END IF;
END$$
DELIMITER ;
