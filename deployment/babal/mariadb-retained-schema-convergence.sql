-- Bring the retained staging layout to the reviewed input for positions 140–141.
-- Pause writers. Each table ALTER and trigger replacement is independent DDL.
-- An already-canonical database takes the same preflight and performs no DDL.
DELIMITER $$
BEGIN NOT ATOMIC
 DECLARE orders_columns, return_columns, notification_columns CHAR(64);
 DECLARE orders_triggers, payout_triggers, retirement_triggers, notification_triggers, loyalty_triggers CHAR(64);
 DECLARE insert_order, update_order, after_update_order, payout_order TEXT;
 DECLARE fix_insert, fix_update, fix_after_update, fix_payout, fix_retirement, old_guest_check BOOLEAN DEFAULT FALSE;
 DECLARE fix_loyalty BOOLEAN DEFAULT FALSE;
 DECLARE saved_mode TEXT DEFAULT @@SESSION.sql_mode;
 DECLARE saved_client VARCHAR(64) DEFAULT @@SESSION.character_set_client;
 DECLARE saved_collation VARCHAR(64) DEFAULT @@SESSION.collation_connection;
 DECLARE saved_concat BIGINT UNSIGNED DEFAULT @@SESSION.group_concat_max_len;
 DECLARE finished BOOLEAN DEFAULT FALSE;
 DECLARE name_to_recreate, trigger_table VARCHAR(64);
 DECLARE trigger_event, trigger_timing VARCHAR(8);
 DECLARE trigger_body LONGTEXT;
 DECLARE trigger_definer, trigger_mode TEXT;
 DECLARE trigger_client, trigger_collation VARCHAR(64);
 DECLARE statement_sql LONGTEXT;

 -- CREATE OR REPLACE without FOLLOWS/PRECEDES appends to the timing/event group.
 -- Reinstall only the changed groups, in the reviewed order. Names and bodies
 -- are checked below before the cursor can execute any of them.
 DECLARE changes CURSOR FOR
  SELECT t.TRIGGER_NAME,t.EVENT_OBJECT_TABLE,t.EVENT_MANIPULATION,t.ACTION_TIMING,
         t.ACTION_STATEMENT,t.DEFINER,t.SQL_MODE,t.CHARACTER_SET_CLIENT,t.COLLATION_CONNECTION
  FROM information_schema.TRIGGERS t
  JOIN JSON_TABLE(
   '["orders_promo_insert_guard","first_cod_orders_insert","orders_promo_update_guard","orders_promo_original_immutable","orders_preserve_customer_service_fee","first_cod_orders_update","manual_order_payment_source","clear_closed_delivery_location","invalidate_delivery_otp_after_destination_change","close_cancelled_order_parcels","wallet_cancel_restore","queue_order_email_update","managed_payout_preserve_identity","managed_payout_preserve_terminal","managed_payouts_single_sa_update","managed_actual_execution_packet","managed_live_instruction_retained","recovery_retired_managed","managed_payouts_kind_update","managed_actual_live_instruction_retained","recovery_retirement_original_proof","loyalty_redemption_guard"]',
   '$[*]' COLUMNS (position_number FOR ORDINALITY, name VARCHAR(64) PATH '$')
  ) AS reviewed ON BINARY reviewed.name=BINARY t.TRIGGER_NAME
  WHERE t.TRIGGER_SCHEMA=DATABASE() AND (
   (fix_insert AND t.EVENT_OBJECT_TABLE='orders' AND t.ACTION_TIMING='BEFORE' AND t.EVENT_MANIPULATION='INSERT') OR
   (fix_update AND t.EVENT_OBJECT_TABLE='orders' AND t.ACTION_TIMING='BEFORE' AND t.EVENT_MANIPULATION='UPDATE') OR
   (fix_after_update AND t.EVENT_OBJECT_TABLE='orders' AND t.ACTION_TIMING='AFTER' AND t.EVENT_MANIPULATION='UPDATE') OR
   (fix_payout AND t.EVENT_OBJECT_TABLE='managed_payouts' AND t.ACTION_TIMING='BEFORE' AND t.EVENT_MANIPULATION='UPDATE') OR
   (fix_retirement AND t.TRIGGER_NAME='recovery_retirement_original_proof') OR
   (fix_loyalty AND t.TRIGGER_NAME='loyalty_redemption_guard')
  )
  ORDER BY reviewed.position_number;
 DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished=TRUE;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION
 BEGIN
  SET SESSION sql_mode=saved_mode, character_set_client=saved_client,
      collation_connection=saved_collation, group_concat_max_len=saved_concat;
  RESIGNAL;
 END;

 IF DATABASE() IS NULL OR @@FOREIGN_KEY_CHECKS<>1 OR @@check_constraint_checks<>1
    OR saved_mode LIKE '%NO_BACKSLASH_ESCAPES%'
    OR (saved_mode NOT LIKE '%STRICT_TRANS_TABLES%' AND saved_mode NOT LIKE '%STRICT_ALL_TABLES%') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retained_schema_session_state';
 END IF;
 SET SESSION group_concat_max_len=GREATEST(saved_concat,16384);

 -- Signatures record all column definitions and ordinals for the three tables.
 -- The two accepted versions are the restored 23 November staging database
 -- after position 138 and the canonical input to position 140.
 SELECT MAX(IF(TABLE_NAME='orders',signature,NULL)),
        MAX(IF(TABLE_NAME='return_requests',signature,NULL)),
        MAX(IF(TABLE_NAME='notification_messages',signature,NULL))
 INTO orders_columns,return_columns,notification_columns
 FROM (
  SELECT TABLE_NAME,SHA2(GROUP_CONCAT(SHA2(JSON_ARRAY(COLUMN_NAME,ORDINAL_POSITION,COLUMN_DEFAULT,
    IS_NULLABLE,DATA_TYPE,COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,IS_GENERATED,
    GENERATION_EXPRESSION,COLUMN_COMMENT),256) ORDER BY ORDINAL_POSITION SEPARATOR ''),256) AS signature
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('orders','return_requests','notification_messages')
  GROUP BY TABLE_NAME
 ) AS definitions;
 IF orders_columns IS NULL OR orders_columns NOT IN (
   '7236cf555f864a15587015daa1f0fc3fc3f6446241ec7c00b2977444251e312a',
   '860821d81290ad9cdbec5ba30dbc402448d3de373897e30f495de30d4b8bc96d') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retained_schema_orders_columns';
 END IF;
 IF return_columns IS NULL OR return_columns NOT IN (
   '23c93a4623383d2d6762e5897ab7a8d6cf0ffc6ab70eeca91ee5f4a758140c61',
   '31510a8e1b972450546a16243836d3ca1d90fb7f2a059bf89e5f0a11316f3ac0') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retained_schema_return_columns';
 END IF;
 IF notification_columns IS NULL OR notification_columns NOT IN (
   '328b6a8d61514289171881b781dd8a88a471a5f88a8d16fb7c45f3b0fc605a91',
   'd4a8f0c8c08ae4ba0b01e2e0ecac04a8f73ffb47ebc0a593f3936a9234594df8') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retained_schema_notification_columns';
 END IF;

 -- Validate the full set of trigger names, tables, timing, events and bodies.
 -- Check action order separately so an interrupted reorder can be replayed.
 SELECT MAX(IF(EVENT_OBJECT_TABLE='orders',signature,NULL)),
        MAX(IF(EVENT_OBJECT_TABLE='managed_payouts',signature,NULL)),
        MAX(IF(EVENT_OBJECT_TABLE='seller_recovery_payout_retirements',signature,NULL)),
        MAX(IF(EVENT_OBJECT_TABLE='notification_messages',signature,NULL)),
        MAX(IF(EVENT_OBJECT_TABLE='loyalty_redemptions',signature,NULL))
 INTO orders_triggers,payout_triggers,retirement_triggers,notification_triggers,loyalty_triggers
 FROM (
  SELECT EVENT_OBJECT_TABLE,SHA2(GROUP_CONCAT(SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,
    ACTION_TIMING,EVENT_MANIPULATION,ACTION_STATEMENT),256) ORDER BY BINARY TRIGGER_NAME SEPARATOR ''),256) AS signature
  FROM information_schema.TRIGGERS
  WHERE TRIGGER_SCHEMA=DATABASE()
    AND EVENT_OBJECT_TABLE IN ('orders','managed_payouts','seller_recovery_payout_retirements','notification_messages','loyalty_redemptions')
  GROUP BY EVENT_OBJECT_TABLE
 ) AS definitions;
 IF NOT (orders_triggers <=> '46e5b6cdbcecfc27de4d9cfaa8ce97de3970521e5ac3d4eb239ea764f341b4d3')
    OR NOT (payout_triggers <=> '1e1a4461ac630a12a30374e097f98e251cad12c32a7df59f6fec4336f19e5221')
    OR NOT (notification_triggers <=> 'd4e622829e8a466b4237680cae5cd58ad0beb913149e4da9c0a93d9082a18afd')
    OR retirement_triggers IS NULL OR retirement_triggers NOT IN (
       '11c5b9c0fd26fd0c2a3969585f366686bbd1bf200f78af4f2e570ef0c1072276',
       '0c56b9dad19f1f8b8e8c60e6c9f29d1d3145b9837d41a82db0a75cde3d2fed5c') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retained_schema_trigger_definitions';
 END IF;
 SET fix_retirement=retirement_triggers='11c5b9c0fd26fd0c2a3969585f366686bbd1bf200f78af4f2e570ef0c1072276';
 IF loyalty_triggers IS NULL OR loyalty_triggers NOT IN (
   '7bd1d4801db8119399551bb05b9cd78032a31fcc73683d376c4e404c872447a8',
   '95ae111ffee32c169489e08513e51d35a188c39dd21128b9d48bc17125b9326c') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retained_schema_loyalty_trigger_definitions';
 END IF;
 SET fix_loyalty=loyalty_triggers='7bd1d4801db8119399551bb05b9cd78032a31fcc73683d376c4e404c872447a8';

 SELECT GROUP_CONCAT(IF(ACTION_TIMING='BEFORE' AND EVENT_MANIPULATION='INSERT',TRIGGER_NAME,NULL)
             ORDER BY ACTION_ORDER SEPARATOR ','),
        GROUP_CONCAT(IF(ACTION_TIMING='BEFORE' AND EVENT_MANIPULATION='UPDATE',TRIGGER_NAME,NULL)
             ORDER BY ACTION_ORDER SEPARATOR ','),
        GROUP_CONCAT(IF(ACTION_TIMING='AFTER' AND EVENT_MANIPULATION='UPDATE',TRIGGER_NAME,NULL)
             ORDER BY ACTION_ORDER SEPARATOR ',')
 INTO insert_order,update_order,after_update_order
 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='orders';
 SELECT GROUP_CONCAT(TRIGGER_NAME ORDER BY ACTION_ORDER SEPARATOR ',') INTO payout_order
 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='managed_payouts'
  AND ACTION_TIMING='BEFORE' AND EVENT_MANIPULATION='UPDATE';
 SET fix_insert=BINARY insert_order<>BINARY 'orders_promo_insert_guard,first_cod_orders_insert';
 SET fix_update=BINARY update_order<>BINARY 'orders_promo_update_guard,orders_promo_original_immutable,orders_preserve_customer_service_fee,first_cod_orders_update,manual_order_payment_source';
 SET fix_after_update=BINARY after_update_order<>BINARY 'clear_closed_delivery_location,invalidate_delivery_otp_after_destination_change,close_cancelled_order_parcels,wallet_cancel_restore,queue_order_email_update';
 SET fix_payout=BINARY payout_order<>BINARY 'managed_payout_preserve_identity,managed_payout_preserve_terminal,managed_payouts_single_sa_update,managed_actual_execution_packet,managed_live_instruction_retained,recovery_retired_managed,managed_payouts_kind_update,managed_actual_live_instruction_retained';

 SET old_guest_check=EXISTS(SELECT 1 FROM information_schema.CHECK_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='notification_messages'
      AND CONSTRAINT_NAME='chk_notification_guest_shape');
 IF old_guest_check AND NOT EXISTS(SELECT 1 FROM information_schema.CHECK_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='notification_messages'
      AND CONSTRAINT_NAME='chk_notification_guest_shape' AND LEVEL='Table'
      AND BINARY CHECK_CLAUSE=BINARY '`recipient_user_id` is not null or `audience_role` = ''customer'' and `channel` = ''email'' and `guest_email` is not null and `guest_order_id` is not null and `business_event_key` is not null') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retained_schema_guest_check_definition';
 END IF;

 -- The new LONGTEXT columns use the existing character set and collation.
 -- Check the byte capacity of each conversion before touching any table.
 IF EXISTS(SELECT 1 FROM notification_messages WHERE OCTET_LENGTH(business_event_key)>4294967295)
    OR EXISTS(SELECT 1 FROM notification_messages WHERE OCTET_LENGTH(required_permission)>4294967295)
    OR EXISTS(SELECT 1 FROM notification_messages WHERE OCTET_LENGTH(delivery_claim_token)>4294967295)
    OR EXISTS(SELECT 1 FROM notification_messages WHERE OCTET_LENGTH(guest_email)>4294967295)
    OR EXISTS(SELECT 1 FROM notification_messages WHERE OCTET_LENGTH(guest_order_id)>4294967295) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retained_schema_notification_value_too_large';
 END IF;
 IF EXISTS(SELECT 1 FROM notification_messages WHERE (recipient_user_id IS NOT NULL OR
     (BINARY audience_role=BINARY 'customer' AND BINARY channel=BINARY 'email' AND
      guest_email IS NOT NULL AND guest_order_id IS NOT NULL AND business_event_key IS NOT NULL)) IS FALSE) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retained_schema_notification_recipient_rows';
 END IF;

 -- Check that each existing definer can be preserved before any DDL is sent.
 OPEN changes;
 read_definers: LOOP
  FETCH changes INTO name_to_recreate,trigger_table,trigger_event,trigger_timing,trigger_body,
                      trigger_definer,trigger_mode,trigger_client,trigger_collation;
  IF finished THEN LEAVE read_definers; END IF;
  IF trigger_definer IS NULL OR trigger_definer NOT REGEXP '^[a-zA-Z0-9_]+@[a-zA-Z0-9_.:%-]+$'
     OR trigger_mode LIKE '%NO_BACKSLASH_ESCAPES%'
     OR trigger_client IS NULL OR trigger_collation IS NULL THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retained_schema_trigger_context';
  END IF;
  IF BINARY trigger_definer<>BINARY CURRENT_USER() AND NOT EXISTS (
   SELECT 1 FROM information_schema.USER_PRIVILEGES
   WHERE GRANTEE=CONCAT(QUOTE(SUBSTRING_INDEX(CURRENT_USER(),'@',1)),'@',QUOTE(SUBSTRING_INDEX(CURRENT_USER(),'@',-1)))
    AND PRIVILEGE_TYPE IN ('SUPER','SET USER')) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retained_schema_trigger_definer_privilege';
  END IF;
 END LOOP;
 CLOSE changes;
 SET finished=FALSE;

 IF orders_columns='7236cf555f864a15587015daa1f0fc3fc3f6446241ec7c00b2977444251e312a' THEN
  ALTER TABLE orders MODIFY COLUMN cancellation_version BIGINT NOT NULL DEFAULT 0 AFTER current_referral_discount_paisa;
 END IF;
 IF return_columns='23c93a4623383d2d6762e5897ab7a8d6cf0ffc6ab70eeca91ee5f4a758140c61' THEN
  ALTER TABLE return_requests MODIFY COLUMN original_seal_intact BIGINT NOT NULL DEFAULT 0 AFTER delivered_at_snapshot;
 END IF;
 IF notification_columns='328b6a8d61514289171881b781dd8a88a471a5f88a8d16fb7c45f3b0fc605a91' THEN
  ALTER TABLE notification_messages
   MODIFY COLUMN business_event_key LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER delivery_transport,
   MODIFY COLUMN required_permission LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER business_event_key,
   MODIFY COLUMN delivery_attempts BIGINT NOT NULL DEFAULT 0 AFTER required_permission,
   MODIFY COLUMN delivery_next_attempt_at BIGINT NOT NULL DEFAULT 0 AFTER delivery_attempts,
   MODIFY COLUMN delivery_lease_until BIGINT NOT NULL DEFAULT 0 AFTER delivery_next_attempt_at,
   MODIFY COLUMN delivery_claim_token LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER delivery_lease_until,
   MODIFY COLUMN guest_email LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER delivery_claim_token,
   MODIFY COLUMN guest_order_id LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER guest_email;
 END IF;
 IF old_guest_check THEN
  -- Both exact binary recipient triggers from position 131 have been checked.
  -- Position 140 installs the canonical CHECK after this old one is removed.
  ALTER TABLE notification_messages DROP CONSTRAINT chk_notification_guest_shape;
 END IF;

 OPEN changes;
 reorder: LOOP
  FETCH changes INTO name_to_recreate,trigger_table,trigger_event,trigger_timing,trigger_body,
                     trigger_definer,trigger_mode,trigger_client,trigger_collation;
  IF finished THEN LEAVE reorder; END IF;
  IF name_to_recreate='recovery_retirement_original_proof' THEN
   -- The retained body differs only by trailing spaces on individual lines.
   SET trigger_body=REGEXP_REPLACE(trigger_body,CONCAT('[',CHAR(32),CHAR(9),']+(?=',CHAR(10),'|$)'),'');
   IF SHA2(trigger_body,256)<>'c6fbe9dda961ed15f36758519aeea5e166b4c7533f250e9dfe20d39357fc6dc1' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retained_schema_retirement_body';
   END IF;
  ELSEIF name_to_recreate='loyalty_redemption_guard' THEN
   -- Restore the exact reviewed comment immediately above the integer bound.
   SET trigger_body=REPLACE(trigger_body,CONCAT(CHAR(10),' ',CHAR(10),' AND NEW.points DIV'),
     CONCAT(CHAR(10),' -- Division bounds the integer product before evaluating it; no floating-point financial conversion.',
       CHAR(10),' AND NEW.points DIV'));
   IF SHA2(trigger_body,256)<>'29daff6466b5ad5dd7c5a05e55037cf88d049c4ae7dab678a7b2cea400a61f23' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retained_schema_loyalty_body';
   END IF;
  END IF;
  SET SESSION sql_mode=trigger_mode, character_set_client=trigger_client, collation_connection=trigger_collation;
  SET statement_sql=CONCAT('CREATE OR REPLACE DEFINER=',QUOTE(SUBSTRING_INDEX(trigger_definer,'@',1)),
     '@',QUOTE(SUBSTRING_INDEX(trigger_definer,'@',-1)),' TRIGGER `',name_to_recreate,'` ',trigger_timing,' ',trigger_event,
     ' ON `',trigger_table,'` FOR EACH ROW ',trigger_body);
  EXECUTE IMMEDIATE statement_sql;
  SET SESSION sql_mode=saved_mode, character_set_client=saved_client, collation_connection=saved_collation;
 END LOOP;
 CLOSE changes;
 SET SESSION group_concat_max_len=saved_concat;
END$$
DELIMITER ;
