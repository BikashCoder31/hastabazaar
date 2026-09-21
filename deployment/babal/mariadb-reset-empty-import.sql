-- RECOVERY ONLY: clears the failed partial import in an otherwise empty database.
-- Do not use this file after real users, products, orders, or uploads exist.
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `managed_invoice_adjustments`;
DROP TABLE IF EXISTS `traffic_events`;
DROP TABLE IF EXISTS `traffic_sessions`;
DROP TABLE IF EXISTS `seller_deletion_preflights`;
DROP TABLE IF EXISTS `seller_restriction_events`;
DROP TABLE IF EXISTS `seller_restrictions`;
DROP TABLE IF EXISTS `managed_invoice_groups`;
DROP TABLE IF EXISTS `managed_payout_entries`;
DROP TABLE IF EXISTS `managed_payouts`;
DROP TABLE IF EXISTS `managed_settlement_entries`;
DROP TABLE IF EXISTS `managed_entitlements`;
DROP TABLE IF EXISTS `managed_commercial_snapshots`;
DROP TABLE IF EXISTS `seller_profile_media`;
DROP TABLE IF EXISTS `seller_operational_addresses`;
DROP TABLE IF EXISTS `seller_participation_guards`;
DROP TABLE IF EXISTS `seller_participation_profiles`;
DROP TABLE IF EXISTS `business_setting_guards`;
DROP TABLE IF EXISTS `business_setting_versions`;
DROP TABLE IF EXISTS `email_login_challenges`;
DROP TABLE IF EXISTS `user_sessions`;
DROP TABLE IF EXISTS `user_credentials`;
DROP TABLE IF EXISTS `hastabazaar_schema_versions`;
DROP TABLE IF EXISTS `wishlist_items`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `user_roles`;
DROP TABLE IF EXISTS `staff_invitations`;
DROP TABLE IF EXISTS `shipping_jobs`;
DROP TABLE IF EXISTS `shipping_job_events`;
DROP TABLE IF EXISTS `shipments`;
DROP TABLE IF EXISTS `shipment_events`;
DROP TABLE IF EXISTS `seller_profiles`;
DROP TABLE IF EXISTS `seller_ledger_entries`;
DROP TABLE IF EXISTS `seller_documents`;
DROP TABLE IF EXISTS `return_requests`;
DROP TABLE IF EXISTS `return_request_events`;
DROP TABLE IF EXISTS `return_outcomes`;
DROP TABLE IF EXISTS `return_evidence`;
DROP TABLE IF EXISTS `request_rate_limits`;
DROP TABLE IF EXISTS `refunds`;
DROP TABLE IF EXISTS `refund_liability_entries`;
DROP TABLE IF EXISTS `promotions`;
DROP TABLE IF EXISTS `promotion_products`;
DROP TABLE IF EXISTS `prohibited_product_rules`;
DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `product_reviews`;
DROP TABLE IF EXISTS `product_occasions`;
DROP TABLE IF EXISTS `product_media`;
DROP TABLE IF EXISTS `policy_versions`;
DROP TABLE IF EXISTS `payouts`;
DROP TABLE IF EXISTS `payout_requests`;
DROP TABLE IF EXISTS `payout_events`;
DROP TABLE IF EXISTS `payout_entries`;
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `order_status_events`;
DROP TABLE IF EXISTS `order_policy_acceptances`;
DROP TABLE IF EXISTS `order_items`;
DROP TABLE IF EXISTS `order_item_status_events`;
DROP TABLE IF EXISTS `order_documents`;
DROP TABLE IF EXISTS `operational_incidents`;
DROP TABLE IF EXISTS `occasions`;
DROP TABLE IF EXISTS `notification_messages`;
DROP TABLE IF EXISTS `moderation_events`;
DROP TABLE IF EXISTS `inventory_adjustments`;
DROP TABLE IF EXISTS `data_rights_requests`;
DROP TABLE IF EXISTS `data_rights_events`;
DROP TABLE IF EXISTS `complaints`;
DROP TABLE IF EXISTS `complaint_events`;
DROP TABLE IF EXISTS `categories`;
DROP TABLE IF EXISTS `carts`;
DROP TABLE IF EXISTS `cart_items`;
DROP TABLE IF EXISTS `backup_verifications`;
DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `addresses`;

