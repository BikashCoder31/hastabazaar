-- Inspect exact installed definitions before each additive companion.
-- An already installed object with the reviewed definition is retained.
DELIMITER $$
BEGIN NOT ATOMIC
  IF DATABASE() IS NULL OR @@FOREIGN_KEY_CHECKS<>1 OR @@check_constraint_checks<>1 OR @@SESSION.sql_mode LIKE '%NO_BACKSLASH_ESCAPES%' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_session';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seller_dispatch_evidence') AND NOT ((SELECT SHA2(COALESCE(GROUP_CONCAT(item ORDER BY item SEPARATOR ''),''),256)
   FROM (SELECT SHA2(JSON_ARRAY('table',TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_COLLATION,CREATE_OPTIONS),256) AS item FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='seller_dispatch_evidence'
    UNION ALL SELECT SHA2(JSON_ARRAY('column',COLUMN_NAME,ORDINAL_POSITION,COLUMN_DEFAULT,IS_NULLABLE,DATA_TYPE,COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,IS_GENERATED,GENERATION_EXPRESSION,COLUMN_COMMENT),256) AS item FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='seller_dispatch_evidence'
    UNION ALL SELECT SHA2(JSON_ARRAY('index',INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,IGNORED),256) AS item FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND BINARY TABLE_NAME='seller_dispatch_evidence'
    UNION ALL SELECT SHA2(JSON_ARRAY('check',CONSTRAINT_NAME,CHECK_CLAUSE,LEVEL),256) AS item FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND BINARY TABLE_NAME='seller_dispatch_evidence'
    UNION ALL SELECT SHA2(JSON_ARRAY('fk',k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,IF(BINARY k.REFERENCED_TABLE_SCHEMA=BINARY DATABASE(),'current',k.REFERENCED_TABLE_SCHEMA),f.UPDATE_RULE,f.DELETE_RULE),256) AS item FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS f ON f.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND f.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND f.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND BINARY k.TABLE_NAME='seller_dispatch_evidence' AND k.REFERENCED_TABLE_NAME IS NOT NULL) AS metadata_rows) <=> '82b8acaa951cac296ddedd7b99791d25b85f1c53dc38e25c7a8b979634ec0fb8') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_seller_dispatch_evidence';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='seller_dispatch_evidence' AND TRIGGER_NAME NOT IN('seller_dispatch_evidence_source','seller_dispatch_evidence_immutable','seller_dispatch_evidence_retained')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_unexpected_seller_dispatch_evidence';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='seller_dispatch_evidence_source') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='seller_dispatch_evidence_source') <=> '29fc7fd116c41926c755ce8eaa314935182642a63748ca254c970c1cf2be5f8b') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_seller_dispatch_evidence_source';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='seller_dispatch_evidence_immutable') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='seller_dispatch_evidence_immutable') <=> '5f50865697c91e10cef2fad5e9b5fea2d5f5d5b6636b3176f9ab714228791362') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_seller_dispatch_evidence_immutable';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='seller_dispatch_evidence_retained') AND NOT ((SELECT SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND BINARY TRIGGER_NAME='seller_dispatch_evidence_retained') <=> '4342b3897ffc609f0aa96a32b4376ebc08fed08c44925d16226c4ad68966416d') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_seller_dispatch_evidence_retained';
  END IF;
END$$
DELIMITER ;

CREATE TABLE IF NOT EXISTS seller_dispatch_evidence (
  id VARCHAR(191) PRIMARY KEY NOT NULL,
  order_id VARCHAR(191) NOT NULL,
  order_item_id VARCHAR(191) NOT NULL,
  seller_id VARCHAR(191) NOT NULL,
  actor_id VARCHAR(191) NOT NULL,
  request_id VARCHAR(150) NOT NULL CHECK(CHAR_LENGTH(request_id) BETWEEN 8 AND 150),
  object_key VARCHAR(255) NOT NULL UNIQUE CHECK(BINARY object_key=BINARY CONCAT('private/seller-dispatch-evidence/',id)),
  mime_type VARCHAR(32) NOT NULL CHECK(BINARY mime_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes BIGINT NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
  sha256 VARCHAR(64) NOT NULL CHECK(BINARY sha256 REGEXP '^[0-9a-f]{64}$'),
  created_at BIGINT NOT NULL CHECK(created_at BETWEEN 1 AND 9007199254740991),
  CONSTRAINT seller_dispatch_evidence_order_fk FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT seller_dispatch_evidence_item_fk FOREIGN KEY (order_item_id) REFERENCES order_items(id),
  CONSTRAINT seller_dispatch_evidence_seller_fk FOREIGN KEY (seller_id) REFERENCES seller_profiles(id),
  CONSTRAINT seller_dispatch_evidence_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id),
  UNIQUE KEY seller_dispatch_evidence_request (actor_id,request_id),
  KEY seller_dispatch_evidence_item (order_item_id,created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER IF NOT EXISTS seller_dispatch_evidence_source BEFORE INSERT ON seller_dispatch_evidence FOR EACH ROW
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id JOIN users u ON u.id=s.user_id
    WHERE i.id=NEW.order_item_id AND BINARY i.id=BINARY NEW.order_item_id
      AND BINARY i.order_id=BINARY NEW.order_id AND BINARY i.seller_id=BINARY NEW.seller_id
      AND BINARY u.id=BINARY NEW.actor_id AND BINARY u.status='active' AND BINARY s.status='approved'
      AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND BINARY r.role='seller')
      AND i.fulfillment_status IN ('confirmed','packing','ready_for_pickup')
      AND NOT EXISTS(SELECT 1 FROM order_item_status_events e WHERE e.order_item_id=i.id AND e.to_status IN ('dispatched','delivered'))
      AND NOT EXISTS(SELECT 1 FROM shipping_jobs j WHERE j.order_id=i.order_id AND j.seller_id=i.seller_id
        AND j.direction='outbound' AND j.status NOT IN ('pickup_requested','label_pending','label_ready','pickup_scheduled'))
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_dispatch_evidence_source'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS seller_dispatch_evidence_immutable BEFORE UPDATE ON seller_dispatch_evidence FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_dispatch_evidence_immutable'; END$$
CREATE TRIGGER IF NOT EXISTS seller_dispatch_evidence_retained BEFORE DELETE ON seller_dispatch_evidence FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_dispatch_evidence_retained'; END$$
DELIMITER ;
