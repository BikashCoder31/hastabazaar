-- Inspect exact installed definitions before each additive companion.
-- An already installed object with the reviewed definition is retained.
DELIMITER $$
BEGIN NOT ATOMIC
  IF DATABASE() IS NULL OR @@FOREIGN_KEY_CHECKS<>1 OR @@check_constraint_checks<>1 OR @@SESSION.sql_mode LIKE '%NO_BACKSLASH_ESCAPES%' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_session';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='refund_route_simulation_captures') AND NOT ((SELECT SHA2(COALESCE(GROUP_CONCAT(item ORDER BY item SEPARATOR ''),''),256)
   FROM (SELECT SHA2(JSON_ARRAY('table',TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_COLLATION,CREATE_OPTIONS),256) AS item FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_simulation_captures'
    UNION ALL SELECT SHA2(JSON_ARRAY('column',COLUMN_NAME,ORDINAL_POSITION,COLUMN_DEFAULT,IS_NULLABLE,DATA_TYPE,COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,IS_GENERATED,GENERATION_EXPRESSION,COLUMN_COMMENT),256) AS item FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_simulation_captures'
    UNION ALL SELECT SHA2(JSON_ARRAY('index',INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,IGNORED),256) AS item FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_simulation_captures'
    UNION ALL SELECT SHA2(JSON_ARRAY('check',CONSTRAINT_NAME,CHECK_CLAUSE,LEVEL),256) AS item FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_simulation_captures'
    UNION ALL SELECT SHA2(JSON_ARRAY('fk',k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,IF(BINARY k.REFERENCED_TABLE_SCHEMA=BINARY DATABASE(),'current',k.REFERENCED_TABLE_SCHEMA),f.UPDATE_RULE,f.DELETE_RULE),256) AS item FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS f ON f.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND f.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND f.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND BINARY k.TABLE_NAME='refund_route_simulation_captures' AND k.REFERENCED_TABLE_NAME IS NOT NULL) AS metadata_rows) <=> 'ace5b92032c26a94520ee3183fc9049093eef02de829379883d63200b22a0a40') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_simulation_captures';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='refund_route_simulation_captures' AND TRIGGER_NAME NOT IN('refund_route_capture_insert','refund_route_capture_update','refund_route_capture_delete')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_unexpected_refund_route_simulation_captures';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='refund_route_simulation_attempts') AND NOT ((SELECT SHA2(COALESCE(GROUP_CONCAT(item ORDER BY item SEPARATOR ''),''),256)
   FROM (SELECT SHA2(JSON_ARRAY('table',TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_COLLATION,CREATE_OPTIONS),256) AS item FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_simulation_attempts'
    UNION ALL SELECT SHA2(JSON_ARRAY('column',COLUMN_NAME,ORDINAL_POSITION,COLUMN_DEFAULT,IS_NULLABLE,DATA_TYPE,COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,IS_GENERATED,GENERATION_EXPRESSION,COLUMN_COMMENT),256) AS item FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_simulation_attempts'
    UNION ALL SELECT SHA2(JSON_ARRAY('index',INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,IGNORED),256) AS item FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_simulation_attempts'
    UNION ALL SELECT SHA2(JSON_ARRAY('check',CONSTRAINT_NAME,CHECK_CLAUSE,LEVEL),256) AS item FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_simulation_attempts'
    UNION ALL SELECT SHA2(JSON_ARRAY('fk',k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,IF(BINARY k.REFERENCED_TABLE_SCHEMA=BINARY DATABASE(),'current',k.REFERENCED_TABLE_SCHEMA),f.UPDATE_RULE,f.DELETE_RULE),256) AS item FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS f ON f.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND f.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND f.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND BINARY k.TABLE_NAME='refund_route_simulation_attempts' AND k.REFERENCED_TABLE_NAME IS NOT NULL) AS metadata_rows) <=> 'a30c2021bdbebfc0d5f5e8c8ab04344a56fd64bb2b5b36c62e76dedfd707caad') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_simulation_attempts';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='refund_route_simulation_attempts' AND TRIGGER_NAME NOT IN('refund_route_attempt_insert','refund_route_attempt_update','refund_route_attempt_delete','refund_route_simulation_reserve')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_unexpected_refund_route_simulation_attempts';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='refund_route_simulation_events') AND NOT ((SELECT SHA2(COALESCE(GROUP_CONCAT(item ORDER BY item SEPARATOR ''),''),256)
   FROM (SELECT SHA2(JSON_ARRAY('table',TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_COLLATION,CREATE_OPTIONS),256) AS item FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_simulation_events'
    UNION ALL SELECT SHA2(JSON_ARRAY('column',COLUMN_NAME,ORDINAL_POSITION,COLUMN_DEFAULT,IS_NULLABLE,DATA_TYPE,COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,IS_GENERATED,GENERATION_EXPRESSION,COLUMN_COMMENT),256) AS item FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_simulation_events'
    UNION ALL SELECT SHA2(JSON_ARRAY('index',INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,IGNORED),256) AS item FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_simulation_events'
    UNION ALL SELECT SHA2(JSON_ARRAY('check',CONSTRAINT_NAME,CHECK_CLAUSE,LEVEL),256) AS item FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_simulation_events'
    UNION ALL SELECT SHA2(JSON_ARRAY('fk',k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,IF(BINARY k.REFERENCED_TABLE_SCHEMA=BINARY DATABASE(),'current',k.REFERENCED_TABLE_SCHEMA),f.UPDATE_RULE,f.DELETE_RULE),256) AS item FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS f ON f.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND f.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND f.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND BINARY k.TABLE_NAME='refund_route_simulation_events' AND k.REFERENCED_TABLE_NAME IS NOT NULL) AS metadata_rows) <=> 'c02c4e2cb3e60de4bfec015583c329a2616959133d7d31063cbce2f5632e5d46') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_simulation_events';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='refund_route_simulation_events' AND TRIGGER_NAME NOT IN('refund_route_event_insert','refund_route_event_update','refund_route_event_delete','refund_route_simulation_release')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_unexpected_refund_route_simulation_events';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='refund_route_reservations') AND NOT ((SELECT SHA2(COALESCE(GROUP_CONCAT(item ORDER BY item SEPARATOR ''),''),256)
   FROM (SELECT SHA2(JSON_ARRAY('table',TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_COLLATION,CREATE_OPTIONS),256) AS item FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_reservations'
    UNION ALL SELECT SHA2(JSON_ARRAY('column',COLUMN_NAME,ORDINAL_POSITION,COLUMN_DEFAULT,IS_NULLABLE,DATA_TYPE,COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,IS_GENERATED,GENERATION_EXPRESSION,COLUMN_COMMENT),256) AS item FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_reservations'
    UNION ALL SELECT SHA2(JSON_ARRAY('index',INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,IGNORED),256) AS item FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_reservations'
    UNION ALL SELECT SHA2(JSON_ARRAY('check',CONSTRAINT_NAME,CHECK_CLAUSE,LEVEL),256) AS item FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_reservations'
    UNION ALL SELECT SHA2(JSON_ARRAY('fk',k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,IF(BINARY k.REFERENCED_TABLE_SCHEMA=BINARY DATABASE(),'current',k.REFERENCED_TABLE_SCHEMA),f.UPDATE_RULE,f.DELETE_RULE),256) AS item FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS f ON f.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND f.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND f.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND BINARY k.TABLE_NAME='refund_route_reservations' AND k.REFERENCED_TABLE_NAME IS NOT NULL) AS metadata_rows) <=> '9ad21ca0103591103f6ac3639c7bf10f1180f92daa75a28fdeb8bf11679b528b') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_reservations';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='refund_route_reservations' AND TRIGGER_NAME NOT IN('refund_route_reservation_insert','refund_route_reservation_update','refund_route_reservation_delete')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_unexpected_refund_route_reservations';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='refund_route_bank_terminal_evidence') AND NOT ((SELECT SHA2(JSON_ARRAY(TABLE_NAME,REPLACE(VIEW_DEFINITION,CONCAT(CHAR(96),DATABASE(),CHAR(96),'.'),''),CHECK_OPTION,IS_UPDATABLE,SECURITY_TYPE),256) FROM information_schema.VIEWS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='refund_route_bank_terminal_evidence') <=> '1c53b58c4ec31a6e9c7878e729eaa6fdfee1c15f97a7a6ffb983b0586ace95c4') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_bank_terminal_evidence';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_capture_insert') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_capture_insert') <=> '993fcebd09ed7bdf15e512a3ec1c59d74aec3c3f127ba2c6d9bdbb6295e4ba72') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_capture_insert';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_capture_update') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_capture_update') <=> 'b90cbaa0497a73fcd62c062ab4e5c01797358a8a0d9ff3f5f795536cb64a9c68') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_capture_update';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_capture_delete') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_capture_delete') <=> '493f492034c29ccb9bc94d89e5b986aff6aa49ec018970a126efda4dd7ccbeba') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_capture_delete';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_attempt_insert') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_attempt_insert') <=> '37c7e9e7abb359e3035089cbaddebc827c157b892c0f9170cc8ab432bf4139de') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_attempt_insert';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_attempt_update') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_attempt_update') <=> 'bbbee05a6add3e81183921199a2fa44cfa4894cb97559edc28e45d4b0b9ca3bd') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_attempt_update';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_attempt_delete') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_attempt_delete') <=> 'd853ab6107f4eeaf574bad0d38c35193dedf7c8e86b3cff347bcf1f493e6e203') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_attempt_delete';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_event_insert') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_event_insert') <=> '0d44d1216ab90f8029a2a8959daae78f627daf56810738e412a6cb3a88fe2af5') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_event_insert';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_event_update') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_event_update') <=> '48cfd077ff61acae82957ce19114f66568e5ceffad0d79c64e5532cdcecfdc7d') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_event_update';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_event_delete') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_event_delete') <=> 'de6d336412246f726e89e6188572e8ab458c21108cfd458f7fcaaf51ead17c8f') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_event_delete';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_reservation_insert') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_reservation_insert') <=> 'b4ff0b2c520a9eca6c8791724cc3745fefab05d559ae803d2e55d5050c82d420') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_reservation_insert';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_reservation_update') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_reservation_update') <=> 'e70f9ccbbfdd7a6f9ca165c09644836e3511895adf0ea5a88a9bc24eb7d28a47') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_reservation_update';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_reservation_delete') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_reservation_delete') <=> '2db84d84efb1796925d52885f3eb0511b2e70526fe545fecd9b18e363ddcdbd2') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_reservation_delete';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_bank_attempt_guard') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_bank_attempt_guard') <=> '5518cab425735841f71dea2ac66a89e16872b5719e43775fdc5671d97345645c') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_bank_attempt_guard';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_bank_reserve') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_bank_reserve') <=> '7e4c7686d5af59d3ccd611587fc64f042265dbbd048428684588d202a620363c') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_bank_reserve';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_simulation_reserve') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_simulation_reserve') <=> 'e566404f7550d6c2ce927a4391b80daeddfe1f9845da58808b112c633d2c71eb') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_simulation_reserve';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_bank_release') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_bank_release') <=> '185520c610e7fcd2c07b9112a3c99664e2544a9b3bb1a23ed78c05c3294da3e9') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_bank_release';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='refund_route_simulation_release') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='refund_route_simulation_release') <=> '32e9f732f6f0137c3ef1ff705b712fb115da54a2f01a994445e035b3544e8e69') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_route_simulation_release';
  END IF;
