-- Inspect exact installed definitions before each additive companion.
-- An already installed object with the reviewed definition is retained.
DELIMITER $$
BEGIN NOT ATOMIC
  IF DATABASE() IS NULL OR @@FOREIGN_KEY_CHECKS<>1 OR @@check_constraint_checks<>1 OR @@SESSION.sql_mode LIKE '%NO_BACKSLASH_ESCAPES%' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_session';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_delivery_shipment_allocations') AND NOT ((SELECT SHA2(COALESCE(GROUP_CONCAT(item ORDER BY item SEPARATOR ''),''),256)
   FROM (SELECT SHA2(JSON_ARRAY('table',TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_COLLATION,CREATE_OPTIONS),256) AS item FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_delivery_shipment_allocations'
    UNION ALL SELECT SHA2(JSON_ARRAY('column',COLUMN_NAME,ORDINAL_POSITION,COLUMN_DEFAULT,IS_NULLABLE,DATA_TYPE,COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,IS_GENERATED,GENERATION_EXPRESSION,COLUMN_COMMENT),256) AS item FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_delivery_shipment_allocations'
    UNION ALL SELECT SHA2(JSON_ARRAY('index',INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,IGNORED),256) AS item FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_delivery_shipment_allocations'
    UNION ALL SELECT SHA2(JSON_ARRAY('check',CONSTRAINT_NAME,CHECK_CLAUSE,LEVEL),256) AS item FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_delivery_shipment_allocations'
    UNION ALL SELECT SHA2(JSON_ARRAY('fk',k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,IF(BINARY k.REFERENCED_TABLE_SCHEMA=BINARY DATABASE(),'current',k.REFERENCED_TABLE_SCHEMA),f.UPDATE_RULE,f.DELETE_RULE),256) AS item FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS f ON f.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND f.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND f.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND BINARY k.TABLE_NAME='order_delivery_shipment_allocations' AND k.REFERENCED_TABLE_NAME IS NOT NULL) AS metadata_rows) <=> 'dfda6950c707c0a59f1f0aca78c94c022042d3b5b80a4ff5df527b55db448589') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_order_delivery_shipment_allocations';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='order_delivery_shipment_allocations' AND TRIGGER_NAME NOT IN('delivery_shipment_insert','delivery_shipment_no_update','delivery_shipment_no_delete')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_unexpected_order_delivery_shipment_allocations';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_delivery_unit_allocations') AND NOT ((SELECT SHA2(COALESCE(GROUP_CONCAT(item ORDER BY item SEPARATOR ''),''),256)
   FROM (SELECT SHA2(JSON_ARRAY('table',TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_COLLATION,CREATE_OPTIONS),256) AS item FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_delivery_unit_allocations'
    UNION ALL SELECT SHA2(JSON_ARRAY('column',COLUMN_NAME,ORDINAL_POSITION,COLUMN_DEFAULT,IS_NULLABLE,DATA_TYPE,COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,IS_GENERATED,GENERATION_EXPRESSION,COLUMN_COMMENT),256) AS item FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_delivery_unit_allocations'
    UNION ALL SELECT SHA2(JSON_ARRAY('index',INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,IGNORED),256) AS item FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_delivery_unit_allocations'
    UNION ALL SELECT SHA2(JSON_ARRAY('check',CONSTRAINT_NAME,CHECK_CLAUSE,LEVEL),256) AS item FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_delivery_unit_allocations'
    UNION ALL SELECT SHA2(JSON_ARRAY('fk',k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,IF(BINARY k.REFERENCED_TABLE_SCHEMA=BINARY DATABASE(),'current',k.REFERENCED_TABLE_SCHEMA),f.UPDATE_RULE,f.DELETE_RULE),256) AS item FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS f ON f.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND f.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND f.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND BINARY k.TABLE_NAME='order_delivery_unit_allocations' AND k.REFERENCED_TABLE_NAME IS NOT NULL) AS metadata_rows) <=> '51e925ef0181d7be508104057eb03f07a03a5f084b49af31a28d05c4f7b0ce46') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_order_delivery_unit_allocations';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='order_delivery_unit_allocations' AND TRIGGER_NAME NOT IN('delivery_unit_insert','delivery_unit_no_update','delivery_unit_no_delete')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_unexpected_order_delivery_unit_allocations';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_delivery_unit_claims') AND NOT ((SELECT SHA2(COALESCE(GROUP_CONCAT(item ORDER BY item SEPARATOR ''),''),256)
   FROM (SELECT SHA2(JSON_ARRAY('table',TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_COLLATION,CREATE_OPTIONS),256) AS item FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_delivery_unit_claims'
    UNION ALL SELECT SHA2(JSON_ARRAY('column',COLUMN_NAME,ORDINAL_POSITION,COLUMN_DEFAULT,IS_NULLABLE,DATA_TYPE,COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,IS_GENERATED,GENERATION_EXPRESSION,COLUMN_COMMENT),256) AS item FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_delivery_unit_claims'
    UNION ALL SELECT SHA2(JSON_ARRAY('index',INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,IGNORED),256) AS item FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_delivery_unit_claims'
    UNION ALL SELECT SHA2(JSON_ARRAY('check',CONSTRAINT_NAME,CHECK_CLAUSE,LEVEL),256) AS item FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_delivery_unit_claims'
    UNION ALL SELECT SHA2(JSON_ARRAY('fk',k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,IF(BINARY k.REFERENCED_TABLE_SCHEMA=BINARY DATABASE(),'current',k.REFERENCED_TABLE_SCHEMA),f.UPDATE_RULE,f.DELETE_RULE),256) AS item FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS f ON f.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND f.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND f.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND BINARY k.TABLE_NAME='order_delivery_unit_claims' AND k.REFERENCED_TABLE_NAME IS NOT NULL) AS metadata_rows) <=> 'ff020d5b73bcc05839ee33c4870cd828bd7538af15ebf3fc0704fab4c2b28181') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_order_delivery_unit_claims';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='order_delivery_unit_claims' AND TRIGGER_NAME NOT IN('delivery_unit_claim_insert','delivery_unit_claim_no_update','delivery_unit_claim_no_delete')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_unexpected_order_delivery_unit_claims';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_delivery_unit_parcels') AND NOT ((SELECT SHA2(COALESCE(GROUP_CONCAT(item ORDER BY item SEPARATOR ''),''),256)
   FROM (SELECT SHA2(JSON_ARRAY('table',TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_COLLATION,CREATE_OPTIONS),256) AS item FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_delivery_unit_parcels'
    UNION ALL SELECT SHA2(JSON_ARRAY('column',COLUMN_NAME,ORDINAL_POSITION,COLUMN_DEFAULT,IS_NULLABLE,DATA_TYPE,COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,IS_GENERATED,GENERATION_EXPRESSION,COLUMN_COMMENT),256) AS item FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_delivery_unit_parcels'
    UNION ALL SELECT SHA2(JSON_ARRAY('index',INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,IGNORED),256) AS item FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_delivery_unit_parcels'
    UNION ALL SELECT SHA2(JSON_ARRAY('check',CONSTRAINT_NAME,CHECK_CLAUSE,LEVEL),256) AS item FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND BINARY TABLE_NAME='order_delivery_unit_parcels'
    UNION ALL SELECT SHA2(JSON_ARRAY('fk',k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,IF(BINARY k.REFERENCED_TABLE_SCHEMA=BINARY DATABASE(),'current',k.REFERENCED_TABLE_SCHEMA),f.UPDATE_RULE,f.DELETE_RULE),256) AS item FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS f ON f.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND f.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND f.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND BINARY k.TABLE_NAME='order_delivery_unit_parcels' AND k.REFERENCED_TABLE_NAME IS NOT NULL) AS metadata_rows) <=> '0c8322feebae13bb305109bbdbd6ecf970008fbab0867b1c2ab907dfb6a5bd4e') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_order_delivery_unit_parcels';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='order_delivery_unit_parcels' AND TRIGGER_NAME NOT IN('delivery_unit_parcel_insert','delivery_unit_parcel_no_update','delivery_unit_parcel_no_delete')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_unexpected_order_delivery_unit_parcels';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='delivery_shipment_insert') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='delivery_shipment_insert') <=> '0d64dcdcde0816448f0ce674a13a5b4c257a41f7a833486dd39b2896a21679a9') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_delivery_shipment_insert';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='delivery_shipment_no_update') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='delivery_shipment_no_update') <=> 'e40a301316ccda6fe77167f2501fedf4a7a23cc8951e379eda07f30d24aea604') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_delivery_shipment_no_update';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='delivery_shipment_no_delete') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='delivery_shipment_no_delete') <=> '078ee2ca76ce96f5c087f8385647af75f09492d515f3601585c06bcd92ebc0b0') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_delivery_shipment_no_delete';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='delivery_shipment_marker_no_rewrite') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='delivery_shipment_marker_no_rewrite') <=> '6b8831bd49ea774fd5086772b4858344db2fa4e9d0cf594a57c4674a57839ae2') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_delivery_shipment_marker_no_rewrite';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='delivery_unit_insert') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='delivery_unit_insert') <=> 'ed5f559426491ad51159b865a5c679d86fb6f8b61ddaa71543b35efd7a9472e7') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_delivery_unit_insert';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='delivery_unit_no_update') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='delivery_unit_no_update') <=> '4a6b11c5300aa934acfdc56f86c9a28728d087e36d5fc25814d4b69798b98fdd') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_delivery_unit_no_update';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='delivery_unit_no_delete') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='delivery_unit_no_delete') <=> 'b3ecef3333a3553ab683b681ca87140fd7125dcd433573c2a39f4650c94501fc') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_delivery_unit_no_delete';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='delivery_unit_claim_insert') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='delivery_unit_claim_insert') <=> '658bd1cf968df38d5038111cf66a5a26d584bcdefdccd123829475eb0ce9790c') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_delivery_unit_claim_insert';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='delivery_unit_claim_no_update') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='delivery_unit_claim_no_update') <=> 'd8412556455b6fb834ec67683cf9ccc021149794f35b3f53228a74926ccad1fd') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_delivery_unit_claim_no_update';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='delivery_unit_claim_no_delete') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='delivery_unit_claim_no_delete') <=> '7076bd73fe085d717dabbb6eaa4cc6035ee450aa2db327999ef665bc7a8629f0') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_delivery_unit_claim_no_delete';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='delivery_unit_parcel_insert') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='delivery_unit_parcel_insert') <=> 'b8c86240cb0731769b064780f8b4fc0c1faca95b24010fae79d3be098111b489') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_delivery_unit_parcel_insert';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='delivery_unit_parcel_no_update') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='delivery_unit_parcel_no_update') <=> '7ca025a9690d33295d8f0dafca26370a08cc8b19ac426bda1f0ec2f4a842540a') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_delivery_unit_parcel_no_update';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='delivery_unit_parcel_no_delete') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='delivery_unit_parcel_no_delete') <=> '0b029bbbc86925d983652c6d9fa8d8cea9601eaec2f3f490e5c7ec00b9eced43') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_delivery_unit_parcel_no_delete';
  END IF;
