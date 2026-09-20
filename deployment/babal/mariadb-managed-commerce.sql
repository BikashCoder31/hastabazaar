-- Additive Managed Maker commercial snapshots and settlement records.
ALTER TABLE `seller_participation_profiles` ADD COLUMN `managed_agreement_version` VARCHAR(191) NULL;
ALTER TABLE `seller_participation_profiles` ADD COLUMN `managed_agreement_language` VARCHAR(8) NULL;
ALTER TABLE `seller_participation_profiles` ADD COLUMN `managed_agreement_accepted_at` BIGINT NULL;

CREATE TABLE IF NOT EXISTS `managed_commercial_snapshots` (
  `id` VARCHAR(191) NOT NULL,
  `order_item_id` VARCHAR(191) NOT NULL,
  `seller_id` VARCHAR(191) NOT NULL,
  `participation_route` VARCHAR(32) NOT NULL,
  `commercial_model` VARCHAR(64) NOT NULL,
  `legal_seller_reference` VARCHAR(191) NOT NULL,
  `invoice_issuer_reference` VARCHAR(191) NOT NULL,
  `payout_beneficiary_reference` VARCHAR(191) NOT NULL,
  `agreement_version` VARCHAR(191) NOT NULL,
  `agreement_language` VARCHAR(8) NOT NULL,
  `terms_setting_version_id` VARCHAR(191) NULL,
  `delivery_hold_days` BIGINT NOT NULL DEFAULT 7,
  `hold_setting_version_id` VARCHAR(191) NULL,
  `product_value_paisa` BIGINT NOT NULL,
  `maker_funded_discount_paisa` BIGINT NOT NULL DEFAULT 0,
  `platform_funded_discount_paisa` BIGINT NOT NULL DEFAULT 0,
  `eligible_base_paisa` BIGINT NOT NULL,
  `platform_retention_bps` BIGINT NOT NULL DEFAULT 0,
  `platform_retained_paisa` BIGINT NOT NULL DEFAULT 0,
  `maker_entitlement_paisa` BIGINT NOT NULL DEFAULT 0,
  `agreed_supplier_amount_paisa` BIGINT NULL,
  `simulation_label` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_managed_snapshots_order_item` (`order_item_id`),
  KEY `idx_managed_snapshots_seller_created` (`seller_id`,`created_at`),
  CONSTRAINT `managed_snapshot_route` CHECK (`participation_route`='managed_maker'),
  CONSTRAINT `managed_snapshot_money` CHECK (`platform_retained_paisa`+`maker_entitlement_paisa`=`eligible_base_paisa`),
  CONSTRAINT `managed_snapshot_fixed_no_retention` CHECK (`commercial_model`<>'managed_fixed_supplier_price_v1' OR `platform_retained_paisa`=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `managed_entitlements` (
  `id` VARCHAR(191) NOT NULL, `snapshot_id` VARCHAR(191) NOT NULL,
  `seller_id` VARCHAR(191) NOT NULL, `status` VARCHAR(32) NOT NULL,
  `calculated_paisa` BIGINT NOT NULL, `earned_at` BIGINT NULL,
  `hold_until` BIGINT NULL, `eligible_at` BIGINT NULL, `paid_at` BIGINT NULL,
  `dispute_hold_reason` LONGTEXT NULL, `dispute_review_at` BIGINT NULL,
  `version` BIGINT NOT NULL DEFAULT 1, `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL, PRIMARY KEY (`id`),
  UNIQUE KEY `idx_managed_entitlements_snapshot` (`snapshot_id`),
  KEY `idx_managed_entitlements_status` (`status`,`eligible_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `managed_settlement_entries` (
  `id` VARCHAR(191) NOT NULL, `entitlement_id` VARCHAR(191) NOT NULL,
  `refund_id` VARCHAR(191) NULL, `type` VARCHAR(32) NOT NULL,
  `amount_paisa` BIGINT NOT NULL, `base_amount_paisa` BIGINT NULL,
  `metadata_json` LONGTEXT NOT NULL, `reason_code` VARCHAR(191) NOT NULL,
  `request_id` VARCHAR(191) NOT NULL, `created_by` VARCHAR(191) NULL,
  `created_at` BIGINT NOT NULL, PRIMARY KEY (`id`),
  UNIQUE KEY `idx_managed_settlement_request` (`request_id`),
  KEY `idx_managed_settlement_entitlement` (`entitlement_id`,`created_at`),
  CONSTRAINT `managed_settlement_nonzero` CHECK (`amount_paisa`<>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `managed_payouts` (
  `id` VARCHAR(191) NOT NULL, `seller_id` VARCHAR(191) NOT NULL,
  `payout_number` VARCHAR(191) NOT NULL, `amount_paisa` BIGINT NOT NULL,
  `status` VARCHAR(32) NOT NULL, `destination_reference` VARCHAR(191) NOT NULL,
  `simulation_label` VARCHAR(191) NOT NULL, `prepared_by` VARCHAR(191) NOT NULL,
  `approved_by` VARCHAR(191) NULL, `scheduled_for` BIGINT NOT NULL,
  `provider_reference` VARCHAR(191) NULL, `request_id` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL, `updated_at` BIGINT NOT NULL, `paid_at` BIGINT NULL,
  PRIMARY KEY (`id`), UNIQUE KEY `idx_managed_payouts_number` (`payout_number`),
  UNIQUE KEY `idx_managed_payouts_request` (`request_id`),
  KEY `idx_managed_payouts_status` (`status`,`scheduled_for`),
  CONSTRAINT `managed_payout_positive` CHECK (`amount_paisa`>0),
  CONSTRAINT `managed_payout_maker_checker` CHECK (`approved_by` IS NULL OR `approved_by`<>`prepared_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `managed_payout_entries` (
  `payout_id` VARCHAR(191) NOT NULL, `settlement_entry_id` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`payout_id`,`settlement_entry_id`),
  UNIQUE KEY `idx_managed_payout_entry_unique` (`settlement_entry_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `managed_invoice_groups` (
  `id` VARCHAR(191) NOT NULL, `order_id` VARCHAR(191) NOT NULL,
  `issuer_reference` VARCHAR(191) NOT NULL, `invoice_number` VARCHAR(191) NOT NULL,
  `snapshot_json` LONGTEXT NOT NULL, `barcode_payload` LONGTEXT NOT NULL,
  `qr_payload` LONGTEXT NOT NULL, `simulation_label` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'issued', `request_id` VARCHAR(191) NOT NULL,
  `issued_at` BIGINT NOT NULL, `voided_at` BIGINT NULL, PRIMARY KEY (`id`),
  UNIQUE KEY `idx_managed_invoice_number` (`invoice_number`),
  UNIQUE KEY `idx_managed_invoice_request` (`request_id`),
  UNIQUE KEY `idx_managed_invoice_order_issuer` (`order_id`,`issuer_reference`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `managed_commercial_snapshots` ADD CONSTRAINT `managed_snapshots_order_item_fk` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_commercial_snapshots` ADD CONSTRAINT `managed_snapshots_seller_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_entitlements` ADD CONSTRAINT `managed_entitlements_snapshot_fk` FOREIGN KEY (`snapshot_id`) REFERENCES `managed_commercial_snapshots` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_entitlements` ADD CONSTRAINT `managed_entitlements_seller_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_settlement_entries` ADD CONSTRAINT `managed_settlement_entitlement_fk` FOREIGN KEY (`entitlement_id`) REFERENCES `managed_entitlements` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_settlement_entries` ADD CONSTRAINT `managed_settlement_refund_fk` FOREIGN KEY (`refund_id`) REFERENCES `refunds` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_settlement_entries` ADD CONSTRAINT `managed_settlement_user_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `managed_payouts` ADD CONSTRAINT `managed_payouts_seller_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_payouts` ADD CONSTRAINT `managed_payouts_preparer_fk` FOREIGN KEY (`prepared_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_payouts` ADD CONSTRAINT `managed_payouts_approver_fk` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_payout_entries` ADD CONSTRAINT `managed_payout_entries_payout_fk` FOREIGN KEY (`payout_id`) REFERENCES `managed_payouts` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_payout_entries` ADD CONSTRAINT `managed_payout_entries_settlement_fk` FOREIGN KEY (`settlement_entry_id`) REFERENCES `managed_settlement_entries` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_invoice_groups` ADD CONSTRAINT `managed_invoice_order_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT;