END$$
DELIMITER ;

-- MariaDB counterpart of 0162_refund_route_reservations. Install after existing refund and finance-evidence sources.
-- A simulated refund consumes only a simulated capture. It never settles an original obligation.
CREATE TABLE IF NOT EXISTS refund_route_simulation_captures (
  id VARCHAR(191) NOT NULL PRIMARY KEY CHECK(length(id)=64 AND BINARY id REGEXP '^[0-9a-f]{64}$'),
  order_id VARCHAR(191) NOT NULL REFERENCES orders(id),
  transaction_id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL CHECK(length(transaction_id) BETWEEN 1 AND 191),
  session_number VARCHAR(191) COLLATE utf8mb4_bin NOT NULL CHECK(length(session_number) BETWEEN 1 AND 191),
  captured_paisa BIGINT NOT NULL CHECK(captured_paisa BETWEEN 1 AND 9007199254740991),
  currency VARCHAR(191) COLLATE utf8mb4_bin NOT NULL CHECK(currency='NPR'),
  UNIQUE (transaction_id,session_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refund_route_simulation_attempts (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  obligation_id VARCHAR(191) NOT NULL REFERENCES refund_obligations(id),
  capture_id VARCHAR(191) NOT NULL REFERENCES refund_route_simulation_captures(id),
  route VARCHAR(191) COLLATE utf8mb4_bin NOT NULL CHECK(route IN('fonepay','bank','pickup')),
  request_id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL CHECK(length(request_id) BETWEEN 1 AND 191),
  amount_paisa BIGINT NOT NULL CHECK(amount_paisa BETWEEN 1 AND 9007199254740991),
  created_at BIGINT NOT NULL CHECK(created_at BETWEEN 1 AND 9007199254740991),
  KEY refund_route_capture_attempts(capture_id),
  UNIQUE (obligation_id,request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refund_route_simulation_events (
  attempt_id VARCHAR(191) NOT NULL REFERENCES refund_route_simulation_attempts(id),
  sequence BIGINT NOT NULL CHECK(sequence BETWEEN 1 AND 9007199254740991),
  route VARCHAR(191) COLLATE utf8mb4_bin NOT NULL CHECK(route IN('fonepay','bank','pickup')),
  provider_reference VARCHAR(191) COLLATE utf8mb4_bin NOT NULL CHECK(length(provider_reference) BETWEEN 1 AND 191),
  event_reference VARCHAR(191) COLLATE utf8mb4_bin NOT NULL CHECK(length(event_reference) BETWEEN 1 AND 191),
  status VARCHAR(191) COLLATE utf8mb4_bin NOT NULL CHECK(status IN('submitted','uncertain','partial','settled','closed')),
  settled_paisa BIGINT NOT NULL CHECK(settled_paisa BETWEEN 0 AND 9007199254740991),
  confirmed_unsent_paisa BIGINT NOT NULL CHECK(confirmed_unsent_paisa BETWEEN 0 AND 9007199254740991),
  proof_reference VARCHAR(191) COLLATE utf8mb4_bin CHECK(length(proof_reference) BETWEEN 1 AND 191),
  created_at BIGINT NOT NULL CHECK(created_at BETWEEN 1 AND 9007199254740991),
  first_reference VARCHAR(191) COLLATE utf8mb4_bin GENERATED ALWAYS AS (CASE WHEN sequence=1 THEN provider_reference ELSE NULL END) STORED,
  PRIMARY KEY (attempt_id,sequence),
  UNIQUE KEY refund_route_original_provider_reference(route,first_reference),
  UNIQUE (route,event_reference),
  UNIQUE (route,proof_reference),
  CHECK((status IN('settled','closed') AND proof_reference IS NOT NULL) OR (status NOT IN('settled','closed') AND confirmed_unsent_paisa=0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refund_route_reservations (
  obligation_id VARCHAR(191) NOT NULL PRIMARY KEY REFERENCES refund_obligations(id),
  bank_packet_id VARCHAR(191) UNIQUE REFERENCES outgoing_payment_packets(id),
  simulation_attempt_id VARCHAR(191) UNIQUE REFERENCES refund_route_simulation_attempts(id),
  CHECK((bank_packet_id IS NULL)<>(simulation_attempt_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A packet state alone cannot release a reservation or justify switching routes.
CREATE VIEW IF NOT EXISTS refund_route_bank_terminal_evidence AS
SELECT p.id AS packet_id, p.obligation_id, e.id AS event_id
FROM outgoing_payment_packets p
JOIN refund_obligation_events e ON e.obligation_id=p.obligation_id
 AND JSON_VALUE(e.private_details_json,'$.packetId')=p.id
 AND BINARY JSON_VALUE(e.private_details_json,'$.evidenceReference')=BINARY p.evidence_reference
 AND e.actor_id=p.recorded_by
WHERE p.amount_paisa>0 AND CHAR_LENGTH(TRIM(p.evidence_reference))>=8 AND p.recorded_at IS NOT NULL
AND (
  (p.state='void' AND e.action='packet_voided' AND p.started_at IS NULL
    AND JSON_CONTAINS(e.private_details_json,'true','$.notSentConfirmed')=1)
  OR (p.state='paid' AND e.action='packet_paid' AND p.started_at IS NOT NULL
    AND EXISTS(SELECT 1 FROM company_outgoing_bank_identities b WHERE b.packet_kind='refund'
      AND b.packet_id=p.id AND b.identity_hash=p.transaction_identity_hash AND b.account_version_id=p.account_version_id
      AND BINARY b.transaction_identity=BINARY p.transaction_identity AND b.amount_paisa=p.amount_paisa AND b.bank_at=p.bank_at))
  OR (p.state='failed' AND e.action='packet_failed' AND p.started_at IS NOT NULL
    AND JSON_VALUE(e.private_details_json,'$.failureBasis') IN('not_sent','no_debit','debit_returned')
    AND (
      NOT EXISTS(SELECT 1 FROM refund_obligation_events acknowledgment
        WHERE acknowledgment.obligation_id=p.obligation_id AND acknowledgment.action='packet_submitted'
          AND JSON_VALUE(acknowledgment.private_details_json,'$.packetId')=p.id)
      OR (JSON_VALUE(e.private_details_json,'$.failureBasis') IN('no_debit','debit_returned')
        AND JSON_CONTAINS(e.private_details_json,'true','$.bankFinalityConfirmed')=1
        AND EXISTS(SELECT 1 FROM refund_obligation_events acknowledgment
          JOIN finance_evidence_intents submitted ON submitted.id=trim(JSON_VALUE(acknowledgment.private_details_json,'$.evidenceReference'))
            AND submitted.scope_kind='obligation' AND submitted.scope_id=p.obligation_id
          JOIN finance_evidence_files submitted_file ON submitted_file.id=submitted.id
          JOIN finance_evidence_intents closing ON closing.id=trim(p.evidence_reference)
            AND closing.scope_kind='obligation' AND closing.scope_id=p.obligation_id AND closing.content_hash<>submitted.content_hash
          JOIN finance_evidence_files closing_file ON closing_file.id=closing.id
          WHERE acknowledgment.obligation_id=p.obligation_id AND acknowledgment.action='packet_submitted'
            AND JSON_VALUE(acknowledgment.private_details_json,'$.packetId')=p.id))
    ))
);

DELIMITER $$
CREATE TRIGGER IF NOT EXISTS refund_route_capture_insert BEFORE INSERT ON refund_route_simulation_captures FOR EACH ROW
BEGIN
  IF (EXISTS(SELECT 1 FROM refund_route_simulation_captures c WHERE c.id=NEW.id OR
  (c.transaction_id=NEW.transaction_id AND c.session_number=NEW.session_number))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_capture_retained';
  END IF;
END$$

CREATE TRIGGER IF NOT EXISTS refund_route_capture_update BEFORE UPDATE ON refund_route_simulation_captures FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_capture_retained';
END$$

CREATE TRIGGER IF NOT EXISTS refund_route_capture_delete BEFORE DELETE ON refund_route_simulation_captures FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_capture_retained';
END$$

CREATE TRIGGER IF NOT EXISTS refund_route_attempt_insert BEFORE INSERT ON refund_route_simulation_attempts FOR EACH ROW
BEGIN
  DECLARE locked_obligation VARCHAR(191);
  DECLARE locked_capture VARCHAR(191);
  -- Bank and simulated attempts take the obligation lock in the same order.
  SELECT id INTO locked_obligation FROM refund_obligations WHERE id=NEW.obligation_id FOR UPDATE;
  SELECT id INTO locked_capture FROM refund_route_simulation_captures WHERE id=NEW.capture_id FOR UPDATE;
  IF (EXISTS(SELECT 1 FROM refund_route_simulation_attempts a WHERE a.id=NEW.id OR
    (a.obligation_id=NEW.obligation_id AND a.request_id=NEW.request_id))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_attempt_retained';
  END IF;
  IF (EXISTS(SELECT 1 FROM refund_route_reservations WHERE obligation_id=NEW.obligation_id)
    OR EXISTS(SELECT 1 FROM outgoing_payment_packets p WHERE p.obligation_id=NEW.obligation_id AND p.amount_paisa>0
      AND (p.state NOT IN('failed','void') OR NOT EXISTS(SELECT 1 FROM refund_route_bank_terminal_evidence e WHERE e.packet_id=p.id)))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_already_reserved';
  END IF;
  IF (NOT EXISTS(SELECT 1 FROM refund_obligations o JOIN refund_route_simulation_captures c ON c.order_id=o.order_id
    WHERE o.id=NEW.obligation_id AND c.id=NEW.capture_id AND o.state='open' AND o.currency='NPR'
     AND NOT EXISTS(SELECT 1 FROM refund_route_simulation_attempts a WHERE a.obligation_id=o.id AND a.capture_id<>c.id)
     AND NEW.amount_paisa<=o.cash_paisa-COALESCE((SELECT SUM(e.settled_paisa) FROM refund_route_simulation_attempts a
       JOIN refund_route_simulation_events e ON e.attempt_id=a.id AND e.status IN('settled','closed') WHERE a.obligation_id=o.id),0)
     AND NEW.amount_paisa<=c.captured_paisa-COALESCE((SELECT SUM(COALESCE((SELECT e.settled_paisa FROM refund_route_simulation_events e
       WHERE e.attempt_id=a.id AND e.status IN('settled','closed')),a.amount_paisa)) FROM refund_route_simulation_attempts a WHERE a.capture_id=c.id),0))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_amount_or_capture_mismatch';
  END IF;
END$$

CREATE TRIGGER IF NOT EXISTS refund_route_attempt_update BEFORE UPDATE ON refund_route_simulation_attempts FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_attempt_retained';
END$$

CREATE TRIGGER IF NOT EXISTS refund_route_attempt_delete BEFORE DELETE ON refund_route_simulation_attempts FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_attempt_retained';
END$$

CREATE TRIGGER IF NOT EXISTS refund_route_event_insert BEFORE INSERT ON refund_route_simulation_events FOR EACH ROW
BEGIN
  DECLARE event_obligation VARCHAR(191);
  DECLARE event_capture VARCHAR(191);
  DECLARE locked_obligation VARCHAR(191);
  DECLARE locked_capture VARCHAR(191);
  SELECT obligation_id,capture_id INTO event_obligation,event_capture
    FROM refund_route_simulation_attempts WHERE id=NEW.attempt_id LOCK IN SHARE MODE;
  SELECT id INTO locked_obligation FROM refund_obligations WHERE id=event_obligation FOR UPDATE;
  SELECT id INTO locked_capture FROM refund_route_simulation_captures WHERE id=event_capture FOR UPDATE;
  IF (EXISTS(SELECT 1 FROM refund_route_simulation_events e WHERE
    (e.attempt_id=NEW.attempt_id AND e.sequence=NEW.sequence) OR (e.route=NEW.route AND (e.event_reference=NEW.event_reference
    OR e.proof_reference=NEW.proof_reference OR (e.provider_reference=NEW.provider_reference AND e.attempt_id<>NEW.attempt_id))))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_event_retained';
  END IF;
  IF (NOT EXISTS(SELECT 1 FROM refund_route_simulation_attempts a
    JOIN refund_route_reservations s ON s.obligation_id=a.obligation_id AND s.simulation_attempt_id=a.id
    WHERE a.id=NEW.attempt_id AND a.route=NEW.route AND NEW.created_at>=a.created_at
      AND NEW.sequence=COALESCE((SELECT MAX(e.sequence) FROM refund_route_simulation_events e WHERE e.attempt_id=a.id),0)+1
      AND NOT EXISTS(SELECT 1 FROM refund_route_simulation_events e WHERE e.attempt_id=a.id
        AND (e.provider_reference<>NEW.provider_reference OR e.status IN('settled','closed') OR e.created_at>NEW.created_at))
      AND ((NEW.status='submitted' AND NEW.sequence=1 AND NEW.settled_paisa=0)
        OR (NEW.status='uncertain' AND NEW.settled_paisa<=a.amount_paisa)
        OR (NEW.status='partial' AND NEW.settled_paisa>0 AND NEW.settled_paisa<a.amount_paisa)
        OR (NEW.status='settled' AND NEW.settled_paisa=a.amount_paisa AND NEW.confirmed_unsent_paisa=0)
        OR (NEW.status='closed' AND NEW.settled_paisa<a.amount_paisa AND NEW.confirmed_unsent_paisa=a.amount_paisa-NEW.settled_paisa)))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_event_outcome_mismatch';
  END IF;
END$$

CREATE TRIGGER IF NOT EXISTS refund_route_event_update BEFORE UPDATE ON refund_route_simulation_events FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_event_retained';
END$$

CREATE TRIGGER IF NOT EXISTS refund_route_event_delete BEFORE DELETE ON refund_route_simulation_events FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_event_retained';
END$$

CREATE TRIGGER IF NOT EXISTS refund_route_reservation_insert BEFORE INSERT ON refund_route_reservations FOR EACH ROW
BEGIN
  IF (EXISTS(SELECT 1 FROM refund_route_reservations s WHERE s.obligation_id=NEW.obligation_id
    OR s.bank_packet_id=NEW.bank_packet_id OR s.simulation_attempt_id=NEW.simulation_attempt_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_already_reserved';
  END IF;
  IF (NOT (
    EXISTS(SELECT 1 FROM outgoing_payment_packets p WHERE p.id=NEW.bank_packet_id AND p.obligation_id=NEW.obligation_id
      AND p.amount_paisa>0 AND p.state IN('prepared','approved','processing','uncertain'))
    OR EXISTS(SELECT 1 FROM refund_route_simulation_attempts a WHERE a.id=NEW.simulation_attempt_id AND a.obligation_id=NEW.obligation_id
      AND NOT EXISTS(SELECT 1 FROM refund_route_simulation_events e WHERE e.attempt_id=a.id)))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_reservation_owner_mismatch';
  END IF;
END$$

CREATE TRIGGER IF NOT EXISTS refund_route_reservation_update BEFORE UPDATE ON refund_route_reservations FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_reservation_owner_retained';
END$$

CREATE TRIGGER IF NOT EXISTS refund_route_reservation_delete BEFORE DELETE ON refund_route_reservations FOR EACH ROW
BEGIN
  IF (NOT (EXISTS(SELECT 1 FROM refund_route_bank_terminal_evidence e WHERE e.packet_id=OLD.bank_packet_id AND e.obligation_id=OLD.obligation_id)
  OR EXISTS(SELECT 1 FROM refund_route_simulation_events e WHERE e.attempt_id=OLD.simulation_attempt_id AND e.status IN('settled','closed')))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_release_proof_required';
  END IF;
END$$

CREATE TRIGGER IF NOT EXISTS refund_route_bank_attempt_guard BEFORE INSERT ON outgoing_payment_packets FOR EACH ROW
BEGIN
  DECLARE locked_obligation VARCHAR(191);
  IF NEW.amount_paisa>0 THEN
    SELECT id INTO locked_obligation FROM refund_obligations WHERE id=NEW.obligation_id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM refund_route_reservations WHERE obligation_id=NEW.obligation_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_already_reserved';
    END IF;
  END IF;
END$$

CREATE TRIGGER IF NOT EXISTS refund_route_bank_reserve AFTER INSERT ON outgoing_payment_packets FOR EACH ROW
BEGIN
  IF (NEW.amount_paisa>0 AND NEW.state IN('prepared','approved','processing','uncertain')) THEN
    INSERT INTO refund_route_reservations(obligation_id,bank_packet_id) VALUES(NEW.obligation_id,NEW.id);
  END IF;
END$$

CREATE TRIGGER IF NOT EXISTS refund_route_simulation_reserve AFTER INSERT ON refund_route_simulation_attempts FOR EACH ROW
BEGIN
  INSERT INTO refund_route_reservations(obligation_id,simulation_attempt_id) VALUES(NEW.obligation_id,NEW.id);
END$$

CREATE TRIGGER IF NOT EXISTS refund_route_bank_release AFTER INSERT ON refund_obligation_events FOR EACH ROW
BEGIN
  IF (NEW.action IN('packet_voided','packet_failed','packet_paid')) THEN
    DELETE FROM refund_route_reservations WHERE obligation_id=NEW.obligation_id
      AND EXISTS(SELECT 1 FROM refund_route_bank_terminal_evidence e
        WHERE e.packet_id=refund_route_reservations.bank_packet_id AND e.event_id=NEW.id);
    IF EXISTS(
      SELECT 1 FROM refund_route_reservations s
      JOIN outgoing_payment_packets p ON p.id=s.bank_packet_id AND p.obligation_id=s.obligation_id
      WHERE s.obligation_id=NEW.obligation_id AND p.amount_paisa>0
        AND (p.id=JSON_VALUE(NEW.private_details_json,'$.packetId') OR p.state IN('void','failed','paid'))
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_route_release_proof_required';
    END IF;
  END IF;
END$$

CREATE TRIGGER IF NOT EXISTS refund_route_simulation_release AFTER INSERT ON refund_route_simulation_events FOR EACH ROW
BEGIN
  IF (NEW.status IN('settled','closed')) THEN
    DELETE FROM refund_route_reservations WHERE simulation_attempt_id=NEW.attempt_id;
  END IF;
END$$
DELIMITER ;