END$$
DELIMITER ;

CREATE TABLE IF NOT EXISTS order_delivery_shipment_allocations (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  order_id VARCHAR(191) NOT NULL,
  seller_id VARCHAR(191) NOT NULL,
  shipment_ordinal BIGINT NOT NULL CHECK(shipment_ordinal BETWEEN 1 AND 9007199254740991),
  amount_paisa BIGINT NOT NULL CHECK(amount_paisa BETWEEN 0 AND 9007199254740991),
  unit_count BIGINT NOT NULL CHECK(unit_count BETWEEN 1 AND 9007199254740991),
  policy_version VARCHAR(191) NOT NULL CHECK(BINARY policy_version='seller_shipment_equal_units_v2'),
  allocation_source VARCHAR(191) NOT NULL CHECK(CHAR_LENGTH(TRIM(allocation_source))>0),
  created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  CONSTRAINT delivery_shipment_order_fk FOREIGN KEY(order_id) REFERENCES orders(id),
  CONSTRAINT delivery_shipment_seller_fk FOREIGN KEY(seller_id) REFERENCES seller_profiles(id),
  UNIQUE KEY delivery_shipment_order_seller(order_id,seller_id),
  UNIQUE KEY delivery_shipment_order_ordinal(order_id,shipment_ordinal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS order_delivery_unit_allocations (
  shipment_id VARCHAR(191) NOT NULL,
  order_id VARCHAR(191) NOT NULL,
  order_item_id VARCHAR(191) NOT NULL,
  line_ordinal BIGINT NOT NULL CHECK(line_ordinal BETWEEN 1 AND 9007199254740991),
  unit_ordinal BIGINT NOT NULL CHECK(unit_ordinal BETWEEN 1 AND 9007199254740991),
  shipment_unit_ordinal BIGINT NOT NULL CHECK(shipment_unit_ordinal BETWEEN 1 AND 9007199254740991),
  amount_paisa BIGINT NOT NULL CHECK(amount_paisa BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(order_item_id,unit_ordinal),
  CONSTRAINT delivery_unit_shipment_fk FOREIGN KEY(shipment_id) REFERENCES order_delivery_shipment_allocations(id),
  CONSTRAINT delivery_unit_order_fk FOREIGN KEY(order_id) REFERENCES orders(id),
  CONSTRAINT delivery_unit_item_fk FOREIGN KEY(order_item_id) REFERENCES order_items(id),
  UNIQUE KEY delivery_unit_shipment_ordinal(shipment_id,shipment_unit_ordinal),
  KEY delivery_unit_order_shipment(order_id,shipment_id,shipment_unit_ordinal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS order_delivery_unit_claims (
  order_item_id VARCHAR(191) NOT NULL,
  unit_ordinal BIGINT NOT NULL,
  refund_id VARCHAR(191),
  cancellation_event_id VARCHAR(191),
  created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(order_item_id,unit_ordinal),
  CONSTRAINT delivery_unit_claim_unit_fk FOREIGN KEY(order_item_id,unit_ordinal)
    REFERENCES order_delivery_unit_allocations(order_item_id,unit_ordinal),
  CONSTRAINT delivery_unit_claim_refund_fk FOREIGN KEY(refund_id) REFERENCES refunds(id),
  CONSTRAINT delivery_unit_claim_event_fk FOREIGN KEY(cancellation_event_id) REFERENCES order_cancellation_events(id),
  CHECK((refund_id IS NULL)<>(cancellation_event_id IS NULL)),
  KEY delivery_unit_claim_refund(refund_id),
  KEY delivery_unit_claim_cancellation(cancellation_event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS order_delivery_unit_parcels (
  order_item_id VARCHAR(191) NOT NULL,
  unit_ordinal BIGINT NOT NULL,
  shipping_job_id VARCHAR(191) NOT NULL,
  created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(order_item_id,unit_ordinal),
  CONSTRAINT delivery_unit_parcel_unit_fk FOREIGN KEY(order_item_id,unit_ordinal)
    REFERENCES order_delivery_unit_allocations(order_item_id,unit_ordinal),
  CONSTRAINT delivery_unit_parcel_job_fk FOREIGN KEY(shipping_job_id) REFERENCES shipping_jobs(id),
  KEY delivery_unit_parcel_job(shipping_job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


DELIMITER $$
CREATE TRIGGER IF NOT EXISTS delivery_shipment_insert BEFORE INSERT ON order_delivery_shipment_allocations FOR EACH ROW
BEGIN
  IF EXISTS(
    SELECT 1 FROM order_delivery_shipment_allocations
    WHERE id=NEW.id OR (order_id=NEW.order_id AND (seller_id=NEW.seller_id OR shipment_ordinal=NEW.shipment_ordinal))
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_shipment_history_retained'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM orders AS original
    WHERE original.id=NEW.order_id AND BINARY original.id=BINARY NEW.order_id
      AND NEW.unit_count=(SELECT SUM(item.quantity) FROM order_items AS item
        WHERE item.order_id=original.id AND item.seller_id=NEW.seller_id AND BINARY item.seller_id=BINARY NEW.seller_id)
      AND NEW.shipment_ordinal<=(SELECT COUNT(DISTINCT item.seller_id) FROM order_items AS item WHERE item.order_id=original.id)
      AND NEW.amount_paisa<=original.delivery_charge_paisa-COALESCE((
        SELECT SUM(prior.amount_paisa) FROM order_delivery_shipment_allocations AS prior WHERE prior.order_id=original.id
      ),0)
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_shipment_original_mismatch'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS delivery_shipment_no_update BEFORE UPDATE ON order_delivery_shipment_allocations FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_shipment_history_retained'; END$$
CREATE TRIGGER IF NOT EXISTS delivery_shipment_no_delete BEFORE DELETE ON order_delivery_shipment_allocations FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_shipment_history_retained'; END$$
CREATE TRIGGER IF NOT EXISTS delivery_shipment_marker_no_rewrite BEFORE UPDATE ON orders FOR EACH ROW
BEGIN
  IF NOT (BINARY NEW.delivery_rate_snapshot_json <=> BINARY OLD.delivery_rate_snapshot_json)
    AND EXISTS(SELECT 1 FROM order_delivery_shipment_allocations WHERE order_id=OLD.id)
    AND CASE WHEN JSON_VALID(OLD.delivery_rate_snapshot_json)
      THEN BINARY JSON_VALUE(OLD.delivery_rate_snapshot_json,'$.unitAllocationPolicy') END='seller_shipment_equal_units_v2'
  THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_shipment_marker_retained'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS delivery_unit_insert BEFORE INSERT ON order_delivery_unit_allocations FOR EACH ROW
BEGIN
  IF EXISTS(
    SELECT 1 FROM order_delivery_unit_allocations
    WHERE (order_item_id=NEW.order_item_id AND unit_ordinal=NEW.unit_ordinal)
      OR (shipment_id=NEW.shipment_id AND shipment_unit_ordinal=NEW.shipment_unit_ordinal)
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_unit_history_retained'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM order_delivery_shipment_allocations AS shipment
    JOIN order_items AS item ON item.order_id=shipment.order_id AND item.seller_id=shipment.seller_id
    WHERE shipment.id=NEW.shipment_id AND shipment.order_id=NEW.order_id AND item.id=NEW.order_item_id
      AND BINARY shipment.id=BINARY NEW.shipment_id AND BINARY shipment.order_id=BINARY NEW.order_id AND BINARY item.id=BINARY NEW.order_item_id
      AND NEW.unit_ordinal<=item.quantity AND NEW.shipment_unit_ordinal<=shipment.unit_count
      AND NEW.amount_paisa=(shipment.amount_paisa DIV shipment.unit_count)
        + CASE WHEN NEW.shipment_unit_ordinal<=shipment.amount_paisa % shipment.unit_count THEN 1 ELSE 0 END
      AND (
        (NEW.shipment_unit_ordinal=1 AND NEW.line_ordinal=1 AND NEW.unit_ordinal=1)
        OR EXISTS(
          SELECT 1 FROM order_delivery_unit_allocations AS prior_unit
          JOIN order_items AS prior_item ON prior_item.id=prior_unit.order_item_id
          WHERE prior_unit.shipment_id=shipment.id AND prior_unit.shipment_unit_ordinal=NEW.shipment_unit_ordinal-1
            AND (
              (prior_unit.order_item_id=NEW.order_item_id AND prior_unit.line_ordinal=NEW.line_ordinal AND NEW.unit_ordinal=prior_unit.unit_ordinal+1)
              OR (prior_unit.order_item_id<>NEW.order_item_id AND NEW.line_ordinal=prior_unit.line_ordinal+1
                AND prior_unit.unit_ordinal=prior_item.quantity AND NEW.unit_ordinal=1)
            )
        )
      )
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_unit_original_mismatch'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS delivery_unit_no_update BEFORE UPDATE ON order_delivery_unit_allocations FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_unit_history_retained'; END$$
CREATE TRIGGER IF NOT EXISTS delivery_unit_no_delete BEFORE DELETE ON order_delivery_unit_allocations FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_unit_history_retained'; END$$
CREATE TRIGGER IF NOT EXISTS delivery_unit_claim_insert BEFORE INSERT ON order_delivery_unit_claims FOR EACH ROW
BEGIN
  IF EXISTS(
    SELECT 1 FROM order_delivery_unit_claims WHERE order_item_id=NEW.order_item_id AND unit_ordinal=NEW.unit_ordinal
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_unit_claim_history_retained'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM order_delivery_unit_allocations AS unit
    JOIN order_delivery_shipment_allocations AS shipment ON shipment.id=unit.shipment_id
    WHERE unit.order_item_id=NEW.order_item_id AND unit.unit_ordinal=NEW.unit_ordinal AND BINARY unit.order_item_id=BINARY NEW.order_item_id
      AND (
        (NEW.refund_id IS NOT NULL AND NEW.cancellation_event_id IS NULL AND EXISTS(
          SELECT 1 FROM refunds AS refund
          JOIN return_requests AS request ON request.id=refund.return_request_id
          WHERE refund.id=NEW.refund_id AND BINARY refund.id=BINARY NEW.refund_id
            AND refund.order_id=unit.order_id AND BINARY refund.status<>'rejected'
            AND request.order_item_id=unit.order_item_id
            AND (SELECT COUNT(*) FROM order_delivery_unit_claims AS prior WHERE prior.refund_id=refund.id)<request.quantity
        ))
        OR (NEW.cancellation_event_id IS NOT NULL AND NEW.refund_id IS NULL AND EXISTS(
          SELECT 1 FROM order_cancellation_events AS cancellation
          WHERE cancellation.id=NEW.cancellation_event_id AND BINARY cancellation.id=BINARY NEW.cancellation_event_id
            AND cancellation.order_id=unit.order_id
            AND JSON_TYPE(cancellation.seller_ids_json)='ARRAY'
            AND JSON_CONTAINS(cancellation.seller_ids_json,JSON_QUOTE(shipment.seller_id))=1
            AND JSON_TYPE(cancellation.original_allocations_json)='ARRAY'
            AND EXISTS(
              SELECT 1 FROM JSON_TABLE(cancellation.original_allocations_json,'$[*]'
                COLUMNS (line_id VARCHAR(191) PATH '$.id',seller_id VARCHAR(191) PATH '$.sellerId')) AS line
              WHERE BINARY line.line_id=BINARY unit.order_item_id AND BINARY line.seller_id=BINARY shipment.seller_id
            )
        ))
      )
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_unit_claim_source_mismatch'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS delivery_unit_claim_no_update BEFORE UPDATE ON order_delivery_unit_claims FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_unit_claim_history_retained'; END$$
CREATE TRIGGER IF NOT EXISTS delivery_unit_claim_no_delete BEFORE DELETE ON order_delivery_unit_claims FOR EACH ROW
BEGIN
  IF NOT EXISTS(SELECT 1 FROM refunds WHERE id=OLD.refund_id AND BINARY status='rejected')
  THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_unit_claim_history_retained'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS delivery_unit_parcel_insert BEFORE INSERT ON order_delivery_unit_parcels FOR EACH ROW
BEGIN
  IF EXISTS(
    SELECT 1 FROM order_delivery_unit_parcels WHERE order_item_id=NEW.order_item_id AND unit_ordinal=NEW.unit_ordinal
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_unit_parcel_history_retained'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM order_delivery_unit_allocations AS unit
    JOIN order_delivery_shipment_allocations AS shipment ON shipment.id=unit.shipment_id
    JOIN shipping_jobs AS job ON job.order_id=unit.order_id AND job.seller_id=shipment.seller_id
    WHERE unit.order_item_id=NEW.order_item_id AND unit.unit_ordinal=NEW.unit_ordinal AND BINARY unit.order_item_id=BINARY NEW.order_item_id
      AND job.id=NEW.shipping_job_id AND BINARY job.id=BINARY NEW.shipping_job_id AND BINARY job.direction='outbound'
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_unit_parcel_source_mismatch'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS delivery_unit_parcel_no_update BEFORE UPDATE ON order_delivery_unit_parcels FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_unit_parcel_history_retained'; END$$
CREATE TRIGGER IF NOT EXISTS delivery_unit_parcel_no_delete BEFORE DELETE ON order_delivery_unit_parcels FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_unit_parcel_history_retained'; END$$
DELIMITER ;