-- Hatsabazaar production schema for MariaDB 10.11+
-- Generated from drizzle/meta/0020_snapshot.json. Import into an empty database.
SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `addresses` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `label` LONGTEXT NOT NULL,
  `recipient_name` LONGTEXT NOT NULL,
  `phone` LONGTEXT NOT NULL,
  `province` LONGTEXT NOT NULL,
  `district` LONGTEXT NOT NULL,
  `municipality` LONGTEXT NOT NULL,
  `ward` LONGTEXT NULL,
  `locality` LONGTEXT NOT NULL,
  `landmark` LONGTEXT NULL,
  `postal_code` LONGTEXT NULL,
  `is_default` BIGINT NOT NULL DEFAULT 0,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_addresses_user_default` (`user_id`, `is_default`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` VARCHAR(191) NOT NULL,
  `actor_id` VARCHAR(191) NULL,
  `action` LONGTEXT NOT NULL,
  `subject_type` VARCHAR(191) NOT NULL,
  `subject_id` VARCHAR(191) NULL,
  `reason` LONGTEXT NULL,
  `previous_json` LONGTEXT NULL,
  `next_json` LONGTEXT NULL,
  `request_id` LONGTEXT NULL,
  `ip_hash` LONGTEXT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_subject` (`subject_type`, `subject_id`, `created_at`),
  KEY `idx_audit_logs_actor` (`actor_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `backup_verifications` (
  `id` VARCHAR(191) NOT NULL,
  `scope` LONGTEXT NOT NULL,
  `status` LONGTEXT NOT NULL,
  `evidence_reference` LONGTEXT NOT NULL,
  `note` LONGTEXT NOT NULL,
  `verified_by` VARCHAR(191) NOT NULL,
  `request_id` VARCHAR(191) NOT NULL,
  `verified_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_backup_verifications_request_unique` (`request_id`),
  KEY `idx_backup_verifications_verified_at` (`verified_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cart_items` (
  `id` VARCHAR(191) NOT NULL,
  `cart_id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `quantity` BIGINT NOT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_cart_items_cart_product_unique` (`cart_id`, `product_id`),
  CONSTRAINT `cart_items_quantity_positive` CHECK (`quantity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `carts` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NULL,
  `anonymous_token_hash` VARCHAR(191) NULL,
  `currency` LONGTEXT NOT NULL DEFAULT 'NPR',
  `expires_at` BIGINT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_carts_user_unique` (`user_id`),
  UNIQUE KEY `idx_carts_anonymous_token_unique` (`anonymous_token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `categories` (
  `id` VARCHAR(191) NOT NULL,
  `parent_id` VARCHAR(191) NULL,
  `slug` VARCHAR(191) NOT NULL,
  `name_en` LONGTEXT NOT NULL,
  `name_ne` LONGTEXT NULL,
  `is_active` BIGINT NOT NULL DEFAULT 1,
  `sort_order` BIGINT NOT NULL DEFAULT 0,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_categories_slug_unique` (`slug`),
  KEY `idx_categories_parent_sort` (`parent_id`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `complaint_events` (
  `id` VARCHAR(191) NOT NULL,
  `complaint_id` VARCHAR(191) NOT NULL,
  `from_status` LONGTEXT NULL,
  `to_status` LONGTEXT NOT NULL,
  `action` LONGTEXT NOT NULL,
  `actor_id` VARCHAR(191) NULL,
  `actor_type` LONGTEXT NOT NULL,
  `public_message_en` LONGTEXT NOT NULL,
  `public_message_ne` LONGTEXT NOT NULL,
  `internal_note` LONGTEXT NULL,
  `request_id` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_complaint_events_case_created` (`complaint_id`, `created_at`),
  UNIQUE KEY `idx_complaint_events_request_id_unique` (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `complaints` (
  `id` VARCHAR(191) NOT NULL,
  `reference_number` VARCHAR(191) NOT NULL,
  `customer_id` VARCHAR(191) NULL,
  `order_id` VARCHAR(191) NULL,
  `order_item_id` VARCHAR(191) NULL,
  `seller_id` VARCHAR(191) NULL,
  `category` LONGTEXT NOT NULL,
  `subject` LONGTEXT NOT NULL,
  `detail` LONGTEXT NOT NULL,
  `locale` LONGTEXT NOT NULL DEFAULT 'en-NP',
  `priority` LONGTEXT NOT NULL DEFAULT 'normal',
  `status` VARCHAR(191) NOT NULL,
  `assigned_to` VARCHAR(191) NULL,
  `resolution` LONGTEXT NULL,
  `resolution_ne` LONGTEXT NULL,
  `seller_response` LONGTEXT NULL,
  `seller_responded_by` VARCHAR(191) NULL,
  `seller_responded_at` BIGINT NULL,
  `escalation_reason` LONGTEXT NULL,
  `escalated_to` VARCHAR(191) NULL,
  `assigned_at` BIGINT NULL,
  `created_request_id` VARCHAR(191) NULL,
  `operation_request_id` LONGTEXT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  `resolved_at` BIGINT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_complaints_reference_unique` (`reference_number`),
  UNIQUE KEY `idx_complaints_created_request_unique` (`created_request_id`),
  KEY `idx_complaints_queue` (`status`, `created_at`),
  KEY `idx_complaints_order` (`order_id`),
  KEY `idx_complaints_seller_queue` (`seller_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_rights_events` (
  `id` VARCHAR(191) NOT NULL,
  `data_rights_request_id` VARCHAR(191) NOT NULL,
  `from_status` LONGTEXT NULL,
  `to_status` LONGTEXT NOT NULL,
  `action` LONGTEXT NOT NULL,
  `actor_id` VARCHAR(191) NOT NULL,
  `actor_role` LONGTEXT NOT NULL,
  `note` LONGTEXT NOT NULL,
  `operation_request_id` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_data_rights_events_operation_unique` (`operation_request_id`),
  KEY `idx_data_rights_events_request_created` (`data_rights_request_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_rights_requests` (
  `id` VARCHAR(191) NOT NULL,
  `reference_number` VARCHAR(191) NOT NULL,
  `customer_id` VARCHAR(191) NOT NULL,
  `request_type` LONGTEXT NOT NULL,
  `detail` LONGTEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'submitted',
  `assigned_to` VARCHAR(191) NULL,
  `resolution` LONGTEXT NULL,
  `created_request_id` VARCHAR(191) NOT NULL,
  `operation_request_id` LONGTEXT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  `completed_at` BIGINT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_data_rights_reference_unique` (`reference_number`),
  UNIQUE KEY `idx_data_rights_created_request_unique` (`created_request_id`),
  KEY `idx_data_rights_queue` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory_adjustments` (
  `id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `seller_id` VARCHAR(191) NOT NULL,
  `actor_id` VARCHAR(191) NOT NULL,
  `previous_quantity` BIGINT NOT NULL,
  `next_quantity` BIGINT NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_inventory_adjustments_product_created` (`product_id`, `created_at`),
  KEY `idx_inventory_adjustments_seller_created` (`seller_id`, `created_at`),
  CONSTRAINT `inventory_adjustments_quantities_non_negative` CHECK (`previous_quantity` >= 0 AND `next_quantity` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `moderation_events` (
  `id` VARCHAR(191) NOT NULL,
  `subject_type` VARCHAR(191) NOT NULL,
  `subject_id` VARCHAR(191) NOT NULL,
  `from_status` LONGTEXT NOT NULL,
  `to_status` LONGTEXT NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `actor_id` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_moderation_events_subject` (`subject_type`, `subject_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notification_messages` (
  `id` VARCHAR(191) NOT NULL,
  `recipient_user_id` VARCHAR(191) NOT NULL,
  `audience_role` LONGTEXT NOT NULL,
  `channel` VARCHAR(191) NOT NULL,
  `template_key` LONGTEXT NOT NULL,
  `subject_en` LONGTEXT NOT NULL,
  `subject_ne` LONGTEXT NOT NULL,
  `body_en` LONGTEXT NOT NULL,
  `body_ne` LONGTEXT NOT NULL,
  `related_type` LONGTEXT NULL,
  `related_id` LONGTEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'queued',
  `provider_reference` LONGTEXT NULL,
  `failure_reason` LONGTEXT NULL,
  `request_id` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  `sent_at` BIGINT NULL,
  `read_at` BIGINT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_notification_messages_request_unique` (`request_id`),
  KEY `idx_notification_messages_recipient_created` (`recipient_user_id`, `created_at`),
  KEY `idx_notification_messages_delivery_queue` (`channel`, `status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `occasions` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `name_en` LONGTEXT NOT NULL,
  `name_ne` LONGTEXT NULL,
  `is_active` BIGINT NOT NULL DEFAULT 1,
  `sort_order` BIGINT NOT NULL DEFAULT 0,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_occasions_slug_unique` (`slug`),
  KEY `idx_occasions_active_sort` (`is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `operational_incidents` (
  `id` VARCHAR(191) NOT NULL,
  `reference_number` VARCHAR(191) NOT NULL,
  `severity` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `title` LONGTEXT NOT NULL,
  `detail` LONGTEXT NOT NULL,
  `resolution` LONGTEXT NULL,
  `owner_id` VARCHAR(191) NOT NULL,
  `request_id` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  `resolved_at` BIGINT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_operational_incidents_reference_unique` (`reference_number`),
  UNIQUE KEY `idx_operational_incidents_request_unique` (`request_id`),
  KEY `idx_operational_incidents_status_severity` (`status`, `severity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_documents` (
  `id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `document_number` VARCHAR(191) NOT NULL,
  `snapshot_json` LONGTEXT NOT NULL,
  `status` LONGTEXT NOT NULL DEFAULT 'issued',
  `request_id` VARCHAR(191) NOT NULL,
  `issued_at` BIGINT NOT NULL,
  `voided_at` BIGINT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_order_documents_number_unique` (`document_number`),
  UNIQUE KEY `idx_order_documents_request_unique` (`request_id`),
  UNIQUE KEY `idx_order_documents_order_kind_unique` (`order_id`, `kind`),
  KEY `idx_order_documents_order_issued` (`order_id`, `issued_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_item_status_events` (
  `id` VARCHAR(191) NOT NULL,
  `order_item_id` VARCHAR(191) NOT NULL,
  `from_status` LONGTEXT NOT NULL,
  `to_status` LONGTEXT NOT NULL,
  `note` LONGTEXT NOT NULL,
  `actor_id` VARCHAR(191) NULL,
  `request_id` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_order_item_status_events_item_created` (`order_item_id`, `created_at`),
  UNIQUE KEY `idx_order_item_status_events_request_item_unique` (`request_id`, `order_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_items` (
  `id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NULL,
  `seller_id` VARCHAR(191) NOT NULL,
  `seller_name_snapshot` LONGTEXT NOT NULL,
  `product_name_snapshot` LONGTEXT NOT NULL,
  `sku_snapshot` LONGTEXT NOT NULL,
  `unit_price_paisa` BIGINT NOT NULL,
  `quantity` BIGINT NOT NULL,
  `seller_discount_paisa` BIGINT NOT NULL DEFAULT 0,
  `commission_bps` BIGINT NOT NULL,
  `commission_paisa` BIGINT NOT NULL,
  `tax_paisa` BIGINT NOT NULL DEFAULT 0,
  `line_total_paisa` BIGINT NOT NULL,
  `return_eligible_snapshot` BIGINT NOT NULL DEFAULT 1,
  `fulfillment_status` LONGTEXT NOT NULL DEFAULT 'confirmed',
  `fulfillment_request_id` LONGTEXT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_order_items_order` (`order_id`),
  KEY `idx_order_items_seller` (`seller_id`, `created_at`),
  KEY `idx_order_items_seller_order` (`seller_id`, `order_id`),
  CONSTRAINT `order_items_quantity_positive` CHECK (`quantity` > 0),
  CONSTRAINT `order_items_commission_valid` CHECK (`commission_bps` >= 0 AND `commission_bps` <= 10000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_policy_acceptances` (
  `id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NOT NULL,
  `policy_version` LONGTEXT NOT NULL,
  `terms_snapshot_json` LONGTEXT NOT NULL,
  `acceptance_method` LONGTEXT NOT NULL,
  `actor_user_id` VARCHAR(191) NULL,
  `request_id` VARCHAR(191) NOT NULL,
  `accepted_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_order_policy_acceptances_order_unique` (`order_id`),
  UNIQUE KEY `idx_order_policy_acceptances_request_unique` (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_status_events` (
  `id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NOT NULL,
  `from_status` LONGTEXT NULL,
  `to_status` LONGTEXT NOT NULL,
  `note` LONGTEXT NOT NULL,
  `actor_id` VARCHAR(191) NULL,
  `request_id` VARCHAR(191) NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_order_status_events_order_created` (`order_id`, `created_at`),
  UNIQUE KEY `idx_order_status_events_request_unique` (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `orders` (
  `id` VARCHAR(191) NOT NULL,
  `order_number` VARCHAR(191) NOT NULL,
  `receipt_token_hash` VARCHAR(191) NULL,
  `operation_request_id` LONGTEXT NULL,
  `customer_id` VARCHAR(191) NULL,
  `customer_email` LONGTEXT NOT NULL,
  `customer_phone` LONGTEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `locale` LONGTEXT NOT NULL,
  `currency` LONGTEXT NOT NULL DEFAULT 'NPR',
  `policy_version` LONGTEXT NOT NULL,
  `return_policy_snapshot_json` LONGTEXT NOT NULL DEFAULT '{"generalRequestWindowDays":7,"deliveryDamageEvidenceWindowHours":48,"changeOfMindEnabled":true,"highValueRefundThresholdPaisa":1000000,"refundInitiationBusinessDays":2,"codRefundEstimateBusinessDays":[3,7]}',
  `shipping_address_json` LONGTEXT NOT NULL,
  `item_subtotal_paisa` BIGINT NOT NULL,
  `seller_discount_paisa` BIGINT NOT NULL DEFAULT 0,
  `delivery_charge_paisa` BIGINT NOT NULL,
  `buyer_platform_fee_paisa` BIGINT NOT NULL DEFAULT 0,
  `tax_total_paisa` BIGINT NOT NULL DEFAULT 0,
  `grand_total_paisa` BIGINT NOT NULL,
  `payment_mode` LONGTEXT NOT NULL,
  `payment_status` LONGTEXT NOT NULL,
  `placed_at` BIGINT NULL,
  `delivered_at` BIGINT NULL,
  `cancelled_at` BIGINT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_orders_order_number_unique` (`order_number`),
  UNIQUE KEY `idx_orders_receipt_token_unique` (`receipt_token_hash`),
  KEY `idx_orders_customer_created` (`customer_id`, `created_at`),
  KEY `idx_orders_status_created` (`status`, `created_at`),
  CONSTRAINT `orders_money_non_negative` CHECK (`item_subtotal_paisa` >= 0 AND `seller_discount_paisa` >= 0 AND `delivery_charge_paisa` >= 0 AND `buyer_platform_fee_paisa` >= 0 AND `tax_total_paisa` >= 0 AND `grand_total_paisa` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payments` (
  `id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `provider_reference` VARCHAR(191) NULL,
  `method` LONGTEXT NOT NULL,
  `status` LONGTEXT NOT NULL,
  `amount_paisa` BIGINT NOT NULL,
  `currency` LONGTEXT NOT NULL DEFAULT 'NPR',
  `idempotency_key` VARCHAR(191) NOT NULL,
  `failure_code` LONGTEXT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_payments_idempotency_unique` (`idempotency_key`),
  UNIQUE KEY `idx_payments_provider_reference_unique` (`provider`, `provider_reference`),
  KEY `idx_payments_order_created` (`order_id`, `created_at`),
  CONSTRAINT `payments_amount_non_negative` CHECK (`amount_paisa` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payout_entries` (
  `payout_id` VARCHAR(191) NOT NULL,
  `ledger_entry_id` VARCHAR(191) NOT NULL,
  `released_at` BIGINT NULL,
  `release_reason` LONGTEXT NULL,
  `active_ledger_entry_key` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `released_at` IS NULL THEN `ledger_entry_id` ELSE NULL END) STORED,
  PRIMARY KEY (`payout_id`, `ledger_entry_id`),
  UNIQUE KEY `idx_payout_entries_active_ledger_unique` (`active_ledger_entry_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payout_events` (
  `id` VARCHAR(191) NOT NULL,
  `payout_id` VARCHAR(191) NOT NULL,
  `from_status` LONGTEXT NULL,
  `to_status` LONGTEXT NOT NULL,
  `action` LONGTEXT NOT NULL,
  `actor_id` VARCHAR(191) NOT NULL,
  `actor_type` LONGTEXT NOT NULL,
  `note` LONGTEXT NOT NULL,
  `request_id` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_payout_events_payout_created` (`payout_id`, `created_at`),
  UNIQUE KEY `idx_payout_events_request_unique` (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payout_requests` (
  `id` VARCHAR(191) NOT NULL,
  `seller_id` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'submitted',
  `seller_note` LONGTEXT NOT NULL,
  `available_amount_snapshot_paisa` BIGINT NOT NULL,
  `payout_id` VARCHAR(191) NULL,
  `processed_by` VARCHAR(191) NULL,
  `processing_note` LONGTEXT NULL,
  `created_request_id` VARCHAR(191) NOT NULL,
  `operation_request_id` LONGTEXT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_payout_requests_created_unique` (`created_request_id`),
  KEY `idx_payout_requests_seller_status` (`seller_id`, `status`),
  KEY `idx_payout_requests_queue` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payouts` (
  `id` VARCHAR(191) NOT NULL,
  `seller_id` VARCHAR(191) NOT NULL,
  `payout_number` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `amount_paisa` BIGINT NOT NULL,
  `destination_reference` LONGTEXT NOT NULL,
  `prepared_by` VARCHAR(191) NOT NULL,
  `approved_by` VARCHAR(191) NULL,
  `processed_by` VARCHAR(191) NULL,
  `provider_reference` LONGTEXT NULL,
  `note` LONGTEXT NULL,
  `period_start` BIGINT NULL,
  `period_end` BIGINT NULL,
  `scheduled_for` BIGINT NOT NULL,
  `approved_at` BIGINT NULL,
  `processed_at` BIGINT NULL,
  `paid_at` BIGINT NULL,
  `failed_at` BIGINT NULL,
  `failure_reason` LONGTEXT NULL,
  `created_request_id` VARCHAR(191) NULL,
  `operation_request_id` LONGTEXT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_payouts_number_unique` (`payout_number`),
  UNIQUE KEY `idx_payouts_created_request_unique` (`created_request_id`),
  KEY `idx_payouts_seller_status` (`seller_id`, `status`),
  KEY `idx_payouts_status_scheduled` (`status`, `scheduled_for`),
  CONSTRAINT `payouts_amount_positive` CHECK (`amount_paisa` > 0),
  CONSTRAINT `payouts_maker_checker` CHECK (`approved_by` IS NULL OR `approved_by` != `prepared_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `policy_versions` (
  `id` VARCHAR(191) NOT NULL,
  `policy_key` VARCHAR(191) NOT NULL,
  `version` VARCHAR(191) NOT NULL,
  `document_json` LONGTEXT NOT NULL,
  `effective_from` BIGINT NOT NULL,
  `effective_until` BIGINT NULL,
  `created_by` VARCHAR(191) NOT NULL,
  `approved_by` VARCHAR(191) NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_policy_versions_key_version_unique` (`policy_key`, `version`),
  KEY `idx_policy_versions_effective` (`policy_key`, `effective_from`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `product_media` (
  `id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `object_key` VARCHAR(191) NOT NULL,
  `original_name` LONGTEXT NOT NULL DEFAULT '',
  `mime_type` LONGTEXT NOT NULL DEFAULT 'image/jpeg',
  `size_bytes` BIGINT NOT NULL DEFAULT 0,
  `alt_en` LONGTEXT NOT NULL,
  `alt_ne` LONGTEXT NULL,
  `width` BIGINT NULL,
  `height` BIGINT NULL,
  `sort_order` BIGINT NOT NULL DEFAULT 0,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_product_media_object_key_unique` (`object_key`),
  KEY `idx_product_media_product_sort` (`product_id`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `product_occasions` (
  `product_id` VARCHAR(191) NOT NULL,
  `occasion_id` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`product_id`, `occasion_id`),
  KEY `idx_product_occasions_occasion_product` (`occasion_id`, `product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `product_reviews` (
  `id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `customer_id` VARCHAR(191) NOT NULL,
  `order_item_id` VARCHAR(191) NOT NULL,
  `rating` BIGINT NOT NULL,
  `title` LONGTEXT NULL,
  `body` LONGTEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `moderation_note` LONGTEXT NULL,
  `moderated_by` VARCHAR(191) NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_product_reviews_order_item_unique` (`order_item_id`),
  KEY `idx_product_reviews_public` (`product_id`, `status`, `created_at`),
  KEY `idx_product_reviews_moderation_queue` (`status`, `created_at`),
  CONSTRAINT `product_reviews_rating_valid` CHECK (`rating` >= 1 AND `rating` <= 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `products` (
  `id` VARCHAR(191) NOT NULL,
  `seller_id` VARCHAR(191) NOT NULL,
  `category_id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `sku` VARCHAR(191) NOT NULL,
  `name_en` LONGTEXT NOT NULL,
  `name_ne` LONGTEXT NULL,
  `description_en` LONGTEXT NOT NULL,
  `description_ne` LONGTEXT NULL,
  `price_paisa` BIGINT NOT NULL,
  `compare_at_price_paisa` BIGINT NULL,
  `inventory_quantity` BIGINT NOT NULL DEFAULT 0,
  `producer` LONGTEXT NOT NULL,
  `country_of_origin` LONGTEXT NOT NULL DEFAULT 'NP',
  `materials` LONGTEXT NOT NULL,
  `dimensions` LONGTEXT NULL,
  `care_instructions` LONGTEXT NULL,
  `safety_information` LONGTEXT NULL,
  `return_conditions` LONGTEXT NULL,
  `return_eligible` BIGINT NOT NULL DEFAULT 1,
  `warranty` LONGTEXT NULL,
  `made_to_order` BIGINT NOT NULL DEFAULT 0,
  `preparation_days` BIGINT NOT NULL DEFAULT 2,
  `manufactured_at` BIGINT NULL,
  `expires_at` BIGINT NULL,
  `licence_reference` LONGTEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `review_note` LONGTEXT NULL,
  `review_request_id` LONGTEXT NULL,
  `reviewed_by` VARCHAR(191) NULL,
  `published_at` BIGINT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_products_slug_unique` (`slug`),
  UNIQUE KEY `idx_products_seller_sku_unique` (`seller_id`, `sku`),
  KEY `idx_products_public_catalog` (`status`, `category_id`, `published_at`),
  KEY `idx_products_seller_status` (`seller_id`, `status`),
  KEY `idx_products_seller_updated` (`seller_id`, `updated_at`),
  KEY `idx_products_review_queue` (`status`, `created_at`),
  KEY `idx_products_public_recent` (`status`, `published_at`),
  CONSTRAINT `products_price_non_negative` CHECK (`price_paisa` >= 0),
  CONSTRAINT `products_compare_price_non_negative` CHECK (`compare_at_price_paisa` IS NULL OR `compare_at_price_paisa` >= 0),
  CONSTRAINT `products_inventory_non_negative` CHECK (`inventory_quantity` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `prohibited_product_rules` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `title_en` LONGTEXT NOT NULL,
  `title_ne` LONGTEXT NOT NULL,
  `description_en` LONGTEXT NOT NULL,
  `description_ne` LONGTEXT NOT NULL,
  `severity` VARCHAR(191) NOT NULL,
  `is_active` BIGINT NOT NULL DEFAULT 1,
  `created_by` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_prohibited_product_rules_code_unique` (`code`),
  KEY `idx_prohibited_product_rules_active` (`is_active`, `severity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `promotion_products` (
  `promotion_id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `sort_order` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`promotion_id`, `product_id`),
  KEY `idx_promotion_products_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `promotions` (
  `id` VARCHAR(191) NOT NULL,
  `name_en` LONGTEXT NOT NULL,
  `name_ne` LONGTEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `placement` LONGTEXT NOT NULL,
  `starts_at` BIGINT NOT NULL,
  `ends_at` BIGINT NOT NULL,
  `created_by` VARCHAR(191) NOT NULL,
  `approved_by` VARCHAR(191) NULL,
  `note` LONGTEXT NOT NULL,
  `created_request_id` VARCHAR(191) NOT NULL,
  `operation_request_id` LONGTEXT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_promotions_created_request_unique` (`created_request_id`),
  KEY `idx_promotions_status_window` (`status`, `starts_at`, `ends_at`),
  CONSTRAINT `promotions_window_valid` CHECK (`ends_at` > `starts_at`),
  CONSTRAINT `promotions_maker_checker` CHECK (`approved_by` IS NULL OR `approved_by` != `created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `refund_liability_entries` (
  `id` VARCHAR(191) NOT NULL,
  `refund_id` VARCHAR(191) NOT NULL,
  `seller_id` VARCHAR(191) NULL,
  `party` LONGTEXT NOT NULL,
  `amount_paisa` BIGINT NOT NULL,
  `description` LONGTEXT NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_refund_liability_refund` (`refund_id`),
  KEY `idx_refund_liability_seller` (`seller_id`, `created_at`),
  CONSTRAINT `refund_liability_amount_positive` CHECK (`amount_paisa` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- refunds_high_value_maker_checker is enforced by application transactions because MariaDB 10.11 rejects CHECK columns changed by SET NULL/CASCADE foreign-key actions.
CREATE TABLE IF NOT EXISTS `refunds` (
  `id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NOT NULL,
  `return_request_id` VARCHAR(191) NULL,
  `payment_id` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL,
  `amount_paisa` BIGINT NOT NULL,
  `item_amount_paisa` BIGINT NULL,
  `delivery_amount_paisa` BIGINT NOT NULL DEFAULT 0,
  `reason` LONGTEXT NOT NULL,
  `requested_by` VARCHAR(191) NULL,
  `approved_by` VARCHAR(191) NULL,
  `high_value_approved_by` VARCHAR(191) NULL,
  `processed_by` VARCHAR(191) NULL,
  `liability` LONGTEXT NOT NULL DEFAULT 'platform',
  `is_high_value` BIGINT NOT NULL DEFAULT 0,
  `operation_request_id` LONGTEXT NULL,
  `provider_reference` LONGTEXT NULL,
  `requested_at` BIGINT NOT NULL,
  `approved_at` BIGINT NULL,
  `processed_at` BIGINT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_refunds_order` (`order_id`),
  KEY `idx_refunds_status_requested` (`status`, `requested_at`),
  UNIQUE KEY `idx_refunds_return_request_unique` (`return_request_id`),
  CONSTRAINT `refunds_amount_positive` CHECK (`amount_paisa` > 0),
  CONSTRAINT `refunds_components_valid` CHECK (`item_amount_paisa` IS NULL OR (`item_amount_paisa` >= 0 AND `delivery_amount_paisa` >= 0 AND `item_amount_paisa` + `delivery_amount_paisa` = `amount_paisa`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `request_rate_limits` (
  `key` VARCHAR(191) NOT NULL,
  `request_count` BIGINT NOT NULL DEFAULT 0,
  `window_started_at` BIGINT NOT NULL,
  `expires_at` BIGINT NOT NULL,
  PRIMARY KEY (`key`),
  KEY `idx_request_rate_limits_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `return_evidence` (
  `id` VARCHAR(191) NOT NULL,
  `return_request_id` VARCHAR(191) NOT NULL,
  `object_key` VARCHAR(191) NOT NULL,
  `original_name` LONGTEXT NOT NULL,
  `mime_type` LONGTEXT NOT NULL,
  `size_bytes` BIGINT NOT NULL,
  `uploaded_by_type` LONGTEXT NOT NULL,
  `uploaded_by` VARCHAR(191) NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_return_evidence_object_key_unique` (`object_key`),
  KEY `idx_return_evidence_request_created` (`return_request_id`, `created_at`),
  CONSTRAINT `return_evidence_size_positive` CHECK (`size_bytes` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `return_outcomes` (
  `id` VARCHAR(191) NOT NULL,
  `return_request_id` VARCHAR(191) NOT NULL,
  `outcome` LONGTEXT NOT NULL,
  `refund_id` VARCHAR(191) NULL,
  `replacement_reference` LONGTEXT NULL,
  `return_shipment_reference` LONGTEXT NULL,
  `restock_quantity` BIGINT NOT NULL DEFAULT 0,
  `note_en` LONGTEXT NOT NULL,
  `note_ne` LONGTEXT NOT NULL,
  `resolved_by` VARCHAR(191) NOT NULL,
  `request_id` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_return_outcomes_request_unique` (`return_request_id`),
  UNIQUE KEY `idx_return_outcomes_request_id_unique` (`request_id`),
  CONSTRAINT `return_outcomes_restock_non_negative` CHECK (`restock_quantity` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `return_request_events` (
  `id` VARCHAR(191) NOT NULL,
  `return_request_id` VARCHAR(191) NOT NULL,
  `from_status` LONGTEXT NULL,
  `to_status` LONGTEXT NOT NULL,
  `action` LONGTEXT NOT NULL,
  `actor_id` VARCHAR(191) NULL,
  `actor_type` LONGTEXT NOT NULL,
  `public_message_en` LONGTEXT NOT NULL,
  `public_message_ne` LONGTEXT NOT NULL,
  `internal_note` LONGTEXT NULL,
  `request_id` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_return_events_request_created` (`return_request_id`, `created_at`),
  UNIQUE KEY `idx_return_events_request_id_unique` (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `return_requests` (
  `id` VARCHAR(191) NOT NULL,
  `reference_number` VARCHAR(191) NULL,
  `order_item_id` VARCHAR(191) NOT NULL,
  `requested_by` VARCHAR(191) NULL,
  `reason` LONGTEXT NOT NULL,
  `detail` LONGTEXT NOT NULL,
  `locale` LONGTEXT NOT NULL DEFAULT 'en-NP',
  `quantity` BIGINT NOT NULL DEFAULT 1,
  `requested_resolution` LONGTEXT NOT NULL DEFAULT 'refund',
  `status` VARCHAR(191) NOT NULL,
  `responsibility` LONGTEXT NOT NULL DEFAULT 'undetermined',
  `eligibility_decision` LONGTEXT NOT NULL DEFAULT 'manual_review',
  `eligibility_reason_en` LONGTEXT NOT NULL DEFAULT 'Pending review',
  `eligibility_reason_ne` LONGTEXT NOT NULL DEFAULT 'समीक्षा बाँकी',
  `policy_snapshot_json` LONGTEXT NOT NULL DEFAULT '{}',
  `seller_recommendation` LONGTEXT NULL,
  `seller_response` LONGTEXT NULL,
  `seller_response_locale` LONGTEXT NULL,
  `seller_responded_by` VARCHAR(191) NULL,
  `seller_responded_at` BIGINT NULL,
  `investigation_summary` LONGTEXT NULL,
  `resolution_outcome` LONGTEXT NULL,
  `return_shipment_reference` LONGTEXT NULL,
  `created_request_id` VARCHAR(191) NULL,
  `operation_request_id` LONGTEXT NULL,
  `requested_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL DEFAULT 0,
  `resolved_at` BIGINT NULL,
  `reviewed_by` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_return_requests_reference_unique` (`reference_number`),
  KEY `idx_return_requests_item` (`order_item_id`, `requested_at`),
  UNIQUE KEY `idx_return_requests_created_request_unique` (`created_request_id`),
  KEY `idx_return_requests_status` (`status`, `requested_at`),
  CONSTRAINT `return_requests_quantity_positive` CHECK (`quantity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `seller_documents` (
  `id` VARCHAR(191) NOT NULL,
  `seller_id` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `object_key` VARCHAR(191) NOT NULL,
  `original_name` LONGTEXT NOT NULL,
  `mime_type` LONGTEXT NOT NULL,
  `size_bytes` BIGINT NOT NULL,
  `status` LONGTEXT NOT NULL DEFAULT 'pending',
  `uploaded_at` BIGINT NOT NULL,
  `reviewed_at` BIGINT NULL,
  `reviewed_by` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_seller_documents_object_key_unique` (`object_key`),
  KEY `idx_seller_documents_seller_kind` (`seller_id`, `kind`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `seller_ledger_entries` (
  `id` VARCHAR(191) NOT NULL,
  `seller_id` VARCHAR(191) NOT NULL,
  `order_item_id` VARCHAR(191) NULL,
  `refund_id` VARCHAR(191) NULL,
  `payout_id` VARCHAR(191) NULL,
  `type` VARCHAR(191) NOT NULL,
  `amount_paisa` BIGINT NOT NULL,
  `available_at` BIGINT NULL,
  `description` LONGTEXT NOT NULL,
  `created_at` BIGINT NOT NULL,
  `active_order_item_key` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `order_item_id` IS NOT NULL AND `type` IN ('sale', 'commission', 'reserve_hold', 'reserve_release') THEN `order_item_id` ELSE NULL END) STORED,
  `active_order_item_type` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `order_item_id` IS NOT NULL AND `type` IN ('sale', 'commission', 'reserve_hold', 'reserve_release') THEN `type` ELSE NULL END) STORED,
  PRIMARY KEY (`id`),
  KEY `idx_seller_ledger_balance` (`seller_id`, `available_at`),
  KEY `idx_seller_ledger_order_item` (`order_item_id`),
  UNIQUE KEY `idx_seller_ledger_refund_unique` (`refund_id`),
  UNIQUE KEY `idx_seller_ledger_payout_unique` (`payout_id`),
  UNIQUE KEY `idx_seller_ledger_order_item_type_unique` (`active_order_item_key`, `active_order_item_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `seller_profiles` (
  `id` VARCHAR(191) NOT NULL,
  `application_reference` VARCHAR(191) NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `legal_name` LONGTEXT NOT NULL,
  `trading_name` LONGTEXT NOT NULL,
  `registration_authority` VARCHAR(191) NOT NULL,
  `registration_number` VARCHAR(191) NOT NULL,
  `tax_mode` LONGTEXT NOT NULL,
  `tax_registration_number` VARCHAR(191) NOT NULL,
  `representative_name` LONGTEXT NOT NULL,
  `business_description` LONGTEXT NULL,
  `product_categories` LONGTEXT NULL,
  `support_phone` LONGTEXT NOT NULL,
  `support_email` LONGTEXT NOT NULL,
  `province` LONGTEXT NOT NULL,
  `district` LONGTEXT NOT NULL,
  `municipality` LONGTEXT NOT NULL,
  `ward` LONGTEXT NULL,
  `locality` LONGTEXT NOT NULL,
  `payout_account_reference` LONGTEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `seller_agreement_version` LONGTEXT NULL,
  `seller_agreement_accepted_at` BIGINT NULL,
  `review_note` LONGTEXT NULL,
  `review_request_id` LONGTEXT NULL,
  `reviewed_by` VARCHAR(191) NULL,
  `approved_at` BIGINT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_seller_profiles_application_reference_unique` (`application_reference`),
  UNIQUE KEY `idx_seller_profiles_user_unique` (`user_id`),
  UNIQUE KEY `idx_seller_profiles_registration_unique` (`registration_authority`, `registration_number`),
  UNIQUE KEY `idx_seller_profiles_tax_number_unique` (`tax_registration_number`),
  KEY `idx_seller_profiles_review_queue` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `shipment_events` (
  `id` VARCHAR(191) NOT NULL,
  `shipment_id` VARCHAR(191) NOT NULL,
  `provider_event_id` VARCHAR(191) NULL,
  `status` LONGTEXT NOT NULL,
  `location` LONGTEXT NULL,
  `note` LONGTEXT NULL,
  `occurred_at` BIGINT NOT NULL,
  `received_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_shipment_events_provider_event_unique` (`shipment_id`, `provider_event_id`),
  KEY `idx_shipment_events_timeline` (`shipment_id`, `occurred_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `shipments` (
  `id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `provider_shipment_id` VARCHAR(191) NULL,
  `tracking_code` VARCHAR(191) NULL,
  `status` LONGTEXT NOT NULL,
  `payment_mode` LONGTEXT NOT NULL,
  `cod_amount_paisa` BIGINT NULL,
  `delivery_charge_paisa` BIGINT NOT NULL,
  `estimated_min_days` BIGINT NOT NULL,
  `estimated_max_days` BIGINT NOT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_shipments_provider_id_unique` (`provider`, `provider_shipment_id`),
  KEY `idx_shipments_order` (`order_id`),
  KEY `idx_shipments_tracking` (`tracking_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `shipping_job_events` (
  `id` VARCHAR(191) NOT NULL,
  `shipping_job_id` VARCHAR(191) NOT NULL,
  `from_status` LONGTEXT NULL,
  `to_status` LONGTEXT NOT NULL,
  `action` LONGTEXT NOT NULL,
  `actor_id` VARCHAR(191) NOT NULL,
  `actor_role` LONGTEXT NOT NULL,
  `note` LONGTEXT NOT NULL,
  `request_id` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_shipping_job_events_request_unique` (`request_id`),
  KEY `idx_shipping_job_events_job_created` (`shipping_job_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `shipping_jobs` (
  `id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NOT NULL,
  `seller_id` VARCHAR(191) NOT NULL,
  `direction` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `carrier` LONGTEXT NOT NULL DEFAULT 'nepal_can_move_manual',
  `label_reference` LONGTEXT NULL,
  `tracking_code` LONGTEXT NULL,
  `pickup_window_start` BIGINT NULL,
  `pickup_window_end` BIGINT NULL,
  `claim_reference` LONGTEXT NULL,
  `reconciliation_status` VARCHAR(191) NOT NULL DEFAULT 'unreconciled',
  `reconciliation_note` LONGTEXT NULL,
  `created_by` VARCHAR(191) NOT NULL,
  `created_request_id` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_shipping_jobs_order_seller_direction_unique` (`order_id`, `seller_id`, `direction`),
  UNIQUE KEY `idx_shipping_jobs_created_request_unique` (`created_request_id`),
  KEY `idx_shipping_jobs_seller_status` (`seller_id`, `status`),
  KEY `idx_shipping_jobs_reconciliation` (`reconciliation_status`, `updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff_invitations` (
  `id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `role` LONGTEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `invited_by` VARCHAR(191) NULL,
  `accepted_by` VARCHAR(191) NULL,
  `expires_at` BIGINT NOT NULL,
  `created_at` BIGINT NOT NULL,
  `accepted_at` BIGINT NULL,
  `revoked_at` BIGINT NULL,
  `pending_email_key` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `status` = 'pending' THEN `email` ELSE NULL END) STORED,
  PRIMARY KEY (`id`),
  KEY `idx_staff_invitations_email_status_created` (`email`, `status`, `created_at`),
  KEY `idx_staff_invitations_status_expires` (`status`, `expires_at`),
  UNIQUE KEY `idx_staff_invitations_pending_email_unique` (`pending_email_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_roles` (
  `user_id` VARCHAR(191) NOT NULL,
  `role` VARCHAR(191) NOT NULL,
  `assigned_by` VARCHAR(191) NULL,
  `assigned_at` BIGINT NOT NULL,
  PRIMARY KEY (`user_id`, `role`),
  KEY `idx_user_roles_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(191) NOT NULL,
  `auth_subject` VARCHAR(191) NULL,
  `email` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(191) NULL,
  `display_name` LONGTEXT NOT NULL,
  `locale` LONGTEXT NOT NULL DEFAULT 'en-NP',
  `status` LONGTEXT NOT NULL DEFAULT 'active',
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_users_email_unique` (`email`),
  UNIQUE KEY `idx_users_phone_unique` (`phone`),
  UNIQUE KEY `idx_users_auth_subject_unique` (`auth_subject`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wishlist_items` (
  `user_id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`user_id`, `product_id`),
  KEY `idx_wishlist_items_user_created` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Versioned business configuration. Values are validated by the typed application registry.
CREATE TABLE IF NOT EXISTS `business_setting_versions` (
  `id` VARCHAR(191) NOT NULL,
  `setting_key` VARCHAR(191) NOT NULL,
  `version` BIGINT NOT NULL,
  `value_json` LONGTEXT NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'draft',
  `revision` BIGINT NOT NULL DEFAULT 1,
  `change_control` VARCHAR(32) NOT NULL,
  `effective_from` BIGINT NULL,
  `effective_until` BIGINT NULL,
  `reason` LONGTEXT NOT NULL,
  `created_by` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  `submitted_by` VARCHAR(191) NULL,
  `submitted_at` BIGINT NULL,
  `approved_by` VARCHAR(191) NULL,
  `approved_at` BIGINT NULL,
  `published_by` VARCHAR(191) NULL,
  `published_at` BIGINT NULL,
  `decision_note` LONGTEXT NULL,
  `supersedes_id` VARCHAR(191) NULL,
  `last_request_id` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_business_setting_versions_key_version` (`setting_key`, `version`),
  UNIQUE KEY `idx_business_setting_versions_request` (`last_request_id`),
  KEY `idx_business_setting_versions_effective` (`setting_key`, `status`, `effective_from`, `effective_until`),
  KEY `idx_business_setting_versions_review` (`status`, `created_at`),
  CONSTRAINT `business_setting_versions_status` CHECK (`status` IN ('draft', 'pending_approval', 'published', 'rejected', 'cancelled')),
  CONSTRAINT `business_setting_versions_revision` CHECK (`revision` >= 1),
  CONSTRAINT `business_setting_versions_control` CHECK (`change_control` IN ('simple', 'controlled')),
  CONSTRAINT `business_setting_versions_interval` CHECK (`effective_until` IS NULL OR (`effective_from` IS NOT NULL AND `effective_until` > `effective_from`)),
  CONSTRAINT `business_setting_versions_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `business_setting_versions_submitted_by_users_id_fk` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `business_setting_versions_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `business_setting_versions_published_by_users_id_fk` FOREIGN KEY (`published_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `business_setting_versions_supersedes_id_fk` FOREIGN KEY (`supersedes_id`) REFERENCES `business_setting_versions` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `business_setting_guards` (
  `id` VARCHAR(191) NOT NULL,
  `valid` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `business_setting_guards_valid` CHECK (`valid` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Additive seller and maker participation foundation.
-- Staging migration only until production migration is separately approved.
ALTER TABLE `seller_profiles` ADD COLUMN IF NOT EXISTS `tax_registration_number_key` VARCHAR(191)
  GENERATED ALWAYS AS (NULLIF(`tax_registration_number`, '')) STORED;
ALTER TABLE `seller_profiles` DROP INDEX IF EXISTS `idx_seller_profiles_tax_number_unique`;
CREATE UNIQUE INDEX `idx_seller_profiles_tax_number_unique`
  ON `seller_profiles` (`tax_registration_number_key`);

CREATE TABLE IF NOT EXISTS `seller_participation_profiles` (
  `seller_id` VARCHAR(191) NOT NULL,
  `participation_route` VARCHAR(32) NOT NULL,
  `application_stage` VARCHAR(40) NOT NULL,
  `tax_status` VARCHAR(32) NULL,
  `public_name` LONGTEXT NOT NULL,
  `public_city` VARCHAR(191) NOT NULL,
  `craft_experience_json` LONGTEXT NOT NULL DEFAULT '[]',
  `social_links_json` LONGTEXT NOT NULL DEFAULT '{}',
  `commercial_model` VARCHAR(64) NULL,
  `legal_seller_reference` VARCHAR(191) NULL,
  `invoice_issuer_reference` VARCHAR(191) NULL,
  `payout_beneficiary_reference` VARCHAR(191) NULL,
  `return_destination_type` VARCHAR(48) NOT NULL DEFAULT 'maker_address',
  `version` BIGINT NOT NULL DEFAULT 1,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`seller_id`),
  KEY `idx_seller_participation_review` (`participation_route`, `application_stage`, `created_at`),
  CONSTRAINT `seller_participation_route` CHECK (`participation_route` IN ('registered_seller','managed_maker')),
  CONSTRAINT `seller_participation_stage` CHECK (`application_stage` IN ('draft','submitted','under_review','changes_requested','approved_for_activation','active','rejected','suspended')),
  CONSTRAINT `seller_participation_tax` CHECK (`tax_status` IS NULL OR `tax_status` IN ('business_pan_only','vat_registered')),
  CONSTRAINT `seller_participation_version` CHECK (`version` >= 1),
  CONSTRAINT `seller_participation_seller_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `seller_participation_guards` (
  `id` VARCHAR(191) NOT NULL,
  `valid` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `seller_participation_guard_valid` CHECK (`valid` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `seller_operational_addresses` (
  `id` VARCHAR(191) NOT NULL,
  `seller_id` VARCHAR(191) NOT NULL,
  `purpose` VARCHAR(32) NOT NULL,
  `same_as_address_id` VARCHAR(191) NULL,
  `province` LONGTEXT NOT NULL,
  `district` LONGTEXT NOT NULL,
  `municipality` LONGTEXT NOT NULL,
  `ward` LONGTEXT NULL,
  `locality` LONGTEXT NOT NULL,
  `is_public` BIGINT NOT NULL DEFAULT 0,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_seller_addresses_purpose` (`seller_id`, `purpose`),
  CONSTRAINT `seller_address_private` CHECK (`is_public` = 0),
  CONSTRAINT `seller_address_seller_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `seller_address_same_as_fk` FOREIGN KEY (`same_as_address_id`) REFERENCES `seller_operational_addresses` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `seller_profile_media` (
  `id` VARCHAR(191) NOT NULL,
  `seller_id` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(32) NOT NULL,
  `object_key` VARCHAR(191) NOT NULL,
  `original_name` LONGTEXT NOT NULL,
  `mime_type` VARCHAR(191) NOT NULL,
  `size_bytes` BIGINT NOT NULL,
  `moderation_status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `uploaded_at` BIGINT NOT NULL,
  `reviewed_at` BIGINT NULL,
  `reviewed_by` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_seller_profile_media_kind` (`seller_id`, `kind`),
  UNIQUE KEY `idx_seller_profile_media_object_key` (`object_key`),
  CONSTRAINT `seller_profile_media_seller_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `seller_profile_media_reviewer_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `seller_participation_profiles` (
  `seller_id`, `participation_route`, `application_stage`, `tax_status`,
  `public_name`, `public_city`, `craft_experience_json`, `social_links_json`,
  `commercial_model`, `legal_seller_reference`, `invoice_issuer_reference`,
  `payout_beneficiary_reference`, `return_destination_type`, `version`,
  `created_at`, `updated_at`
)
SELECT `id`, 'registered_seller',
  CASE `status` WHEN 'approved' THEN 'active' WHEN 'needs_changes' THEN 'changes_requested' ELSE `status` END,
  CASE WHEN `tax_mode` IN ('VAT','BOTH') THEN 'vat_registered' ELSE 'business_pan_only' END,
  `trading_name`, `municipality`, '[]', '{}', NULL,
  CASE WHEN `status` = 'approved' THEN `id` ELSE NULL END,
  CASE WHEN `status` = 'approved' THEN `id` ELSE NULL END,
  CASE WHEN `status` = 'approved' THEN `id` ELSE NULL END,
  'maker_address', 1, `created_at`, `updated_at`
FROM `seller_profiles`;

INSERT IGNORE INTO `seller_operational_addresses` (
  `id`, `seller_id`, `purpose`, `same_as_address_id`, `province`, `district`,
  `municipality`, `ward`, `locality`, `is_public`, `created_at`, `updated_at`
)
SELECT CONCAT('verification-', `id`), `id`, 'verification', NULL, `province`, `district`,
  `municipality`, `ward`, `locality`, 0, `created_at`, `updated_at`
FROM `seller_profiles`;

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

-- Additive product-specific materials and origin story fields.
ALTER TABLE `products`
  ADD COLUMN `materials_json` LONGTEXT NOT NULL DEFAULT '[]',
  ADD COLUMN `origin_story` LONGTEXT NULL;

-- Additive purchaser, recipient, and saved-address checkout snapshots.
ALTER TABLE `orders`
  ADD COLUMN `delivery_for` VARCHAR(16) NOT NULL DEFAULT 'self',
  ADD COLUMN `recipient_email` VARCHAR(254) NULL,
  ADD COLUMN `source_address_id` VARCHAR(191) NULL,
  ADD COLUMN `address_saved_for_future` BIGINT NOT NULL DEFAULT 0;

DROP TRIGGER IF EXISTS `invalidate_delivery_otp_after_destination_change`;
CREATE TRIGGER `invalidate_delivery_otp_after_destination_change`
AFTER UPDATE ON `orders` FOR EACH ROW
DELETE FROM `rider_otp_challenges`
WHERE (NOT (OLD.`shipping_address_json` <=> NEW.`shipping_address_json`)
  OR NOT (OLD.`delivery_for` <=> NEW.`delivery_for`)
  OR NOT (OLD.`recipient_email` <=> NEW.`recipient_email`))
  AND `shipping_job_id` IN (SELECT `id` FROM `shipping_jobs` WHERE `order_id` = NEW.`id`);

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
  DECLARE seller_state VARCHAR(40) DEFAULT NULL;
  DECLARE owner_state VARCHAR(40) DEFAULT NULL;
  DECLARE seller_id_value VARCHAR(191) DEFAULT NULL;
  DECLARE owner_id_value VARCHAR(191) DEFAULT NULL;
  DECLARE participation_route_value VARCHAR(40) DEFAULT NULL;
  DECLARE application_stage_value VARCHAR(40) DEFAULT NULL;
  DECLARE commercial_model_value VARCHAR(80) DEFAULT NULL;
  DECLARE legal_seller_value VARCHAR(191) DEFAULT NULL;
  DECLARE invoice_issuer_value VARCHAR(191) DEFAULT NULL;
  DECLARE payout_beneficiary_value VARCHAR(191) DEFAULT NULL;
  DECLARE agreement_version_value VARCHAR(191) DEFAULT NULL;
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

-- Privacy-limited first-party browser-session estimates. No IP, user-agent,
-- checkout payload, account id, advertising id or replay content is stored.
CREATE TABLE IF NOT EXISTS `traffic_sessions` (
  `id` VARCHAR(191) NOT NULL,
  `token_hash` VARCHAR(191) NOT NULL,
  `first_seen_at` BIGINT NOT NULL,
  `last_seen_at` BIGINT NOT NULL,
  `expires_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_traffic_sessions_token` (`token_hash`),
  KEY `idx_traffic_sessions_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `traffic_events` (
  `id` VARCHAR(191) NOT NULL,
  `session_id` VARCHAR(191) NOT NULL,
  `event_type` VARCHAR(40) NOT NULL,
  `path` VARCHAR(200) NOT NULL,
  `entity_key` VARCHAR(191) NULL,
  `event_key` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_traffic_events_key` (`event_key`),
  KEY `idx_traffic_events_created` (`created_at`),
  KEY `idx_traffic_events_type_created` (`event_type`,`created_at`),
  KEY `idx_traffic_events_session_created` (`session_id`,`created_at`),
  CONSTRAINT `traffic_events_session_fk` FOREIGN KEY (`session_id`) REFERENCES `traffic_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `traffic_events_type_check` CHECK (`event_type` IN ('page_view','product_view','add_to_cart','checkout_started','order_completed')),
  CONSTRAINT `traffic_events_path_check` CHECK (CHAR_LENGTH(`path`) BETWEEN 1 AND 200)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `managed_invoice_adjustments` (
  `id` VARCHAR(191) NOT NULL,
  `invoice_group_id` VARCHAR(191) NOT NULL,
  `adjustment_number` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(24) NOT NULL,
  `amount_paisa` BIGINT NOT NULL,
  `reason_code` VARCHAR(80) NOT NULL,
  `note` VARCHAR(500) NOT NULL,
  `snapshot_json` LONGTEXT NOT NULL,
  `simulation_label` VARCHAR(191) NOT NULL,
  `request_id` VARCHAR(191) NOT NULL,
  `created_by` VARCHAR(191) NOT NULL,
  `issued_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_managed_invoice_adjustments_number` (`adjustment_number`),
  UNIQUE KEY `idx_managed_invoice_adjustments_request` (`request_id`),
  KEY `idx_managed_invoice_adjustments_invoice` (`invoice_group_id`,`issued_at`),
  CONSTRAINT `managed_invoice_adjustments_invoice_fk` FOREIGN KEY (`invoice_group_id`) REFERENCES `managed_invoice_groups` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `managed_invoice_adjustments_creator_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `managed_invoice_adjustments_kind_check` CHECK (`kind` IN ('credit_note','debit_note')),
  CONSTRAINT `managed_invoice_adjustments_amount_check` CHECK (`amount_paisa`>0),
  CONSTRAINT `managed_invoice_adjustments_label_check` CHECK (CHAR_LENGTH(TRIM(`simulation_label`))>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS `managed_invoice_adjustment_no_update`;
CREATE TRIGGER `managed_invoice_adjustment_no_update`
BEFORE UPDATE ON `managed_invoice_adjustments`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_invoice_adjustment_immutable';

DROP TRIGGER IF EXISTS `managed_invoice_adjustment_no_delete`;
CREATE TRIGGER `managed_invoice_adjustment_no_delete`
BEFORE DELETE ON `managed_invoice_adjustments`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_invoice_adjustment_immutable';

-- Per-assignment open-box and rider-finance snapshots. This is additive and
-- contains no production values or fictional records.
ALTER TABLE `rider_profiles`
  ADD COLUMN `open_box_eligible` BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN `open_box_reviewed_by` VARCHAR(191) NULL,
  ADD COLUMN `open_box_reviewed_at` BIGINT NULL,
  ADD CONSTRAINT `rider_profiles_open_box_eligible_check` CHECK (`open_box_eligible` IN (0,1)),
  ADD CONSTRAINT `rider_profiles_open_box_reviewer_fk` FOREIGN KEY (`open_box_reviewed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT;

ALTER TABLE `shipping_parcels`
  ADD COLUMN `open_box_required` BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN `open_box_snapshot_json` LONGTEXT NULL,
  ADD COLUMN `rider_finance_snapshot_json` LONGTEXT NULL,
  ADD CONSTRAINT `shipping_parcels_open_box_required_check` CHECK (`open_box_required` IN (0,1));

ALTER TABLE `parcel_cash_records`
  ADD COLUMN `rider_user_id` VARCHAR(191) NULL,
  ADD CONSTRAINT `parcel_cash_records_rider_fk` FOREIGN KEY (`rider_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT;

ALTER TABLE `rider_reports`
  ADD COLUMN `open_box_outcome` VARCHAR(80) NOT NULL DEFAULT 'not_applicable',
  ADD CONSTRAINT `rider_reports_open_box_outcome_check` CHECK (`open_box_outcome` IN ('not_applicable','accepted_after_inspection','accepted_outer_packaging_inner_seal_intact','inspection_declined','refused_whole_parcel_wrong_item','refused_whole_parcel_damage','refused_whole_parcel_other'));

CREATE TABLE IF NOT EXISTS `rider_assignment_snapshots` (
  `id` VARCHAR(191) NOT NULL,
  `request_id` VARCHAR(191) NOT NULL,
  `shipping_job_id` VARCHAR(191) NOT NULL,
  `rider_user_id` VARCHAR(191) NOT NULL,
  `assignment_version` BIGINT NOT NULL,
  `open_box_snapshot_json` LONGTEXT NOT NULL,
  `finance_snapshot_json` LONGTEXT NOT NULL,
  `created_by` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_rider_assignment_snapshot_request` (`request_id`),
  CONSTRAINT `rider_assignment_snapshot_parcel_fk` FOREIGN KEY (`shipping_job_id`) REFERENCES `shipping_parcels` (`shipping_job_id`) ON DELETE RESTRICT,
  CONSTRAINT `rider_assignment_snapshot_rider_fk` FOREIGN KEY (`rider_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `rider_assignment_snapshot_creator_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rider_cash_obligations` (
  `id` VARCHAR(191) NOT NULL,
  `collection_record_id` VARCHAR(191) NOT NULL,
  `shipping_job_id` VARCHAR(191) NOT NULL,
  `rider_user_id` VARCHAR(191) NOT NULL,
  `amount_paisa` BIGINT NOT NULL,
  `due_at` BIGINT NOT NULL,
  `policy_snapshot_json` LONGTEXT NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_rider_cash_obligation_collection` (`collection_record_id`),
  KEY `idx_rider_cash_obligations_due` (`rider_user_id`,`due_at`),
  CONSTRAINT `rider_cash_obligation_collection_fk` FOREIGN KEY (`collection_record_id`) REFERENCES `parcel_cash_records` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `rider_cash_obligation_parcel_fk` FOREIGN KEY (`shipping_job_id`) REFERENCES `shipping_parcels` (`shipping_job_id`) ON DELETE RESTRICT,
  CONSTRAINT `rider_cash_obligation_rider_fk` FOREIGN KEY (`rider_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `rider_cash_obligation_amount_check` CHECK (`amount_paisa`>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rider_remittance_allocations` (
  `id` VARCHAR(191) NOT NULL,
  `remittance_record_id` VARCHAR(191) NOT NULL,
  `obligation_id` VARCHAR(191) NOT NULL,
  `amount_paisa` BIGINT NOT NULL,
  `allocated_by` VARCHAR(191) NOT NULL,
  `allocated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_rider_remittance_obligation` (`remittance_record_id`,`obligation_id`),
  CONSTRAINT `rider_remittance_allocation_record_fk` FOREIGN KEY (`remittance_record_id`) REFERENCES `parcel_cash_records` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `rider_remittance_allocation_obligation_fk` FOREIGN KEY (`obligation_id`) REFERENCES `rider_cash_obligations` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `rider_remittance_allocation_actor_fk` FOREIGN KEY (`allocated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `rider_remittance_allocation_amount_check` CHECK (`amount_paisa`>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rider_compensation_entries` (
  `id` VARCHAR(191) NOT NULL,
  `request_id` VARCHAR(191) NOT NULL,
  `shipping_job_id` VARCHAR(191) NOT NULL,
  `rider_user_id` VARCHAR(191) NOT NULL,
  `outcome` VARCHAR(24) NOT NULL,
  `rate_paisa` BIGINT NOT NULL,
  `amount_paisa` BIGINT NOT NULL,
  `policy_snapshot_json` LONGTEXT NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'earned',
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_rider_compensation_request` (`request_id`),
  KEY `idx_rider_compensation_user` (`rider_user_id`,`created_at`),
  CONSTRAINT `rider_compensation_parcel_fk` FOREIGN KEY (`shipping_job_id`) REFERENCES `shipping_parcels` (`shipping_job_id`) ON DELETE RESTRICT,
  CONSTRAINT `rider_compensation_rider_fk` FOREIGN KEY (`rider_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `rider_compensation_outcome_check` CHECK (`outcome` IN ('completed','failed','return')),
  CONSTRAINT `rider_compensation_rate_check` CHECK (`rate_paisa`>=0),
  CONSTRAINT `rider_compensation_amount_check` CHECK (`amount_paisa`>=0),
  CONSTRAINT `rider_compensation_status_check` CHECK (`status` IN ('earned','held','paid','reversed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS `rider_assignment_snapshots_no_update`;
CREATE TRIGGER `rider_assignment_snapshots_no_update` BEFORE UPDATE ON `rider_assignment_snapshots` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='rider_assignment_snapshot_immutable';
DROP TRIGGER IF EXISTS `rider_assignment_snapshots_no_delete`;
CREATE TRIGGER `rider_assignment_snapshots_no_delete` BEFORE DELETE ON `rider_assignment_snapshots` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='rider_assignment_snapshot_immutable';
DROP TRIGGER IF EXISTS `rider_cash_obligations_no_update`;
CREATE TRIGGER `rider_cash_obligations_no_update` BEFORE UPDATE ON `rider_cash_obligations` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='rider_cash_obligation_immutable';
DROP TRIGGER IF EXISTS `rider_cash_obligations_no_delete`;
CREATE TRIGGER `rider_cash_obligations_no_delete` BEFORE DELETE ON `rider_cash_obligations` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='rider_cash_obligation_immutable';
DROP TRIGGER IF EXISTS `rider_remittance_allocations_no_update`;
CREATE TRIGGER `rider_remittance_allocations_no_update` BEFORE UPDATE ON `rider_remittance_allocations` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='rider_remittance_allocation_immutable';
DROP TRIGGER IF EXISTS `rider_remittance_allocations_no_delete`;
CREATE TRIGGER `rider_remittance_allocations_no_delete` BEFORE DELETE ON `rider_remittance_allocations` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='rider_remittance_allocation_immutable';
DROP TRIGGER IF EXISTS `rider_compensation_entries_no_update`;
CREATE TRIGGER `rider_compensation_entries_no_update` BEFORE UPDATE ON `rider_compensation_entries` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='rider_compensation_immutable';
DROP TRIGGER IF EXISTS `rider_compensation_entries_no_delete`;
CREATE TRIGGER `rider_compensation_entries_no_delete` BEFORE DELETE ON `rider_compensation_entries` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='rider_compensation_immutable';

-- Babal.Host password authentication and server-side sessions.
CREATE TABLE IF NOT EXISTS `user_credentials` (
  `user_id` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(191) NOT NULL,
  `password_salt` VARCHAR(191) NOT NULL,
  `password_version` BIGINT NOT NULL DEFAULT 1,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_sessions` (
  `token_hash` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `expires_at` BIGINT NOT NULL,
  `created_at` BIGINT NOT NULL,
  `last_seen_at` BIGINT NOT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `idx_user_sessions_user` (`user_id`),
  KEY `idx_user_sessions_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_login_challenges` (
  `token_hash` VARCHAR(64) NOT NULL,
  `code_hash` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `attempts` BIGINT NOT NULL DEFAULT 0,
  `expires_at` BIGINT NOT NULL,
  `created_at` BIGINT NOT NULL,
  `consumed_at` BIGINT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `idx_email_login_challenges_user_created` (`user_id`, `created_at`),
  KEY `idx_email_login_challenges_expiry` (`expires_at`),
  CONSTRAINT `email_login_challenges_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Foreign keys are added after every table exists to support circular references.
ALTER TABLE `addresses` ADD CONSTRAINT `addresses_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `backup_verifications` ADD CONSTRAINT `backup_verifications_verified_by_users_id_fk` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_cart_id_carts_id_fk` FOREIGN KEY (`cart_id`) REFERENCES `carts` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `carts` ADD CONSTRAINT `carts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `categories` ADD CONSTRAINT `categories_parent_id_categories_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `complaint_events` ADD CONSTRAINT `complaint_events_complaint_id_complaints_id_fk` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `complaint_events` ADD CONSTRAINT `complaint_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `complaints` ADD CONSTRAINT `complaints_customer_id_users_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `complaints` ADD CONSTRAINT `complaints_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `complaints` ADD CONSTRAINT `complaints_order_item_id_order_items_id_fk` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `complaints` ADD CONSTRAINT `complaints_seller_id_seller_profiles_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `complaints` ADD CONSTRAINT `complaints_assigned_to_users_id_fk` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `complaints` ADD CONSTRAINT `complaints_seller_responded_by_users_id_fk` FOREIGN KEY (`seller_responded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `complaints` ADD CONSTRAINT `complaints_escalated_to_users_id_fk` FOREIGN KEY (`escalated_to`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `data_rights_events` ADD CONSTRAINT `data_rights_events_data_rights_request_id_data_rights_0016aafd0c` FOREIGN KEY (`data_rights_request_id`) REFERENCES `data_rights_requests` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `data_rights_events` ADD CONSTRAINT `data_rights_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `data_rights_requests` ADD CONSTRAINT `data_rights_requests_customer_id_users_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `data_rights_requests` ADD CONSTRAINT `data_rights_requests_assigned_to_users_id_fk` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `inventory_adjustments` ADD CONSTRAINT `inventory_adjustments_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `inventory_adjustments` ADD CONSTRAINT `inventory_adjustments_seller_id_seller_profiles_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `inventory_adjustments` ADD CONSTRAINT `inventory_adjustments_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `moderation_events` ADD CONSTRAINT `moderation_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `notification_messages` ADD CONSTRAINT `notification_messages_recipient_user_id_users_id_fk` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `operational_incidents` ADD CONSTRAINT `operational_incidents_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `order_documents` ADD CONSTRAINT `order_documents_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `order_item_status_events` ADD CONSTRAINT `order_item_status_events_order_item_id_order_items_id_fk` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `order_item_status_events` ADD CONSTRAINT `order_item_status_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_seller_id_seller_profiles_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `order_policy_acceptances` ADD CONSTRAINT `order_policy_acceptances_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `order_policy_acceptances` ADD CONSTRAINT `order_policy_acceptances_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `order_status_events` ADD CONSTRAINT `order_status_events_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `order_status_events` ADD CONSTRAINT `order_status_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_users_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `payments` ADD CONSTRAINT `payments_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `payout_entries` ADD CONSTRAINT `payout_entries_payout_id_payouts_id_fk` FOREIGN KEY (`payout_id`) REFERENCES `payouts` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `payout_entries` ADD CONSTRAINT `payout_entries_ledger_entry_id_seller_ledger_entries_id_fk` FOREIGN KEY (`ledger_entry_id`) REFERENCES `seller_ledger_entries` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `payout_events` ADD CONSTRAINT `payout_events_payout_id_payouts_id_fk` FOREIGN KEY (`payout_id`) REFERENCES `payouts` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `payout_events` ADD CONSTRAINT `payout_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `payout_requests` ADD CONSTRAINT `payout_requests_seller_id_seller_profiles_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `payout_requests` ADD CONSTRAINT `payout_requests_payout_id_payouts_id_fk` FOREIGN KEY (`payout_id`) REFERENCES `payouts` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `payout_requests` ADD CONSTRAINT `payout_requests_processed_by_users_id_fk` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_seller_id_seller_profiles_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_prepared_by_users_id_fk` FOREIGN KEY (`prepared_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_processed_by_users_id_fk` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `policy_versions` ADD CONSTRAINT `policy_versions_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `policy_versions` ADD CONSTRAINT `policy_versions_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `product_media` ADD CONSTRAINT `product_media_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `product_occasions` ADD CONSTRAINT `product_occasions_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `product_occasions` ADD CONSTRAINT `product_occasions_occasion_id_occasions_id_fk` FOREIGN KEY (`occasion_id`) REFERENCES `occasions` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `product_reviews` ADD CONSTRAINT `product_reviews_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `product_reviews` ADD CONSTRAINT `product_reviews_customer_id_users_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `product_reviews` ADD CONSTRAINT `product_reviews_order_item_id_order_items_id_fk` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `product_reviews` ADD CONSTRAINT `product_reviews_moderated_by_users_id_fk` FOREIGN KEY (`moderated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `products` ADD CONSTRAINT `products_seller_id_seller_profiles_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `products` ADD CONSTRAINT `products_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `prohibited_product_rules` ADD CONSTRAINT `prohibited_product_rules_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `promotion_products` ADD CONSTRAINT `promotion_products_promotion_id_promotions_id_fk` FOREIGN KEY (`promotion_id`) REFERENCES `promotions` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `promotion_products` ADD CONSTRAINT `promotion_products_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `promotions` ADD CONSTRAINT `promotions_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `promotions` ADD CONSTRAINT `promotions_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `refund_liability_entries` ADD CONSTRAINT `refund_liability_entries_refund_id_refunds_id_fk` FOREIGN KEY (`refund_id`) REFERENCES `refunds` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `refund_liability_entries` ADD CONSTRAINT `refund_liability_entries_seller_id_seller_profiles_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_return_request_id_return_requests_id_fk` FOREIGN KEY (`return_request_id`) REFERENCES `return_requests` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_requested_by_users_id_fk` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_high_value_approved_by_users_id_fk` FOREIGN KEY (`high_value_approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_processed_by_users_id_fk` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `return_evidence` ADD CONSTRAINT `return_evidence_return_request_id_return_requests_id_fk` FOREIGN KEY (`return_request_id`) REFERENCES `return_requests` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `return_evidence` ADD CONSTRAINT `return_evidence_uploaded_by_users_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `return_outcomes` ADD CONSTRAINT `return_outcomes_return_request_id_return_requests_id_fk` FOREIGN KEY (`return_request_id`) REFERENCES `return_requests` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `return_outcomes` ADD CONSTRAINT `return_outcomes_refund_id_refunds_id_fk` FOREIGN KEY (`refund_id`) REFERENCES `refunds` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `return_outcomes` ADD CONSTRAINT `return_outcomes_resolved_by_users_id_fk` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `return_request_events` ADD CONSTRAINT `return_request_events_return_request_id_return_requests_id_fk` FOREIGN KEY (`return_request_id`) REFERENCES `return_requests` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `return_request_events` ADD CONSTRAINT `return_request_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `return_requests` ADD CONSTRAINT `return_requests_order_item_id_order_items_id_fk` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `return_requests` ADD CONSTRAINT `return_requests_requested_by_users_id_fk` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `return_requests` ADD CONSTRAINT `return_requests_seller_responded_by_users_id_fk` FOREIGN KEY (`seller_responded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `return_requests` ADD CONSTRAINT `return_requests_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `seller_documents` ADD CONSTRAINT `seller_documents_seller_id_seller_profiles_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `seller_documents` ADD CONSTRAINT `seller_documents_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `seller_ledger_entries` ADD CONSTRAINT `seller_ledger_entries_seller_id_seller_profiles_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `seller_ledger_entries` ADD CONSTRAINT `seller_ledger_entries_order_item_id_order_items_id_fk` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `seller_ledger_entries` ADD CONSTRAINT `seller_ledger_entries_refund_id_refunds_id_fk` FOREIGN KEY (`refund_id`) REFERENCES `refunds` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `seller_ledger_entries` ADD CONSTRAINT `seller_ledger_entries_payout_id_payouts_id_fk` FOREIGN KEY (`payout_id`) REFERENCES `payouts` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `seller_profiles` ADD CONSTRAINT `seller_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `seller_profiles` ADD CONSTRAINT `seller_profiles_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `shipment_events` ADD CONSTRAINT `shipment_events_shipment_id_shipments_id_fk` FOREIGN KEY (`shipment_id`) REFERENCES `shipments` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `shipping_job_events` ADD CONSTRAINT `shipping_job_events_shipping_job_id_shipping_jobs_id_fk` FOREIGN KEY (`shipping_job_id`) REFERENCES `shipping_jobs` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `shipping_job_events` ADD CONSTRAINT `shipping_job_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `shipping_jobs` ADD CONSTRAINT `shipping_jobs_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `shipping_jobs` ADD CONSTRAINT `shipping_jobs_seller_id_seller_profiles_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `shipping_jobs` ADD CONSTRAINT `shipping_jobs_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `staff_invitations` ADD CONSTRAINT `staff_invitations_invited_by_users_id_fk` FOREIGN KEY (`invited_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `staff_invitations` ADD CONSTRAINT `staff_invitations_accepted_by_users_id_fk` FOREIGN KEY (`accepted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_assigned_by_users_id_fk` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `wishlist_items` ADD CONSTRAINT `wishlist_items_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `wishlist_items` ADD CONSTRAINT `wishlist_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `user_credentials` ADD CONSTRAINT `user_credentials_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- Production-safe discovery taxonomy. No sample users, sellers, or products are inserted.
INSERT IGNORE INTO `categories` (`id`, `parent_id`, `slug`, `name_en`, `name_ne`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
  ('cat-gifts', NULL, 'gifts', 'Gifts', 'उपहार', 1, 10, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-home-decor', NULL, 'home-decor', 'Home decor', 'गृह सजावट', 1, 20, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-jewelry-accessories', NULL, 'jewelry-accessories', 'Jewelry & accessories', 'गहना तथा सहायक सामग्री', 1, 30, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-traditional-textiles', NULL, 'traditional-textiles', 'Traditional textiles', 'परम्परागत कपडा', 1, 40, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-lifestyle', NULL, 'lifestyle', 'Lifestyle', 'जीवनशैली', 1, 50, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-art-paintings', NULL, 'art-paintings', 'Art & paintings', 'कला तथा चित्रकला', 1, 60, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-pottery', NULL, 'pottery', 'Pottery', 'माटोका भाँडा', 1, 70, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-wood-bamboo-craft', NULL, 'wood-bamboo-craft', 'Wood/bamboo craft', 'काठ तथा बाँसका हस्तकला', 1, 80, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-personalized-gifts', NULL, 'personalized-gifts', 'Personalized gifts', 'व्यक्तिगत उपहार', 1, 90, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-corporate-gifting', NULL, 'corporate-gifting', 'Corporate gifting', 'संस्थागत उपहार', 1, 100, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000);

INSERT IGNORE INTO `occasions` (`id`, `slug`, `name_en`, `name_ne`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
  ('occasion-birthday', 'birthday-gifts', 'Birthday gifts', 'जन्मदिनका उपहार', 1, 10, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-wedding', 'wedding-gifts', 'Wedding gifts', 'विवाहका उपहार', 1, 20, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-dashain', 'dashain-gifts', 'Dashain gifts', 'दशैंका उपहार', 1, 30, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-tihar', 'tihar-gifts', 'Tihar gifts', 'तिहारका उपहार', 1, 40, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-mothers-day', 'mothers-day', 'Mother''s Day', 'आमाको मुख हेर्ने दिन', 1, 50, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-fathers-day', 'fathers-day', 'Father''s Day', 'बुबाको मुख हेर्ने दिन', 1, 60, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-anniversary', 'anniversary', 'Anniversary', 'वार्षिकोत्सव', 1, 70, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-corporate', 'corporate-gifts', 'Corporate gifts', 'संस्थागत उपहार', 1, 80, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-nepali-abroad', 'nepali-gifts-abroad', 'Nepali gifts abroad', 'विदेशमा नेपाली उपहार', 1, 90, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-housewarming', 'housewarming', 'Housewarming', 'गृहप्रवेशका उपहार', 1, 100, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-personalized', 'personalized-gifts', 'Personalized gifts', 'व्यक्तिगत उपहार', 1, 110, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000);

CREATE TABLE IF NOT EXISTS `hastabazaar_schema_versions` (
  `version` VARCHAR(64) NOT NULL,
  `applied_at` BIGINT NOT NULL,
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO `hastabazaar_schema_versions` (`version`, `applied_at`) VALUES ('0020_snapshot', UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000);

SET FOREIGN_KEY_CHECKS = 1;
