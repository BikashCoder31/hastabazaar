-- Source-only 0155 counterpart. Apply only after the complete reviewed0154 source.
-- Quiesce writers and inspect exact metadata before each resumed checkpoint.
-- MariaDB DDL auto-commits: this is NOT a transactionally reversible migration.
-- The review ALTER is one statement; it preserves the parent, all children,
-- indexes and immutable/retained triggers. Never guess the engine's CHECK name.
-- The observation CREATE/index/triggers are one-shot checkpoints: after an
-- interruption, verify the exact installed prefix and resume only its remainder.
-- Never replay this whole file, disable FKs, infer observations, or reset data.

DELIMITER $$
CREATE OR REPLACE PROCEDURE hastabazaar_price_history_0155()
BEGIN
 DECLARE legacy_count INT DEFAULT 0;
 DECLARE legacy_name VARCHAR(191);
 DECLARE legacy_level VARCHAR(20);
 DECLARE basis_count INT DEFAULT 0;
 DECLARE installed_count INT DEFAULT 0;
 DECLARE total_count INT DEFAULT 0;
 DECLARE unchanged_count INT DEFAULT 0;
 SELECT COUNT(*) INTO total_count FROM information_schema.CHECK_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='product_price_reference_reviews';
 SELECT COUNT(DISTINCT BINARY REGEXP_REPLACE(CHECK_CLAUSE,'''(?:''''|[^''])*''(*SKIP)(*F)|[[:space:]`]','')) INTO unchanged_count
 FROM information_schema.CHECK_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='product_price_reference_reviews'
 AND ((LEVEL='Column' AND BINARY REGEXP_REPLACE(CHECK_CLAUSE,'''(?:''''|[^''])*''(*SKIP)(*F)|[[:space:]`]','') IN
 ('selling_paisa>0','compare_paisa>selling_paisa','decisionin(''approved'',''suppressed'')'))
 OR (LEVEL='Table' AND BINARY REGEXP_REPLACE(CHECK_CLAUSE,'''(?:''''|[^''])*''(*SKIP)(*F)|[[:space:]`]','')=
 'evidence_kind=''review_finding''anddecision=''suppressed''andoffered_fromisnullandoffered_toisnullorevidence_kind<>''review_finding''andoffered_fromisnotnullandoffered_toisnotnullandoffered_from>=0andoffered_to>=offered_fromandoffered_to<=created_at'));
 SELECT COUNT(*), MIN(CONSTRAINT_NAME), MIN(LEVEL) INTO legacy_count, legacy_name, legacy_level
 FROM information_schema.CHECK_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='product_price_reference_reviews'
 AND BINARY REGEXP_REPLACE(CHECK_CLAUSE,'''(?:''''|[^''])*''(*SKIP)(*F)|[[:space:]`]','')=
 'evidence_kindin(''historical_order'',''external_offer'',''review_finding'')';
 SELECT COUNT(*) INTO basis_count FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='product_price_reference_reviews' AND COLUMN_NAME='history_basis';
 SELECT COUNT(*) INTO installed_count FROM information_schema.CHECK_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='product_price_reference_reviews'
 AND CONSTRAINT_NAME IN ('price_reference_evidence_kind_0155','price_reference_history_basis');
 -- MODIFY removes an inline column CHECK; DROP CONSTRAINT applies only to a
 -- genuine table CHECK. Never widen or otherwise rewrite an unknown column.
 IF (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='product_price_reference_reviews'
  AND COLUMN_NAME='evidence_kind' AND COLUMN_TYPE='varchar(30)' AND IS_NULLABLE='NO'
  AND COLUMN_DEFAULT IS NULL AND CHARACTER_SET_NAME='utf8mb4'
  AND COLLATION_NAME='utf8mb4_unicode_ci' AND EXTRA='')<>1 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='price_history_0155_column_metadata_mismatch';
 ELSEIF unchanged_count<>4 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='price_history_0155_unknown_or_ambiguous_metadata';
 ELSEIF legacy_count=1 AND basis_count=0 AND installed_count=0 AND total_count=5 AND legacy_level IN ('Column','Table') THEN
  SET @price_history_0155_ddl=CONCAT(
   'ALTER TABLE product_price_reference_reviews ADD COLUMN history_basis LONGTEXT NULL, ',
   IF(legacy_level='Column','MODIFY COLUMN evidence_kind VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL',CONCAT('DROP CONSTRAINT `',REPLACE(legacy_name,'`','``'),'`')),
   ', ADD CONSTRAINT price_reference_evidence_kind_0155 CHECK(HEX(evidence_kind) IN (''686973746F726963616C5F6F72646572'',''65787465726E616C5F6F66666572'',''7265766965775F66696E64696E67'',''706C6174666F726D5F6F7264657261626C65'')), ADD CONSTRAINT price_reference_history_basis CHECK(IF(HEX(evidence_kind)=''706C6174666F726D5F6F7264657261626C65'',history_basis IS NOT NULL AND CHAR_LENGTH(TRIM(history_basis))>=10,history_basis IS NULL))'
  );
  PREPARE price_history_0155_statement FROM @price_history_0155_ddl;
  EXECUTE price_history_0155_statement;
  DEALLOCATE PREPARE price_history_0155_statement;
  SET @price_history_0155_ddl=NULL;
 ELSEIF legacy_count=0 AND basis_count=1 AND installed_count=2 AND total_count=6 THEN
  -- A committed ALTER can be acknowledged again, but only with exact new metadata.
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='product_price_reference_reviews'
   AND COLUMN_NAME='history_basis' AND COLUMN_TYPE='longtext' AND IS_NULLABLE='YES' AND COLUMN_DEFAULT='NULL'
   AND CHARACTER_SET_NAME='utf8mb4' AND COLLATION_NAME='utf8mb4_unicode_ci' AND EXTRA='')<>1
   OR (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='product_price_reference_reviews'
    AND LEVEL='Table'
    AND ((CONSTRAINT_NAME='price_reference_evidence_kind_0155' AND
     BINARY REGEXP_REPLACE(CHECK_CLAUSE,'''(?:''''|[^''])*''(*SKIP)(*F)|[[:space:]`]','')='hex(evidence_kind)in(''686973746F726963616C5F6F72646572'',''65787465726E616C5F6F66666572'',''7265766965775F66696E64696E67'',''706C6174666F726D5F6F7264657261626C65'')')
     OR (CONSTRAINT_NAME='price_reference_history_basis' AND
     BINARY REGEXP_REPLACE(CHECK_CLAUSE,'''(?:''''|[^''])*''(*SKIP)(*F)|[[:space:]`]','')='if(hex(evidence_kind)=''706C6174666F726D5F6F7264657261626C65'',history_basisisnotnullandchar_length(trim(history_basis))>=10,history_basisisnull)')))<>2
  THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='price_history_0155_completed_metadata_mismatch';
  END IF;
 ELSE
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='price_history_0155_unknown_or_ambiguous_metadata';
 END IF;
