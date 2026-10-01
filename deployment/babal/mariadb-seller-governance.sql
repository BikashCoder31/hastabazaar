-- Seller-role restrictions and non-destructive deletion preflights.
CREATE TABLE IF NOT EXISTS `seller_restrictions` (
  `seller_id` VARCHAR(191) NOT NULL,
  `mode` VARCHAR(32) NOT NULL,
  `suspended_until` BIGINT NULL,
  `obligation_mode` VARCHAR(32) NOT NULL,
  `reason_code` VARCHAR(64) NOT NULL,
  `private_reason` LONGTEXT NOT NULL,
  `version` BIGINT NOT NULL DEFAULT 1,
  `applied_by` VARCHAR(191) NOT NULL,
  `applied_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`seller_id`),
  KEY `idx_seller_restrictions_mode_until` (`mode`,`suspended_until`),
  CONSTRAINT `seller_restrictions_seller_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `seller_restrictions_actor_fk` FOREIGN KEY (`applied_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `seller_restrictions_mode_check` CHECK (`mode` IN ('active','suspended','disabled')),
  CONSTRAINT `seller_restrictions_obligation_check` CHECK (`obligation_mode` IN ('allow_existing','admin_review','stop_fulfillment')),
  CONSTRAINT `seller_restrictions_until_check` CHECK ((`mode`='suspended' AND `suspended_until` IS NOT NULL) OR (`mode`<>'suspended' AND `suspended_until` IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `seller_restriction_events` (
  `id` VARCHAR(191) NOT NULL,
  `seller_id` VARCHAR(191) NOT NULL,
  `from_mode` VARCHAR(32) NOT NULL,
  `to_mode` VARCHAR(32) NOT NULL,
  `suspended_until` BIGINT NULL,
  `obligation_mode` VARCHAR(32) NOT NULL,
  `reason_code` VARCHAR(64) NOT NULL,
  `private_reason` LONGTEXT NOT NULL,
  `actor_id` VARCHAR(191) NOT NULL,
  `request_id` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_seller_restriction_events_request` (`request_id`),
  KEY `idx_seller_restriction_events_seller` (`seller_id`,`created_at`),
  CONSTRAINT `seller_restriction_events_seller_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `seller_restriction_events_actor_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `seller_deletion_preflights` (
  `id` VARCHAR(191) NOT NULL,
  `seller_id` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `outstanding_json` LONGTEXT NOT NULL,
  `retention_categories_json` LONGTEXT NOT NULL,
  `requested_by` VARCHAR(191) NOT NULL,
  `request_id` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_seller_deletion_preflight_request` (`request_id`),
  KEY `idx_seller_deletion_preflight_seller` (`seller_id`,`created_at`),
  CONSTRAINT `seller_deletion_preflight_seller_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `seller_deletion_preflight_actor_fk` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `seller_deletion_preflight_status_check` CHECK (`status` IN ('blocked','awaiting_retention_policy'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS `seller_restriction_events_no_update`;
CREATE TRIGGER `seller_restriction_events_no_update` BEFORE UPDATE ON `seller_restriction_events` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Seller restriction history is immutable';
DROP TRIGGER IF EXISTS `seller_restriction_events_no_delete`;
CREATE TRIGGER `seller_restriction_events_no_delete` BEFORE DELETE ON `seller_restriction_events` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Seller restriction history is immutable';
DROP TRIGGER IF EXISTS `seller_deletion_preflights_no_update`;
CREATE TRIGGER `seller_deletion_preflights_no_update` BEFORE UPDATE ON `seller_deletion_preflights` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Seller deletion preflights are immutable';
DROP TRIGGER IF EXISTS `seller_deletion_preflights_no_delete`;
CREATE TRIGGER `seller_deletion_preflights_no_delete` BEFORE DELETE ON `seller_deletion_preflights` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Seller deletion preflights are immutable';

-- Keep the final reservation boundary aligned with public catalogue eligibility.
-- The seller row lock serializes with restriction changes in the application transaction.
DROP TRIGGER IF EXISTS `order_items_require_available_inventory`;
DELIMITER $$
CREATE TRIGGER `order_items_require_available_inventory` BEFORE INSERT ON `order_items` FOR EACH ROW BEGIN
  DECLARE seller_state VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;
  DECLARE owner_state VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;
  DECLARE seller_id_value VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;
  DECLARE owner_id_value VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;
  DECLARE participation_route_value VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;
  DECLARE application_stage_value VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;
  DECLARE commercial_model_value VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;
  DECLARE legal_seller_value VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;
  DECLARE invoice_issuer_value VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;
  DECLARE payout_beneficiary_value VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;
  DECLARE agreement_version_value VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;
  DECLARE agreement_accepted_value BIGINT DEFAULT NULL;
  DECLARE active_restrictions BIGINT DEFAULT 0;

  IF NEW.`product_id` IS NOT NULL THEN
    SELECT `seller_id` INTO seller_id_value
      FROM `products` WHERE `id`=NEW.`product_id`;
    SELECT s.`user_id`,s.`status`,p.`participation_route`,p.`application_stage`,
      p.`commercial_model`,p.`legal_seller_reference`,p.`invoice_issuer_reference`,
      p.`payout_beneficiary_reference`,p.`managed_agreement_version`,
      p.`managed_agreement_accepted_at`
      INTO owner_id_value,seller_state,participation_route_value,application_stage_value,
        commercial_model_value,legal_seller_value,invoice_issuer_value,
        payout_beneficiary_value,agreement_version_value,agreement_accepted_value
      FROM `seller_profiles` s
      LEFT JOIN `seller_participation_profiles` p ON p.`seller_id`=s.`id`
      WHERE s.`id`=seller_id_value FOR UPDATE;
    SELECT `status` INTO owner_state FROM `users` WHERE `id`=owner_id_value FOR UPDATE;
    SELECT COUNT(*) INTO active_restrictions
      FROM `seller_restrictions` r
      WHERE r.`seller_id`=seller_id_value AND (
        r.`mode`='disabled'
        OR (r.`mode`='suspended' AND r.`suspended_until`>UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)
      );

    IF owner_state IS NULL OR owner_state<>'active' OR active_restrictions<>0 OR NOT (
      (seller_state='approved' AND (participation_route_value IS NULL OR participation_route_value='registered_seller'))
      OR (
        participation_route_value='managed_maker'
        AND application_stage_value='active'
        AND commercial_model_value IS NOT NULL
        AND legal_seller_value IS NOT NULL
        AND invoice_issuer_value IS NOT NULL
        AND payout_beneficiary_value IS NOT NULL
        AND agreement_version_value IS NOT NULL
        AND agreement_accepted_value IS NOT NULL
      )
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_unavailable';
    END IF;

    UPDATE `products` SET `inventory_quantity`=`inventory_quantity`-NEW.`quantity`
      WHERE `id`=NEW.`product_id`
        AND `seller_id`=seller_id_value
        AND `status`='published'
        AND `inventory_quantity`>=NEW.`quantity`
        AND NOT EXISTS(
          SELECT 1 FROM `product_deletions` d WHERE d.`product_id`=NEW.`product_id`
        );
    IF ROW_COUNT() <> 1 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_unavailable';
    END IF;
  END IF;
END$$
DELIMITER ;
