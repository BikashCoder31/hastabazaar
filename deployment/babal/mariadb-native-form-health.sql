-- Source-only0156 counterpart; use only after the exact reviewed0155 prefix.
-- MariaDB DDL auto-commits. Quiesce writers, inventory all objects/rows, then
-- execute only the verified unapplied suffix of these four checkpoints.
-- Never replay the whole file, disable foreign keys or reset populated data.
-- The single guarded ALTER retains both tables, rows, incoming FKs, indexes
-- and all four existing observation/link retention triggers in place.
DELIMITER $$
CREATE OR REPLACE PROCEDURE hastabazaar_native_form_health_0156()
BEGIN
 DECLARE old_kind_count INT DEFAULT 0;
 DECLARE old_save_count INT DEFAULT 0;
 DECLARE old_kind_name VARCHAR(191);
 DECLARE old_save_name VARCHAR(191);
 DECLARE old_kind_level VARCHAR(20);
 DECLARE old_save_level VARCHAR(20);
 DECLARE installed_count INT DEFAULT 0;
 DECLARE unchanged_count INT DEFAULT 0;
 DECLARE total_count INT DEFAULT 0;
 DECLARE old_save LONGTEXT DEFAULT 'phase=''load''andoutcomein(''compatible'',''fallback'',''blocked'')andevidence_kind=''runtime''andevidence_idisnullorphase=''save''andoutcome=''saved''andevidence_kindin(''form_answer_set'',''core_receipt'')andevidence_idisnotnull';
 DECLARE old_save_grouped LONGTEXT DEFAULT '(phase=''load''andoutcomein(''compatible'',''fallback'',''blocked'')andevidence_kind=''runtime''andevidence_idisnull)or(phase=''save''andoutcome=''saved''andevidence_kindin(''form_answer_set'',''core_receipt'')andevidence_idisnotnull)';
 -- Ignore formatting/identifier backticks only outside quoted literals. PCRE
 -- SKIP/F preserves literal case, spaces and backticks; drift is never normalized.
 SELECT COUNT(*) INTO total_count FROM information_schema.CHECK_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='form_health_observations';
 SELECT COUNT(DISTINCT BINARY REGEXP_REPLACE(CHECK_CLAUSE,'''(?:''''|[^''])*''(*SKIP)(*F)|[[:space:]`]','')) INTO unchanged_count FROM information_schema.CHECK_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='form_health_observations'
 AND LEVEL='Column'
 AND BINARY REGEXP_REPLACE(CHECK_CLAUSE,'''(?:''''|[^''])*''(*SKIP)(*F)|[[:space:]`]','') IN (
 'environmentin(''production'',''development'',''local_staging'',''test'',''unknown'')',
 'phasein(''load'',''save'')','outcomein(''compatible'',''fallback'',''blocked'',''saved'')',
 'categoryin(''definition_unavailable'',''definition_invalid'',''read_unavailable'',''durable_submission'')','observed_at>=0');
 SELECT COUNT(*),MIN(CONSTRAINT_NAME),MIN(LEVEL) INTO old_kind_count,old_kind_name,old_kind_level
 FROM information_schema.CHECK_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='form_health_observations'
 AND BINARY REGEXP_REPLACE(CHECK_CLAUSE,'''(?:''''|[^''])*''(*SKIP)(*F)|[[:space:]`]','')='evidence_kindin(''runtime'',''form_answer_set'',''core_receipt'')';
 SELECT COUNT(*),MIN(CONSTRAINT_NAME),MIN(LEVEL) INTO old_save_count,old_save_name,old_save_level
 FROM information_schema.CHECK_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='form_health_observations'
 AND BINARY REGEXP_REPLACE(CHECK_CLAUSE,'''(?:''''|[^''])*''(*SKIP)(*F)|[[:space:]`]','') IN (old_save,old_save_grouped,CONCAT('(',old_save,')'),CONCAT('(',old_save_grouped,')'));
 SELECT COUNT(*) INTO installed_count FROM information_schema.CHECK_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='form_health_observations'
 AND CONSTRAINT_NAME IN ('form_health_native_evidence_0156','form_health_native_save_0156');
 IF (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='form_health_observations'
  AND COLUMN_NAME='evidence_kind' AND COLUMN_TYPE='varchar(191)' AND IS_NULLABLE='NO'
  AND COLUMN_DEFAULT IS NULL AND CHARACTER_SET_NAME='utf8mb4'
  AND COLLATION_NAME='utf8mb4_unicode_ci' AND EXTRA='')<>1 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='native_form_health_0156_column_metadata_mismatch';
 ELSEIF total_count<>7 OR unchanged_count<>5 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='native_form_health_0156_unknown_or_ambiguous_metadata';
 ELSEIF old_kind_count=1 AND old_save_count=1 AND installed_count=0 AND old_kind_level IN ('Column','Table') AND old_save_level='Table' THEN
  SET @native_form_health_0156_ddl=CONCAT(
   'ALTER TABLE form_health_observations ',
   IF(old_kind_level='Column','MODIFY COLUMN evidence_kind VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL',CONCAT('DROP CONSTRAINT `',REPLACE(old_kind_name,'`','``'),'`')),
   ', DROP CONSTRAINT `',REPLACE(old_save_name,'`','``'),
   '`, ADD CONSTRAINT form_health_native_evidence_0156 CHECK(HEX(evidence_kind) IN (''72756E74696D65'',''666F726D5F616E737765725F736574'',''636F72655F72656365697074'',''6E61746976655F636F6D6D616E64'')), ADD CONSTRAINT form_health_native_save_0156 CHECK(IF(HEX(phase)=''6C6F6164'',HEX(outcome) IN (''636F6D70617469626C65'',''66616C6C6261636B'',''626C6F636B6564'') AND HEX(evidence_kind)=''72756E74696D65'' AND evidence_id IS NULL,HEX(phase)=''73617665'' AND HEX(outcome)=''7361766564'' AND HEX(evidence_kind) IN (''666F726D5F616E737765725F736574'',''636F72655F72656365697074'',''6E61746976655F636F6D6D616E64'') AND evidence_id IS NOT NULL))'
  );
  PREPARE native_form_health_0156_statement FROM @native_form_health_0156_ddl;
  EXECUTE native_form_health_0156_statement;
  DEALLOCATE PREPARE native_form_health_0156_statement;
  SET @native_form_health_0156_ddl=NULL;
 ELSEIF old_kind_count=0 AND old_save_count=0 AND installed_count=2 THEN
  IF (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='form_health_observations'
   AND LEVEL='Table'
   AND ((CONSTRAINT_NAME='form_health_native_evidence_0156' AND BINARY REGEXP_REPLACE(CHECK_CLAUSE,'''(?:''''|[^''])*''(*SKIP)(*F)|[[:space:]`]','')='hex(evidence_kind)in(''72756E74696D65'',''666F726D5F616E737765725F736574'',''636F72655F72656365697074'',''6E61746976655F636F6D6D616E64'')')
   OR (CONSTRAINT_NAME='form_health_native_save_0156' AND BINARY REGEXP_REPLACE(CHECK_CLAUSE,'''(?:''''|[^''])*''(*SKIP)(*F)|[[:space:]`]','')='if(hex(phase)=''6C6F6164'',hex(outcome)in(''636F6D70617469626C65'',''66616C6C6261636B'',''626C6F636B6564'')andhex(evidence_kind)=''72756E74696D65''andevidence_idisnull,hex(phase)=''73617665''andhex(outcome)=''7361766564''andhex(evidence_kind)in(''666F726D5F616E737765725F736574'',''636F72655F72656365697074'',''6E61746976655F636F6D6D616E64'')andevidence_idisnotnull)')))<>2 THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='native_form_health_0156_completed_metadata_mismatch';
  END IF;
 ELSE
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='native_form_health_0156_unknown_or_ambiguous_metadata';
 END IF;
END$$
DELIMITER ;
CALL hastabazaar_native_form_health_0156();
DROP PROCEDURE hastabazaar_native_form_health_0156;
DELIMITER $$
CREATE TRIGGER native_form_command_provenance_retained BEFORE UPDATE ON audit_logs FOR EACH ROW
BEGIN
 IF OLD.command_key IS NOT NULL AND (NOT (HEX(NEW.id) <=> HEX(OLD.id)) OR NOT (HEX(NEW.next_json) <=> HEX(OLD.next_json))) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='native_form_command_provenance_retained';
 END IF;
END$$
DELIMITER ;