END$$
DELIMITER ;
CALL hastabazaar_price_history_0155();
DROP PROCEDURE hastabazaar_price_history_0155;

CREATE TABLE product_orderable_price_observations (
 id VARCHAR(191) PRIMARY KEY,
 product_id VARCHAR(191) NOT NULL,
 seller_id VARCHAR(191) NOT NULL,
 offer_id VARCHAR(191) NOT NULL,
 offer_version_id VARCHAR(191) NOT NULL,
 public_version_id VARCHAR(191) NOT NULL,
 publication_id VARCHAR(191) NOT NULL,
 physical_json LONGTEXT NOT NULL,
 scope_json LONGTEXT NOT NULL,
 selling_paisa BIGINT NOT NULL,
 currency VARCHAR(191) NOT NULL,
 observed_at BIGINT NOT NULL,
 actor_id VARCHAR(191) NOT NULL,
 reason LONGTEXT NOT NULL,
 CONSTRAINT orderable_price_positive CHECK(selling_paisa>0),
 CONSTRAINT orderable_price_currency CHECK(HEX(currency)='4E5052'),
 CONSTRAINT orderable_price_time CHECK(observed_at>=0),
 CONSTRAINT orderable_price_product_fk FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT orderable_price_seller_fk FOREIGN KEY(seller_id) REFERENCES seller_profiles(id),
 CONSTRAINT orderable_price_offer_fk FOREIGN KEY(offer_id) REFERENCES product_offer_identities(id),
 CONSTRAINT orderable_price_offer_version_fk FOREIGN KEY(offer_version_id) REFERENCES product_offer_versions(id),
 CONSTRAINT orderable_price_public_version_fk FOREIGN KEY(public_version_id) REFERENCES product_publication_candidates(id),
 CONSTRAINT orderable_price_publication_fk FOREIGN KEY(publication_id) REFERENCES product_publication_decisions(id),
 CONSTRAINT orderable_price_actor_fk FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX product_orderable_price_history ON product_orderable_price_observations(product_id,seller_id,observed_at);
CREATE TRIGGER orderable_price_observation_immutable BEFORE UPDATE ON product_orderable_price_observations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='orderable_price_observation_immutable';
CREATE TRIGGER orderable_price_observation_retained BEFORE DELETE ON product_orderable_price_observations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='orderable_price_observation_retained';
