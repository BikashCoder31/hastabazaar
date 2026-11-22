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
  CONSTRAINT `payouts_amount_positive` CHECK (`amount_paisa` > 0)
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
  CONSTRAINT `promotions_window_valid` CHECK (`ends_at` > `starts_at`)
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

-- Additive R021: NULL applicant_type means legacy/unclassified; never backfill old applications.
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS applicant_type VARCHAR(20) NULL;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS registration_authority_key VARCHAR(191) GENERATED ALWAYS AS (NULLIF(registration_authority,'')) STORED;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS registration_number_key VARCHAR(191) GENERATED ALWAYS AS (NULLIF(registration_number,'')) STORED;
ALTER TABLE seller_profiles DROP INDEX IF EXISTS idx_seller_profiles_registration_unique;
CREATE UNIQUE INDEX idx_seller_profiles_registration_unique ON seller_profiles(registration_authority_key,registration_number_key);

-- Additive, repeatable. Apply before deploying delivery maps and assignments.
CREATE TABLE IF NOT EXISTS address_locations (
 address_id VARCHAR(191) PRIMARY KEY NOT NULL,
 latitude DOUBLE NOT NULL, longitude DOUBLE NOT NULL,
 FOREIGN KEY(address_id) REFERENCES addresses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS delivery_assignments (
 order_id VARCHAR(191) PRIMARY KEY NOT NULL,
 method VARCHAR(20) NOT NULL,
 rider_user_id VARCHAR(191) NULL, courier_name VARCHAR(120) NULL,
 tracking_url VARCHAR(500) NULL, tracking_reference VARCHAR(80) NULL,
 latitude DOUBLE NULL, longitude DOUBLE NULL, accuracy DOUBLE NULL, position_at BIGINT NULL,
 assigned_by VARCHAR(191) NOT NULL, updated_at BIGINT NOT NULL,
 FOREIGN KEY(order_id) REFERENCES orders(id), FOREIGN KEY(rider_user_id) REFERENCES users(id),
 FOREIGN KEY(assigned_by) REFERENCES users(id), INDEX idx_delivery_rider(rider_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DROP TRIGGER IF EXISTS clear_closed_delivery_location;
CREATE TRIGGER clear_closed_delivery_location AFTER UPDATE ON orders FOR EACH ROW
UPDATE delivery_assignments SET latitude=NULL,longitude=NULL,accuracy=NULL,position_at=NULL
WHERE order_id=NEW.id AND NEW.status <> 'dispatched';

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
ALTER TABLE `seller_participation_profiles` ADD COLUMN IF NOT EXISTS `managed_agreement_version` VARCHAR(191) NULL;
ALTER TABLE `seller_participation_profiles` ADD COLUMN IF NOT EXISTS `managed_agreement_language` VARCHAR(8) NULL;
ALTER TABLE `seller_participation_profiles` ADD COLUMN IF NOT EXISTS `managed_agreement_accepted_at` BIGINT NULL;

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

ALTER TABLE `managed_commercial_snapshots` ADD CONSTRAINT `managed_snapshots_order_item_fk` FOREIGN KEY IF NOT EXISTS `managed_snapshots_order_item_fk` (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_commercial_snapshots` ADD CONSTRAINT `managed_snapshots_seller_fk` FOREIGN KEY IF NOT EXISTS `managed_snapshots_seller_fk` (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_entitlements` ADD CONSTRAINT `managed_entitlements_snapshot_fk` FOREIGN KEY IF NOT EXISTS `managed_entitlements_snapshot_fk` (`snapshot_id`) REFERENCES `managed_commercial_snapshots` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_entitlements` ADD CONSTRAINT `managed_entitlements_seller_fk` FOREIGN KEY IF NOT EXISTS `managed_entitlements_seller_fk` (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_settlement_entries` ADD CONSTRAINT `managed_settlement_entitlement_fk` FOREIGN KEY IF NOT EXISTS `managed_settlement_entitlement_fk` (`entitlement_id`) REFERENCES `managed_entitlements` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_settlement_entries` ADD CONSTRAINT `managed_settlement_refund_fk` FOREIGN KEY IF NOT EXISTS `managed_settlement_refund_fk` (`refund_id`) REFERENCES `refunds` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_settlement_entries` ADD CONSTRAINT `managed_settlement_user_fk` FOREIGN KEY IF NOT EXISTS `managed_settlement_user_fk` (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `managed_payouts` ADD CONSTRAINT `managed_payouts_seller_fk` FOREIGN KEY IF NOT EXISTS `managed_payouts_seller_fk` (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_payouts` ADD CONSTRAINT `managed_payouts_preparer_fk` FOREIGN KEY IF NOT EXISTS `managed_payouts_preparer_fk` (`prepared_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_payouts` ADD CONSTRAINT `managed_payouts_approver_fk` FOREIGN KEY IF NOT EXISTS `managed_payouts_approver_fk` (`approved_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_payout_entries` ADD CONSTRAINT `managed_payout_entries_payout_fk` FOREIGN KEY IF NOT EXISTS `managed_payout_entries_payout_fk` (`payout_id`) REFERENCES `managed_payouts` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_payout_entries` ADD CONSTRAINT `managed_payout_entries_settlement_fk` FOREIGN KEY IF NOT EXISTS `managed_payout_entries_settlement_fk` (`settlement_entry_id`) REFERENCES `managed_settlement_entries` (`id`) ON DELETE RESTRICT;
ALTER TABLE `managed_invoice_groups` ADD CONSTRAINT `managed_invoice_order_fk` FOREIGN KEY IF NOT EXISTS `managed_invoice_order_fk` (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT;

-- Additive product-specific materials and origin story fields.
ALTER TABLE `products`
  ADD COLUMN IF NOT EXISTS `materials_json` LONGTEXT NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS `origin_story` LONGTEXT NULL;
-- Preserve existing country values and order snapshots. Origin remains unverified until evidence is recorded.
ALTER TABLE products ADD COLUMN IF NOT EXISTS origin_evidence_status VARCHAR(32) NOT NULL DEFAULT 'unverified';
ALTER TABLE products ADD COLUMN IF NOT EXISTS origin_evidence_reference LONGTEXT NULL;
ALTER TABLE products ALTER COLUMN country_of_origin SET DEFAULT '';

-- Additive purchaser, recipient, and saved-address checkout snapshots.
ALTER TABLE `orders`
  ADD COLUMN IF NOT EXISTS `delivery_for` VARCHAR(16) NOT NULL DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS `recipient_email` VARCHAR(254) NULL,
  ADD COLUMN IF NOT EXISTS `source_address_id` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `address_saved_for_future` BIGINT NOT NULL DEFAULT 0;

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

-- Additive. Stop traffic during trigger replacement. No historical backfill.
CREATE TABLE IF NOT EXISTS shipping_parcels (
 shipping_job_id VARCHAR(191) PRIMARY KEY REFERENCES shipping_jobs(id),
 cod_due_paisa BIGINT NOT NULL CHECK(cod_due_paisa>=0),
 collected_paisa BIGINT NOT NULL DEFAULT 0 CHECK(collected_paisa>=0 AND collected_paisa<=cod_due_paisa),
 remitted_paisa BIGINT NOT NULL DEFAULT 0 CHECK(remitted_paisa>=0 AND remitted_paisa<=collected_paisa),
 version BIGINT NOT NULL DEFAULT 0,
 operation_request_id VARCHAR(191),
 method VARCHAR(32),
 rider_user_id VARCHAR(191) REFERENCES users(id),
 courier_name VARCHAR(120),
 tracking_url TEXT,
 latitude DOUBLE,
 longitude DOUBLE,
 accuracy DOUBLE,
 position_at BIGINT,
 delivered_at BIGINT,
 created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parcel_cash_records (
 id VARCHAR(191) PRIMARY KEY,
 shipping_job_id VARCHAR(191) NOT NULL REFERENCES shipping_parcels(shipping_job_id),
 kind VARCHAR(32) NOT NULL CHECK(kind IN ('collection','remittance')),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0),
 evidence_reference VARCHAR(120) NOT NULL,
 status VARCHAR(32) NOT NULL CHECK(status IN ('pending','posted','rejected')),
 created_by VARCHAR(191) NOT NULL REFERENCES users(id),
 approved_by VARCHAR(191) REFERENCES users(id),
 created_at BIGINT NOT NULL,
 approved_at BIGINT,
 CHECK(kind<>'remittance' OR status<>'posted' OR (approved_by IS NOT NULL AND approved_by<>created_by)),
 UNIQUE(kind,evidence_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parcel_operation_events (
 id VARCHAR(191) PRIMARY KEY,
 order_id VARCHAR(191) NOT NULL REFERENCES orders(id),
 shipping_job_id VARCHAR(191) REFERENCES shipping_parcels(shipping_job_id),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),
 action VARCHAR(40) NOT NULL,
 payload_json TEXT NOT NULL,
 note TEXT NOT NULL,
 created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_parcel_cash_status ON parcel_cash_records(status,created_at);

DROP TRIGGER IF EXISTS parcel_cash_posted_no_update;
DELIMITER $$
CREATE TRIGGER parcel_cash_posted_no_update BEFORE UPDATE ON parcel_cash_records FOR EACH ROW BEGIN IF OLD.status='posted' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='posted_cash_immutable'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS parcel_cash_posted_no_delete;
DELIMITER $$
CREATE TRIGGER parcel_cash_posted_no_delete BEFORE DELETE ON parcel_cash_records FOR EACH ROW BEGIN IF OLD.status='posted' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='posted_cash_immutable'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS clear_closed_parcel_location;
DELIMITER $$
CREATE TRIGGER clear_closed_parcel_location AFTER UPDATE ON shipping_jobs FOR EACH ROW BEGIN IF NEW.status<>'dispatched' THEN UPDATE shipping_parcels SET latitude=NULL,longitude=NULL,accuracy=NULL,position_at=NULL WHERE shipping_job_id=NEW.id; END IF; END$$
DELIMITER ;

CREATE TABLE IF NOT EXISTS operation_transaction_guards (
 id VARCHAR(191) PRIMARY KEY,
 valid BIGINT NOT NULL CHECK(valid=1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS close_cancelled_order_parcels;
DELIMITER $$
CREATE TRIGGER close_cancelled_order_parcels AFTER UPDATE ON orders FOR EACH ROW BEGIN IF NEW.status='cancelled' AND OLD.status<>'cancelled' THEN UPDATE shipping_jobs SET status='cancelled',updated_at=NEW.updated_at WHERE order_id=NEW.id AND direction='outbound' AND status<>'cancelled'; END IF; END$$
DELIMITER ;
-- Additive: no overrides means existing Admin permissions are retained.
CREATE TABLE IF NOT EXISTS staff_permission_profiles (
 user_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES users(id),
 permissions_json TEXT NOT NULL,
 last_request_id TEXT,
 version BIGINT NOT NULL DEFAULT 0,
 updated_by VARCHAR(191) NOT NULL REFERENCES users(id),
 updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS staff_permission_requests (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 user_id VARCHAR(191) NOT NULL REFERENCES users(id),
 permissions_json TEXT NOT NULL,
 expected_version BIGINT NOT NULL,
 preset_name TEXT,
 reason TEXT NOT NULL,
 proposed_by VARCHAR(191) NOT NULL REFERENCES users(id),
 proposed_at BIGINT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 decided_by VARCHAR(191) REFERENCES users(id),
 decided_at BIGINT,
 decision_note TEXT,
 decision_token TEXT,
 CHECK(decided_by IS NULL OR decided_by <> proposed_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS staff_permission_presets (
 id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES staff_permission_requests(id),
 name TEXT NOT NULL,
 permissions_json TEXT NOT NULL,
 created_by VARCHAR(191) NOT NULL REFERENCES users(id),
 created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS staff_permission_guards (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 valid BIGINT NOT NULL CHECK(valid = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS rider_policy_versions (version BIGINT PRIMARY KEY,proof_required BIGINT NOT NULL CHECK(proof_required=1),open_box BIGINT NOT NULL,otp_scope VARCHAR(191) NOT NULL,created_by VARCHAR(191),created_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO rider_policy_versions(version,proof_required,open_box,otp_scope,created_at) VALUES (0,1,0,'off',0);
CREATE TABLE IF NOT EXISTS rider_profiles (
 user_id VARCHAR(191) PRIMARY KEY REFERENCES users(id), status VARCHAR(191) NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','approved','rejected','suspended')), application_id VARCHAR(191) NOT NULL, version BIGINT NOT NULL DEFAULT 0, reviewed_by VARCHAR(191), review_note TEXT, updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS rider_applications (
 id VARCHAR(191) PRIMARY KEY, user_id VARCHAR(191) NOT NULL REFERENCES users(id), legal_name VARCHAR(191) NOT NULL, phone VARCHAR(191) NOT NULL, district VARCHAR(191) NOT NULL, identity_type VARCHAR(191) NOT NULL, identity_number VARCHAR(191) NOT NULL, object_key VARCHAR(500) NOT NULL, mime_type VARCHAR(191) NOT NULL, created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS rider_policy (
 id VARCHAR(191) PRIMARY KEY, version BIGINT NOT NULL DEFAULT 0, proof_required BIGINT NOT NULL DEFAULT 1 CHECK(proof_required=1), open_box BIGINT NOT NULL DEFAULT 0 CHECK(open_box IN (0,1)), otp_scope VARCHAR(191) NOT NULL DEFAULT 'off' CHECK(otp_scope IN ('off','prepaid_only')), updated_by VARCHAR(191), updated_at BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO rider_policy(id) VALUES ('current');
CREATE TABLE IF NOT EXISTS rider_reports (
 id VARCHAR(191) PRIMARY KEY, shipping_job_id VARCHAR(191) NOT NULL REFERENCES shipping_jobs(id), rider_user_id VARCHAR(191) NOT NULL REFERENCES users(id), assignment_version BIGINT NOT NULL, kind VARCHAR(191) NOT NULL CHECK(kind IN ('delivered','failed_delivery','customer_unavailable')), note TEXT NOT NULL, object_key VARCHAR(191), mime_type VARCHAR(191), cash_paisa BIGINT NOT NULL DEFAULT 0 CHECK(cash_paisa>=0), status VARCHAR(191) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')), reviewed_by VARCHAR(191), review_note TEXT, created_at BIGINT NOT NULL, reviewed_at BIGINT, request_id VARCHAR(191) NOT NULL UNIQUE, policy_version BIGINT NOT NULL, open_box BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS rider_events (
 id VARCHAR(191) PRIMARY KEY, user_id VARCHAR(191) NOT NULL, actor_id VARCHAR(191) NOT NULL, action VARCHAR(191) NOT NULL, report_id VARCHAR(191), note TEXT NOT NULL, created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS rider_otp_challenges (
 shipping_job_id VARCHAR(191) PRIMARY KEY REFERENCES shipping_jobs(id), rider_user_id VARCHAR(191) NOT NULL, assignment_version BIGINT NOT NULL, code_hash VARCHAR(191) NOT NULL, expires_at BIGINT NOT NULL, attempts BIGINT NOT NULL DEFAULT 0, consumed_at BIGINT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX IF NOT EXISTS idx_rider_reports_queue ON rider_reports(status,created_at);
CREATE INDEX IF NOT EXISTS idx_rider_reports_assignment ON rider_reports(shipping_job_id,rider_user_id);

DROP TRIGGER IF EXISTS rider_application_no_update;
DELIMITER $$
CREATE TRIGGER rider_application_no_update BEFORE UPDATE ON rider_applications FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rider evidence history is immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS rider_application_no_delete;
DELIMITER $$
CREATE TRIGGER rider_application_no_delete BEFORE DELETE ON rider_applications FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rider evidence history is immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS rider_events_no_update;
DELIMITER $$
CREATE TRIGGER rider_events_no_update BEFORE UPDATE ON rider_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rider evidence history is immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS rider_events_no_delete;
DELIMITER $$
CREATE TRIGGER rider_events_no_delete BEFORE DELETE ON rider_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rider evidence history is immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS rider_report_no_delete;
DELIMITER $$
CREATE TRIGGER rider_report_no_delete BEFORE DELETE ON rider_reports FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rider evidence history is immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS rider_report_evidence_immutable;
DELIMITER $$
CREATE TRIGGER rider_report_evidence_immutable BEFORE UPDATE ON rider_reports FOR EACH ROW BEGIN IF (OLD.status IN ('accepted','rejected') AND NOT (NEW.status <=> OLD.status AND NEW.reviewed_by <=> OLD.reviewed_by AND NEW.review_note <=> OLD.review_note AND NEW.reviewed_at <=> OLD.reviewed_at)) OR NOT (NEW.id <=> OLD.id AND NEW.shipping_job_id <=> OLD.shipping_job_id AND NEW.rider_user_id <=> OLD.rider_user_id AND NEW.assignment_version <=> OLD.assignment_version AND NEW.kind <=> OLD.kind AND NEW.note <=> OLD.note AND NEW.object_key <=> OLD.object_key AND NEW.mime_type <=> OLD.mime_type AND NEW.cash_paisa <=> OLD.cash_paisa AND NEW.created_at <=> OLD.created_at AND NEW.request_id <=> OLD.request_id AND NEW.policy_version <=> OLD.policy_version AND NEW.open_box <=> OLD.open_box) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rider report evidence is immutable'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS rider_policy_versions_no_update;
DELIMITER $$
CREATE TRIGGER rider_policy_versions_no_update BEFORE UPDATE ON rider_policy_versions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rider policy history is immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS rider_policy_versions_no_delete;
DELIMITER $$
CREATE TRIGGER rider_policy_versions_no_delete BEFORE DELETE ON rider_policy_versions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rider policy history is immutable'; END$$
DELIMITER ;
-- Per-assignment open-box and rider-finance snapshots. This is additive and
-- contains no production values or fictional records.
ALTER TABLE `rider_profiles`
  ADD COLUMN IF NOT EXISTS `open_box_eligible` BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `open_box_reviewed_by` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `open_box_reviewed_at` BIGINT NULL,
  ADD CONSTRAINT IF NOT EXISTS `rider_profiles_open_box_eligible_check` CHECK (`open_box_eligible` IN (0,1)),
  ADD CONSTRAINT `rider_profiles_open_box_reviewer_fk` FOREIGN KEY IF NOT EXISTS `rider_profiles_open_box_reviewer_fk` (`open_box_reviewed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT;

ALTER TABLE `shipping_parcels`
  ADD COLUMN IF NOT EXISTS `open_box_required` BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `open_box_snapshot_json` LONGTEXT NULL,
  ADD COLUMN IF NOT EXISTS `rider_finance_snapshot_json` LONGTEXT NULL,
  ADD CONSTRAINT IF NOT EXISTS `shipping_parcels_open_box_required_check` CHECK (`open_box_required` IN (0,1));

ALTER TABLE `parcel_cash_records`
  ADD COLUMN IF NOT EXISTS `rider_user_id` VARCHAR(191) NULL,
  ADD CONSTRAINT `parcel_cash_records_rider_fk` FOREIGN KEY IF NOT EXISTS `parcel_cash_records_rider_fk` (`rider_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT;

ALTER TABLE `rider_reports`
  ADD COLUMN IF NOT EXISTS `open_box_outcome` VARCHAR(80) NOT NULL DEFAULT 'not_applicable',
  ADD CONSTRAINT IF NOT EXISTS `rider_reports_open_box_outcome_check` CHECK (`open_box_outcome` IN ('not_applicable','accepted_after_inspection','accepted_outer_packaging_inner_seal_intact','inspection_declined','refused_whole_parcel_wrong_item','refused_whole_parcel_damage','refused_whole_parcel_other'));

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

CREATE TABLE IF NOT EXISTS `recently_viewed_products` (
  `user_id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `last_viewed_at` BIGINT NOT NULL,
  PRIMARY KEY (`user_id`,`product_id`),
  KEY `idx_recently_viewed_user_time` (`user_id`,`last_viewed_at`),
  CONSTRAINT `recently_viewed_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `recently_viewed_product_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Additive staging migration. Fixed-price supplier records and route transitions remain simulated.
CREATE TABLE IF NOT EXISTS `managed_supply_records` (`id` VARCHAR(191) PRIMARY KEY,`seller_id` VARCHAR(191) NOT NULL,`product_id` VARCHAR(191) NOT NULL,`quantity_proposed` BIGINT NOT NULL,`quantity_accepted` BIGINT NULL,`agreed_unit_paisa` BIGINT NOT NULL,`accepted_total_paisa` BIGINT NULL,`status` VARCHAR(32) NOT NULL,`possession_status` VARCHAR(32) NOT NULL,`quality_status` VARCHAR(32) NOT NULL,`ownership_record_status` VARCHAR(32) NOT NULL,`risk_record_status` VARCHAR(32) NOT NULL,`evidence_reference` VARCHAR(191) NULL,`agreement_version` VARCHAR(191) NOT NULL,`agreement_language` VARCHAR(8) NOT NULL,`payout_beneficiary_reference` VARCHAR(191) NOT NULL,`simulation_label` VARCHAR(191) NOT NULL,`created_by` VARCHAR(191) NOT NULL,`decided_by` VARCHAR(191) NULL,`decision_reason` LONGTEXT NULL,`proposal_request_id` VARCHAR(191) NOT NULL UNIQUE,`decision_request_id` VARCHAR(191) NULL UNIQUE,`created_at` BIGINT NOT NULL,`decided_at` BIGINT NULL,KEY `idx_managed_supply_seller_status` (`seller_id`,`status`,`created_at`),FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles`(`id`) ON DELETE RESTRICT,FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT,FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,CHECK(`quantity_proposed`>0),CHECK(`agreed_unit_paisa`>0),CHECK(`status` IN ('proposed','accepted','rejected','cancelled')),CHECK(`decided_by` IS NULL OR `decided_by`<>`created_by`),CHECK(`status`<>'accepted' OR (`quantity_accepted`>0 AND `accepted_total_paisa`=`quantity_accepted`*`agreed_unit_paisa` AND `possession_status`='received' AND `quality_status`='accepted'))) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `managed_supplier_obligations` (`id` VARCHAR(191) PRIMARY KEY,`seller_id` VARCHAR(191) NOT NULL,`original_amount_paisa` BIGINT NOT NULL,`payout_beneficiary_reference` VARCHAR(191) NOT NULL,`agreement_version` VARCHAR(191) NOT NULL,`agreement_language` VARCHAR(8) NOT NULL,`status` VARCHAR(32) NOT NULL,`owed_at` BIGINT NOT NULL,`eligible_at` BIGINT NOT NULL,`created_at` BIGINT NOT NULL,FOREIGN KEY (`id`) REFERENCES `managed_supply_records`(`id`) ON DELETE RESTRICT,FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles`(`id`) ON DELETE RESTRICT,CHECK(`original_amount_paisa`>0)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `managed_supplier_adjustments` (`id` VARCHAR(191) PRIMARY KEY,`obligation_id` VARCHAR(191) NOT NULL,`kind` VARCHAR(32) NOT NULL,`amount_paisa` BIGINT NOT NULL,`reason` LONGTEXT NOT NULL,`request_id` VARCHAR(191) NOT NULL UNIQUE,`created_by` VARCHAR(191) NOT NULL,`created_at` BIGINT NOT NULL,FOREIGN KEY (`obligation_id`) REFERENCES `managed_supplier_obligations`(`id`) ON DELETE RESTRICT,FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,CHECK(`amount_paisa`>0)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `managed_supplier_payments` (`id` VARCHAR(191) PRIMARY KEY,`obligation_id` VARCHAR(191) NOT NULL,`amount_paisa` BIGINT NOT NULL,`status` VARCHAR(32) NOT NULL,`destination_reference` VARCHAR(191) NOT NULL,`simulation_label` VARCHAR(191) NOT NULL,`prepared_by` VARCHAR(191) NOT NULL,`approved_by` VARCHAR(191) NULL,`request_id` VARCHAR(191) NOT NULL UNIQUE,`created_at` BIGINT NOT NULL,`updated_at` BIGINT NOT NULL,`paid_at` BIGINT NULL,KEY `idx_managed_supplier_payment_obligation` (`obligation_id`,`status`),FOREIGN KEY (`obligation_id`) REFERENCES `managed_supplier_obligations`(`id`) ON DELETE RESTRICT,FOREIGN KEY (`prepared_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,CHECK(`amount_paisa`>0),CHECK(`approved_by` IS NULL OR `approved_by`<>`prepared_by`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `seller_route_transition_applications` (`id` VARCHAR(191) PRIMARY KEY,`seller_id` VARCHAR(191) NOT NULL,`from_route` VARCHAR(32) NOT NULL,`to_route` VARCHAR(32) NOT NULL,`status` VARCHAR(32) NOT NULL,`legal_name` VARCHAR(191) NOT NULL,`registration_authority` VARCHAR(191) NOT NULL,`registration_number` VARCHAR(191) NOT NULL,`tax_mode` VARCHAR(16) NOT NULL,`tax_registration_number` VARCHAR(191) NOT NULL,`evidence_references_json` LONGTEXT NOT NULL,`agreement_version` VARCHAR(191) NOT NULL,`agreement_language` VARCHAR(8) NOT NULL,`agreement_accepted_at` BIGINT NOT NULL,`requested_by` VARCHAR(191) NOT NULL,`reviewed_by` VARCHAR(191) NULL,`review_reason` LONGTEXT NULL,`effective_at` BIGINT NULL,`applied_at` BIGINT NULL,`request_id` VARCHAR(191) NOT NULL UNIQUE,`decision_request_id` VARCHAR(191) NULL UNIQUE,`version` BIGINT NOT NULL,`created_at` BIGINT NOT NULL,`updated_at` BIGINT NOT NULL,`open_seller_key` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `status` IN ('submitted','under_review','changes_requested','scheduled') THEN `seller_id` ELSE NULL END) STORED,UNIQUE KEY `idx_seller_route_transition_open` (`open_seller_key`),KEY `idx_seller_route_transition_due` (`status`,`effective_at`),FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles`(`id`) ON DELETE RESTRICT,FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,CHECK(`reviewed_by` IS NULL OR `reviewed_by`<>`requested_by`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `seller_agreement_acceptance_history` (`id` VARCHAR(191) PRIMARY KEY,`seller_id` VARCHAR(191) NOT NULL,`agreement_version` VARCHAR(191) NOT NULL,`language_presented` VARCHAR(8) NOT NULL,`commission_setting_version_id` VARCHAR(191) NULL,`commission_bps` BIGINT NOT NULL,`acceptance_request_id` VARCHAR(191) NOT NULL UNIQUE,`accepted_by` VARCHAR(191) NOT NULL,`accepted_at` BIGINT NOT NULL,`simulation_label` VARCHAR(191) NULL,UNIQUE KEY `idx_seller_agreement_acceptance_unique` (`seller_id`,`agreement_version`,`language_presented`,`commission_setting_version_id`),KEY `idx_seller_agreement_acceptance_current` (`seller_id`,`commission_setting_version_id`,`accepted_at`),FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles`(`id`) ON DELETE RESTRICT,FOREIGN KEY (`commission_setting_version_id`) REFERENCES `business_setting_versions`(`id`) ON DELETE RESTRICT,FOREIGN KEY (`accepted_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,CHECK(`commission_bps` BETWEEN 0 AND 10000)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DROP TRIGGER IF EXISTS `managed_supplier_obligation_no_update`;
CREATE TRIGGER `managed_supplier_obligation_no_update` BEFORE UPDATE ON `managed_supplier_obligations` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Managed supplier obligation is immutable';
DROP TRIGGER IF EXISTS `managed_supplier_obligation_no_delete`;
CREATE TRIGGER `managed_supplier_obligation_no_delete` BEFORE DELETE ON `managed_supplier_obligations` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Managed supplier obligation is immutable';
DROP TRIGGER IF EXISTS `managed_supplier_adjustment_no_update`;
CREATE TRIGGER `managed_supplier_adjustment_no_update` BEFORE UPDATE ON `managed_supplier_adjustments` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Managed supplier adjustment is immutable';
DROP TRIGGER IF EXISTS `managed_supplier_adjustment_no_delete`;
CREATE TRIGGER `managed_supplier_adjustment_no_delete` BEFORE DELETE ON `managed_supplier_adjustments` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Managed supplier adjustment is immutable';
-- Append-only private evidence; deliberately no legacy acceptance backfill.
CREATE TABLE IF NOT EXISTS managed_maker_application_details (
  id VARCHAR(191) PRIMARY KEY NOT NULL,
  seller_id VARCHAR(191) NOT NULL,
  government_id_type VARCHAR(32) NOT NULL CHECK (government_id_type IN ('citizenship','national_id','passport','driving_licence','other_government_id')),
  government_id_description VARCHAR(200) NOT NULL DEFAULT '',
  personal_pan VARCHAR(9) NULL CHECK (personal_pan IS NULL OR personal_pan REGEXP '^[0-9]{9}$'),
  identity_document_id VARCHAR(191) NOT NULL,
  agreement_version VARCHAR(191) NOT NULL,
  agreement_accepted_at BIGINT NOT NULL CHECK (agreement_accepted_at > 0),
  agreement_accepted_by VARCHAR(191) NOT NULL,
  agreement_snapshot_json LONGTEXT NOT NULL CHECK (JSON_VALID(agreement_snapshot_json)),
  created_at BIGINT NOT NULL,
  INDEX managed_maker_details_seller(seller_id, created_at),
  FOREIGN KEY (seller_id) REFERENCES seller_profiles(id),
  FOREIGN KEY (identity_document_id) REFERENCES seller_documents(id),
  FOREIGN KEY (agreement_accepted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER IF NOT EXISTS managed_maker_details_no_update BEFORE UPDATE ON managed_maker_application_details FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Managed Maker agreement evidence is immutable'; END$$
CREATE TRIGGER IF NOT EXISTS managed_maker_details_no_delete BEFORE DELETE ON managed_maker_application_details FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Managed Maker agreement evidence is immutable'; END$$
DELIMITER ;
-- Apply after mariadb-policy-commission-9-percent.sql, before deploying the
-- Commission workspace. Historical order and ledger snapshots are untouched.
CREATE TABLE IF NOT EXISTS commission_control (
  id VARCHAR(191) PRIMARY KEY NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO commission_control(id, revision) VALUES ('default', 0);

CREATE TABLE IF NOT EXISTS commission_rate_changes (
  id VARCHAR(191) PRIMARY KEY NOT NULL,
  basis_points BIGINT NOT NULL CHECK (basis_points BETWEEN 0 AND 10000),
  effective_at BIGINT NOT NULL,
  agreement_version LONGTEXT NOT NULL,
  terms_text LONGTEXT NOT NULL,
  reason LONGTEXT NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id),
  CHECK (effective_at >= created_at + 1296000000),
  INDEX idx_commission_rates_effective (effective_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS commission_rate_cancellations (
  rate_id VARCHAR(191) PRIMARY KEY NOT NULL,
  request_id VARCHAR(191) NOT NULL UNIQUE,
  reason LONGTEXT NOT NULL,
  cancelled_by VARCHAR(191) NOT NULL,
  cancelled_at BIGINT NOT NULL,
  FOREIGN KEY (rate_id) REFERENCES commission_rate_changes(id),
  FOREIGN KEY (cancelled_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS commission_rate_acceptances (
  rate_id VARCHAR(191) NOT NULL,
  seller_id VARCHAR(191) NOT NULL,
  actor_id VARCHAR(191) NOT NULL,
  accepted_at BIGINT NOT NULL,
  PRIMARY KEY (rate_id, seller_id),
  FOREIGN KEY (rate_id) REFERENCES commission_rate_changes(id),
  FOREIGN KEY (seller_id) REFERENCES seller_profiles(id),
  FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX idx_commission_acceptances_seller (seller_id, rate_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Additive form catalog. Published rows are frozen; restore publishes a new version.
-- Catalog-owned identifiers use NO PAD binary collation to match D1 TEXT equality.
-- Actor IDs retain the users.id collation required by their foreign keys.
CREATE TABLE IF NOT EXISTS `form_config_versions` (
  `id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `form_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `version` BIGINT NOT NULL,
  `revision` BIGINT NOT NULL DEFAULT 1,
  `status` VARCHAR(32) COLLATE utf8mb4_nopad_bin NOT NULL DEFAULT 'draft',
  `config_json` LONGTEXT NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `created_by` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_by` VARCHAR(191) NOT NULL,
  `updated_at` BIGINT NOT NULL,
  `published_by` VARCHAR(191) NULL,
  `published_at` BIGINT NULL,
  `last_request_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_form_config_versions_form_version` (`form_id`,`version`),
  UNIQUE KEY `idx_form_config_versions_form_id` (`form_id`,`id`),
  UNIQUE KEY `idx_form_config_versions_request` (`last_request_id`),
  KEY `idx_form_config_versions_current` (`form_id`,`status`,`version` DESC),
  CONSTRAINT `form_config_versions_form_id_length` CHECK (CHAR_LENGTH(`form_id`) BETWEEN 1 AND 191),
  CONSTRAINT `form_config_versions_version` CHECK (`version` >= 1),
  CONSTRAINT `form_config_versions_revision` CHECK (`revision` >= 1),
  CONSTRAINT `form_config_versions_status` CHECK (`status` IN ('draft','published')),
  CONSTRAINT `form_config_versions_json` CHECK (JSON_VALID(`config_json`) AND JSON_TYPE(`config_json`) = 'OBJECT' AND OCTET_LENGTH(`config_json`) <= 65536),
  CONSTRAINT `form_config_versions_reason` CHECK (CHAR_LENGTH(TRIM(`reason`)) BETWEEN 1 AND 2000),
  CONSTRAINT `form_config_versions_request_length` CHECK (CHAR_LENGTH(`last_request_id`) BETWEEN 1 AND 191),
  CONSTRAINT `form_config_versions_publication` CHECK ((`status` = 'draft' AND `published_by` IS NULL AND `published_at` IS NULL) OR (`status` = 'published' AND `published_by` IS NOT NULL AND `published_at` IS NOT NULL)),
  CONSTRAINT `form_config_versions_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `form_config_versions_updated_by_fk` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `form_config_versions_published_by_fk` FOREIGN KEY (`published_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER IF NOT EXISTS `trg_form_config_versions_published_update` BEFORE UPDATE ON `form_config_versions` FOR EACH ROW BEGIN
  IF OLD.`status` = 'published' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'published form configuration is immutable'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER IF NOT EXISTS `trg_form_config_versions_published_delete` BEFORE DELETE ON `form_config_versions` FOR EACH ROW BEGIN
  IF OLD.`status` = 'published' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'published form configuration is immutable'; END IF;
END$$
DELIMITER ;

CREATE TABLE IF NOT EXISTS `form_answer_sets` (
  `id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `form_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `request_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `config_version_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `subject_type` VARCHAR(64) COLLATE utf8mb4_nopad_bin NOT NULL,
  `subject_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `actor_id` VARCHAR(191) NULL,
  `answers_json` LONGTEXT NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_form_answer_sets_form_request` (`form_id`,`request_id`),
  KEY `idx_form_answer_sets_owner` (`subject_type`,`subject_id`,`created_at`),
  KEY `idx_form_answer_sets_version` (`config_version_id`,`created_at`),
  CONSTRAINT `form_answer_sets_form_id_length` CHECK (CHAR_LENGTH(`form_id`) BETWEEN 1 AND 191),
  CONSTRAINT `form_answer_sets_request_length` CHECK (CHAR_LENGTH(`request_id`) BETWEEN 1 AND 191),
  CONSTRAINT `form_answer_sets_subject_type_length` CHECK (CHAR_LENGTH(`subject_type`) BETWEEN 1 AND 64),
  CONSTRAINT `form_answer_sets_subject_id_length` CHECK (CHAR_LENGTH(`subject_id`) BETWEEN 1 AND 191),
  CONSTRAINT `form_answer_sets_json` CHECK (JSON_VALID(`answers_json`) AND JSON_TYPE(`answers_json`) = 'OBJECT' AND OCTET_LENGTH(`answers_json`) <= 131072),
  CONSTRAINT `form_answer_sets_version_fk` FOREIGN KEY (`form_id`,`config_version_id`) REFERENCES `form_config_versions` (`form_id`,`id`) ON DELETE RESTRICT,
  CONSTRAINT `form_answer_sets_actor_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Additive optional category imagery; preserve categories, products and form history.
-- Asset/request identifiers keep SQLite text equality. Parent IDs keep the
-- production users/categories utf8mb4_unicode_ci foreign-key contract.
CREATE TABLE IF NOT EXISTS `category_media` (
  `id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `category_id` VARCHAR(191) NULL,
  `object_key` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `original_name` LONGTEXT NOT NULL,
  `mime_type` VARCHAR(32) COLLATE utf8mb4_nopad_bin NOT NULL,
  `size_bytes` BIGINT NOT NULL,
  `width` BIGINT NOT NULL,
  `height` BIGINT NOT NULL,
  `content_hash` VARCHAR(64) COLLATE utf8mb4_nopad_bin NOT NULL,
  `created_by` VARCHAR(191) NOT NULL,
  `request_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_category_media_object_key` (`object_key`),
  UNIQUE KEY `idx_category_media_actor_request` (`created_by`,`request_id`),
  KEY `idx_category_media_category` (`category_id`,`id`),
  CONSTRAINT `category_media_size` CHECK (`size_bytes`>0 AND `size_bytes`<=5242880),
  CONSTRAINT `category_media_dimensions` CHECK (`width`>0 AND `width`<=2400 AND `height`>0 AND `height`<=1600),
  CONSTRAINT `category_media_mime` CHECK (`mime_type`='image/webp'),
  CONSTRAINT `category_media_hash` CHECK (CHAR_LENGTH(`content_hash`)=64),
  CONSTRAINT `category_media_category_fk` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `category_media_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `category_image_assignments` (
  `category_id` VARCHAR(191) NOT NULL,
  `media_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NULL,
  `updated_by` VARCHAR(191) NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `idx_category_image_assignments_media` (`media_id`),
  CONSTRAINT `category_image_assignments_category_fk` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `category_image_assignments_media_fk` FOREIGN KEY (`media_id`) REFERENCES `category_media` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `category_image_assignments_updated_by_fk` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Additive stored legal-hold state. Placement/release is audited by the privacy repository.
CREATE TABLE IF NOT EXISTS `data_rights_legal_holds` (
  `id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `placed_by` VARCHAR(191) NOT NULL,
  `placed_at` BIGINT NOT NULL,
  `released_by` VARCHAR(191) NULL,
  `released_at` BIGINT NULL,
  `active_user_id` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `released_at` IS NULL THEN `user_id` ELSE NULL END) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_data_rights_legal_holds_one_active` (`active_user_id`),
  KEY `idx_data_rights_legal_holds_user_active` (`user_id`,`released_at`),
  CONSTRAINT `data_rights_legal_holds_reason` CHECK (CHAR_LENGTH(TRIM(`reason`)) BETWEEN 8 AND 2000),
  CONSTRAINT `data_rights_legal_holds_release` CHECK ((`released_by` IS NULL AND `released_at` IS NULL) OR (`released_by` IS NOT NULL AND `released_at` IS NOT NULL AND `released_at` >= `placed_at`)),
  CONSTRAINT `data_rights_legal_holds_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `data_rights_legal_holds_placed_by_fk` FOREIGN KEY (`placed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `data_rights_legal_holds_released_by_fk` FOREIGN KEY (`released_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Retain only the owner link needed to resolve historical form answers after
-- a saved address is hard-deleted. The old address ID intentionally has no FK.
CREATE TABLE IF NOT EXISTS `address_answer_owner_tombstones` (
  `address_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `deletion_request_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `deleted_at` BIGINT NOT NULL,
  PRIMARY KEY (`address_id`),
  KEY `idx_address_answer_owner_tombstones_user` (`user_id`,`deleted_at`,`address_id`),
  CONSTRAINT `address_answer_owner_tombstones_address_length` CHECK (CHAR_LENGTH(`address_id`) BETWEEN 1 AND 191),
  CONSTRAINT `address_answer_owner_tombstones_request_length` CHECK (CHAR_LENGTH(`deletion_request_id`) BETWEEN 1 AND 191),
  CONSTRAINT `address_answer_owner_tombstones_time` CHECK (`deleted_at` >= 0),
  CONSTRAINT `address_answer_owner_tombstones_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Durable public feedback delivery state. Sending is ambiguous until a confirmed
-- transport result and durable sent write; never automatically reclaim it.
CREATE TABLE IF NOT EXISTS `feedback_delivery_jobs` (
  `id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `request_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `form_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `config_version_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `payload_hash` VARCHAR(64) COLLATE utf8mb4_nopad_bin NOT NULL,
  `feedback_json` LONGTEXT NOT NULL,
  `status` VARCHAR(16) NOT NULL,
  `lease_token` VARCHAR(191) COLLATE utf8mb4_nopad_bin NULL,
  `lease_expires_at` BIGINT NULL,
  `attempt_count` BIGINT NOT NULL DEFAULT 0,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  `sent_at` BIGINT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_feedback_delivery_jobs_request` (`request_id`),
  KEY `idx_feedback_delivery_jobs_status_lease` (`status`,`lease_expires_at`,`updated_at`),
  KEY `idx_feedback_delivery_jobs_created` (`created_at`,`id`),
  CONSTRAINT `feedback_delivery_jobs_version_fk` FOREIGN KEY (`form_id`,`config_version_id`) REFERENCES `form_config_versions` (`form_id`,`id`) ON DELETE RESTRICT,
  CONSTRAINT `feedback_delivery_jobs_request_length` CHECK (CHAR_LENGTH(`request_id`) BETWEEN 8 AND 191),
  CONSTRAINT `feedback_delivery_jobs_form` CHECK (`form_id` IN ('public.contact','public.feedback','public.footer-feedback')),
  CONSTRAINT `feedback_delivery_jobs_hash_length` CHECK (CHAR_LENGTH(`payload_hash`)=64),
  CONSTRAINT `feedback_delivery_jobs_json` CHECK (JSON_VALID(`feedback_json`) AND OCTET_LENGTH(`feedback_json`)<=8192),
  CONSTRAINT `feedback_delivery_jobs_status` CHECK (`status` IN ('pending','leased','sending','failed','sent')),
  CONSTRAINT `feedback_delivery_jobs_attempts` CHECK (`attempt_count` BETWEEN 0 AND 5),
  CONSTRAINT `feedback_delivery_jobs_times` CHECK (`created_at`>=0 AND `updated_at`>=`created_at`),
  CONSTRAINT `feedback_delivery_jobs_lease` CHECK ((`status` IN ('leased','sending') AND `lease_token` IS NOT NULL AND `lease_expires_at` IS NOT NULL) OR (`status` IN ('pending','failed','sent') AND `lease_token` IS NULL AND `lease_expires_at` IS NULL)),
  CONSTRAINT `feedback_delivery_jobs_sent` CHECK ((`status`='sent' AND `sent_at` IS NOT NULL) OR (`status`<>'sent' AND `sent_at` IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Legacy column prerequisites for promo DDL only; not full financial bootstrap repair.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wallet_credit_paisa BIGINT NOT NULL DEFAULT 0 CHECK(wallet_credit_paisa >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS referral_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(referral_discount_paisa >= 0);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS wallet_credit_paisa BIGINT NOT NULL DEFAULT 0 CHECK(wallet_credit_paisa >= 0);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS referral_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(referral_discount_paisa >= 0);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS credit_base_paisa BIGINT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_total_paisa BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_subtotal_paisa BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_delivery_paisa BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_wallet_paisa BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_discount_paisa BIGINT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS platform_discount_paisa BIGINT NOT NULL DEFAULT 0;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS commission_base_refunded_paisa BIGINT NOT NULL DEFAULT 0;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS commission_reversal_paisa BIGINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS wallet_accounts (
 user_id VARCHAR(191) PRIMARY KEY REFERENCES users(id),
 referral_code VARCHAR(32) NOT NULL UNIQUE,
 balance_paisa BIGINT NOT NULL DEFAULT 0 CHECK(balance_paisa >= 0),
 created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS wallet_entries (
 id VARCHAR(191) PRIMARY KEY,
 user_id VARCHAR(191) NOT NULL REFERENCES wallet_accounts(user_id),
 order_id VARCHAR(191) NOT NULL REFERENCES orders(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa <> 0),
 platform_amount_paisa BIGINT NOT NULL,
 kind VARCHAR(32) NOT NULL CHECK(kind IN ('referral_reward','order_spend','cancellation','refund')),
 created_at BIGINT NOT NULL,
 CHECK(amount_paisa + platform_amount_paisa = 0),
 CHECK((kind = 'order_spend' AND amount_paisa < 0) OR (kind <> 'order_spend' AND amount_paisa > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX IF NOT EXISTS idx_wallet_entries_user ON wallet_entries(user_id,created_at);
CREATE TABLE IF NOT EXISTS gift_cards (
 id VARCHAR(191) PRIMARY KEY,
 code_hash VARCHAR(64) NOT NULL UNIQUE,
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa BETWEEN 1 AND 9007199254740991),
 issued_by VARCHAR(191) NOT NULL REFERENCES users(id),
 issuance_request_id VARCHAR(100) NOT NULL UNIQUE,
 issued_at BIGINT NOT NULL,
 redeemed_by VARCHAR(191) REFERENCES users(id),
 redeemed_at BIGINT,
 redemption_request_id VARCHAR(100) UNIQUE,
 CHECK((redeemed_by IS NULL AND redeemed_at IS NULL AND redemption_request_id IS NULL) OR (redeemed_by IS NOT NULL AND redeemed_at IS NOT NULL AND redemption_request_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE wallet_entries MODIFY COLUMN order_id VARCHAR(191) NULL;
-- ALTER ... ADD COLUMN ... REFERENCES restarts MariaDB's implicit FK names and
-- can also add another FK when IF NOT EXISTS skips an existing column. Separate
-- column creation from the named FK, retaining any equivalent legacy constraint.
ALTER TABLE wallet_entries ADD COLUMN IF NOT EXISTS gift_card_id VARCHAR(191) NULL;
SET @gift_card_fk_exists = (
 SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE k
 JOIN information_schema.REFERENTIAL_CONSTRAINTS r
  ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
 WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND k.TABLE_NAME='wallet_entries'
  AND k.COLUMN_NAME='gift_card_id' AND k.REFERENCED_TABLE_SCHEMA=DATABASE()
  AND k.REFERENCED_TABLE_NAME='gift_cards' AND k.REFERENCED_COLUMN_NAME='id'
  AND r.DELETE_RULE IN ('RESTRICT','NO ACTION') AND r.UPDATE_RULE IN ('RESTRICT','NO ACTION')
  AND NOT EXISTS (
   SELECT 1 FROM information_schema.KEY_COLUMN_USAGE other_key
   WHERE other_key.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND other_key.TABLE_NAME=k.TABLE_NAME
    AND other_key.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND other_key.ORDINAL_POSITION<>1
  )
);
SET @gift_card_fk_sql = IF(@gift_card_fk_exists>0,'SELECT 1','ALTER TABLE wallet_entries ADD CONSTRAINT wallet_entries_gift_card_fk FOREIGN KEY (gift_card_id) REFERENCES gift_cards(id)');
PREPARE gift_card_fk_statement FROM @gift_card_fk_sql;
EXECUTE gift_card_fk_statement;
DEALLOCATE PREPARE gift_card_fk_statement;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_entries_gift_card ON wallet_entries(gift_card_id);
-- The existing kind CHECK has a generated MariaDB name; remove only its exact known expression.
SET @gift_kind_check = (SELECT CONSTRAINT_NAME FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='wallet_entries' AND CHECK_CLAUSE LIKE '%kind%referral_reward%order_spend%cancellation%refund%' LIMIT 1);
SET @gift_kind_sql = IF(@gift_kind_check IS NULL,'SELECT 1',IF(@gift_kind_check='kind','ALTER TABLE wallet_entries MODIFY COLUMN kind VARCHAR(32) NOT NULL',CONCAT('ALTER TABLE wallet_entries DROP CONSTRAINT `',REPLACE(@gift_kind_check,'`','``'),'`')));
PREPARE gift_kind_statement FROM @gift_kind_sql;
EXECUTE gift_kind_statement;
DEALLOCATE PREPARE gift_kind_statement;
ALTER TABLE wallet_entries ADD CONSTRAINT IF NOT EXISTS chk_wallet_kind CHECK(kind IN ('referral_reward','order_spend','cancellation','refund','gift_card'));
ALTER TABLE wallet_entries ADD CONSTRAINT IF NOT EXISTS chk_wallet_gift_source CHECK((kind='gift_card' AND order_id IS NULL AND gift_card_id IS NOT NULL) OR (kind<>'gift_card' AND order_id IS NOT NULL AND gift_card_id IS NULL));
DROP TRIGGER IF EXISTS gift_card_no_delete;
DELIMITER $$
CREATE TRIGGER gift_card_no_delete BEFORE DELETE ON gift_cards FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='gift_cards_immutable'; END$$
DELIMITER ;
DROP TRIGGER IF EXISTS gift_card_update_guard;
DELIMITER $$
CREATE TRIGGER gift_card_update_guard BEFORE UPDATE ON gift_cards FOR EACH ROW BEGIN IF OLD.redeemed_by IS NOT NULL OR NEW.id<>OLD.id OR NEW.code_hash<>OLD.code_hash OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.issued_by<>OLD.issued_by OR NEW.issuance_request_id<>OLD.issuance_request_id OR NEW.issued_at<>OLD.issued_at THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='gift_cards_immutable'; END IF; END$$
DELIMITER ;
DROP TRIGGER IF EXISTS wallet_gift_source_guard;
DELIMITER $$
CREATE TRIGGER wallet_gift_source_guard BEFORE INSERT ON wallet_entries FOR EACH ROW BEGIN IF NEW.kind='gift_card' AND NOT EXISTS(SELECT 1 FROM gift_cards WHERE id=NEW.gift_card_id AND redeemed_by=NEW.user_id AND amount_paisa=NEW.amount_paisa) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='gift_card_source_mismatch'; END IF; END$$
DELIMITER ;
DROP TRIGGER IF EXISTS wallet_entry_balance;
DELIMITER $$
CREATE TRIGGER wallet_entry_balance AFTER INSERT ON wallet_entries FOR EACH ROW BEGIN
UPDATE wallet_accounts SET balance_paisa = balance_paisa + NEW.amount_paisa WHERE user_id = NEW.user_id;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS wallet_entry_no_update;
DELIMITER $$
CREATE TRIGGER wallet_entry_no_update BEFORE UPDATE ON wallet_entries FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'wallet_entries_immutable';
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS wallet_entry_no_delete;
DELIMITER $$
CREATE TRIGGER wallet_entry_no_delete BEFORE DELETE ON wallet_entries FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'wallet_entries_immutable';
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS wallet_refund_restore;
DELIMITER $$
CREATE TRIGGER wallet_refund_restore AFTER UPDATE ON refunds FOR EACH ROW BEGIN
IF NEW.status = 'paid' AND OLD.status <> 'paid' AND NEW.wallet_credit_paisa > 0 THEN
INSERT INTO wallet_entries (id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
 SELECT CONCAT('refund:',NEW.id), customer_id, id, NEW.wallet_credit_paisa, -NEW.wallet_credit_paisa, 'refund', NEW.processed_at FROM orders WHERE id = NEW.order_id;
END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS wallet_cancel_restore;
DELIMITER $$
CREATE TRIGGER wallet_cancel_restore AFTER UPDATE ON orders FOR EACH ROW BEGIN
IF NEW.status='cancelled' AND OLD.status<>'cancelled' THEN
INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
SELECT CONCAT('cancel:',NEW.id),NEW.customer_id,NEW.id,NEW.wallet_credit_paisa-COALESCE(SUM(amount_paisa),0),-(NEW.wallet_credit_paisa-COALESCE(SUM(amount_paisa),0)),'cancellation',NEW.updated_at FROM wallet_entries WHERE order_id=NEW.id AND kind IN ('cancellation','refund') HAVING NEW.wallet_credit_paisa>COALESCE(SUM(amount_paisa),0);
END IF; END$$
DELIMITER ;
-- Requires the prior referral/wallet, partial-cancellation and commission migrations.
-- No enabled campaigns are seeded.
-- Promo campaigns own lifetime usage; revisions never reset counters. No campaigns are seeded.
CREATE TABLE IF NOT EXISTS promo_campaigns (
 id VARCHAR(191) PRIMARY KEY,
 code VARCHAR(32) NOT NULL UNIQUE CHECK(length(code) BETWEEN 3 AND 32 AND BINARY code REGEXP '^[A-Z0-9][A-Z0-9_-]*$'),
 -- current_revision is published/live; draft_revision never changes checkout authority.
 current_revision BIGINT, draft_revision BIGINT,
 version BIGINT NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 paused BIGINT NOT NULL DEFAULT 0 CHECK(paused IN (0,1)),
 used_count BIGINT NOT NULL DEFAULT 0 CHECK(used_count BETWEEN 0 AND 9007199254740991),
 spent_paisa BIGINT NOT NULL DEFAULT 0 CHECK(spent_paisa BETWEEN 0 AND 9007199254740991),
 created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
 CHECK(status='draft' OR current_revision IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promo_revisions (
 campaign_id VARCHAR(191) NOT NULL REFERENCES promo_campaigns(id),
 revision BIGINT NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 label VARCHAR(200) NOT NULL CHECK(CHAR_LENGTH(trim(label)) BETWEEN 1 AND 200),
 kind VARCHAR(16) NOT NULL CHECK(kind IN ('fixed','percentage')),
 fixed_paisa BIGINT, percent_bps BIGINT, max_discount_paisa BIGINT,
 minimum_subtotal_paisa BIGINT NOT NULL CHECK(minimum_subtotal_paisa BETWEEN 0 AND 9007199254740991),
 starts_at BIGINT NOT NULL CHECK(starts_at BETWEEN 0 AND 253402300799999),
 ends_at BIGINT NOT NULL CHECK(ends_at BETWEEN 1 AND 253402300799999 AND ends_at>starts_at),
 total_use_limit BIGINT NOT NULL CHECK(total_use_limit BETWEEN 1 AND 9007199254740991),
 per_customer_use_limit BIGINT NOT NULL CHECK(per_customer_use_limit BETWEEN 1 AND total_use_limit),
 budget_paisa BIGINT NOT NULL CHECK(budget_paisa BETWEEN 1 AND 9007199254740991),
 created_by VARCHAR(191) NOT NULL REFERENCES users(id), request_id VARCHAR(191) NOT NULL,
 reason LONGTEXT NOT NULL CHECK(length(trim(reason))>0), form_version_id VARCHAR(191) NOT NULL, created_at BIGINT NOT NULL,
 PRIMARY KEY(campaign_id,revision), UNIQUE(created_by,request_id),
 CHECK((kind='fixed' AND fixed_paisa IS NOT NULL AND fixed_paisa BETWEEN 1 AND 9007199254740991 AND percent_bps IS NULL AND max_discount_paisa IS NULL)
 OR (kind='percentage' AND fixed_paisa IS NULL AND percent_bps IS NOT NULL AND percent_bps BETWEEN 1 AND 10000 AND max_discount_paisa IS NOT NULL AND max_discount_paisa BETWEEN 1 AND 9007199254740991))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promo_customer_usage (
 campaign_id VARCHAR(191) NOT NULL REFERENCES promo_campaigns(id), customer_id VARCHAR(191) NOT NULL REFERENCES users(id),
 used_count BIGINT NOT NULL DEFAULT 0 CHECK(used_count BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(campaign_id,customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promo_redemptions (
 id VARCHAR(191) PRIMARY KEY, campaign_id VARCHAR(191) NOT NULL, revision BIGINT NOT NULL,
 customer_id VARCHAR(191) NOT NULL REFERENCES users(id), order_id VARCHAR(191) NOT NULL UNIQUE REFERENCES orders(id),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id), request_id VARCHAR(191) NOT NULL CHECK(length(request_id) BETWEEN 1 AND 191),
 payload_digest VARCHAR(64) NOT NULL CHECK(length(payload_digest)=64 AND BINARY payload_digest REGEXP '^[a-f0-9]{64}$'),
 response_json LONGTEXT NOT NULL CHECK(json_valid(response_json) AND JSON_TYPE(response_json)='OBJECT'),
 discount_paisa BIGINT NOT NULL CHECK(discount_paisa BETWEEN 1 AND 9007199254740991),
 subtotal_paisa BIGINT NOT NULL CHECK(subtotal_paisa BETWEEN discount_paisa AND 9007199254740991),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 253402300799999),
 UNIQUE(actor_id,request_id), FOREIGN KEY(campaign_id,revision) REFERENCES promo_revisions(campaign_id,revision), CHECK(actor_id=customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_campaign ON promo_redemptions(campaign_id,created_at,id);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_customer ON promo_redemptions(customer_id,created_at,id);

CREATE INDEX IF NOT EXISTS idx_promo_customer_usage_max ON promo_customer_usage(campaign_id,used_count);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(promo_discount_paisa BETWEEN 0 AND 9007199254740991);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_promo_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(current_promo_discount_paisa BETWEEN 0 AND 9007199254740991);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_promo_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(refunded_promo_discount_paisa BETWEEN 0 AND 9007199254740991);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS promo_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(promo_discount_paisa BETWEEN 0 AND 9007199254740991);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS current_promo_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(current_promo_discount_paisa BETWEEN 0 AND 9007199254740991);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS refunded_promo_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(refunded_promo_discount_paisa BETWEEN 0 AND 9007199254740991);

-- Inline REFERENCES can add another implicit FK when IF NOT EXISTS skips an
-- existing column. Keep an equivalent legacy FK, regardless of its name.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_campaign_id VARCHAR(191) NULL;
SET @promo_campaign_fk_exists = (
 SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE k
 JOIN information_schema.REFERENTIAL_CONSTRAINTS r
  ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
 WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND k.TABLE_NAME='orders'
  AND k.COLUMN_NAME='promo_campaign_id' AND k.REFERENCED_TABLE_SCHEMA=DATABASE()
  AND k.REFERENCED_TABLE_NAME='promo_campaigns' AND k.REFERENCED_COLUMN_NAME='id'
  AND r.DELETE_RULE IN ('RESTRICT','NO ACTION') AND r.UPDATE_RULE IN ('RESTRICT','NO ACTION')
  AND NOT EXISTS (
   SELECT 1 FROM information_schema.KEY_COLUMN_USAGE other_key
   WHERE other_key.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND other_key.TABLE_NAME=k.TABLE_NAME
    AND other_key.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND other_key.ORDINAL_POSITION<>1
  )
);
SET @promo_campaign_fk_sql = IF(@promo_campaign_fk_exists>0,'SELECT 1','ALTER TABLE orders ADD CONSTRAINT orders_promo_campaign_fk FOREIGN KEY (promo_campaign_id) REFERENCES promo_campaigns(id)');
PREPARE promo_campaign_fk_statement FROM @promo_campaign_fk_sql;
EXECUTE promo_campaign_fk_statement;
DEALLOCATE PREPARE promo_campaign_fk_statement;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_revision BIGINT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code VARCHAR(32);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_label VARCHAR(200);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_source VARCHAR(16) GENERATED ALWAYS AS (CASE WHEN promo_discount_paisa>0 THEN 'promo' WHEN referral_discount_paisa>0 THEN 'referral' ELSE 'none' END) VIRTUAL;

-- Current aggregate remains total platform discount. NULL keeps the historical original-referral fallback.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_referral_discount_paisa BIGINT GENERATED ALWAYS AS
 (CASE WHEN current_discount_paisa IS NULL THEN referral_discount_paisa ELSE current_discount_paisa-current_promo_discount_paisa END) VIRTUAL;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS referral_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(referral_discount_paisa BETWEEN 0 AND 9007199254740991);

UPDATE order_items SET referral_discount_paisa=platform_discount_paisa
 WHERE EXISTS(SELECT 1 FROM orders WHERE orders.id=order_items.order_id AND orders.referral_discount_paisa>0) AND referral_discount_paisa=0 AND promo_discount_paisa=0;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_source VARCHAR(16) GENERATED ALWAYS AS (CASE WHEN promo_discount_paisa>0 THEN 'promo' WHEN referral_discount_paisa>0 THEN 'referral' ELSE 'none' END) VIRTUAL;

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS promo_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(promo_discount_paisa BETWEEN 0 AND 9007199254740991);

DROP TRIGGER IF EXISTS promo_revisions_no_update;
DELIMITER $$
CREATE TRIGGER promo_revisions_no_update BEFORE UPDATE ON promo_revisions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_revisions_immutable';
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_revisions_no_delete;
DELIMITER $$
CREATE TRIGGER promo_revisions_no_delete BEFORE DELETE ON promo_revisions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_revisions_immutable';
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_redemptions_no_update;
DELIMITER $$
CREATE TRIGGER promo_redemptions_no_update BEFORE UPDATE ON promo_redemptions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_redemptions_immutable';
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_redemptions_no_delete;
DELIMITER $$
CREATE TRIGGER promo_redemptions_no_delete BEFORE DELETE ON promo_redemptions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_redemptions_immutable';
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_campaigns_no_delete;
DELIMITER $$
CREATE TRIGGER promo_campaigns_no_delete BEFORE DELETE ON promo_campaigns FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_campaigns_retained';
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_customer_usage_no_delete;
DELIMITER $$
CREATE TRIGGER promo_customer_usage_no_delete BEFORE DELETE ON promo_customer_usage FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_customer_usage_retained';
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_revision_limits;
DELIMITER $$
CREATE TRIGGER promo_revision_limits BEFORE INSERT ON promo_revisions FOR EACH ROW BEGIN
IF NEW.total_use_limit<(SELECT used_count FROM promo_campaigns WHERE id=NEW.campaign_id)
 OR NEW.budget_paisa<(SELECT spent_paisa FROM promo_campaigns WHERE id=NEW.campaign_id)
 OR NEW.per_customer_use_limit<COALESCE((SELECT MAX(used_count) FROM promo_customer_usage WHERE campaign_id=NEW.campaign_id),0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_limits_below_consumed'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_campaign_update_guard;
DELIMITER $$
CREATE TRIGGER promo_campaign_update_guard BEFORE UPDATE ON promo_campaigns FOR EACH ROW BEGIN
IF BINARY NEW.id<>BINARY OLD.id OR BINARY NEW.code<>BINARY OLD.code OR NEW.created_at<>OLD.created_at OR NEW.version<OLD.version
 OR (NEW.draft_revision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM promo_revisions WHERE campaign_id=NEW.id AND revision=NEW.draft_revision))
 OR NEW.used_count<OLD.used_count OR NEW.spent_paisa<OLD.spent_paisa
 OR (NEW.current_revision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM promo_revisions r WHERE r.campaign_id=NEW.id AND r.revision=NEW.current_revision
 AND r.total_use_limit>=NEW.used_count AND r.budget_paisa>=NEW.spent_paisa
 AND r.per_customer_use_limit>=COALESCE((SELECT MAX(used_count) FROM promo_customer_usage WHERE campaign_id=NEW.id),0)))
 OR NEW.used_count<>(SELECT COUNT(*) FROM promo_redemptions WHERE campaign_id=NEW.id)
 OR NEW.spent_paisa<>COALESCE((SELECT SUM(discount_paisa) FROM promo_redemptions WHERE campaign_id=NEW.id),0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_campaign_changed'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_customer_usage_update_guard;
DELIMITER $$
CREATE TRIGGER promo_customer_usage_update_guard BEFORE UPDATE ON promo_customer_usage FOR EACH ROW BEGIN
IF BINARY NEW.campaign_id<>BINARY OLD.campaign_id OR BINARY NEW.customer_id<>BINARY OLD.customer_id OR NEW.used_count<OLD.used_count
 OR NEW.used_count<>(SELECT COUNT(*) FROM promo_redemptions WHERE campaign_id=NEW.campaign_id AND customer_id=NEW.customer_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_usage_changed'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS orders_promo_insert_guard;
DELIMITER $$
CREATE TRIGGER orders_promo_insert_guard BEFORE INSERT ON orders FOR EACH ROW BEGIN
IF NEW.referral_discount_paisa>0 AND NEW.promo_discount_paisa>0
 OR NEW.current_promo_discount_paisa>NEW.promo_discount_paisa-NEW.refunded_promo_discount_paisa
 OR NEW.refunded_promo_discount_paisa>NEW.promo_discount_paisa
 OR (NEW.current_discount_paisa IS NULL AND NEW.current_promo_discount_paisa<>0)
 OR (NEW.current_discount_paisa IS NOT NULL AND (NEW.current_promo_discount_paisa>NEW.current_discount_paisa
 OR (NEW.promo_discount_paisa>0 AND NEW.current_promo_discount_paisa<>NEW.current_discount_paisa)))
 OR (NEW.promo_discount_paisa=0 AND (NEW.promo_campaign_id IS NOT NULL OR NEW.promo_revision IS NOT NULL OR NEW.promo_code IS NOT NULL OR NEW.promo_label IS NOT NULL))
 OR (NEW.promo_discount_paisa>0 AND (NEW.promo_campaign_id IS NULL OR NEW.promo_revision IS NULL OR NEW.promo_code IS NULL OR NEW.promo_label IS NULL
 OR NEW.promo_discount_paisa>NEW.item_subtotal_paisa-NEW.wallet_credit_paisa
 OR NEW.grand_total_paisa<>NEW.item_subtotal_paisa+NEW.delivery_charge_paisa+NEW.buyer_platform_fee_paisa-NEW.wallet_credit_paisa-NEW.promo_discount_paisa
 OR NOT EXISTS(SELECT 1 FROM promo_revisions r JOIN promo_campaigns c ON c.id=r.campaign_id WHERE BINARY r.campaign_id=BINARY NEW.promo_campaign_id AND r.revision=NEW.promo_revision AND BINARY c.code=BINARY NEW.promo_code AND BINARY r.label=BINARY NEW.promo_label))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_order_snapshot_invalid'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS orders_promo_update_guard;
DELIMITER $$
CREATE TRIGGER orders_promo_update_guard BEFORE UPDATE ON orders FOR EACH ROW BEGIN
IF NEW.referral_discount_paisa>0 AND NEW.promo_discount_paisa>0
 OR NEW.current_promo_discount_paisa>NEW.promo_discount_paisa-NEW.refunded_promo_discount_paisa
 OR NEW.refunded_promo_discount_paisa>NEW.promo_discount_paisa
 OR (NEW.current_discount_paisa IS NULL AND NEW.current_promo_discount_paisa<>0)
 OR (NEW.current_discount_paisa IS NOT NULL AND (NEW.current_promo_discount_paisa>NEW.current_discount_paisa
 OR (NEW.promo_discount_paisa>0 AND NEW.current_promo_discount_paisa<>NEW.current_discount_paisa)))
 OR (NEW.promo_discount_paisa=0 AND (NEW.promo_campaign_id IS NOT NULL OR NEW.promo_revision IS NOT NULL OR NEW.promo_code IS NOT NULL OR NEW.promo_label IS NOT NULL))
 OR (NEW.promo_discount_paisa>0 AND (NEW.promo_campaign_id IS NULL OR NEW.promo_revision IS NULL OR NEW.promo_code IS NULL OR NEW.promo_label IS NULL
 OR NEW.promo_discount_paisa>NEW.item_subtotal_paisa-NEW.wallet_credit_paisa
 OR NEW.grand_total_paisa<>NEW.item_subtotal_paisa+NEW.delivery_charge_paisa+NEW.buyer_platform_fee_paisa-NEW.wallet_credit_paisa-NEW.promo_discount_paisa
 OR NOT EXISTS(SELECT 1 FROM promo_revisions r JOIN promo_campaigns c ON c.id=r.campaign_id WHERE BINARY r.campaign_id=BINARY NEW.promo_campaign_id AND r.revision=NEW.promo_revision AND BINARY c.code=BINARY NEW.promo_code AND BINARY r.label=BINARY NEW.promo_label))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_order_snapshot_invalid'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS orders_promo_original_immutable;
DELIMITER $$
CREATE TRIGGER orders_promo_original_immutable BEFORE UPDATE ON orders FOR EACH ROW BEGIN
IF NOT(NEW.promo_discount_paisa <=> OLD.promo_discount_paisa AND BINARY NEW.promo_campaign_id <=> BINARY OLD.promo_campaign_id
 AND NEW.promo_revision <=> OLD.promo_revision AND BINARY NEW.promo_code <=> BINARY OLD.promo_code AND BINARY NEW.promo_label <=> BINARY OLD.promo_label) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_order_snapshot_immutable'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS order_items_promo_insert_guard;
DELIMITER $$
CREATE TRIGGER order_items_promo_insert_guard BEFORE INSERT ON order_items FOR EACH ROW BEGIN
IF NEW.promo_discount_paisa>0 AND NEW.referral_discount_paisa>0
 OR NEW.promo_discount_paisa>NEW.line_total_paisa
 OR NEW.current_promo_discount_paisa>NEW.promo_discount_paisa-NEW.refunded_promo_discount_paisa
 OR NEW.refunded_promo_discount_paisa>NEW.promo_discount_paisa
 OR (NEW.promo_discount_paisa>0 AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.order_id AND o.promo_discount_paisa>0 AND o.promo_discount_paisa>=NEW.promo_discount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_item_snapshot_invalid'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS order_items_promo_update_guard;
DELIMITER $$
CREATE TRIGGER order_items_promo_update_guard BEFORE UPDATE ON order_items FOR EACH ROW BEGIN
IF NEW.promo_discount_paisa>0 AND NEW.referral_discount_paisa>0
 OR NEW.promo_discount_paisa>NEW.line_total_paisa
 OR NEW.current_promo_discount_paisa>NEW.promo_discount_paisa-NEW.refunded_promo_discount_paisa
 OR NEW.refunded_promo_discount_paisa>NEW.promo_discount_paisa
 OR (NEW.promo_discount_paisa>0 AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.order_id AND o.promo_discount_paisa>0 AND o.promo_discount_paisa>=NEW.promo_discount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_item_snapshot_invalid'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS order_items_promo_original_immutable;
DELIMITER $$
CREATE TRIGGER order_items_promo_original_immutable BEFORE UPDATE ON order_items FOR EACH ROW BEGIN
IF NEW.promo_discount_paisa<>OLD.promo_discount_paisa OR NEW.referral_discount_paisa<>OLD.referral_discount_paisa OR (OLD.promo_discount_paisa>0 AND NOT(BINARY NEW.id <=> BINARY OLD.id AND BINARY NEW.order_id <=> BINARY OLD.order_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_item_snapshot_immutable'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_redemption_guard;
DELIMITER $$
CREATE TRIGGER promo_redemption_guard BEFORE INSERT ON promo_redemptions FOR EACH ROW BEGIN
DECLARE promo_lock VARCHAR(191); SELECT id INTO promo_lock FROM promo_campaigns WHERE id=NEW.campaign_id FOR UPDATE;
IF NOT EXISTS(SELECT 1 FROM promo_campaigns c JOIN promo_revisions r ON r.campaign_id=c.id AND r.revision=c.current_revision
 JOIN orders o ON o.id=NEW.order_id JOIN users u ON u.id=NEW.customer_id
 WHERE c.id=NEW.campaign_id AND c.current_revision=NEW.revision AND c.status='published' AND c.paused=0
 AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='customer')
 AND NEW.created_at>=r.starts_at AND NEW.created_at<r.ends_at
 AND NEW.subtotal_paisa>=r.minimum_subtotal_paisa AND o.customer_id=NEW.customer_id
 AND NEW.discount_paisa=COALESCE((SELECT SUM(promo_discount_paisa) FROM order_items WHERE order_id=NEW.order_id),0)
 AND o.promo_campaign_id=c.id AND o.promo_revision=NEW.revision AND o.promo_discount_paisa=NEW.discount_paisa AND o.item_subtotal_paisa=NEW.subtotal_paisa
 AND c.used_count<r.total_use_limit AND NEW.discount_paisa<=r.budget_paisa-c.spent_paisa
 AND COALESCE((SELECT used_count FROM promo_customer_usage WHERE campaign_id=c.id AND customer_id=NEW.customer_id),0)<r.per_customer_use_limit) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_unavailable'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_redemption_consume;
DELIMITER $$
CREATE TRIGGER promo_redemption_consume AFTER INSERT ON promo_redemptions FOR EACH ROW BEGIN
UPDATE promo_campaigns SET used_count=used_count+1,spent_paisa=spent_paisa+NEW.discount_paisa WHERE id=NEW.campaign_id;
 UPDATE promo_customer_usage SET used_count=used_count+1 WHERE campaign_id=NEW.campaign_id AND customer_id=NEW.customer_id;
 INSERT INTO promo_customer_usage(campaign_id,customer_id,used_count)
 SELECT NEW.campaign_id,NEW.customer_id,1 WHERE NOT EXISTS(SELECT 1 FROM promo_customer_usage WHERE campaign_id=NEW.campaign_id AND customer_id=NEW.customer_id);
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS wallet_refund_guard;
DELIMITER $$
CREATE TRIGGER wallet_refund_guard BEFORE INSERT ON refunds FOR EACH ROW BEGIN
IF (NEW.promo_discount_paisa>0 OR EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.order_id AND o.wallet_credit_paisa+o.referral_discount_paisa+o.promo_discount_paisa>0)) AND
 (NEW.item_amount_paisa IS NULL OR NEW.credit_base_paisa<>COALESCE((SELECT SUM(item_amount_paisa) FROM refunds WHERE order_id=NEW.order_id AND status<>'rejected'),0)
 OR NEW.wallet_credit_paisa>NEW.item_amount_paisa-NEW.referral_discount_paisa-NEW.promo_discount_paisa
 OR NEW.promo_discount_paisa>COALESCE((SELECT promo_discount_paisa FROM orders WHERE id=NEW.order_id),0)-COALESCE((SELECT SUM(promo_discount_paisa) FROM refunds WHERE order_id=NEW.order_id AND status<>'rejected'),0)
 OR (NEW.promo_discount_paisa>0 AND NEW.referral_discount_paisa>0)
 OR (NEW.referral_discount_paisa>0 AND EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND promo_discount_paisa>0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='wallet_refund_changed_retry'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS refunds_promo_offset_immutable;
DELIMITER $$
CREATE TRIGGER refunds_promo_offset_immutable BEFORE UPDATE ON refunds FOR EACH ROW BEGIN
IF NEW.promo_discount_paisa<>OLD.promo_discount_paisa THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_refund_snapshot_immutable'; END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_campaign_insert_guard;
DELIMITER $$
CREATE TRIGGER promo_campaign_insert_guard BEFORE INSERT ON promo_campaigns FOR EACH ROW BEGIN IF NEW.used_count<>0 OR NEW.spent_paisa<>0 OR NEW.current_revision IS NOT NULL OR NEW.draft_revision IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_campaign_initial_state'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS order_items_promo_no_delete;
DELIMITER $$
CREATE TRIGGER order_items_promo_no_delete BEFORE DELETE ON order_items FOR EACH ROW BEGIN IF OLD.promo_discount_paisa>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_item_snapshot_immutable'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS order_items_promo_sealed_insert;
DELIMITER $$
CREATE TRIGGER order_items_promo_sealed_insert BEFORE INSERT ON order_items FOR EACH ROW BEGIN IF NEW.promo_discount_paisa>0 AND EXISTS(SELECT 1 FROM promo_redemptions WHERE order_id=NEW.order_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_item_allocations_sealed'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS promo_customer_usage_insert_guard;
DELIMITER $$
CREATE TRIGGER promo_customer_usage_insert_guard BEFORE INSERT ON promo_customer_usage FOR EACH ROW BEGIN IF NEW.used_count<>(SELECT COUNT(*) FROM promo_redemptions WHERE campaign_id=NEW.campaign_id AND customer_id=NEW.customer_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promo_usage_changed'; END IF; END$$
DELIMITER ;
-- Requires maintained referral/wallet, gift-card, partial-cancellation and promo migrations.

-- Trigger-owned posting: repositories insert sources only, never double-post ledgers/counters.

CREATE TABLE IF NOT EXISTS loyalty_config (
 id VARCHAR(32) PRIMARY KEY CHECK(BINARY id='default'),
 version BIGINT NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 current_revision BIGINT NOT NULL DEFAULT 0, draft_revision BIGINT,
 paused BIGINT NOT NULL DEFAULT 1 CHECK(paused IN (0,1)),
 issued_points BIGINT NOT NULL DEFAULT 0 CHECK(issued_points BETWEEN 0 AND 9007199254740991),
 redeemed_points BIGINT NOT NULL DEFAULT 0 CHECK(redeemed_points BETWEEN 0 AND issued_points),
 credited_paisa BIGINT NOT NULL DEFAULT 0 CHECK(credited_paisa BETWEEN 0 AND 9007199254740991),
 locked_points_per_block BIGINT, locked_credit_paisa_per_block BIGINT,
 CHECK((issued_points=0 AND locked_points_per_block IS NULL AND locked_credit_paisa_per_block IS NULL) OR (issued_points>0 AND locked_points_per_block IS NOT NULL AND locked_credit_paisa_per_block IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loyalty_revisions (
 revision BIGINT PRIMARY KEY CHECK(revision BETWEEN 0 AND 9007199254740991),
 enabled BIGINT NOT NULL CHECK(enabled IN (0,1)),
 daily_points BIGINT NOT NULL CHECK(daily_points BETWEEN 1 AND 9007199254740991),
 points_per_block BIGINT NOT NULL CHECK(points_per_block BETWEEN 1 AND 9007199254740991),
 credit_paisa_per_block BIGINT NOT NULL CHECK(credit_paisa_per_block BETWEEN 1 AND 9007199254740991),
 starts_at BIGINT CHECK(starts_at IS NULL OR (starts_at BETWEEN 0 AND 253402300799999)),
 ends_at BIGINT CHECK(ends_at IS NULL OR (ends_at BETWEEN 1 AND 253402300799999 AND starts_at IS NOT NULL AND ends_at>starts_at)),
 daily_budget_points BIGINT CHECK(daily_budget_points IS NULL OR (daily_budget_points BETWEEN daily_points AND 9007199254740991)),
 lifetime_budget_points BIGINT CHECK(lifetime_budget_points IS NULL OR (lifetime_budget_points BETWEEN daily_points AND 9007199254740991)),
 created_by VARCHAR(191) REFERENCES users(id), request_id VARCHAR(191) COLLATE utf8mb4_nopad_bin CHECK(request_id IS NULL OR CHAR_LENGTH(request_id) BETWEEN 1 AND 191),
 reason LONGTEXT NOT NULL CHECK(CHAR_LENGTH(trim(reason))>0), form_version_id VARCHAR(191),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 253402300799999),
 UNIQUE(created_by,request_id),
 CHECK(enabled=0 OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND daily_budget_points IS NOT NULL AND lifetime_budget_points IS NOT NULL)),
 CHECK(revision=0 OR (created_by IS NOT NULL AND request_id IS NOT NULL AND form_version_id IS NOT NULL)),
 CHECK(revision<>0 OR (enabled=0 AND created_by IS NULL AND request_id IS NULL AND form_version_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO loyalty_revisions(revision,enabled,daily_points,points_per_block,credit_paisa_per_block,reason,created_at) SELECT 0,0,10,100,1000,'Disabled migration defaults',0 WHERE NOT EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=0);

INSERT INTO loyalty_config(id) SELECT 'default' WHERE NOT EXISTS(SELECT 1 FROM loyalty_config WHERE id='default');

CREATE TABLE IF NOT EXISTS loyalty_accounts (
 user_id VARCHAR(191) PRIMARY KEY REFERENCES users(id),
 balance_points BIGINT NOT NULL DEFAULT 0 CHECK(balance_points BETWEEN 0 AND 9007199254740991),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 253402300799999)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loyalty_daily_claims (
 id VARCHAR(191) PRIMARY KEY,
 user_id VARCHAR(191) NOT NULL REFERENCES loyalty_accounts(user_id), actor_id VARCHAR(191) NOT NULL REFERENCES users(id),
 request_id VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL CHECK(CHAR_LENGTH(request_id) BETWEEN 1 AND 191),
 payload_digest VARCHAR(64) COLLATE utf8mb4_nopad_bin NOT NULL CHECK(CHAR_LENGTH(payload_digest)=64 AND BINARY payload_digest REGEXP '^[a-f0-9]{64}$'),
 revision BIGINT NOT NULL REFERENCES loyalty_revisions(revision),
 local_date VARCHAR(10) NOT NULL CHECK(CHAR_LENGTH(local_date)=10),
 awarded_points BIGINT NOT NULL CHECK(awarded_points BETWEEN 1 AND 9007199254740991),
 response_json LONGTEXT NOT NULL CHECK(json_valid(response_json) AND JSON_TYPE(response_json)='OBJECT'),
 form_version_id VARCHAR(191) NOT NULL CHECK(CHAR_LENGTH(form_version_id) BETWEEN 1 AND 191),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 253402300799999),
 UNIQUE(user_id,local_date), UNIQUE(user_id,request_id), CHECK(BINARY actor_id=BINARY user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loyalty_redemptions (
 id VARCHAR(191) PRIMARY KEY,
 user_id VARCHAR(191) NOT NULL REFERENCES loyalty_accounts(user_id), actor_id VARCHAR(191) NOT NULL REFERENCES users(id),
 request_id VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL CHECK(CHAR_LENGTH(request_id) BETWEEN 1 AND 191),
 payload_digest VARCHAR(64) COLLATE utf8mb4_nopad_bin NOT NULL CHECK(CHAR_LENGTH(payload_digest)=64 AND BINARY payload_digest REGEXP '^[a-f0-9]{64}$'),
 revision BIGINT NOT NULL REFERENCES loyalty_revisions(revision),
 points BIGINT NOT NULL CHECK(points BETWEEN 1 AND 9007199254740991),
 credit_paisa BIGINT NOT NULL CHECK(credit_paisa BETWEEN 1 AND 9007199254740991),
 response_json LONGTEXT NOT NULL CHECK(json_valid(response_json) AND JSON_TYPE(response_json)='OBJECT'),
 form_version_id VARCHAR(191) NOT NULL CHECK(CHAR_LENGTH(form_version_id) BETWEEN 1 AND 191),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 253402300799999),
 UNIQUE(user_id,request_id), CHECK(BINARY actor_id=BINARY user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loyalty_points_entries (
 id VARCHAR(191) PRIMARY KEY, user_id VARCHAR(191) NOT NULL REFERENCES loyalty_accounts(user_id),
 points BIGINT NOT NULL CHECK(points BETWEEN -9007199254740991 AND 9007199254740991 AND points<>0),
 kind VARCHAR(32) NOT NULL CHECK(BINARY kind IN ('daily_claim','redemption')),
 claim_id VARCHAR(191) UNIQUE REFERENCES loyalty_daily_claims(id), redemption_id VARCHAR(191) UNIQUE REFERENCES loyalty_redemptions(id),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 253402300799999),
 CHECK((BINARY kind='daily_claim' AND points>0 AND claim_id IS NOT NULL AND redemption_id IS NULL) OR (BINARY kind='redemption' AND points<0 AND redemption_id IS NOT NULL AND claim_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loyalty_day_issuance (
 local_date VARCHAR(10) PRIMARY KEY CHECK(CHAR_LENGTH(local_date)=10),
 issued_points BIGINT NOT NULL CHECK(issued_points BETWEEN 1 AND 9007199254740991)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_loyalty_claims_user ON loyalty_daily_claims(user_id,created_at,id);

CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_user ON loyalty_redemptions(user_id,created_at,id);

CREATE INDEX IF NOT EXISTS idx_loyalty_entries_user ON loyalty_points_entries(user_id,created_at,id);

-- Replace both restrictive gift-era checks; preserve gift uniqueness, conservation/sign and historical posting triggers.
ALTER TABLE wallet_entries ADD COLUMN IF NOT EXISTS loyalty_redemption_id VARCHAR(191) NULL, ADD FOREIGN KEY IF NOT EXISTS wallet_entries_loyalty_redemption_fk (loyalty_redemption_id) REFERENCES loyalty_redemptions(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_entries_loyalty ON wallet_entries(loyalty_redemption_id);
ALTER TABLE wallet_entries DROP CONSTRAINT IF EXISTS chk_wallet_kind;
ALTER TABLE wallet_entries DROP CONSTRAINT IF EXISTS chk_wallet_gift_source;
ALTER TABLE wallet_entries ADD CONSTRAINT IF NOT EXISTS chk_wallet_kind CHECK(BINARY kind IN ('referral_reward','order_spend','cancellation','refund','gift_card','loyalty_redemption'));
ALTER TABLE wallet_entries ADD CONSTRAINT IF NOT EXISTS chk_wallet_gift_source CHECK((kind='gift_card' AND order_id IS NULL AND gift_card_id IS NOT NULL AND loyalty_redemption_id IS NULL) OR (kind='loyalty_redemption' AND order_id IS NULL AND gift_card_id IS NULL AND loyalty_redemption_id IS NOT NULL) OR (kind NOT IN ('gift_card','loyalty_redemption') AND order_id IS NOT NULL AND gift_card_id IS NULL AND loyalty_redemption_id IS NULL));
ALTER TABLE wallet_entries ADD CONSTRAINT IF NOT EXISTS chk_wallet_safe_amount CHECK(amount_paisa BETWEEN -9007199254740991 AND 9007199254740991 AND platform_amount_paisa BETWEEN -9007199254740991 AND 9007199254740991);

DROP TRIGGER IF EXISTS wallet_entry_safe_balance;
DELIMITER $$
CREATE TRIGGER wallet_entry_safe_balance BEFORE INSERT ON wallet_entries FOR EACH ROW BEGIN IF NEW.amount_paisa>9007199254740991-(SELECT balance_paisa FROM wallet_accounts WHERE BINARY user_id=BINARY NEW.user_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='wallet_balance_overflow'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS wallet_loyalty_source_guard;
DELIMITER $$
CREATE TRIGGER wallet_loyalty_source_guard BEFORE INSERT ON wallet_entries FOR EACH ROW BEGIN IF BINARY NEW.kind='loyalty_redemption' AND NOT EXISTS(SELECT 1 FROM loyalty_redemptions r JOIN loyalty_points_entries e ON BINARY e.redemption_id=BINARY r.id WHERE BINARY r.id=BINARY NEW.loyalty_redemption_id AND BINARY r.user_id=BINARY NEW.user_id AND r.credit_paisa=NEW.amount_paisa AND BINARY e.user_id=BINARY r.user_id AND e.points=-r.points AND BINARY NEW.id=BINARY CONCAT('loyalty:',r.id) AND NEW.created_at=r.created_at) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_source_mismatch'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_revision_limits;
DELIMITER $$
CREATE TRIGGER loyalty_revision_limits BEFORE INSERT ON loyalty_revisions FOR EACH ROW BEGIN IF NEW.revision>0 AND (
 ((SELECT issued_points FROM loyalty_config)>0 AND (NEW.points_per_block<>(SELECT locked_points_per_block FROM loyalty_config) OR NEW.credit_paisa_per_block<>(SELECT locked_credit_paisa_per_block FROM loyalty_config)))
 OR (NEW.lifetime_budget_points IS NOT NULL AND NEW.lifetime_budget_points<(SELECT issued_points FROM loyalty_config))
 OR (NEW.daily_budget_points IS NOT NULL AND NEW.daily_budget_points<COALESCE((SELECT MAX(issued_points) FROM loyalty_day_issuance),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_terms_below_consumed'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_config_guard;
DELIMITER $$
CREATE TRIGGER loyalty_config_guard BEFORE UPDATE ON loyalty_config FOR EACH ROW BEGIN IF NOT(BINARY NEW.id <=> BINARY OLD.id) OR NEW.version<OLD.version
 OR NOT EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=NEW.current_revision)
 OR (NEW.draft_revision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=NEW.draft_revision))
 OR NEW.issued_points<>COALESCE((SELECT SUM(awarded_points) FROM loyalty_daily_claims),0)
 OR NEW.redeemed_points<>COALESCE((SELECT SUM(points) FROM loyalty_redemptions),0)
 OR NEW.credited_paisa<>COALESCE((SELECT SUM(credit_paisa) FROM loyalty_redemptions),0)
 OR (OLD.issued_points>0 AND (NEW.locked_points_per_block<>OLD.locked_points_per_block OR NEW.locked_credit_paisa_per_block<>OLD.locked_credit_paisa_per_block))
 OR (NEW.issued_points>0 AND NOT EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=NEW.current_revision AND points_per_block=NEW.locked_points_per_block AND credit_paisa_per_block=NEW.locked_credit_paisa_per_block))
 OR EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=NEW.current_revision AND ((lifetime_budget_points IS NOT NULL AND lifetime_budget_points<NEW.issued_points) OR (daily_budget_points IS NOT NULL AND daily_budget_points<COALESCE((SELECT MAX(issued_points) FROM loyalty_day_issuance),0)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_config_changed'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_accounts_initial;
DELIMITER $$
CREATE TRIGGER loyalty_accounts_initial BEFORE INSERT ON loyalty_accounts FOR EACH ROW BEGIN IF NEW.balance_points<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_initial_balance'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_accounts_guard;
DELIMITER $$
CREATE TRIGGER loyalty_accounts_guard BEFORE UPDATE ON loyalty_accounts FOR EACH ROW BEGIN IF NOT(BINARY NEW.user_id <=> BINARY OLD.user_id) OR NEW.created_at<>OLD.created_at OR NEW.balance_points<>COALESCE((SELECT SUM(points) FROM loyalty_points_entries WHERE BINARY user_id=BINARY NEW.user_id),0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_account_changed'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_day_insert_guard;
DELIMITER $$
CREATE TRIGGER loyalty_day_insert_guard BEFORE INSERT ON loyalty_day_issuance FOR EACH ROW BEGIN IF NEW.issued_points<>COALESCE((SELECT SUM(awarded_points) FROM loyalty_daily_claims WHERE local_date=NEW.local_date),0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_day_changed'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_day_update_guard;
DELIMITER $$
CREATE TRIGGER loyalty_day_update_guard BEFORE UPDATE ON loyalty_day_issuance FOR EACH ROW BEGIN IF NOT(BINARY NEW.local_date <=> BINARY OLD.local_date) OR NEW.issued_points<>COALESCE((SELECT SUM(awarded_points) FROM loyalty_daily_claims WHERE local_date=NEW.local_date),0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_day_changed'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_claim_guard;
DELIMITER $$
CREATE TRIGGER loyalty_claim_guard BEFORE INSERT ON loyalty_daily_claims FOR EACH ROW BEGIN IF NEW.local_date<>DATE_FORMAT(TIMESTAMPADD(SECOND, NEW.created_at DIV 1000+20700, '1970-01-01'),'%Y-%m-%d')
 OR NOT EXISTS(SELECT 1 FROM loyalty_config c JOIN loyalty_revisions r ON r.revision=c.current_revision JOIN users u ON BINARY u.id=BINARY NEW.user_id JOIN loyalty_accounts a ON a.user_id=u.id
 WHERE c.paused=0 AND r.enabled=1 AND r.revision=NEW.revision AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='customer')
 AND NEW.created_at>=r.starts_at AND NEW.created_at<r.ends_at AND NEW.awarded_points=r.daily_points
 AND NEW.awarded_points<=r.lifetime_budget_points-c.issued_points
 AND NEW.awarded_points<=r.daily_budget_points-COALESCE((SELECT issued_points FROM loyalty_day_issuance WHERE local_date=NEW.local_date),0)
 AND NEW.awarded_points<=9007199254740991-a.balance_points)
 OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.claimId')) <=> BINARY NEW.id) OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.localDate')) <=> BINARY NEW.local_date)
 OR NOT(BINARY JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.awardedPoints')) <=> BINARY 'INTEGER') OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.awardedPoints')) <=> BINARY NEW.awarded_points)
 OR NOT(BINARY JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.balancePoints')) <=> BINARY 'INTEGER') OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.balancePoints')) <=> BINARY (SELECT balance_points+NEW.awarded_points FROM loyalty_accounts WHERE BINARY user_id=BINARY NEW.user_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_claim_unavailable'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_claim_post;
DELIMITER $$
CREATE TRIGGER loyalty_claim_post AFTER INSERT ON loyalty_daily_claims FOR EACH ROW BEGIN INSERT INTO loyalty_points_entries(id,user_id,points,kind,claim_id,created_at) VALUES (CONCAT('claim:',NEW.id),NEW.user_id,NEW.awarded_points,'daily_claim',NEW.id,NEW.created_at);
 UPDATE loyalty_day_issuance SET issued_points=issued_points+NEW.awarded_points WHERE local_date=NEW.local_date;
 INSERT INTO loyalty_day_issuance(local_date,issued_points) SELECT NEW.local_date,NEW.awarded_points WHERE NOT EXISTS(SELECT 1 FROM loyalty_day_issuance WHERE local_date=NEW.local_date);
 UPDATE loyalty_config SET issued_points=issued_points+NEW.awarded_points,locked_points_per_block=(SELECT points_per_block FROM loyalty_revisions WHERE revision=NEW.revision),locked_credit_paisa_per_block=(SELECT credit_paisa_per_block FROM loyalty_revisions WHERE revision=NEW.revision);
 END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_redemption_guard;
DELIMITER $$
CREATE TRIGGER loyalty_redemption_guard BEFORE INSERT ON loyalty_redemptions FOR EACH ROW BEGIN IF NOT EXISTS(SELECT 1 FROM loyalty_config c JOIN loyalty_revisions r ON r.revision=c.current_revision JOIN users u ON BINARY u.id=BINARY NEW.user_id JOIN loyalty_accounts a ON a.user_id=u.id JOIN wallet_accounts w ON w.user_id=u.id
 WHERE r.revision=NEW.revision AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='customer')
 AND NEW.points<=a.balance_points AND NEW.points%r.points_per_block=0
 -- Division bounds the integer product before evaluating it; no floating-point financial conversion.
 AND NEW.points DIV r.points_per_block<=9007199254740991 DIV r.credit_paisa_per_block
 AND NEW.credit_paisa=(NEW.points DIV r.points_per_block)*r.credit_paisa_per_block
 AND NEW.credit_paisa<=9007199254740991-w.balance_paisa AND NEW.credit_paisa<=9007199254740991-c.credited_paisa)
 OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.redemptionId')) <=> BINARY NEW.id)
 OR NOT(BINARY JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.points')) <=> BINARY 'INTEGER') OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.points')) <=> BINARY NEW.points)
 OR NOT(BINARY JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.creditPaisa')) <=> BINARY 'INTEGER') OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.creditPaisa')) <=> BINARY NEW.credit_paisa)
 OR NOT(BINARY JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.balancePoints')) <=> BINARY 'INTEGER') OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.balancePoints')) <=> BINARY (SELECT balance_points-NEW.points FROM loyalty_accounts WHERE BINARY user_id=BINARY NEW.user_id))
 OR NOT(BINARY JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.walletBalancePaisa')) <=> BINARY 'INTEGER') OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.walletBalancePaisa')) <=> BINARY (SELECT balance_paisa+NEW.credit_paisa FROM wallet_accounts WHERE BINARY user_id=BINARY NEW.user_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_redemption_invalid'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_redemption_post;
DELIMITER $$
CREATE TRIGGER loyalty_redemption_post AFTER INSERT ON loyalty_redemptions FOR EACH ROW BEGIN INSERT INTO loyalty_points_entries(id,user_id,points,kind,redemption_id,created_at) VALUES (CONCAT('redeem:',NEW.id),NEW.user_id,-NEW.points,'redemption',NEW.id,NEW.created_at);
 INSERT INTO wallet_entries(id,user_id,amount_paisa,platform_amount_paisa,kind,loyalty_redemption_id,created_at) VALUES (CONCAT('loyalty:',NEW.id),NEW.user_id,NEW.credit_paisa,-NEW.credit_paisa,'loyalty_redemption',NEW.id,NEW.created_at);
 UPDATE loyalty_config SET redeemed_points=redeemed_points+NEW.points,credited_paisa=credited_paisa+NEW.credit_paisa;
 END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_points_source_guard;
DELIMITER $$
CREATE TRIGGER loyalty_points_source_guard BEFORE INSERT ON loyalty_points_entries FOR EACH ROW BEGIN IF (BINARY NEW.kind='daily_claim' AND NOT EXISTS(SELECT 1 FROM loyalty_daily_claims WHERE BINARY id=BINARY NEW.claim_id AND BINARY user_id=BINARY NEW.user_id AND awarded_points=NEW.points AND BINARY NEW.id=BINARY CONCAT('claim:',id) AND created_at=NEW.created_at))
 OR (BINARY NEW.kind='redemption' AND NOT EXISTS(SELECT 1 FROM loyalty_redemptions WHERE BINARY id=BINARY NEW.redemption_id AND BINARY user_id=BINARY NEW.user_id AND points=-NEW.points AND BINARY NEW.id=BINARY CONCAT('redeem:',id) AND created_at=NEW.created_at)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_points_source_mismatch'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_points_balance;
DELIMITER $$
CREATE TRIGGER loyalty_points_balance AFTER INSERT ON loyalty_points_entries FOR EACH ROW BEGIN UPDATE loyalty_accounts SET balance_points=balance_points+NEW.points WHERE BINARY user_id=BINARY NEW.user_id; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_revisions_no_update;
DELIMITER $$
CREATE TRIGGER loyalty_revisions_no_update BEFORE UPDATE ON loyalty_revisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_revisions_no_delete;
DELIMITER $$
CREATE TRIGGER loyalty_revisions_no_delete BEFORE DELETE ON loyalty_revisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_points_entries_no_update;
DELIMITER $$
CREATE TRIGGER loyalty_points_entries_no_update BEFORE UPDATE ON loyalty_points_entries FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_points_entries_no_delete;
DELIMITER $$
CREATE TRIGGER loyalty_points_entries_no_delete BEFORE DELETE ON loyalty_points_entries FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_daily_claims_no_update;
DELIMITER $$
CREATE TRIGGER loyalty_daily_claims_no_update BEFORE UPDATE ON loyalty_daily_claims FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_daily_claims_no_delete;
DELIMITER $$
CREATE TRIGGER loyalty_daily_claims_no_delete BEFORE DELETE ON loyalty_daily_claims FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_redemptions_no_update;
DELIMITER $$
CREATE TRIGGER loyalty_redemptions_no_update BEFORE UPDATE ON loyalty_redemptions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_redemptions_no_delete;
DELIMITER $$
CREATE TRIGGER loyalty_redemptions_no_delete BEFORE DELETE ON loyalty_redemptions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_config_no_delete;
DELIMITER $$
CREATE TRIGGER loyalty_config_no_delete BEFORE DELETE ON loyalty_config FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_retained'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_accounts_no_delete;
DELIMITER $$
CREATE TRIGGER loyalty_accounts_no_delete BEFORE DELETE ON loyalty_accounts FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_retained'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_day_issuance_no_delete;
DELIMITER $$
CREATE TRIGGER loyalty_day_issuance_no_delete BEFORE DELETE ON loyalty_day_issuance FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_history_retained'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_config_initial;
DELIMITER $$
CREATE TRIGGER loyalty_config_initial BEFORE INSERT ON loyalty_config FOR EACH ROW BEGIN IF NEW.issued_points<>0 OR NEW.redeemed_points<>0 OR NEW.credited_paisa<>0 OR NEW.current_revision<>0 OR NEW.draft_revision IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_config_initial'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_config_no_replace;
DELIMITER $$
CREATE TRIGGER loyalty_config_no_replace BEFORE INSERT ON loyalty_config FOR EACH ROW BEGIN IF EXISTS(SELECT 1 FROM loyalty_config WHERE id=NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='financial_history_immutable'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_revisions_no_replace;
DELIMITER $$
CREATE TRIGGER loyalty_revisions_no_replace BEFORE INSERT ON loyalty_revisions FOR EACH ROW BEGIN IF EXISTS(SELECT 1 FROM loyalty_revisions WHERE revision=NEW.revision OR (NEW.created_by IS NOT NULL AND NEW.request_id IS NOT NULL AND BINARY created_by=BINARY NEW.created_by AND BINARY request_id=BINARY NEW.request_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='financial_history_immutable'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS wallet_entries_no_replace;
DELIMITER $$
CREATE TRIGGER wallet_entries_no_replace BEFORE INSERT ON wallet_entries FOR EACH ROW BEGIN IF EXISTS(SELECT 1 FROM wallet_entries WHERE id=NEW.id OR (NEW.gift_card_id IS NOT NULL AND BINARY gift_card_id=BINARY NEW.gift_card_id) OR (NEW.loyalty_redemption_id IS NOT NULL AND BINARY loyalty_redemption_id=BINARY NEW.loyalty_redemption_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='financial_history_immutable'; END IF; END$$
DELIMITER ;

-- Weekly loyalty cycle extension
-- Additive and repeatable: legacy revisions/claims retain NULL cycle metadata.
ALTER TABLE loyalty_revisions ADD COLUMN IF NOT EXISTS weekly_points_json LONGTEXT NULL CHECK(weekly_points_json IS NULL OR JSON_VALID(weekly_points_json)), ADD COLUMN IF NOT EXISTS grace_enabled BIGINT NOT NULL DEFAULT 0 CHECK(grace_enabled IN (0,1));
ALTER TABLE loyalty_daily_claims ADD COLUMN IF NOT EXISTS cycle_day BIGINT NULL CHECK(cycle_day IS NULL OR cycle_day BETWEEN 1 AND 7),
 ADD COLUMN IF NOT EXISTS cycle_number BIGINT NULL CHECK(cycle_number IS NULL OR cycle_number BETWEEN 1 AND 9007199254740991),
 ADD COLUMN IF NOT EXISTS grace_used BIGINT NULL CHECK(grace_used IS NULL OR grace_used IN (0,1)),
 ADD COLUMN IF NOT EXISTS grace_applied BIGINT NULL CHECK(grace_applied IS NULL OR grace_applied IN (0,1)),
 ADD COLUMN IF NOT EXISTS cycle_reset_reason VARCHAR(32) COLLATE utf8mb4_bin NULL CHECK(cycle_reset_reason IS NULL OR BINARY cycle_reset_reason IN ('first_claim','missed_day','cycle_complete'));
CREATE INDEX IF NOT EXISTS idx_loyalty_claims_calendar ON loyalty_daily_claims(user_id,local_date);
CREATE OR REPLACE VIEW loyalty_latest_claims AS SELECT d.* FROM loyalty_daily_claims d WHERE NOT EXISTS(SELECT 1 FROM loyalty_daily_claims newer WHERE BINARY newer.user_id=BINARY d.user_id AND newer.local_date>d.local_date);

DROP TRIGGER IF EXISTS loyalty_weekly_revision_guard;
DELIMITER $$
CREATE TRIGGER loyalty_weekly_revision_guard BEFORE INSERT ON loyalty_revisions FOR EACH ROW BEGIN
 DECLARE day_index INT DEFAULT 0;
 DECLARE prior_points DECIMAL(30,0) DEFAULT 0;
 DECLARE next_points DECIMAL(30,0);
 DECLARE cycle_total DECIMAL(40,0) DEFAULT 0;
 IF NEW.weekly_points_json IS NULL THEN
  IF NEW.grace_enabled<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_weekly_terms_invalid'; END IF;
 ELSE
  IF JSON_VALID(NEW.weekly_points_json)<>1 OR NOT(JSON_TYPE(NEW.weekly_points_json)<=>'ARRAY') OR JSON_LENGTH(NEW.weekly_points_json)<>7 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_weekly_terms_invalid'; END IF;
  WHILE day_index<7 DO
   IF NOT(JSON_TYPE(JSON_EXTRACT(NEW.weekly_points_json,CONCAT('$[',day_index,']')))<=>'INTEGER') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_weekly_terms_invalid'; END IF;
   SET next_points=CAST(JSON_UNQUOTE(JSON_EXTRACT(NEW.weekly_points_json,CONCAT('$[',day_index,']'))) AS DECIMAL(30,0));
   IF next_points<=prior_points OR next_points>9007199254740991 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_weekly_terms_invalid'; END IF;
   IF day_index=0 AND NEW.daily_points<>next_points THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_weekly_terms_invalid'; END IF;
   SET cycle_total=cycle_total+next_points;
   SET prior_points=next_points;
   SET day_index=day_index+1;
  END WHILE;
  IF cycle_total>9007199254740991 OR NEW.daily_budget_points IS NULL OR NEW.daily_budget_points<prior_points OR NEW.lifetime_budget_points IS NULL OR NEW.lifetime_budget_points<prior_points THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_weekly_terms_invalid'; END IF;
 END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_claim_guard;
DELIMITER $$
CREATE TRIGGER loyalty_claim_guard BEFORE INSERT ON loyalty_daily_claims FOR EACH ROW BEGIN IF NEW.local_date<>DATE_FORMAT(TIMESTAMPADD(SECOND, NEW.created_at DIV 1000+20700, '1970-01-01'),'%Y-%m-%d')
 OR NOT EXISTS(SELECT 1 FROM loyalty_config c JOIN loyalty_revisions r ON r.revision=c.current_revision JOIN users u ON BINARY u.id=BINARY NEW.user_id JOIN loyalty_accounts a ON a.user_id=u.id
 WHERE c.paused=0 AND r.enabled=1 AND r.revision=NEW.revision AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='customer')
 AND NEW.created_at>=r.starts_at AND NEW.created_at<r.ends_at AND NEW.awarded_points=CASE WHEN r.weekly_points_json IS NULL THEN r.daily_points ELSE CAST(JSON_UNQUOTE(JSON_EXTRACT(r.weekly_points_json,CONCAT('$[',NEW.cycle_day-1,']'))) AS UNSIGNED) END
 AND NEW.awarded_points<=r.lifetime_budget_points-c.issued_points
 AND NEW.awarded_points<=r.daily_budget_points-COALESCE((SELECT issued_points FROM loyalty_day_issuance WHERE local_date=NEW.local_date),0)
 AND NEW.awarded_points<=9007199254740991-a.balance_points)
 OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.claimId')) <=> BINARY NEW.id) OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.localDate')) <=> BINARY NEW.local_date)
 OR NOT(BINARY JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.awardedPoints')) <=> BINARY 'INTEGER') OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.awardedPoints')) <=> BINARY NEW.awarded_points)
 OR NOT(BINARY JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.balancePoints')) <=> BINARY 'INTEGER') OR NOT(BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.balancePoints')) <=> BINARY (SELECT balance_points+NEW.awarded_points FROM loyalty_accounts WHERE BINARY user_id=BINARY NEW.user_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_claim_unavailable'; END IF; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS loyalty_weekly_claim_guard;
DELIMITER $$
CREATE TRIGGER loyalty_weekly_claim_guard BEFORE INSERT ON loyalty_daily_claims FOR EACH ROW BEGIN IF NOT EXISTS(
 SELECT 1 FROM loyalty_config c JOIN loyalty_revisions r ON r.revision=c.current_revision LEFT JOIN loyalty_latest_claims p ON BINARY p.user_id=BINARY NEW.user_id
 WHERE c.id='default' AND r.revision=NEW.revision AND (
  (r.weekly_points_json IS NULL AND NEW.cycle_day IS NULL AND NEW.cycle_number IS NULL AND NEW.grace_used IS NULL AND NEW.grace_applied IS NULL AND NEW.cycle_reset_reason IS NULL AND JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle')) IS NULL)
  OR (r.weekly_points_json IS NOT NULL AND (p.local_date IS NULL OR NEW.local_date>p.local_date)
   AND NEW.cycle_day=CASE WHEN ((DATEDIFF(NEW.local_date,p.local_date)=1 AND p.cycle_day<7) OR (DATEDIFF(NEW.local_date,p.local_date)=2 AND r.grace_enabled=1 AND p.grace_used=0 AND p.cycle_day<7)) THEN p.cycle_day+1 ELSE 1 END
   AND NEW.cycle_number=CASE WHEN p.cycle_day IS NULL THEN 1 WHEN ((DATEDIFF(NEW.local_date,p.local_date)=1 AND p.cycle_day<7) OR (DATEDIFF(NEW.local_date,p.local_date)=2 AND r.grace_enabled=1 AND p.grace_used=0 AND p.cycle_day<7)) THEN p.cycle_number ELSE p.cycle_number+1 END
   AND NEW.grace_used=CASE WHEN (DATEDIFF(NEW.local_date,p.local_date)=2 AND r.grace_enabled=1 AND p.grace_used=0 AND p.cycle_day<7) THEN 1 WHEN (DATEDIFF(NEW.local_date,p.local_date)=1 AND p.cycle_day<7) THEN p.grace_used ELSE 0 END
   AND NEW.grace_applied=CASE WHEN (DATEDIFF(NEW.local_date,p.local_date)=2 AND r.grace_enabled=1 AND p.grace_used=0 AND p.cycle_day<7) THEN 1 ELSE 0 END
   AND (BINARY NEW.cycle_reset_reason <=> BINARY CASE WHEN p.cycle_day IS NULL THEN 'first_claim' WHEN ((DATEDIFF(NEW.local_date,p.local_date)=1 AND p.cycle_day<7) OR (DATEDIFF(NEW.local_date,p.local_date)=2 AND r.grace_enabled=1 AND p.grace_used=0 AND p.cycle_day<7)) THEN NULL WHEN DATEDIFF(NEW.local_date,p.local_date)=1 AND p.cycle_day=7 THEN 'cycle_complete' ELSE 'missed_day' END)
   AND JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle'))='OBJECT'
   AND JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle.day'))='INTEGER' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.cycle.day')) AS UNSIGNED)=NEW.cycle_day
   AND JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle.number'))='INTEGER' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.cycle.number')) AS UNSIGNED)=NEW.cycle_number
   AND JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle.graceUsed'))='BOOLEAN' AND BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.cycle.graceUsed'))=BINARY IF(NEW.grace_used=1,'true','false')
   AND JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle.graceApplied'))='BOOLEAN' AND BINARY JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.cycle.graceApplied'))=BINARY IF(NEW.grace_applied=1,'true','false')
   AND JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle.resetReason')) IN ('NULL','STRING') AND (BINARY (CASE WHEN JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle.resetReason'))='NULL' THEN NULL ELSE JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.cycle.resetReason')) END) <=> BINARY NEW.cycle_reset_reason)
   AND JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle.lastClaimDate')) IN ('NULL','STRING') AND (BINARY (CASE WHEN JSON_TYPE(JSON_EXTRACT(NEW.response_json,'$.cycle.lastClaimDate'))='NULL' THEN NULL ELSE JSON_UNQUOTE(JSON_EXTRACT(NEW.response_json,'$.cycle.lastClaimDate')) END) <=> BINARY p.local_date)
  )
 )) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_weekly_claim_invalid'; END IF; END$$
DELIMITER ;
-- Additive 0071 companion. Requires form catalog, maker identity and managed commerce.
-- Never infer or backfill acceptance, commercial snapshots or payment allocations.
ALTER TABLE managed_maker_application_details ADD COLUMN IF NOT EXISTS agreement_language VARCHAR(8) NULL CHECK(agreement_language IS NULL OR BINARY agreement_language IN ('en','ne'));
ALTER TABLE managed_maker_application_details ADD COLUMN IF NOT EXISTS agreement_form_version_id VARCHAR(191) COLLATE utf8mb4_nopad_bin NULL,
 ADD FOREIGN KEY IF NOT EXISTS managed_detail_form_version_fk (agreement_form_version_id) REFERENCES form_config_versions(id);
ALTER TABLE seller_participation_profiles ADD COLUMN IF NOT EXISTS accepted_managed_detail_id VARCHAR(191) NULL,
 ADD FOREIGN KEY IF NOT EXISTS participation_accepted_detail_fk (accepted_managed_detail_id) REFERENCES managed_maker_application_details(id);
ALTER TABLE managed_commercial_snapshots ADD COLUMN IF NOT EXISTS accepted_managed_detail_id VARCHAR(191) NULL,
 ADD COLUMN IF NOT EXISTS maker_name_snapshot TEXT NULL,
 ADD COLUMN IF NOT EXISTS company_store_name_snapshot TEXT NULL,
 ADD COLUMN IF NOT EXISTS company_legal_name_snapshot TEXT NULL,
 ADD FOREIGN KEY IF NOT EXISTS commercial_accepted_detail_fk (accepted_managed_detail_id) REFERENCES managed_maker_application_details(id);
ALTER TABLE seller_route_transition_applications ADD COLUMN IF NOT EXISTS registered_terms_snapshot_json LONGTEXT NULL CHECK(registered_terms_snapshot_json IS NULL OR JSON_VALID(registered_terms_snapshot_json));

CREATE TABLE IF NOT EXISTS managed_payout_allocations (
 payout_id VARCHAR(191) NOT NULL,
 entitlement_id VARCHAR(191) NOT NULL,
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa<>0),
 disposition VARCHAR(16) COLLATE utf8mb4_bin NOT NULL CHECK(BINARY disposition IN ('reserved','released','paid')),
 created_at BIGINT NOT NULL,
 terminal_at BIGINT NULL,
 request_id VARCHAR(191) NOT NULL,
 actor_id VARCHAR(191) NOT NULL,
 -- Match the parent entitlement ID collation: FK-equivalent case/space variants
 -- must reserve the same parent rather than evade the unique key.
 reserved_entitlement_key VARCHAR(191) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS (CASE WHEN BINARY disposition='reserved' THEN entitlement_id ELSE NULL END) STORED,
 PRIMARY KEY(payout_id,entitlement_id),
 UNIQUE KEY managed_allocation_one_reservation(reserved_entitlement_key),
 FOREIGN KEY(payout_id) REFERENCES managed_payouts(id) ON DELETE RESTRICT,
 FOREIGN KEY(entitlement_id) REFERENCES managed_entitlements(id) ON DELETE RESTRICT,
 FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT managed_allocation_terminal_shape CHECK((BINARY disposition='reserved' AND terminal_at IS NULL) OR (BINARY disposition<>'reserved' AND terminal_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER IF NOT EXISTS managed_allocation_preserve_identity BEFORE UPDATE ON managed_payout_allocations FOR EACH ROW
BEGIN
 IF NOT(BINARY NEW.payout_id<=>BINARY OLD.payout_id) OR NOT(BINARY NEW.entitlement_id<=>BINARY OLD.entitlement_id)
 OR NOT(NEW.amount_paisa<=>OLD.amount_paisa) OR NOT(NEW.created_at<=>OLD.created_at)
 OR NOT(BINARY NEW.request_id<=>BINARY OLD.request_id) OR NOT(BINARY NEW.actor_id<=>BINARY OLD.actor_id)
 OR BINARY OLD.disposition<>'reserved' OR BINARY NEW.disposition NOT IN ('released','paid')
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Managed allocation history is immutable'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS managed_allocation_no_delete BEFORE DELETE ON managed_payout_allocations FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Managed allocation history is permanent'; END$$
CREATE TRIGGER IF NOT EXISTS managed_payout_preserve_identity BEFORE UPDATE ON managed_payouts FOR EACH ROW
BEGIN
 IF NOT(BINARY NEW.id<=>BINARY OLD.id) OR NOT(BINARY NEW.seller_id<=>BINARY OLD.seller_id) OR NOT(NEW.amount_paisa<=>OLD.amount_paisa)
 OR NOT(BINARY NEW.destination_reference<=>BINARY OLD.destination_reference) OR NOT(BINARY NEW.request_id<=>BINARY OLD.request_id)
 OR NOT(BINARY NEW.prepared_by<=>BINARY OLD.prepared_by) OR NOT(NEW.created_at<=>OLD.created_at)
 OR NOT(NEW.scheduled_for<=>OLD.scheduled_for) OR NOT(BINARY NEW.payout_number<=>BINARY OLD.payout_number)
 OR NOT(BINARY NEW.simulation_label<=>BINARY OLD.simulation_label)
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Managed payment identity and amount are immutable'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS managed_payout_no_delete BEFORE DELETE ON managed_payouts FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Managed payment history is permanent'; END$$
CREATE TRIGGER IF NOT EXISTS managed_payout_preserve_terminal BEFORE UPDATE ON managed_payouts FOR EACH ROW
BEGIN
 IF BINARY OLD.status IN ('paid','rejected','reversed') AND (NOT(BINARY NEW.status<=>BINARY OLD.status)
 OR NOT(BINARY NEW.approved_by<=>BINARY OLD.approved_by) OR NOT(BINARY NEW.provider_reference<=>BINARY OLD.provider_reference) OR NOT(NEW.paid_at<=>OLD.paid_at))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Terminal managed payment evidence is immutable'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS managed_legacy_payout_link_no_update BEFORE UPDATE ON managed_payout_entries FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Legacy managed payment links are immutable'; END$$
CREATE TRIGGER IF NOT EXISTS managed_legacy_payout_link_no_delete BEFORE DELETE ON managed_payout_entries FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Legacy managed payment links are permanent'; END$$
DELIMITER ;
-- Additive 0072 companion. Requires the current weekly loyalty companion.
-- Existing rules, drafts, pause state, points and financial records stay intact.
ALTER TABLE loyalty_config ADD COLUMN IF NOT EXISTS scheduled_revision BIGINT NULL,
 ADD COLUMN IF NOT EXISTS scheduled_for BIGINT NULL,
 ADD COLUMN IF NOT EXISTS scheduled_unpause BIGINT NOT NULL DEFAULT 0 CHECK(scheduled_unpause IN (0,1)),
 ADD FOREIGN KEY IF NOT EXISTS loyalty_scheduled_revision_fk (scheduled_revision) REFERENCES loyalty_revisions(revision);

DELIMITER $$
CREATE TRIGGER IF NOT EXISTS loyalty_schedule_insert_guard BEFORE INSERT ON loyalty_config FOR EACH ROW
BEGIN
 IF (NEW.scheduled_revision IS NULL)<>(NEW.scheduled_for IS NULL)
 OR (NEW.scheduled_revision IS NULL AND NEW.scheduled_unpause<>0)
 OR (NEW.scheduled_revision IS NOT NULL AND (NEW.scheduled_for<0
 OR NEW.scheduled_revision=NEW.current_revision OR NEW.scheduled_revision=NEW.draft_revision
 OR NOT EXISTS(SELECT 1 FROM loyalty_revisions r WHERE r.revision=NEW.scheduled_revision AND r.starts_at=NEW.scheduled_for)))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid scheduled loyalty rules'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS loyalty_schedule_update_guard BEFORE UPDATE ON loyalty_config FOR EACH ROW
BEGIN
 IF (NEW.scheduled_revision IS NULL)<>(NEW.scheduled_for IS NULL)
 OR (NEW.scheduled_revision IS NULL AND NEW.scheduled_unpause<>0)
 OR (NEW.scheduled_revision IS NOT NULL AND (NEW.scheduled_for<0
 OR NEW.scheduled_revision=NEW.current_revision OR NEW.scheduled_revision=NEW.draft_revision
 OR NOT EXISTS(SELECT 1 FROM loyalty_revisions r WHERE r.revision=NEW.scheduled_revision AND r.starts_at=NEW.scheduled_for)))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid scheduled loyalty rules'; END IF;
END$$
CREATE TRIGGER IF NOT EXISTS loyalty_schedule_claim_guard BEFORE INSERT ON loyalty_daily_claims FOR EACH ROW
BEGIN
 IF EXISTS(SELECT 1 FROM loyalty_config WHERE BINARY id='default' AND scheduled_revision IS NOT NULL AND scheduled_for<=NEW.created_at)
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='loyalty_scheduled_rules_due'; END IF;
END$$
DELIMITER ;
-- Reviewed additive migration. Never run automatically at local startup.
-- Existing orders, seller commission agreements and ledger values are untouched.
CREATE TABLE IF NOT EXISTS marketplace_fee_waiver_control (
 id VARCHAR(191) PRIMARY KEY CHECK(id='default'),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO marketplace_fee_waiver_control(id,revision) VALUES ('default',0);

CREATE TABLE IF NOT EXISTS marketplace_fee_waiver_campaigns (
 id VARCHAR(191) COLLATE utf8mb4_bin PRIMARY KEY NOT NULL,
 revision BIGINT NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 updated_at BIGINT NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketplace_fee_waiver_revisions (
 campaign_id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 revision BIGINT NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 state VARCHAR(16) NOT NULL CHECK(state IN ('draft','published','paused','ended')),
 name VARCHAR(100) NOT NULL CHECK(CHAR_LENGTH(trim(name)) BETWEEN 1 AND 100),
 description TEXT NOT NULL CHECK(CHAR_LENGTH(description)<=1000),
 starts_at BIGINT NOT NULL CHECK(starts_at BETWEEN 0 AND 9007199254740991),
 ends_at BIGINT NOT NULL CHECK(ends_at BETWEEN 1 AND 9007199254740991 AND ends_at>starts_at),
 created_by VARCHAR(191) NOT NULL,
 request_id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL UNIQUE,
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(campaign_id,revision),
 CONSTRAINT fee_revision_campaign_fk FOREIGN KEY(campaign_id) REFERENCES marketplace_fee_waiver_campaigns(id),
 CONSTRAINT fee_revision_actor_fk FOREIGN KEY(created_by) REFERENCES users(id),
 INDEX idx_marketplace_fee_waiver_history(campaign_id,created_at,revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketplace_fee_waiver_requests (
 request_id VARCHAR(191) COLLATE utf8mb4_bin PRIMARY KEY NOT NULL CHECK(CHAR_LENGTH(request_id) BETWEEN 1 AND 191),
 actor_id VARCHAR(191) NOT NULL,
 auth_subject VARCHAR(191) NOT NULL,
 command_json LONGTEXT NOT NULL CHECK(json_valid(command_json) AND JSON_TYPE(command_json)='OBJECT'),
 response_json LONGTEXT NOT NULL CHECK(json_valid(response_json) AND JSON_TYPE(response_json)='OBJECT'),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 CONSTRAINT fee_request_actor_fk FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_item_marketplace_fees (
 order_item_id VARCHAR(191) PRIMARY KEY NOT NULL,
 standard_bps BIGINT NOT NULL CHECK(standard_bps BETWEEN 0 AND 10000),
 base_paisa BIGINT NOT NULL CHECK(base_paisa BETWEEN 0 AND 9007199254740991),
 standard_paisa BIGINT NOT NULL CHECK(standard_paisa BETWEEN 0 AND 9007199254740991),
 waived_paisa BIGINT NOT NULL CHECK(waived_paisa BETWEEN 0 AND 9007199254740991),
 net_paisa BIGINT NOT NULL CHECK(net_paisa BETWEEN 0 AND 9007199254740991),
 campaign_id VARCHAR(191) COLLATE utf8mb4_bin,
 campaign_revision BIGINT,
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 CONSTRAINT fee_evidence_item_fk FOREIGN KEY(order_item_id) REFERENCES order_items(id),
 CONSTRAINT fee_evidence_revision_fk FOREIGN KEY(campaign_id,campaign_revision) REFERENCES marketplace_fee_waiver_revisions(campaign_id,revision),
 CONSTRAINT marketplace_fee_reconciled CHECK(standard_paisa-waived_paisa=net_paisa),
 CONSTRAINT marketplace_fee_full_waiver CHECK((campaign_id IS NULL AND campaign_revision IS NULL AND waived_paisa=0) OR
       (campaign_id IS NOT NULL AND campaign_revision IS NOT NULL AND waived_paisa=standard_paisa AND net_paisa=0)),
 INDEX idx_order_item_marketplace_fees_campaign(campaign_id,campaign_revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS marketplace_fee_waiver_revisions_no_update;
CREATE TRIGGER marketplace_fee_waiver_revisions_no_update BEFORE UPDATE ON marketplace_fee_waiver_revisions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fee_waiver_revision_immutable';
DROP TRIGGER IF EXISTS marketplace_fee_waiver_revisions_no_delete;
CREATE TRIGGER marketplace_fee_waiver_revisions_no_delete BEFORE DELETE ON marketplace_fee_waiver_revisions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fee_waiver_revision_immutable';
DROP TRIGGER IF EXISTS marketplace_fee_waiver_requests_no_update;
CREATE TRIGGER marketplace_fee_waiver_requests_no_update BEFORE UPDATE ON marketplace_fee_waiver_requests FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fee_waiver_request_immutable';
DROP TRIGGER IF EXISTS marketplace_fee_waiver_requests_no_delete;
CREATE TRIGGER marketplace_fee_waiver_requests_no_delete BEFORE DELETE ON marketplace_fee_waiver_requests FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fee_waiver_request_immutable';
DROP TRIGGER IF EXISTS marketplace_fee_waiver_campaigns_no_delete;
CREATE TRIGGER marketplace_fee_waiver_campaigns_no_delete BEFORE DELETE ON marketplace_fee_waiver_campaigns FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fee_waiver_campaign_retained';
DROP TRIGGER IF EXISTS order_item_marketplace_fees_no_update;
CREATE TRIGGER order_item_marketplace_fees_no_update BEFORE UPDATE ON order_item_marketplace_fees FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='marketplace_fee_snapshot_immutable';
DROP TRIGGER IF EXISTS order_item_marketplace_fees_no_delete;
CREATE TRIGGER order_item_marketplace_fees_no_delete BEFORE DELETE ON order_item_marketplace_fees FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='marketplace_fee_snapshot_immutable';
-- Reviewed additive migration. Never run automatically at local startup.
-- No existing campaign, acceptance, order money, commission or personal-PAN row is changed.
CREATE TABLE IF NOT EXISTS customer_fee_waiver_control (
 id VARCHAR(191) PRIMARY KEY CHECK(id='default'),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO customer_fee_waiver_control(id,revision) VALUES ('default',0);

CREATE TABLE IF NOT EXISTS customer_fee_waiver_campaigns (
 id VARCHAR(191) COLLATE utf8mb4_bin PRIMARY KEY NOT NULL,
 revision BIGINT NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 updated_at BIGINT NOT NULL CHECK(updated_at BETWEEN 0 AND 9007199254740991)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_fee_waiver_revisions (
 campaign_id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 revision BIGINT NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 state VARCHAR(16) NOT NULL CHECK(state IN ('draft','published','paused','ended')),
 name VARCHAR(100) NOT NULL CHECK(CHAR_LENGTH(trim(name)) BETWEEN 1 AND 100),
 description TEXT NOT NULL CHECK(CHAR_LENGTH(description)<=1000),
 starts_at BIGINT NOT NULL CHECK(starts_at BETWEEN 0 AND 9007199254740991),
 ends_at BIGINT NOT NULL CHECK(ends_at BETWEEN 1 AND 9007199254740991 AND ends_at>starts_at),
 created_by VARCHAR(191) NOT NULL,
 request_id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL UNIQUE,
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(campaign_id,revision),
 CONSTRAINT customer_fee_revision_campaign_fk FOREIGN KEY(campaign_id) REFERENCES customer_fee_waiver_campaigns(id),
 CONSTRAINT customer_fee_revision_actor_fk FOREIGN KEY(created_by) REFERENCES users(id),
 INDEX idx_customer_fee_waiver_history(campaign_id,created_at,revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_fee_waiver_requests (
 request_id VARCHAR(191) COLLATE utf8mb4_bin PRIMARY KEY NOT NULL CHECK(CHAR_LENGTH(request_id) BETWEEN 1 AND 191),
 actor_id VARCHAR(191) NOT NULL,
 auth_subject VARCHAR(191) NOT NULL,
 command_json LONGTEXT NOT NULL CHECK(json_valid(command_json) AND JSON_TYPE(command_json)='OBJECT'),
 response_json LONGTEXT NOT NULL CHECK(json_valid(response_json) AND JSON_TYPE(response_json)='OBJECT'),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 CONSTRAINT customer_fee_request_actor_fk FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_customer_service_fees (
 order_id VARCHAR(191) PRIMARY KEY NOT NULL,
 policy_enabled BIGINT NOT NULL CHECK(policy_enabled IN (0,1)),
 policy_amount_paisa BIGINT NOT NULL CHECK(policy_amount_paisa BETWEEN 0 AND 100000),
 policy_version_id VARCHAR(191),
 standard_paisa BIGINT NOT NULL CHECK(standard_paisa BETWEEN 0 AND 9007199254740991),
 waived_paisa BIGINT NOT NULL CHECK(waived_paisa BETWEEN 0 AND 9007199254740991),
 net_paisa BIGINT NOT NULL CHECK(net_paisa BETWEEN 0 AND 9007199254740991),
 campaign_id VARCHAR(191) COLLATE utf8mb4_bin,
 campaign_revision BIGINT CHECK(campaign_revision IS NULL OR campaign_revision BETWEEN 1 AND 9007199254740991),
 created_at BIGINT NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 CONSTRAINT customer_fee_evidence_order_fk FOREIGN KEY(order_id) REFERENCES orders(id),
 CONSTRAINT customer_fee_evidence_revision_fk FOREIGN KEY(campaign_id,campaign_revision) REFERENCES customer_fee_waiver_revisions(campaign_id,revision),
 CONSTRAINT customer_fee_policy_standard CHECK((policy_enabled=1 AND standard_paisa=policy_amount_paisa) OR (policy_enabled=0 AND standard_paisa=0)),
 CONSTRAINT customer_fee_reconciled CHECK(standard_paisa-waived_paisa=net_paisa),
 CONSTRAINT customer_fee_full_waiver CHECK((campaign_id IS NULL AND campaign_revision IS NULL AND waived_paisa=0) OR
       (campaign_id IS NOT NULL AND campaign_revision IS NOT NULL AND standard_paisa>0 AND waived_paisa=standard_paisa AND net_paisa=0)),
 INDEX idx_order_customer_service_fees_campaign(campaign_id,campaign_revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Duplicate immutable identities are rejected before any replacement semantics.
DROP TRIGGER IF EXISTS customer_fee_waiver_revisions_no_replace;
DELIMITER $$
CREATE TRIGGER customer_fee_waiver_revisions_no_replace BEFORE INSERT ON customer_fee_waiver_revisions FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM customer_fee_waiver_revisions WHERE (campaign_id=NEW.campaign_id AND revision=NEW.revision) OR request_id=NEW.request_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_revision_immutable'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS customer_fee_waiver_requests_no_replace;
DELIMITER $$
CREATE TRIGGER customer_fee_waiver_requests_no_replace BEFORE INSERT ON customer_fee_waiver_requests FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM customer_fee_waiver_requests WHERE request_id=NEW.request_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_request_immutable'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS order_customer_service_fees_no_replace;
DELIMITER $$
CREATE TRIGGER order_customer_service_fees_no_replace BEFORE INSERT ON order_customer_service_fees FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM order_customer_service_fees WHERE order_id=NEW.order_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_snapshot_immutable'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS customer_fee_waiver_revisions_no_update;
CREATE TRIGGER customer_fee_waiver_revisions_no_update BEFORE UPDATE ON customer_fee_waiver_revisions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_revision_immutable';
DROP TRIGGER IF EXISTS customer_fee_waiver_revisions_no_delete;
CREATE TRIGGER customer_fee_waiver_revisions_no_delete BEFORE DELETE ON customer_fee_waiver_revisions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_revision_immutable';
DROP TRIGGER IF EXISTS customer_fee_waiver_requests_no_update;
CREATE TRIGGER customer_fee_waiver_requests_no_update BEFORE UPDATE ON customer_fee_waiver_requests FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_request_immutable';
DROP TRIGGER IF EXISTS customer_fee_waiver_requests_no_delete;
CREATE TRIGGER customer_fee_waiver_requests_no_delete BEFORE DELETE ON customer_fee_waiver_requests FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_request_immutable';
DROP TRIGGER IF EXISTS customer_fee_waiver_campaigns_no_delete;
CREATE TRIGGER customer_fee_waiver_campaigns_no_delete BEFORE DELETE ON customer_fee_waiver_campaigns FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_campaign_retained';
DROP TRIGGER IF EXISTS order_customer_service_fees_no_update;
CREATE TRIGGER order_customer_service_fees_no_update BEFORE UPDATE ON order_customer_service_fees FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_snapshot_immutable';
DROP TRIGGER IF EXISTS order_customer_service_fees_no_delete;
CREATE TRIGGER order_customer_service_fees_no_delete BEFORE DELETE ON order_customer_service_fees FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_snapshot_immutable';
DROP TRIGGER IF EXISTS order_customer_service_fees_match_order;
DELIMITER $$
CREATE TRIGGER order_customer_service_fees_match_order BEFORE INSERT ON order_customer_service_fees FOR EACH ROW BEGIN
 IF NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND buyer_platform_fee_paisa=NEW.net_paisa) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_order_mismatch'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS orders_preserve_customer_service_fee;
DELIMITER $$
CREATE TRIGGER orders_preserve_customer_service_fee BEFORE UPDATE ON orders FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM order_customer_service_fees WHERE order_id=OLD.id AND (NEW.id<>OLD.id OR net_paisa<>NEW.buyer_platform_fee_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_order_mismatch'; END IF;
END$$
DELIMITER ;
-- Additive storage only. No rates, bindings, approvals or acceptances are inserted.
CREATE TABLE IF NOT EXISTS commission_continuity_operations (
 id VARCHAR(191) NOT NULL,
 request_json LONGTEXT COLLATE utf8mb4_bin NOT NULL,
 source_release VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 source_commit VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
 capture_sha256 VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
 selection_sha256 VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
 basis_points BIGINT NOT NULL,
 started_at BIGINT NOT NULL,
 ends_at BIGINT NOT NULL,
 actor_id VARCHAR(191) NOT NULL,
 recorded_at BIGINT NOT NULL,
 PRIMARY KEY(id),
 CONSTRAINT continuity_operation_rate CHECK(basis_points=900),
 CONSTRAINT continuity_operation_interval CHECK(ends_at=1794334500000 AND started_at<ends_at),
 CONSTRAINT continuity_operation_recorded CHECK(recorded_at=started_at),
 CONSTRAINT continuity_operation_actor_fk FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS commission_continuity_settings (
 operation_id VARCHAR(191) NOT NULL,
 setting_key VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 setting_id VARCHAR(191) NOT NULL,
 successor_id VARCHAR(191) NOT NULL,
 current_json LONGTEXT COLLATE utf8mb4_bin NOT NULL,
 successor_json LONGTEXT COLLATE utf8mb4_bin NOT NULL,
 PRIMARY KEY(setting_id),
 UNIQUE KEY continuity_setting_successor(successor_id),
 UNIQUE KEY continuity_operation_key(operation_id,setting_key),
 CONSTRAINT continuity_setting_key CHECK(setting_key IN ('independent_seller_commission_bps','managed_sale_linked_platform_retention_bps')),
 CONSTRAINT continuity_setting_operation_fk FOREIGN KEY(operation_id) REFERENCES commission_continuity_operations(id) ON DELETE RESTRICT,
 CONSTRAINT continuity_setting_current_fk FOREIGN KEY(setting_id) REFERENCES business_setting_versions(id) ON DELETE RESTRICT,
 CONSTRAINT continuity_setting_successor_fk FOREIGN KEY(successor_id) REFERENCES business_setting_versions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS commission_continuity_sellers (
 id VARCHAR(191) NOT NULL,
 operation_id VARCHAR(191) NOT NULL,
 setting_id VARCHAR(191) NOT NULL,
 seller_id VARCHAR(191) NOT NULL,
 owner_id VARCHAR(191) NOT NULL,
 agreement_version VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 accepted_at BIGINT NOT NULL,
 audit_id VARCHAR(191) NOT NULL,
 audit_json LONGTEXT COLLATE utf8mb4_bin NOT NULL,
 PRIMARY KEY(id),
 UNIQUE KEY continuity_seller_identity(seller_id),
 UNIQUE KEY continuity_seller_audit(audit_id),
 UNIQUE KEY continuity_operation_seller(operation_id,seller_id),
 CONSTRAINT continuity_seller_operation_fk FOREIGN KEY(operation_id) REFERENCES commission_continuity_operations(id) ON DELETE RESTRICT,
 CONSTRAINT continuity_seller_setting_fk FOREIGN KEY(setting_id) REFERENCES commission_continuity_settings(setting_id) ON DELETE RESTRICT,
 CONSTRAINT continuity_seller_profile_fk FOREIGN KEY(seller_id) REFERENCES seller_profiles(id) ON DELETE RESTRICT,
 CONSTRAINT continuity_seller_owner_fk FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT continuity_seller_audit_fk FOREIGN KEY(audit_id) REFERENCES audit_logs(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DROP TRIGGER IF EXISTS commission_continuity_operations_no_update;
CREATE TRIGGER commission_continuity_operations_no_update BEFORE UPDATE ON commission_continuity_operations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable';
DROP TRIGGER IF EXISTS commission_continuity_operations_no_delete;
CREATE TRIGGER commission_continuity_operations_no_delete BEFORE DELETE ON commission_continuity_operations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable';
DROP TRIGGER IF EXISTS commission_continuity_operations_no_replace;
DELIMITER $$
CREATE TRIGGER commission_continuity_operations_no_replace BEFORE INSERT ON commission_continuity_operations FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM commission_continuity_operations WHERE id=NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS commission_continuity_settings_no_update;
CREATE TRIGGER commission_continuity_settings_no_update BEFORE UPDATE ON commission_continuity_settings FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable';
DROP TRIGGER IF EXISTS commission_continuity_settings_no_delete;
CREATE TRIGGER commission_continuity_settings_no_delete BEFORE DELETE ON commission_continuity_settings FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable';
DROP TRIGGER IF EXISTS commission_continuity_settings_no_replace;
DELIMITER $$
CREATE TRIGGER commission_continuity_settings_no_replace BEFORE INSERT ON commission_continuity_settings FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM commission_continuity_settings WHERE setting_id=NEW.setting_id OR successor_id=NEW.successor_id OR (operation_id=NEW.operation_id AND setting_key=NEW.setting_key)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS commission_continuity_sellers_no_update;
CREATE TRIGGER commission_continuity_sellers_no_update BEFORE UPDATE ON commission_continuity_sellers FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable';
DROP TRIGGER IF EXISTS commission_continuity_sellers_no_delete;
CREATE TRIGGER commission_continuity_sellers_no_delete BEFORE DELETE ON commission_continuity_sellers FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable';
DROP TRIGGER IF EXISTS commission_continuity_sellers_no_replace;
DELIMITER $$
CREATE TRIGGER commission_continuity_sellers_no_replace BEFORE INSERT ON commission_continuity_sellers FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM commission_continuity_sellers WHERE id=NEW.id OR seller_id=NEW.seller_id OR audit_id=NEW.audit_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='continuity_immutable'; END IF;
END$$
DELIMITER ;

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

-- Additive and repeatable: replace only staff maker/checker checks with active-role approval guards.
-- Existing rows, balances, foreign keys, domain triggers and seller/rider conflicts are retained.
DELIMITER $$
DROP PROCEDURE IF EXISTS hb_single_sa_remove_checks$$
CREATE PROCEDURE hb_single_sa_remove_checks()
BEGIN
 DECLARE finished INTEGER DEFAULT 0;
 DECLARE target_table VARCHAR(64);
 DECLARE target_constraint VARCHAR(64);
 DECLARE matching CURSOR FOR
 SELECT tc.TABLE_NAME,tc.CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS tc
 JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME AND cc.TABLE_NAME=tc.TABLE_NAME
 WHERE tc.CONSTRAINT_SCHEMA=DATABASE() AND tc.CONSTRAINT_TYPE='CHECK'
 AND tc.TABLE_NAME IN ('payouts','refunds','promotions','managed_payouts','managed_supplier_payments','staff_permission_requests','parcel_cash_records')
 AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cc.CHECK_CLAUSE,CHAR(96),''),' ',''),'(',''),')',''),CHAR(10),''),CHAR(13),'')) IN ('approved_byisnullorapproved_by!=prepared_by','approved_byisnullorapproved_by<>prepared_by','approved_byisnullorapproved_by!=prepared_by','approved_byisnullorapproved_by<>prepared_by','approved_byisnullorapproved_by<>prepared_by','approved_byisnullorapproved_by!=prepared_by','high_value_approved_byisnullorapproved_byisnullorhigh_value_approved_by!=approved_by','high_value_approved_byisnullorapproved_byisnullorhigh_value_approved_by<>approved_by','high_value_approved_byisnullorapproved_byisnullorhigh_value_approved_by!=approved_by','approved_byisnullorapproved_by!=created_by','approved_byisnullorapproved_by<>created_by','approved_byisnullorapproved_by!=created_by','decided_byisnullordecided_by<>proposed_by','decided_byisnullordecided_by<>proposed_by','decided_byisnullordecided_by!=proposed_by','kind<>''remittance''orstatus<>''posted''orapproved_byisnotnullandapproved_by<>created_by','kind<>''remittance''orstatus<>''posted''orapproved_byisnotnullandapproved_by<>created_by','kind!=''remittance''orstatus!=''posted''orapproved_byisnotnullandapproved_by!=created_by');
 DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished=1;
 OPEN matching;
 remove_loop: LOOP
 FETCH matching INTO target_table,target_constraint;
 IF finished=1 THEN LEAVE remove_loop; END IF;
 SET @hb_single_sa_ddl=CONCAT('ALTER TABLE ',CHAR(96),REPLACE(target_table,CHAR(96),CONCAT(CHAR(96),CHAR(96))),CHAR(96),' DROP CONSTRAINT ',CHAR(96),REPLACE(target_constraint,CHAR(96),CONCAT(CHAR(96),CHAR(96))),CHAR(96));
 PREPARE hb_single_sa_statement FROM @hb_single_sa_ddl;
 EXECUTE hb_single_sa_statement;
 DEALLOCATE PREPARE hb_single_sa_statement;
 END LOOP;
 CLOSE matching;
END$$
CALL hb_single_sa_remove_checks()$$
DROP PROCEDURE hb_single_sa_remove_checks$$
DROP TRIGGER IF EXISTS payouts_single_sa_insert$$
CREATE TRIGGER payouts_single_sa_insert BEFORE INSERT ON payouts FOR EACH ROW BEGIN IF (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payouts_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS payouts_single_sa_update$$
CREATE TRIGGER payouts_single_sa_update BEFORE UPDATE ON payouts FOR EACH ROW BEGIN IF (NOT(NEW.approved_by<=>OLD.approved_by) OR NOT(NEW.prepared_by<=>OLD.prepared_by) OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payouts_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS refunds_single_sa_insert$$
CREATE TRIGGER refunds_single_sa_insert BEFORE INSERT ON refunds FOR EACH ROW BEGIN IF (NEW.high_value_approved_by=NEW.approved_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.high_value_approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refunds_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS refunds_single_sa_update$$
CREATE TRIGGER refunds_single_sa_update BEFORE UPDATE ON refunds FOR EACH ROW BEGIN IF (NOT(NEW.high_value_approved_by<=>OLD.high_value_approved_by) OR NOT(NEW.approved_by<=>OLD.approved_by) OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.high_value_approved_by=NEW.approved_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.high_value_approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refunds_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS promotions_single_sa_insert$$
CREATE TRIGGER promotions_single_sa_insert BEFORE INSERT ON promotions FOR EACH ROW BEGIN IF (NEW.approved_by=NEW.created_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promotions_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS promotions_single_sa_update$$
CREATE TRIGGER promotions_single_sa_update BEFORE UPDATE ON promotions FOR EACH ROW BEGIN IF (NOT(NEW.approved_by<=>OLD.approved_by) OR NOT(NEW.created_by<=>OLD.created_by) OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.approved_by=NEW.created_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='promotions_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS managed_payouts_single_sa_insert$$
CREATE TRIGGER managed_payouts_single_sa_insert BEFORE INSERT ON managed_payouts FOR EACH ROW BEGIN IF (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_payouts_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS managed_payouts_single_sa_update$$
CREATE TRIGGER managed_payouts_single_sa_update BEFORE UPDATE ON managed_payouts FOR EACH ROW BEGIN IF (NOT(NEW.approved_by<=>OLD.approved_by) OR NOT(NEW.prepared_by<=>OLD.prepared_by) OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_payouts_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS managed_supplier_payments_single_sa_insert$$
CREATE TRIGGER managed_supplier_payments_single_sa_insert BEFORE INSERT ON managed_supplier_payments FOR EACH ROW BEGIN IF (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_supplier_payments_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS managed_supplier_payments_single_sa_update$$
CREATE TRIGGER managed_supplier_payments_single_sa_update BEFORE UPDATE ON managed_supplier_payments FOR EACH ROW BEGIN IF (NOT(NEW.approved_by<=>OLD.approved_by) OR NOT(NEW.prepared_by<=>OLD.prepared_by) OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_supplier_payments_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS staff_permission_requests_single_sa_insert$$
CREATE TRIGGER staff_permission_requests_single_sa_insert BEFORE INSERT ON staff_permission_requests FOR EACH ROW BEGIN IF (NEW.decided_by=NEW.proposed_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.decided_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='staff_permission_requests_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS staff_permission_requests_single_sa_update$$
CREATE TRIGGER staff_permission_requests_single_sa_update BEFORE UPDATE ON staff_permission_requests FOR EACH ROW BEGIN IF (NOT(NEW.decided_by<=>OLD.decided_by) OR NOT(NEW.proposed_by<=>OLD.proposed_by) OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.decided_by=NEW.proposed_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.decided_by AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='staff_permission_requests_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS parcel_cash_records_single_sa_insert$$
CREATE TRIGGER parcel_cash_records_single_sa_insert BEFORE INSERT ON parcel_cash_records FOR EACH ROW BEGIN IF (NEW.kind='remittance' AND NEW.status='posted' AND (NEW.approved_by IS NULL OR (NEW.rider_user_id IS NOT NULL AND NEW.rider_user_id=NEW.approved_by) OR (NEW.approved_by=NEW.created_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='parcel_cash_records_approval_requires_active_super_admin'; END IF; END$$
DROP TRIGGER IF EXISTS parcel_cash_records_single_sa_update$$
CREATE TRIGGER parcel_cash_records_single_sa_update BEFORE UPDATE ON parcel_cash_records FOR EACH ROW BEGIN IF (NEW.kind='remittance' AND NEW.status='posted' AND (NEW.approved_by IS NULL OR (NEW.rider_user_id IS NOT NULL AND NEW.rider_user_id=NEW.approved_by) OR (NEW.approved_by=NEW.created_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='parcel_cash_records_approval_requires_active_super_admin'; END IF; END$$
DELIMITER ;
-- Additive contact security tables; no existing contact proofs are backfilled.
-- The generated base snapshot predates the existing mailbox proof migration.
CREATE TABLE IF NOT EXISTS account_email_verifications (
 user_id VARCHAR(191) PRIMARY KEY NOT NULL,email VARCHAR(254) NOT NULL,verified_at BIGINT NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS account_phone_verifications (
 user_id VARCHAR(191) PRIMARY KEY NOT NULL,
 phone VARCHAR(32) NOT NULL,
 verified_at BIGINT NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS account_contact_challenges (
 token_hash VARCHAR(64) PRIMARY KEY NOT NULL, code_hash VARCHAR(64) NOT NULL,
 user_id VARCHAR(191) NOT NULL, auth_subject VARCHAR(191) NOT NULL,
 channel VARCHAR(8) NOT NULL CHECK(channel IN ('email','phone')),
 contact_value VARCHAR(254) NOT NULL, contact_snapshot VARCHAR(254) NOT NULL,
 attempts BIGINT NOT NULL DEFAULT 0 CHECK(attempts>=0),expires_at BIGINT NOT NULL,created_at BIGINT NOT NULL,
 delivered_at BIGINT NULL,consumed_at BIGINT NULL,
 UNIQUE KEY idx_account_contact_owner_channel(user_id,channel),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS local_contact_captures (
 token_hash VARCHAR(64) PRIMARY KEY NOT NULL,user_id VARCHAR(191) NOT NULL,channel VARCHAR(8) NOT NULL,
 contact_value VARCHAR(254) NOT NULL,code VARCHAR(6) NOT NULL,expires_at BIGINT NOT NULL,
 simulation_label VARCHAR(80) NOT NULL CHECK(simulation_label='SIMULATED — NOT VALID FOR PRODUCTION'),
 FOREIGN KEY(token_hash) REFERENCES account_contact_challenges(token_hash) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DROP TRIGGER IF EXISTS account_phone_change_revoke;
DELIMITER $$
CREATE TRIGGER account_phone_change_revoke AFTER UPDATE ON users FOR EACH ROW
BEGIN
 IF NOT (OLD.phone <=> NEW.phone) THEN
  DELETE FROM account_phone_verifications WHERE user_id=NEW.id;
  DELETE FROM account_contact_challenges WHERE user_id=NEW.id AND channel='phone';
 END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS account_email_change_revoke;
DELIMITER $$
CREATE TRIGGER account_email_change_revoke AFTER UPDATE ON users FOR EACH ROW
BEGIN
 IF lower(OLD.email)<>lower(NEW.email) THEN
  DELETE FROM account_email_verifications WHERE user_id=NEW.id;
  DELETE FROM account_contact_challenges WHERE user_id=NEW.id AND channel='email';
 END IF;
END$$
DELIMITER ;
-- Additive first-time COD confirmation. Apply before enabling order creation on this runtime. No existing orders are backfilled.
CREATE TABLE IF NOT EXISTS first_cod_reviews (
 order_id VARCHAR(191) PRIMARY KEY NOT NULL,customer_id VARCHAR(191) NOT NULL,total_paisa BIGINT NOT NULL CHECK(total_paisa BETWEEN 500000 AND 9007199254740991),
 status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed')),created_at BIGINT NOT NULL,
 confirmed_by VARCHAR(191) NULL,confirmed_at BIGINT NULL,reason VARCHAR(500) NULL,request_id VARCHAR(100) NULL UNIQUE,
 FOREIGN KEY(order_id) REFERENCES orders(id),FOREIGN KEY(customer_id) REFERENCES users(id),FOREIGN KEY(confirmed_by) REFERENCES users(id),
 KEY idx_first_cod_reviews_status(status,created_at),
 CHECK((status='pending' AND confirmed_by IS NULL AND confirmed_at IS NULL AND reason IS NULL AND request_id IS NULL) OR (status='confirmed' AND confirmed_by IS NOT NULL AND confirmed_at>=created_at AND CHAR_LENGTH(TRIM(reason)) BETWEEN 8 AND 500 AND CHAR_LENGTH(request_id) BETWEEN 1 AND 100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DROP TRIGGER IF EXISTS first_cod_review_immutable;
DELIMITER $$
CREATE TRIGGER first_cod_review_immutable BEFORE UPDATE ON first_cod_reviews FOR EACH ROW BEGIN
 IF OLD.status='confirmed' OR NEW.order_id<>OLD.order_id OR NEW.customer_id<>OLD.customer_id OR NEW.total_paisa<>OLD.total_paisa OR NEW.created_at<>OLD.created_at THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COD confirmation evidence is immutable'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_review_confirm_active;
DELIMITER $$
CREATE TRIGGER first_cod_review_confirm_active BEFORE UPDATE ON first_cod_reviews FOR EACH ROW BEGIN
 IF NEW.status='confirmed' AND NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND status='confirmed') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COD confirmation is no longer available'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_audit_no_update;
DELIMITER $$
CREATE TRIGGER first_cod_audit_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW BEGIN
 IF OLD.action='order.first_cod_confirmed' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COD confirmation audit is immutable'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_audit_no_delete;
DELIMITER $$
CREATE TRIGGER first_cod_audit_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW BEGIN
 IF OLD.action='order.first_cod_confirmed' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COD confirmation audit is immutable'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_orders_insert;
DELIMITER $$
CREATE TRIGGER first_cod_orders_insert BEFORE INSERT ON orders FOR EACH ROW BEGIN
 IF NEW.status IN ('packing','ready_for_pickup','dispatched','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_items_insert;
DELIMITER $$
CREATE TRIGGER first_cod_items_insert BEFORE INSERT ON order_items FOR EACH ROW BEGIN
 IF NEW.fulfillment_status IN ('packing','ready_for_pickup','dispatched','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_jobs_insert;
DELIMITER $$
CREATE TRIGGER first_cod_jobs_insert BEFORE INSERT ON shipping_jobs FOR EACH ROW BEGIN
 IF NEW.direction='outbound' AND NEW.status NOT IN ('cancelled') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_parcels_insert;
DELIMITER $$
CREATE TRIGGER first_cod_parcels_insert BEFORE INSERT ON shipping_parcels FOR EACH ROW BEGIN
 IF (NEW.method IS NOT NULL OR NEW.rider_user_id IS NOT NULL OR NEW.delivered_at IS NOT NULL) AND EXISTS(SELECT 1 FROM shipping_jobs j JOIN first_cod_reviews r ON r.order_id=j.order_id WHERE j.id=NEW.shipping_job_id AND j.direction='outbound' AND r.status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_delivery_insert;
DELIMITER $$
CREATE TRIGGER first_cod_delivery_insert BEFORE INSERT ON delivery_assignments FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_shipments_insert;
DELIMITER $$
CREATE TRIGGER first_cod_shipments_insert BEFORE INSERT ON shipments FOR EACH ROW BEGIN
 IF NEW.status IN ('in_transit','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_orders_update;
DELIMITER $$
CREATE TRIGGER first_cod_orders_update BEFORE UPDATE ON orders FOR EACH ROW BEGIN
 IF NEW.status IN ('packing','ready_for_pickup','dispatched','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_items_update;
DELIMITER $$
CREATE TRIGGER first_cod_items_update BEFORE UPDATE ON order_items FOR EACH ROW BEGIN
 IF NEW.fulfillment_status IN ('packing','ready_for_pickup','dispatched','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_jobs_update;
DELIMITER $$
CREATE TRIGGER first_cod_jobs_update BEFORE UPDATE ON shipping_jobs FOR EACH ROW BEGIN
 IF NEW.direction='outbound' AND NEW.status NOT IN ('cancelled') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_parcels_update;
DELIMITER $$
CREATE TRIGGER first_cod_parcels_update BEFORE UPDATE ON shipping_parcels FOR EACH ROW BEGIN
 IF (NEW.method IS NOT NULL OR NEW.rider_user_id IS NOT NULL OR NEW.delivered_at IS NOT NULL) AND EXISTS(SELECT 1 FROM shipping_jobs j JOIN first_cod_reviews r ON r.order_id=j.order_id WHERE j.id=NEW.shipping_job_id AND j.direction='outbound' AND r.status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_delivery_update;
DELIMITER $$
CREATE TRIGGER first_cod_delivery_update BEFORE UPDATE ON delivery_assignments FOR EACH ROW BEGIN
 IF (NOT (NEW.method <=> OLD.method) OR NOT (NEW.rider_user_id <=> OLD.rider_user_id) OR NOT (NEW.courier_name <=> OLD.courier_name) OR NOT (NEW.tracking_reference <=> OLD.tracking_reference) OR NOT (NEW.tracking_url <=> OLD.tracking_url) OR NEW.latitude IS NOT NULL OR NEW.longitude IS NOT NULL) AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_shipments_update;
DELIMITER $$
CREATE TRIGGER first_cod_shipments_update BEFORE UPDATE ON shipments FOR EACH ROW BEGIN
 IF NEW.status IN ('in_transit','delivered') AND EXISTS(SELECT 1 FROM first_cod_reviews WHERE order_id=NEW.order_id AND status='pending') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='First-time COD order awaits staff confirmation'; END IF;
END$$
DELIMITER ;
-- Additive approval evidence guard; no existing rows are changed.
DROP TRIGGER IF EXISTS first_cod_evidence_complete_insert;
DELIMITER $$
CREATE TRIGGER first_cod_evidence_complete_insert BEFORE INSERT ON first_cod_reviews FOR EACH ROW BEGIN
 IF NEW.status='confirmed' AND (NEW.confirmed_by IS NULL OR NEW.confirmed_at IS NULL OR NEW.reason IS NULL OR NEW.request_id IS NULL OR NEW.confirmed_at<NEW.created_at OR CHAR_LENGTH(TRIM(NEW.reason)) NOT BETWEEN 8 AND 500 OR CHAR_LENGTH(NEW.request_id) NOT BETWEEN 1 AND 100) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COD confirmation requires complete staff evidence'; END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS first_cod_evidence_complete_update;
DELIMITER $$
CREATE TRIGGER first_cod_evidence_complete_update BEFORE UPDATE ON first_cod_reviews FOR EACH ROW BEGIN
 IF NEW.status='confirmed' AND (NEW.confirmed_by IS NULL OR NEW.confirmed_at IS NULL OR NEW.reason IS NULL OR NEW.request_id IS NULL OR NEW.confirmed_at<NEW.created_at OR CHAR_LENGTH(TRIM(NEW.reason)) NOT BETWEEN 8 AND 500 OR CHAR_LENGTH(NEW.request_id) NOT BETWEEN 1 AND 100) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COD confirmation requires complete staff evidence'; END IF;
END$$
DELIMITER ;

-- Keep durable holds even when cancelled; deletion would otherwise remove lifecycle guards.
DROP TRIGGER IF EXISTS first_cod_review_no_delete;
DELIMITER $$
CREATE TRIGGER first_cod_review_no_delete BEFORE DELETE ON first_cod_reviews FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COD confirmation evidence is immutable';
END$$
DELIMITER ;
-- Additive upgrade for an existing installation. Review/backup before applying.
CREATE TABLE IF NOT EXISTS seller_application_drafts (
 user_id VARCHAR(191) PRIMARY KEY,
 revision VARCHAR(36) NOT NULL,
 attempt_id VARCHAR(100) NOT NULL,
 form_version BIGINT NOT NULL,
 answers_json LONGTEXT NOT NULL,
 files_json LONGTEXT NOT NULL,
 updated_at BIGINT NOT NULL,
 expires_at BIGINT NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id),
 INDEX seller_application_drafts_expiry(expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS seller_application_draft_uploads (
 id VARCHAR(36) PRIMARY KEY,
 user_id VARCHAR(191) NOT NULL,
 object_key VARCHAR(255) NOT NULL UNIQUE,
 status VARCHAR(16) NOT NULL CHECK(status IN ('uploading','ready','deleting')),
 expires_at BIGINT NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id),
 INDEX seller_application_draft_uploads_expiry(status,expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Additive upgrade. Review and back up the target before applying.
CREATE TABLE IF NOT EXISTS seller_registration_intakes (
 seller_id VARCHAR(191) PRIMARY KEY,
 user_id VARCHAR(191) NOT NULL UNIQUE,
 version BIGINT NOT NULL,
 answers_json LONGTEXT NOT NULL,
 documents_json LONGTEXT NOT NULL,
 review_ready INTEGER NOT NULL CHECK(review_ready IN (0,1)),
 updated_at BIGINT NOT NULL,
 FOREIGN KEY (seller_id) REFERENCES seller_profiles(id),
 FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Additive opt-in contracts; execution requires separately reviewed destination.
ALTER TABLE audit_logs ADD COLUMN command_key VARCHAR(64) COLLATE utf8mb4_bin NULL,
 ADD COLUMN command_digest VARCHAR(64) COLLATE utf8mb4_bin NULL,
 ADD COLUMN command_result_json LONGTEXT COLLATE utf8mb4_bin NULL;
CREATE UNIQUE INDEX audit_command_key_unique ON audit_logs(command_key);
ALTER TABLE notification_messages ADD COLUMN source_event_id VARCHAR(191) COLLATE utf8mb4_bin NULL,
 ADD COLUMN source_revision VARCHAR(191) COLLATE utf8mb4_bin NULL;
CREATE UNIQUE INDEX notification_source_recipient_channel ON notification_messages(source_event_id,source_revision,recipient_user_id,channel);
DELIMITER $$
CREATE TRIGGER audit_command_complete BEFORE INSERT ON audit_logs FOR EACH ROW BEGIN
 IF (NEW.command_key IS NOT NULL OR NEW.command_digest IS NOT NULL OR NEW.command_result_json IS NOT NULL)
 AND (NEW.command_key IS NULL OR CHAR_LENGTH(NEW.command_key)<>64 OR NEW.command_digest IS NULL OR CHAR_LENGTH(NEW.command_digest)<>64 OR NEW.command_result_json IS NULL OR JSON_VALID(NEW.command_result_json)=0)
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='command_receipt_incomplete'; END IF;
END$$
CREATE TRIGGER audit_command_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW BEGIN
 IF OLD.command_key IS NOT NULL AND (NOT(NEW.command_key <=> OLD.command_key) OR NOT(NEW.command_digest <=> OLD.command_digest) OR NOT(NEW.command_result_json <=> OLD.command_result_json)
 OR NOT(NEW.action <=> OLD.action) OR NOT(NEW.subject_type <=> OLD.subject_type) OR NOT(NEW.subject_id <=> OLD.subject_id) OR NOT(NEW.request_id <=> OLD.request_id) OR NOT(NEW.created_at <=> OLD.created_at)
 OR (NEW.actor_id IS NOT NULL AND NOT(NEW.actor_id <=> OLD.actor_id)))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='command_receipt_immutable'; END IF;
END$$
CREATE TRIGGER audit_command_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW BEGIN
 IF OLD.command_key IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='command_receipt_retained'; END IF;
END$$
DELIMITER ;
CREATE TABLE review_tasks (
 id VARCHAR(191) COLLATE utf8mb4_bin PRIMARY KEY,
 source_type VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 source_id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 source_revision VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 started_at BIGINT NOT NULL,
 due_at BIGINT NOT NULL,
 calendar_version VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
 owner_id VARCHAR(191) NULL,
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at BIGINT NOT NULL,
 UNIQUE KEY review_tasks_source(source_type,source_id,source_revision),
 KEY review_tasks_due(due_at,owner_id),
 FOREIGN KEY(owner_id) REFERENCES users(id),
 CHECK(due_at>=started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER review_task_preserve_clock BEFORE UPDATE ON review_tasks FOR EACH ROW BEGIN
 IF NOT(NEW.source_type <=> OLD.source_type) OR NOT(NEW.source_id <=> OLD.source_id) OR NOT(NEW.source_revision <=> OLD.source_revision)
 OR NOT(NEW.started_at <=> OLD.started_at) OR NOT(NEW.due_at <=> OLD.due_at) OR NOT(NEW.calendar_version <=> OLD.calendar_version)
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='review_task_source_clock_immutable'; END IF;
END$$
DELIMITER ;
-- Source artifact only. Applying it requires a separately reviewed destination.
DELIMITER $$
CREATE TRIGGER core_form_receipt_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW BEGIN
 IF OLD.action IN ('form.core_answers','form.compatibility.granted','form.compatibility.revoked') AND (
 NOT(NEW.id <=> OLD.id) OR NOT(NEW.action <=> OLD.action) OR NOT(NEW.subject_type <=> OLD.subject_type)
 OR NOT(NEW.subject_id <=> OLD.subject_id) OR NOT(NEW.request_id <=> OLD.request_id)
 OR NOT(NEW.next_json <=> OLD.next_json) OR NOT(NEW.previous_json <=> OLD.previous_json)
 OR NOT(NEW.created_at <=> OLD.created_at) OR (NEW.actor_id IS NOT NULL AND NOT(NEW.actor_id <=> OLD.actor_id)))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='core_form_receipt_immutable'; END IF;
END$$
CREATE TRIGGER core_form_receipt_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW BEGIN
 IF OLD.action IN ('form.core_answers','form.compatibility.granted','form.compatibility.revoked') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='core_form_receipt_retained'; END IF;
END$$
DELIMITER ;
-- Source artifact only. No existing database is changed by generating this file.
CREATE TABLE IF NOT EXISTS seller_document_change_requests (
 id VARCHAR(191) PRIMARY KEY, seller_id VARCHAR(191) NOT NULL, document_id VARCHAR(191) NOT NULL,
 requested_by VARCHAR(191) NOT NULL, reason TEXT NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','approved','rejected','completed')),
 requested_at BIGINT NOT NULL, reviewed_by VARCHAR(191), reviewed_at BIGINT, review_reason TEXT,
 KEY idx_seller_document_change_requests_seller(seller_id,status),
 FOREIGN KEY(seller_id) REFERENCES seller_profiles(id), FOREIGN KEY(document_id) REFERENCES seller_documents(id),
 FOREIGN KEY(requested_by) REFERENCES users(id), FOREIGN KEY(reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Preserve the replacement FK with a unique name; inline REFERENCES can reuse an existing implicit InnoDB name during ALTER.
ALTER TABLE seller_document_change_requests ADD COLUMN IF NOT EXISTS replacement_document_id VARCHAR(191),
 ADD CONSTRAINT fk_doc_change_replacement_document FOREIGN KEY(replacement_document_id) REFERENCES seller_documents(id);
ALTER TABLE seller_document_change_requests ADD COLUMN IF NOT EXISTS operation_request_id VARCHAR(191);
ALTER TABLE seller_document_change_requests ADD COLUMN IF NOT EXISTS active_permission_id VARCHAR(191);
ALTER TABLE seller_documents ADD COLUMN IF NOT EXISTS review_request_id VARCHAR(191);
CREATE TABLE seller_document_replacement_permissions (
 id VARCHAR(191) PRIMARY KEY,request_id VARCHAR(191) NOT NULL,document_id VARCHAR(191) NOT NULL,expected_review_id VARCHAR(191),
 reviewed_by VARCHAR(191) NOT NULL,reviewed_at BIGINT NOT NULL,reason TEXT NOT NULL,used_document_id VARCHAR(191) UNIQUE,used_at BIGINT,
 FOREIGN KEY(request_id) REFERENCES seller_document_change_requests(id),FOREIGN KEY(document_id) REFERENCES seller_documents(id),
 FOREIGN KEY(reviewed_by) REFERENCES users(id),FOREIGN KEY(used_document_id) REFERENCES seller_documents(id),
 KEY seller_document_permission_request(request_id,reviewed_at),
 CHECK((used_document_id IS NULL AND used_at IS NULL) OR (used_document_id IS NOT NULL AND used_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER seller_document_permission_immutable BEFORE UPDATE ON seller_document_replacement_permissions FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.request_id <=> OLD.request_id) OR NOT(NEW.document_id <=> OLD.document_id)
 OR NOT(NEW.expected_review_id <=> OLD.expected_review_id) OR NOT(NEW.reviewed_by <=> OLD.reviewed_by)
 OR NOT(NEW.reviewed_at <=> OLD.reviewed_at) OR NOT(NEW.reason <=> OLD.reason)
 OR (OLD.used_document_id IS NOT NULL AND (NOT(NEW.used_document_id <=> OLD.used_document_id) OR NOT(NEW.used_at <=> OLD.used_at)))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_document_permission_immutable'; END IF;
END$$
CREATE TRIGGER seller_document_permission_retained BEFORE DELETE ON seller_document_replacement_permissions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_document_permission_retained';
END$$
CREATE TRIGGER seller_document_identity_immutable BEFORE UPDATE ON seller_documents FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.seller_id <=> OLD.seller_id) OR NOT(NEW.kind <=> OLD.kind)
 OR NOT(NEW.object_key <=> OLD.object_key) OR NOT(NEW.original_name <=> OLD.original_name)
 OR NOT(NEW.mime_type <=> OLD.mime_type) OR NOT(NEW.size_bytes <=> OLD.size_bytes) OR NOT(NEW.uploaded_at <=> OLD.uploaded_at)
 OR (OLD.status='verified' AND (NOT(NEW.status <=> OLD.status) OR NOT(NEW.reviewed_at <=> OLD.reviewed_at)
 OR (NEW.reviewed_by IS NOT NULL AND NOT(NEW.reviewed_by <=> OLD.reviewed_by)) OR NOT(NEW.review_request_id <=> OLD.review_request_id)))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_document_version_immutable'; END IF;
END$$
CREATE TRIGGER seller_document_reviewed_retained BEFORE DELETE ON seller_documents FOR EACH ROW BEGIN
 IF OLD.status='verified' OR EXISTS(SELECT 1 FROM seller_document_change_requests WHERE document_id=OLD.id OR replacement_document_id=OLD.id)
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_document_history_retained'; END IF;
END$$
CREATE TRIGGER seller_document_request_identity_immutable BEFORE UPDATE ON seller_document_change_requests FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.seller_id <=> OLD.seller_id) OR NOT(NEW.document_id <=> OLD.document_id)
 OR NOT(NEW.requested_by <=> OLD.requested_by) OR NOT(NEW.reason <=> OLD.reason) OR NOT(NEW.requested_at <=> OLD.requested_at)
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_document_request_immutable'; END IF;
END$$
CREATE TRIGGER seller_document_request_retained BEFORE DELETE ON seller_document_change_requests FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_document_request_retained';
END$$
CREATE TRIGGER seller_document_audit_immutable BEFORE UPDATE ON audit_logs FOR EACH ROW BEGIN
 IF OLD.action LIKE 'seller.document.%' AND (NOT(NEW.id <=> OLD.id) OR NOT(NEW.action <=> OLD.action)
 OR NOT(NEW.subject_type <=> OLD.subject_type) OR NOT(NEW.subject_id <=> OLD.subject_id) OR NOT(NEW.reason <=> OLD.reason)
 OR NOT(NEW.previous_json <=> OLD.previous_json) OR NOT(NEW.next_json <=> OLD.next_json) OR NOT(NEW.request_id <=> OLD.request_id)
 OR NOT(NEW.created_at <=> OLD.created_at) OR (NEW.actor_id IS NOT NULL AND NOT(NEW.actor_id <=> OLD.actor_id)))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_document_audit_immutable'; END IF;
END$$
CREATE TRIGGER seller_document_audit_retained BEFORE DELETE ON audit_logs FOR EACH ROW BEGIN
 IF OLD.action LIKE 'seller.document.%' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='seller_document_audit_retained'; END IF;
END$$
DELIMITER ;
-- Source artifact only. Parity for drizzle/0083; no existing database is changed by generation.
CREATE TABLE seller_protected_revisions (
 seller_id VARCHAR(191) PRIMARY KEY REFERENCES seller_profiles(id),
 identity_revision BIGINT NOT NULL DEFAULT 0,
 bank_revision BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO seller_protected_revisions(seller_id) SELECT id FROM seller_profiles;

DELIMITER $$
CREATE TRIGGER seller_protected_revision_created AFTER INSERT ON seller_profiles FOR EACH ROW BEGIN
 INSERT INTO seller_protected_revisions(seller_id) VALUES(NEW.id);
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER seller_identity_revision_changed AFTER UPDATE ON seller_profiles FOR EACH ROW BEGIN
 IF NOT(NEW.legal_name <=> OLD.legal_name) OR NOT(NEW.applicant_type <=> OLD.applicant_type) OR NOT(NEW.tax_registration_number <=> OLD.tax_registration_number)
 OR NOT(NEW.representative_name <=> OLD.representative_name) OR NOT(NEW.registration_number <=> OLD.registration_number)
 OR NOT(NEW.registration_authority <=> OLD.registration_authority) OR NOT(NEW.tax_mode <=> OLD.tax_mode) THEN
 UPDATE seller_protected_revisions SET identity_revision=identity_revision+1 WHERE seller_id=NEW.id;
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER seller_bank_revision_changed AFTER UPDATE ON seller_profiles FOR EACH ROW BEGIN
 IF NOT(NEW.payout_account_reference <=> OLD.payout_account_reference) THEN
 UPDATE seller_protected_revisions SET bank_revision=bank_revision+1 WHERE seller_id=NEW.id;
 END IF;
END$$
DELIMITER ;

ALTER TABLE seller_documents ADD COLUMN valid_until BIGINT;

DELIMITER $$
CREATE TRIGGER seller_evidence_revision_changed AFTER UPDATE ON seller_documents FOR EACH ROW BEGIN
 IF NOT(NEW.status <=> OLD.status) OR NOT(NEW.valid_until <=> OLD.valid_until) THEN
 UPDATE seller_protected_revisions SET
 identity_revision=identity_revision+CASE WHEN NEW.kind<>'bank_verification' THEN 1 ELSE 0 END,
 bank_revision=bank_revision+CASE WHEN NEW.kind='bank_verification' THEN 1 ELSE 0 END WHERE seller_id=NEW.seller_id;
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER seller_identity_facts_revision_changed AFTER INSERT ON managed_maker_application_details FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM managed_maker_application_details previous WHERE previous.seller_id=NEW.seller_id AND previous.id<>NEW.id
 AND previous.id=(SELECT id FROM managed_maker_application_details WHERE seller_id=NEW.seller_id AND id<>NEW.id ORDER BY created_at DESC,id DESC LIMIT 1)
 AND (NOT(previous.government_id_type <=> NEW.government_id_type) OR NOT(previous.government_id_description <=> NEW.government_id_description) OR NOT(previous.personal_pan <=> NEW.personal_pan))) THEN
 UPDATE seller_protected_revisions SET identity_revision=identity_revision+1 WHERE seller_id=NEW.seller_id;
 END IF;
END$$
DELIMITER ;

CREATE TABLE seller_protected_change_cases (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 kind VARCHAR(191) NOT NULL CHECK(kind IN ('identity','bank')),
 classification VARCHAR(191) NOT NULL CHECK(classification IN ('unclassified','material','identity_evidence_only','bank')),
 status VARCHAR(191) NOT NULL DEFAULT 'open' CHECK(status IN ('open','verified','rejected','withdrawn','closed')),
 source_request_id VARCHAR(191) UNIQUE REFERENCES seller_document_change_requests(id),
 source_document_id VARCHAR(191) REFERENCES seller_documents(id),
 original_identity_revision BIGINT NOT NULL,
 original_bank_reference TEXT,
 scope_json LONGTEXT NOT NULL,
 proposed_json LONGTEXT,
 replacement_document_id VARCHAR(191) REFERENCES seller_documents(id),
 invalid_current BIGINT NOT NULL DEFAULT 0 CHECK(invalid_current IN (0,1)),
 version BIGINT NOT NULL DEFAULT 0,
 requested_by VARCHAR(191) REFERENCES users(id),
 reason TEXT NOT NULL,
 requested_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL,
 reviewed_by VARCHAR(191) REFERENCES users(id),
 reviewed_at BIGINT,
 review_reason TEXT,
 evidence_reference TEXT,
 operation_request_id VARCHAR(191) NOT NULL,
 CHECK(source_request_id IS NULL OR id=source_request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX seller_protected_cases_seller ON seller_protected_change_cases(seller_id,status);

CREATE TABLE seller_capability_holds (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 case_id VARCHAR(191) NOT NULL REFERENCES seller_protected_change_cases(id),
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 capability VARCHAR(191) NOT NULL CHECK(capability IN ('new_orders','payouts')),
 reason TEXT NOT NULL,
 created_at BIGINT NOT NULL,
 released_at BIGINT,
 released_by VARCHAR(191) REFERENCES users(id),
 release_reason TEXT,
 release_request_id VARCHAR(191),
 CHECK((released_at IS NULL AND release_reason IS NULL AND release_request_id IS NULL) OR
 (released_at IS NOT NULL AND release_reason IS NOT NULL AND release_request_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE seller_capability_holds ADD COLUMN active_case_id VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN released_at IS NULL THEN case_id ELSE NULL END) STORED, ADD UNIQUE KEY seller_capability_hold_active(active_case_id,capability);

CREATE INDEX seller_capability_hold_lookup ON seller_capability_holds(seller_id,capability,released_at);

CREATE TABLE seller_payout_review_blocks (
 payout_model VARCHAR(191) NOT NULL CHECK(payout_model IN ('registered','managed','fixed')),
 payout_id VARCHAR(191) NOT NULL,
 case_id VARCHAR(191) NOT NULL REFERENCES seller_protected_change_cases(id),
 disposition VARCHAR(191) NOT NULL CHECK(disposition IN ('reprepare','reconcile')),
 original_status VARCHAR(191) NOT NULL,
 original_destination TEXT NOT NULL,
 original_amount_paisa BIGINT NOT NULL CHECK(original_amount_paisa>0),
 created_at BIGINT NOT NULL,
 PRIMARY KEY(payout_model,payout_id,case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_beneficiary_versions (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 case_id VARCHAR(191) NOT NULL REFERENCES seller_protected_change_cases(id),
 document_id VARCHAR(191) NOT NULL REFERENCES seller_documents(id),
 details_json LONGTEXT NOT NULL,
 identity_revision BIGINT NOT NULL,
 ownership_basis VARCHAR(191) NOT NULL CHECK(ownership_basis IN ('same_person','same_legal_entity')),
 verification_reference TEXT NOT NULL,
 review_reason TEXT NOT NULL,
 verified_by VARCHAR(191) REFERENCES users(id),
 verified_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER protected_case_source_immutable BEFORE UPDATE ON seller_protected_change_cases FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.seller_id <=> OLD.seller_id) OR NOT(NEW.kind <=> OLD.kind) OR NOT(NEW.source_request_id <=> OLD.source_request_id)
 OR NOT(NEW.source_document_id <=> OLD.source_document_id) OR NOT(NEW.original_identity_revision <=> OLD.original_identity_revision)
 OR NOT(NEW.original_bank_reference <=> OLD.original_bank_reference) OR NOT(NEW.requested_at <=> OLD.requested_at)
 OR NOT(NEW.reason <=> OLD.reason) OR NOT(NEW.scope_json <=> OLD.scope_json) OR NOT(NEW.invalid_current <=> OLD.invalid_current)
 OR (NOT(NEW.requested_by <=> NULL) AND NOT(NEW.requested_by <=> OLD.requested_by)) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_case_source_immutable';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_case_retained BEFORE DELETE ON seller_protected_change_cases FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_case_history_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER capability_hold_immutable BEFORE UPDATE ON seller_capability_holds FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.case_id <=> OLD.case_id) OR NOT(NEW.seller_id <=> OLD.seller_id) OR NOT(NEW.capability <=> OLD.capability)
 OR NOT(NEW.reason <=> OLD.reason) OR NOT(NEW.created_at <=> OLD.created_at)
 OR (NOT(OLD.released_at <=> NULL) AND (NOT(NEW.released_at <=> OLD.released_at) OR NOT(NEW.release_reason <=> OLD.release_reason)
 OR NOT(NEW.release_request_id <=> OLD.release_request_id) OR (NOT(NEW.released_by <=> NULL) AND NOT(NEW.released_by <=> OLD.released_by)))) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='capability_hold_history_immutable';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER capability_hold_retained BEFORE DELETE ON seller_capability_holds FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='capability_hold_history_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER payout_review_block_immutable BEFORE UPDATE ON seller_payout_review_blocks FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_review_block_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER payout_review_block_retained BEFORE DELETE ON seller_payout_review_blocks FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_review_block_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER beneficiary_version_immutable BEFORE UPDATE ON seller_beneficiary_versions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='beneficiary_version_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER beneficiary_version_retained BEFORE DELETE ON seller_beneficiary_versions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='beneficiary_version_retained';
END$$
DELIMITER ;

CREATE TABLE seller_protected_change_permissions (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 case_id VARCHAR(191) NOT NULL REFERENCES seller_protected_change_cases(id),
 scope_json LONGTEXT NOT NULL,
 identity_revision BIGINT NOT NULL,
 bank_revision BIGINT NOT NULL,
 reviewed_by VARCHAR(191) REFERENCES users(id),
 reviewed_at BIGINT NOT NULL,
 reason TEXT NOT NULL,
 used_document_id VARCHAR(191) REFERENCES seller_documents(id),
 used_at BIGINT,
 CHECK((used_document_id IS NULL AND used_at IS NULL) OR (used_document_id IS NOT NULL AND used_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preserve the permission FK without reusing an existing implicit InnoDB constraint name.
ALTER TABLE seller_protected_change_cases ADD COLUMN active_permission_id VARCHAR(191),
 ADD CONSTRAINT fk_protected_case_active_permission FOREIGN KEY(active_permission_id) REFERENCES seller_protected_change_permissions(id);

CREATE TABLE seller_protected_change_events (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 case_id VARCHAR(191) NOT NULL REFERENCES seller_protected_change_cases(id),
 actor_id VARCHAR(191) REFERENCES users(id),
 action VARCHAR(191) NOT NULL,
 reason TEXT NOT NULL,
 payload_json LONGTEXT NOT NULL,
 created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER protected_permission_immutable BEFORE UPDATE ON seller_protected_change_permissions FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.case_id <=> OLD.case_id) OR NOT(NEW.scope_json <=> OLD.scope_json) OR NOT(NEW.identity_revision <=> OLD.identity_revision)
 OR NOT(NEW.bank_revision <=> OLD.bank_revision) OR NOT(NEW.reviewed_at <=> OLD.reviewed_at) OR NOT(NEW.reason <=> OLD.reason)
 OR (NOT(NEW.reviewed_by <=> NULL) AND NOT(NEW.reviewed_by <=> OLD.reviewed_by))
 OR (NOT(OLD.used_at <=> NULL) AND (NOT(NEW.used_at <=> OLD.used_at) OR NOT(NEW.used_document_id <=> OLD.used_document_id))) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_permission_immutable';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_permission_retained BEFORE DELETE ON seller_protected_change_permissions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_permission_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_change_event_immutable BEFORE UPDATE ON seller_protected_change_events FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_change_event_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_change_event_retained BEFORE DELETE ON seller_protected_change_events FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_change_event_retained';
END$$
DELIMITER ;

ALTER TABLE seller_documents ADD COLUMN protected_change_id VARCHAR(191) REFERENCES seller_protected_change_cases(id);

CREATE TABLE seller_identity_fact_versions (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 case_id VARCHAR(191) NOT NULL UNIQUE REFERENCES seller_protected_change_cases(id),
 identity_revision BIGINT NOT NULL,
 facts_json LONGTEXT NOT NULL CHECK(JSON_VALID(facts_json)),
 verified_by VARCHAR(191) REFERENCES users(id),
 verified_at BIGINT NOT NULL,
 verification_reference TEXT NOT NULL,
 review_reason TEXT NOT NULL,
 UNIQUE(seller_id,identity_revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER protected_identity_facts_immutable BEFORE UPDATE ON seller_identity_fact_versions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_identity_facts_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_identity_facts_retained BEFORE DELETE ON seller_identity_fact_versions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_identity_facts_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_document_case_immutable BEFORE UPDATE ON seller_documents FOR EACH ROW BEGIN
 IF NOT(OLD.protected_change_id <=> NULL) AND NOT(NEW.protected_change_id <=> OLD.protected_change_id) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_document_case_immutable';
 END IF;
END$$
DELIMITER ;

CREATE TABLE seller_payout_packet_dispositions (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 case_id VARCHAR(191) NOT NULL REFERENCES seller_protected_change_cases(id),
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 payout_model VARCHAR(191) NOT NULL CHECK(payout_model IN ('registered','managed','fixed')),
 old_payout_id VARCHAR(191) NOT NULL,
 original_status VARCHAR(191) NOT NULL,
 original_destination TEXT NOT NULL,
 original_amount_paisa BIGINT NOT NULL,
 evidence_reference TEXT NOT NULL,
 reason TEXT NOT NULL,
 actor_id VARCHAR(191) REFERENCES users(id),
 created_at BIGINT NOT NULL,
 UNIQUE(payout_model,old_payout_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_payout_packet_replacements (
 disposition_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES seller_payout_packet_dispositions(id),
 new_payout_id VARCHAR(191) NOT NULL,
 actor_id VARCHAR(191) REFERENCES users(id),
 created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER protected_packet_disposition_immutable BEFORE UPDATE ON seller_payout_packet_dispositions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_packet_disposition_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_packet_disposition_retained BEFORE DELETE ON seller_payout_packet_dispositions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_packet_disposition_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_packet_replacement_immutable BEFORE UPDATE ON seller_payout_packet_replacements FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_packet_replacement_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER protected_packet_replacement_retained BEFORE DELETE ON seller_payout_packet_replacements FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='protected_packet_replacement_retained';
END$$
DELIMITER ;
-- Source-only MariaDB counterpart for drizzle/0084. Generation never applies it to a database.

CREATE TABLE seller_public_profile_states (
 seller_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES seller_profiles(id),
 version BIGINT NOT NULL DEFAULT 0,
 current_json LONGTEXT NOT NULL CHECK(json_valid(current_json)),
 display_name TEXT NOT NULL,
 public_city TEXT NOT NULL,
 about TEXT NOT NULL,
 specialties TEXT NOT NULL,
 legacy_sources_json LONGTEXT NOT NULL CHECK(json_valid(legacy_sources_json)),
 provenance VARCHAR(64) NOT NULL CHECK(provenance IN ('legacy_baseline','initial_minimal','reviewed_publication','reviewed_correction')),
 legacy_saved_at BIGINT,
 legacy_clock_reviewed_at BIGINT,
 legacy_clock_value BIGINT,
 legacy_clock_evidence TEXT,
 last_normal_publication_at BIGINT,
 current_revision_id VARCHAR(191),
 support_request_id VARCHAR(191),
 updated_at BIGINT NOT NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_public_profile_drafts (
 seller_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES seller_profiles(id),
 owner_id VARCHAR(191) NOT NULL REFERENCES users(id),
 revision VARCHAR(191) NOT NULL,
 base_version BIGINT NOT NULL,
 values_json LONGTEXT NOT NULL CHECK(json_valid(values_json)),
 updated_at BIGINT NOT NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_public_profile_revisions (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 sequence BIGINT NOT NULL CHECK(sequence>0),
 case_id VARCHAR(191) NOT NULL REFERENCES seller_public_profile_revisions(id),
 supersedes_id VARCHAR(191) REFERENCES seller_public_profile_revisions(id),
 kind VARCHAR(64) NOT NULL DEFAULT 'normal' CHECK(kind IN ('normal','correction')),
 correction_case_id VARCHAR(191),
 base_version BIGINT NOT NULL,
 base_json LONGTEXT NOT NULL CHECK(json_valid(base_json)),
 values_json LONGTEXT NOT NULL CHECK(json_valid(values_json)),
 content_hash VARCHAR(191) NOT NULL,
 draft_revision VARCHAR(191) NOT NULL,
 submitted_by VARCHAR(191) NOT NULL REFERENCES users(id),
 owner_id VARCHAR(191) NOT NULL REFERENCES users(id),
 submitted_at BIGINT NOT NULL,
 first_submitted_at BIGINT NOT NULL,
 status VARCHAR(64) NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','changes_requested','rejected','approved','published','withdrawn','needs_rebase')),
 version BIGINT NOT NULL DEFAULT 0,
 reviewed_by VARCHAR(191) REFERENCES users(id),
 reviewed_at BIGINT,
 review_reason TEXT,
 published_at BIGINT,
 operation_request_id VARCHAR(191) NOT NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_public_profile_revision_media (
 revision_id VARCHAR(191) NOT NULL REFERENCES seller_public_profile_revisions(id),
 media_id VARCHAR(191) NOT NULL REFERENCES seller_profile_media(id),
 kind VARCHAR(64) NOT NULL CHECK(kind IN ('profile_image','maker_video')),
 caption TEXT NOT NULL,
 PRIMARY KEY(revision_id,media_id),
 UNIQUE(revision_id,kind)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_public_profile_corrections (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 owner_id VARCHAR(191) NOT NULL REFERENCES users(id),
 category VARCHAR(64) NOT NULL CHECK(category IN ('wrong_detail','location_correction','privacy','compromised_link','staff_requested')),
 fields_json LONGTEXT NOT NULL CHECK(json_valid(fields_json)),
 scope_hash VARCHAR(191) NOT NULL,
 original_base_version BIGINT NOT NULL,
 original_json LONGTEXT NOT NULL CHECK(json_valid(original_json)),
 base_version BIGINT NOT NULL,
 desired_json LONGTEXT CHECK(desired_json IS NULL OR json_valid(desired_json)),
 requested_by VARCHAR(191) NOT NULL REFERENCES users(id),
 requested_at BIGINT NOT NULL,
 reason TEXT NOT NULL,
 status VARCHAR(64) NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','clarification','authorized','declined','applied','withdrawn')),
 version BIGINT NOT NULL DEFAULT 0,
 reviewed_by VARCHAR(191) REFERENCES users(id),
 reviewed_at BIGINT,
 review_reason TEXT,
 next_update_at BIGINT,
 operation_request_id VARCHAR(191) NOT NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_public_profile_events (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 revision_id VARCHAR(191) REFERENCES seller_public_profile_revisions(id),
 correction_id VARCHAR(191) REFERENCES seller_public_profile_corrections(id),
 actor_id VARCHAR(191) REFERENCES users(id),
 action VARCHAR(64) NOT NULL,
 reason TEXT NOT NULL,
 payload_json LONGTEXT NOT NULL CHECK(json_valid(payload_json)),
 created_at BIGINT NOT NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO seller_public_profile_states(seller_id,current_json,display_name,public_city,about,specialties,legacy_sources_json,provenance,legacy_saved_at,updated_at)
 SELECT s.id,json_object('publicName',COALESCE(p.public_name,s.trading_name),'publicCity',COALESCE(p.public_city,s.municipality),
   'about',COALESCE(s.business_description,''),'specialties','','craftExperience',JSON_ARRAY(),'socialLinks',JSON_OBJECT(),'media',JSON_ARRAY()),
   COALESCE(p.public_name,s.trading_name),COALESCE(p.public_city,s.municipality),COALESCE(s.business_description,''),'',
   json_object('tradingName',s.trading_name,'publicName',p.public_name,'publicCity',p.public_city,'municipality',s.municipality,
     'about',s.business_description,'specialties',s.product_categories,'craftExperience',p.craft_experience_json,'socialLinks',p.social_links_json),
   'legacy_baseline',(SELECT MAX(created_at) FROM audit_logs WHERE subject_type='seller_profile' AND subject_id=s.id AND action='seller.public_profile.saved'),s.updated_at
 FROM seller_profiles s LEFT JOIN seller_participation_profiles p ON p.seller_id=s.id;

CREATE UNIQUE INDEX public_profile_revision_history ON seller_public_profile_revisions(seller_id,sequence);

DROP INDEX idx_seller_profile_media_kind ON seller_profile_media;

CREATE INDEX seller_profile_media_history ON seller_profile_media(seller_id,kind,uploaded_at,id);

ALTER TABLE seller_public_profile_revisions ADD COLUMN active_normal_seller VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN kind='normal' AND status IN ('submitted','approved') THEN seller_id ELSE NULL END) PERSISTENT,
 ADD UNIQUE KEY public_profile_one_normal_candidate(active_normal_seller);
ALTER TABLE seller_public_profile_corrections ADD COLUMN active_scope VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN status IN ('requested','clarification','authorized') THEN scope_hash ELSE NULL END) PERSISTENT,
 ADD UNIQUE KEY public_profile_correction_active(seller_id,active_scope);

DELIMITER $$
CREATE TRIGGER public_profile_minimal_created AFTER INSERT ON seller_profiles FOR EACH ROW BEGIN
 INSERT INTO seller_public_profile_states(seller_id,current_json,display_name,public_city,about,specialties,legacy_sources_json,provenance,updated_at)
 VALUES(NEW.id,json_object('publicName',NEW.trading_name,'publicCity',NEW.municipality,'about','','specialties','','craftExperience',JSON_ARRAY(),'socialLinks',JSON_OBJECT(),'media',JSON_ARRAY()),
 NEW.trading_name,NEW.municipality,'','',json_object('tradingName',NEW.trading_name,'municipality',NEW.municipality,'about',NEW.business_description,'specialties',NEW.product_categories),'initial_minimal',NEW.updated_at);
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_initial_participation AFTER INSERT ON seller_participation_profiles FOR EACH ROW BEGIN
 UPDATE seller_public_profile_states SET current_json=json_set(current_json,'$.publicName',COALESCE(NEW.public_name,JSON_UNQUOTE(JSON_EXTRACT(current_json,'$.publicName'))),
 '$.publicCity',COALESCE(NEW.public_city,JSON_UNQUOTE(JSON_EXTRACT(current_json,'$.publicCity')))),display_name=COALESCE(NEW.public_name,display_name),public_city=COALESCE(NEW.public_city,public_city),
 legacy_sources_json=json_set(legacy_sources_json,'$.publicName',NEW.public_name,'$.publicCity',NEW.public_city,'$.craftExperience',NEW.craft_experience_json,'$.socialLinks',NEW.social_links_json)
 WHERE seller_id=NEW.seller_id AND provenance='initial_minimal' AND version=0
 AND NOT EXISTS(SELECT 1 FROM seller_public_profile_drafts WHERE seller_id=NEW.seller_id)
 AND NOT EXISTS(SELECT 1 FROM seller_public_profile_revisions WHERE seller_id=NEW.seller_id);
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_candidate_immutable BEFORE UPDATE ON seller_public_profile_revisions FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.seller_id <=> OLD.seller_id) OR NOT(NEW.sequence <=> OLD.sequence) OR NOT(NEW.case_id <=> OLD.case_id) OR NOT(NEW.supersedes_id <=> OLD.supersedes_id)
 OR NOT(NEW.kind <=> OLD.kind) OR NOT(NEW.correction_case_id <=> OLD.correction_case_id) OR NOT(NEW.base_version <=> OLD.base_version) OR NOT(NEW.base_json <=> OLD.base_json)
 OR NOT(NEW.values_json <=> OLD.values_json) OR NOT(NEW.content_hash <=> OLD.content_hash) OR NOT(NEW.draft_revision <=> OLD.draft_revision)
 OR NOT(NEW.submitted_by <=> OLD.submitted_by) OR NOT(NEW.owner_id <=> OLD.owner_id) OR NOT(NEW.submitted_at <=> OLD.submitted_at) OR NOT(NEW.first_submitted_at <=> OLD.first_submitted_at)
 OR (OLD.published_at IS NOT NULL AND (NOT(NEW.published_at <=> OLD.published_at) OR NOT(NEW.status <=> OLD.status))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_candidate_immutable'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_candidate_retained BEFORE DELETE ON seller_public_profile_revisions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_candidate_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_event_immutable BEFORE UPDATE ON seller_public_profile_events FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_event_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_event_retained BEFORE DELETE ON seller_public_profile_events FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_event_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_revision_media_immutable BEFORE UPDATE ON seller_public_profile_revision_media FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_revision_media_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_revision_media_retained BEFORE DELETE ON seller_public_profile_revision_media FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_revision_media_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_media_identity_immutable BEFORE UPDATE ON seller_profile_media FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.seller_id <=> OLD.seller_id) OR NOT(NEW.kind <=> OLD.kind) OR NOT(NEW.object_key <=> OLD.object_key)
 OR NOT(NEW.original_name <=> OLD.original_name) OR NOT(NEW.mime_type <=> OLD.mime_type) OR NOT(NEW.size_bytes <=> OLD.size_bytes) OR NOT(NEW.uploaded_at <=> OLD.uploaded_at) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_media_identity_immutable'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_correction_source_immutable BEFORE UPDATE ON seller_public_profile_corrections FOR EACH ROW BEGIN
 IF NOT(NEW.id <=> OLD.id) OR NOT(NEW.seller_id <=> OLD.seller_id) OR NOT(NEW.owner_id <=> OLD.owner_id) OR NOT(NEW.category <=> OLD.category)
 OR NOT(NEW.fields_json <=> OLD.fields_json) OR NOT(NEW.scope_hash <=> OLD.scope_hash) OR NOT(NEW.original_base_version <=> OLD.original_base_version) OR NOT(NEW.original_json <=> OLD.original_json)
 OR NOT(NEW.requested_by <=> OLD.requested_by) OR NOT(NEW.requested_at <=> OLD.requested_at) OR NOT(NEW.reason <=> OLD.reason) OR (OLD.status='applied' AND NOT(NEW.status <=> OLD.status)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_correction_source_immutable'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER public_profile_correction_retained BEFORE DELETE ON seller_public_profile_corrections FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='public_profile_correction_retained';
END$$
DELIMITER ;
-- Source-only MariaDB counterpart of 0085; no database is changed by generation.
ALTER TABLE review_tasks ADD COLUMN has_deadline BIGINT NOT NULL DEFAULT 1 CHECK(has_deadline IN (0,1));

UPDATE review_tasks SET has_deadline=0 WHERE source_type='public_profile_correction';

DELIMITER $$
CREATE TRIGGER review_task_deadline_policy_immutable BEFORE UPDATE ON review_tasks FOR EACH ROW BEGIN
IF NOT(NEW.has_deadline <=> OLD.has_deadline) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='review_task_deadline_policy_immutable';
END IF;
END$$
DELIMITER ;

INSERT IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline)
 SELECT REPLACE(UUID(),'-',''),'seller_application',s.id,s.id,s.created_at,s.created_at,'no-agreed-deadline-v1',s.updated_at,0 FROM seller_profiles s;

INSERT IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline)
 SELECT REPLACE(UUID(),'-',''),'seller_document',d.id,d.id,d.uploaded_at,d.uploaded_at,'no-agreed-deadline-v1',d.uploaded_at,0 FROM seller_documents d
 WHERE d.kind IN ('representative_identity','pan_certificate') AND d.protected_change_id IS NULL;

DELIMITER $$
CREATE TRIGGER seller_application_review_task_created AFTER INSERT ON seller_profiles FOR EACH ROW BEGIN
INSERT IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline)
 VALUES(REPLACE(UUID(),'-',''),'seller_application',NEW.id,NEW.id,NEW.created_at,NEW.created_at,'no-agreed-deadline-v1',NEW.updated_at,0);
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER seller_document_review_task_created AFTER INSERT ON seller_documents FOR EACH ROW BEGIN
IF NEW.kind IN ('representative_identity','pan_certificate') AND NEW.protected_change_id IS NULL THEN
INSERT IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline)
 VALUES(REPLACE(UUID(),'-',''),'seller_document',NEW.id,NEW.id,NEW.uploaded_at,NEW.uploaded_at,'no-agreed-deadline-v1',NEW.uploaded_at,0);
END IF;
END$$
DELIMITER ;
-- Source-only MariaDB counterpart of 0086. Generation never applies this schema or supplies bank data.
CREATE TABLE company_payment_accounts (
 id VARCHAR(191) PRIMARY KEY NOT NULL,revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),latest_version_id VARCHAR(191),
 last_event_id VARCHAR(191) NOT NULL,created_by VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,
 FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_payment_account_identities (
 identity_hash VARCHAR(64) PRIMARY KEY NOT NULL CHECK(CHAR_LENGTH(identity_hash)=64),account_id VARCHAR(191) NOT NULL,
 FOREIGN KEY (account_id) REFERENCES company_payment_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_payment_account_versions (
 id VARCHAR(191) PRIMARY KEY NOT NULL,account_id VARCHAR(191) NOT NULL,number BIGINT NOT NULL CHECK(number>0),
 supersedes_id VARCHAR(191),identity_hash VARCHAR(64) NOT NULL,revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 status VARCHAR(40) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','awaiting_verification','verified','inactive')),
 details_json LONGTEXT NOT NULL CHECK(json_valid(details_json) AND JSON_TYPE(details_json)='OBJECT'),
 evidence_reference VARCHAR(500) NOT NULL CHECK(CHAR_LENGTH(trim(evidence_reference)) BETWEEN 8 AND 500),
 conflicts_json LONGTEXT NOT NULL CHECK(json_valid(conflicts_json) AND JSON_TYPE(conflicts_json)='ARRAY'),
 created_by VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,submitted_at BIGINT,
 verified_by VARCHAR(191),verified_at BIGINT,verification_reference VARCHAR(500),
 UNIQUE(account_id,number),CHECK(status NOT IN ('awaiting_verification','verified') OR submitted_at IS NOT NULL),
 CHECK(status<>'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND CHAR_LENGTH(trim(verification_reference))>=8)),
 FOREIGN KEY (account_id) REFERENCES company_payment_accounts(id),
 FOREIGN KEY (supersedes_id) REFERENCES company_payment_account_versions(id),
 FOREIGN KEY (identity_hash) REFERENCES company_payment_account_identities(identity_hash),
 FOREIGN KEY (created_by) REFERENCES users(id),
 FOREIGN KEY (verified_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_payment_account_current (
 currency VARCHAR(3) PRIMARY KEY NOT NULL CHECK(currency='NPR'),version_id VARCHAR(191),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),updated_by VARCHAR(191),updated_at BIGINT NOT NULL,
 FOREIGN KEY (version_id) REFERENCES company_payment_account_versions(id),
 FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO company_payment_account_current(currency,version_id,revision,updated_at) VALUES('NPR',NULL,0,0);

CREATE TABLE company_payment_account_events (
 id VARCHAR(191) PRIMARY KEY NOT NULL,account_id VARCHAR(191) NOT NULL,version_id VARCHAR(191) NOT NULL,
 actor_id VARCHAR(191) NOT NULL,action VARCHAR(100) NOT NULL,reason VARCHAR(1000) NOT NULL CHECK(CHAR_LENGTH(trim(reason)) BETWEEN 10 AND 1000),created_at BIGINT NOT NULL,
 FOREIGN KEY (account_id) REFERENCES company_payment_accounts(id),
 FOREIGN KEY (version_id) REFERENCES company_payment_account_versions(id),
 FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_payment_instructions (
 order_id VARCHAR(191) PRIMARY KEY NOT NULL,account_version_id VARCHAR(191) NOT NULL,
 snapshot_json LONGTEXT NOT NULL CHECK(json_valid(snapshot_json) AND JSON_TYPE(snapshot_json)='OBJECT'),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),currency VARCHAR(3) NOT NULL CHECK(currency='NPR'),
 payment_reference VARCHAR(191) NOT NULL UNIQUE,issued_at BIGINT NOT NULL,deadline_at BIGINT NOT NULL CHECK(deadline_at=issued_at+86400000),
 calendar_version VARCHAR(100) NOT NULL,issued_by VARCHAR(191) NOT NULL,request_id VARCHAR(191) NOT NULL UNIQUE,
 FOREIGN KEY (order_id) REFERENCES orders(id),
 FOREIGN KEY (account_version_id) REFERENCES company_payment_account_versions(id),
 FOREIGN KEY (issued_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER company_account_head_valid BEFORE UPDATE ON company_payment_accounts FOR EACH ROW BEGIN
IF NEW.revision<>OLD.revision+1 OR BINARY NEW.id<>BINARY OLD.id OR BINARY NEW.created_by<>BINARY OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT EXISTS(SELECT 1 FROM company_payment_account_versions WHERE id=NEW.latest_version_id AND account_id=NEW.id) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_head_conflict';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_version_immutable BEFORE UPDATE ON company_payment_account_versions FOR EACH ROW BEGIN
IF BINARY NEW.id<>BINARY OLD.id OR BINARY NEW.account_id<>BINARY OLD.account_id OR NEW.number<>OLD.number OR NOT(NEW.supersedes_id <=> OLD.supersedes_id)
 OR BINARY NEW.identity_hash<>BINARY OLD.identity_hash OR BINARY NEW.details_json<>BINARY OLD.details_json OR BINARY NEW.evidence_reference<>BINARY OLD.evidence_reference OR BINARY NEW.conflicts_json<>BINARY OLD.conflicts_json
 OR BINARY NEW.created_by<>BINARY OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1
 OR (OLD.submitted_at IS NOT NULL AND NOT(NEW.submitted_at <=> OLD.submitted_at))
 OR (OLD.verified_at IS NOT NULL AND (NOT(NEW.verified_by <=> OLD.verified_by) OR NOT(NEW.verified_at <=> OLD.verified_at) OR NOT(NEW.verification_reference <=> OLD.verification_reference)))
 OR NOT ((OLD.status='draft' AND NEW.status='awaiting_verification') OR (OLD.status='awaiting_verification' AND NEW.status='verified') OR (OLD.status='verified' AND NEW.status='verified') OR (OLD.status<>'inactive' AND NEW.status='inactive')) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_version_immutable';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_selector_valid BEFORE UPDATE ON company_payment_account_current FOR EACH ROW BEGIN
IF NEW.currency<>OLD.currency OR NEW.revision<>OLD.revision+1 OR (NEW.version_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM company_payment_account_versions v JOIN company_payment_accounts a ON a.id=v.account_id
 WHERE v.id=NEW.version_id AND a.latest_version_id=v.id AND v.status='verified' AND JSON_UNQUOTE(JSON_EXTRACT(v.details_json,'$.currency'))=NEW.currency AND JSON_UNQUOTE(JSON_EXTRACT(v.details_json,'$.purpose')) IN ('receiving','both'))) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_selector_conflict';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_retention BEFORE DELETE ON company_payment_accounts FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_immutable_history';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_selector_retention BEFORE DELETE ON company_payment_account_current FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_immutable_history';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_identity_immutable BEFORE UPDATE ON company_payment_account_identities FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_immutable_history';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_identity_retention BEFORE DELETE ON company_payment_account_identities FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_immutable_history';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_version_retention BEFORE DELETE ON company_payment_account_versions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_immutable_history';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_event_immutable BEFORE UPDATE ON company_payment_account_events FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_immutable_history';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_event_retention BEFORE DELETE ON company_payment_account_events FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_account_immutable_history';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_instruction_immutable BEFORE UPDATE ON company_payment_instructions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_instruction_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_instruction_retention BEFORE DELETE ON company_payment_instructions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_instruction_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_account_review_task_created AFTER UPDATE ON company_payment_account_versions FOR EACH ROW BEGIN
IF NEW.status='awaiting_verification' AND OLD.status='draft' THEN
INSERT INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline)
 VALUES(REPLACE(UUID(),'-',''),'company_account',NEW.id,NEW.id,NEW.submitted_at,NEW.submitted_at,'no-agreed-deadline-v1',NEW.submitted_at,0);
END IF;
END$$
DELIMITER ;
-- Source-only MariaDB counterpart of 0087. No category is automatically mapped or enabled.
CREATE TABLE category_template_versions (
 id VARCHAR(191) PRIMARY KEY NOT NULL,category_id VARCHAR(191) NOT NULL,version BIGINT NOT NULL CHECK(version>0),
 contract_json LONGTEXT NOT NULL CHECK(json_valid(contract_json)),created_by VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,
 reason VARCHAR(1000) NOT NULL CHECK(CHAR_LENGTH(trim(reason)) BETWEEN 10 AND 1000),UNIQUE(category_id,version),
 FOREIGN KEY (category_id) REFERENCES categories(id),
 FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE category_template_states (
 category_id VARCHAR(191) PRIMARY KEY NOT NULL,version_id VARCHAR(191) NOT NULL,
 revision BIGINT NOT NULL CHECK(revision>=0),last_event_id VARCHAR(191) NOT NULL,updated_by VARCHAR(191) NOT NULL,updated_at BIGINT NOT NULL,
 FOREIGN KEY (category_id) REFERENCES categories(id),
 FOREIGN KEY (version_id) REFERENCES category_template_versions(id),
 FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_intake_drafts (
 id VARCHAR(191) PRIMARY KEY NOT NULL,owner_id VARCHAR(191) NOT NULL,seller_id VARCHAR(191) NOT NULL,
 product_id VARCHAR(191),revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),category_id VARCHAR(191),
 answers_json LONGTEXT NOT NULL CHECK(json_valid(answers_json)),category_change_json LONGTEXT CHECK(category_change_json IS NULL OR json_valid(category_change_json)),
 created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,
 FOREIGN KEY (owner_id) REFERENCES users(id),
 FOREIGN KEY (seller_id) REFERENCES seller_profiles(id),
 FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_intake_versions (
 id VARCHAR(191) PRIMARY KEY NOT NULL,draft_id VARCHAR(191) NOT NULL,revision BIGINT NOT NULL CHECK(revision>=0),category_id VARCHAR(191),
 answers_json LONGTEXT NOT NULL CHECK(json_valid(answers_json)),category_contract_version_id VARCHAR(191),created_at BIGINT NOT NULL,
 request_id VARCHAR(191) NOT NULL UNIQUE,UNIQUE(draft_id,revision),
 FOREIGN KEY (draft_id) REFERENCES product_intake_drafts(id),
 FOREIGN KEY (category_contract_version_id) REFERENCES category_template_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER category_template_version_immutable BEFORE UPDATE ON category_template_versions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='category_template_version_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER category_template_version_retention BEFORE DELETE ON category_template_versions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='category_template_version_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER category_template_head_valid BEFORE UPDATE ON category_template_states FOR EACH ROW BEGIN
IF BINARY NEW.category_id<>BINARY OLD.category_id OR NEW.revision<>OLD.revision+1 OR NOT EXISTS(SELECT 1 FROM category_template_versions WHERE id=NEW.version_id AND category_id=NEW.category_id AND version=NEW.revision+1) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='category_template_head_conflict';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER category_template_head_retention BEFORE DELETE ON category_template_states FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='category_template_history_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_owner_immutable BEFORE UPDATE ON product_intake_drafts FOR EACH ROW BEGIN
IF BINARY NEW.id<>BINARY OLD.id OR BINARY NEW.owner_id<>BINARY OLD.owner_id OR BINARY NEW.seller_id<>BINARY OLD.seller_id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_revision_conflict';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_version_immutable BEFORE UPDATE ON product_intake_versions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_version_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_version_retention BEFORE DELETE ON product_intake_versions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_version_immutable';
END$$
DELIMITER ;
-- Source-only counterpart of 0088. No backfill, execution, or automatic stock creation.
CREATE TABLE product_offer_versions (id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL ,matrix_json LONGTEXT NOT NULL,created_by VARCHAR(191) NOT NULL ,created_at BIGINT NOT NULL, FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (created_by) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_offer_decisions (id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL ,version_id VARCHAR(191) NOT NULL ,action VARCHAR(191) NOT NULL,actor_id VARCHAR(191) NOT NULL ,reason VARCHAR(1000) NOT NULL,created_at BIGINT NOT NULL, FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (version_id) REFERENCES product_offer_versions(id), FOREIGN KEY (actor_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_offer_heads (product_id VARCHAR(191) PRIMARY KEY ,revision BIGINT NOT NULL CHECK(revision>=0),candidate_version_id VARCHAR(191) ,current_version_id VARCHAR(191) ,inventory_mapped BIGINT NOT NULL DEFAULT 0 CHECK(inventory_mapped IN (0,1)),updated_at BIGINT NOT NULL, FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (candidate_version_id) REFERENCES product_offer_versions(id), FOREIGN KEY (current_version_id) REFERENCES product_offer_versions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_offer_identities (id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL,platform_sku VARCHAR(191) NOT NULL UNIQUE,physical_json LONGTEXT NOT NULL,stock_family_key VARCHAR(191) NOT NULL,base_unit VARCHAR(191) NOT NULL CHECK(BINARY base_unit IN ('piece','gram','millilitre')),units_per_offer BIGINT NOT NULL CHECK(units_per_offer>0),created_at BIGINT NOT NULL, FOREIGN KEY (product_id) REFERENCES products(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX product_offer_identity_product ON product_offer_identities(product_id);

CREATE TABLE product_offer_current (offer_id VARCHAR(191) PRIMARY KEY ,product_id VARCHAR(191) NOT NULL ,version_id VARCHAR(191) NOT NULL ,offer_json LONGTEXT NOT NULL, FOREIGN KEY (offer_id) REFERENCES product_offer_identities(id), FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (version_id) REFERENCES product_offer_versions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX product_offer_current_product ON product_offer_current(product_id);

CREATE TABLE offer_stock (offer_id VARCHAR(191) PRIMARY KEY ,available BIGINT NOT NULL CHECK(available>=0),reserved BIGINT NOT NULL CHECK(reserved>=0),revision BIGINT NOT NULL CHECK(revision>=0),paused BIGINT NOT NULL DEFAULT 0 CHECK(paused IN (0,1)),needs_reconfirmation BIGINT NOT NULL DEFAULT 0 CHECK(needs_reconfirmation IN (0,1)),confirmed_at BIGINT NOT NULL,updated_at BIGINT NOT NULL, FOREIGN KEY (offer_id) REFERENCES product_offer_identities(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE offer_stock_events (id VARCHAR(191) PRIMARY KEY,offer_id VARCHAR(191) NOT NULL ,kind VARCHAR(191) NOT NULL,available_delta BIGINT NOT NULL,reserved_delta BIGINT NOT NULL,related_offer_id VARCHAR(191) ,reason VARCHAR(1000) NOT NULL,actor_id VARCHAR(191) NOT NULL ,request_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL, FOREIGN KEY (offer_id) REFERENCES product_offer_identities(id), FOREIGN KEY (related_offer_id) REFERENCES product_offer_identities(id), FOREIGN KEY (actor_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX offer_stock_events_history ON offer_stock_events(offer_id,created_at);

CREATE TABLE offer_stock_reservations (id VARCHAR(191) PRIMARY KEY,offer_id VARCHAR(191) NOT NULL ,version_id VARCHAR(191) NOT NULL ,customer_id VARCHAR(191) ,quantity BIGINT NOT NULL CHECK(quantity>0),snapshot_json LONGTEXT NOT NULL,state VARCHAR(191) NOT NULL CHECK(BINARY state IN ('reserved','released','consumed')),revision BIGINT NOT NULL CHECK(revision>=0),created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL, FOREIGN KEY (offer_id) REFERENCES product_offer_identities(id), FOREIGN KEY (version_id) REFERENCES product_offer_versions(id), FOREIGN KEY (customer_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX offer_reservation_offer ON offer_stock_reservations(offer_id,state);

CREATE TABLE order_item_offer_snapshots (order_item_id VARCHAR(191) PRIMARY KEY ,offer_id VARCHAR(191) NOT NULL ,version_id VARCHAR(191) NOT NULL ,reservation_id VARCHAR(191) UNIQUE ,snapshot_json LONGTEXT NOT NULL,legacy_mapping BIGINT NOT NULL CHECK(legacy_mapping IN (0,1)),created_at BIGINT NOT NULL, FOREIGN KEY (order_item_id) REFERENCES order_items(id), FOREIGN KEY (offer_id) REFERENCES product_offer_identities(id), FOREIGN KEY (version_id) REFERENCES product_offer_versions(id), FOREIGN KEY (reservation_id) REFERENCES offer_stock_reservations(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE order_items ADD COLUMN offer_reservation_id VARCHAR(191), ADD CONSTRAINT order_items_offer_reservation_fk FOREIGN KEY (offer_reservation_id) REFERENCES offer_stock_reservations(id);
CREATE UNIQUE INDEX order_item_offer_reservation_unique ON order_items(offer_reservation_id);
DROP TRIGGER IF EXISTS order_items_require_available_inventory;
DROP TRIGGER IF EXISTS order_items_reserve_inventory;
DELIMITER $$
CREATE TRIGGER order_items_require_available_inventory BEFORE INSERT ON order_items FOR EACH ROW BEGIN
 IF NEW.product_id IS NULL OR NOT EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND status='published') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM product_offer_heads WHERE product_id=NEW.product_id AND inventory_mapped=1) AND (NEW.offer_reservation_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND inventory_quantity>=NEW.quantity)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM product_offer_heads WHERE product_id=NEW.product_id AND inventory_mapped=1) AND NOT EXISTS(SELECT 1 FROM offer_stock_reservations r JOIN product_offer_identities i ON i.id=r.offer_id JOIN orders o ON o.id=NEW.order_id WHERE r.id=NEW.offer_reservation_id AND i.product_id=NEW.product_id AND r.state='reserved' AND r.quantity=NEW.quantity AND r.customer_id <=> o.customer_id AND JSON_UNQUOTE(JSON_EXTRACT(r.snapshot_json,'$.sellingPaisa'))=NEW.unit_price_paisa AND BINARY JSON_UNQUOTE(JSON_EXTRACT(r.snapshot_json,'$.sku'))=BINARY NEW.sku_snapshot) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='exact_offer_reservation_required'; END IF;
END$$
CREATE TRIGGER order_items_reserve_inventory AFTER INSERT ON order_items FOR EACH ROW BEGIN
 IF NEW.offer_reservation_id IS NULL THEN
  UPDATE products SET inventory_quantity=inventory_quantity-NEW.quantity,updated_at=UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 WHERE id=NEW.product_id AND inventory_quantity>=NEW.quantity;
  IF ROW_COUNT()<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_unavailable'; END IF;
 END IF;
END$$
CREATE TRIGGER order_items_capture_offer AFTER INSERT ON order_items FOR EACH ROW BEGIN
 IF NEW.offer_reservation_id IS NOT NULL THEN INSERT INTO order_item_offer_snapshots(order_item_id,offer_id,version_id,reservation_id,snapshot_json,legacy_mapping,created_at) SELECT NEW.id,r.offer_id,r.version_id,r.id,r.snapshot_json,0,NEW.created_at FROM offer_stock_reservations r WHERE r.id=NEW.offer_reservation_id; END IF;
END$$
CREATE TRIGGER order_items_offer_reference_immutable BEFORE UPDATE ON order_items FOR EACH ROW BEGIN
 IF NOT (BINARY NEW.offer_reservation_id <=> BINARY OLD.offer_reservation_id) OR (OLD.offer_reservation_id IS NOT NULL AND (NOT (BINARY NEW.product_id <=> BINARY OLD.product_id) OR BINARY NEW.seller_id<>BINARY OLD.seller_id OR NEW.quantity<>OLD.quantity OR NEW.unit_price_paisa<>OLD.unit_price_paisa OR BINARY NEW.sku_snapshot<>BINARY OLD.sku_snapshot)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_offer_reference_immutable'; END IF;
END$$
CREATE TRIGGER offer_decision_immutable BEFORE UPDATE ON product_offer_decisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_decision_immutable'; END$$
CREATE TRIGGER offer_decision_retained BEFORE DELETE ON product_offer_decisions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_decision_retained'; END$$
CREATE TRIGGER offer_versions_immutable BEFORE UPDATE ON product_offer_versions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_version_immutable'; END$$
CREATE TRIGGER offer_versions_retained BEFORE DELETE ON product_offer_versions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_version_retained'; END$$
CREATE TRIGGER offer_identities_immutable BEFORE UPDATE ON product_offer_identities FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_identity_immutable'; END$$
CREATE TRIGGER offer_identities_retained BEFORE DELETE ON product_offer_identities FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_identity_retained'; END$$
CREATE TRIGGER offer_heads_revision BEFORE UPDATE ON product_offer_heads FOR EACH ROW BEGIN IF BINARY NEW.product_id<>BINARY OLD.product_id OR NEW.revision<>OLD.revision+1 OR NEW.inventory_mapped<OLD.inventory_mapped THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_head_revision'; END IF; END$$
CREATE TRIGGER offer_stock_revision BEFORE UPDATE ON offer_stock FOR EACH ROW BEGIN IF BINARY NEW.offer_id<>BINARY OLD.offer_id OR NEW.revision<>OLD.revision+1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_stock_revision'; END IF; END$$
CREATE TRIGGER offer_stock_retained BEFORE DELETE ON offer_stock FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_stock_retained'; END$$
CREATE TRIGGER offer_stock_event_immutable BEFORE UPDATE ON offer_stock_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_event_immutable'; END$$
CREATE TRIGGER offer_stock_event_retained BEFORE DELETE ON offer_stock_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_event_retained'; END$$
CREATE TRIGGER offer_reservation_immutable BEFORE UPDATE ON offer_stock_reservations FOR EACH ROW BEGIN IF BINARY NEW.id<>BINARY OLD.id OR BINARY NEW.offer_id<>BINARY OLD.offer_id OR BINARY NEW.version_id<>BINARY OLD.version_id OR NOT (BINARY NEW.customer_id <=> BINARY OLD.customer_id) OR NEW.quantity<>OLD.quantity OR BINARY NEW.snapshot_json<>BINARY OLD.snapshot_json OR NEW.created_at<>OLD.created_at OR BINARY OLD.state<>'reserved' OR BINARY NEW.state NOT IN ('released','consumed') OR NEW.revision<>OLD.revision+1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_reservation_immutable'; END IF; END$$
CREATE TRIGGER offer_reservation_retained BEFORE DELETE ON offer_stock_reservations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_reservation_retained'; END$$
CREATE TRIGGER order_offer_snapshot_immutable BEFORE UPDATE ON order_item_offer_snapshots FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_offer_snapshot_immutable'; END$$
CREATE TRIGGER order_offer_snapshot_retained BEFORE DELETE ON order_item_offer_snapshots FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_offer_snapshot_retained'; END$$
CREATE TRIGGER mapped_product_inventory_protected BEFORE UPDATE ON products FOR EACH ROW BEGIN IF NEW.inventory_quantity<>OLD.inventory_quantity AND EXISTS(SELECT 1 FROM product_offer_heads WHERE product_id=OLD.id AND inventory_mapped=1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offer_inventory_requires_exact_offer'; END IF; END$$
DELIMITER ;
-- Source-only counterpart of 0089. Does not change any existing fee or acceptance.
CREATE TABLE commission_common_policies (
 id VARCHAR(191) PRIMARY KEY,registered_setting_id VARCHAR(191) NOT NULL UNIQUE,managed_setting_id VARCHAR(191) NOT NULL UNIQUE,basis_points BIGINT NOT NULL CHECK(basis_points BETWEEN 0 AND 10000),effective_at BIGINT NOT NULL,published_at BIGINT NOT NULL,published_by VARCHAR(191) NOT NULL,reason VARCHAR(1000) NOT NULL,terms_text LONGTEXT NOT NULL,replaces_id VARCHAR(191),
 CHECK(effective_at>=published_at+1296000000),FOREIGN KEY(registered_setting_id) REFERENCES business_setting_versions(id),FOREIGN KEY(managed_setting_id) REFERENCES business_setting_versions(id),FOREIGN KEY(published_by) REFERENCES users(id),FOREIGN KEY(replaces_id) REFERENCES commission_common_policies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE commission_common_cancellations (
 policy_id VARCHAR(191) PRIMARY KEY,replacement_id VARCHAR(191),actor_id VARCHAR(191) NOT NULL,reason VARCHAR(1000) NOT NULL,created_at BIGINT NOT NULL,event_id VARCHAR(191) NOT NULL UNIQUE,
 FOREIGN KEY(policy_id) REFERENCES commission_common_policies(id),FOREIGN KEY(replacement_id) REFERENCES commission_common_policies(id),FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE commission_terms_cases (
 id VARCHAR(191) PRIMARY KEY,seller_id VARCHAR(191) NOT NULL,source_version_id VARCHAR(191) NOT NULL,offer_key VARCHAR(191) NOT NULL,route VARCHAR(40) NOT NULL CHECK(route IN ('registered_seller','managed_maker')),state VARCHAR(30) NOT NULL CHECK(state IN ('open','accepted','replaced')),revision BIGINT NOT NULL DEFAULT 1,published_at BIGINT NOT NULL,effective_at BIGINT NOT NULL,created_at BIGINT NOT NULL,observed_at BIGINT NOT NULL,last_notice_event_id VARCHAR(191),last_staff_event_id VARCHAR(191),last_contact_at BIGINT,last_reply_at BIGINT,hold_reviewed_at BIGINT,super_admin_reviewed_at BIGINT,next_review_at BIGINT,technical_issue_at BIGINT,technical_owner_id VARCHAR(191),technical_resolved_at BIGINT,delivery_issue_at BIGINT,delivery_resolved_at BIGINT,
 UNIQUE(seller_id,offer_key),FOREIGN KEY(seller_id) REFERENCES seller_profiles(id),FOREIGN KEY(source_version_id) REFERENCES business_setting_versions(id),FOREIGN KEY(technical_owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE commission_terms_events (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL,event_key VARCHAR(191) NOT NULL UNIQUE,kind VARCHAR(60) NOT NULL,due_at BIGINT NOT NULL,created_at BIGINT NOT NULL,routine BIGINT NOT NULL CHECK(routine IN (0,1)),actor_id VARCHAR(191),detail_json LONGTEXT NOT NULL,
 FOREIGN KEY(case_id) REFERENCES commission_terms_cases(id),FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE commission_terms_email_controls (
 seller_id VARCHAR(191) PRIMARY KEY,revision BIGINT NOT NULL DEFAULT 0,last_routine_queued_at BIGINT,last_routine_sent_at BIGINT,last_personal_contact_at BIGINT,last_routine_message_id VARCHAR(191),routine_claim_token VARCHAR(191),routine_claim_message_id VARCHAR(191),routine_claim_until BIGINT NOT NULL DEFAULT 0,
 FOREIGN KEY(seller_id) REFERENCES seller_profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE commission_terms_hold_batches(id VARCHAR(191) PRIMARY KEY,created_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE commission_terms_hold_batch_events(event_id VARCHAR(191) PRIMARY KEY,batch_id VARCHAR(191) NOT NULL,FOREIGN KEY(event_id) REFERENCES commission_terms_events(id),FOREIGN KEY(batch_id) REFERENCES commission_terms_hold_batches(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE commission_terms_scan_state(id VARCHAR(191) PRIMARY KEY CHECK(id='default'),`cursor` VARCHAR(191) NOT NULL DEFAULT '',revision BIGINT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO commission_terms_scan_state(id) VALUES('default');

DELIMITER $$
CREATE TRIGGER common_fee_policy_immutable BEFORE UPDATE ON commission_common_policies FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='common_fee_policy_immutable'; END$$
CREATE TRIGGER common_fee_policy_retained BEFORE DELETE ON commission_common_policies FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='common_fee_policy_retained'; END$$
CREATE TRIGGER common_fee_cancellation_immutable BEFORE UPDATE ON commission_common_cancellations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='common_fee_cancellation_immutable'; END$$
CREATE TRIGGER common_fee_cancellation_retained BEFORE DELETE ON commission_common_cancellations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='common_fee_cancellation_retained'; END$$
CREATE TRIGGER commission_terms_event_immutable BEFORE UPDATE ON commission_terms_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='commission_terms_event_immutable'; END$$
CREATE TRIGGER commission_terms_event_retained BEFORE DELETE ON commission_terms_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='commission_terms_event_retained'; END$$
DELIMITER ;
-- Source only. Never infer historical private inputs, evidence, approval or publication.
CREATE TABLE product_private_price_inputs(id VARCHAR(191) PRIMARY KEY,owner_id VARCHAR(191) NOT NULL,subject_kind VARCHAR(20) NOT NULL CHECK(subject_kind IN ('product','intake')),subject_id VARCHAR(191) NOT NULL,offer_key VARCHAR(191) NOT NULL,revision BIGINT NOT NULL CHECK(revision>=0),cost_text VARCHAR(100) NOT NULL,target_text VARCHAR(100) NOT NULL,updated_at BIGINT NOT NULL,UNIQUE(owner_id,subject_kind,subject_id,offer_key),FOREIGN KEY(owner_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE product_private_price_requests(owner_id VARCHAR(191) NOT NULL,request_id VARCHAR(191) NOT NULL,payload_digest VARCHAR(191) NOT NULL,revision BIGINT NOT NULL CHECK(revision>=0),created_at BIGINT NOT NULL,PRIMARY KEY(owner_id,request_id),FOREIGN KEY(owner_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE product_price_reference_reviews(id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL,seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),offer_id VARCHAR(191) NOT NULL,version_id VARCHAR(191) NOT NULL,review_revision BIGINT NOT NULL,physical_json LONGTEXT NOT NULL,selling_paisa BIGINT NOT NULL CHECK(selling_paisa>0),compare_paisa BIGINT NOT NULL CHECK(compare_paisa>selling_paisa),decision VARCHAR(20) NOT NULL CHECK(decision IN ('approved','suppressed')),evidence_kind VARCHAR(30) NOT NULL CHECK(evidence_kind IN ('historical_order','external_offer','review_finding')),evidence_reference VARCHAR(1000) NOT NULL,offered_from BIGINT,offered_to BIGINT,reason VARCHAR(1000) NOT NULL,actor_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,UNIQUE(product_id,offer_id,version_id,review_revision),CHECK((evidence_kind='review_finding' AND decision='suppressed' AND offered_from IS NULL AND offered_to IS NULL) OR (evidence_kind<>'review_finding' AND offered_from IS NOT NULL AND offered_to IS NOT NULL AND offered_from>=0 AND offered_to>=offered_from AND offered_to<=created_at)),FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(version_id) REFERENCES product_offer_versions(id),FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TRIGGER price_reference_immutable BEFORE UPDATE ON product_price_reference_reviews FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='price_reference_immutable';
CREATE TRIGGER price_reference_retained BEFORE DELETE ON product_price_reference_reviews FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='price_reference_retained';
CREATE TABLE product_discount_cycles(id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL,offer_id VARCHAR(191) NOT NULL,version_id VARCHAR(191) NOT NULL,reference_id VARCHAR(191) NOT NULL,selling_paisa BIGINT NOT NULL,compare_paisa BIGINT NOT NULL,price_text VARCHAR(200) NOT NULL,compare_text VARCHAR(200) NOT NULL,first_published_at BIGINT NOT NULL,visible_since BIGINT,dismissed_at BIGINT,day23 VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(day23 IN ('pending','sent','skipped')),day29 VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(day29 IN ('pending','sent','skipped')),revision BIGINT NOT NULL DEFAULT 0,UNIQUE(product_id,offer_id,selling_paisa,compare_paisa),INDEX product_discount_pending(product_id,first_published_at),CHECK(selling_paisa>0 AND compare_paisa>selling_paisa AND revision>=0),FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(offer_id) REFERENCES product_offer_identities(id),FOREIGN KEY(version_id) REFERENCES product_offer_versions(id),FOREIGN KEY(reference_id) REFERENCES product_price_reference_reviews(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE product_discount_advisories(id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL,window_day BIGINT NOT NULL CHECK(window_day IN (23,29)),suggested_at BIGINT NOT NULL,created_at BIGINT NOT NULL,UNIQUE(product_id,window_day,suggested_at),FOREIGN KEY(product_id) REFERENCES products(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE product_discount_advisory_items(advisory_id VARCHAR(191) NOT NULL,cycle_id VARCHAR(191) NOT NULL,PRIMARY KEY(advisory_id,cycle_id),FOREIGN KEY(advisory_id) REFERENCES product_discount_advisories(id),FOREIGN KEY(cycle_id) REFERENCES product_discount_cycles(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Source-only MariaDB counterpart of 0092. No database execution.

CREATE TABLE product_intake_workspace_versions(id VARCHAR(191) PRIMARY KEY,draft_id VARCHAR(191) NOT NULL,revision BIGINT NOT NULL,kind VARCHAR(191) NOT NULL DEFAULT 'private' CHECK(kind IN ('private','review_only')),base_public_version_id VARCHAR(191),snapshot_json LONGTEXT NOT NULL CHECK(json_valid(snapshot_json)),created_by VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,private_revision BIGINT GENERATED ALWAYS AS (CASE WHEN kind='private' THEN revision ELSE NULL END) STORED,UNIQUE(draft_id,private_revision),CHECK((kind='private' AND base_public_version_id IS NULL) OR (kind='review_only' AND base_public_version_id IS NOT NULL)),FOREIGN KEY(draft_id) REFERENCES product_intake_drafts(id),FOREIGN KEY(created_by) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_intake_workspace_heads(draft_id VARCHAR(191) PRIMARY KEY,version_id VARCHAR(191) NOT NULL,FOREIGN KEY(draft_id) REFERENCES product_intake_drafts(id),FOREIGN KEY(version_id) REFERENCES product_intake_workspace_versions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_intake_media(id VARCHAR(191) PRIMARY KEY,draft_id VARCHAR(191) NOT NULL,owner_id VARCHAR(191) NOT NULL,request_id VARCHAR(191) NOT NULL,object_key VARCHAR(512) NOT NULL UNIQUE,mime_type VARCHAR(191) NOT NULL,size_bytes BIGINT NOT NULL CHECK(size_bytes>0),original_name VARCHAR(191) NOT NULL,content_digest VARCHAR(191) NOT NULL,state VARCHAR(191) NOT NULL CHECK(state IN ('uploading','ready')),created_at BIGINT NOT NULL,completed_at BIGINT,UNIQUE(owner_id,request_id),FOREIGN KEY(draft_id) REFERENCES product_intake_drafts(id),FOREIGN KEY(owner_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_intake_cases(id VARCHAR(191) PRIMARY KEY,draft_id VARCHAR(191) NOT NULL,cycle_number BIGINT NOT NULL DEFAULT 0 CHECK(cycle_number>=0),version_id VARCHAR(191) NOT NULL,revision BIGINT NOT NULL DEFAULT 0,state VARCHAR(191) NOT NULL CHECK(state IN ('details_needed','submitted','in_review','waiting_seller','ready_for_decision','resolved')),first_requested_at BIGINT NOT NULL,triage_due_at BIGINT NOT NULL,triaged_at BIGINT,first_complete_at BIGINT,review_due_at BIGINT,first_reviewed_at BIGINT,last_event_id VARCHAR(191) NOT NULL,active_proposal_id VARCHAR(191),active_draft_id VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN state<>'resolved' THEN draft_id ELSE NULL END) STORED,UNIQUE(draft_id,cycle_number),UNIQUE(active_draft_id),CHECK(revision>=0 AND triage_due_at>=first_requested_at),FOREIGN KEY(draft_id) REFERENCES product_intake_drafts(id),FOREIGN KEY(version_id) REFERENCES product_intake_workspace_versions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_intake_events(id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL,version_id VARCHAR(191) NOT NULL,event_key VARCHAR(191) NOT NULL UNIQUE,kind VARCHAR(191) NOT NULL,actor_id VARCHAR(191) NOT NULL,detail_json LONGTEXT NOT NULL CHECK(json_valid(detail_json)),created_at BIGINT NOT NULL,FOREIGN KEY(case_id) REFERENCES product_intake_cases(id),FOREIGN KEY(version_id) REFERENCES product_intake_workspace_versions(id),FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_intake_proposals(id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL,base_version_id VARCHAR(191) NOT NULL,patch_json LONGTEXT NOT NULL CHECK(json_valid(patch_json)),source_note TEXT NOT NULL,actor_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,state VARCHAR(191) NOT NULL CHECK(state IN ('pending','accepted','declined','superseded')),decided_by VARCHAR(191),decided_at BIGINT,accepted_version_id VARCHAR(191),FOREIGN KEY(case_id) REFERENCES product_intake_cases(id),FOREIGN KEY(base_version_id) REFERENCES product_intake_workspace_versions(id),FOREIGN KEY(actor_id) REFERENCES users(id),FOREIGN KEY(decided_by) REFERENCES users(id),FOREIGN KEY(accepted_version_id) REFERENCES product_intake_workspace_versions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER product_intake_workspace_immutable BEFORE UPDATE ON product_intake_workspace_versions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_workspace_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_workspace_retained BEFORE DELETE ON product_intake_workspace_versions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_workspace_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_event_immutable BEFORE UPDATE ON product_intake_events FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_event_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_event_retained BEFORE DELETE ON product_intake_events FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_event_retained';
END$$
DELIMITER ;

CREATE INDEX product_intake_media_draft ON product_intake_media(draft_id,created_at,id);

CREATE INDEX product_intake_event_history ON product_intake_events(case_id,created_at,id);

CREATE INDEX product_intake_proposal_history ON product_intake_proposals(case_id,created_at,id);

DELIMITER $$
CREATE TRIGGER product_intake_head_insert BEFORE INSERT ON product_intake_workspace_heads FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_intake_workspace_versions v JOIN product_intake_drafts d ON d.id=v.draft_id WHERE v.id=NEW.version_id AND d.id=NEW.draft_id AND v.revision=d.revision AND v.kind='private') THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_head_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_head_update BEFORE UPDATE ON product_intake_workspace_heads FOR EACH ROW BEGIN
IF NOT (NEW.draft_id <=> OLD.draft_id) OR NOT EXISTS(SELECT 1 FROM product_intake_workspace_versions v JOIN product_intake_drafts d ON d.id=v.draft_id JOIN product_intake_workspace_versions prior_version ON prior_version.id=OLD.version_id WHERE v.id=NEW.version_id AND d.id=NEW.draft_id AND v.revision=d.revision AND v.kind='private' AND v.revision>prior_version.revision) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_head_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_media_source BEFORE INSERT ON product_intake_media FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_intake_drafts WHERE id=NEW.draft_id AND owner_id=NEW.owner_id) OR NEW.mime_type NOT IN ('image/jpeg','image/png','image/webp','video/mp4') OR NEW.size_bytes>CASE WHEN NEW.mime_type='video/mp4' THEN 20971520 ELSE 5242880 END OR (NEW.state='ready')<>(NEW.completed_at IS NOT NULL) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_media_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_media_immutable BEFORE UPDATE ON product_intake_media FOR EACH ROW BEGIN
IF NOT (NEW.id <=> OLD.id) OR NOT (NEW.draft_id <=> OLD.draft_id) OR NOT (NEW.owner_id <=> OLD.owner_id) OR NOT (NEW.request_id <=> OLD.request_id) OR NOT (NEW.object_key <=> OLD.object_key) OR NOT (NEW.mime_type <=> OLD.mime_type) OR NOT (NEW.size_bytes <=> OLD.size_bytes) OR NOT (NEW.original_name <=> OLD.original_name) OR NOT (NEW.content_digest <=> OLD.content_digest) OR NOT (NEW.created_at <=> OLD.created_at) OR OLD.state<>'uploading' OR NEW.state<>'ready' OR NEW.completed_at IS NULL OR NEW.completed_at<OLD.created_at THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_media_immutable';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_case_source BEFORE INSERT ON product_intake_cases FOR EACH ROW BEGIN
IF NEW.cycle_number<>COALESCE((SELECT MAX(cycle_number)+1 FROM product_intake_cases WHERE draft_id=NEW.draft_id),0) OR NOT EXISTS(SELECT 1 FROM product_intake_workspace_versions WHERE id=NEW.version_id AND draft_id=NEW.draft_id) OR NEW.triage_due_at<>NEW.first_requested_at+86400000 OR (NEW.first_complete_at IS NULL)<>(NEW.review_due_at IS NULL) OR NEW.review_due_at<>NEW.first_complete_at+86400000 THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_case_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_case_revision BEFORE UPDATE ON product_intake_cases FOR EACH ROW BEGIN
IF OLD.state='resolved' OR NEW.cycle_number<>OLD.cycle_number OR NOT (NEW.id <=> OLD.id) OR NOT (NEW.draft_id <=> OLD.draft_id) OR NEW.revision<>OLD.revision+1 OR NOT (NEW.first_requested_at <=> OLD.first_requested_at) OR NOT (NEW.triage_due_at <=> OLD.triage_due_at) OR (OLD.triaged_at IS NOT NULL AND NOT (NEW.triaged_at <=> OLD.triaged_at)) OR (OLD.first_complete_at IS NOT NULL AND NOT (NEW.first_complete_at <=> OLD.first_complete_at)) OR (OLD.review_due_at IS NOT NULL AND NOT (NEW.review_due_at <=> OLD.review_due_at)) OR (OLD.first_reviewed_at IS NOT NULL AND NOT (NEW.first_reviewed_at <=> OLD.first_reviewed_at)) OR (NEW.first_complete_at IS NULL)<>(NEW.review_due_at IS NULL) OR NEW.review_due_at<>NEW.first_complete_at+86400000 OR NOT EXISTS(SELECT 1 FROM product_intake_workspace_versions WHERE id=NEW.version_id AND draft_id=NEW.draft_id) OR (NEW.active_proposal_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_intake_proposals WHERE id=NEW.active_proposal_id AND case_id=NEW.id AND base_version_id=NEW.version_id AND state='pending')) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_case_revision';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_case_retained BEFORE DELETE ON product_intake_cases FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_case_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_event_source BEFORE INSERT ON product_intake_events FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_intake_cases c JOIN product_intake_workspace_versions v ON v.draft_id=c.draft_id WHERE c.id=NEW.case_id AND v.id=NEW.version_id) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_event_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_proposal_source BEFORE INSERT ON product_intake_proposals FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_intake_cases c WHERE c.id=NEW.case_id AND c.version_id=NEW.base_version_id) OR NEW.state<>'pending' OR NEW.decided_by IS NOT NULL OR NEW.decided_at IS NOT NULL OR NEW.accepted_version_id IS NOT NULL THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_proposal_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_proposal_immutable BEFORE UPDATE ON product_intake_proposals FOR EACH ROW BEGIN
IF NOT (NEW.id <=> OLD.id) OR NOT (NEW.case_id <=> OLD.case_id) OR NOT (NEW.base_version_id <=> OLD.base_version_id) OR NOT (NEW.patch_json <=> OLD.patch_json) OR NOT (NEW.source_note <=> OLD.source_note) OR NOT (NEW.actor_id <=> OLD.actor_id) OR NOT (NEW.created_at <=> OLD.created_at) OR OLD.state<>'pending' OR NEW.state NOT IN ('accepted','declined','superseded') OR (NEW.state IN ('accepted','declined') AND (NEW.decided_by IS NULL OR NEW.decided_at IS NULL OR NEW.decided_at<OLD.created_at)) OR (NEW.state='accepted' AND NOT EXISTS(SELECT 1 FROM product_intake_workspace_versions v JOIN product_intake_cases c ON c.draft_id=v.draft_id WHERE c.id=NEW.case_id AND v.id=NEW.accepted_version_id)) OR (NEW.state<>'accepted' AND NEW.accepted_version_id IS NOT NULL) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_proposal_immutable';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_intake_proposal_retained BEFORE DELETE ON product_intake_proposals FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_intake_proposal_retained';
END$$
DELIMITER ;
-- Source-only MariaDB counterpart of 0093. No database execution.

CREATE TABLE product_publication_candidates(id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL,case_id VARCHAR(191) NOT NULL,workspace_version_id VARCHAR(191) NOT NULL,offer_version_id VARCHAR(191) NOT NULL UNIQUE,category_version_id VARCHAR(191) NOT NULL,base_version_id VARCHAR(191),created_by VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(case_id) REFERENCES product_intake_cases(id),FOREIGN KEY(workspace_version_id) REFERENCES product_intake_workspace_versions(id),FOREIGN KEY(offer_version_id) REFERENCES product_offer_versions(id),FOREIGN KEY(category_version_id) REFERENCES category_template_versions(id),FOREIGN KEY(base_version_id) REFERENCES product_publication_candidates(id),FOREIGN KEY(created_by) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_publication_links(draft_id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL UNIQUE,base_version_id VARCHAR(191),revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),FOREIGN KEY(draft_id) REFERENCES product_intake_drafts(id),FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(base_version_id) REFERENCES product_publication_candidates(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_publication_decisions(id VARCHAR(191) PRIMARY KEY,version_id VARCHAR(191) NOT NULL,action VARCHAR(191) NOT NULL CHECK(action IN ('approve_only','approve_and_publish','publish_approved','request_changes','reject')),review_json LONGTEXT NOT NULL CHECK(json_valid(review_json)),public_json LONGTEXT CHECK(public_json IS NULL OR json_valid(public_json)),ordering_facts_ready BIGINT NOT NULL DEFAULT 0 CHECK(ordering_facts_ready IN (0,1)),actor_id VARCHAR(191) NOT NULL,reason TEXT NOT NULL,created_at BIGINT NOT NULL,FOREIGN KEY(version_id) REFERENCES product_publication_candidates(id),FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_publication_heads(product_id VARCHAR(191) PRIMARY KEY,revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),pending_version_id VARCHAR(191),current_version_id VARCHAR(191),approved_decision_id VARCHAR(191),current_publication_id VARCHAR(191),last_event_id VARCHAR(191) NOT NULL,updated_at BIGINT NOT NULL,FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(pending_version_id) REFERENCES product_publication_candidates(id),FOREIGN KEY(current_version_id) REFERENCES product_publication_candidates(id),FOREIGN KEY(approved_decision_id) REFERENCES product_publication_decisions(id),FOREIGN KEY(current_publication_id) REFERENCES product_publication_decisions(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_publication_media(version_id VARCHAR(191) NOT NULL,media_id VARCHAR(191) NOT NULL,sort_order BIGINT NOT NULL CHECK(sort_order>=0),PRIMARY KEY(version_id,media_id),UNIQUE(version_id,sort_order),FOREIGN KEY(version_id) REFERENCES product_publication_candidates(id),FOREIGN KEY(media_id) REFERENCES product_media(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX product_publication_candidates_case ON product_publication_candidates(case_id,created_at);

DELIMITER $$
CREATE TRIGGER product_publication_link_source BEFORE INSERT ON product_publication_links FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_intake_drafts d JOIN products p ON p.seller_id=d.seller_id WHERE d.id=NEW.draft_id AND p.id=NEW.product_id) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_link_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_link_revision BEFORE UPDATE ON product_publication_links FOR EACH ROW BEGIN
IF NOT(NEW.draft_id <=> OLD.draft_id) OR NOT(NEW.product_id <=> OLD.product_id) OR NEW.revision<>OLD.revision+1 OR NOT EXISTS(SELECT 1 FROM product_publication_heads WHERE product_id=NEW.product_id AND current_version_id <=> NEW.base_version_id) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_link_revision';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_candidate_source BEFORE INSERT ON product_publication_candidates FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_intake_cases c JOIN product_publication_links l ON l.draft_id=c.draft_id JOIN product_intake_workspace_versions v ON v.id=c.version_id JOIN product_offer_versions o ON o.product_id=l.product_id JOIN category_template_versions category ON category.category_id=JSON_VALUE(v.snapshot_json,'$.categoryId') WHERE c.id=NEW.case_id AND c.version_id=NEW.workspace_version_id AND l.product_id=NEW.product_id AND ((v.kind='private' AND l.base_version_id <=> NEW.base_version_id) OR (v.kind='review_only' AND v.base_public_version_id=NEW.base_version_id AND EXISTS(SELECT 1 FROM product_publication_heads h WHERE h.product_id=l.product_id AND h.current_version_id=NEW.base_version_id))) AND o.id=NEW.offer_version_id AND JSON_COMPACT(o.matrix_json)=JSON_COMPACT(JSON_EXTRACT(v.snapshot_json,'$.offers')) AND category.id=NEW.category_version_id) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_candidate_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_candidate_immutable BEFORE UPDATE ON product_publication_candidates FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_candidate_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_candidate_retained BEFORE DELETE ON product_publication_candidates FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_candidate_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_decision_immutable BEFORE UPDATE ON product_publication_decisions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_decision_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_decision_retained BEFORE DELETE ON product_publication_decisions FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_decision_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_head_revision BEFORE UPDATE ON product_publication_heads FOR EACH ROW BEGIN
IF NOT(NEW.product_id <=> OLD.product_id) OR NEW.revision<>OLD.revision+1 THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_head_revision';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_head_source_insert BEFORE INSERT ON product_publication_heads FOR EACH ROW BEGIN
IF (NEW.pending_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_publication_candidates WHERE id=NEW.pending_version_id AND product_id=NEW.product_id)) OR NEW.current_version_id IS NOT NULL OR NEW.current_publication_id IS NOT NULL OR NEW.approved_decision_id IS NOT NULL THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_head_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_head_source_update BEFORE UPDATE ON product_publication_heads FOR EACH ROW BEGIN
IF (NEW.pending_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_publication_candidates WHERE id=NEW.pending_version_id AND product_id=NEW.product_id)) OR (NEW.current_version_id IS NULL)<>(NEW.current_publication_id IS NULL) OR (NEW.current_publication_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_publication_decisions d JOIN product_publication_candidates c ON c.id=d.version_id WHERE d.id=NEW.current_publication_id AND c.id=NEW.current_version_id AND c.product_id=NEW.product_id AND d.action IN ('approve_and_publish','publish_approved') AND d.public_json IS NOT NULL)) OR (NEW.approved_decision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_publication_decisions d JOIN product_publication_candidates c ON c.id=d.version_id WHERE d.id=NEW.approved_decision_id AND c.product_id=NEW.product_id AND d.action IN ('approve_only','approve_and_publish') AND d.public_json IS NOT NULL)) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_head_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_media_source BEFORE INSERT ON product_publication_media FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_publication_candidates c JOIN product_intake_workspace_versions v ON v.id=c.workspace_version_id JOIN product_media m ON m.product_id=c.product_id WHERE c.id=NEW.version_id AND m.id=NEW.media_id AND JSON_CONTAINS(JSON_EXTRACT(v.snapshot_json,'$.mediaIds'),JSON_QUOTE(NEW.media_id))) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_media_source';
END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_media_immutable BEFORE UPDATE ON product_publication_media FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_media_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_publication_media_retained BEFORE DELETE ON product_publication_media FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='publication_media_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_review_only_source BEFORE INSERT ON product_intake_workspace_versions FOR EACH ROW BEGIN
IF NEW.kind='review_only' AND NOT EXISTS(SELECT 1 FROM product_intake_drafts d JOIN product_publication_links l ON l.draft_id=d.id JOIN product_publication_heads h ON h.product_id=l.product_id WHERE d.id=NEW.draft_id AND d.revision=NEW.revision AND d.owner_id=NEW.created_by AND h.current_version_id=NEW.base_public_version_id) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_review_only_source';
END IF;
END$$
DELIMITER ;
-- Source-only counterpart of 0094.

CREATE TABLE product_availability_events(id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL,revision BIGINT NOT NULL CHECK(revision>=0),kind VARCHAR(191) NOT NULL CHECK(kind IN ('owner_pause','owner_resume','owner_stop','owner_restore','staff_withdraw','staff_restore')),owner_paused BIGINT NOT NULL CHECK(owner_paused IN (0,1)),owner_withdrawn BIGINT NOT NULL CHECK(owner_withdrawn IN (0,1)),staff_withdrawn BIGINT NOT NULL CHECK(staff_withdrawn IN (0,1)),public_version_id VARCHAR(191),previous_event_id VARCHAR(191),actor_id VARCHAR(191) NOT NULL,reason TEXT NOT NULL CHECK(length(trim(reason))>=10),request_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,UNIQUE(product_id,revision),UNIQUE(actor_id,request_id),FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(public_version_id) REFERENCES product_publication_candidates(id),FOREIGN KEY(previous_event_id) REFERENCES product_availability_events(id),FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_availability_states(product_id VARCHAR(191) PRIMARY KEY,revision BIGINT NOT NULL CHECK(revision>=0),owner_paused BIGINT NOT NULL CHECK(owner_paused IN (0,1)),owner_withdrawn BIGINT NOT NULL CHECK(owner_withdrawn IN (0,1)),staff_withdrawn BIGINT NOT NULL CHECK(staff_withdrawn IN (0,1)),last_event_id VARCHAR(191) NOT NULL,updated_at BIGINT NOT NULL,FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(last_event_id) REFERENCES product_availability_events(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER availability_event_source BEFORE INSERT ON product_availability_events FOR EACH ROW BEGIN
IF NEW.revision<>COALESCE((SELECT revision+1 FROM product_availability_states WHERE product_id=NEW.product_id),0)
 OR NOT(NEW.previous_event_id <=> (SELECT last_event_id FROM product_availability_states WHERE product_id=NEW.product_id))
 OR NEW.owner_paused<>CASE WHEN NEW.kind IN ('owner_pause','owner_stop') THEN 1 WHEN NEW.kind='owner_resume' THEN 0 ELSE COALESCE((SELECT owner_paused FROM product_availability_states WHERE product_id=NEW.product_id),0) END
 OR NEW.owner_withdrawn<>CASE WHEN NEW.kind='owner_stop' THEN 1 WHEN NEW.kind='owner_restore' THEN 0 ELSE COALESCE((SELECT owner_withdrawn FROM product_availability_states WHERE product_id=NEW.product_id),0) END
 OR NEW.staff_withdrawn<>CASE WHEN NEW.kind='staff_withdraw' THEN 1 WHEN NEW.kind='staff_restore' THEN 0 ELSE COALESCE((SELECT staff_withdrawn FROM product_availability_states WHERE product_id=NEW.product_id),0) END
 OR NOT EXISTS(SELECT 1 FROM users u JOIN products p ON p.id=NEW.product_id JOIN seller_profiles s ON s.id=p.seller_id WHERE u.id=NEW.actor_id AND u.status='active' AND ((NEW.kind LIKE 'owner_%' AND s.user_id=u.id AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('seller','customer'))) OR (NEW.kind LIKE 'staff_%' AND s.user_id<>u.id AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='super_admin'))))
 OR (NEW.kind IN ('owner_resume','owner_restore','staff_restore') AND NOT EXISTS(SELECT 1 FROM product_publication_heads h JOIN products p ON p.id=h.product_id WHERE h.product_id=NEW.product_id AND h.current_version_id=NEW.public_version_id AND p.status='published'))
 OR (NEW.kind='owner_resume' AND (NEW.staff_withdrawn=1 OR NEW.owner_withdrawn=1)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='availability_event_source'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER availability_state_source BEFORE INSERT ON product_availability_states FOR EACH ROW BEGIN
IF NEW.revision<>0 OR NOT EXISTS(SELECT 1 FROM product_availability_events e WHERE e.id=NEW.last_event_id AND e.product_id=NEW.product_id AND e.revision=NEW.revision AND e.owner_paused=NEW.owner_paused AND e.owner_withdrawn=NEW.owner_withdrawn AND e.staff_withdrawn=NEW.staff_withdrawn AND e.created_at=NEW.updated_at) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='availability_state_source'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER availability_state_revision BEFORE UPDATE ON product_availability_states FOR EACH ROW BEGIN
IF NEW.product_id<>OLD.product_id OR NEW.revision<>OLD.revision+1 OR NOT EXISTS(SELECT 1 FROM product_availability_events e WHERE e.id=NEW.last_event_id AND e.product_id=NEW.product_id AND e.revision=NEW.revision AND e.owner_paused=NEW.owner_paused AND e.owner_withdrawn=NEW.owner_withdrawn AND e.staff_withdrawn=NEW.staff_withdrawn AND e.created_at=NEW.updated_at) OR NOT EXISTS(SELECT 1 FROM product_availability_events WHERE id=NEW.last_event_id AND previous_event_id=OLD.last_event_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='availability_state_revision'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER availability_event_immutable BEFORE UPDATE ON product_availability_events FOR EACH ROW BEGIN
IF 1=1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='availability_event_immutable'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER availability_event_retained BEFORE DELETE ON product_availability_events FOR EACH ROW BEGIN
IF 1=1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='availability_event_retained'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER availability_state_retained BEFORE DELETE ON product_availability_states FOR EACH ROW BEGIN
IF 1=1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='availability_state_retained'; END IF;
END$$
DELIMITER ;
-- Source-only counterpart of 0095. No backfill or claimed historical approval.
CREATE TABLE product_legacy_observations(product_id VARCHAR(191) PRIMARY KEY,draft_id VARCHAR(191) NOT NULL UNIQUE,source_fingerprint VARCHAR(64) NOT NULL CHECK(length(source_fingerprint)=64),observed_json LONGTEXT NOT NULL CHECK(JSON_VALID(observed_json)),created_by VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(draft_id) REFERENCES product_intake_drafts(id),FOREIGN KEY(created_by) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER product_legacy_observation_source BEFORE INSERT ON product_legacy_observations FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_publication_links l JOIN product_intake_drafts d ON d.id=l.draft_id JOIN products p ON p.id=l.product_id JOIN seller_profiles s ON s.id=p.seller_id JOIN users u ON u.id=s.user_id WHERE l.product_id=NEW.product_id AND l.draft_id=NEW.draft_id AND d.owner_id=NEW.created_by AND s.user_id=NEW.created_by AND u.status='active' AND JSON_VALUE(NEW.observed_json,'$.product.id')=p.id AND JSON_VALUE(NEW.observed_json,'$.product.seller_id')=s.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_legacy_observation_source'; END IF;
END$$
CREATE TRIGGER product_legacy_observation_immutable BEFORE UPDATE ON product_legacy_observations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_legacy_observation_immutable'; END$$
CREATE TRIGGER product_legacy_observation_retained BEFORE DELETE ON product_legacy_observations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_legacy_observation_retained'; END$$
DELIMITER ;

CREATE TABLE product_legacy_media_copies(draft_id VARCHAR(191) NOT NULL,source_media_id VARCHAR(191) NOT NULL,source_object_key TEXT NOT NULL,intake_media_id VARCHAR(191) NOT NULL UNIQUE,created_by VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,PRIMARY KEY(draft_id,source_media_id),FOREIGN KEY(draft_id) REFERENCES product_intake_drafts(id),FOREIGN KEY(source_media_id) REFERENCES product_media(id),FOREIGN KEY(intake_media_id) REFERENCES product_intake_media(id),FOREIGN KEY(created_by) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER product_legacy_media_copy_source BEFORE INSERT ON product_legacy_media_copies FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_legacy_observations o JOIN product_intake_drafts d ON d.id=o.draft_id JOIN product_media m ON m.product_id=o.product_id JOIN product_intake_media n ON n.draft_id=d.id JOIN users u ON u.id=d.owner_id WHERE d.id=NEW.draft_id AND m.id=NEW.source_media_id AND BINARY m.object_key=BINARY NEW.source_object_key AND n.id=NEW.intake_media_id AND n.owner_id=NEW.created_by AND d.owner_id=NEW.created_by AND n.state='ready' AND u.status='active' AND JSON_CONTAINS(o.observed_json,JSON_OBJECT('id',NEW.source_media_id,'object_key',NEW.source_object_key),'$.media')=1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_legacy_media_copy_source'; END IF;
END$$
CREATE TRIGGER product_legacy_media_copy_immutable BEFORE UPDATE ON product_legacy_media_copies FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_legacy_media_copy_immutable'; END$$
CREATE TRIGGER product_legacy_media_copy_retained BEFORE DELETE ON product_legacy_media_copies FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_legacy_media_copy_retained'; END$$
DELIMITER ;
-- Source-only counterpart of 0096. Coordination never changes availability or approvals.
CREATE TABLE product_priority_events(id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL,product_id VARCHAR(191) NOT NULL,revision INT NOT NULL CHECK(revision>=0),kind VARCHAR(32) NOT NULL CHECK(kind IN ('reported','triaged','resolved')),actor_id VARCHAR(191) NOT NULL,detail_json LONGTEXT NOT NULL CHECK(JSON_VALID(detail_json)),created_at BIGINT NOT NULL,UNIQUE(case_id,revision),FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE product_priority_cases(id VARCHAR(191) PRIMARY KEY,product_id VARCHAR(191) NOT NULL,kind VARCHAR(32) NOT NULL CHECK(kind IN ('price_error','safety','misleading')),public_version_id VARCHAR(191),reported_by VARCHAR(191) NOT NULL,state VARCHAR(32) NOT NULL CHECK(state IN ('open','waiting_seller','resolved')),active_slot INT,revision INT NOT NULL CHECK(revision>=0),backup_id VARCHAR(191),backup_unavailable_reason TEXT NOT NULL DEFAULT '',next_update_at BIGINT,triaged_at BIGINT,last_event_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,UNIQUE(product_id,kind,active_slot),CHECK((state='resolved' AND active_slot IS NULL) OR (state<>'resolved' AND active_slot=1)),FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(public_version_id) REFERENCES product_publication_candidates(id),FOREIGN KEY(reported_by) REFERENCES users(id),FOREIGN KEY(backup_id) REFERENCES users(id),FOREIGN KEY(last_event_id) REFERENCES product_priority_events(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER product_priority_case_source BEFORE INSERT ON product_priority_cases FOR EACH ROW BEGIN
IF NEW.revision<>0 OR NEW.state<>'open' OR NEW.backup_id IS NOT NULL OR NEW.next_update_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM product_priority_events e JOIN users u ON u.id=e.actor_id WHERE e.id=NEW.last_event_id AND e.case_id=NEW.id AND e.product_id=NEW.product_id AND e.revision=0 AND e.kind='reported' AND e.actor_id=NEW.reported_by AND u.status='active') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_case_source'; END IF;
END$$
CREATE TRIGGER product_priority_task_created AFTER INSERT ON product_priority_cases FOR EACH ROW BEGIN INSERT INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline) VALUES(CONCAT('priority-',NEW.id),'product_priority',NEW.id,NEW.id,NEW.created_at,NEW.created_at,'no-agreed-deadline-v1',NEW.updated_at,0); END$$
CREATE TRIGGER product_priority_case_revision BEFORE UPDATE ON product_priority_cases FOR EACH ROW BEGIN
IF OLD.state='resolved' OR NEW.id<>OLD.id OR NEW.product_id<>OLD.product_id OR NEW.kind<>OLD.kind OR NOT(NEW.public_version_id <=> OLD.public_version_id) OR NEW.reported_by<>OLD.reported_by OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR NOT EXISTS(SELECT 1 FROM product_priority_events e JOIN review_tasks t ON t.source_type='product_priority' AND t.source_id=NEW.id AND t.source_revision=NEW.id WHERE e.id=NEW.last_event_id AND e.case_id=NEW.id AND e.product_id=NEW.product_id AND e.revision=NEW.revision AND JSON_VALUE(e.detail_json,'$.state')=NEW.state AND (JSON_VALUE(e.detail_json,'$.backupId') <=> NEW.backup_id) AND JSON_VALUE(e.detail_json,'$.backupUnavailableReason')=NEW.backup_unavailable_reason AND (JSON_VALUE(e.detail_json,'$.nextUpdateAt') <=> NEW.next_update_at) AND (JSON_VALUE(e.detail_json,'$.ownerId') <=> t.owner_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_case_revision'; END IF;
END$$
CREATE TRIGGER product_priority_event_immutable BEFORE UPDATE ON product_priority_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_event_immutable'; END$$
CREATE TRIGGER product_priority_event_retained BEFORE DELETE ON product_priority_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_event_retained'; END$$
CREATE TRIGGER product_priority_case_retained BEFORE DELETE ON product_priority_cases FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_case_retained'; END$$
DELIMITER ;

CREATE TABLE product_priority_report_media(event_id VARCHAR(191) NOT NULL,media_id VARCHAR(191) NOT NULL,PRIMARY KEY(event_id,media_id),FOREIGN KEY(event_id) REFERENCES product_priority_events(id),FOREIGN KEY(media_id) REFERENCES product_media(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER product_priority_media_source BEFORE INSERT ON product_priority_report_media FOR EACH ROW BEGIN
IF NOT EXISTS(SELECT 1 FROM product_priority_events e JOIN product_media m ON m.product_id=e.product_id WHERE e.id=NEW.event_id AND e.kind='reported' AND m.id=NEW.media_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_media_source'; END IF;
END$$
CREATE TRIGGER product_priority_media_immutable BEFORE UPDATE ON product_priority_report_media FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_media_immutable'; END$$
CREATE TRIGGER product_priority_media_retained BEFORE DELETE ON product_priority_report_media FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_media_retained'; END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER product_priority_media_file_retained BEFORE UPDATE ON product_media FOR EACH ROW BEGIN
IF EXISTS(SELECT 1 FROM product_priority_report_media WHERE media_id=OLD.id) AND (BINARY NEW.id<>BINARY OLD.id OR BINARY NEW.product_id<>BINARY OLD.product_id OR BINARY NEW.object_key<>BINARY OLD.object_key OR BINARY NEW.mime_type<>BINARY OLD.mime_type OR NEW.size_bytes<>OLD.size_bytes) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_media_file_retained'; END IF;
END$$
DELIMITER ;
-- Source-only counterpart of 0097. No existing cart contents are rewritten.
CREATE TABLE cart_offer_lines(id VARCHAR(191) PRIMARY KEY,cart_id VARCHAR(191) NOT NULL,product_id VARCHAR(191) NOT NULL,offer_id VARCHAR(191) NOT NULL,version_id VARCHAR(191) NOT NULL,public_version_id VARCHAR(191),quantity INT NOT NULL CHECK(quantity BETWEEN 1 AND 10),revision INT NOT NULL CHECK(revision>=0),snapshot_json LONGTEXT NOT NULL CHECK(JSON_VALID(snapshot_json)),created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,UNIQUE(cart_id,offer_id),FOREIGN KEY(cart_id) REFERENCES carts(id),FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(offer_id) REFERENCES product_offer_identities(id),FOREIGN KEY(version_id) REFERENCES product_offer_versions(id),FOREIGN KEY(public_version_id) REFERENCES product_publication_candidates(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER cart_offer_line_identity BEFORE INSERT ON cart_offer_lines FOR EACH ROW BEGIN IF NOT EXISTS(SELECT 1 FROM product_offer_identities i JOIN product_offer_versions v ON v.product_id=i.product_id WHERE i.id=NEW.offer_id AND i.product_id=NEW.product_id AND v.id=NEW.version_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cart_offer_line_identity'; END IF; END$$
CREATE TRIGGER cart_offer_line_revision BEFORE UPDATE ON cart_offer_lines FOR EACH ROW BEGIN IF NEW.id<>OLD.id OR NEW.cart_id<>OLD.cart_id OR NEW.product_id<>OLD.product_id OR NEW.offer_id<>OLD.offer_id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR NOT EXISTS(SELECT 1 FROM product_offer_versions WHERE id=NEW.version_id AND product_id=NEW.product_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cart_offer_line_revision'; END IF; END$$
DELIMITER ;
CREATE TABLE cart_offer_commands(cart_id VARCHAR(191) NOT NULL,request_id VARCHAR(191) NOT NULL,payload_json LONGTEXT NOT NULL CHECK(JSON_VALID(payload_json)),created_at BIGINT NOT NULL,PRIMARY KEY(cart_id,request_id),FOREIGN KEY(cart_id) REFERENCES carts(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER cart_offer_command_immutable BEFORE UPDATE ON cart_offer_commands FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cart_offer_command_immutable'; END$$
CREATE TRIGGER cart_offer_command_retained BEFORE DELETE ON cart_offer_commands FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cart_offer_command_retained'; END$$
DELIMITER ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_total_paisa BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_subtotal_paisa BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_delivery_paisa BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_wallet_paisa BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_discount_paisa BIGINT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS made_to_order_snapshot BIGINT;
CREATE TABLE IF NOT EXISTS order_cancellation_events (id VARCHAR(191) PRIMARY KEY,order_id VARCHAR(191) NOT NULL REFERENCES orders(id),actor_id VARCHAR(191),version BIGINT NOT NULL,seller_ids_json LONGTEXT NOT NULL,original_allocations_json LONGTEXT NOT NULL,previous_json LONGTEXT NOT NULL,next_json LONGTEXT NOT NULL,note LONGTEXT NOT NULL,wallet_restored_paisa BIGINT NOT NULL CHECK(wallet_restored_paisa>=0),discount_removed_paisa BIGINT NOT NULL CHECK(discount_removed_paisa>=0),item_removed_paisa BIGINT NOT NULL CHECK(item_removed_paisa>=0),created_at BIGINT NOT NULL,UNIQUE(order_id,version)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS order_cancellation_reviews (id VARCHAR(191) PRIMARY KEY,order_id VARCHAR(191) NOT NULL REFERENCES orders(id),seller_ids_json LONGTEXT NOT NULL,note LONGTEXT NOT NULL,status VARCHAR(191) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),requested_by VARCHAR(191),reviewed_by VARCHAR(191),review_note LONGTEXT,created_at BIGINT NOT NULL,reviewed_at BIGINT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX IF NOT EXISTS idx_cancellation_review_queue ON order_cancellation_reviews(status,created_at);
DROP TRIGGER IF EXISTS wallet_cancel_restore;
DELIMITER $$
CREATE TRIGGER wallet_cancel_restore AFTER UPDATE ON orders FOR EACH ROW BEGIN
IF NEW.status='cancelled' AND OLD.status<>'cancelled' THEN
INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
SELECT CONCAT('cancel:',NEW.id),NEW.customer_id,NEW.id,NEW.wallet_credit_paisa-COALESCE(SUM(amount_paisa),0),-(NEW.wallet_credit_paisa-COALESCE(SUM(amount_paisa),0)),'cancellation',NEW.updated_at FROM wallet_entries WHERE order_id=NEW.id AND kind IN ('cancellation','refund') HAVING NEW.wallet_credit_paisa>COALESCE(SUM(amount_paisa),0);
END IF; END$$
DELIMITER ;
DROP TRIGGER IF EXISTS cancellation_event_no_update;
DELIMITER $$
CREATE TRIGGER cancellation_event_no_update BEFORE UPDATE ON order_cancellation_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancellation accounting is immutable'; END$$
DELIMITER ;
DROP TRIGGER IF EXISTS cancellation_event_no_delete;
DELIMITER $$
CREATE TRIGGER cancellation_event_no_delete BEFORE DELETE ON order_cancellation_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancellation accounting is immutable'; END$$
DELIMITER ;

DROP TRIGGER IF EXISTS cancellation_review_immutable;
DELIMITER $$
CREATE TRIGGER cancellation_review_immutable BEFORE UPDATE ON order_cancellation_reviews FOR EACH ROW BEGIN IF NOT (NEW.id <=> OLD.id AND NEW.order_id <=> OLD.order_id AND NEW.seller_ids_json <=> OLD.seller_ids_json AND NEW.note <=> OLD.note AND NEW.requested_by <=> OLD.requested_by AND NEW.created_at <=> OLD.created_at) OR (OLD.status<>'pending' AND NOT (NEW.status <=> OLD.status AND NEW.reviewed_by <=> OLD.reviewed_by AND NEW.review_note <=> OLD.review_note AND NEW.reviewed_at <=> OLD.reviewed_at)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancellation review history is immutable'; END IF; END$$
DELIMITER ;
DROP TRIGGER IF EXISTS cancellation_review_no_delete;
DELIMITER $$
CREATE TRIGGER cancellation_review_no_delete BEFORE DELETE ON order_cancellation_reviews FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancellation review history is immutable'; END$$
DELIMITER ;

ALTER TABLE orders ADD CONSTRAINT IF NOT EXISTS chk_cancellation_totals CHECK((current_total_paisa IS NULL AND current_subtotal_paisa IS NULL AND current_delivery_paisa IS NULL AND current_wallet_paisa IS NULL AND current_discount_paisa IS NULL) OR (current_total_paisa IS NOT NULL AND current_total_paisa>=0 AND current_total_paisa<=9007199254740991 AND current_subtotal_paisa IS NOT NULL AND current_subtotal_paisa>=0 AND current_subtotal_paisa<=9007199254740991 AND current_delivery_paisa IS NOT NULL AND current_delivery_paisa>=0 AND current_delivery_paisa<=9007199254740991 AND current_wallet_paisa IS NOT NULL AND current_wallet_paisa>=0 AND current_wallet_paisa<=9007199254740991 AND current_discount_paisa IS NOT NULL AND current_discount_paisa>=0 AND current_discount_paisa<=9007199254740991 AND current_total_paisa=current_subtotal_paisa+current_delivery_paisa-current_wallet_paisa-current_discount_paisa));
-- Source only: 0098 parity. Never apply to the canonical database to bypass startup.

ALTER TABLE offer_stock_events MODIFY actor_id VARCHAR(191) NULL;

CREATE TABLE manual_payment_windows(
 order_id VARCHAR(191) PRIMARY KEY ,
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 issued_at BIGINT NOT NULL,
 deadline_at BIGINT NOT NULL,
 buffer_end_at BIGINT NOT NULL,
 calendar_version VARCHAR(191) NOT NULL,
 last_event_id VARCHAR(191) NOT NULL,
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 paid_at BIGINT,
 closed_at BIGINT,
 released_at BIGINT,
 closure_reason LONGTEXT,
 CHECK(deadline_at=issued_at+86400000),
 CHECK(buffer_end_at>deadline_at),
 CHECK(paid_at IS NULL OR closed_at IS NULL),
 CHECK(released_at IS NULL OR paid_at IS NOT NULL),
 FOREIGN KEY(order_id) REFERENCES orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manual_payment_claims(
 id VARCHAR(191) PRIMARY KEY,
 order_id VARCHAR(191) NOT NULL UNIQUE ,
 customer_id VARCHAR(191) NOT NULL ,
 claimed_amount_paisa BIGINT NOT NULL CHECK(claimed_amount_paisa>0 AND claimed_amount_paisa<=9007199254740991),
 payment_date VARCHAR(191) NOT NULL,
 bank_reference VARCHAR(191),
 note LONGTEXT NOT NULL,
 evidence_ids_json LONGTEXT NOT NULL CHECK(json_valid(evidence_ids_json)),
 first_submitted_at BIGINT NOT NULL,
 current_state VARCHAR(191) NOT NULL CHECK(current_state IN('submitted','clarified','needs_information','rejected','withdrawn','matched')),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at BIGINT NOT NULL,
 FOREIGN KEY(order_id) REFERENCES manual_payment_windows(order_id),
 FOREIGN KEY(customer_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manual_payment_claim_events(
 id VARCHAR(191) PRIMARY KEY,
 claim_id VARCHAR(191) NOT NULL ,
 order_id VARCHAR(191) NOT NULL ,
 revision BIGINT NOT NULL,
 state VARCHAR(191) NOT NULL CHECK(state IN('submitted','clarified','needs_information','rejected','withdrawn','matched')),
 snapshot_json LONGTEXT NOT NULL CHECK(json_valid(snapshot_json)),
 actor_id VARCHAR(191) NOT NULL ,
 occurred_at BIGINT NOT NULL,
 request_id VARCHAR(191) NOT NULL,
 UNIQUE(claim_id,revision),
 FOREIGN KEY(claim_id) REFERENCES manual_payment_claims(id),
 FOREIGN KEY(order_id) REFERENCES manual_payment_windows(order_id),
 FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manual_payment_claim_files(
 id VARCHAR(191) PRIMARY KEY,
 order_id VARCHAR(191) NOT NULL ,
 uploaded_by VARCHAR(191) NOT NULL ,
 object_key VARCHAR(255) NOT NULL UNIQUE,
 original_name VARCHAR(255) NOT NULL,
 mime_type VARCHAR(191) NOT NULL,
 size_bytes BIGINT NOT NULL CHECK(size_bytes>0),
 created_at BIGINT NOT NULL,
 FOREIGN KEY(order_id) REFERENCES manual_payment_windows(order_id),
 FOREIGN KEY(uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_money_receipts(
 id VARCHAR(191) PRIMARY KEY,
 kind VARCHAR(191) NOT NULL CHECK(kind IN('bank_credit','cash_handover')),
 account_version_id VARCHAR(191) ,
 source_identity_hash CHAR(64) NOT NULL UNIQUE CHECK(length(source_identity_hash)=64),
 transaction_identity VARCHAR(200) NOT NULL,
 bank_at BIGINT NOT NULL,
 confirmed_at BIGINT NOT NULL,
 amount_minor BIGINT NOT NULL CHECK(amount_minor>0 AND amount_minor<=9007199254740991),
 currency CHAR(3) NOT NULL CHECK(length(currency)=3),
 payer_reference VARCHAR(500) NOT NULL,
 payer_user_id VARCHAR(191) ,
 collector_user_id VARCHAR(191) ,
 evidence_reference VARCHAR(500) NOT NULL,
 verification_reason LONGTEXT NOT NULL,
 status VARCHAR(191) NOT NULL CHECK(status IN('verified','unmatched','reversed')),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 created_by VARCHAR(191) NOT NULL ,
 CHECK(kind<>'bank_credit' OR account_version_id IS NOT NULL),
 CHECK(kind<>'cash_handover' OR account_version_id IS NULL),
 FOREIGN KEY(account_version_id) REFERENCES company_payment_account_versions(id),
 FOREIGN KEY(payer_user_id) REFERENCES users(id),
 FOREIGN KEY(collector_user_id) REFERENCES users(id),
 FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_receipt_conflicts(
 receipt_id VARCHAR(191) NOT NULL ,
 user_id VARCHAR(191) NOT NULL ,
 recorded_by VARCHAR(191) NOT NULL ,
 recorded_at BIGINT NOT NULL,
 PRIMARY KEY(receipt_id,user_id),
 FOREIGN KEY(receipt_id) REFERENCES company_money_receipts(id),
 FOREIGN KEY(user_id) REFERENCES users(id),
 FOREIGN KEY(recorded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manual_receipt_uses(
 id VARCHAR(191) PRIMARY KEY,
 receipt_id VARCHAR(191) NOT NULL ,
 kind VARCHAR(191) NOT NULL CHECK(kind IN('order','cod','return')),
 target_id VARCHAR(191) NOT NULL,
 amount_minor BIGINT NOT NULL CHECK(amount_minor>0 AND amount_minor<=9007199254740991),
 state VARCHAR(191) NOT NULL CHECK(state IN('allocated','reserved','returned','released')),
 created_by VARCHAR(191) NOT NULL ,
 created_at BIGINT NOT NULL,
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 FOREIGN KEY(receipt_id) REFERENCES company_money_receipts(id),
 FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manual_payment_allocations(
 id VARCHAR(191) PRIMARY KEY,
 receipt_use_id VARCHAR(191) NOT NULL UNIQUE ,
 receipt_id VARCHAR(191) NOT NULL ,
 order_id VARCHAR(191) NOT NULL ,
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0),
 allocated_at BIGINT NOT NULL,
 actor_id VARCHAR(191) NOT NULL ,
 matching_basis LONGTEXT NOT NULL,
 exception_json LONGTEXT CHECK(exception_json IS NULL OR json_valid(exception_json)),
 FOREIGN KEY(receipt_use_id) REFERENCES manual_receipt_uses(id),
 FOREIGN KEY(receipt_id) REFERENCES company_money_receipts(id),
 FOREIGN KEY(order_id) REFERENCES manual_payment_windows(order_id),
 FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_receipt_reversals(
 id VARCHAR(191) PRIMARY KEY,
 receipt_id VARCHAR(191) NOT NULL ,
 source_identity_hash VARCHAR(191) NOT NULL UNIQUE CHECK(CHAR_LENGTH(source_identity_hash)=64),
 transaction_identity VARCHAR(200) NOT NULL,
 amount_minor BIGINT NOT NULL CHECK(amount_minor>0 AND amount_minor<=9007199254740991),
 actor_id VARCHAR(191) NOT NULL ,
 evidence_reference VARCHAR(500) NOT NULL,
 reason LONGTEXT NOT NULL,
 bank_at BIGINT NOT NULL,
 recorded_at BIGINT NOT NULL,
 FOREIGN KEY(receipt_id) REFERENCES company_money_receipts(id),
 FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manual_payment_exceptions(
 id VARCHAR(191) PRIMARY KEY,
 source_key VARCHAR(191) NOT NULL UNIQUE,
 order_id VARCHAR(191) ,
 receipt_id VARCHAR(191) ,
 kind VARCHAR(191) NOT NULL,
 last_event_id VARCHAR(191) NOT NULL,
 state VARCHAR(191) NOT NULL CHECK(state IN('open','waiting','resolved')),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 reason LONGTEXT NOT NULL,
 owner_id VARCHAR(191) ,
 backup_id VARCHAR(191) ,
 created_at BIGINT NOT NULL,
 triaged_at BIGINT,
 next_update_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL,
 FOREIGN KEY(order_id) REFERENCES orders(id),
 FOREIGN KEY(receipt_id) REFERENCES company_money_receipts(id),
 FOREIGN KEY(owner_id) REFERENCES users(id),
 FOREIGN KEY(backup_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_receipt_controls(
 receipt_id VARCHAR(191) PRIMARY KEY ,
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 FOREIGN KEY(receipt_id) REFERENCES company_money_receipts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX manual_claim_event_cutoff ON manual_payment_claim_events(order_id,occurred_at,revision);

CREATE INDEX manual_receipt_use_balance ON manual_receipt_uses(receipt_id,state);

CREATE INDEX manual_order_allocations ON manual_payment_allocations(order_id,allocated_at);

CREATE VIEW manual_payment_cutoffs AS SELECT w.*,
 CASE WHEN EXISTS(SELECT 1 FROM manual_payment_claim_events e WHERE e.order_id=w.order_id AND e.occurred_at<w.deadline_at
  AND e.state IN('submitted','clarified','needs_information') AND NOT EXISTS(SELECT 1 FROM manual_payment_claim_events later WHERE later.order_id=e.order_id AND later.occurred_at<w.deadline_at AND (later.occurred_at>e.occurred_at OR later.occurred_at=e.occurred_at AND later.revision>e.revision)))
  OR COALESCE((SELECT SUM(a.amount_paisa) FROM manual_payment_allocations a WHERE a.order_id=w.order_id AND a.allocated_at<w.deadline_at AND COALESCE((SELECT SUM(r.amount_minor) FROM company_receipt_reversals r WHERE r.receipt_id=a.receipt_id AND r.recorded_at<w.deadline_at),0)<(SELECT amount_minor FROM company_money_receipts WHERE id=a.receipt_id)),0)>0
 THEN w.buffer_end_at ELSE w.deadline_at END AS cutoff_at FROM manual_payment_windows w;

DELIMITER $$
CREATE TRIGGER manual_window_source BEFORE INSERT ON manual_payment_windows FOR EACH ROW BEGIN
 IF NOT EXISTS(SELECT 1 FROM company_payment_instructions i JOIN orders o ON o.id=i.order_id WHERE i.order_id=NEW.order_id AND i.amount_paisa=NEW.amount_paisa AND i.issued_at=NEW.issued_at AND i.deadline_at=NEW.deadline_at AND i.calendar_version=NEW.calendar_version AND o.payment_mode='prepaid' AND o.payment_status='unpaid') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_window_original_instructions_required'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_window_identity BEFORE UPDATE ON manual_payment_windows FOR EACH ROW BEGIN
 IF NEW.order_id<>OLD.order_id OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.issued_at<>OLD.issued_at OR NEW.deadline_at<>OLD.deadline_at OR NEW.buffer_end_at<>OLD.buffer_end_at OR NEW.calendar_version<>OLD.calendar_version OR NEW.revision<>OLD.revision+1 OR OLD.paid_at IS NOT NULL AND NOT (NEW.paid_at <=> OLD.paid_at) OR OLD.closed_at IS NOT NULL AND NOT (NEW.closed_at <=> OLD.closed_at) OR OLD.released_at IS NOT NULL AND NOT (NEW.released_at <=> OLD.released_at) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_window_original_terms_immutable';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_receipt_use_cap BEFORE INSERT ON manual_receipt_uses FOR EACH ROW BEGIN
 IF NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id AND r.status='verified' AND NOT EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.receipt_id=r.id AND e.kind='receipt_reversal' AND e.state<>'resolved') AND NEW.amount_minor<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)-COALESCE((SELECT SUM(u.amount_minor) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_receipt_balance_exceeded'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_receipt_use_transition BEFORE UPDATE ON manual_receipt_uses FOR EACH ROW BEGIN
 IF NEW.id<>OLD.id OR NEW.receipt_id<>OLD.receipt_id OR NEW.kind<>OLD.kind OR NEW.target_id<>OLD.target_id OR NEW.amount_minor<>OLD.amount_minor OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR OLD.state<>'reserved' OR NEW.state NOT IN('returned','released') THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_receipt_use_immutable';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_allocation_source BEFORE INSERT ON manual_payment_allocations FOR EACH ROW BEGIN
 IF NOT EXISTS(SELECT 1 FROM manual_receipt_uses u JOIN company_money_receipts r ON r.id=u.receipt_id WHERE u.id=NEW.receipt_use_id AND u.receipt_id=NEW.receipt_id AND u.kind='order' AND u.target_id=NEW.order_id AND u.amount_minor=NEW.amount_paisa AND u.state='allocated' AND r.status='verified' AND r.currency='NPR' AND r.kind='bank_credit') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_allocation_verified_credit_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM manual_payment_cutoffs w JOIN orders o ON o.id=w.order_id WHERE w.order_id=NEW.order_id AND w.closed_at IS NULL AND w.paid_at IS NULL AND o.status NOT IN('cancelled','delivered','dispatched') AND NEW.allocated_at<w.cutoff_at) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_allocation_window_closed'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_preparation_held BEFORE UPDATE ON order_items FOR EACH ROW BEGIN
 IF NEW.fulfillment_status NOT IN('confirmed','cancelled') AND EXISTS(SELECT 1 FROM manual_payment_windows w WHERE w.order_id=NEW.order_id AND (w.paid_at IS NULL OR w.released_at IS NULL OR w.closed_at IS NOT NULL)) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_fulfillment_held';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_parcel_held BEFORE INSERT ON shipping_jobs FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM manual_payment_windows w WHERE w.order_id=NEW.order_id AND (w.paid_at IS NULL OR w.released_at IS NULL OR w.closed_at IS NOT NULL)) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_fulfillment_held';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_windows_retained BEFORE DELETE ON manual_payment_windows FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_windows_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_claims_retained BEFORE DELETE ON manual_payment_claims FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_claims_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_claim_events_retained BEFORE DELETE ON manual_payment_claim_events FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_claim_events_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_claim_files_retained BEFORE DELETE ON manual_payment_claim_files FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_claim_files_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_money_receipts_retained BEFORE DELETE ON company_money_receipts FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_money_receipts_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_receipt_conflicts_retained BEFORE DELETE ON company_receipt_conflicts FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_receipt_conflicts_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_receipt_uses_retained BEFORE DELETE ON manual_receipt_uses FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_receipt_uses_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_allocations_retained BEFORE DELETE ON manual_payment_allocations FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_allocations_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_receipt_reversals_retained BEFORE DELETE ON company_receipt_reversals FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_receipt_reversals_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_exceptions_retained BEFORE DELETE ON manual_payment_exceptions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_exceptions_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_claim_events_immutable BEFORE UPDATE ON manual_payment_claim_events FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_claim_events_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_claim_files_immutable BEFORE UPDATE ON manual_payment_claim_files FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_claim_files_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_receipt_conflicts_immutable BEFORE UPDATE ON company_receipt_conflicts FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_receipt_conflicts_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_payment_allocations_immutable BEFORE UPDATE ON manual_payment_allocations FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_allocations_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_receipt_reversals_immutable BEFORE UPDATE ON company_receipt_reversals FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_receipt_reversals_immutable';
END$$
DELIMITER ;

CREATE VIEW manual_payment_balances AS SELECT o.id AS order_id,
 CASE WHEN o.current_total_paisa IS NULL THEN o.grand_total_paisa ELSE o.current_total_paisa+COALESCE((SELECT JSON_VALUE(e.next_json,'$.platformServiceFeePaisa') FROM order_cancellation_events e WHERE e.order_id=o.id ORDER BY e.version DESC LIMIT 1),o.buyer_platform_fee_paisa) END AS payable_paisa,
 COALESCE((SELECT SUM(a.amount_paisa) FROM manual_payment_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.order_id=o.id AND r.status='verified'),0) AS received_paisa FROM orders o JOIN manual_payment_windows w ON w.order_id=o.id;

DELIMITER $$
CREATE TRIGGER manual_allocation_amount_and_time BEFORE INSERT ON manual_payment_allocations FOR EACH ROW BEGIN
 IF NEW.allocated_at<>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED) OR NOT EXISTS(SELECT 1 FROM manual_payment_balances b WHERE b.order_id=NEW.order_id AND NEW.amount_paisa<=b.payable_paisa-b.received_paisa) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_allocation_amount_or_time_changed'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_claim_original_age BEFORE UPDATE ON manual_payment_claims FOR EACH ROW BEGIN
 IF NEW.id<>OLD.id OR NEW.order_id<>OLD.order_id OR NEW.customer_id<>OLD.customer_id OR NEW.first_submitted_at<>OLD.first_submitted_at OR NEW.revision<>OLD.revision+1 THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_claim_original_age_immutable';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_claim_owner BEFORE INSERT ON manual_payment_claims FOR EACH ROW BEGIN
 IF NEW.first_submitted_at<>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED) OR NOT EXISTS(SELECT 1 FROM orders o JOIN users u ON u.id=o.customer_id WHERE o.id=NEW.order_id AND o.customer_id=NEW.customer_id AND u.status='active') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_claim_owner_required'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_claim_event_source BEFORE INSERT ON manual_payment_claim_events FOR EACH ROW BEGIN
 IF NEW.occurred_at<>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED) OR NOT EXISTS(SELECT 1 FROM manual_payment_claims c WHERE c.id=NEW.claim_id AND c.order_id=NEW.order_id AND c.revision=NEW.revision AND c.current_state=NEW.state) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_claim_current_event_required'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_window_paid_and_expired BEFORE UPDATE ON manual_payment_windows FOR EACH ROW BEGIN
 IF OLD.paid_at IS NULL AND NEW.paid_at IS NOT NULL AND (NEW.paid_at<>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED) OR NOT EXISTS(SELECT 1 FROM manual_payment_cutoffs w JOIN manual_payment_balances b ON b.order_id=w.order_id WHERE w.order_id=NEW.order_id AND w.closed_at IS NULL AND NEW.paid_at<w.cutoff_at AND b.received_paisa>=b.payable_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_not_confirmed'; END IF;
 IF OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL AND (NEW.closed_at<>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED) OR NOT EXISTS(SELECT 1 FROM manual_payment_cutoffs w WHERE w.order_id=NEW.order_id AND w.paid_at IS NULL AND (NEW.closed_at>=w.cutoff_at OR NEW.closure_reason='order_cancelled' AND EXISTS(SELECT 1 FROM orders o WHERE o.id=w.order_id AND o.status='cancelled')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_not_expired'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER manual_order_payment_source BEFORE UPDATE ON orders FOR EACH ROW BEGIN
 IF NEW.payment_mode='prepaid' AND NEW.payment_status='paid' AND EXISTS(SELECT 1 FROM manual_payment_windows WHERE order_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM manual_payment_windows WHERE order_id=NEW.id AND paid_at IS NOT NULL AND closed_at IS NULL) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_not_confirmed';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_receipt_original_fact BEFORE UPDATE ON company_money_receipts FOR EACH ROW BEGIN
 IF NEW.id<>OLD.id OR NEW.kind<>OLD.kind OR NOT (NEW.account_version_id <=> OLD.account_version_id) OR NEW.source_identity_hash<>OLD.source_identity_hash OR NEW.transaction_identity<>OLD.transaction_identity OR NEW.bank_at<>OLD.bank_at OR NEW.confirmed_at<>OLD.confirmed_at OR NEW.amount_minor<>OLD.amount_minor OR NEW.currency<>OLD.currency OR NEW.payer_reference<>OLD.payer_reference OR NOT (NEW.payer_user_id <=> OLD.payer_user_id) OR NOT (NEW.collector_user_id <=> OLD.collector_user_id) OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.verification_reason<>OLD.verification_reason OR NEW.created_by<>OLD.created_by OR NEW.revision<>OLD.revision+1 OR NEW.status<>'reversed' OR OLD.status='reversed' OR COALESCE((SELECT SUM(amount_minor) FROM company_receipt_reversals WHERE receipt_id=OLD.id),0)<>OLD.amount_minor THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_receipt_original_fact_immutable';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_receipt_controls_retained BEFORE DELETE ON company_receipt_controls FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_receipt_control_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_receipt_controls_revision BEFORE UPDATE ON company_receipt_controls FOR EACH ROW BEGIN
 IF NEW.receipt_id<>OLD.receipt_id OR NEW.revision<>OLD.revision+1 THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_receipt_control_revision';
 END IF;
END$$
DELIMITER ;

CREATE TABLE manual_payment_reminders(order_id VARCHAR(191) PRIMARY KEY,event_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,FOREIGN KEY(order_id) REFERENCES manual_payment_windows(order_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER manual_payment_reminder_immutable BEFORE UPDATE ON manual_payment_reminders FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_reminder_immutable'; END$$
CREATE TRIGGER manual_payment_reminder_retained BEFORE DELETE ON manual_payment_reminders FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_payment_reminder_retained'; END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER company_reversal_cap BEFORE INSERT ON company_receipt_reversals FOR EACH ROW BEGIN
 IF NEW.recorded_at<>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED) OR NEW.bank_at>NEW.recorded_at OR NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id AND r.kind='bank_credit' AND NEW.amount_minor<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='company_reversal_balance_or_time_changed'; END IF;
END$$
CREATE TRIGGER manual_reversal_preparation_held BEFORE UPDATE ON order_items FOR EACH ROW BEGIN
 IF NEW.fulfillment_status<>OLD.fulfillment_status AND NEW.fulfillment_status IN('packing','ready_for_pickup','dispatched') AND EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.order_id=NEW.order_id AND e.kind='receipt_reversal' AND e.state<>'resolved') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_reversal_fulfillment_held'; END IF;
END$$
CREATE TRIGGER manual_reversal_parcel_held BEFORE INSERT ON shipping_jobs FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.order_id=NEW.order_id AND e.kind='receipt_reversal' AND e.state<>'resolved') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_reversal_fulfillment_held'; END IF;
END$$
DELIMITER ;


CREATE TABLE cod_company_receipt_allocations(
 id VARCHAR(191) PRIMARY KEY,
 receipt_use_id VARCHAR(191) NOT NULL UNIQUE,
 receipt_id VARCHAR(191) NOT NULL,
 shipping_job_id VARCHAR(191) NOT NULL,
 cash_record_id VARCHAR(191) NOT NULL,
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0),
 approved_by VARCHAR(191) NOT NULL,
 evidence_reference VARCHAR(500) NOT NULL,
 created_at BIGINT NOT NULL,
 FOREIGN KEY(receipt_use_id) REFERENCES manual_receipt_uses(id),
 FOREIGN KEY(receipt_id) REFERENCES company_money_receipts(id),
 FOREIGN KEY(shipping_job_id) REFERENCES shipping_jobs(id),
 FOREIGN KEY(approved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX cod_receipt_job ON cod_company_receipt_allocations(shipping_job_id);

CREATE INDEX cod_receipt_cash_record ON cod_company_receipt_allocations(cash_record_id);

CREATE TABLE cod_approved_deductions(
 id VARCHAR(191) PRIMARY KEY,
 shipping_job_id VARCHAR(191) NOT NULL,
 courier_cost_id VARCHAR(191) NOT NULL,
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0),
 approved_by VARCHAR(191) NOT NULL,
 terms_evidence VARCHAR(500) NOT NULL,
 party_allocation_json LONGTEXT NOT NULL CHECK(json_valid(party_allocation_json)),
 created_at BIGINT NOT NULL,
 FOREIGN KEY(shipping_job_id) REFERENCES shipping_jobs(id),
 FOREIGN KEY(courier_cost_id) REFERENCES parcel_courier_costs(id),
 FOREIGN KEY(approved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER cod_receipt_allocation_cap BEFORE INSERT ON cod_company_receipt_allocations FOR EACH ROW BEGIN
 IF NOT EXISTS(SELECT 1 FROM manual_receipt_uses u JOIN company_money_receipts r ON r.id=u.receipt_id WHERE u.id=NEW.receipt_use_id AND u.kind='cod' AND u.target_id=NEW.shipping_job_id AND u.receipt_id=NEW.receipt_id AND u.amount_minor=NEW.amount_paisa AND u.state='allocated' AND r.status='verified' AND r.currency='NPR') OR NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_actual_receipt_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM shipping_parcels p WHERE p.shipping_job_id=NEW.shipping_job_id AND NEW.amount_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a WHERE a.shipping_job_id=p.shipping_job_id),0)+COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.shipping_job_id=p.shipping_job_id),0)<=p.collected_paisa) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_collection_allocation_exceeded'; END IF;
 IF EXISTS(SELECT 1 FROM parcel_cash_records c WHERE c.id=NEW.cash_record_id AND (c.shipping_job_id<>NEW.shipping_job_id OR c.kind<>'remittance' OR c.status NOT IN('pending','posted') OR NEW.amount_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a WHERE a.cash_record_id=c.id),0)>c.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_claim_allocation_changed'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER cod_deduction_cap BEFORE INSERT ON cod_approved_deductions FOR EACH ROW BEGIN
 IF NOT EXISTS(SELECT 1 FROM parcel_courier_costs c WHERE c.id=NEW.courier_cost_id AND c.shipping_job_id=NEW.shipping_job_id AND NEW.amount_paisa+COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.courier_cost_id=c.id),0)<=c.amount_paisa) OR NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin') OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(NEW.party_allocation_json,'$.party')),'')<>'company' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_authorized_company_cost_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM shipping_parcels p WHERE p.shipping_job_id=NEW.shipping_job_id AND NEW.amount_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a WHERE a.shipping_job_id=p.shipping_job_id),0)+COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.shipping_job_id=p.shipping_job_id),0)<=p.collected_paisa) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_collection_allocation_exceeded'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER cod_posted_receipt_insert BEFORE INSERT ON parcel_cash_records FOR EACH ROW BEGIN
 IF NEW.kind='remittance' AND NEW.status='posted' AND NEW.amount_paisa<>COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a WHERE a.cash_record_id=NEW.id AND a.shipping_job_id=NEW.shipping_job_id AND a.approved_by=NEW.approved_by),0) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_actual_receipt_allocation_required';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER cod_posted_receipt_update BEFORE UPDATE ON parcel_cash_records FOR EACH ROW BEGIN
 IF OLD.status<>'posted' AND NEW.kind='remittance' AND NEW.status='posted' AND NEW.amount_paisa<>COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a WHERE a.cash_record_id=NEW.id AND a.shipping_job_id=NEW.shipping_job_id AND a.approved_by=NEW.approved_by),0) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_actual_receipt_allocation_required';
 END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER cod_receipt_allocations_immutable BEFORE UPDATE ON cod_company_receipt_allocations FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_receipt_allocations_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER cod_receipt_allocations_retained BEFORE DELETE ON cod_company_receipt_allocations FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_receipt_allocations_retained';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER cod_deductions_immutable BEFORE UPDATE ON cod_approved_deductions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_deductions_immutable';
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER cod_deductions_retained BEFORE DELETE ON cod_approved_deductions FOR EACH ROW BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cod_deductions_retained';
END$$
DELIMITER ;

CREATE VIEW cod_reconciliation_balances AS SELECT p.shipping_job_id,p.cod_due_paisa,p.collected_paisa,p.remitted_paisa AS reported_remittance_paisa,
 COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a JOIN parcel_cash_records c ON c.id=a.cash_record_id WHERE a.shipping_job_id=p.shipping_job_id AND c.status='posted'),0) AS actual_cash_paisa,
 COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.shipping_job_id=p.shipping_job_id),0) AS approved_deductions_paisa,
 p.collected_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a JOIN parcel_cash_records c ON c.id=a.cash_record_id WHERE a.shipping_job_id=p.shipping_job_id AND c.status='posted'),0)-COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.shipping_job_id=p.shipping_job_id),0) AS remaining_paisa,
 EXISTS(SELECT 1 FROM manual_payment_exceptions e JOIN shipping_jobs j ON j.order_id=e.order_id WHERE j.id=p.shipping_job_id AND e.kind='receipt_reversal' AND e.state<>'resolved') AS correction_held
 FROM shipping_parcels p;

CREATE TABLE manual_payment_exception_events(id VARCHAR(191) PRIMARY KEY,exception_id VARCHAR(191) NOT NULL,revision BIGINT NOT NULL,actor_id VARCHAR(191) NOT NULL,owner_id VARCHAR(191),backup_id VARCHAR(191),state VARCHAR(32) NOT NULL,note LONGTEXT NOT NULL,next_update_at BIGINT NOT NULL,created_at BIGINT NOT NULL,UNIQUE(exception_id,revision),FOREIGN KEY(exception_id) REFERENCES manual_payment_exceptions(id),FOREIGN KEY(actor_id) REFERENCES users(id),FOREIGN KEY(owner_id) REFERENCES users(id),FOREIGN KEY(backup_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE TRIGGER manual_exception_events_immutable BEFORE UPDATE ON manual_payment_exception_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_exception_events_immutable'; END$$
CREATE TRIGGER manual_exception_events_retained BEFORE DELETE ON manual_payment_exception_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_exception_events_retained'; END$$
DELIMITER ;
-- Source parity for 0099. Isolated fixtures only; canonical/live execution requires later authorization.

CREATE TABLE order_response_portions(
 id VARCHAR(191) NOT NULL,
 order_id VARCHAR(191) NOT NULL,
 seller_id VARCHAR(191) NOT NULL,
 operator_mode VARCHAR(191) NOT NULL,
 created_at BIGINT NOT NULL,
 PRIMARY KEY(id),
 FOREIGN KEY(seller_id) REFERENCES seller_profiles(id),
 FOREIGN KEY(order_id) REFERENCES orders(id),
 UNIQUE(order_id,seller_id,operator_mode),
 CHECK(operator_mode IN('seller','company'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_response_cases(
 id VARCHAR(191) NOT NULL,
 portion_id VARCHAR(191) NOT NULL,
 source_key VARCHAR(191) NOT NULL,
 kind VARCHAR(191) NOT NULL,
 state VARCHAR(191) NOT NULL DEFAULT 'open',
 scope_json LONGTEXT NOT NULL,
 private_detail LONGTEXT NOT NULL,
 public_message LONGTEXT,
 proposed_ready_at BIGINT,
 owner_id VARCHAR(191),
 backup_id VARCHAR(191),
 reported_by VARCHAR(191),
 created_at BIGINT NOT NULL,
 first_action_at BIGINT,
 first_due_at BIGINT NOT NULL,
 next_update_at BIGINT,
 commitment_missing BIGINT NOT NULL DEFAULT 1,
 revision BIGINT NOT NULL DEFAULT 0,
 last_event_id VARCHAR(191) NOT NULL,
 PRIMARY KEY(id),
 FOREIGN KEY(reported_by) REFERENCES users(id),
 FOREIGN KEY(backup_id) REFERENCES users(id),
 FOREIGN KEY(owner_id) REFERENCES users(id),
 FOREIGN KEY(portion_id) REFERENCES order_response_portions(id),
 UNIQUE(source_key),
 CHECK(kind IN('no_response','delay','cannot_fulfill','hold','promise_missed')),
 CHECK(state IN('open','waiting','resolved')),
 CHECK(json_valid(scope_json)),
 CHECK(commitment_missing IN(0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_response_items(
 order_item_id VARCHAR(191) NOT NULL,
 portion_id VARCHAR(191) NOT NULL,
 released_at BIGINT NOT NULL,
 progress_at BIGINT,
 exception_case_id VARCHAR(191),
 revision BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(order_item_id),
 FOREIGN KEY(exception_case_id) REFERENCES order_response_cases(id),
 FOREIGN KEY(portion_id) REFERENCES order_response_portions(id),
 FOREIGN KEY(order_item_id) REFERENCES order_items(id),
 CHECK(released_at>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_fulfillment_holds(
 id VARCHAR(191) NOT NULL,
 order_item_id VARCHAR(191) NOT NULL,
 reason VARCHAR(191) NOT NULL,
 source_type VARCHAR(191) NOT NULL,
 source_id VARCHAR(191) NOT NULL,
 imposed_by VARCHAR(191),
 owner_id VARCHAR(191),
 prevents_preparation BIGINT NOT NULL,
 prevents_handoff BIGINT NOT NULL,
 started_at BIGINT NOT NULL,
 review_due_at BIGINT NOT NULL,
 ended_at BIGINT,
 ended_by VARCHAR(191),
 release_reason LONGTEXT,
 revision BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(id),
 FOREIGN KEY(ended_by) REFERENCES users(id),
 FOREIGN KEY(owner_id) REFERENCES users(id),
 FOREIGN KEY(imposed_by) REFERENCES users(id),
 FOREIGN KEY(order_item_id) REFERENCES order_items(id),
 CHECK(reason IN('cancellation','customer_clarification','payment_dispute','address_cod','safety','identity','ownership','carrier')),
 CHECK(prevents_preparation IN(0,1)),
 CHECK(prevents_handoff IN(0,1)),
 CHECK(ended_at IS NULL OR ended_at>=started_at),
 CHECK(prevents_preparation=1 OR prevents_handoff=1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_response_events(
 id VARCHAR(191) NOT NULL,
 portion_id VARCHAR(191),
 case_id VARCHAR(191),
 order_id VARCHAR(191) NOT NULL,
 kind VARCHAR(191) NOT NULL,
 scope_json LONGTEXT NOT NULL,
 source_key VARCHAR(191) NOT NULL,
 actor_id VARCHAR(191),
 note LONGTEXT NOT NULL,
 created_at BIGINT NOT NULL,
 case_state VARCHAR(191),
 case_revision BIGINT,
 due_at BIGINT,
 expires_at BIGINT,
 PRIMARY KEY(id),
 FOREIGN KEY(actor_id) REFERENCES users(id),
 FOREIGN KEY(order_id) REFERENCES orders(id),
 FOREIGN KEY(case_id) REFERENCES order_response_cases(id),
 FOREIGN KEY(portion_id) REFERENCES order_response_portions(id),
 UNIQUE(source_key),
 CHECK(kind IN('released','reminder','escalation','checkpoint','delay','followup','customer_update')),
 CHECK(json_valid(scope_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_response_milestones(
 order_item_id VARCHAR(191) NOT NULL,
 milestone VARCHAR(191) NOT NULL,
 event_id VARCHAR(191) NOT NULL,
 created_at BIGINT NOT NULL,
 PRIMARY KEY(order_item_id,milestone),
 FOREIGN KEY(event_id) REFERENCES order_response_events(id),
 FOREIGN KEY(order_item_id) REFERENCES order_response_items(order_item_id),
 CHECK(milestone IN('released','reminder','escalation','checkpoint'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_response_customer_state(
 order_id VARCHAR(191) NOT NULL,
 current_event_id VARCHAR(191) NOT NULL,
 revision BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(order_id),
 FOREIGN KEY(current_event_id) REFERENCES order_response_events(id),
 FOREIGN KEY(order_id) REFERENCES orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX order_response_open_cases ON order_response_cases(state,first_due_at,next_update_at);

CREATE INDEX order_fulfillment_active_holds ON order_fulfillment_holds(order_item_id,ended_at);

DELIMITER //
CREATE TRIGGER order_response_release_retained BEFORE UPDATE ON order_response_items FOR EACH ROW
BEGIN
 IF NEW.order_item_id<>OLD.order_item_id OR NEW.portion_id<>OLD.portion_id OR NEW.released_at<>OLD.released_at OR (OLD.progress_at IS NOT NULL AND NOT(NEW.progress_at<=>OLD.progress_at)) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_response_release_immutable';
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER order_response_events_immutable BEFORE UPDATE ON order_response_events FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_response_history_immutable';
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER order_response_events_retained BEFORE DELETE ON order_response_events FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_response_history_retained';
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER order_response_item_progress AFTER UPDATE ON order_items FOR EACH ROW
BEGIN
 IF (NOT(NEW.fulfillment_status<=>OLD.fulfillment_status)) AND (NEW.fulfillment_status<>OLD.fulfillment_status AND NEW.fulfillment_status IN('packing','ready_for_pickup','dispatched','delivered','cancelled')) THEN
 UPDATE order_response_items SET progress_at=COALESCE(progress_at,CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)),revision=revision+1 WHERE order_item_id=NEW.id;
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER order_preparation_hold_guard BEFORE UPDATE ON order_items FOR EACH ROW
BEGIN
 IF (NOT(NEW.fulfillment_status<=>OLD.fulfillment_status)) AND (NEW.fulfillment_status<>OLD.fulfillment_status AND EXISTS(SELECT 1 FROM order_fulfillment_holds h WHERE h.order_item_id=NEW.id AND h.ended_at IS NULL AND ((NEW.fulfillment_status IN('packing','ready_for_pickup') AND h.prevents_preparation=1) OR (NEW.fulfillment_status='dispatched' AND h.prevents_handoff=1)))) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_fulfillment_scope_is_held';
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER order_handoff_hold_guard BEFORE UPDATE ON shipping_jobs FOR EACH ROW
BEGIN
 IF (NOT(NEW.status<=>OLD.status)) AND (NEW.direction='outbound' AND NEW.status='dispatched' AND OLD.status NOT IN('dispatched','delivered') AND EXISTS(SELECT 1 FROM order_items i JOIN order_fulfillment_holds h ON h.order_item_id=i.id WHERE i.order_id=NEW.order_id AND i.seller_id=NEW.seller_id AND i.fulfillment_status<>'cancelled' AND h.ended_at IS NULL AND h.prevents_handoff=1)) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_handoff_scope_is_held';
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER order_hold_history_retained BEFORE DELETE ON order_fulfillment_holds FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_hold_history_retained';
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER order_hold_scope_immutable BEFORE UPDATE ON order_fulfillment_holds FOR EACH ROW
BEGIN
 IF NEW.order_item_id<>OLD.order_item_id OR NEW.reason<>OLD.reason OR NEW.source_type<>OLD.source_type OR NEW.source_id<>OLD.source_id OR NEW.started_at<>OLD.started_at OR NEW.prevents_preparation<>OLD.prevents_preparation OR NEW.prevents_handoff<>OLD.prevents_handoff OR (OLD.ended_at IS NOT NULL AND (NOT(NEW.ended_at<=>OLD.ended_at) OR NOT(NEW.ended_by<=>OLD.ended_by) OR NOT(NEW.release_reason<=>OLD.release_reason))) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_hold_history_immutable';
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER payment_correction_preparation_hold AFTER INSERT ON manual_payment_exceptions FOR EACH ROW
BEGIN
 IF NEW.kind='receipt_reversal' AND NEW.order_id IS NOT NULL THEN
 INSERT IGNORE INTO order_fulfillment_holds(id,order_item_id,reason,source_type,source_id,imposed_by,owner_id,prevents_preparation,prevents_handoff,started_at,review_due_at)
 SELECT CONCAT(NEW.last_event_id,':',i.id),i.id,'payment_dispute','payment_exception',NEW.id,NULL,NEW.owner_id,1,1,NEW.created_at,NEW.next_update_at FROM order_items i WHERE i.order_id=NEW.order_id AND i.fulfillment_status IN('confirmed','packing','ready_for_pickup');
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER payment_correction_preparation_reopened AFTER UPDATE ON manual_payment_exceptions FOR EACH ROW
BEGIN
 IF (NOT(NEW.state<=>OLD.state)) AND (OLD.state='resolved' AND NEW.state<>'resolved' AND NEW.kind='receipt_reversal' AND NEW.order_id IS NOT NULL) THEN
 INSERT IGNORE INTO order_fulfillment_holds(id,order_item_id,reason,source_type,source_id,imposed_by,owner_id,prevents_preparation,prevents_handoff,started_at,review_due_at)
 SELECT CONCAT(NEW.last_event_id,':',i.id),i.id,'payment_dispute','payment_exception',NEW.id,NULL,NEW.owner_id,1,1,NEW.created_at,NEW.next_update_at FROM order_items i WHERE i.order_id=NEW.order_id AND i.fulfillment_status IN('confirmed','packing','ready_for_pickup');
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER payment_correction_hold_resolved AFTER UPDATE ON manual_payment_exceptions FOR EACH ROW
BEGIN
 IF (NOT(NEW.state<=>OLD.state)) AND (NEW.state='resolved' AND OLD.state<>'resolved') THEN
 UPDATE order_fulfillment_holds SET ended_at=CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED),release_reason='The exact Finance correction case was resolved.',revision=revision+1 WHERE source_type='payment_exception' AND source_id=NEW.id AND ended_at IS NULL;
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER response_hold_insert_revision AFTER INSERT ON order_fulfillment_holds FOR EACH ROW
BEGIN
 UPDATE order_response_items SET revision=revision+1 WHERE order_item_id=NEW.order_item_id;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER response_hold_end_revision AFTER UPDATE ON order_fulfillment_holds FOR EACH ROW
BEGIN
 IF (NOT(NEW.ended_at<=>OLD.ended_at)) AND (NOT(NEW.ended_at<=>OLD.ended_at)) THEN
 UPDATE order_response_items SET revision=revision+1 WHERE order_item_id=NEW.order_item_id;
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER response_work_resolves_initial_case AFTER UPDATE ON order_response_items FOR EACH ROW
BEGIN
 IF (NOT(NEW.progress_at<=>OLD.progress_at) OR NOT(NEW.exception_case_id<=>OLD.exception_case_id)) THEN
 UPDATE order_response_cases SET state='resolved',revision=revision+1 WHERE portion_id=NEW.portion_id AND kind='no_response' AND state<>'resolved' AND NOT EXISTS(SELECT 1 FROM order_items i JOIN order_response_items r ON r.order_item_id=i.id WHERE JSON_CONTAINS(order_response_cases.scope_json,JSON_QUOTE(i.id))=1 AND i.fulfillment_status='confirmed' AND r.progress_at IS NULL AND r.exception_case_id IS NULL);
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER response_handoff_resolves_preparation_case AFTER UPDATE ON order_items FOR EACH ROW
BEGIN
 IF (NOT(NEW.fulfillment_status<=>OLD.fulfillment_status)) AND (NEW.fulfillment_status IN('dispatched','delivered','cancelled') AND OLD.fulfillment_status<>NEW.fulfillment_status) THEN
 UPDATE order_response_cases SET state='resolved',revision=revision+1 WHERE state<>'resolved' AND portion_id IN(SELECT portion_id FROM order_response_items WHERE order_item_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM order_items i WHERE JSON_CONTAINS(order_response_cases.scope_json,JSON_QUOTE(i.id))=1 AND i.fulfillment_status IN('confirmed','packing','ready_for_pickup'));
 END IF;
END//
DELIMITER ;
-- Source-only parity for 0100. Never execute against canonical or live data without cutover authorization.
ALTER TABLE order_cancellation_reviews ADD COLUMN revision BIGINT NOT NULL DEFAULT 0,
 ADD COLUMN owner_id VARCHAR(191), ADD COLUMN backup_id VARCHAR(191),
 ADD COLUMN first_action_at BIGINT, ADD COLUMN first_due_at BIGINT, ADD COLUMN next_update_at BIGINT,
 ADD COLUMN original_facts_json LONGTEXT CHECK(original_facts_json IS NULL OR JSON_VALID(original_facts_json)),
 ADD CONSTRAINT fk_cancellation_review_owner FOREIGN KEY(owner_id) REFERENCES users(id),
 ADD CONSTRAINT fk_cancellation_review_backup FOREIGN KEY(backup_id) REFERENCES users(id);
DELIMITER //
CREATE TRIGGER cancellation_request_first_due BEFORE INSERT ON order_cancellation_reviews FOR EACH ROW
BEGIN SET NEW.first_due_at=NEW.created_at+7200000; END//
CREATE TRIGGER cancellation_request_scoped_hold AFTER INSERT ON order_cancellation_reviews FOR EACH ROW
BEGIN
 INSERT INTO order_fulfillment_holds(id,order_item_id,reason,source_type,source_id,imposed_by,owner_id,prevents_preparation,prevents_handoff,started_at,review_due_at)
 SELECT REPLACE(UUID(),'-',''),i.id,'cancellation','cancellation_review',NEW.id,NEW.requested_by,NEW.owner_id,1,1,NEW.created_at,NEW.created_at+7200000
 FROM order_items i WHERE i.order_id=NEW.order_id AND JSON_CONTAINS(NEW.seller_ids_json,JSON_QUOTE(i.seller_id))=1
 AND i.fulfillment_status IN('confirmed','packing','ready_for_pickup') AND NOT EXISTS(SELECT 1 FROM shipping_jobs j WHERE j.order_id=i.order_id AND j.seller_id=i.seller_id AND j.direction='outbound' AND j.status NOT IN('pickup_requested','label_pending','label_ready','pickup_scheduled','cancelled'));
END//
CREATE TRIGGER cancellation_decision_releases_own_hold AFTER UPDATE ON order_cancellation_reviews FOR EACH ROW
BEGIN IF OLD.status='pending' AND NEW.status IN('approved','rejected') THEN
 UPDATE order_fulfillment_holds SET ended_at=CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED),ended_by=NEW.reviewed_by,release_reason=NEW.review_note,revision=revision+1 WHERE source_type='cancellation_review' AND source_id=NEW.id AND ended_at IS NULL;
END IF; END//
CREATE TRIGGER cancellation_scope_facts_retained BEFORE UPDATE ON order_cancellation_reviews FOR EACH ROW
BEGIN IF NOT (NEW.original_facts_json <=> OLD.original_facts_json) OR (OLD.first_due_at IS NOT NULL AND NOT (NEW.first_due_at <=> OLD.first_due_at)) OR (OLD.first_action_at IS NOT NULL AND NOT (NEW.first_action_at <=> OLD.first_action_at)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cancellation_original_facts_immutable'; END IF; END//
DELIMITER ;
-- Source-only parity for 0101; no canonical/live execution.
ALTER TABLE return_requests ADD COLUMN recorded_at BIGINT,
 ADD COLUMN intake_channel VARCHAR(20) NOT NULL DEFAULT 'web' CHECK(intake_channel IN('web','email','support')),
 ADD COLUMN intake_recorded_by VARCHAR(191) REFERENCES users(id),
 ADD COLUMN received_evidence_reference LONGTEXT, ADD COLUMN delivered_at_snapshot BIGINT;
DELIMITER //
CREATE TRIGGER return_received_source_retained BEFORE UPDATE ON return_requests FOR EACH ROW
BEGIN IF NOT (NEW.requested_at <=> OLD.requested_at AND NEW.recorded_at <=> OLD.recorded_at AND NEW.intake_channel <=> OLD.intake_channel AND NEW.intake_recorded_by <=> OLD.intake_recorded_by AND NEW.received_evidence_reference <=> OLD.received_evidence_reference AND NEW.delivered_at_snapshot <=> OLD.delivered_at_snapshot AND NEW.policy_snapshot_json <=> OLD.policy_snapshot_json AND NEW.order_item_id <=> OLD.order_item_id AND NEW.quantity <=> OLD.quantity) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_original_received_source_immutable'; END IF; END//
DELIMITER ;
-- Source parity for 0102. Isolated targets only; canonical and live migrations remain held.
CREATE TABLE return_handling(
 case_id VARCHAR(191) PRIMARY KEY REFERENCES return_requests(id),revision BIGINT NOT NULL DEFAULT 0,
 owner_id VARCHAR(191) REFERENCES users(id),backup_id VARCHAR(191) REFERENCES users(id),first_received_at BIGINT NOT NULL,first_due_at BIGINT NOT NULL,first_action_at BIGINT,next_update_at BIGINT,
 phase VARCHAR(191) NOT NULL DEFAULT 'requested' CHECK(phase IN('requested','instructions','in_transit','received','inspected','waived')),
 calendar_version VARCHAR(191),enough_information_at BIGINT,instructions_due_at BIGINT,instructions_json LONGTEXT,instructions_at BIGINT,handoff_due_at BIGINT,handed_at BIGINT,received_at BIGINT,sufficient_evidence_at BIGINT,inspection_due_at BIGINT,
 received_quantity BIGINT NOT NULL DEFAULT 0 CHECK(received_quantity>=0),inspected_quantity BIGINT NOT NULL DEFAULT 0 CHECK(inspected_quantity>=0),restocked_quantity BIGINT NOT NULL DEFAULT 0 CHECK(restocked_quantity>=0),waived_quantity BIGINT NOT NULL DEFAULT 0 CHECK(waived_quantity>=0),
 waiting_for VARCHAR(191) NOT NULL DEFAULT 'none' CHECK(waiting_for IN('none','customer','seller','carrier','platform')),clarification_at BIGINT,clarification_due_at BIGINT,
 last_event_id VARCHAR(191),created_at BIGINT NOT NULL, CHECK(first_due_at=first_received_at+86400000),CHECK(restocked_quantity<=inspected_quantity),CHECK(inspected_quantity<=received_quantity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE return_handling_events(
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES return_requests(id),revision BIGINT NOT NULL,action VARCHAR(191) NOT NULL,actor_id VARCHAR(191) NOT NULL REFERENCES users(id),
 occurred_at BIGINT NOT NULL,recorded_at BIGINT NOT NULL,public_message LONGTEXT NOT NULL,private_note LONGTEXT NOT NULL,evidence_reference LONGTEXT NOT NULL,details_json LONGTEXT NOT NULL CHECK(json_valid(details_json)),request_id VARCHAR(191) NOT NULL,
 UNIQUE(case_id,revision),UNIQUE(actor_id,request_id),CHECK(occurred_at<=recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE return_replacement_shipments(
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES return_requests(id),quantity BIGINT NOT NULL CHECK(quantity>0),offer_id VARCHAR(191) REFERENCES product_offer_identities(id),
 state VARCHAR(191) NOT NULL CHECK(state IN('reserved','dispatched','delivered','cancelled','lost')),revision BIGINT NOT NULL DEFAULT 0,
 customer_agreement_reference LONGTEXT NOT NULL,promised_at BIGINT NOT NULL,carrier_reference LONGTEXT,dispatched_at BIGINT,delivered_at BIGINT,closed_at BIGINT,created_at BIGINT NOT NULL,
 CHECK(delivered_at IS NULL OR dispatched_at IS NOT NULL AND delivered_at>=dispatched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE return_stock_actions(
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES return_requests(id),shipment_id VARCHAR(191) REFERENCES return_replacement_shipments(id),offer_id VARCHAR(191) REFERENCES product_offer_identities(id),product_id VARCHAR(191) REFERENCES products(id),
 kind VARCHAR(191) NOT NULL CHECK(kind IN('restock','replacement_reserve','replacement_dispatch','replacement_release')),quantity BIGINT NOT NULL CHECK(quantity>0),actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,UNIQUE(case_id,request_id,kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER //
CREATE TRIGGER return_request_starts_original_clock AFTER INSERT ON return_requests FOR EACH ROW BEGIN
 INSERT INTO return_handling(case_id,first_received_at,first_due_at,calendar_version,created_at) VALUES(NEW.id,NEW.requested_at,NEW.requested_at+86400000,'continuous-v1',COALESCE(NEW.recorded_at,NEW.updated_at)); END//
CREATE TRIGGER return_review_records_meaningful_action AFTER INSERT ON return_request_events FOR EACH ROW BEGIN
 IF NEW.action IN('admin_approve','admin_reject','admin_request_changes') THEN
 UPDATE return_handling SET first_action_at=COALESCE(first_action_at,NEW.created_at),enough_information_at=CASE WHEN NEW.action='admin_approve' THEN COALESCE(enough_information_at,(SELECT MAX(created_at) FROM return_request_events WHERE return_request_id=NEW.return_request_id AND action='customer_clarified'),first_received_at) ELSE enough_information_at END,instructions_due_at=CASE WHEN NEW.action='admin_approve' AND calendar_version='continuous-v1' THEN COALESCE(instructions_due_at,COALESCE(enough_information_at,(SELECT MAX(created_at) FROM return_request_events WHERE return_request_id=NEW.return_request_id AND action='customer_clarified'),first_received_at)+172800000) ELSE instructions_due_at END,revision=revision+1 WHERE case_id=NEW.return_request_id;
 END IF; END//
CREATE TRIGGER return_handling_originals_retained BEFORE UPDATE ON return_handling FOR EACH ROW BEGIN
 IF NEW.case_id<>OLD.case_id OR NOT(NEW.calendar_version <=> OLD.calendar_version) OR NEW.revision<>OLD.revision+1 OR NEW.first_received_at<>OLD.first_received_at OR NEW.first_due_at<>OLD.first_due_at OR NEW.created_at<>OLD.created_at OR (OLD.first_action_at IS NOT NULL AND NOT(NEW.first_action_at <=> OLD.first_action_at)) OR (OLD.instructions_at IS NOT NULL AND NOT(NEW.instructions_at <=> OLD.instructions_at AND NEW.instructions_json <=> OLD.instructions_json AND NEW.handoff_due_at <=> OLD.handoff_due_at)) OR (OLD.received_at IS NOT NULL AND NOT(NEW.received_at <=> OLD.received_at)) OR NEW.received_quantity<OLD.received_quantity OR NEW.inspected_quantity<OLD.inspected_quantity OR NEW.restocked_quantity<OLD.restocked_quantity OR NEW.waived_quantity<OLD.waived_quantity OR NEW.received_quantity+NEW.waived_quantity>(SELECT quantity FROM return_requests WHERE id=NEW.case_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_physical_history_or_quantity_conflict'; END IF; END//
CREATE TRIGGER return_handling_event_immutable BEFORE UPDATE ON return_handling_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_handling_event_immutable'; END//
CREATE TRIGGER return_handling_event_retained BEFORE DELETE ON return_handling_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_handling_event_retained'; END//
CREATE TRIGGER return_stock_action_immutable BEFORE UPDATE ON return_stock_actions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_stock_action_immutable'; END//
CREATE TRIGGER return_stock_action_retained BEFORE DELETE ON return_stock_actions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_stock_action_retained'; END//
CREATE TRIGGER return_replacement_one_active BEFORE INSERT ON return_replacement_shipments FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM return_replacement_shipments WHERE case_id=NEW.case_id AND state IN('reserved','dispatched','delivered')) OR NEW.quantity<>(SELECT quantity FROM return_requests WHERE id=NEW.case_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_replacement_scope_or_duplicate'; END IF; END//
CREATE TRIGGER return_replacement_history BEFORE UPDATE ON return_replacement_shipments FOR EACH ROW BEGIN
 IF NEW.id<>OLD.id OR NEW.case_id<>OLD.case_id OR NEW.quantity<>OLD.quantity OR NOT(NEW.offer_id <=> OLD.offer_id) OR NEW.customer_agreement_reference<>OLD.customer_agreement_reference OR NEW.promised_at<>OLD.promised_at OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR NOT(OLD.state='reserved' AND NEW.state IN('dispatched','cancelled') OR OLD.state='dispatched' AND NEW.state IN('delivered','lost')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_replacement_history_conflict'; END IF; END//
CREATE TRIGGER return_replacement_retained BEFORE DELETE ON return_replacement_shipments FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_replacement_retained'; END//
DELIMITER ;
-- Source parity for 0103. Review target and historical sources before any separately authorized migration.
ALTER TABLE complaints ADD COLUMN first_due_at BIGINT;

ALTER TABLE complaints ADD COLUMN first_action_at BIGINT;

ALTER TABLE complaints ADD COLUMN next_update_at BIGINT;

ALTER TABLE complaints ADD COLUMN backup_id VARCHAR(191) REFERENCES users(id);

ALTER TABLE complaints ADD COLUMN waiting_for VARCHAR(191) NOT NULL DEFAULT 'none' CHECK(waiting_for IN('none','customer','seller','carrier','platform'));

ALTER TABLE complaints ADD COLUMN clarification_at BIGINT;

ALTER TABLE complaints ADD COLUMN clarification_due_at BIGINT;

ALTER TABLE complaints ADD COLUMN followup_revision BIGINT NOT NULL DEFAULT 0;

ALTER TABLE complaints ADD COLUMN recorded_at BIGINT;

ALTER TABLE complaints ADD COLUMN intake_channel VARCHAR(191) NOT NULL DEFAULT 'web' CHECK(intake_channel IN('web','email','support'));

ALTER TABLE complaints ADD COLUMN intake_recorded_by VARCHAR(191), ADD CONSTRAINT fk_complaint_intake_recorded_by FOREIGN KEY(intake_recorded_by) REFERENCES users(id);

ALTER TABLE complaints ADD COLUMN received_evidence_reference LONGTEXT;

CREATE TABLE aftercare_followup_events(
 id VARCHAR(191) PRIMARY KEY,source_type VARCHAR(191) NOT NULL CHECK(source_type IN('return_request','complaint')),source_id VARCHAR(191) NOT NULL,revision BIGINT NOT NULL,
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),owner_id VARCHAR(191) REFERENCES users(id),backup_id VARCHAR(191) REFERENCES users(id),waiting_for VARCHAR(191) NOT NULL,
 next_update_at BIGINT NOT NULL,next_action LONGTEXT NOT NULL,public_message LONGTEXT NOT NULL,private_note LONGTEXT NOT NULL,request_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,
 UNIQUE(actor_id,request_id),UNIQUE(source_type,source_id,revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE aftercare_followup_milestones(
 source_type VARCHAR(191) NOT NULL,source_id VARCHAR(191) NOT NULL,cycle VARCHAR(191) NOT NULL,kind VARCHAR(191) NOT NULL,event_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,
 PRIMARY KEY(source_type,source_id,cycle,kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO return_handling(case_id,first_received_at,first_due_at,first_action_at,created_at)
 SELECT r.id,r.requested_at,r.requested_at+86400000,(SELECT MIN(e.created_at) FROM return_request_events e WHERE e.return_request_id=r.id AND e.action IN('admin_approve','admin_reject','admin_request_changes')),ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000) FROM return_requests r;

UPDATE complaints SET first_due_at=created_at+86400000,first_action_at=(SELECT MIN(e.created_at) FROM complaint_events e WHERE e.complaint_id=complaints.id AND e.action IN('admin_investigate','admin_request_customer','admin_escalate','admin_resolve','admin_close','admin_reopen')) WHERE first_due_at IS NULL;

INSERT IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at)
 SELECT UUID(),'return_request',id,id,requested_at,requested_at+86400000,'continuous-v1',updated_at FROM return_requests;

INSERT IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at)
 SELECT UUID(),'complaint',id,id,created_at,created_at+86400000,'continuous-v1',updated_at FROM complaints;
DELIMITER //
CREATE TRIGGER aftercare_followup_history BEFORE UPDATE ON aftercare_followup_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='aftercare_followup_history_immutable'; END//
CREATE TRIGGER aftercare_followup_history_retained BEFORE DELETE ON aftercare_followup_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='aftercare_followup_history_retained'; END//
CREATE TRIGGER complaint_original_clock BEFORE INSERT ON complaints FOR EACH ROW BEGIN SET NEW.first_due_at=NEW.created_at+86400000; SET NEW.recorded_at=COALESCE(NEW.recorded_at,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)); END//
CREATE TRIGGER complaint_original_review_task AFTER INSERT ON complaints FOR EACH ROW BEGIN INSERT IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at)
 VALUES(UUID(),'complaint',NEW.id,NEW.id,NEW.created_at,NEW.created_at+86400000,'continuous-v1',NEW.created_at); END//
CREATE TRIGGER return_original_review_task AFTER INSERT ON return_requests FOR EACH ROW BEGIN INSERT IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at)
 VALUES(UUID(),'return_request',NEW.id,NEW.id,NEW.requested_at,NEW.requested_at+86400000,'continuous-v1',NEW.requested_at); END//
CREATE TRIGGER return_clarification_clock AFTER INSERT ON return_request_events FOR EACH ROW BEGIN IF NEW.action='admin_request_changes' THEN UPDATE return_handling SET waiting_for='customer',clarification_at=NEW.created_at,clarification_due_at=NEW.created_at+172800000,revision=revision+1 WHERE case_id=NEW.return_request_id; END IF; END//
CREATE TRIGGER return_reply_ends_clarification AFTER INSERT ON return_request_events FOR EACH ROW BEGIN IF NEW.action IN('customer_clarified','seller_responded','admin_approve','admin_reject') THEN UPDATE return_handling SET waiting_for='none',revision=revision+1 WHERE case_id=NEW.return_request_id AND (NEW.action IN('admin_approve','admin_reject') OR NEW.action='customer_clarified' AND waiting_for='customer' OR NEW.action='seller_responded' AND waiting_for='seller'); END IF; END//
CREATE TRIGGER complaint_meaningful_action AFTER INSERT ON complaint_events FOR EACH ROW BEGIN IF NEW.action IN('admin_investigate','admin_request_customer','admin_escalate','admin_resolve','admin_close','admin_reopen') THEN UPDATE complaints SET first_action_at=COALESCE(first_action_at,NEW.created_at),waiting_for=CASE WHEN NEW.action='admin_request_customer' THEN 'customer' ELSE 'none' END,
 clarification_at=CASE WHEN NEW.action='admin_request_customer' THEN NEW.created_at ELSE clarification_at END,clarification_due_at=CASE WHEN NEW.action='admin_request_customer' THEN NEW.created_at+172800000 ELSE clarification_due_at END,
 followup_revision=followup_revision+1 WHERE id=NEW.complaint_id; END IF; END//
CREATE TRIGGER complaint_reply_ends_clarification AFTER INSERT ON complaint_events FOR EACH ROW BEGIN IF NEW.action IN('customer_replied','seller_responded') THEN UPDATE complaints SET waiting_for='none',followup_revision=followup_revision+1 WHERE id=NEW.complaint_id AND (NEW.action='customer_replied' AND waiting_for='customer' OR NEW.action='seller_responded' AND waiting_for='seller'); END IF; END//
CREATE TRIGGER complaint_original_received_retained BEFORE UPDATE ON complaints FOR EACH ROW BEGIN IF NOT(NEW.created_at <=> OLD.created_at) OR OLD.first_due_at IS NOT NULL AND NOT(NEW.first_due_at <=> OLD.first_due_at) OR OLD.first_action_at IS NOT NULL AND NOT(NEW.first_action_at <=> OLD.first_action_at) OR OLD.recorded_at IS NOT NULL AND NOT(NEW.recorded_at <=> OLD.recorded_at) OR NOT(NEW.intake_channel <=> OLD.intake_channel) OR NOT(NEW.intake_recorded_by <=> OLD.intake_recorded_by) OR NOT(NEW.received_evidence_reference <=> OLD.received_evidence_reference) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='complaint_original_received_source_immutable'; END IF; END//
CREATE TRIGGER return_handling_retained BEFORE DELETE ON return_handling FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_handling_retained'; END//
DELIMITER ;
-- Source parity for 0104_refund_obligations. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE refund_obligations(
 id VARCHAR(191) PRIMARY KEY,source_kind VARCHAR(191) NOT NULL CHECK(source_kind IN('return_refund','receipt_return','service_fee','cancellation')),
 source_id VARCHAR(191) NOT NULL,order_id VARCHAR(191) REFERENCES orders(id),receipt_id VARCHAR(191) REFERENCES company_money_receipts(id),receipt_use_id VARCHAR(191) UNIQUE REFERENCES manual_receipt_uses(id),
 customer_id VARCHAR(191) NOT NULL REFERENCES users(id),cash_paisa BIGINT NOT NULL CHECK(cash_paisa>=0 AND cash_paisa<=9007199254740991),wallet_paisa BIGINT NOT NULL CHECK(wallet_paisa>=0 AND wallet_paisa<=9007199254740991),
 currency VARCHAR(191) NOT NULL CHECK(currency='NPR'),source_snapshot_json LONGTEXT NOT NULL CHECK(json_valid(source_snapshot_json)),
 state VARCHAR(191) NOT NULL DEFAULT 'open' CHECK(state IN('open','processing','uncertain','completed','blocked')),revision BIGINT NOT NULL DEFAULT 0,
 owner_id VARCHAR(191) NOT NULL REFERENCES users(id),backup_id VARCHAR(191) REFERENCES users(id),authorized_at BIGINT NOT NULL,first_finance_due_at BIGINT NOT NULL,first_finance_at BIGINT,
 next_update_at BIGINT NOT NULL,calendar_version VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,UNIQUE(source_kind,source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE refund_obligation_events(
 id VARCHAR(191) PRIMARY KEY,obligation_id VARCHAR(191) NOT NULL REFERENCES refund_obligations(id),actor_id VARCHAR(191) NOT NULL REFERENCES users(id),action VARCHAR(191) NOT NULL,
 public_message LONGTEXT NOT NULL,private_details_json LONGTEXT NOT NULL CHECK(json_valid(private_details_json)),request_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,UNIQUE(obligation_id,request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER refund_obligation_source_retained BEFORE UPDATE ON refund_obligations FOR EACH ROW BEGIN IF (NEW.id<>OLD.id OR NEW.source_kind<>OLD.source_kind OR NEW.source_id<>OLD.source_id OR NOT (NEW.order_id <=> OLD.order_id) OR NOT (NEW.receipt_id <=> OLD.receipt_id) OR NOT (NEW.receipt_use_id <=> OLD.receipt_use_id)
 OR NEW.customer_id<>OLD.customer_id OR NEW.cash_paisa<>OLD.cash_paisa OR NEW.wallet_paisa<>OLD.wallet_paisa OR NEW.currency<>OLD.currency OR NEW.source_snapshot_json<>OLD.source_snapshot_json
 OR NEW.authorized_at<>OLD.authorized_at OR NEW.first_finance_due_at<>OLD.first_finance_due_at OR NEW.calendar_version<>OLD.calendar_version OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_original_obligation_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER refund_obligation_no_delete BEFORE DELETE ON refund_obligations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_original_obligation_retained'; END$$
CREATE OR REPLACE TRIGGER refund_obligation_event_no_update BEFORE UPDATE ON refund_obligation_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_history_retained'; END$$
CREATE OR REPLACE TRIGGER refund_obligation_event_no_delete BEFORE DELETE ON refund_obligation_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_history_retained'; END$$
DELIMITER ;
-- Source parity for 0105_refund_execution_sources. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE refund_destination_heads(obligation_id VARCHAR(191) PRIMARY KEY REFERENCES refund_obligations(id),version_id VARCHAR(191),revision BIGINT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE refund_destination_versions(
 id VARCHAR(191) PRIMARY KEY,obligation_id VARCHAR(191) NOT NULL REFERENCES refund_obligations(id),number BIGINT NOT NULL,revision BIGINT NOT NULL DEFAULT 0,
 details_json LONGTEXT NOT NULL CHECK(json_valid(details_json)),relationship VARCHAR(191) NOT NULL CHECK(relationship IN('original_payer','own_account','authorized_nominee')),
 customer_authorization LONGTEXT NOT NULL,evidence_reference LONGTEXT NOT NULL,submitted_by VARCHAR(191) NOT NULL REFERENCES users(id),session_hash VARCHAR(191) NOT NULL,authenticated_at BIGINT NOT NULL,created_at BIGINT NOT NULL,
 status VARCHAR(191) NOT NULL CHECK(status IN('submitted','verified','rejected')),verified_by VARCHAR(191) REFERENCES users(id),verified_at BIGINT,verification_reference LONGTEXT,
 UNIQUE(obligation_id,number),CHECK(status<>'verified' OR verified_by IS NOT NULL AND verified_at IS NOT NULL AND verification_reference IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_funding_accounts(account_id VARCHAR(191) PRIMARY KEY REFERENCES company_payment_accounts(id),statement_id VARCHAR(191),revision BIGINT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_funding_statements(
 id VARCHAR(191) PRIMARY KEY,account_id VARCHAR(191) NOT NULL REFERENCES company_payment_accounts(id),account_version_id VARCHAR(191) NOT NULL REFERENCES company_payment_account_versions(id),
 statement_identity VARCHAR(200) COLLATE utf8mb4_bin NOT NULL,as_of BIGINT NOT NULL,cash_paisa BIGINT NOT NULL CHECK(cash_paisa>=0 AND cash_paisa<=9007199254740991),restricted_paisa BIGINT NOT NULL CHECK(restricted_paisa>=0 AND restricted_paisa<=cash_paisa),
 evidence_reference LONGTEXT NOT NULL,restrictions_reference LONGTEXT NOT NULL,verified_by VARCHAR(191) NOT NULL REFERENCES users(id),recorded_at BIGINT NOT NULL,UNIQUE(account_id,statement_identity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE outgoing_payment_packets(
 id VARCHAR(191) PRIMARY KEY,obligation_id VARCHAR(191) NOT NULL REFERENCES refund_obligations(id),funding_statement_id VARCHAR(191) REFERENCES company_funding_statements(id),account_version_id VARCHAR(191) REFERENCES company_payment_account_versions(id),
 destination_version_id VARCHAR(191) REFERENCES refund_destination_versions(id),amount_paisa BIGINT NOT NULL CHECK(amount_paisa>=0 AND amount_paisa<=9007199254740991),currency VARCHAR(191) NOT NULL CHECK(currency='NPR'),
 state VARCHAR(191) NOT NULL CHECK(state IN('prepared','approved','processing','uncertain','paid','failed','void')),revision BIGINT NOT NULL DEFAULT 0,
 prepared_by VARCHAR(191) NOT NULL REFERENCES users(id),approved_by VARCHAR(191) REFERENCES users(id),started_by VARCHAR(191) REFERENCES users(id),recorded_by VARCHAR(191) REFERENCES users(id),
 prepared_at BIGINT NOT NULL,approved_at BIGINT,started_at BIGINT,recorded_at BIGINT,bank_at BIGINT,transaction_identity VARCHAR(191),transaction_identity_hash VARCHAR(191) UNIQUE,evidence_reference LONGTEXT,
 CHECK(amount_paisa=0 OR funding_statement_id IS NOT NULL AND account_version_id IS NOT NULL AND destination_version_id IS NOT NULL)

,live_obligation_id VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN state NOT IN('failed','void') THEN obligation_id ELSE NULL END) STORED,UNIQUE KEY outgoing_one_live_attempt(live_obligation_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER refund_destination_source_retained BEFORE UPDATE ON refund_destination_versions FOR EACH ROW BEGIN IF (NEW.id<>OLD.id OR NEW.obligation_id<>OLD.obligation_id OR NEW.number<>OLD.number OR NEW.details_json<>OLD.details_json OR NEW.relationship<>OLD.relationship OR NEW.customer_authorization<>OLD.customer_authorization OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.submitted_by<>OLD.submitted_by OR NEW.session_hash<>OLD.session_hash OR NEW.authenticated_at<>OLD.authenticated_at OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR OLD.status<>'submitted') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_destination_snapshot_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER refund_destination_no_delete BEFORE DELETE ON refund_destination_versions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_destination_snapshot_retained'; END$$
CREATE OR REPLACE TRIGGER company_funding_statement_no_update BEFORE UPDATE ON company_funding_statements FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='funding_statement_evidence_retained'; END$$
CREATE OR REPLACE TRIGGER company_funding_statement_no_delete BEFORE DELETE ON company_funding_statements FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='funding_statement_evidence_retained'; END$$
CREATE OR REPLACE TRIGGER outgoing_packet_snapshot_retained BEFORE UPDATE ON outgoing_payment_packets FOR EACH ROW BEGIN IF (NEW.id<>OLD.id OR NEW.obligation_id<>OLD.obligation_id OR NOT (NEW.funding_statement_id <=> OLD.funding_statement_id) OR NOT (NEW.account_version_id <=> OLD.account_version_id) OR NOT (NEW.destination_version_id <=> OLD.destination_version_id) OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.currency<>OLD.currency OR NEW.prepared_by<>OLD.prepared_by OR NEW.prepared_at<>OLD.prepared_at OR NEW.revision<>OLD.revision+1 OR OLD.state IN('paid','failed','void')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='outgoing_packet_snapshot_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER outgoing_packet_no_delete BEFORE DELETE ON outgoing_payment_packets FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='outgoing_packet_snapshot_retained'; END$$
CREATE OR REPLACE TRIGGER outgoing_packet_ordered_transition BEFORE UPDATE ON outgoing_payment_packets FOR EACH ROW BEGIN IF (NOT (
 OLD.state='prepared' AND NEW.state IN('approved','void') OR OLD.state='approved' AND NEW.state IN('processing','void') OR OLD.state IN('processing','uncertain') AND NEW.state IN('uncertain','paid','failed'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='outgoing_packet_transition_conflict'; END IF; END$$
CREATE OR REPLACE TRIGGER refund_execution_packet_required BEFORE UPDATE ON refunds FOR EACH ROW BEGIN IF (NEW.status<>OLD.status AND NEW.status IN('processing','paid','failed') AND (NOT EXISTS(SELECT 1 FROM outgoing_payment_packets p JOIN refund_obligations o ON o.id=p.obligation_id JOIN users u ON u.id=NEW.processed_by JOIN user_roles role ON role.user_id=u.id
  WHERE o.source_kind='return_refund' AND o.source_id=NEW.id AND p.state=NEW.status AND p.amount_paisa=NEW.amount_paisa-NEW.wallet_credit_paisa-NEW.referral_discount_paisa-NEW.promo_discount_paisa
  AND u.status='active' AND role.role='super_admin' AND (CASE WHEN NEW.status='processing' THEN p.started_by ELSE p.recorded_by END)=u.id
  AND (NEW.status<>'paid' OR p.amount_paisa=0 OR p.bank_at IS NOT NULL AND p.transaction_identity_hash IS NOT NULL AND length(p.evidence_reference)>=8)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_requires_actual_execution_packet'; END IF; END$$
DELIMITER ;
-- Source parity for 0106_original_delivery_allocations. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE order_delivery_allocations(
 order_item_id VARCHAR(191) PRIMARY KEY REFERENCES order_items(id),
 order_id VARCHAR(191) NOT NULL REFERENCES orders(id),
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>=0),
 original_quantity BIGINT NOT NULL CHECK(original_quantity>0),
 policy_version VARCHAR(191) NOT NULL CHECK(policy_version='original_seller_item_largest_remainder_v1'),
 created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX order_delivery_allocations_order_idx ON order_delivery_allocations(order_id);

DELIMITER $$
CREATE OR REPLACE TRIGGER order_delivery_allocation_no_update BEFORE UPDATE ON order_delivery_allocations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Original delivery allocation is immutable'; END$$
CREATE OR REPLACE TRIGGER order_delivery_allocation_no_delete BEFORE DELETE ON order_delivery_allocations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Original delivery allocation is immutable'; END$$
DELIMITER ;
-- Source parity for 0107_lawful_fee_refund_authorizations. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE lawful_fee_refund_authorizations(
 id VARCHAR(191) PRIMARY KEY,order_id VARCHAR(191) NOT NULL REFERENCES orders(id),customer_id VARCHAR(191) NOT NULL REFERENCES users(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 legal_basis LONGTEXT NOT NULL,case_reference VARCHAR(191) NOT NULL,evidence_reference LONGTEXT NOT NULL,
 source_snapshot_json LONGTEXT NOT NULL CHECK(json_valid(source_snapshot_json)),
 authorized_by VARCHAR(191) NOT NULL REFERENCES users(id),authorized_at BIGINT NOT NULL,
 state VARCHAR(191) NOT NULL DEFAULT 'authorized' CHECK(state IN('authorized','paid')),
 UNIQUE(order_id,case_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER lawful_fee_authorization_retained BEFORE UPDATE ON lawful_fee_refund_authorizations FOR EACH ROW BEGIN IF (NEW.id<>OLD.id OR NEW.order_id<>OLD.order_id OR NEW.customer_id<>OLD.customer_id
 OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.legal_basis<>OLD.legal_basis OR NEW.case_reference<>OLD.case_reference
 OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.source_snapshot_json<>OLD.source_snapshot_json
 OR NEW.authorized_by<>OLD.authorized_by OR NEW.authorized_at<>OLD.authorized_at OR OLD.state<>'authorized' OR NEW.state<>'paid') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='original_fee_authorization_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER lawful_fee_authorization_no_delete BEFORE DELETE ON lawful_fee_refund_authorizations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='original_fee_authorization_retained'; END$$
DELIMITER ;
-- Source parity for 0108_private_finance_evidence. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE finance_evidence_intents(
 id VARCHAR(191) PRIMARY KEY,scope_kind VARCHAR(191) NOT NULL CHECK(scope_kind IN('obligation','company_account','order')),
 scope_id VARCHAR(191) NOT NULL,uploaded_by VARCHAR(191) NOT NULL REFERENCES users(id),object_key VARCHAR(191) NOT NULL UNIQUE,
 original_name LONGTEXT NOT NULL,mime_type VARCHAR(191) NOT NULL,size_bytes BIGINT NOT NULL CHECK(size_bytes>0 AND size_bytes<=5242880),
 content_hash VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE finance_evidence_files(id VARCHAR(191) PRIMARY KEY REFERENCES finance_evidence_intents(id),retained_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER finance_evidence_intent_no_update BEFORE UPDATE ON finance_evidence_intents FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='private_finance_evidence_retained'; END$$
CREATE OR REPLACE TRIGGER finance_evidence_intent_no_delete BEFORE DELETE ON finance_evidence_intents FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='private_finance_evidence_retained'; END$$
CREATE OR REPLACE TRIGGER finance_evidence_file_no_update BEFORE UPDATE ON finance_evidence_files FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='private_finance_evidence_retained'; END$$
CREATE OR REPLACE TRIGGER finance_evidence_file_no_delete BEFORE DELETE ON finance_evidence_files FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='private_finance_evidence_retained'; END$$
DELIMITER ;
-- Source parity for 0109_original_refund_cost_allocations. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE refund_cost_allocations(
 refund_id VARCHAR(191) NOT NULL REFERENCES refunds(id),component VARCHAR(191) NOT NULL CHECK(component IN('merchandise','original_delivery')),
 party VARCHAR(191) NOT NULL,seller_id VARCHAR(191) REFERENCES seller_profiles(id),amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0),
 policy_version VARCHAR(191) NOT NULL CHECK(policy_version='approved_original_refund_costs_v1'),created_by VARCHAR(191) NOT NULL REFERENCES users(id),created_at BIGINT NOT NULL,
 PRIMARY KEY(refund_id,component),CHECK((party='seller' AND seller_id IS NOT NULL) OR (party<>'seller' AND seller_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER refund_cost_original_capacity BEFORE INSERT ON refund_cost_allocations FOR EACH ROW BEGIN IF (NOT EXISTS(
 SELECT 1 FROM refunds r JOIN return_requests c ON c.id=r.return_request_id JOIN order_items i ON i.id=c.order_item_id WHERE r.id=NEW.refund_id
 AND NEW.amount_paisa=CASE WHEN NEW.component='merchandise' THEN r.item_amount_paisa ELSE r.delivery_amount_paisa END
 AND NEW.party=CASE WHEN NEW.component='original_delivery' AND c.reason='change_of_mind' THEN 'platform' ELSE r.liability END
 AND (NEW.party<>'seller' OR NEW.seller_id=i.seller_id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_cost_requires_original_authorization'; END IF; END$$
CREATE OR REPLACE TRIGGER refund_cost_no_update BEFORE UPDATE ON refund_cost_allocations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='original_refund_cost_retained'; END$$
CREATE OR REPLACE TRIGGER refund_cost_no_delete BEFORE DELETE ON refund_cost_allocations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='original_refund_cost_retained'; END$$
DELIMITER ;
-- Source parity for 0110_refund_original_deadlines. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE refund_obligation_deadlines(
 obligation_id VARCHAR(191) PRIMARY KEY REFERENCES refund_obligations(id),revision BIGINT NOT NULL DEFAULT 0,
 initiation_due_at BIGINT,binding_due_at BIGINT,calendar_version VARCHAR(191),
 policy_snapshot_json LONGTEXT NOT NULL CHECK(json_valid(policy_snapshot_json)),created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER refund_deadline_source_retained BEFORE UPDATE ON refund_obligation_deadlines FOR EACH ROW BEGIN IF (NEW.obligation_id<>OLD.obligation_id OR NOT (NEW.initiation_due_at <=> OLD.initiation_due_at) OR NOT (NEW.calendar_version <=> OLD.calendar_version)
 OR NEW.policy_snapshot_json<>OLD.policy_snapshot_json OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1
 OR (OLD.binding_due_at IS NOT NULL AND (NEW.binding_due_at IS NULL OR NEW.binding_due_at>OLD.binding_due_at))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='original_refund_deadline_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER refund_deadline_no_delete BEFORE DELETE ON refund_obligation_deadlines FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='original_refund_deadline_retained'; END$$
CREATE OR REPLACE TRIGGER refund_physical_binding_deadline AFTER UPDATE ON return_handling FOR EACH ROW BEGIN IF ((NEW.received_at IS NOT NULL AND NOT (NEW.received_at <=> OLD.received_at)) OR NEW.waived_quantity>OLD.waived_quantity ) THEN UPDATE refund_obligation_deadlines SET revision=revision+1,binding_due_at=
 CASE WHEN binding_due_at IS NULL OR binding_due_at>(CASE WHEN NEW.waived_quantity>0 THEN (SELECT authorized_at FROM refund_obligations WHERE id=obligation_id) ELSE NEW.received_at END)+json_extract(policy_snapshot_json,'$.completionCalendarDays')*86400000
 THEN (CASE WHEN NEW.waived_quantity>0 THEN (SELECT authorized_at FROM refund_obligations WHERE id=obligation_id) ELSE NEW.received_at END)+json_extract(policy_snapshot_json,'$.completionCalendarDays')*86400000 ELSE binding_due_at END
 WHERE obligation_id IN(SELECT o.id FROM refund_obligations o JOIN refunds r ON r.id=o.source_id WHERE o.source_kind='return_refund' AND r.return_request_id=NEW.case_id)
 AND json_extract(policy_snapshot_json,'$.completionCalendarDays')>0;
 END IF; END$$
DELIMITER ;
-- Source parity for 0111_cancellation_refund_sources. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE cancellation_refund_sources(
 id VARCHAR(191) PRIMARY KEY REFERENCES order_cancellation_events(id),order_id VARCHAR(191) NOT NULL REFERENCES orders(id),customer_id VARCHAR(191) REFERENCES users(id),
 cash_paisa BIGINT NOT NULL CHECK(cash_paisa>=0),wallet_restored_paisa BIGINT NOT NULL CHECK(wallet_restored_paisa>=0),
 revised_payable_paisa BIGINT NOT NULL CHECK(revised_payable_paisa>=0),actual_collected_paisa BIGINT NOT NULL CHECK(actual_collected_paisa>=cash_paisa),
 source_snapshot_json LONGTEXT NOT NULL CHECK(json_valid(source_snapshot_json)),state VARCHAR(191) NOT NULL DEFAULT 'authorized' CHECK(state IN('authorized','paid')),authorized_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER cancellation_refund_source_retained BEFORE UPDATE ON cancellation_refund_sources FOR EACH ROW BEGIN IF (NEW.id<>OLD.id OR NEW.order_id<>OLD.order_id OR NOT (NEW.customer_id <=> OLD.customer_id) OR NEW.cash_paisa<>OLD.cash_paisa OR NEW.wallet_restored_paisa<>OLD.wallet_restored_paisa OR NEW.revised_payable_paisa<>OLD.revised_payable_paisa OR NEW.actual_collected_paisa<>OLD.actual_collected_paisa OR NEW.source_snapshot_json<>OLD.source_snapshot_json OR NEW.authorized_at<>OLD.authorized_at OR OLD.state<>'authorized' OR NEW.state<>'paid' OR NOT EXISTS(SELECT 1 FROM refund_obligations r JOIN outgoing_payment_packets p ON p.obligation_id=r.id WHERE r.source_kind='cancellation' AND r.source_id=OLD.id AND p.state='paid' AND p.amount_paisa=OLD.cash_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cancellation_original_cash_source_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER cancellation_refund_source_no_delete BEFORE DELETE ON cancellation_refund_sources FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cancellation_original_cash_source_retained'; END$$
CREATE OR REPLACE TRIGGER cancellation_refund_source_original_event BEFORE INSERT ON cancellation_refund_sources FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM order_cancellation_events e JOIN orders o ON o.id=e.order_id WHERE e.id=NEW.id AND e.order_id=NEW.order_id AND (o.customer_id <=> NEW.customer_id) AND e.wallet_restored_paisa=NEW.wallet_restored_paisa AND e.created_at=NEW.authorized_at AND json_extract(e.next_json,'$.total')=NEW.revised_payable_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cancellation_original_event_required'; END IF; END$$
DELIMITER ;
-- Source parity for 0112_cancelled_delivery_allocations. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE order_delivery_adjustments(
 event_id VARCHAR(191) NOT NULL REFERENCES order_cancellation_events(id),order_item_id VARCHAR(191) NOT NULL REFERENCES order_items(id),order_id VARCHAR(191) NOT NULL REFERENCES orders(id),seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>=0),original_quantity BIGINT NOT NULL CHECK(original_quantity>0),policy_version VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,
 PRIMARY KEY(event_id,order_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER delivery_adjustment_original_event BEFORE INSERT ON order_delivery_adjustments FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM order_cancellation_events e JOIN order_items i ON i.order_id=e.order_id WHERE e.id=NEW.event_id AND e.order_id=NEW.order_id AND i.id=NEW.order_item_id AND i.seller_id=NEW.seller_id AND i.quantity=NEW.original_quantity AND i.fulfillment_status<>'cancelled' AND e.created_at=NEW.created_at)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_adjustment_original_event_required'; END IF; END$$
CREATE OR REPLACE TRIGGER delivery_adjustment_no_update BEFORE UPDATE ON order_delivery_adjustments FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_adjustment_history_retained'; END$$
CREATE OR REPLACE TRIGGER delivery_adjustment_no_delete BEFORE DELETE ON order_delivery_adjustments FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_adjustment_history_retained'; END$$
DELIMITER ;
-- Additive source only. Existing rows retain NULL policy provenance; never execute on canonical/live data without the later cutover instruction.
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS purpose VARCHAR(191) NULL CHECK(purpose IS NULL OR purpose='seller_earnings_payout');
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS first_finance_due_at BIGINT NULL;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS calendar_version VARCHAR(191) NULL;
DELIMITER $$
CREATE OR REPLACE TRIGGER payout_request_policy_retained BEFORE UPDATE ON payout_requests FOR EACH ROW BEGIN IF NOT (NEW.purpose <=> OLD.purpose) OR NOT (NEW.first_finance_due_at <=> OLD.first_finance_due_at) OR NOT (NEW.calendar_version <=> OLD.calendar_version) OR NEW.seller_note<>OLD.seller_note OR NEW.created_at<>OLD.created_at THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_original_request_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER payout_request_policy_complete BEFORE INSERT ON payout_requests FOR EACH ROW BEGIN IF NEW.purpose IS NOT NULL AND (NEW.first_finance_due_at IS NULL OR NEW.first_finance_due_at<>NEW.created_at+86400000 OR NEW.calendar_version IS NULL OR NEW.calendar_version<>'continuous-v1') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_original_review_target_required'; END IF; END$$
DELIMITER ;
-- Source parity for 0114_payout_transfer_packets. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE payout_transfer_packets(
 id VARCHAR(191) PRIMARY KEY, payout_model VARCHAR(191) NOT NULL CHECK(payout_model IN('registered','managed','fixed')),
 registered_payout_id VARCHAR(191) REFERENCES payouts(id), managed_payout_id VARCHAR(191) REFERENCES managed_payouts(id), supplier_payment_id VARCHAR(191) REFERENCES managed_supplier_payments(id),
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id), beneficiary_version_id VARCHAR(191) NOT NULL REFERENCES seller_beneficiary_versions(id),
 identity_revision BIGINT NOT NULL, bank_revision BIGINT NOT NULL, source_snapshot_json LONGTEXT NOT NULL CHECK(json_valid(source_snapshot_json)),
 account_version_id VARCHAR(191) NOT NULL REFERENCES company_payment_account_versions(id), funding_statement_id VARCHAR(191) NOT NULL REFERENCES company_funding_statements(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 state VARCHAR(191) NOT NULL DEFAULT 'prepared' CHECK(state IN('prepared','approved','processing','uncertain','paid','failed','void')), revision BIGINT NOT NULL DEFAULT 0,
 prepared_by VARCHAR(191) NOT NULL REFERENCES users(id), prepared_at BIGINT NOT NULL,
 approved_by VARCHAR(191) REFERENCES users(id), approved_at BIGINT, started_by VARCHAR(191) REFERENCES users(id), started_at BIGINT,
 recorded_by VARCHAR(191) REFERENCES users(id), recorded_at BIGINT, bank_at BIGINT, transaction_identity VARCHAR(191), transaction_identity_hash VARCHAR(191) UNIQUE,
 evidence_reference LONGTEXT, failure_basis VARCHAR(191) CHECK(failure_basis IN('not_sent','no_debit','debit_returned')),
 CHECK(payout_model='registered' AND registered_payout_id IS NOT NULL AND managed_payout_id IS NULL AND supplier_payment_id IS NULL OR payout_model='managed' AND registered_payout_id IS NULL AND managed_payout_id IS NOT NULL AND supplier_payment_id IS NULL OR payout_model='fixed' AND registered_payout_id IS NULL AND managed_payout_id IS NULL AND supplier_payment_id IS NOT NULL),
 CHECK(state NOT IN('approved','processing','uncertain','paid','failed') OR approved_by IS NOT NULL AND approved_at IS NOT NULL),
 CHECK(state NOT IN('processing','uncertain','paid','failed') OR started_by IS NOT NULL AND started_at IS NOT NULL),
 CHECK(state NOT IN('uncertain','paid','failed','void') OR recorded_by IS NOT NULL AND recorded_at IS NOT NULL AND length(evidence_reference)>=8),
 CHECK(state<>'paid' OR bank_at IS NOT NULL AND transaction_identity IS NOT NULL AND transaction_identity_hash IS NOT NULL),
 CHECK(state<>'failed' OR failure_basis IS NOT NULL)

,live_registered_id VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN state NOT IN('failed','void') THEN registered_payout_id ELSE NULL END) STORED,UNIQUE KEY payout_transfer_one_registered(live_registered_id)
,live_managed_id VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN state NOT IN('failed','void') THEN managed_payout_id ELSE NULL END) STORED,UNIQUE KEY payout_transfer_one_managed(live_managed_id)
,live_fixed_id VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN state NOT IN('failed','void') THEN supplier_payment_id ELSE NULL END) STORED,UNIQUE KEY payout_transfer_one_fixed(live_fixed_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE company_outgoing_bank_identities(
 identity_hash VARCHAR(191) PRIMARY KEY CHECK(length(identity_hash)=64), packet_kind VARCHAR(191) NOT NULL CHECK(packet_kind IN('refund','payout')), packet_id VARCHAR(191) NOT NULL,
 account_version_id VARCHAR(191) NOT NULL REFERENCES company_payment_account_versions(id), transaction_identity VARCHAR(191) NOT NULL, amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0), bank_at BIGINT NOT NULL, recorded_at BIGINT NOT NULL,
 UNIQUE(packet_kind,packet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO company_outgoing_bank_identities(identity_hash,packet_kind,packet_id,account_version_id,transaction_identity,amount_paisa,bank_at,recorded_at)
 SELECT transaction_identity_hash,'refund',id,account_version_id,transaction_identity,amount_paisa,bank_at,recorded_at FROM outgoing_payment_packets WHERE state='paid' AND amount_paisa>0;

DELIMITER $$
CREATE OR REPLACE TRIGGER payout_transfer_source_retained BEFORE UPDATE ON payout_transfer_packets FOR EACH ROW BEGIN IF (NOT (NEW.id <=> OLD.id) OR NOT (NEW.payout_model <=> OLD.payout_model) OR NOT (NEW.registered_payout_id <=> OLD.registered_payout_id) OR NOT (NEW.managed_payout_id <=> OLD.managed_payout_id) OR NOT (NEW.supplier_payment_id <=> OLD.supplier_payment_id) OR NOT (NEW.seller_id <=> OLD.seller_id) OR NOT (NEW.beneficiary_version_id <=> OLD.beneficiary_version_id) OR NOT (NEW.identity_revision <=> OLD.identity_revision) OR NOT (NEW.bank_revision <=> OLD.bank_revision) OR NOT (NEW.source_snapshot_json <=> OLD.source_snapshot_json) OR NOT (NEW.account_version_id <=> OLD.account_version_id) OR NOT (NEW.funding_statement_id <=> OLD.funding_statement_id) OR NOT (NEW.amount_paisa <=> OLD.amount_paisa) OR NOT (NEW.prepared_by <=> OLD.prepared_by) OR NOT (NEW.prepared_at <=> OLD.prepared_at) OR NEW.revision<>OLD.revision+1 OR OLD.started_at IS NOT NULL AND (NOT (NEW.started_at <=> OLD.started_at) OR NOT (NEW.started_by <=> OLD.started_by)) OR OLD.approved_at IS NOT NULL AND (NOT (NEW.approved_at <=> OLD.approved_at) OR NOT (NEW.approved_by <=> OLD.approved_by))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_transfer_source_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER payout_transfer_retained BEFORE DELETE ON payout_transfer_packets FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_transfer_history_retained'; END$$
CREATE OR REPLACE TRIGGER payout_transfer_transition BEFORE UPDATE ON payout_transfer_packets FOR EACH ROW BEGIN IF (NOT(OLD.state='prepared' AND NEW.state IN('approved','void') OR OLD.state='approved' AND NEW.state IN('processing','void') OR OLD.state IN('processing','uncertain') AND NEW.state IN('uncertain','paid','failed'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_transfer_transition_conflict'; END IF; END$$
CREATE OR REPLACE TRIGGER outgoing_bank_identity_retained BEFORE UPDATE ON company_outgoing_bank_identities FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='actual_bank_identity_retained'; END$$
CREATE OR REPLACE TRIGGER outgoing_bank_identity_no_delete BEFORE DELETE ON company_outgoing_bank_identities FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='actual_bank_identity_retained'; END$$
CREATE OR REPLACE TRIGGER refund_actual_bank_identity BEFORE UPDATE ON outgoing_payment_packets FOR EACH ROW BEGIN IF (NEW.state='paid' AND NEW.amount_paisa>0 AND NOT EXISTS(SELECT 1 FROM company_outgoing_bank_identities b WHERE b.identity_hash=NEW.transaction_identity_hash AND b.packet_kind='refund' AND b.packet_id=NEW.id AND b.account_version_id=NEW.account_version_id AND b.amount_paisa=NEW.amount_paisa AND b.bank_at=NEW.bank_at AND b.transaction_identity=NEW.transaction_identity)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='refund_actual_bank_identity_required'; END IF; END$$
CREATE OR REPLACE TRIGGER payout_actual_bank_identity BEFORE UPDATE ON payout_transfer_packets FOR EACH ROW BEGIN IF (NEW.state='paid' AND NOT EXISTS(SELECT 1 FROM company_outgoing_bank_identities b WHERE b.identity_hash=NEW.transaction_identity_hash AND b.packet_kind='payout' AND b.packet_id=NEW.id AND b.account_version_id=NEW.account_version_id AND b.amount_paisa=NEW.amount_paisa AND b.bank_at=NEW.bank_at AND b.transaction_identity=NEW.transaction_identity)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_actual_bank_identity_required'; END IF; END$$
CREATE OR REPLACE TRIGGER registered_actual_execution_packet BEFORE UPDATE ON payouts FOR EACH ROW BEGIN IF (NEW.status<>OLD.status AND NEW.status IN('processing','paid','failed') AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets p JOIN users u ON u.id=NEW.processed_by JOIN user_roles r ON r.user_id=u.id WHERE p.registered_payout_id=NEW.id AND p.state=NEW.status AND p.amount_paisa=NEW.amount_paisa AND u.status='active' AND r.role='super_admin' AND (CASE WHEN NEW.status='processing' THEN p.started_by ELSE p.recorded_by END)=u.id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payout_requires_actual_execution_packet'; END IF; END$$
DELIMITER ;
-- Source parity for 0115_managed_actual_execution. Disposable validation targets only; canonical/live execution remains held.


DELIMITER $$
CREATE OR REPLACE TRIGGER managed_actual_execution_packet BEFORE UPDATE ON managed_payouts FOR EACH ROW BEGIN IF (NEW.status<>OLD.status AND NEW.status IN('processing','paid','failed') AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets p JOIN users u ON u.id=CASE WHEN NEW.status='processing' THEN p.started_by ELSE p.recorded_by END JOIN user_roles r ON r.user_id=u.id WHERE p.managed_payout_id=NEW.id AND p.seller_id=NEW.seller_id AND p.state=NEW.status AND p.amount_paisa=NEW.amount_paisa AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_payout_requires_actual_execution_packet'; END IF; END$$
CREATE OR REPLACE TRIGGER fixed_actual_execution_packet BEFORE UPDATE ON managed_supplier_payments FOR EACH ROW BEGIN IF (NEW.status<>OLD.status AND NEW.status IN('paid','failed') AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets p JOIN managed_supplier_obligations o ON o.id=NEW.obligation_id JOIN users u ON u.id=p.recorded_by JOIN user_roles r ON r.user_id=u.id WHERE p.supplier_payment_id=NEW.id AND p.seller_id=o.seller_id AND p.state=NEW.status AND p.amount_paisa=NEW.amount_paisa AND u.status='active' AND r.role='super_admin')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixed_supplier_requires_actual_execution_packet'; END IF; END$$
CREATE OR REPLACE TRIGGER registered_live_instruction_retained BEFORE UPDATE ON payouts FOR EACH ROW BEGIN IF (NEW.status='rejected' AND OLD.status<>NEW.status AND EXISTS(SELECT 1 FROM payout_transfer_packets p WHERE p.registered_payout_id=NEW.id AND p.state NOT IN('void','failed'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retire_or_reconcile_original_payout_instruction_first'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_instruction_retained BEFORE UPDATE ON managed_payouts FOR EACH ROW BEGIN IF (NEW.status='cancelled' AND OLD.status<>NEW.status AND EXISTS(SELECT 1 FROM payout_transfer_packets p WHERE p.managed_payout_id=NEW.id AND p.state NOT IN('void','failed'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retire_or_reconcile_original_payout_instruction_first'; END IF; END$$
CREATE OR REPLACE TRIGGER fixed_live_instruction_retained BEFORE UPDATE ON managed_supplier_payments FOR EACH ROW BEGIN IF (NEW.status='cancelled' AND OLD.status<>NEW.status AND EXISTS(SELECT 1 FROM payout_transfer_packets p WHERE p.supplier_payment_id=NEW.id AND p.state NOT IN('void','failed'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retire_or_reconcile_original_payout_instruction_first'; END IF; END$$
DELIMITER ;
-- Source parity for 0116_seller_recovery_cases. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE seller_recovery_cases(
 id VARCHAR(191) PRIMARY KEY, source_kind VARCHAR(191) NOT NULL CHECK(source_kind IN('refund','supplier_adjustment')), source_id VARCHAR(191) NOT NULL,
 refund_id VARCHAR(191) REFERENCES refunds(id), supplier_adjustment_id VARCHAR(191) REFERENCES managed_supplier_adjustments(id),
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id), payout_model VARCHAR(191) NOT NULL CHECK(payout_model IN('registered','managed','fixed')),
 currency VARCHAR(191) NOT NULL DEFAULT 'NPR' CHECK(currency='NPR'), original_source_json LONGTEXT NOT NULL CHECK(json_valid(original_source_json)),
 exposure_paisa BIGINT NOT NULL CHECK(exposure_paisa>=0 AND exposure_paisa<=9007199254740991),
 confirmed_paisa BIGINT NOT NULL DEFAULT 0 CHECK(confirmed_paisa>=0 AND confirmed_paisa<=exposure_paisa),
 approved_cap_paisa BIGINT NOT NULL DEFAULT 0 CHECK(approved_cap_paisa>=0 AND approved_cap_paisa<=confirmed_paisa),
 absorbed_paisa BIGINT NOT NULL DEFAULT 0 CHECK(absorbed_paisa>=0 AND absorbed_paisa<=confirmed_paisa),
 disputed_paisa BIGINT NOT NULL DEFAULT 0 CHECK(disputed_paisa>=0 AND disputed_paisa<=9007199254740991),
 historical_recovered_paisa BIGINT NOT NULL DEFAULT 0 CHECK(historical_recovered_paisa>=0 AND historical_recovered_paisa<=9007199254740991),
 state VARCHAR(191) NOT NULL CHECK(state IN('provisional','awaiting_approval','open','disputed','repayment_plan','part_recovered','recovered','absorbed','reconciliation','closed_no_balance')),
 blocker LONGTEXT, approved_by VARCHAR(191) REFERENCES users(id), approved_at BIGINT, plan_json LONGTEXT CHECK(plan_json IS NULL OR json_valid(plan_json)),
 owner_id VARCHAR(191) NOT NULL REFERENCES users(id), backup_id VARCHAR(191) REFERENCES users(id), revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 first_review_due_at BIGINT NOT NULL, next_action_at BIGINT NOT NULL, created_by VARCHAR(191) NOT NULL REFERENCES users(id), created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
 UNIQUE(source_kind,source_id),
 CHECK(source_kind='refund' AND refund_id IS NOT NULL AND refund_id=source_id AND supplier_adjustment_id IS NULL AND payout_model IN('registered','managed') OR source_kind='supplier_adjustment' AND supplier_adjustment_id IS NOT NULL AND supplier_adjustment_id=source_id AND refund_id IS NULL AND payout_model='fixed'),
 CHECK(approved_cap_paisa=0 OR approved_by IS NOT NULL AND approved_at IS NOT NULL AND plan_json IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_recovery_events(
 id VARCHAR(191) PRIMARY KEY, case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id), revision BIGINT NOT NULL,
 action VARCHAR(191) NOT NULL, actor_id VARCHAR(191) NOT NULL REFERENCES users(id), reason LONGTEXT NOT NULL,
 details_json LONGTEXT NOT NULL CHECK(json_valid(details_json)), request_id VARCHAR(191) NOT NULL UNIQUE, created_at BIGINT NOT NULL,
 UNIQUE(case_id,revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX seller_recovery_owned_queue ON seller_recovery_cases(owner_id,state,next_action_at);

DELIMITER $$
CREATE OR REPLACE TRIGGER seller_recovery_source_retained BEFORE UPDATE ON seller_recovery_cases FOR EACH ROW BEGIN IF (NOT (NEW.id <=> OLD.id) OR NOT (NEW.source_kind <=> OLD.source_kind) OR NOT (NEW.source_id <=> OLD.source_id) OR NOT (NEW.refund_id <=> OLD.refund_id)
 OR NOT (NEW.supplier_adjustment_id <=> OLD.supplier_adjustment_id) OR NOT (NEW.seller_id <=> OLD.seller_id) OR NOT (NEW.payout_model <=> OLD.payout_model)
 OR NOT (NEW.currency <=> OLD.currency) OR NOT (NEW.original_source_json <=> OLD.original_source_json) OR NOT (NEW.created_by <=> OLD.created_by)
 OR NOT (NEW.created_at <=> OLD.created_at) OR NOT (NEW.first_review_due_at <=> OLD.first_review_due_at) OR NEW.revision<>OLD.revision+1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='original_recovery_source_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER seller_recovery_history_retained BEFORE DELETE ON seller_recovery_cases FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_history_retained'; END$$
CREATE OR REPLACE TRIGGER seller_recovery_event_immutable BEFORE UPDATE ON seller_recovery_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_event_retained'; END$$
CREATE OR REPLACE TRIGGER seller_recovery_event_retained BEFORE DELETE ON seller_recovery_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_event_retained'; END$$
DELIMITER ;
-- Source parity for 0117_seller_recovery_allocations. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE seller_recovery_allocations(
 id VARCHAR(191) PRIMARY KEY, case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),
 method VARCHAR(191) NOT NULL CHECK(method IN('cash','earnings','returned_payout','carrier')),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 receipt_id VARCHAR(191) REFERENCES company_money_receipts(id),
 registered_credit_id VARCHAR(191) UNIQUE REFERENCES seller_ledger_entries(id),
 managed_credit_id VARCHAR(191) UNIQUE REFERENCES managed_settlement_entries(id),
 evidence_reference LONGTEXT NOT NULL, reason LONGTEXT NOT NULL, actor_id VARCHAR(191) NOT NULL REFERENCES users(id),
 request_id VARCHAR(191) NOT NULL UNIQUE, created_at BIGINT NOT NULL,
 CHECK(method='earnings' AND receipt_id IS NULL OR method<>'earnings' AND receipt_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_recovery_reductions(
 id VARCHAR(191) PRIMARY KEY, case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 registered_credit_id VARCHAR(191) UNIQUE REFERENCES seller_ledger_entries(id), managed_credit_id VARCHAR(191) UNIQUE REFERENCES managed_settlement_entries(id),
 evidence_reference LONGTEXT NOT NULL, reason LONGTEXT NOT NULL, collection_attempts LONGTEXT NOT NULL,
 approved_by VARCHAR(191) NOT NULL REFERENCES users(id), request_id VARCHAR(191) NOT NULL UNIQUE, created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_receipt_allocations ON seller_recovery_allocations(receipt_id);

CREATE INDEX recovery_case_allocations ON seller_recovery_allocations(case_id);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_allocation_cap BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id
 AND c.state IN('open','part_recovered','repayment_plan','disputed') AND c.blocker IS NULL
 AND c.approved_by IS NOT NULL AND c.approved_cap_paisa<=c.confirmed_paisa
 AND NEW.amount_paisa<=c.approved_cap_paisa-c.absorbed_paisa-c.disputed_paisa-c.historical_recovered_paisa
 -COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_remaining_cap_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_cap BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id
 AND r.status='verified' AND r.currency='NPR'
 AND NOT EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.receipt_id=r.id AND e.kind='receipt_reversal' AND e.state<>'resolved')
 AND NEW.amount_paisa<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)
 -COALESCE((SELECT SUM(u.amount_minor) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)
 -COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_balance_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER manual_receipt_recovery_cap BEFORE INSERT ON manual_receipt_uses FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id
 AND NEW.amount_minor<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)
 -COALESCE((SELECT SUM(u.amount_minor) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)
 -COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_receipt_recovery_balance_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_native_credit_required BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_ledger_entries e ON e.id=NEW.registered_credit_id
 WHERE c.id=NEW.case_id AND e.seller_id=c.seller_id AND e.amount_paisa=NEW.amount_paisa AND e.type='recovery_settlement' AND e.refund_id IS NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_original_native_settlement_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_allocation_immutable BEFORE UPDATE ON seller_recovery_allocations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_allocation_history_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_allocation_retained BEFORE DELETE ON seller_recovery_allocations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_allocation_history_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_reduction_cap BEFORE INSERT ON seller_recovery_reductions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.blocker IS NULL
 AND c.approved_by IS NOT NULL AND c.state IN('open','part_recovered','disputed','repayment_plan')
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.historical_recovered_paisa
 -COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_reduction_remaining_cap_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_reduction_credit BEFORE INSERT ON seller_recovery_reductions FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_ledger_entries e ON e.id=NEW.registered_credit_id
 WHERE c.id=NEW.case_id AND e.seller_id=c.seller_id AND e.amount_paisa=NEW.amount_paisa AND e.type='recovery_absorption' AND e.refund_id IS NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_absorption_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_reduction_immutable BEFORE UPDATE ON seller_recovery_reductions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_reduction_history_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_reduction_retained BEFORE DELETE ON seller_recovery_reductions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_reduction_history_retained'; END$$
DELIMITER ;
-- Source parity for 0118_seller_recovery_agreements. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE seller_recovery_proposals(
 id VARCHAR(191) PRIMARY KEY, case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id), case_revision BIGINT NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id), payout_model VARCHAR(191) NOT NULL CHECK(payout_model IN('registered','managed','fixed')),
 currency VARCHAR(191) NOT NULL CHECK(currency='NPR'), amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 identity_revision BIGINT NOT NULL CHECK(identity_revision>=0), source_json LONGTEXT NOT NULL CHECK(json_valid(source_json)),
 installments_json LONGTEXT NOT NULL CHECK(json_valid(installments_json)), netting_authorized BIGINT NOT NULL CHECK(netting_authorized IN(0,1)),
 accepted_terms_json LONGTEXT NOT NULL CHECK(json_valid(accepted_terms_json)), terms_digest VARCHAR(191) NOT NULL CHECK(length(terms_digest)=64),
 contact_details LONGTEXT NOT NULL, next_review_at BIGINT NOT NULL, accepted_by VARCHAR(191) NOT NULL REFERENCES users(id), accepted_at BIGINT NOT NULL,
 request_id VARCHAR(191) NOT NULL UNIQUE, UNIQUE(case_id,case_revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE seller_recovery_allocations ADD COLUMN registered_debit_id VARCHAR(191), ADD CONSTRAINT fk_recovery_allocation_registered_debit FOREIGN KEY(registered_debit_id) REFERENCES seller_ledger_entries(id);
CREATE UNIQUE INDEX recovery_netting_debit_once ON seller_recovery_allocations(registered_debit_id);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_proposal_immutable BEFORE UPDATE ON seller_recovery_proposals FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_agreement_history_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_proposal_retained BEFORE DELETE ON seller_recovery_proposals FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_agreement_history_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_native_credit_required BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_ledger_entries e ON e.id=NEW.registered_credit_id
 WHERE c.id=NEW.case_id AND e.seller_id=c.seller_id AND e.amount_paisa=NEW.amount_paisa AND e.refund_id IS NULL
 AND (NEW.method<>'earnings' AND e.type='recovery_settlement' AND NEW.registered_debit_id IS NULL
  OR NEW.method='earnings' AND e.type='recovery_netting_relief'
   AND EXISTS(SELECT 1 FROM seller_ledger_entries d WHERE d.id=NEW.registered_debit_id AND d.seller_id=c.seller_id AND d.amount_paisa=-NEW.amount_paisa AND d.type='recovery_netting_withholding' AND d.refund_id IS NULL)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_original_native_settlement_required'; END IF; END$$
DELIMITER ;
-- Source parity for 0119_recovery_model_settlements. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE managed_supplier_recovery_credits(
 id VARCHAR(191) PRIMARY KEY, case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id), obligation_id VARCHAR(191) NOT NULL REFERENCES managed_supplier_obligations(id),
 kind VARCHAR(191) NOT NULL CHECK(kind IN('settlement','absorption','netting_relief','netting_withholding')),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa<>0 AND amount_paisa>=-9007199254740991 AND amount_paisa<=9007199254740991),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id), request_id VARCHAR(191) NOT NULL UNIQUE, created_at BIGINT NOT NULL,
 CHECK(kind='netting_withholding' AND amount_paisa<0 OR kind<>'netting_withholding' AND amount_paisa>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX fixed_recovery_obligation ON managed_supplier_recovery_credits(obligation_id);

ALTER TABLE seller_recovery_allocations ADD COLUMN fixed_credit_id VARCHAR(191), ADD CONSTRAINT fk_recovery_allocation_fixed_credit FOREIGN KEY(fixed_credit_id) REFERENCES managed_supplier_recovery_credits(id);
CREATE UNIQUE INDEX recovery_fixed_allocation_credit_once ON seller_recovery_allocations(fixed_credit_id);
ALTER TABLE seller_recovery_reductions ADD COLUMN fixed_credit_id VARCHAR(191), ADD CONSTRAINT fk_recovery_reduction_fixed_credit FOREIGN KEY(fixed_credit_id) REFERENCES managed_supplier_recovery_credits(id);
CREATE UNIQUE INDEX recovery_fixed_reduction_credit_once ON seller_recovery_reductions(fixed_credit_id);

DELIMITER $$
CREATE OR REPLACE TRIGGER fixed_recovery_credit_source BEFORE INSERT ON managed_supplier_recovery_credits FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN managed_supplier_adjustments a ON a.id=c.supplier_adjustment_id JOIN managed_supplier_obligations o ON o.id=NEW.obligation_id
 WHERE c.id=NEW.case_id AND c.payout_model='fixed' AND c.seller_id=o.seller_id AND c.currency='NPR'
 AND (NEW.kind='netting_withholding' OR a.obligation_id=o.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixed_recovery_original_model_required'; END IF; END$$
CREATE OR REPLACE TRIGGER fixed_recovery_credit_immutable BEFORE UPDATE ON managed_supplier_recovery_credits FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixed_recovery_credit_retained'; END$$
CREATE OR REPLACE TRIGGER fixed_recovery_credit_retained BEFORE DELETE ON managed_supplier_recovery_credits FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixed_recovery_credit_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_native_model_shape BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND (
 c.payout_model='registered' AND NEW.registered_credit_id IS NOT NULL AND NEW.managed_credit_id IS NULL AND NEW.fixed_credit_id IS NULL
 OR c.payout_model='managed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NOT NULL AND NEW.fixed_credit_id IS NULL AND NEW.registered_debit_id IS NULL
 OR c.payout_model='fixed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL AND NEW.fixed_credit_id IS NOT NULL AND NEW.registered_debit_id IS NULL))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_one_original_native_model_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_reduction_model_shape BEFORE INSERT ON seller_recovery_reductions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND (
 c.payout_model='registered' AND NEW.registered_credit_id IS NOT NULL AND NEW.managed_credit_id IS NULL AND NEW.fixed_credit_id IS NULL
 OR c.payout_model='managed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NOT NULL AND NEW.fixed_credit_id IS NULL
 OR c.payout_model='fixed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL AND NEW.fixed_credit_id IS NOT NULL))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_one_original_reduction_model_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_managed_credit_required BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN managed_settlement_entries x ON x.id=NEW.managed_credit_id JOIN managed_entitlements e ON e.id=x.entitlement_id
 WHERE c.id=NEW.case_id AND e.seller_id=c.seller_id AND x.refund_id=c.refund_id AND x.type='dispute_adjustment' AND x.reason_code='recovery_settlement' AND x.amount_paisa=NEW.amount_paisa
 AND EXISTS(SELECT 1 FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN managed_commercial_snapshots snapshot ON snapshot.id=e.snapshot_id WHERE r.id=c.refund_id AND request.order_item_id=snapshot.order_item_id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_recovery_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_fixed_credit_required BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='fixed')
 AND NOT EXISTS(SELECT 1 FROM managed_supplier_recovery_credits x WHERE x.id=NEW.fixed_credit_id AND x.case_id=NEW.case_id AND x.kind='settlement' AND x.amount_paisa=NEW.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixed_recovery_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_managed_reduction_credit BEFORE INSERT ON seller_recovery_reductions FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN managed_settlement_entries x ON x.id=NEW.managed_credit_id JOIN managed_entitlements e ON e.id=x.entitlement_id
 WHERE c.id=NEW.case_id AND e.seller_id=c.seller_id AND x.refund_id=c.refund_id AND x.type='dispute_adjustment' AND x.reason_code='recovery_absorption' AND x.amount_paisa=NEW.amount_paisa
 AND EXISTS(SELECT 1 FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN managed_commercial_snapshots snapshot ON snapshot.id=e.snapshot_id WHERE r.id=c.refund_id AND request.order_item_id=snapshot.order_item_id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_recovery_absorption_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_fixed_reduction_credit BEFORE INSERT ON seller_recovery_reductions FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='fixed')
 AND NOT EXISTS(SELECT 1 FROM managed_supplier_recovery_credits x WHERE x.id=NEW.fixed_credit_id AND x.case_id=NEW.case_id AND x.kind='absorption' AND x.amount_paisa=NEW.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixed_recovery_absorption_credit_required'; END IF; END$$
DELIMITER ;
-- Source parity for 0120_recovery_model_netting. Disposable validation targets only; canonical/live execution remains held.


ALTER TABLE seller_recovery_allocations ADD COLUMN managed_debit_id VARCHAR(191), ADD CONSTRAINT fk_recovery_allocation_managed_debit FOREIGN KEY(managed_debit_id) REFERENCES managed_settlement_entries(id);
CREATE UNIQUE INDEX recovery_managed_netting_debit_once ON seller_recovery_allocations(managed_debit_id);
ALTER TABLE seller_recovery_allocations ADD COLUMN fixed_debit_id VARCHAR(191), ADD CONSTRAINT fk_recovery_allocation_fixed_debit FOREIGN KEY(fixed_debit_id) REFERENCES managed_supplier_recovery_credits(id);
CREATE UNIQUE INDEX recovery_fixed_netting_debit_once ON seller_recovery_allocations(fixed_debit_id);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_native_model_shape BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND (
 c.payout_model='registered' AND NEW.registered_credit_id IS NOT NULL AND NEW.managed_credit_id IS NULL AND NEW.fixed_credit_id IS NULL AND NEW.managed_debit_id IS NULL AND NEW.fixed_debit_id IS NULL
  AND (NEW.method='earnings' AND NEW.registered_debit_id IS NOT NULL OR NEW.method<>'earnings' AND NEW.registered_debit_id IS NULL)
 OR c.payout_model='managed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NOT NULL AND NEW.fixed_credit_id IS NULL AND NEW.registered_debit_id IS NULL AND NEW.fixed_debit_id IS NULL
  AND (NEW.method='earnings' AND NEW.managed_debit_id IS NOT NULL OR NEW.method<>'earnings' AND NEW.managed_debit_id IS NULL)
 OR c.payout_model='fixed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL AND NEW.fixed_credit_id IS NOT NULL AND NEW.registered_debit_id IS NULL AND NEW.managed_debit_id IS NULL
  AND (NEW.method='earnings' AND NEW.fixed_debit_id IS NOT NULL OR NEW.method<>'earnings' AND NEW.fixed_debit_id IS NULL)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_one_original_native_model_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_managed_credit_required BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN managed_settlement_entries x ON x.id=NEW.managed_credit_id JOIN managed_entitlements e ON e.id=x.entitlement_id
 WHERE c.id=NEW.case_id AND e.seller_id=c.seller_id AND x.refund_id=c.refund_id AND x.type='dispute_adjustment' AND x.amount_paisa=NEW.amount_paisa
 AND EXISTS(SELECT 1 FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN managed_commercial_snapshots snapshot ON snapshot.id=e.snapshot_id WHERE r.id=c.refund_id AND request.order_item_id=snapshot.order_item_id)
 AND (NEW.method<>'earnings' AND x.reason_code='recovery_settlement'
  OR NEW.method='earnings' AND x.reason_code='recovery_netting_relief' AND EXISTS(SELECT 1 FROM managed_settlement_entries debit JOIN managed_entitlements future ON future.id=debit.entitlement_id
   WHERE debit.id=NEW.managed_debit_id AND debit.type='dispute_adjustment' AND debit.reason_code='recovery_netting_withholding' AND debit.refund_id IS NULL AND debit.amount_paisa=-NEW.amount_paisa AND future.seller_id=c.seller_id)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_recovery_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_fixed_credit_required BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='fixed')
 AND NOT EXISTS(SELECT 1 FROM managed_supplier_recovery_credits x WHERE x.id=NEW.fixed_credit_id AND x.case_id=NEW.case_id AND x.amount_paisa=NEW.amount_paisa
  AND (NEW.method<>'earnings' AND x.kind='settlement'
   OR NEW.method='earnings' AND x.kind='netting_relief' AND EXISTS(SELECT 1 FROM managed_supplier_recovery_credits debit
     WHERE debit.id=NEW.fixed_debit_id AND debit.case_id=NEW.case_id AND debit.kind='netting_withholding' AND debit.amount_paisa=-NEW.amount_paisa)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixed_recovery_native_credit_required'; END IF; END$$
DELIMITER ;
-- Source parity for 0121_recovery_contact_clocks. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE seller_recovery_contacts(
 id VARCHAR(191) PRIMARY KEY, case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id), notice_request_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_events(request_id),
 inbox_message_id VARCHAR(191) NOT NULL REFERENCES notification_messages(id), email_message_id VARCHAR(191) REFERENCES notification_messages(id),
 method VARCHAR(191) NOT NULL CHECK(method IN('provider_handoff','staff_contact')), actor_id VARCHAR(191) REFERENCES users(id), actual_at BIGINT NOT NULL,
 evidence_reference LONGTEXT NOT NULL, reason LONGTEXT NOT NULL, request_id VARCHAR(191) NOT NULL UNIQUE, recorded_at BIGINT NOT NULL,
 CHECK(actual_at>=0 AND actual_at<=recorded_at),
 CHECK(method='provider_handoff' AND email_message_id IS NOT NULL AND actor_id IS NULL OR method='staff_contact' AND email_message_id IS NULL AND actor_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_recovery_contact_windows(
 case_id VARCHAR(191) PRIMARY KEY REFERENCES seller_recovery_cases(id), contact_id VARCHAR(191) NOT NULL UNIQUE REFERENCES seller_recovery_contacts(id),
 started_at BIGINT NOT NULL, reminder_at BIGINT NOT NULL, response_due_at BIGINT NOT NULL, review_due_at BIGINT NOT NULL, calendar_version VARCHAR(191) NOT NULL,
 CHECK(reminder_at=started_at+259200000 AND response_due_at=started_at+604800000 AND review_due_at>=response_due_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE notification_messages ADD COLUMN delivery_transport VARCHAR(191) CHECK(delivery_transport IS NULL OR delivery_transport IN('capture','provider'));

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_contact_original_notice BEFORE INSERT ON seller_recovery_contacts FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id JOIN seller_recovery_events e ON e.case_id=c.id
 JOIN notification_messages inbox ON inbox.id=NEW.inbox_message_id
 WHERE c.id=NEW.case_id AND e.request_id=NEW.notice_request_id AND e.action='approved' AND e.created_at<=NEW.actual_at
 AND inbox.recipient_user_id=s.user_id AND inbox.channel='in_app' AND inbox.related_type='seller_recovery' AND inbox.related_id=c.id AND inbox.template_key='business.seller.recovery'
 AND (NEW.method='staff_contact' AND NEW.actor_id<>s.user_id OR NEW.method='provider_handoff' AND EXISTS(SELECT 1 FROM notification_messages email
  WHERE email.id=NEW.email_message_id AND email.recipient_user_id=s.user_id AND email.channel='email' AND email.related_type='seller_recovery' AND email.related_id=c.id
  AND email.template_key=inbox.template_key AND email.status='sent' AND email.delivery_transport='provider' AND email.sent_at=NEW.actual_at)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_real_itemized_contact_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_contact_immutable BEFORE UPDATE ON seller_recovery_contacts FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_contact_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_contact_retained BEFORE DELETE ON seller_recovery_contacts FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_contact_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_contact_window_proof BEFORE INSERT ON seller_recovery_contact_windows FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_contacts contact JOIN notification_messages inbox ON inbox.id=contact.inbox_message_id
 WHERE contact.id=NEW.contact_id AND contact.case_id=NEW.case_id AND NEW.started_at>=contact.actual_at AND NEW.started_at>=inbox.created_at
 AND (NEW.started_at=contact.actual_at OR NEW.started_at=inbox.created_at))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_contact_window_proof_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_contact_window_immutable BEFORE UPDATE ON seller_recovery_contact_windows FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_contact_clock_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_contact_window_retained BEFORE DELETE ON seller_recovery_contact_windows FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_contact_clock_retained'; END$$
DELIMITER ;
-- Source parity for 0122_recovery_repayment_claims. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE seller_recovery_repayment_claims(
 id VARCHAR(191) PRIMARY KEY, case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id), submitted_by VARCHAR(191) NOT NULL REFERENCES users(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 payment_reference VARCHAR(191) NOT NULL, claimed_at BIGINT NOT NULL, account_version_id VARCHAR(191) REFERENCES company_payment_account_versions(id),
 evidence_reference LONGTEXT, note LONGTEXT NOT NULL, fingerprint VARCHAR(191) NOT NULL,
 status VARCHAR(191) NOT NULL CHECK(status IN('submitted','needs_evidence','receipt_verified','not_received')),
 revision BIGINT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, first_review_due_at BIGINT NOT NULL, next_review_at BIGINT,
 receipt_id VARCHAR(191) REFERENCES company_money_receipts(id), receipt_revision BIGINT, public_message LONGTEXT,
 reviewed_by VARCHAR(191) REFERENCES users(id), reviewed_at BIGINT, operation_request_id VARCHAR(191) NOT NULL UNIQUE,
 UNIQUE(case_id,fingerprint), UNIQUE(receipt_id), CHECK(claimed_at<=created_at), CHECK(first_review_due_at>=created_at),
 CHECK(status IN('submitted','needs_evidence') AND next_review_at IS NOT NULL OR status IN('receipt_verified','not_received') AND next_review_at IS NULL),
 CHECK(status='receipt_verified' AND receipt_id IS NOT NULL AND receipt_revision IS NOT NULL OR status<>'receipt_verified' AND receipt_id IS NULL AND receipt_revision IS NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_recovery_claim_events(
 id VARCHAR(191) PRIMARY KEY, claim_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_repayment_claims(id), revision BIGINT NOT NULL,
 action VARCHAR(191) NOT NULL, actor_id VARCHAR(191) NOT NULL REFERENCES users(id), reason LONGTEXT NOT NULL, details_json LONGTEXT NOT NULL CHECK(json_valid(details_json)),
 request_id VARCHAR(191) NOT NULL UNIQUE, created_at BIGINT NOT NULL, UNIQUE(claim_id,revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_claims_case ON seller_recovery_repayment_claims(case_id,created_at);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_claim_original_owner BEFORE INSERT ON seller_recovery_repayment_claims FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id JOIN users u ON u.id=s.user_id
 WHERE c.id=NEW.case_id AND s.user_id=NEW.submitted_by AND JSON_VALUE(c.original_source_json,'$.ownerId')=NEW.submitted_by AND u.status='active')
 OR NEW.status<>'submitted' OR NEW.revision<>0 OR NEW.receipt_id IS NOT NULL) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_claim_original_owner_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_claim_original_retained BEFORE UPDATE ON seller_recovery_repayment_claims FOR EACH ROW BEGIN IF (NOT (NEW.id <=> OLD.id) OR NOT (NEW.case_id <=> OLD.case_id) OR NOT (NEW.submitted_by <=> OLD.submitted_by) OR NOT (NEW.amount_paisa <=> OLD.amount_paisa)
 OR NOT (NEW.payment_reference <=> OLD.payment_reference) OR NOT (NEW.claimed_at <=> OLD.claimed_at) OR NOT (NEW.account_version_id <=> OLD.account_version_id)
 OR NOT (NEW.evidence_reference <=> OLD.evidence_reference) OR NOT (NEW.note <=> OLD.note) OR NOT (NEW.fingerprint <=> OLD.fingerprint)
 OR NOT (NEW.created_at <=> OLD.created_at) OR NOT (NEW.first_review_due_at <=> OLD.first_review_due_at) OR NEW.revision<>OLD.revision+1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_claim_original_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_claim_verified_receipt BEFORE UPDATE ON seller_recovery_repayment_claims FOR EACH ROW BEGIN IF (NEW.status='receipt_verified' AND NOT EXISTS(SELECT 1 FROM company_money_receipts r JOIN company_receipt_controls control ON control.receipt_id=r.id WHERE r.id=NEW.receipt_id AND control.revision=NEW.receipt_revision
 AND r.kind='bank_credit' AND r.status='verified' AND r.currency='NPR' AND r.amount_minor=NEW.amount_paisa AND r.payer_user_id=NEW.submitted_by
 AND (NEW.account_version_id IS NULL OR r.account_version_id=NEW.account_version_id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=r.id AND conflict.user_id=NEW.reviewed_by)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversal WHERE reversal.receipt_id=r.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_claim_actual_attributed_receipt_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_claim_retained BEFORE DELETE ON seller_recovery_repayment_claims FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_claim_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_claim_event_immutable BEFORE UPDATE ON seller_recovery_claim_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_claim_event_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_claim_event_retained BEFORE DELETE ON seller_recovery_claim_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_claim_event_retained'; END$$
DELIMITER ;
-- Source only; no database execution.
ALTER TABLE seller_recovery_cases ADD COLUMN liability_reduced_paisa BIGINT NOT NULL DEFAULT 0 CHECK(liability_reduced_paisa>=0 AND liability_reduced_paisa<=9007199254740991);
ALTER TABLE seller_recovery_cases ADD COLUMN restored_paisa BIGINT NOT NULL DEFAULT 0 CHECK(restored_paisa>=0 AND restored_paisa<=9007199254740991);
-- Source parity for 0123_recovery_liability_corrections. Disposable validation targets only; canonical/live execution remains held.
CREATE TABLE seller_recovery_liability_corrections(
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 old_confirmed_paisa BIGINT NOT NULL,new_confirmed_paisa BIGINT NOT NULL,
 old_absorbed_paisa BIGINT NOT NULL,new_absorbed_paisa BIGINT NOT NULL,
 native_credit_paisa BIGINT NOT NULL,restored_paisa BIGINT NOT NULL,
 registered_credit_id VARCHAR(191) UNIQUE REFERENCES seller_ledger_entries(id),managed_credit_id VARCHAR(191) UNIQUE REFERENCES managed_settlement_entries(id),
 fixed_obligation_id VARCHAR(191) REFERENCES managed_supplier_obligations(id),
 evidence_reference LONGTEXT NOT NULL,reason LONGTEXT NOT NULL,public_message LONGTEXT NOT NULL,
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,review_due_at BIGINT NOT NULL,
 UNIQUE(case_id,case_revision),
 CHECK(new_confirmed_paisa>=0 AND new_confirmed_paisa<old_confirmed_paisa AND old_confirmed_paisa<=9007199254740991),
 CHECK(old_absorbed_paisa>=0 AND old_absorbed_paisa<=old_confirmed_paisa AND new_absorbed_paisa=CASE WHEN old_absorbed_paisa<new_confirmed_paisa THEN old_absorbed_paisa ELSE new_confirmed_paisa END),
 CHECK(native_credit_paisa=old_confirmed_paisa-old_absorbed_paisa-new_confirmed_paisa+new_absorbed_paisa),
 CHECK(restored_paisa>=0 AND restored_paisa<=native_credit_paisa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_recovery_restorations(
 id VARCHAR(191) PRIMARY KEY,correction_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_liability_corrections(id),case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),
 allocation_id VARCHAR(191) REFERENCES seller_recovery_allocations(id),method VARCHAR(191) NOT NULL CHECK(method IN('cash','earnings','returned_payout','carrier')),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 UNIQUE(correction_id,allocation_id),CHECK(allocation_id IS NOT NULL OR method='earnings'),
 historical_correction_id VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN allocation_id IS NULL THEN correction_id ELSE NULL END) STORED,
 UNIQUE KEY recovery_historical_restoration_once(historical_correction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_correction_fixed_source ON seller_recovery_liability_corrections(fixed_obligation_id);

CREATE INDEX recovery_restored_allocation ON seller_recovery_restorations(allocation_id);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_correction_current_source BEFORE INSERT ON seller_recovery_liability_corrections FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision
 AND c.confirmed_paisa=NEW.old_confirmed_paisa AND c.absorbed_paisa=NEW.old_absorbed_paisa AND c.blocker IS NULL
 AND NEW.restored_paisa=GREATEST(0,c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa-NEW.new_confirmed_paisa+NEW.new_absorbed_paisa)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (r.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals v WHERE v.receipt_id=r.id)))
 AND (
  c.payout_model='registered' AND NEW.managed_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL AND
   (NEW.native_credit_paisa=0 AND NEW.registered_credit_id IS NULL OR EXISTS(SELECT 1 FROM seller_ledger_entries e WHERE e.id=NEW.registered_credit_id AND e.seller_id=c.seller_id AND e.type='recovery_correction' AND e.refund_id IS NULL AND e.amount_paisa=NEW.native_credit_paisa))
  OR c.payout_model='managed' AND NEW.registered_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL AND
   (NEW.native_credit_paisa=0 AND NEW.managed_credit_id IS NULL OR EXISTS(SELECT 1 FROM managed_settlement_entries e JOIN managed_entitlements entitlement ON entitlement.id=e.entitlement_id WHERE e.id=NEW.managed_credit_id AND entitlement.seller_id=c.seller_id AND e.refund_id=c.refund_id AND e.reason_code='recovery_correction' AND e.type='dispute_adjustment' AND e.amount_paisa=NEW.native_credit_paisa))
  OR c.payout_model='fixed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL AND EXISTS(SELECT 1 FROM managed_supplier_adjustments a JOIN managed_supplier_obligations o ON o.id=a.obligation_id WHERE a.id=c.supplier_adjustment_id AND o.id=NEW.fixed_obligation_id AND o.seller_id=c.seller_id)
 ))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_correction_current_original_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_restoration_source BEFORE INSERT ON seller_recovery_restorations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections correction JOIN seller_recovery_cases c ON c.id=correction.case_id
 WHERE correction.id=NEW.correction_id AND c.id=NEW.case_id AND c.revision=correction.case_revision
 AND NEW.amount_paisa<=correction.restored_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.correction_id=correction.id),0)
 AND (NEW.allocation_id IS NULL AND NEW.method='earnings' AND NEW.amount_paisa<=c.historical_recovered_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.case_id=c.id AND r.allocation_id IS NULL),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.case_id=c.id AND a.method=NEW.method AND NEW.amount_paisa<=a.amount_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.allocation_id=a.id),0))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_restoration_original_collection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_correction_projection BEFORE UPDATE ON seller_recovery_cases FOR EACH ROW BEGIN IF (NEW.liability_reduced_paisa<>COALESCE((SELECT SUM(x.old_confirmed_paisa-x.new_confirmed_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)
 OR NEW.restored_paisa<>COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id AND x.restored_paisa<>COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.correction_id=x.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_correction_complete_projection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_correction_immutable BEFORE UPDATE ON seller_recovery_liability_corrections FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_correction_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_correction_retained BEFORE DELETE ON seller_recovery_liability_corrections FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_correction_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_restoration_immutable BEFORE UPDATE ON seller_recovery_restorations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_restoration_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_restoration_retained BEFORE DELETE ON seller_recovery_restorations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_restoration_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_allocation_cap BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id
 AND c.state IN('open','part_recovered','repayment_plan','disputed') AND c.blocker IS NULL
 AND c.approved_by IS NOT NULL AND c.approved_cap_paisa<=c.confirmed_paisa
 AND NEW.amount_paisa<=c.approved_cap_paisa-c.absorbed_paisa-c.disputed_paisa-c.historical_recovered_paisa+c.restored_paisa
 -COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_remaining_cap_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_reduction_cap BEFORE INSERT ON seller_recovery_reductions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.blocker IS NULL
 AND c.approved_by IS NOT NULL AND c.state IN('open','part_recovered','disputed','repayment_plan')
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.historical_recovered_paisa+c.restored_paisa
 -COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_reduction_remaining_cap_exceeded'; END IF; END$$
DELIMITER ;
-- Source parity for 0124. Canonical and live execution remain held.
ALTER TABLE seller_recovery_claim_events ADD COLUMN case_revision BIGINT CHECK(case_revision IS NULL OR case_revision>=0);

CREATE TABLE seller_recovery_response_windows (
 id VARCHAR(191) PRIMARY KEY, case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),
 approval_event_id VARCHAR(191) NOT NULL UNIQUE REFERENCES seller_recovery_events(id),
 contact_id VARCHAR(191) NOT NULL UNIQUE REFERENCES seller_recovery_contacts(id),
 started_at BIGINT NOT NULL, reminder_at BIGINT NOT NULL, response_due_at BIGINT NOT NULL,
 review_due_at BIGINT NOT NULL, calendar_version VARCHAR(191) NOT NULL,
 CHECK(reminder_at=started_at+259200000 AND response_due_at=started_at+604800000 AND review_due_at>=response_due_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_response_case ON seller_recovery_response_windows(case_id);

ALTER TABLE seller_recovery_repayment_claims ADD COLUMN case_revision BIGINT CHECK(case_revision IS NULL OR case_revision>=0);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_claim_evidence_response_revision BEFORE INSERT ON seller_recovery_claim_events FOR EACH ROW BEGIN IF (NEW.action='evidence_supplied' AND (NEW.case_revision IS NULL OR NOT EXISTS(SELECT 1 FROM seller_recovery_repayment_claims q JOIN seller_recovery_cases c ON c.id=q.case_id WHERE q.id=NEW.claim_id AND c.revision=NEW.case_revision))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_evidence_current_case_revision_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_response_current_notice BEFORE INSERT ON seller_recovery_response_windows FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_events e JOIN seller_recovery_contacts contact ON contact.notice_request_id=e.request_id
 JOIN notification_messages inbox ON inbox.id=contact.inbox_message_id
 WHERE e.id=NEW.approval_event_id AND e.case_id=NEW.case_id AND e.action='approved' AND contact.id=NEW.contact_id AND contact.case_id=e.case_id
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_events later WHERE later.case_id=e.case_id AND later.action='approved' AND later.revision>e.revision)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_contact_windows prior_window JOIN seller_recovery_contacts prior ON prior.id=prior_window.contact_id WHERE prior_window.case_id=e.case_id AND prior.notice_request_id=e.request_id)
 AND NEW.started_at>=contact.actual_at AND NEW.started_at>=inbox.created_at AND (NEW.started_at=contact.actual_at OR NEW.started_at=inbox.created_at))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_current_response_notice_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_response_window_immutable BEFORE UPDATE ON seller_recovery_response_windows FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_response_clock_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_response_window_retained BEFORE DELETE ON seller_recovery_response_windows FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_response_clock_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_claim_current_response_revision BEFORE INSERT ON seller_recovery_repayment_claims FOR EACH ROW BEGIN IF (NEW.case_revision IS NULL OR NOT EXISTS(SELECT 1 FROM seller_recovery_cases WHERE id=NEW.case_id AND revision=NEW.case_revision)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_claim_current_case_revision_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_claim_response_revision_retained BEFORE UPDATE ON seller_recovery_repayment_claims FOR EACH ROW BEGIN IF (NOT(NEW.case_revision<=>OLD.case_revision)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_claim_response_revision_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_contact_original_notice BEFORE INSERT ON seller_recovery_contacts FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id JOIN seller_recovery_events e ON e.case_id=c.id
 JOIN notification_messages inbox ON inbox.id=NEW.inbox_message_id
 WHERE c.id=NEW.case_id AND e.request_id=NEW.notice_request_id AND e.action='approved' AND e.created_at<=NEW.actual_at
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_events later WHERE later.case_id=e.case_id AND later.action='approved' AND later.revision>e.revision)
 AND (JSON_UNQUOTE(JSON_EXTRACT(e.details_json,'$.responseNotice.inbox')) IS NULL OR inbox.request_id=JSON_UNQUOTE(JSON_EXTRACT(e.details_json,'$.responseNotice.inbox')))
 AND inbox.recipient_user_id=s.user_id AND inbox.channel='in_app' AND inbox.related_type='seller_recovery' AND inbox.related_id=c.id AND inbox.template_key='business.seller.recovery'
 AND (NEW.method='staff_contact' AND NEW.actor_id<>s.user_id OR NEW.method='provider_handoff' AND EXISTS(SELECT 1 FROM notification_messages email
  WHERE email.id=NEW.email_message_id AND email.recipient_user_id=s.user_id AND email.channel='email' AND email.related_type='seller_recovery' AND email.related_id=c.id
  AND email.template_key=inbox.template_key AND email.status='sent' AND email.delivery_transport='provider' AND email.sent_at=NEW.actual_at
  AND (JSON_UNQUOTE(JSON_EXTRACT(e.details_json,'$.responseNotice.email')) IS NULL OR email.request_id=JSON_UNQUOTE(JSON_EXTRACT(e.details_json,'$.responseNotice.email'))))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_real_itemized_contact_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_contact_window_proof BEFORE INSERT ON seller_recovery_contact_windows FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_contacts contact JOIN notification_messages inbox ON inbox.id=contact.inbox_message_id
 WHERE NOT EXISTS(SELECT 1 FROM seller_recovery_response_windows modern JOIN seller_recovery_events approval ON approval.id=modern.approval_event_id WHERE modern.case_id=NEW.case_id AND approval.request_id=contact.notice_request_id) AND contact.id=NEW.contact_id AND contact.case_id=NEW.case_id AND NEW.started_at>=contact.actual_at AND NEW.started_at>=inbox.created_at
 AND (NEW.started_at=contact.actual_at OR NEW.started_at=inbox.created_at))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_contact_window_proof_required'; END IF; END$$
DELIMITER ;
-- Generated source parity for 0125. Canonical and live execution remain held.
CREATE TABLE seller_recovery_historical_attributions (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),refund_id VARCHAR(191) NOT NULL REFERENCES refunds(id),
 kind VARCHAR(191) NOT NULL CHECK(kind IN('registered_refund_group','managed_allocation','managed_legacy_group')),
 payout_id VARCHAR(191) NOT NULL,scope_id VARCHAR(191) NOT NULL,
 native_deduction_paisa BIGINT NOT NULL CHECK(native_deduction_paisa>0 AND native_deduction_paisa<=9007199254740991),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=native_deduction_paisa),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,
 UNIQUE(case_id,case_revision)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_historical_shared_pool ON seller_recovery_historical_attributions(kind,payout_id,scope_id);

CREATE INDEX recovery_historical_case ON seller_recovery_historical_attributions(case_id);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_historical_native_source BEFORE INSERT ON seller_recovery_historical_attributions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id
 AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.refund_id=NEW.refund_id
 AND (c.payout_model='registered' AND NEW.kind='registered_refund_group' AND EXISTS(SELECT 1 FROM (SELECT * FROM (
  SELECT 'registered_refund_group' AS kind,p.id AS payoutId,NEW.refund_id AS scopeId,
   -SUM(x.amount_paisa)-COALESCE((SELECT SUM(credit.amount_paisa)
    FROM payout_entries included JOIN seller_ledger_entries credit ON credit.id=included.ledger_entry_id
    WHERE included.payout_id=p.id AND included.released_at IS NULL AND credit.seller_id=p.seller_id
     AND (credit.type='recovery_source_compensation' AND credit.refund_id=NEW.refund_id OR EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.refund_id=NEW.refund_id AND (
      EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id)
      OR EXISTS(SELECT 1 FROM seller_recovery_reductions a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id)
      OR EXISTS(SELECT 1 FROM seller_recovery_liability_corrections a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id))))),0) AS capacityPaisa,
   ((SELECT COUNT(*) FROM payout_transfer_packets t
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa
   AND bank.account_version_id=t.account_version_id
  WHERE t.registered_payout_id=p.id AND t.payout_model='registered' AND t.seller_id=p.seller_id
   AND t.state='paid' AND t.amount_paisa=p.amount_paisa)=1
    AND (SELECT SUM(entry.amount_paisa) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type<>'payout')=p.amount_paisa
    AND (SELECT COUNT(*) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type='payout')=1
    AND EXISTS(SELECT 1 FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type='payout' AND entry.payout_id=p.id AND entry.amount_paisa=-p.amount_paisa)
    AND NOT EXISTS(SELECT 1 FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.seller_id<>p.seller_id)) AS nativeProof
  FROM seller_ledger_entries x JOIN payout_entries pe ON pe.ledger_entry_id=x.id JOIN payouts p ON p.id=pe.payout_id
  WHERE x.refund_id=NEW.refund_id AND x.seller_id=NEW.seller_id AND p.seller_id=NEW.seller_id
   AND x.type IN('refund','commission_reversal') AND pe.released_at IS NULL AND p.status='paid'
  GROUP BY p.id,p.seller_id,p.amount_paisa
 ) historical_candidates WHERE capacityPaisa>0) native_source
 WHERE native_source.kind=NEW.kind AND native_source.payoutId=NEW.payout_id AND native_source.scopeId=NEW.scope_id
 AND native_source.capacityPaisa=NEW.native_deduction_paisa AND native_source.nativeProof=1)
 OR c.payout_model='managed' AND NEW.kind IN('managed_allocation','managed_legacy_group') AND EXISTS(SELECT 1 FROM (SELECT * FROM (
  SELECT 'managed_allocation' AS kind,p.id AS payoutId,a.entitlement_id AS scopeId,-a.amount_paisa AS capacityPaisa,((SELECT COUNT(*) FROM payout_transfer_packets t
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa
   AND bank.account_version_id=t.account_version_id
  WHERE t.managed_payout_id=p.id AND t.payout_model='managed' AND t.seller_id=p.seller_id
   AND t.state='paid' AND t.amount_paisa=p.amount_paisa)=1
  AND COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.disposition='paid'),0)
   +COALESCE((SELECT SUM(entry.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    WHERE included.payout_id=p.id AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=entry.entitlement_id AND a.disposition='paid')),0)=p.amount_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a JOIN managed_entitlements e ON e.id=a.entitlement_id
    WHERE a.payout_id=p.id AND a.disposition='paid' AND e.seller_id<>p.seller_id)
  AND NOT EXISTS(SELECT 1 FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    JOIN managed_entitlements e ON e.id=entry.entitlement_id WHERE included.payout_id=p.id AND e.seller_id<>p.seller_id)) AS nativeProof
  FROM managed_payout_allocations a JOIN managed_payouts p ON p.id=a.payout_id
  WHERE a.amount_paisa<0 AND a.disposition='paid' AND p.status='paid' AND p.seller_id=NEW.seller_id
   AND EXISTS(SELECT 1 FROM managed_settlement_entries x WHERE x.entitlement_id=a.entitlement_id AND x.refund_id=NEW.refund_id)
  UNION ALL
  SELECT 'managed_legacy_group' AS kind,p.id AS payoutId,NEW.refund_id AS scopeId,-SUM(x.amount_paisa) AS capacityPaisa,((SELECT COUNT(*) FROM payout_transfer_packets t
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa
   AND bank.account_version_id=t.account_version_id
  WHERE t.managed_payout_id=p.id AND t.payout_model='managed' AND t.seller_id=p.seller_id
   AND t.state='paid' AND t.amount_paisa=p.amount_paisa)=1
  AND COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.disposition='paid'),0)
   +COALESCE((SELECT SUM(entry.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    WHERE included.payout_id=p.id AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=entry.entitlement_id AND a.disposition='paid')),0)=p.amount_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a JOIN managed_entitlements e ON e.id=a.entitlement_id
    WHERE a.payout_id=p.id AND a.disposition='paid' AND e.seller_id<>p.seller_id)
  AND NOT EXISTS(SELECT 1 FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    JOIN managed_entitlements e ON e.id=entry.entitlement_id WHERE included.payout_id=p.id AND e.seller_id<>p.seller_id)) AS nativeProof
  FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id JOIN managed_payouts p ON p.id=pe.payout_id
  WHERE x.refund_id=NEW.refund_id AND p.seller_id=NEW.seller_id AND p.status='paid'
   AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=x.entitlement_id AND a.disposition='paid')
  GROUP BY p.id,p.seller_id,p.amount_paisa
 ) historical_candidates WHERE capacityPaisa>0) native_source
 WHERE native_source.kind=NEW.kind AND native_source.payoutId=NEW.payout_id AND native_source.scopeId=NEW.scope_id
 AND native_source.capacityPaisa=NEW.native_deduction_paisa AND native_source.nativeProof=1)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_actual_native_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_historical_shared_cap BEFORE INSERT ON seller_recovery_historical_attributions FOR EACH ROW BEGIN IF (NEW.amount_paisa>NEW.native_deduction_paisa-COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_historical_attributions h WHERE h.kind=NEW.kind AND h.payout_id=NEW.payout_id AND h.scope_id=NEW.scope_id),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_shared_capacity_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_historical_immutable BEFORE UPDATE ON seller_recovery_historical_attributions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_attribution_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_historical_retained BEFORE DELETE ON seller_recovery_historical_attributions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_attribution_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_historical_opening BEFORE INSERT ON seller_recovery_cases FOR EACH ROW BEGIN IF (NEW.historical_recovered_paisa<>0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_explicit_attribution_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_historical_projection BEFORE UPDATE ON seller_recovery_cases FOR EACH ROW BEGIN IF (NEW.historical_recovered_paisa<>COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_historical_attributions h WHERE h.case_id=NEW.id),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_exact_projection_required'; END IF; END$$
DELIMITER ;
-- Source parity for 0126. Canonical and live execution remain held.
CREATE TABLE seller_recovery_source_reviews (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL UNIQUE REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 kind VARCHAR(191) NOT NULL CHECK(kind='company_compensation'),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 registered_credit_id VARCHAR(191) UNIQUE REFERENCES seller_ledger_entries(id),managed_credit_id VARCHAR(191) UNIQUE REFERENCES managed_settlement_entries(id),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,
 CHECK(registered_credit_id IS NOT NULL AND managed_credit_id IS NULL OR registered_credit_id IS NULL AND managed_credit_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_source_compensation_proof BEFORE INSERT ON seller_recovery_source_reviews FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN refunds r ON r.id=c.refund_id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.confirmed_paisa=0 AND c.approved_cap_paisa=0
 AND c.historical_recovered_paisa=0 AND c.absorbed_paisa=0 AND c.restored_paisa=0 AND r.status='paid'
 AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
  WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
  AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))
 AND EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id)
 AND NOT EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=c.seller_id AND cost.amount_paisa>0)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id)
 AND (
  c.payout_model='registered' AND NEW.managed_credit_id IS NULL
   AND NEW.amount_paisa=(SELECT -SUM(e.amount_paisa) FROM seller_ledger_entries e WHERE e.refund_id=c.refund_id AND e.seller_id=c.seller_id AND e.type='refund')
   AND EXISTS(SELECT 1 FROM seller_ledger_entries credit JOIN return_requests request ON request.id=r.return_request_id
    WHERE credit.id=NEW.registered_credit_id AND credit.seller_id=c.seller_id AND credit.order_item_id=request.order_item_id
    AND credit.type='recovery_source_compensation' AND credit.amount_paisa=NEW.amount_paisa AND credit.refund_id=c.refund_id)
  OR c.payout_model='managed' AND NEW.registered_credit_id IS NULL
   AND EXISTS(SELECT 1 FROM managed_settlement_entries credit JOIN managed_entitlements e ON e.id=credit.entitlement_id
    WHERE credit.id=NEW.managed_credit_id AND e.seller_id=c.seller_id AND credit.refund_id=c.refund_id
    AND credit.type='dispute_adjustment' AND credit.reason_code='refund_responsibility' AND credit.amount_paisa=NEW.amount_paisa
    AND credit.request_id=NEW.request_id AND credit.created_by=NEW.actor_id
    AND NEW.amount_paisa=(SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=c.refund_id AND x.type='refund_adjustment')
    AND NOT EXISTS(SELECT 1 FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=c.refund_id AND x.reason_code='refund_responsibility' AND x.id<>credit.id))
 ))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_original_company_compensation_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_source_review_immutable BEFORE UPDATE ON seller_recovery_source_reviews FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_source_review_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_source_review_retained BEFORE DELETE ON seller_recovery_source_reviews FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_source_review_retained'; END$$
DELIMITER ;
-- Generated source parity for 0127. Canonical and live execution remain held.
CREATE TABLE seller_recovery_unpaid_sources (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL UNIQUE REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),refund_id VARCHAR(191) NOT NULL UNIQUE REFERENCES refunds(id),
 order_item_id VARCHAR(191) NOT NULL REFERENCES order_items(id),scope_id VARCHAR(191) NOT NULL,
 basis_paisa BIGINT NOT NULL CHECK(basis_paisa>0 AND basis_paisa<=9007199254740991),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>=0 AND amount_paisa<=basis_paisa),
 remaining_paisa BIGINT NOT NULL CHECK(remaining_paisa>=0 AND remaining_paisa<=9007199254740991),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),actor_id VARCHAR(191) NOT NULL REFERENCES users(id),
 request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_unpaid_original_scope ON seller_recovery_unpaid_sources(seller_id,order_item_id);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_unpaid_native_proof BEFORE INSERT ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id
 AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.refund_id=NEW.refund_id
 AND c.confirmed_paisa=0 AND c.approved_cap_paisa=0 AND c.historical_recovered_paisa=0 AND c.absorbed_paisa=0 AND c.restored_paisa=0
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews x WHERE x.case_id=c.id)
 AND (c.payout_model='registered' AND EXISTS(SELECT 1 FROM (SELECT i.id AS orderItemId,i.id AS scopeId,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0) AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND (x.amount_paisa<0 OR x.type IN('sale','commission','refund','commission_reversal','reserve_release'))),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id

  WHERE r.id=NEW.refund_id AND i.seller_id=NEW.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0))>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND (x.amount_paisa<0 OR x.type IN('sale','commission','refund','commission_reversal','reserve_release'))),0))>=0
  AND NOT EXISTS(SELECT 1 FROM payout_entries pe JOIN seller_ledger_entries x ON x.id=pe.ledger_entry_id WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id ) AND COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='refund'),0)=COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='commission_reversal'),0)=r.commission_reversal_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots snapshot WHERE snapshot.order_item_id=i.id)
  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source
 WHERE native_source.orderItemId=NEW.order_item_id AND native_source.scopeId=NEW.scope_id AND native_source.basisPaisa=NEW.basis_paisa
 AND native_source.remainingPaisa=NEW.remaining_paisa AND native_source.offsetPaisa=NEW.amount_paisa) OR c.payout_model='managed' AND EXISTS(SELECT 1 FROM (SELECT i.id AS orderItemId,e.id AS scopeId,e.calculated_paisa AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND (x.amount_paisa<0 OR x.type IN('earned','refund_adjustment') OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility') AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews review WHERE review.managed_credit_id=x.id)),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id
  JOIN managed_commercial_snapshots snapshot ON snapshot.order_item_id=i.id AND snapshot.commercial_model='managed_sale_linked_percentage_v1' JOIN managed_entitlements e ON e.snapshot_id=snapshot.id AND e.seller_id=i.seller_id
  WHERE r.id=NEW.refund_id AND i.seller_id=NEW.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (e.calculated_paisa)>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND (x.amount_paisa<0 OR x.type IN('earned','refund_adjustment') OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility') AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews review WHERE review.managed_credit_id=x.id)),0))>=0
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.entitlement_id=e.id )
    AND NOT EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE x.entitlement_id=e.id ) AND COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)=(CASE WHEN EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='merchandise' AND cost.party='seller' AND cost.seller_id=i.seller_id AND cost.amount_paisa>0)
    THEN COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND x.type='refund_adjustment'),0) ELSE 0 END)
    +COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='original_delivery' AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND e.earned_at IS NOT NULL AND COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.type='earned'),0)=e.calculated_paisa

  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source
 WHERE native_source.orderItemId=NEW.order_item_id AND native_source.scopeId=NEW.scope_id AND native_source.basisPaisa=NEW.basis_paisa
 AND native_source.remainingPaisa=NEW.remaining_paisa AND native_source.offsetPaisa=NEW.amount_paisa)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_original_proof_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_not_recovery BEFORE INSERT ON seller_recovery_historical_attributions FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_unpaid_sources unpaid WHERE unpaid.case_id=NEW.case_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_is_not_historical_repayment'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_immutable BEFORE UPDATE ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_original_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_retained BEFORE DELETE ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_original_retained'; END$$
DELIMITER ;
-- Generated source parity for 0128. Canonical and live execution remain held.
CREATE TABLE seller_recovery_payout_retirements (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),payout_model VARCHAR(191) NOT NULL CHECK(payout_model IN('registered','managed','fixed')),
 payout_id VARCHAR(191) NOT NULL,original_status VARCHAR(191) NOT NULL,original_amount_paisa BIGINT NOT NULL CHECK(original_amount_paisa>0 AND original_amount_paisa<=9007199254740991),
 original_destination VARCHAR(191) NOT NULL,original_updated_at BIGINT NOT NULL,source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,
 UNIQUE(payout_model,payout_id)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_retirement_case ON seller_recovery_payout_retirements(case_id);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_retirement_original_proof BEFORE INSERT ON seller_recovery_payout_retirements FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.payout_model=NEW.payout_model AND actor.status='active' AND seller.user_id<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND (NEW.payout_model='registered' AND EXISTS(SELECT 1 FROM (SELECT p.id,p.status,p.amount_paisa AS amountPaisa,p.destination_reference AS destination,p.updated_at AS updatedAt
  FROM payouts p  JOIN seller_recovery_cases c ON c.seller_id=p.seller_id AND c.payout_model='registered'
  WHERE c.id=NEW.case_id AND EXISTS(SELECT 1 FROM payout_entries pe JOIN seller_ledger_entries e ON e.id=pe.ledger_entry_id
  JOIN return_requests request ON request.order_item_id=e.order_item_id JOIN refunds refund ON refund.return_request_id=request.id
  WHERE pe.payout_id=p.id AND e.seller_id=c.seller_id AND refund.id=c.refund_id) AND p.status IN('prepared','scheduled','approved','failed','rejected')
  AND p.paid_at IS NULL AND p.provider_reference IS NULL
  AND (p.processed_at IS NULL OR p.status='failed')
  AND (p.status<>'failed' OR EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.registered_payout_id=p.id AND t.state='failed'))
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.registered_payout_id=p.id AND (
  EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)
  OR NOT (t.state IN('prepared','approved','void') AND t.started_at IS NULL OR t.state='failed' AND
   EXISTS(SELECT 1 FROM audit_logs event WHERE event.action='payout.transfer.event' AND event.subject_type='payout_transfer' AND event.subject_id=t.id
    AND event.reason='outcome' AND json_extract(event.next_json,'$.input.outcome')='failed'
    AND json_extract(event.next_json,'$.input.failureBasis')=t.failure_basis
    AND (t.failure_basis IN('not_sent','no_debit') AND json_extract(event.next_json,'$.input.noDebitConfirmed')=1
     OR t.failure_basis='debit_returned' AND json_extract(event.next_json,'$.input.returnedDebitConfirmed')=1 AND json_extract(event.next_json,'$.input.returnedAmountPaisa')=t.amount_paisa)))))
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired WHERE retired.payout_model='registered' AND retired.payout_id=p.id)) original
 WHERE original.id=NEW.payout_id AND original.status=NEW.original_status AND original.amountPaisa=NEW.original_amount_paisa AND original.destination=NEW.original_destination AND original.updatedAt=NEW.original_updated_at) OR NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM (SELECT p.id,p.status,p.amount_paisa AS amountPaisa,p.destination_reference AS destination,p.updated_at AS updatedAt
  FROM managed_payouts p  JOIN seller_recovery_cases c ON c.seller_id=p.seller_id AND c.payout_model='managed'
  WHERE c.id=NEW.case_id AND EXISTS(SELECT 1 FROM managed_entitlements e JOIN managed_commercial_snapshots snapshot ON snapshot.id=e.snapshot_id
  JOIN return_requests request ON request.order_item_id=snapshot.order_item_id JOIN refunds refund ON refund.return_request_id=request.id
  WHERE e.seller_id=c.seller_id AND refund.id=c.refund_id AND (EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=e.id)
   OR EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE pe.payout_id=p.id AND x.entitlement_id=e.id))) AND p.status IN('prepared','scheduled','approved','failed','rejected')
  AND p.paid_at IS NULL AND p.provider_reference IS NULL

  AND (p.status<>'failed' OR EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=p.id AND t.state='failed'))
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=p.id AND (
  EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)
  OR NOT (t.state IN('prepared','approved','void') AND t.started_at IS NULL OR t.state='failed' AND
   EXISTS(SELECT 1 FROM audit_logs event WHERE event.action='payout.transfer.event' AND event.subject_type='payout_transfer' AND event.subject_id=t.id
    AND event.reason='outcome' AND json_extract(event.next_json,'$.input.outcome')='failed'
    AND json_extract(event.next_json,'$.input.failureBasis')=t.failure_basis
    AND (t.failure_basis IN('not_sent','no_debit') AND json_extract(event.next_json,'$.input.noDebitConfirmed')=1
     OR t.failure_basis='debit_returned' AND json_extract(event.next_json,'$.input.returnedDebitConfirmed')=1 AND json_extract(event.next_json,'$.input.returnedAmountPaisa')=t.amount_paisa)))))
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired WHERE retired.payout_model='managed' AND retired.payout_id=p.id)) original
 WHERE original.id=NEW.payout_id AND original.status=NEW.original_status AND original.amountPaisa=NEW.original_amount_paisa AND original.destination=NEW.original_destination AND original.updatedAt=NEW.original_updated_at) OR NEW.payout_model='fixed' AND EXISTS(SELECT 1 FROM (SELECT p.id,p.status,p.amount_paisa AS amountPaisa,p.destination_reference AS destination,p.updated_at AS updatedAt
  FROM managed_supplier_payments p JOIN managed_supplier_obligations obligation ON obligation.id=p.obligation_id JOIN seller_recovery_cases c ON c.seller_id=obligation.seller_id AND c.payout_model='fixed'
  WHERE c.id=NEW.case_id AND EXISTS(SELECT 1 FROM managed_supplier_adjustments a WHERE a.id=c.supplier_adjustment_id AND a.obligation_id=p.obligation_id) AND p.status IN('prepared','scheduled','approved','failed','cancelled')
  AND p.paid_at IS NULL

  AND (p.status<>'failed' OR EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.supplier_payment_id=p.id AND t.state='failed'))
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.supplier_payment_id=p.id AND (
  EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)
  OR NOT (t.state IN('prepared','approved','void') AND t.started_at IS NULL OR t.state='failed' AND
   EXISTS(SELECT 1 FROM audit_logs event WHERE event.action='payout.transfer.event' AND event.subject_type='payout_transfer' AND event.subject_id=t.id
    AND event.reason='outcome' AND json_extract(event.next_json,'$.input.outcome')='failed'
    AND json_extract(event.next_json,'$.input.failureBasis')=t.failure_basis
    AND (t.failure_basis IN('not_sent','no_debit') AND json_extract(event.next_json,'$.input.noDebitConfirmed')=1
     OR t.failure_basis='debit_returned' AND json_extract(event.next_json,'$.input.returnedDebitConfirmed')=1 AND json_extract(event.next_json,'$.input.returnedAmountPaisa')=t.amount_paisa)))))
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired WHERE retired.payout_model='fixed' AND retired.payout_id=p.id)) original
 WHERE original.id=NEW.payout_id AND original.status=NEW.original_status AND original.amountPaisa=NEW.original_amount_paisa AND original.destination=NEW.original_destination AND original.updatedAt=NEW.original_updated_at)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_retirement_original_unsent_proof_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_retirement_immutable BEFORE UPDATE ON seller_recovery_payout_retirements FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_retirement_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_retirement_retained BEFORE DELETE ON seller_recovery_payout_retirements FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_retirement_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_retired_registered BEFORE UPDATE ON payouts FOR EACH ROW BEGIN IF (NEW.status<>'rejected' AND EXISTS(SELECT 1 FROM seller_recovery_payout_retirements r WHERE r.payout_model='registered' AND r.payout_id=NEW.id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_retired_payout_requires_fresh_source'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_retired_managed BEFORE UPDATE ON managed_payouts FOR EACH ROW BEGIN IF (NEW.status<>'rejected' AND EXISTS(SELECT 1 FROM seller_recovery_payout_retirements r WHERE r.payout_model='managed' AND r.payout_id=NEW.id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_retired_payout_requires_fresh_source'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_retired_fixed BEFORE UPDATE ON managed_supplier_payments FOR EACH ROW BEGIN IF (NEW.status<>'cancelled' AND EXISTS(SELECT 1 FROM seller_recovery_payout_retirements r WHERE r.payout_model='fixed' AND r.payout_id=NEW.id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_retired_payout_requires_fresh_source'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_retired_no_new_instruction BEFORE INSERT ON payout_transfer_packets FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_payout_retirements r WHERE r.payout_model=NEW.payout_model AND r.payout_id=COALESCE(NEW.registered_payout_id,NEW.managed_payout_id,NEW.supplier_payment_id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_retired_payout_requires_fresh_source'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_native_proof BEFORE INSERT ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id
 AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.refund_id=NEW.refund_id
 AND c.confirmed_paisa=0 AND c.approved_cap_paisa=0 AND c.historical_recovered_paisa=0 AND c.absorbed_paisa=0 AND c.restored_paisa=0
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews x WHERE x.case_id=c.id)
 AND c.payout_model IN('registered','managed'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_original_proof_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_registered_native_proof BEFORE INSERT ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM (SELECT i.id AS orderItemId,i.id AS scopeId,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0) AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND (x.amount_paisa<0 OR x.type IN('sale','commission','refund','commission_reversal','reserve_release'))),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id

  WHERE r.id=NEW.refund_id AND i.seller_id=NEW.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0))>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND (x.amount_paisa<0 OR x.type IN('sale','commission','refund','commission_reversal','reserve_release'))),0))>=0
  AND NOT EXISTS(SELECT 1 FROM payout_entries pe JOIN seller_ledger_entries x ON x.id=pe.ledger_entry_id WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN payouts retired_native ON retired_native.id=retired.payout_id
  WHERE retired.payout_model='registered' AND retired.payout_id=pe.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.registered_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM payout_entries retired_entry WHERE retired_entry.payout_id=retired_native.id AND retired_entry.released_at IS NULL))) AND COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='refund'),0)=COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='commission_reversal'),0)=r.commission_reversal_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots snapshot WHERE snapshot.order_item_id=i.id)
  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source
 WHERE native_source.orderItemId=NEW.order_item_id AND native_source.scopeId=NEW.scope_id AND native_source.basisPaisa=NEW.basis_paisa
 AND native_source.remainingPaisa=NEW.remaining_paisa AND native_source.offsetPaisa=NEW.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_original_proof_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_managed_native_proof BEFORE INSERT ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM (SELECT i.id AS orderItemId,e.id AS scopeId,e.calculated_paisa AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND (x.amount_paisa<0 OR x.type IN('earned','refund_adjustment') OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility') AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews review WHERE review.managed_credit_id=x.id)),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id
  JOIN managed_commercial_snapshots snapshot ON snapshot.order_item_id=i.id AND snapshot.commercial_model='managed_sale_linked_percentage_v1' JOIN managed_entitlements e ON e.snapshot_id=snapshot.id AND e.seller_id=i.seller_id
  WHERE r.id=NEW.refund_id AND i.seller_id=NEW.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (e.calculated_paisa)>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND (x.amount_paisa<0 OR x.type IN('earned','refund_adjustment') OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility') AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews review WHERE review.managed_credit_id=x.id)),0))>=0
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.entitlement_id=e.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_payouts retired_native ON retired_native.id=retired.payout_id
  WHERE retired.payout_model='managed' AND retired.payout_id=a.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations retired_allocation WHERE retired_allocation.payout_id=retired_native.id AND retired_allocation.disposition<>'released')))
    AND NOT EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE x.entitlement_id=e.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_payouts retired_native ON retired_native.id=retired.payout_id
  WHERE retired.payout_model='managed' AND retired.payout_id=pe.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations retired_allocation WHERE retired_allocation.payout_id=retired_native.id AND retired_allocation.disposition<>'released'))) AND COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)=(CASE WHEN EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='merchandise' AND cost.party='seller' AND cost.seller_id=i.seller_id AND cost.amount_paisa>0)
    THEN COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND x.type='refund_adjustment'),0) ELSE 0 END)
    +COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='original_delivery' AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND e.earned_at IS NOT NULL AND COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.type='earned'),0)=e.calculated_paisa

  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source
 WHERE native_source.orderItemId=NEW.order_item_id AND native_source.scopeId=NEW.scope_id AND native_source.basisPaisa=NEW.basis_paisa
 AND native_source.remainingPaisa=NEW.remaining_paisa AND native_source.offsetPaisa=NEW.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_original_proof_required'; END IF; END$$
DELIMITER ;
-- Generated source parity for 0129. Execution remains held.
CREATE TABLE seller_recovery_unpaid_corrections (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 original_charge_paisa BIGINT NOT NULL CHECK(original_charge_paisa>0 AND original_charge_paisa<=9007199254740991),
 previous_restored_paisa BIGINT NOT NULL CHECK(previous_restored_paisa>=0),amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0),
 registered_credit_id VARCHAR(191) UNIQUE REFERENCES seller_ledger_entries(id),managed_credit_id VARCHAR(191) UNIQUE REFERENCES managed_settlement_entries(id),
 fixed_obligation_id VARCHAR(191) REFERENCES managed_supplier_obligations(id),source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,
 CHECK(amount_paisa<=original_charge_paisa-previous_restored_paisa),
 CHECK((registered_credit_id IS NOT NULL)+(managed_credit_id IS NOT NULL)+(fixed_obligation_id IS NOT NULL)=1)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_unpaid_correction_case ON seller_recovery_unpaid_corrections(case_id);
DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_source BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa=0 AND c.exposure_paisa=0
 AND c.approved_cap_paisa=0 AND c.absorbed_paisa=0 AND c.historical_recovered_paisa=0 AND c.restored_paisa=0 AND c.liability_reduced_paisa=0
 AND actor.status='active' AND s.user_id<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id)
 AND NEW.previous_restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_unpaid_corrections x WHERE x.case_id=c.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_registered BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_recovery_unpaid_sources unpaid ON unpaid.case_id=c.id
 JOIN refunds r ON r.id=c.refund_id WHERE c.id=NEW.case_id AND r.status='paid' AND unpaid.amount_paisa=NEW.original_charge_paisa
 AND EXISTS(SELECT 1 FROM refund_obligations o JOIN outgoing_payment_packets p ON p.obligation_id=o.id WHERE o.source_kind='return_refund' AND o.source_id=r.id AND o.state='completed' AND p.state='paid')
 AND NEW.managed_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL
 AND EXISTS(SELECT 1 FROM seller_ledger_entries credit WHERE credit.id=NEW.registered_credit_id AND credit.seller_id=c.seller_id AND credit.order_item_id=unpaid.order_item_id AND credit.type='recovery_correction' AND credit.amount_paisa=NEW.amount_paisa AND credit.description=CONCAT('Original recovery correction ',c.id))
 AND unpaid.amount_paisa=COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=c.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_managed BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_recovery_unpaid_sources unpaid ON unpaid.case_id=c.id
 JOIN refunds r ON r.id=c.refund_id WHERE c.id=NEW.case_id AND r.status='paid' AND unpaid.amount_paisa=NEW.original_charge_paisa
 AND EXISTS(SELECT 1 FROM refund_obligations o JOIN outgoing_payment_packets p ON p.obligation_id=o.id WHERE o.source_kind='return_refund' AND o.source_id=r.id AND o.state='completed' AND p.state='paid')
 AND NEW.registered_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL
 AND EXISTS(SELECT 1 FROM managed_settlement_entries credit JOIN managed_entitlements e ON e.id=credit.entitlement_id WHERE credit.id=NEW.managed_credit_id AND credit.entitlement_id=unpaid.scope_id AND e.seller_id=c.seller_id AND credit.refund_id=r.id AND credit.type='dispute_adjustment' AND credit.reason_code='recovery_correction' AND credit.amount_paisa=NEW.amount_paisa AND credit.created_by=NEW.actor_id AND json_extract(credit.metadata_json,'$.caseId')=c.id)
 AND unpaid.amount_paisa=COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=unpaid.scope_id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_fixed BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='fixed') AND NOT EXISTS(
 SELECT 1 FROM seller_recovery_cases c JOIN managed_supplier_adjustments adjustment ON adjustment.id=c.supplier_adjustment_id
 JOIN managed_supplier_obligations o ON o.id=adjustment.obligation_id WHERE c.id=NEW.case_id AND o.seller_id=c.seller_id
 AND NEW.fixed_obligation_id=o.id AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL AND NEW.original_charge_paisa=adjustment.amount_paisa
 AND NOT EXISTS(SELECT 1 FROM managed_supplier_payments p WHERE p.obligation_id=o.id AND p.status<>'paid' AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_supplier_payments retired_native ON retired_native.id=retired.payout_id JOIN managed_supplier_obligations retired_obligation ON retired_obligation.id=retired_native.obligation_id
  WHERE retired.payout_model='fixed' AND retired.payout_id=p.id AND retired.seller_id=o.seller_id AND retired_obligation.seller_id=retired.seller_id
  AND retired_native.status='cancelled' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.supplier_payment_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  ))
 AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN managed_supplier_payments p ON p.id=packet.supplier_payment_id WHERE p.obligation_id=o.id AND packet.state IN('processing','uncertain'))
 AND COALESCE((SELECT SUM(p.amount_paisa) FROM managed_supplier_payments p WHERE p.obligation_id=o.id AND p.status='paid'),0)
  +COALESCE((SELECT SUM(prior.amount_paisa) FROM managed_supplier_adjustments prior WHERE prior.obligation_id=o.id AND (prior.created_at<adjustment.created_at OR prior.created_at=adjustment.created_at AND prior.id<=adjustment.id)),0)
  <=o.original_amount_paisa+NEW.previous_restored_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_immutable BEFORE UPDATE ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_retained BEFORE DELETE ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_retained'; END$$
DELIMITER ;
-- Generated source parity for 0130. Execution remains held.
CREATE TABLE seller_recovery_carrier_reviews (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 receipt_id VARCHAR(191) NOT NULL REFERENCES company_money_receipts(id),receipt_revision BIGINT NOT NULL,allocation_id VARCHAR(191) NOT NULL UNIQUE,
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),restored_paisa BIGINT NOT NULL CHECK(restored_paisa>=0 AND restored_paisa<=amount_paisa),
 resolved_disputed_paisa BIGINT NOT NULL CHECK(resolved_disputed_paisa>=0 AND resolved_disputed_paisa<=amount_paisa),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_recovery_carrier_restorations (
 id VARCHAR(191) PRIMARY KEY,review_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_carrier_reviews(id),case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),
 allocation_id VARCHAR(191) REFERENCES seller_recovery_allocations(id),method VARCHAR(191) NOT NULL CHECK(method IN('cash','earnings','returned_payout')),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991)
, historical_review_id VARCHAR(191) AS (CASE WHEN allocation_id IS NULL THEN review_id ELSE NULL END) PERSISTENT UNIQUE
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE VIEW seller_recovery_all_restorations AS
 SELECT id,case_id,allocation_id,method,amount_paisa,correction_id,NULL AS carrier_review_id FROM seller_recovery_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,review_id AS carrier_review_id FROM seller_recovery_carrier_restorations;

CREATE INDEX recovery_carrier_case ON seller_recovery_carrier_reviews(case_id);

CREATE INDEX recovery_carrier_restored_allocation ON seller_recovery_carrier_restorations(allocation_id);
DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_restoration_source BEFORE INSERT ON seller_recovery_restorations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections correction JOIN seller_recovery_cases c ON c.id=correction.case_id
 WHERE correction.id=NEW.correction_id AND c.id=NEW.case_id AND c.revision=correction.case_revision
 AND NEW.amount_paisa<=correction.restored_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.correction_id=correction.id),0)
 AND (NEW.allocation_id IS NULL AND NEW.method='earnings' AND NEW.amount_paisa<=c.historical_recovered_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.case_id=c.id AND r.allocation_id IS NULL),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.case_id=c.id AND a.method=NEW.method AND NEW.amount_paisa<=a.amount_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.allocation_id=a.id),0))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_restoration_original_collection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_correction_projection BEFORE UPDATE ON seller_recovery_cases FOR EACH ROW BEGIN IF (NEW.liability_reduced_paisa<>COALESCE((SELECT SUM(x.old_confirmed_paisa-x.new_confirmed_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)
 OR NEW.restored_paisa<>COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_carrier_reviews x WHERE x.case_id=NEW.id),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id AND x.restored_paisa<>COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.correction_id=x.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_correction_complete_projection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_carrier_current_source BEFORE INSERT ON seller_recovery_carrier_reviews FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 JOIN company_money_receipts receipt ON receipt.id=NEW.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa>0 AND c.exposure_paisa=c.confirmed_paisa
 AND actor.status='active' AND actor.id<>seller.user_id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND receipt.kind='bank_credit' AND receipt.status='verified' AND receipt.currency='NPR' AND control.revision=NEW.receipt_revision
 AND receipt.payer_user_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (r.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=r.id)))
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0)
 AND NEW.restored_paisa=GREATEST(0,c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-c.confirmed_paisa+c.absorbed_paisa)
 AND NEW.resolved_disputed_paisa<=c.disputed_paisa
 AND c.disputed_paisa-NEW.resolved_disputed_paisa<=c.confirmed_paisa-c.absorbed_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-NEW.restored_paisa))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_carrier_restoration_source BEFORE INSERT ON seller_recovery_carrier_restorations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews review JOIN seller_recovery_cases c ON c.id=review.case_id WHERE review.id=NEW.review_id AND c.id=NEW.case_id AND c.revision=review.case_revision
 AND NEW.amount_paisa<=review.restored_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_carrier_restorations r WHERE r.review_id=review.id),0)
 AND (NEW.allocation_id IS NULL AND NEW.method='earnings' AND NEW.amount_paisa<=c.historical_recovered_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.case_id=c.id AND r.allocation_id IS NULL),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.case_id=c.id AND a.method=NEW.method AND a.method<>'carrier' AND NEW.amount_paisa<=a.amount_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.allocation_id=a.id),0))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_original_collection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_carrier_complete_projection BEFORE UPDATE ON seller_recovery_cases FOR EACH ROW BEGIN IF (NEW.revision>OLD.revision AND EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews carrier_review WHERE carrier_review.case_id=NEW.id AND (
  NOT EXISTS(SELECT 1 FROM seller_recovery_allocations applied WHERE applied.id=carrier_review.allocation_id AND applied.case_id=carrier_review.case_id AND applied.method='carrier' AND applied.receipt_id=carrier_review.receipt_id AND applied.amount_paisa=carrier_review.amount_paisa AND applied.request_id=carrier_review.request_id)
  OR carrier_review.restored_paisa<>COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_carrier_restorations restored WHERE restored.review_id=carrier_review.id),0)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_complete_projection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_correction_carrier_boundary BEFORE INSERT ON seller_recovery_liability_corrections FOR EACH ROW BEGIN IF (NEW.new_confirmed_paisa-NEW.new_absorbed_paisa<COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=NEW.case_id AND a.method='carrier'),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_excess_needs_own_disposition'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_carrier_no_seller_gift BEFORE INSERT ON seller_recovery_restorations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.method='carrier')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_excess_needs_own_disposition'; END IF; END$$
CREATE OR REPLACE TRIGGER seller_recovery_carrier_reviews_update BEFORE UPDATE ON seller_recovery_carrier_reviews FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_history_retained'; END$$
CREATE OR REPLACE TRIGGER seller_recovery_carrier_reviews_delete BEFORE DELETE ON seller_recovery_carrier_reviews FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_history_retained'; END$$
CREATE OR REPLACE TRIGGER seller_recovery_carrier_restorations_update BEFORE UPDATE ON seller_recovery_carrier_restorations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_history_retained'; END$$
CREATE OR REPLACE TRIGGER seller_recovery_carrier_restorations_delete BEFORE DELETE ON seller_recovery_carrier_restorations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_history_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_allocation_cap BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.blocker IS NULL AND (
 NEW.method<>'carrier' AND c.state IN('open','part_recovered','repayment_plan','disputed') AND c.approved_by IS NOT NULL AND c.approved_cap_paisa<=c.confirmed_paisa
 AND NEW.amount_paisa<=c.approved_cap_paisa-c.absorbed_paisa-c.disputed_paisa-c.historical_recovered_paisa+c.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)
 OR NEW.method='carrier' AND EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id
 AND review.restored_paisa=COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_carrier_restorations r WHERE r.review_id=review.id),0)
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.disputed_paisa+review.resolved_disputed_paisa-c.historical_recovered_paisa+c.restored_paisa+review.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_remaining_cap_exceeded'; END IF; END$$
DELIMITER ;
-- Generated source parity for 0131; execution remains held.
CREATE TABLE seller_recovery_partial_sources(
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL UNIQUE REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),refund_id VARCHAR(191) NOT NULL UNIQUE REFERENCES refunds(id),
 order_item_id VARCHAR(191) NOT NULL REFERENCES order_items(id),scope_id VARCHAR(191) NOT NULL,
 basis_paisa BIGINT NOT NULL CHECK(basis_paisa>0 AND basis_paisa<=9007199254740991),
 native_charge_paisa BIGINT NOT NULL CHECK(native_charge_paisa>0 AND native_charge_paisa<=9007199254740991),
 capacity_paisa BIGINT NOT NULL CHECK(capacity_paisa>=0 AND capacity_paisa<=basis_paisa),
 used_paisa BIGINT NOT NULL CHECK(used_paisa>=0 AND used_paisa<=capacity_paisa),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>=0 AND amount_paisa<native_charge_paisa AND amount_paisa<=capacity_paisa-used_paisa),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,
 created_at BIGINT NOT NULL,evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_partial_original_scope ON seller_recovery_partial_sources(seller_id,scope_id);

CREATE VIEW seller_recovery_original_unpaid_reviews AS
 SELECT id,case_id,seller_id,refund_id,order_item_id,scope_id,amount_paisa,amount_paisa AS native_charge_paisa FROM seller_recovery_unpaid_sources
 UNION ALL SELECT id,case_id,seller_id,refund_id,order_item_id,scope_id,amount_paisa,native_charge_paisa FROM seller_recovery_partial_sources;

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_partial_current BEFORE INSERT ON seller_recovery_partial_sources FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.refund_id=NEW.refund_id AND c.payout_model IN('registered','managed')
 AND actor.status='active' AND seller.user_id<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND c.confirmed_paisa=0 AND c.approved_cap_paisa=0 AND c.historical_recovered_paisa=0 AND c.absorbed_paisa=0 AND c.restored_paisa=0
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_unpaid_sources x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews x WHERE x.case_id=c.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_partial_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_partial_registered BEFORE INSERT ON seller_recovery_partial_sources FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM (SELECT source_pool.*,
  CASE WHEN nativeDebitPaisa<capacityPaisa-usedPaisa THEN nativeDebitPaisa ELSE capacityPaisa-usedPaisa END AS offsetPaisa
  FROM (SELECT native_source.orderItemId,native_source.scopeId,native_source.basisPaisa,native_source.offsetPaisa AS nativeDebitPaisa,
   COALESCE((SELECT SUM(original.amount_paisa) FROM seller_ledger_entries original WHERE original.order_item_id=native_source.scopeId AND original.seller_id=NEW.seller_id
    AND (original.type IN('sale','commission','reserve_release') OR original.amount_paisa<0 AND original.type NOT IN('refund','commission_reversal','payout'))),0) AS capacityPaisa,COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_unpaid_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='registered' AND used.seller_id=NEW.seller_id AND used.scope_id=native_source.scopeId),0)
  +COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_partial_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='registered' AND used.seller_id=NEW.seller_id AND used.scope_id=native_source.scopeId),0) AS usedPaisa FROM (SELECT i.id AS orderItemId,i.id AS scopeId,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0) AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND (x.amount_paisa<0 OR x.type IN('sale','commission','refund','commission_reversal','reserve_release'))),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id

  WHERE r.id=NEW.refund_id AND i.seller_id=NEW.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0))>0
  AND NOT EXISTS(SELECT 1 FROM payout_entries pe JOIN seller_ledger_entries x ON x.id=pe.ledger_entry_id WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN payouts retired_native ON retired_native.id=retired.payout_id
  WHERE retired.payout_model='registered' AND retired.payout_id=pe.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.registered_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM payout_entries retired_entry WHERE retired_entry.payout_id=retired_native.id AND retired_entry.released_at IS NULL))) AND COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='refund'),0)=COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='commission_reversal'),0)=r.commission_reversal_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots snapshot WHERE snapshot.order_item_id=i.id)
  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source WHERE NOT EXISTS(SELECT 1 FROM seller_ledger_entries reserve WHERE reserve.seller_id=NEW.seller_id AND reserve.order_item_id=native_source.orderItemId AND reserve.type IN('reserve_hold','reserve_release') GROUP BY reserve.order_item_id HAVING SUM(reserve.amount_paisa)<0)) source_pool
  WHERE capacityPaisa>=usedPaisa AND capacityPaisa<=basisPaisa) original
 WHERE original.orderItemId=NEW.order_item_id AND original.scopeId=NEW.scope_id AND original.basisPaisa=NEW.basis_paisa
 AND original.nativeDebitPaisa=NEW.native_charge_paisa AND original.capacityPaisa=NEW.capacity_paisa
 AND original.usedPaisa=NEW.used_paisa AND original.offsetPaisa=NEW.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_partial_shared_original_capacity_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_partial_managed BEFORE INSERT ON seller_recovery_partial_sources FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM (SELECT source_pool.*,
  CASE WHEN nativeDebitPaisa<capacityPaisa-usedPaisa THEN nativeDebitPaisa ELSE capacityPaisa-usedPaisa END AS offsetPaisa
  FROM (SELECT native_source.orderItemId,native_source.scopeId,native_source.basisPaisa,native_source.offsetPaisa AS nativeDebitPaisa,
   COALESCE((SELECT SUM(original.amount_paisa) FROM managed_settlement_entries original JOIN managed_entitlements entitlement ON entitlement.id=original.entitlement_id
    WHERE original.entitlement_id=native_source.scopeId AND entitlement.seller_id=NEW.seller_id AND (original.type='earned' OR original.amount_paisa<0
    AND original.type<>'refund_adjustment' AND NOT(original.type='dispute_adjustment' AND original.reason_code='refund_responsibility'))),0) AS capacityPaisa,COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_unpaid_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='managed' AND used.seller_id=NEW.seller_id AND used.scope_id=native_source.scopeId),0)
  +COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_partial_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='managed' AND used.seller_id=NEW.seller_id AND used.scope_id=native_source.scopeId),0) AS usedPaisa FROM (SELECT i.id AS orderItemId,e.id AS scopeId,e.calculated_paisa AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND (x.amount_paisa<0 OR x.type IN('earned','refund_adjustment') OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility') AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews review WHERE review.managed_credit_id=x.id)),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id
  JOIN managed_commercial_snapshots snapshot ON snapshot.order_item_id=i.id AND snapshot.commercial_model='managed_sale_linked_percentage_v1' JOIN managed_entitlements e ON e.snapshot_id=snapshot.id AND e.seller_id=i.seller_id
  WHERE r.id=NEW.refund_id AND i.seller_id=NEW.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (e.calculated_paisa)>0
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.entitlement_id=e.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_payouts retired_native ON retired_native.id=retired.payout_id
  WHERE retired.payout_model='managed' AND retired.payout_id=a.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations retired_allocation WHERE retired_allocation.payout_id=retired_native.id AND retired_allocation.disposition<>'released')))
    AND NOT EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE x.entitlement_id=e.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_payouts retired_native ON retired_native.id=retired.payout_id
  WHERE retired.payout_model='managed' AND retired.payout_id=pe.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations retired_allocation WHERE retired_allocation.payout_id=retired_native.id AND retired_allocation.disposition<>'released'))) AND COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)=(CASE WHEN EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='merchandise' AND cost.party='seller' AND cost.seller_id=i.seller_id AND cost.amount_paisa>0)
    THEN COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND x.type='refund_adjustment'),0) ELSE 0 END)
    +COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='original_delivery' AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND e.earned_at IS NOT NULL AND COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.type='earned'),0)=e.calculated_paisa

  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source WHERE 1) source_pool
  WHERE capacityPaisa>=usedPaisa AND capacityPaisa<=basisPaisa) original
 WHERE original.orderItemId=NEW.order_item_id AND original.scopeId=NEW.scope_id AND original.basisPaisa=NEW.basis_paisa
 AND original.nativeDebitPaisa=NEW.native_charge_paisa AND original.capacityPaisa=NEW.capacity_paisa
 AND original.usedPaisa=NEW.used_paisa AND original.offsetPaisa=NEW.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_partial_shared_original_capacity_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_partial_no_duplicate_unpaid BEFORE INSERT ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_partial_sources x WHERE x.case_id=NEW.case_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_partial_original_already_recognized'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_partial_projection BEFORE UPDATE ON seller_recovery_cases FOR EACH ROW BEGIN IF (NEW.revision<>OLD.revision AND EXISTS(SELECT 1 FROM seller_recovery_partial_sources x WHERE x.case_id=NEW.id
 AND (NEW.confirmed_paisa<>x.native_charge_paisa-x.amount_paisa-COALESCE((SELECT SUM(c.old_confirmed_paisa-c.new_confirmed_paisa) FROM seller_recovery_liability_corrections c WHERE c.case_id=NEW.id),0)
 OR NEW.exposure_paisa<>NEW.confirmed_paisa))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_partial_original_projection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_partial_immutable BEFORE UPDATE ON seller_recovery_partial_sources FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_partial_original_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_partial_retained BEFORE DELETE ON seller_recovery_partial_sources FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_partial_original_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_source BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa=0 AND c.exposure_paisa=0
 AND c.approved_cap_paisa=0 AND c.absorbed_paisa=0 AND c.historical_recovered_paisa=0 AND c.disputed_paisa=0 AND (c.restored_paisa=0 AND c.liability_reduced_paisa=0 OR EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)))
 AND actor.status='active' AND s.user_id<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND (NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id) OR EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND (NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id) OR EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts receipt ON receipt.id=a.receipt_id WHERE a.case_id=c.id
    AND (receipt.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id))) AND NEW.previous_restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_unpaid_corrections x WHERE x.case_id=c.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_registered BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_recovery_original_unpaid_reviews unpaid ON unpaid.case_id=c.id
 JOIN refunds r ON r.id=c.refund_id WHERE c.id=NEW.case_id AND r.status='paid' AND unpaid.amount_paisa=NEW.original_charge_paisa
 AND EXISTS(SELECT 1 FROM refund_obligations o JOIN outgoing_payment_packets p ON p.obligation_id=o.id WHERE o.source_kind='return_refund' AND o.source_id=r.id AND o.state='completed' AND p.state='paid')
 AND NEW.managed_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL
 AND EXISTS(SELECT 1 FROM seller_ledger_entries credit WHERE credit.id=NEW.registered_credit_id AND credit.seller_id=c.seller_id AND credit.order_item_id=unpaid.order_item_id AND credit.type='recovery_correction' AND credit.amount_paisa=NEW.amount_paisa AND credit.description=CONCAT('Original recovery correction ',c.id))
 AND unpaid.native_charge_paisa=COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=c.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_managed BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_recovery_original_unpaid_reviews unpaid ON unpaid.case_id=c.id
 JOIN refunds r ON r.id=c.refund_id WHERE c.id=NEW.case_id AND r.status='paid' AND unpaid.amount_paisa=NEW.original_charge_paisa
 AND EXISTS(SELECT 1 FROM refund_obligations o JOIN outgoing_payment_packets p ON p.obligation_id=o.id WHERE o.source_kind='return_refund' AND o.source_id=r.id AND o.state='completed' AND p.state='paid')
 AND NEW.registered_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL
 AND EXISTS(SELECT 1 FROM managed_settlement_entries credit JOIN managed_entitlements e ON e.id=credit.entitlement_id WHERE credit.id=NEW.managed_credit_id AND credit.entitlement_id=unpaid.scope_id AND e.seller_id=c.seller_id AND credit.refund_id=r.id AND credit.type='dispute_adjustment' AND credit.reason_code='recovery_correction' AND credit.amount_paisa=NEW.amount_paisa AND credit.created_by=NEW.actor_id AND json_extract(credit.metadata_json,'$.caseId')=c.id)
 AND unpaid.native_charge_paisa=COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=unpaid.scope_id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_native_credit_required'; END IF; END$$
DELIMITER ;
-- Generated source parity for 0132; execution remains held.
CREATE TABLE seller_recovery_calculation_reviews(
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 submitted_by VARCHAR(191) NOT NULL REFERENCES users(id),reason TEXT NOT NULL,evidence_reference TEXT,
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,due_at BIGINT NOT NULL CHECK(due_at>created_at)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_recovery_calculation_answers(
 id VARCHAR(191) PRIMARY KEY,review_id VARCHAR(191) NOT NULL UNIQUE REFERENCES seller_recovery_calculation_reviews(id),case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),reason TEXT NOT NULL,public_message TEXT NOT NULL,source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_calculation_case ON seller_recovery_calculation_reviews(case_id,created_at);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_calculation_current_owner BEFORE INSERT ON seller_recovery_calculation_reviews FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users owner ON owner.id=seller.user_id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND owner.id=NEW.submitted_by AND owner.status='active' AND (CASE WHEN c.exposure_paisa>c.confirmed_paisa THEN c.exposure_paisa ELSE c.confirmed_paisa END)-c.absorbed_paisa-c.disputed_paisa<=0)
 OR EXISTS(SELECT 1 FROM seller_recovery_calculation_reviews prior WHERE prior.case_id=NEW.case_id AND NOT EXISTS(SELECT 1 FROM seller_recovery_calculation_answers answered WHERE answered.review_id=prior.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_calculation_current_owner_or_pending_review_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_calculation_current_reviewer BEFORE INSERT ON seller_recovery_calculation_answers FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_calculation_reviews request JOIN seller_recovery_cases c ON c.id=request.case_id
 JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE request.id=NEW.review_id AND request.case_id=NEW.case_id AND c.revision=NEW.case_revision AND actor.status='active' AND actor.id<>seller.user_id
 AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_calculation_current_independent_reviewer_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_calculation_reviews_immutable BEFORE UPDATE ON seller_recovery_calculation_reviews FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_calculation_history_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_calculation_reviews_retained BEFORE DELETE ON seller_recovery_calculation_reviews FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_calculation_history_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_calculation_answers_immutable BEFORE UPDATE ON seller_recovery_calculation_answers FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_calculation_history_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_calculation_answers_retained BEFORE DELETE ON seller_recovery_calculation_answers FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_calculation_history_retained'; END$$
DELIMITER ;
-- Generated source parity for 0133; execution remains held.
CREATE TABLE seller_recovery_payout_return_reviews (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 payout_model VARCHAR(191) NOT NULL CHECK(payout_model IN('registered','managed','fixed')),payout_id VARCHAR(191) NOT NULL,scope_id VARCHAR(191) NOT NULL,
 original_payout_paisa BIGINT NOT NULL CHECK(original_payout_paisa>0 AND original_payout_paisa<=9007199254740991),
 scope_paisa BIGINT NOT NULL CHECK(scope_paisa>0 AND scope_paisa<=9007199254740991),
 receipt_id VARCHAR(191) NOT NULL REFERENCES company_money_receipts(id),receipt_revision BIGINT NOT NULL,allocation_id VARCHAR(191) NOT NULL UNIQUE,
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=original_payout_paisa AND amount_paisa<=scope_paisa),
 restored_paisa BIGINT NOT NULL CHECK(restored_paisa>=0 AND restored_paisa<=amount_paisa),
 principal_excess_paisa BIGINT NOT NULL CHECK(principal_excess_paisa>=0 AND principal_excess_paisa<=restored_paisa),
 resolved_disputed_paisa BIGINT NOT NULL CHECK(resolved_disputed_paisa>=0 AND resolved_disputed_paisa<=amount_paisa),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,
 created_at BIGINT NOT NULL,evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_recovery_payout_return_pools (
 payout_model VARCHAR(191) NOT NULL CHECK(payout_model IN('registered','managed','fixed')),payout_id VARCHAR(191) NOT NULL,
 scope_id VARCHAR(191) NOT NULL,principal_paisa BIGINT NOT NULL CHECK(principal_paisa>0 AND principal_paisa<=9007199254740991),
 used_paisa BIGINT NOT NULL CHECK(used_paisa>=0 AND used_paisa<=principal_paisa),
 PRIMARY KEY(payout_model,payout_id,scope_id)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seller_recovery_payout_return_restorations (
 id VARCHAR(191) PRIMARY KEY,review_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_payout_return_reviews(id),case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),
 allocation_id VARCHAR(191) REFERENCES seller_recovery_allocations(id),method VARCHAR(191) NOT NULL CHECK(method IN('cash','earnings','returned_payout')),
 kind VARCHAR(191) NOT NULL CHECK(kind IN('seller_collection','returned_principal')),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_payout_return_case ON seller_recovery_payout_return_reviews(case_id);

CREATE INDEX recovery_payout_return_original ON seller_recovery_payout_return_reviews(payout_model,payout_id,scope_id);

CREATE INDEX recovery_payout_return_restored ON seller_recovery_payout_return_restorations(allocation_id);

CREATE INDEX recovery_payout_return_review ON seller_recovery_payout_return_restorations(review_id);

CREATE OR REPLACE VIEW seller_recovery_all_restorations AS
 SELECT id,case_id,allocation_id,method,amount_paisa,correction_id,NULL AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,review_id AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_carrier_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,NULL AS carrier_review_id,review_id AS payout_return_review_id FROM seller_recovery_payout_return_restorations;
DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_correction_projection BEFORE UPDATE ON seller_recovery_cases FOR EACH ROW BEGIN IF (NEW.liability_reduced_paisa<>COALESCE((SELECT SUM(x.old_confirmed_paisa-x.new_confirmed_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)
 OR NEW.restored_paisa<>COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_carrier_reviews x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_payout_return_reviews x WHERE x.case_id=NEW.id),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id AND x.restored_paisa<>COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.correction_id=x.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_correction_complete_projection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_payout_return_current BEFORE INSERT ON seller_recovery_payout_return_reviews FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 JOIN company_money_receipts receipt ON receipt.id=NEW.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa>=0 AND c.payout_model=NEW.payout_model AND c.exposure_paisa=c.confirmed_paisa
 AND actor.status='active' AND actor.id<>seller.user_id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND receipt.kind='bank_credit' AND receipt.status='verified' AND receipt.currency='NPR' AND control.revision=NEW.receipt_revision
 AND (receipt.payer_user_id IS NULL OR receipt.payer_user_id=seller.user_id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (r.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=r.id)))
 AND c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa>=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0) AND c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa<=c.confirmed_paisa-c.absorbed_paisa
 AND NEW.principal_excess_paisa=GREATEST(0,NEW.restored_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa)+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0))
 AND NEW.restored_paisa=GREATEST(0,c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-c.confirmed_paisa+c.absorbed_paisa)
 AND NEW.resolved_disputed_paisa<=c.disputed_paisa
 AND c.disputed_paisa-NEW.resolved_disputed_paisa<=c.confirmed_paisa-c.absorbed_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-NEW.restored_paisa))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_payout_return_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_payout_return_registered BEFORE INSERT ON seller_recovery_payout_return_reviews FOR EACH ROW BEGIN IF (NEW.payout_model='registered' AND NOT EXISTS(SELECT 1 FROM (SELECT * FROM (SELECT 'registered' AS model,p.id AS payoutId,t.id AS packetId,p.amount_paisa AS originalPayoutPaisa,t.bank_at AS bankAt,item.id AS scopeId,
  (SELECT SUM(entry.amount_paisa) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
   WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.order_item_id=item.id AND entry.seller_id=c.seller_id AND entry.type<>'payout') AS scopePaisa
  FROM seller_recovery_cases c JOIN refunds r ON c.source_kind='refund' AND r.id=c.source_id
  JOIN return_requests original_return ON original_return.id=r.return_request_id
  JOIN order_items item ON item.id=original_return.order_item_id AND item.seller_id=c.seller_id JOIN payouts p ON p.seller_id=c.seller_id JOIN seller_profiles seller ON seller.id=c.seller_id
  JOIN payout_transfer_packets t ON t.registered_payout_id=p.id
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa AND bank.account_version_id=t.account_version_id WHERE c.id=NEW.case_id AND c.payout_model='registered' AND p.status='paid' AND JSON_TYPE(json_extract(c.original_source_json,'$.originalPayoutIds'))='ARRAY' AND JSON_CONTAINS(json_extract(c.original_source_json,'$.originalPayoutIds'),JSON_QUOTE(p.id))=1
  AND json_extract(c.original_source_json,'$.model')='registered'
  AND json_extract(t.source_snapshot_json,'$.ownerId')=seller.user_id
  AND json_extract(t.source_snapshot_json,'$.ownerId')=json_extract(c.original_source_json,'$.ownerId')
  AND json_extract(t.source_snapshot_json,'$.sellerId')=c.seller_id
  AND json_extract(t.source_snapshot_json,'$.model')='registered' AND json_extract(t.source_snapshot_json,'$.id')=p.id
  AND json_extract(t.source_snapshot_json,'$.amountPaisa')=p.amount_paisa
  AND json_extract(t.source_snapshot_json,'$.destination')=p.destination_reference
  AND t.state='paid' AND t.payout_model='registered' AND t.seller_id=c.seller_id AND t.amount_paisa=p.amount_paisa
  AND t.amount_paisa>0 AND t.amount_paisa<=9007199254740991
  AND bank.bank_at=t.bank_at AND bank.transaction_identity=t.transaction_identity
  AND (SELECT COUNT(*) FROM payout_transfer_packets other WHERE other.registered_payout_id=p.id AND other.state='paid')=1
  AND (SELECT SUM(entry.amount_paisa) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
   WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type<>'payout')=p.amount_paisa
  AND (SELECT COUNT(*) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
   WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type='payout')=1
  AND EXISTS(SELECT 1 FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
   WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type='payout' AND entry.payout_id=p.id AND entry.amount_paisa=-p.amount_paisa)
  AND NOT EXISTS(SELECT 1 FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
   WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.seller_id<>c.seller_id)) original_paid_source WHERE scopePaisa>0 AND scopePaisa<=9007199254740991) original
 WHERE original.payoutId=NEW.payout_id AND original.scopeId=NEW.scope_id AND original.originalPayoutPaisa=NEW.original_payout_paisa AND original.scopePaisa=NEW.scope_paisa
 AND original.bankAt<=(SELECT bank_at FROM company_money_receipts WHERE id=NEW.receipt_id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_payout_return_original_paid_proof_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_payout_return_managed BEFORE INSERT ON seller_recovery_payout_return_reviews FOR EACH ROW BEGIN IF (NEW.payout_model='managed' AND NOT EXISTS(SELECT 1 FROM (SELECT * FROM (SELECT 'managed' AS model,p.id AS payoutId,t.id AS packetId,p.amount_paisa AS originalPayoutPaisa,t.bank_at AS bankAt,entitlement.id AS scopeId,
  COALESCE((SELECT allocation.amount_paisa FROM managed_payout_allocations allocation WHERE allocation.payout_id=p.id AND allocation.entitlement_id=entitlement.id AND allocation.disposition='paid'),
   (SELECT SUM(entry.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    WHERE included.payout_id=p.id AND entry.entitlement_id=entitlement.id)) AS scopePaisa
  FROM seller_recovery_cases c JOIN refunds r ON c.source_kind='refund' AND r.id=c.source_id
  JOIN return_requests original_return ON original_return.id=r.return_request_id
  JOIN order_items item ON item.id=original_return.order_item_id AND item.seller_id=c.seller_id JOIN managed_commercial_snapshots snapshot ON snapshot.order_item_id=item.id
  JOIN managed_entitlements entitlement ON entitlement.snapshot_id=snapshot.id AND entitlement.seller_id=c.seller_id
  JOIN managed_payouts p ON p.seller_id=c.seller_id JOIN seller_profiles seller ON seller.id=c.seller_id
  JOIN payout_transfer_packets t ON t.managed_payout_id=p.id
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa AND bank.account_version_id=t.account_version_id WHERE c.id=NEW.case_id AND c.payout_model='managed' AND p.status='paid' AND JSON_TYPE(json_extract(c.original_source_json,'$.originalPayoutIds'))='ARRAY' AND JSON_CONTAINS(json_extract(c.original_source_json,'$.originalPayoutIds'),JSON_QUOTE(p.id))=1
  AND json_extract(c.original_source_json,'$.model')='managed'
  AND json_extract(t.source_snapshot_json,'$.ownerId')=seller.user_id
  AND json_extract(t.source_snapshot_json,'$.ownerId')=json_extract(c.original_source_json,'$.ownerId')
  AND json_extract(t.source_snapshot_json,'$.sellerId')=c.seller_id
  AND json_extract(t.source_snapshot_json,'$.model')='managed' AND json_extract(t.source_snapshot_json,'$.id')=p.id
  AND json_extract(t.source_snapshot_json,'$.amountPaisa')=p.amount_paisa
  AND json_extract(t.source_snapshot_json,'$.destination')=p.destination_reference
  AND t.state='paid' AND t.payout_model='managed' AND t.seller_id=c.seller_id AND t.amount_paisa=p.amount_paisa
  AND t.amount_paisa>0 AND t.amount_paisa<=9007199254740991
  AND bank.bank_at=t.bank_at AND bank.transaction_identity=t.transaction_identity
  AND (SELECT COUNT(*) FROM payout_transfer_packets other WHERE other.managed_payout_id=p.id AND other.state='paid')=1
  AND COALESCE((SELECT SUM(allocation.amount_paisa) FROM managed_payout_allocations allocation WHERE allocation.payout_id=p.id AND allocation.disposition='paid'),0)
   +COALESCE((SELECT SUM(entry.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    WHERE included.payout_id=p.id AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations allocation WHERE allocation.payout_id=p.id AND allocation.entitlement_id=entry.entitlement_id AND allocation.disposition='paid')),0)=p.amount_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations allocation JOIN managed_entitlements e ON e.id=allocation.entitlement_id
   WHERE allocation.payout_id=p.id AND allocation.disposition='paid' AND e.seller_id<>c.seller_id)
  AND NOT EXISTS(SELECT 1 FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
   JOIN managed_entitlements e ON e.id=entry.entitlement_id WHERE included.payout_id=p.id AND e.seller_id<>c.seller_id)) original_paid_source WHERE scopePaisa>0 AND scopePaisa<=9007199254740991) original
 WHERE original.payoutId=NEW.payout_id AND original.scopeId=NEW.scope_id AND original.originalPayoutPaisa=NEW.original_payout_paisa AND original.scopePaisa=NEW.scope_paisa
 AND original.bankAt<=(SELECT bank_at FROM company_money_receipts WHERE id=NEW.receipt_id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_payout_return_original_paid_proof_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_payout_return_fixed BEFORE INSERT ON seller_recovery_payout_return_reviews FOR EACH ROW BEGIN IF (NEW.payout_model='fixed' AND NOT EXISTS(SELECT 1 FROM (SELECT * FROM (SELECT 'fixed' AS model,p.id AS payoutId,t.id AS packetId,p.amount_paisa AS originalPayoutPaisa,t.bank_at AS bankAt,obligation.id AS scopeId,p.amount_paisa AS scopePaisa FROM seller_recovery_cases c
  JOIN managed_supplier_adjustments adjustment ON c.source_kind='supplier_adjustment' AND adjustment.id=c.source_id
  JOIN managed_supplier_obligations obligation ON obligation.id=adjustment.obligation_id AND obligation.seller_id=c.seller_id
  JOIN managed_supplier_payments p ON p.obligation_id=obligation.id JOIN seller_profiles seller ON seller.id=c.seller_id
  JOIN payout_transfer_packets t ON t.supplier_payment_id=p.id
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa AND bank.account_version_id=t.account_version_id WHERE c.id=NEW.case_id AND c.payout_model='fixed' AND p.status='paid' AND JSON_TYPE(json_extract(c.original_source_json,'$.originalPayoutIds'))='ARRAY' AND JSON_CONTAINS(json_extract(c.original_source_json,'$.originalPayoutIds'),JSON_QUOTE(p.id))=1
  AND json_extract(c.original_source_json,'$.model')='fixed'
  AND json_extract(t.source_snapshot_json,'$.ownerId')=seller.user_id
  AND json_extract(t.source_snapshot_json,'$.ownerId')=json_extract(c.original_source_json,'$.ownerId')
  AND json_extract(t.source_snapshot_json,'$.sellerId')=c.seller_id
  AND json_extract(t.source_snapshot_json,'$.model')='fixed' AND json_extract(t.source_snapshot_json,'$.id')=p.id
  AND json_extract(t.source_snapshot_json,'$.amountPaisa')=p.amount_paisa
  AND json_extract(t.source_snapshot_json,'$.destination')=p.destination_reference
  AND t.state='paid' AND t.payout_model='fixed' AND t.seller_id=c.seller_id AND t.amount_paisa=p.amount_paisa
  AND t.amount_paisa>0 AND t.amount_paisa<=9007199254740991
  AND bank.bank_at=t.bank_at AND bank.transaction_identity=t.transaction_identity
  AND (SELECT COUNT(*) FROM payout_transfer_packets other WHERE other.supplier_payment_id=p.id AND other.state='paid')=1
  AND json_extract(t.source_snapshot_json,'$.obligationId')=obligation.id) original_paid_source WHERE scopePaisa>0 AND scopePaisa<=9007199254740991) original
 WHERE original.payoutId=NEW.payout_id AND original.scopeId=NEW.scope_id AND original.originalPayoutPaisa=NEW.original_payout_paisa AND original.scopePaisa=NEW.scope_paisa
 AND original.bankAt<=(SELECT bank_at FROM company_money_receipts WHERE id=NEW.receipt_id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_payout_return_original_paid_proof_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_payout_return_pool_insert BEFORE INSERT ON seller_recovery_payout_return_pools FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews review WHERE review.payout_model=NEW.payout_model AND review.payout_id=NEW.payout_id AND (NEW.scope_id='' AND NEW.principal_paisa=review.original_payout_paisa OR NEW.scope_id=review.scope_id AND NEW.principal_paisa=review.scope_paisa)) OR NOT EXISTS(SELECT 1 FROM seller_recovery_payout_return_pools existing WHERE existing.payout_model=NEW.payout_model AND existing.payout_id=NEW.payout_id AND existing.scope_id=NEW.scope_id) AND NEW.used_paisa<>COALESCE((SELECT SUM(review.amount_paisa) FROM seller_recovery_payout_return_reviews review WHERE review.payout_model=NEW.payout_model AND review.payout_id=NEW.payout_id AND (NEW.scope_id='' OR review.scope_id=NEW.scope_id)),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_payout_return_pool_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_payout_return_pool_update BEFORE UPDATE ON seller_recovery_payout_return_pools FOR EACH ROW BEGIN IF (NEW.payout_model<>OLD.payout_model OR NEW.payout_id<>OLD.payout_id OR NEW.scope_id<>OLD.scope_id OR NEW.principal_paisa<>OLD.principal_paisa OR NEW.used_paisa<OLD.used_paisa OR NEW.used_paisa<>COALESCE((SELECT SUM(review.amount_paisa) FROM seller_recovery_payout_return_reviews review WHERE review.payout_model=NEW.payout_model AND review.payout_id=NEW.payout_id AND (NEW.scope_id='' OR review.scope_id=NEW.scope_id)),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_payout_return_pool_projection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_payout_return_pool_retained BEFORE DELETE ON seller_recovery_payout_return_pools FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_payout_return_pool_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_payout_return_restoration BEFORE INSERT ON seller_recovery_payout_return_restorations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews review JOIN seller_recovery_cases c ON c.id=review.case_id WHERE review.id=NEW.review_id AND c.id=NEW.case_id AND c.revision=review.case_revision
 AND NEW.amount_paisa<=review.restored_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id),0)
 AND (NEW.kind='returned_principal' AND NEW.method='returned_payout' AND NEW.allocation_id=review.allocation_id AND NEW.amount_paisa=review.principal_excess_paisa
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id AND r.kind='returned_principal')
  AND EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.case_id=c.id AND a.method='returned_payout' AND a.receipt_id=review.receipt_id AND a.amount_paisa=review.amount_paisa)
 OR NEW.kind='seller_collection'
  AND NEW.amount_paisa<=review.restored_paisa-review.principal_excess_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id AND r.kind='seller_collection'),0)
  AND (NEW.allocation_id IS NULL AND NEW.method='earnings' AND NEW.amount_paisa<=c.historical_recovered_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.case_id=c.id AND r.allocation_id IS NULL),0)
   OR EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.id<>review.allocation_id AND a.case_id=c.id AND a.method=NEW.method AND a.method<>'carrier' AND NEW.amount_paisa<=a.amount_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.allocation_id=a.id),0)))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_payout_return_original_collection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_payout_return_complete BEFORE UPDATE ON seller_recovery_cases FOR EACH ROW BEGIN IF (NEW.revision>OLD.revision AND EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews returned_review WHERE returned_review.case_id=NEW.id AND (
  NOT EXISTS(SELECT 1 FROM seller_recovery_allocations applied WHERE applied.id=returned_review.allocation_id AND applied.case_id=returned_review.case_id AND applied.method='returned_payout' AND applied.receipt_id=returned_review.receipt_id AND applied.amount_paisa=returned_review.amount_paisa AND applied.request_id=returned_review.request_id)
  OR returned_review.restored_paisa<>COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_payout_return_restorations restored WHERE restored.review_id=returned_review.id),0)
  OR returned_review.principal_excess_paisa<>COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_payout_return_restorations restored WHERE restored.review_id=returned_review.id AND restored.kind='returned_principal'),0)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_payout_return_complete_projection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER seller_recovery_payout_return_reviews_update BEFORE UPDATE ON seller_recovery_payout_return_reviews FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_payout_return_history_retained'; END$$
CREATE OR REPLACE TRIGGER seller_recovery_payout_return_reviews_delete BEFORE DELETE ON seller_recovery_payout_return_reviews FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_payout_return_history_retained'; END$$
CREATE OR REPLACE TRIGGER seller_recovery_payout_return_restorations_update BEFORE UPDATE ON seller_recovery_payout_return_restorations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_payout_return_history_retained'; END$$
CREATE OR REPLACE TRIGGER seller_recovery_payout_return_restorations_delete BEFORE DELETE ON seller_recovery_payout_return_restorations FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_payout_return_history_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_allocation_cap BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.blocker IS NULL AND (
 NEW.method IN('cash','earnings') AND c.state IN('open','part_recovered','repayment_plan','disputed') AND c.approved_by IS NOT NULL AND c.approved_cap_paisa<=c.confirmed_paisa
 AND NEW.amount_paisa<=c.approved_cap_paisa-c.absorbed_paisa-c.disputed_paisa-c.historical_recovered_paisa+c.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)
 OR NEW.method='returned_payout' AND EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id
 AND review.restored_paisa-review.principal_excess_paisa=COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id AND r.kind='seller_collection'),0)
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.disputed_paisa+review.resolved_disputed_paisa-c.historical_recovered_paisa+c.restored_paisa+review.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))
 OR NEW.method='carrier' AND EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id
 AND review.restored_paisa=COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_carrier_restorations r WHERE r.review_id=review.id),0)
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.disputed_paisa+review.resolved_disputed_paisa-c.historical_recovered_paisa+c.restored_paisa+review.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_remaining_cap_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_payout_return_consume AFTER INSERT ON seller_recovery_payout_return_reviews FOR EACH ROW BEGIN
INSERT INTO seller_recovery_payout_return_pools(payout_model,payout_id,scope_id,principal_paisa,used_paisa) VALUES(NEW.payout_model,NEW.payout_id,'',NEW.original_payout_paisa,NEW.amount_paisa)
 ON DUPLICATE KEY UPDATE used_paisa=used_paisa+VALUES(used_paisa);
INSERT INTO seller_recovery_payout_return_pools(payout_model,payout_id,scope_id,principal_paisa,used_paisa) VALUES(NEW.payout_model,NEW.payout_id,NEW.scope_id,NEW.scope_paisa,NEW.amount_paisa)
 ON DUPLICATE KEY UPDATE used_paisa=used_paisa+VALUES(used_paisa);
END$$
DELIMITER ;
-- Generated source parity for 0134; execution remains held.
CREATE TABLE seller_recovery_carrier_unpaid_reviews (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 receipt_id VARCHAR(191) NOT NULL REFERENCES company_money_receipts(id),receipt_revision BIGINT NOT NULL,allocation_id VARCHAR(191) NOT NULL UNIQUE,
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX recovery_carrier_unpaid_case ON seller_recovery_carrier_unpaid_reviews(case_id);
CREATE OR REPLACE VIEW seller_recovery_all_restorations AS
 SELECT id,case_id,allocation_id,method,amount_paisa,correction_id,NULL AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,review_id AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_carrier_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,NULL AS carrier_review_id,review_id AS payout_return_review_id FROM seller_recovery_payout_return_restorations
 UNION ALL SELECT id,case_id,allocation_id,'carrier' AS method,amount_paisa,NULL AS correction_id,NULL AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_carrier_unpaid_reviews;
DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_carrier_current_source BEFORE INSERT ON seller_recovery_carrier_reviews FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 JOIN company_money_receipts receipt ON receipt.id=NEW.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa>0 AND c.exposure_paisa=c.confirmed_paisa
 AND actor.status='active' AND actor.id<>seller.user_id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND receipt.kind='bank_credit' AND receipt.status='verified' AND receipt.currency='NPR' AND control.revision=NEW.receipt_revision
 AND receipt.payer_user_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (r.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=r.id)))
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-COALESCE((SELECT SUM(a.amount_paisa-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0)
 AND NEW.restored_paisa=GREATEST(0,c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-c.confirmed_paisa+c.absorbed_paisa)
 AND NEW.resolved_disputed_paisa<=c.disputed_paisa
 AND c.disputed_paisa-NEW.resolved_disputed_paisa<=c.confirmed_paisa-c.absorbed_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-NEW.restored_paisa))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_correction_carrier_boundary BEFORE INSERT ON seller_recovery_liability_corrections FOR EACH ROW BEGIN IF (NEW.new_confirmed_paisa-NEW.new_absorbed_paisa<COALESCE((SELECT SUM(a.amount_paisa-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=NEW.case_id AND a.method='carrier'),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_excess_needs_own_disposition'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_payout_return_current BEFORE INSERT ON seller_recovery_payout_return_reviews FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 JOIN company_money_receipts receipt ON receipt.id=NEW.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa>=0 AND c.payout_model=NEW.payout_model AND c.exposure_paisa=c.confirmed_paisa
 AND actor.status='active' AND actor.id<>seller.user_id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND receipt.kind='bank_credit' AND receipt.status='verified' AND receipt.currency='NPR' AND control.revision=NEW.receipt_revision
 AND (receipt.payer_user_id IS NULL OR receipt.payer_user_id=seller.user_id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (r.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=r.id)))
 AND c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa>=COALESCE((SELECT SUM(a.amount_paisa-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0) AND c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa<=c.confirmed_paisa-c.absorbed_paisa
 AND NEW.principal_excess_paisa=GREATEST(0,NEW.restored_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa)+COALESCE((SELECT SUM(a.amount_paisa-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0))
 AND NEW.restored_paisa=GREATEST(0,c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-c.confirmed_paisa+c.absorbed_paisa)
 AND NEW.resolved_disputed_paisa<=c.disputed_paisa
 AND c.disputed_paisa-NEW.resolved_disputed_paisa<=c.confirmed_paisa-c.absorbed_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-NEW.restored_paisa))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_payout_return_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_allocation_cap BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.blocker IS NULL AND (
 NEW.method IN('cash','earnings') AND c.state IN('open','part_recovered','repayment_plan','disputed') AND c.approved_by IS NOT NULL AND c.approved_cap_paisa<=c.confirmed_paisa
 AND NEW.amount_paisa<=c.approved_cap_paisa-c.absorbed_paisa-c.disputed_paisa-c.historical_recovered_paisa+c.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)
 OR NEW.method='returned_payout' AND EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id
 AND review.restored_paisa-review.principal_excess_paisa=COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id AND r.kind='seller_collection'),0)
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.disputed_paisa+review.resolved_disputed_paisa-c.historical_recovered_paisa+c.restored_paisa+review.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))
 OR NEW.method='carrier' AND EXISTS(SELECT 1 FROM seller_recovery_carrier_unpaid_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id)
 OR NEW.method='carrier' AND EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id
 AND review.restored_paisa=COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_carrier_restorations r WHERE r.review_id=review.id),0)
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.disputed_paisa+review.resolved_disputed_paisa-c.historical_recovered_paisa+c.restored_paisa+review.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_remaining_cap_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_correction_projection BEFORE UPDATE ON seller_recovery_cases FOR EACH ROW BEGIN IF (NEW.liability_reduced_paisa<>COALESCE((SELECT SUM(x.old_confirmed_paisa-x.new_confirmed_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)
 OR NEW.restored_paisa<>COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_carrier_reviews x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_payout_return_reviews x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=NEW.id),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id AND x.restored_paisa<>COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.correction_id=x.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_correction_complete_projection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_source BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa=0 AND c.exposure_paisa=0
 AND c.approved_cap_paisa=0 AND c.absorbed_paisa=0 AND c.historical_recovered_paisa=0 AND c.disputed_paisa=0 AND (c.restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=c.id),0) AND c.liability_reduced_paisa=0 OR EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)))
 AND actor.status='active' AND s.user_id<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND (NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_carrier_unpaid_reviews review WHERE review.allocation_id=a.id AND review.case_id=a.case_id AND review.amount_paisa=a.amount_paisa AND a.method='carrier')) OR EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND (NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id) OR EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts receipt ON receipt.id=a.receipt_id WHERE a.case_id=c.id
    AND (receipt.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id))) AND NEW.previous_restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_unpaid_corrections x WHERE x.case_id=c.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_fixed BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='fixed') AND NOT EXISTS(
 SELECT 1 FROM seller_recovery_cases c JOIN managed_supplier_adjustments adjustment ON adjustment.id=c.supplier_adjustment_id
 JOIN managed_supplier_obligations o ON o.id=adjustment.obligation_id WHERE c.id=NEW.case_id AND o.seller_id=c.seller_id
 AND NEW.fixed_obligation_id=o.id AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL AND NEW.original_charge_paisa=adjustment.amount_paisa
 AND NOT EXISTS(SELECT 1 FROM managed_supplier_payments p WHERE p.obligation_id=o.id AND p.status<>'paid' AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_supplier_payments retired_native ON retired_native.id=retired.payout_id JOIN managed_supplier_obligations retired_obligation ON retired_obligation.id=retired_native.obligation_id
  WHERE retired.payout_model='fixed' AND retired.payout_id=p.id AND retired.seller_id=o.seller_id AND retired_obligation.seller_id=retired.seller_id
  AND retired_native.status='cancelled' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.supplier_payment_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  ))
 AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN managed_supplier_payments p ON p.id=packet.supplier_payment_id WHERE p.obligation_id=o.id AND packet.state IN('processing','uncertain'))
 AND COALESCE((SELECT SUM(p.amount_paisa) FROM managed_supplier_payments p WHERE p.obligation_id=o.id AND p.status='paid'),0)
  +COALESCE((SELECT SUM(prior.amount_paisa) FROM managed_supplier_adjustments prior WHERE prior.obligation_id=o.id AND (prior.created_at<adjustment.created_at OR prior.created_at=adjustment.created_at AND prior.id<=adjustment.id)),0)
  <=o.original_amount_paisa+NEW.previous_restored_paisa+COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=c.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_carrier_unpaid_source BEFORE INSERT ON seller_recovery_carrier_unpaid_reviews FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 JOIN company_money_receipts receipt ON receipt.id=NEW.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL  AND c.exposure_paisa=c.confirmed_paisa
 AND actor.status='active' AND actor.id<>seller.user_id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND receipt.kind='bank_credit' AND receipt.status='verified' AND receipt.currency='NPR' AND control.revision=NEW.receipt_revision
 AND receipt.payer_user_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (r.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=r.id)))
 AND NEW.amount_paisa<=(CASE WHEN c.payout_model='fixed' AND c.confirmed_paisa=0 AND c.liability_reduced_paisa=0 AND COALESCE(json_extract(c.original_source_json,'$.confirmedPaisa'),-1)=0
 THEN COALESCE((SELECT a.amount_paisa FROM managed_supplier_adjustments a WHERE a.id=c.supplier_adjustment_id),0)
 WHEN c.payout_model IN('registered','managed') THEN COALESCE((SELECT unpaid.amount_paisa FROM seller_recovery_original_unpaid_reviews unpaid WHERE unpaid.case_id=c.id),0) ELSE 0 END)-COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_unpaid_corrections x WHERE x.case_id=c.id),0)-COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=c.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_unpaid_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_carrier_unpaid_complete BEFORE UPDATE ON seller_recovery_cases FOR EACH ROW BEGIN IF (NEW.revision<>OLD.revision AND EXISTS(SELECT 1 FROM seller_recovery_carrier_unpaid_reviews review WHERE review.case_id=OLD.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=review.allocation_id AND a.case_id=review.case_id AND a.method='carrier' AND a.receipt_id=review.receipt_id AND a.amount_paisa=review.amount_paisa AND a.request_id=review.request_id AND a.actor_id=review.actor_id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_unpaid_disposition_incomplete'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_carrier_boundary BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (NEW.original_charge_paisa-NEW.previous_restored_paisa-NEW.amount_paisa<COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=NEW.case_id),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_carrier_excess_requires_disposition'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_carrier_unpaid_update BEFORE UPDATE ON seller_recovery_carrier_unpaid_reviews FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_unpaid_history_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_carrier_unpaid_delete BEFORE DELETE ON seller_recovery_carrier_unpaid_reviews FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_unpaid_history_retained'; END$$
DELIMITER ;
-- Source parity only; native execution remains held.
DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_historical_native_source BEFORE INSERT ON seller_recovery_historical_attributions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.refund_id=NEW.refund_id AND (c.payout_model='registered' AND NEW.kind='registered_refund_group' AND EXISTS(SELECT 1 FROM (SELECT * FROM (
  SELECT 'registered_refund_group' AS kind,p.id AS payoutId,NEW.refund_id AS scopeId,
   -SUM(x.amount_paisa)-COALESCE((SELECT SUM(credit.amount_paisa)
    FROM payout_entries included JOIN seller_ledger_entries credit ON credit.id=included.ledger_entry_id
    WHERE included.payout_id=p.id AND included.released_at IS NULL AND credit.seller_id=p.seller_id
     AND (credit.type='recovery_source_compensation' AND credit.refund_id=NEW.refund_id OR EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.refund_id=NEW.refund_id AND (
      EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id)
      OR EXISTS(SELECT 1 FROM seller_recovery_reductions a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id)
      OR EXISTS(SELECT 1 FROM seller_recovery_liability_corrections a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id))))),0) AS capacityPaisa,
   ((SELECT COUNT(*) FROM payout_transfer_packets t
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa
   AND bank.account_version_id=t.account_version_id
  WHERE t.registered_payout_id=p.id AND t.payout_model='registered' AND t.seller_id=p.seller_id
   AND t.state='paid' AND t.amount_paisa=p.amount_paisa)=1
    AND (SELECT SUM(entry.amount_paisa) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type<>'payout')=p.amount_paisa
    AND (SELECT COUNT(*) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type='payout')=1
    AND EXISTS(SELECT 1 FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type='payout' AND entry.payout_id=p.id AND entry.amount_paisa=-p.amount_paisa)
    AND NOT EXISTS(SELECT 1 FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.seller_id<>p.seller_id)) AS nativeProof
  FROM seller_ledger_entries x JOIN payout_entries pe ON pe.ledger_entry_id=x.id JOIN payouts p ON p.id=pe.payout_id
  WHERE x.refund_id=NEW.refund_id AND x.seller_id=NEW.seller_id AND p.seller_id=NEW.seller_id
   AND x.type IN('refund','commission_reversal') AND pe.released_at IS NULL AND p.status='paid'
  GROUP BY p.id,p.seller_id,p.amount_paisa
 ) historical_candidates WHERE capacityPaisa>0) native_source WHERE native_source.kind=NEW.kind AND native_source.payoutId=NEW.payout_id AND native_source.scopeId=NEW.scope_id AND native_source.capacityPaisa=NEW.native_deduction_paisa AND native_source.nativeProof=1) OR c.payout_model='managed' AND NEW.kind IN('managed_allocation','managed_legacy_group') AND EXISTS(SELECT 1 FROM (SELECT * FROM (
  SELECT 'managed_allocation' AS kind,p.id AS payoutId,a.entitlement_id AS scopeId,-a.amount_paisa AS capacityPaisa,((SELECT COUNT(*) FROM payout_transfer_packets t
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa
   AND bank.account_version_id=t.account_version_id
  WHERE t.managed_payout_id=p.id AND t.payout_model='managed' AND t.seller_id=p.seller_id
   AND t.state='paid' AND t.amount_paisa=p.amount_paisa)=1
  AND COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.disposition='paid'),0)
   +COALESCE((SELECT SUM(entry.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    WHERE included.payout_id=p.id AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=entry.entitlement_id AND a.disposition='paid')),0)=p.amount_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a JOIN managed_entitlements e ON e.id=a.entitlement_id
    WHERE a.payout_id=p.id AND a.disposition='paid' AND e.seller_id<>p.seller_id)
  AND NOT EXISTS(SELECT 1 FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    JOIN managed_entitlements e ON e.id=entry.entitlement_id WHERE included.payout_id=p.id AND e.seller_id<>p.seller_id)) AS nativeProof
  FROM managed_payout_allocations a JOIN managed_payouts p ON p.id=a.payout_id
  WHERE a.amount_paisa<0 AND a.disposition='paid' AND p.status='paid' AND p.seller_id=NEW.seller_id
   AND EXISTS(SELECT 1 FROM managed_settlement_entries x WHERE x.entitlement_id=a.entitlement_id AND x.refund_id=NEW.refund_id AND x.amount_paisa<0 AND x.created_at<=p.created_at)
  UNION ALL
  SELECT 'managed_legacy_group' AS kind,p.id AS payoutId,NEW.refund_id AS scopeId,-SUM(x.amount_paisa) AS capacityPaisa,((SELECT COUNT(*) FROM payout_transfer_packets t
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa
   AND bank.account_version_id=t.account_version_id
  WHERE t.managed_payout_id=p.id AND t.payout_model='managed' AND t.seller_id=p.seller_id
   AND t.state='paid' AND t.amount_paisa=p.amount_paisa)=1
  AND COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.disposition='paid'),0)
   +COALESCE((SELECT SUM(entry.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    WHERE included.payout_id=p.id AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=entry.entitlement_id AND a.disposition='paid')),0)=p.amount_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a JOIN managed_entitlements e ON e.id=a.entitlement_id
    WHERE a.payout_id=p.id AND a.disposition='paid' AND e.seller_id<>p.seller_id)
  AND NOT EXISTS(SELECT 1 FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    JOIN managed_entitlements e ON e.id=entry.entitlement_id WHERE included.payout_id=p.id AND e.seller_id<>p.seller_id)) AS nativeProof
  FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id JOIN managed_payouts p ON p.id=pe.payout_id
  WHERE x.refund_id=NEW.refund_id AND p.seller_id=NEW.seller_id AND p.status='paid'
   AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=x.entitlement_id AND a.disposition='paid')
  GROUP BY p.id,p.seller_id,p.amount_paisa
 ) historical_candidates WHERE capacityPaisa>0) native_source WHERE native_source.kind=NEW.kind AND native_source.payoutId=NEW.payout_id AND native_source.scopeId=NEW.scope_id AND native_source.capacityPaisa=NEW.native_deduction_paisa AND native_source.nativeProof=1)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_actual_native_source_required'; END IF; END$$
DELIMITER ;
-- Source parity for 0136; native verification and execution remain held.
CREATE TABLE seller_recovery_company_deductions (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),refund_id VARCHAR(191) NOT NULL REFERENCES refunds(id),
 kind VARCHAR(191) NOT NULL CHECK(kind IN('registered_refund_group','managed_allocation','managed_legacy_group')),payout_id VARCHAR(191) NOT NULL,scope_id VARCHAR(191) NOT NULL,
 native_deduction_paisa BIGINT NOT NULL CHECK(native_deduction_paisa>0 AND native_deduction_paisa<=9007199254740991),amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=native_deduction_paisa),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,source_json TEXT NOT NULL CHECK(json_valid(source_json)),evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,UNIQUE(case_id,case_revision)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE seller_recovery_historical_pools (
 kind VARCHAR(191) NOT NULL,payout_id VARCHAR(191) NOT NULL,scope_id VARCHAR(191) NOT NULL,principal_paisa BIGINT NOT NULL CHECK(principal_paisa>0 AND principal_paisa<=9007199254740991),used_paisa BIGINT NOT NULL CHECK(used_paisa>=0 AND used_paisa<=principal_paisa),PRIMARY KEY(kind,payout_id,scope_id)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE VIEW seller_recovery_all_historical_uses AS
 SELECT id,case_id,kind,payout_id,scope_id,native_deduction_paisa,amount_paisa,'recovery' AS use_kind FROM seller_recovery_historical_attributions
 UNION ALL SELECT id,case_id,kind,payout_id,scope_id,native_deduction_paisa,amount_paisa,'company' AS use_kind FROM seller_recovery_company_deductions;
INSERT INTO operation_transaction_guards(id,valid) SELECT 'recovery-history-0136-capacity',CASE WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions GROUP BY kind,payout_id,scope_id HAVING MIN(native_deduction_paisa)<>MAX(native_deduction_paisa) OR SUM(amount_paisa)>MAX(native_deduction_paisa)) THEN 1 ELSE 0 END;
DELETE FROM operation_transaction_guards WHERE id='recovery-history-0136-capacity';
INSERT INTO seller_recovery_historical_pools(kind,payout_id,scope_id,principal_paisa,used_paisa) SELECT kind,payout_id,scope_id,MAX(native_deduction_paisa),SUM(amount_paisa) FROM seller_recovery_historical_attributions GROUP BY kind,payout_id,scope_id;
CREATE INDEX recovery_company_deduction_case ON seller_recovery_company_deductions(case_id);
CREATE INDEX recovery_company_deduction_pool ON seller_recovery_company_deductions(kind,payout_id,scope_id);
DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_company_deduction_source BEFORE INSERT ON seller_recovery_company_deductions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN refunds r ON r.id=c.refund_id JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.refund_id=NEW.refund_id AND c.confirmed_paisa=0 AND c.approved_cap_paisa=0 AND c.historical_recovered_paisa=0 AND c.absorbed_paisa=0 AND c.restored_paisa=0 AND r.status='paid'
 AND actor.status='active' AND actor.id<>seller.user_id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=r.order_id AND o.customer_id=actor.id)
 AND EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id) AND NOT EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=c.seller_id AND cost.amount_paisa>0)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id) AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id) AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews review WHERE review.case_id=c.id)
 AND (c.payout_model='registered' AND NEW.kind='registered_refund_group' AND EXISTS(SELECT 1 FROM (SELECT * FROM (
  SELECT 'registered_refund_group' AS kind,p.id AS payoutId,NEW.refund_id AS scopeId,
   -SUM(x.amount_paisa)-COALESCE((SELECT SUM(credit.amount_paisa)
    FROM payout_entries included JOIN seller_ledger_entries credit ON credit.id=included.ledger_entry_id
    WHERE included.payout_id=p.id AND included.released_at IS NULL AND credit.seller_id=p.seller_id
     AND (credit.type='recovery_source_compensation' AND credit.refund_id=NEW.refund_id OR EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.refund_id=NEW.refund_id AND (
      EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id)
      OR EXISTS(SELECT 1 FROM seller_recovery_reductions a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id)
      OR EXISTS(SELECT 1 FROM seller_recovery_liability_corrections a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id))))),0) AS capacityPaisa,
   ((SELECT COUNT(*) FROM payout_transfer_packets t
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa
   AND bank.account_version_id=t.account_version_id
  WHERE t.registered_payout_id=p.id AND t.payout_model='registered' AND t.seller_id=p.seller_id
   AND t.state='paid' AND t.amount_paisa=p.amount_paisa)=1
    AND (SELECT SUM(entry.amount_paisa) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type<>'payout')=p.amount_paisa
    AND (SELECT COUNT(*) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type='payout')=1
    AND EXISTS(SELECT 1 FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type='payout' AND entry.payout_id=p.id AND entry.amount_paisa=-p.amount_paisa)
    AND NOT EXISTS(SELECT 1 FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.seller_id<>p.seller_id)) AS nativeProof
  FROM seller_ledger_entries x JOIN payout_entries pe ON pe.ledger_entry_id=x.id JOIN payouts p ON p.id=pe.payout_id
  WHERE x.refund_id=NEW.refund_id AND x.seller_id=NEW.seller_id AND p.seller_id=NEW.seller_id
   AND x.type IN('refund','commission_reversal') AND pe.released_at IS NULL AND p.status='paid'
  GROUP BY p.id,p.seller_id,p.amount_paisa
 ) historical_candidates WHERE capacityPaisa>0) native_source WHERE native_source.kind=NEW.kind AND native_source.payoutId=NEW.payout_id AND native_source.scopeId=NEW.scope_id AND native_source.capacityPaisa=NEW.native_deduction_paisa AND native_source.nativeProof=1) OR c.payout_model='managed' AND NEW.kind IN('managed_allocation','managed_legacy_group') AND EXISTS(SELECT 1 FROM (SELECT * FROM (
  SELECT 'managed_allocation' AS kind,p.id AS payoutId,a.entitlement_id AS scopeId,-a.amount_paisa AS capacityPaisa,((SELECT COUNT(*) FROM payout_transfer_packets t
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa
   AND bank.account_version_id=t.account_version_id
  WHERE t.managed_payout_id=p.id AND t.payout_model='managed' AND t.seller_id=p.seller_id
   AND t.state='paid' AND t.amount_paisa=p.amount_paisa)=1
  AND COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.disposition='paid'),0)
   +COALESCE((SELECT SUM(entry.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    WHERE included.payout_id=p.id AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=entry.entitlement_id AND a.disposition='paid')),0)=p.amount_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a JOIN managed_entitlements e ON e.id=a.entitlement_id
    WHERE a.payout_id=p.id AND a.disposition='paid' AND e.seller_id<>p.seller_id)
  AND NOT EXISTS(SELECT 1 FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    JOIN managed_entitlements e ON e.id=entry.entitlement_id WHERE included.payout_id=p.id AND e.seller_id<>p.seller_id)) AS nativeProof
  FROM managed_payout_allocations a JOIN managed_payouts p ON p.id=a.payout_id
  WHERE a.amount_paisa<0 AND a.disposition='paid' AND p.status='paid' AND p.seller_id=NEW.seller_id
   AND EXISTS(SELECT 1 FROM managed_settlement_entries x WHERE x.entitlement_id=a.entitlement_id AND x.refund_id=NEW.refund_id AND x.amount_paisa<0 AND x.created_at<=p.created_at)
  UNION ALL
  SELECT 'managed_legacy_group' AS kind,p.id AS payoutId,NEW.refund_id AS scopeId,-SUM(x.amount_paisa) AS capacityPaisa,((SELECT COUNT(*) FROM payout_transfer_packets t
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa
   AND bank.account_version_id=t.account_version_id
  WHERE t.managed_payout_id=p.id AND t.payout_model='managed' AND t.seller_id=p.seller_id
   AND t.state='paid' AND t.amount_paisa=p.amount_paisa)=1
  AND COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.disposition='paid'),0)
   +COALESCE((SELECT SUM(entry.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    WHERE included.payout_id=p.id AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=entry.entitlement_id AND a.disposition='paid')),0)=p.amount_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a JOIN managed_entitlements e ON e.id=a.entitlement_id
    WHERE a.payout_id=p.id AND a.disposition='paid' AND e.seller_id<>p.seller_id)
  AND NOT EXISTS(SELECT 1 FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    JOIN managed_entitlements e ON e.id=entry.entitlement_id WHERE included.payout_id=p.id AND e.seller_id<>p.seller_id)) AS nativeProof
  FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id JOIN managed_payouts p ON p.id=pe.payout_id
  WHERE x.refund_id=NEW.refund_id AND p.seller_id=NEW.seller_id AND p.status='paid'
   AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=x.entitlement_id AND a.disposition='paid')
  GROUP BY p.id,p.seller_id,p.amount_paisa
 ) historical_candidates WHERE capacityPaisa>0) native_source WHERE native_source.kind=NEW.kind AND native_source.payoutId=NEW.payout_id AND native_source.scopeId=NEW.scope_id AND native_source.capacityPaisa=NEW.native_deduction_paisa AND native_source.nativeProof=1))
 AND NEW.amount_paisa<=CASE WHEN c.payout_model='registered' THEN COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=c.seller_id AND x.refund_id=c.refund_id AND x.type='refund'),0) ELSE COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x JOIN managed_entitlements e ON e.id=x.entitlement_id WHERE e.seller_id=c.seller_id AND x.refund_id=c.refund_id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0) END-COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_company_deductions h WHERE h.case_id=c.id),0)
 AND NEW.amount_paisa<=COALESCE(json_extract(NEW.source_json,'$.historicalCandidatePaisa'),0)-COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_company_deductions h WHERE h.case_id=c.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_company_original_deduction_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_company_deduction_shared_cap BEFORE INSERT ON seller_recovery_company_deductions FOR EACH ROW BEGIN IF (NEW.amount_paisa>NEW.native_deduction_paisa-COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_all_historical_uses h WHERE h.kind=NEW.kind AND h.payout_id=NEW.payout_id AND h.scope_id=NEW.scope_id),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_shared_capacity_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_historical_shared_cap BEFORE INSERT ON seller_recovery_historical_attributions FOR EACH ROW BEGIN IF (NEW.amount_paisa>NEW.native_deduction_paisa-COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_all_historical_uses h WHERE h.kind=NEW.kind AND h.payout_id=NEW.payout_id AND h.scope_id=NEW.scope_id),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_shared_capacity_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_company_deduction_update BEFORE UPDATE ON seller_recovery_company_deductions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_company_deduction_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_company_deduction_delete BEFORE DELETE ON seller_recovery_company_deductions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_company_deduction_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_historical_pool_insert BEFORE INSERT ON seller_recovery_historical_pools FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_historical_pools p WHERE p.kind=NEW.kind AND p.payout_id=NEW.payout_id AND p.scope_id=NEW.scope_id) AND (NEW.used_paisa<=0 OR NEW.used_paisa<>COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_all_historical_uses h WHERE h.kind=NEW.kind AND h.payout_id=NEW.payout_id AND h.scope_id=NEW.scope_id),0) OR NEW.principal_paisa<>COALESCE((SELECT MAX(h.native_deduction_paisa) FROM seller_recovery_all_historical_uses h WHERE h.kind=NEW.kind AND h.payout_id=NEW.payout_id AND h.scope_id=NEW.scope_id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_pool_projection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_historical_pool_update BEFORE UPDATE ON seller_recovery_historical_pools FOR EACH ROW BEGIN IF (NEW.kind<>OLD.kind OR NEW.payout_id<>OLD.payout_id OR NEW.scope_id<>OLD.scope_id OR NEW.principal_paisa<>OLD.principal_paisa OR NEW.used_paisa<>COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_all_historical_uses h WHERE h.kind=NEW.kind AND h.payout_id=NEW.payout_id AND h.scope_id=NEW.scope_id),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_pool_projection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_historical_pool_delete BEFORE DELETE ON seller_recovery_historical_pools FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_pool_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_historical_pool_consume_0 AFTER INSERT ON seller_recovery_company_deductions FOR EACH ROW BEGIN INSERT INTO seller_recovery_historical_pools(kind,payout_id,scope_id,principal_paisa,used_paisa) VALUES(NEW.kind,NEW.payout_id,NEW.scope_id,NEW.native_deduction_paisa,NEW.amount_paisa) ON DUPLICATE KEY UPDATE used_paisa=used_paisa+VALUES(used_paisa); END$$
CREATE OR REPLACE TRIGGER recovery_historical_pool_consume_1 AFTER INSERT ON seller_recovery_historical_attributions FOR EACH ROW BEGIN INSERT INTO seller_recovery_historical_pools(kind,payout_id,scope_id,principal_paisa,used_paisa) VALUES(NEW.kind,NEW.payout_id,NEW.scope_id,NEW.native_deduction_paisa,NEW.amount_paisa) ON DUPLICATE KEY UPDATE used_paisa=used_paisa+VALUES(used_paisa); END$$
DELIMITER ;
-- Source parity for 0137; execution remains held.
CREATE VIEW seller_recovery_fixed_original_balances AS SELECT basis.caseId AS case_id,CASE WHEN basis.uncertain>0 THEN -1 ELSE basis.charge-(CASE WHEN basis.paid+basis.prior+basis.charge-basis.original>0 THEN basis.paid+basis.prior+basis.charge-basis.original ELSE 0 END)+(CASE WHEN basis.paid+basis.prior-basis.original>0 THEN basis.paid+basis.prior-basis.original ELSE 0 END) END AS unpaid_paisa FROM (
  SELECT basis_case.id caseId,adjustment.amount_paisa charge,obligation.original_amount_paisa original,
   COALESCE((SELECT SUM(p.amount_paisa) FROM managed_supplier_payments p WHERE p.obligation_id=obligation.id AND JSON_CONTAINS(json_extract(basis_case.original_source_json,'$.originalPayoutIds'),JSON_QUOTE(p.id))=1 AND p.status='paid' AND EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=packet.id
  WHERE packet.supplier_payment_id=p.id AND packet.payout_model='fixed' AND packet.seller_id=basis_case.seller_id AND packet.state='paid'
   AND packet.amount_paisa=p.amount_paisa AND bank.amount_paisa=packet.amount_paisa AND bank.identity_hash=packet.transaction_identity_hash AND bank.account_version_id=packet.account_version_id
   AND json_extract(packet.source_snapshot_json,'$.id')=p.id AND json_extract(packet.source_snapshot_json,'$.amountPaisa')=p.amount_paisa
   AND json_extract(packet.source_snapshot_json,'$.obligationId')=adjustment.obligation_id)),0) paid,
   COALESCE((SELECT SUM(earlier.amount_paisa) FROM managed_supplier_adjustments earlier WHERE earlier.obligation_id=obligation.id AND (earlier.created_at<adjustment.created_at OR earlier.created_at=adjustment.created_at AND earlier.id<adjustment.id)),0) prior,
   (SELECT COUNT(*) FROM managed_supplier_payments p WHERE p.obligation_id=obligation.id AND JSON_CONTAINS(json_extract(basis_case.original_source_json,'$.originalPayoutIds'),JSON_QUOTE(p.id))=1 AND NOT (p.status='paid' AND EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=packet.id
  WHERE packet.supplier_payment_id=p.id AND packet.payout_model='fixed' AND packet.seller_id=basis_case.seller_id AND packet.state='paid'
   AND packet.amount_paisa=p.amount_paisa AND bank.amount_paisa=packet.amount_paisa AND bank.identity_hash=packet.transaction_identity_hash AND bank.account_version_id=packet.account_version_id
   AND json_extract(packet.source_snapshot_json,'$.id')=p.id AND json_extract(packet.source_snapshot_json,'$.amountPaisa')=p.amount_paisa
   AND json_extract(packet.source_snapshot_json,'$.obligationId')=adjustment.obligation_id)) AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_supplier_payments retired_native ON retired_native.id=retired.payout_id JOIN managed_supplier_obligations retired_obligation ON retired_obligation.id=retired_native.obligation_id
  WHERE retired.payout_model='fixed' AND retired.payout_id=p.id AND retired.seller_id=basis_case.seller_id AND retired_obligation.seller_id=retired.seller_id
  AND retired_native.status='cancelled' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.supplier_payment_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  )) uncertain
  FROM seller_recovery_cases basis_case JOIN managed_supplier_adjustments adjustment ON adjustment.id=basis_case.supplier_adjustment_id JOIN managed_supplier_obligations obligation ON obligation.id=adjustment.obligation_id
  WHERE basis_case.payout_model='fixed' AND obligation.seller_id=basis_case.seller_id
 ) basis;
DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_source BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa=0 AND c.exposure_paisa=0
 AND c.approved_cap_paisa=0 AND c.absorbed_paisa=0 AND c.historical_recovered_paisa=0 AND c.disputed_paisa=0 AND (c.restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=c.id),0) AND c.liability_reduced_paisa=0 OR (EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)) OR (c.payout_model='fixed'
  AND c.liability_reduced_paisa=(SELECT amount_paisa FROM managed_supplier_adjustments WHERE id=c.supplier_adjustment_id)-NEW.original_charge_paisa
  AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))
 AND actor.status='active' AND s.user_id<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND (NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_carrier_unpaid_reviews review WHERE review.allocation_id=a.id AND review.case_id=a.case_id AND review.amount_paisa=a.amount_paisa AND a.method='carrier')) OR (EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)) OR (c.payout_model='fixed'
  AND c.liability_reduced_paisa=(SELECT amount_paisa FROM managed_supplier_adjustments WHERE id=c.supplier_adjustment_id)-NEW.original_charge_paisa
  AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND (NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id) OR (EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)) OR (c.payout_model='fixed'
  AND c.liability_reduced_paisa=(SELECT amount_paisa FROM managed_supplier_adjustments WHERE id=c.supplier_adjustment_id)-NEW.original_charge_paisa
  AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts receipt ON receipt.id=a.receipt_id WHERE a.case_id=c.id
    AND (receipt.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id))) AND NEW.previous_restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_unpaid_corrections x WHERE x.case_id=c.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_fixed BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='fixed') AND NOT EXISTS(
 SELECT 1 FROM seller_recovery_cases c JOIN managed_supplier_adjustments adjustment ON adjustment.id=c.supplier_adjustment_id JOIN managed_supplier_obligations o ON o.id=adjustment.obligation_id
 WHERE c.id=NEW.case_id AND o.seller_id=c.seller_id AND NEW.fixed_obligation_id=o.id AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL
 AND c.liability_reduced_paisa=adjustment.amount_paisa-NEW.original_charge_paisa
 AND NOT EXISTS(SELECT 1 FROM managed_supplier_payments p WHERE p.obligation_id=o.id AND p.status<>'paid' AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_supplier_payments retired_native ON retired_native.id=retired.payout_id JOIN managed_supplier_obligations retired_obligation ON retired_obligation.id=retired_native.obligation_id
  WHERE retired.payout_model='fixed' AND retired.payout_id=p.id AND retired.seller_id=o.seller_id AND retired_obligation.seller_id=retired.seller_id
  AND retired_native.status='cancelled' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.supplier_payment_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  ))
 AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN managed_supplier_payments p ON p.id=packet.supplier_payment_id WHERE p.obligation_id=o.id AND packet.state IN('processing','uncertain')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_carrier_unpaid_source BEFORE INSERT ON seller_recovery_carrier_unpaid_reviews FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 JOIN company_money_receipts receipt ON receipt.id=NEW.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL  AND c.exposure_paisa=c.confirmed_paisa
 AND actor.status='active' AND actor.id<>seller.user_id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND receipt.kind='bank_credit' AND receipt.status='verified' AND receipt.currency='NPR' AND control.revision=NEW.receipt_revision
 AND receipt.payer_user_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (r.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=r.id)))
 )) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_unpaid_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_carrier_unpaid_original_cap BEFORE INSERT ON seller_recovery_carrier_unpaid_reviews FOR EACH ROW BEGIN IF (NEW.amount_paisa>COALESCE((SELECT (CASE WHEN c.payout_model='fixed' THEN COALESCE((SELECT unpaid_paisa FROM seller_recovery_fixed_original_balances WHERE case_id=c.id),-1)
 WHEN c.payout_model IN('registered','managed') THEN COALESCE((SELECT unpaid.amount_paisa FROM seller_recovery_original_unpaid_reviews unpaid WHERE unpaid.case_id=c.id),0) ELSE 0 END)-COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_unpaid_corrections x WHERE x.case_id=c.id),0)-COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=c.id),0) FROM seller_recovery_cases c WHERE c.id=NEW.case_id),-1)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_unpaid_original_cap_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_fixed_original_cap BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases WHERE id=NEW.case_id AND payout_model='fixed') AND NEW.original_charge_paisa<>COALESCE((SELECT unpaid_paisa FROM seller_recovery_fixed_original_balances WHERE case_id=NEW.case_id),-1)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_fixed_original_cap_required'; END IF; END$$
DELIMITER ;
-- Source parity for 0138; native validation and execution remain held.
CREATE VIEW seller_recovery_original_source_pools AS SELECT 'registered' payout_model,pool.* FROM (SELECT source_pool.*,
  CASE WHEN nativeDebitPaisa<capacityPaisa-usedPaisa THEN nativeDebitPaisa ELSE capacityPaisa-usedPaisa END AS offsetPaisa
  FROM (SELECT native_source.refundId,native_source.sellerId,native_source.orderItemId,native_source.scopeId,native_source.basisPaisa,native_source.remainingPaisa AS nativeRemainingPaisa,native_source.offsetPaisa AS nativeDebitPaisa,
   (COALESCE((SELECT SUM(original.amount_paisa) FROM seller_ledger_entries original WHERE original.order_item_id=native_source.scopeId AND original.seller_id=native_source.sellerId
    AND (original.type IN('sale','commission','reserve_release') OR original.amount_paisa<0 AND original.type NOT IN('refund','commission_reversal','payout'))),0)-COALESCE((SELECT SUM((SELECT SUM(x.amount_paisa) FROM payout_entries included JOIN seller_ledger_entries x ON x.id=included.ledger_entry_id WHERE included.payout_id=p.id AND included.released_at IS NULL AND x.seller_id=native_source.sellerId AND x.order_item_id=native_source.scopeId)) FROM payouts p WHERE p.seller_id=native_source.sellerId AND p.status='paid' AND EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.registered_payout_id=p.id AND t.payout_model='registered' AND t.seller_id=native_source.sellerId AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM payouts original WHERE original.id=p.id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id) AND (SELECT SUM(x.amount_paisa) FROM payout_entries included JOIN seller_ledger_entries x ON x.id=included.ledger_entry_id WHERE included.payout_id=p.id AND included.released_at IS NULL AND x.seller_id=native_source.sellerId AND x.order_item_id=native_source.scopeId)>0),0)) AS capacityPaisa,COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_unpaid_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='registered' AND used.seller_id=native_source.sellerId AND used.scope_id=native_source.scopeId),0)
  +COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_partial_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='registered' AND used.seller_id=native_source.sellerId AND used.scope_id=native_source.scopeId),0) AS usedPaisa FROM (SELECT r.id AS refundId,i.seller_id AS sellerId,i.id AS orderItemId,i.id AS scopeId,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0) AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND (x.amount_paisa<0 OR x.type IN('sale','commission','refund','commission_reversal','reserve_release'))),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id

  WHERE r.id=r.id AND i.seller_id=i.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0))>0
  AND NOT EXISTS(SELECT 1 FROM payout_entries pe JOIN seller_ledger_entries x ON x.id=pe.ledger_entry_id WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND NOT (EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN payouts retired_native ON retired_native.id=retired.payout_id
  WHERE retired.payout_model='registered' AND retired.payout_id=pe.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.registered_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM payout_entries retired_entry WHERE retired_entry.payout_id=retired_native.id AND retired_entry.released_at IS NULL)) OR EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.registered_payout_id=pe.payout_id AND t.payout_model='registered' AND t.seller_id=i.seller_id AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM payouts original WHERE original.id=pe.payout_id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id))) AND COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='refund'),0)=COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='commission_reversal'),0)=r.commission_reversal_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots snapshot WHERE snapshot.order_item_id=i.id)
  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source WHERE NOT EXISTS(SELECT 1 FROM seller_ledger_entries reserve WHERE reserve.seller_id=native_source.sellerId AND reserve.order_item_id=native_source.orderItemId AND reserve.type IN('reserve_hold','reserve_release') GROUP BY reserve.order_item_id HAVING SUM(reserve.amount_paisa)<0)) source_pool
  WHERE capacityPaisa>=usedPaisa AND capacityPaisa<=basisPaisa) pool
UNION ALL
SELECT 'managed' payout_model,pool.* FROM (SELECT source_pool.*,
  CASE WHEN nativeDebitPaisa<capacityPaisa-usedPaisa THEN nativeDebitPaisa ELSE capacityPaisa-usedPaisa END AS offsetPaisa
  FROM (SELECT native_source.refundId,native_source.sellerId,native_source.orderItemId,native_source.scopeId,native_source.basisPaisa,native_source.remainingPaisa AS nativeRemainingPaisa,native_source.offsetPaisa AS nativeDebitPaisa,
   (COALESCE((SELECT SUM(original.amount_paisa) FROM managed_settlement_entries original JOIN managed_entitlements entitlement ON entitlement.id=original.entitlement_id
    WHERE original.entitlement_id=native_source.scopeId AND entitlement.seller_id=native_source.sellerId AND (original.type='earned' OR original.amount_paisa<0
    AND original.type<>'refund_adjustment' AND NOT(original.type='dispute_adjustment' AND original.reason_code='refund_responsibility'))),0)-(COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a JOIN managed_payouts p ON p.id=a.payout_id WHERE a.entitlement_id=native_source.scopeId AND a.amount_paisa>0 AND a.disposition='paid' AND p.seller_id=native_source.sellerId AND p.status='paid' AND EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.managed_payout_id=p.id AND t.payout_model='managed' AND t.seller_id=native_source.sellerId AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM managed_payouts original WHERE original.id=p.id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id)),0)+COALESCE((SELECT SUM((SELECT SUM(x.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries x ON x.id=included.settlement_entry_id WHERE included.payout_id=p.id AND x.entitlement_id=native_source.scopeId AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=x.entitlement_id AND a.disposition='paid'))) FROM managed_payouts p WHERE p.seller_id=native_source.sellerId AND p.status='paid' AND EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.managed_payout_id=p.id AND t.payout_model='managed' AND t.seller_id=native_source.sellerId AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM managed_payouts original WHERE original.id=p.id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id) AND (SELECT SUM(x.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries x ON x.id=included.settlement_entry_id WHERE included.payout_id=p.id AND x.entitlement_id=native_source.scopeId AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=x.entitlement_id AND a.disposition='paid'))>0),0))) AS capacityPaisa,COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_unpaid_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='managed' AND used.seller_id=native_source.sellerId AND used.scope_id=native_source.scopeId),0)
  +COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_partial_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='managed' AND used.seller_id=native_source.sellerId AND used.scope_id=native_source.scopeId),0) AS usedPaisa FROM (SELECT r.id AS refundId,i.seller_id AS sellerId,i.id AS orderItemId,e.id AS scopeId,e.calculated_paisa AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND (x.amount_paisa<0 OR x.type IN('earned','refund_adjustment') OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility') AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews review WHERE review.managed_credit_id=x.id)),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id
  JOIN managed_commercial_snapshots snapshot ON snapshot.order_item_id=i.id AND snapshot.commercial_model='managed_sale_linked_percentage_v1' JOIN managed_entitlements e ON e.snapshot_id=snapshot.id AND e.seller_id=i.seller_id
  WHERE r.id=r.id AND i.seller_id=i.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (e.calculated_paisa)>0
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.entitlement_id=e.id AND NOT (EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_payouts retired_native ON retired_native.id=retired.payout_id
  WHERE retired.payout_model='managed' AND retired.payout_id=a.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations retired_allocation WHERE retired_allocation.payout_id=retired_native.id AND retired_allocation.disposition<>'released')) OR EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.managed_payout_id=a.payout_id AND t.payout_model='managed' AND t.seller_id=i.seller_id AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM managed_payouts original WHERE original.id=a.payout_id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id)))
    AND NOT EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE x.entitlement_id=e.id AND NOT (EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_payouts retired_native ON retired_native.id=retired.payout_id
  WHERE retired.payout_model='managed' AND retired.payout_id=pe.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations retired_allocation WHERE retired_allocation.payout_id=retired_native.id AND retired_allocation.disposition<>'released')) OR EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.managed_payout_id=pe.payout_id AND t.payout_model='managed' AND t.seller_id=i.seller_id AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM managed_payouts original WHERE original.id=pe.payout_id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id))) AND COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)=(CASE WHEN EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='merchandise' AND cost.party='seller' AND cost.seller_id=i.seller_id AND cost.amount_paisa>0)
    THEN COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND x.type='refund_adjustment'),0) ELSE 0 END)
    +COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='original_delivery' AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND e.earned_at IS NOT NULL AND COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.type='earned'),0)=e.calculated_paisa

  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source WHERE 1) source_pool
  WHERE capacityPaisa>=usedPaisa AND capacityPaisa<=basisPaisa) pool;
CREATE TABLE seller_recovery_original_unpaid_pools(payout_model VARCHAR(191) NOT NULL CHECK(payout_model IN('registered','managed')),seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),scope_id VARCHAR(191) NOT NULL,used_paisa BIGINT NOT NULL CHECK(used_paisa>=0 AND used_paisa<=9007199254740991),PRIMARY KEY(payout_model,seller_id,scope_id) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO seller_recovery_original_unpaid_pools(payout_model,seller_id,scope_id,used_paisa) SELECT payout_model,seller_id,scope_id,SUM(amount_paisa) FROM (SELECT c.payout_model,u.seller_id,u.scope_id,u.amount_paisa FROM seller_recovery_original_unpaid_reviews u JOIN seller_recovery_cases c ON c.id=u.case_id) u GROUP BY payout_model,seller_id,scope_id;
DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_partial_registered BEFORE INSERT ON seller_recovery_partial_sources FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_original_source_pools original WHERE original.payout_model='registered' AND original.sellerId=NEW.seller_id AND original.refundId=NEW.refund_id
 AND original.orderItemId=NEW.order_item_id AND original.scopeId=NEW.scope_id AND original.basisPaisa=NEW.basis_paisa AND original.nativeDebitPaisa=NEW.native_charge_paisa
 AND original.nativeRemainingPaisa=json_extract(NEW.source_json,'$.partialUnpaidSource.nativeRemainingPaisa') AND original.capacityPaisa=NEW.capacity_paisa AND original.usedPaisa=NEW.used_paisa AND original.offsetPaisa=NEW.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_partial_shared_original_capacity_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_partial_managed BEFORE INSERT ON seller_recovery_partial_sources FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_original_source_pools original WHERE original.payout_model='managed' AND original.sellerId=NEW.seller_id AND original.refundId=NEW.refund_id
 AND original.orderItemId=NEW.order_item_id AND original.scopeId=NEW.scope_id AND original.basisPaisa=NEW.basis_paisa AND original.nativeDebitPaisa=NEW.native_charge_paisa
 AND original.nativeRemainingPaisa=json_extract(NEW.source_json,'$.partialUnpaidSource.nativeRemainingPaisa') AND original.capacityPaisa=NEW.capacity_paisa AND original.usedPaisa=NEW.used_paisa AND original.offsetPaisa=NEW.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_partial_shared_original_capacity_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_registered_native_proof BEFORE INSERT ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered') AND NOT EXISTS(SELECT 1 FROM seller_recovery_original_source_pools original WHERE original.payout_model='registered' AND original.sellerId=NEW.seller_id AND original.refundId=NEW.refund_id
 AND original.orderItemId=NEW.order_item_id AND original.scopeId=NEW.scope_id AND original.basisPaisa=NEW.basis_paisa AND original.nativeDebitPaisa=NEW.amount_paisa AND original.offsetPaisa=NEW.amount_paisa
 AND original.nativeRemainingPaisa=json_extract(NEW.source_json,'$.unpaidSource.nativeRemainingPaisa') AND original.capacityPaisa-original.usedPaisa-original.offsetPaisa=NEW.remaining_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_original_proof_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_managed_native_proof BEFORE INSERT ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed') AND NOT EXISTS(SELECT 1 FROM seller_recovery_original_source_pools original WHERE original.payout_model='managed' AND original.sellerId=NEW.seller_id AND original.refundId=NEW.refund_id
 AND original.orderItemId=NEW.order_item_id AND original.scopeId=NEW.scope_id AND original.basisPaisa=NEW.basis_paisa AND original.nativeDebitPaisa=NEW.amount_paisa AND original.offsetPaisa=NEW.amount_paisa
 AND original.nativeRemainingPaisa=json_extract(NEW.source_json,'$.unpaidSource.nativeRemainingPaisa') AND original.capacityPaisa-original.usedPaisa-original.offsetPaisa=NEW.remaining_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_original_proof_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_original_pool_insert BEFORE INSERT ON seller_recovery_original_unpaid_pools FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_original_unpaid_pools p WHERE p.payout_model=NEW.payout_model AND p.seller_id=NEW.seller_id AND p.scope_id=NEW.scope_id) AND NEW.used_paisa<>COALESCE((SELECT SUM(u.amount_paisa) FROM seller_recovery_original_unpaid_reviews u JOIN seller_recovery_cases c ON c.id=u.case_id WHERE c.payout_model=NEW.payout_model AND u.seller_id=NEW.seller_id AND u.scope_id=NEW.scope_id),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_original_pool_projection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_original_pool_update BEFORE UPDATE ON seller_recovery_original_unpaid_pools FOR EACH ROW BEGIN IF (NEW.payout_model<>OLD.payout_model OR NEW.seller_id<>OLD.seller_id OR NEW.scope_id<>OLD.scope_id OR NEW.used_paisa<>COALESCE((SELECT SUM(u.amount_paisa) FROM seller_recovery_original_unpaid_reviews u JOIN seller_recovery_cases c ON c.id=u.case_id WHERE c.payout_model=NEW.payout_model AND u.seller_id=NEW.seller_id AND u.scope_id=NEW.scope_id),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_original_pool_projection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_original_pool_delete BEFORE DELETE ON seller_recovery_original_unpaid_pools FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_original_pool_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_original_pool_consume_0 AFTER INSERT ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN INSERT INTO seller_recovery_original_unpaid_pools(payout_model,seller_id,scope_id,used_paisa) VALUES((SELECT payout_model FROM seller_recovery_cases WHERE id=NEW.case_id),NEW.seller_id,NEW.scope_id,NEW.amount_paisa) ON DUPLICATE KEY UPDATE used_paisa=CASE WHEN used_paisa=COALESCE(json_extract(NEW.source_json,'$.partialUnpaidSource.usedPaisa'),json_extract(NEW.source_json,'$.unpaidSource.usedPaisa'),-1) THEN used_paisa+NEW.amount_paisa ELSE -1 END; END$$
CREATE OR REPLACE TRIGGER recovery_original_pool_consume_1 AFTER INSERT ON seller_recovery_partial_sources FOR EACH ROW BEGIN INSERT INTO seller_recovery_original_unpaid_pools(payout_model,seller_id,scope_id,used_paisa) VALUES((SELECT payout_model FROM seller_recovery_cases WHERE id=NEW.case_id),NEW.seller_id,NEW.scope_id,NEW.amount_paisa) ON DUPLICATE KEY UPDATE used_paisa=CASE WHEN used_paisa=COALESCE(json_extract(NEW.source_json,'$.partialUnpaidSource.usedPaisa'),json_extract(NEW.source_json,'$.unpaidSource.usedPaisa'),-1) THEN used_paisa+NEW.amount_paisa ELSE -1 END; END$$
DELIMITER ;
-- Source parity for 0139 under implementation; native verification and execution remain held.
CREATE TABLE seller_recovery_receipt_reversal_reviews(
 id VARCHAR(191) PRIMARY KEY,reversal_id VARCHAR(191) NOT NULL UNIQUE REFERENCES company_receipt_reversals(id),receipt_id VARCHAR(191) NOT NULL REFERENCES company_money_receipts(id),
 receipt_revision BIGINT NOT NULL,state VARCHAR(191) NOT NULL CHECK(state IN('planned','completed')),amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 unallocated_paisa BIGINT NOT NULL CHECK(unallocated_paisa>=0 AND unallocated_paisa<=amount_paisa),source_json TEXT NOT NULL CHECK(json_valid(source_json)),plan_json TEXT NOT NULL CHECK(json_valid(plan_json)),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,completed_at BIGINT,evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE seller_recovery_receipt_reversal_parts(
 id VARCHAR(191) PRIMARY KEY,review_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_receipt_reversal_reviews(id),case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 allocation_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_allocations(id),amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 company_loss_paisa BIGINT NOT NULL CHECK(company_loss_paisa>=0 AND company_loss_paisa<=amount_paisa),
 registered_debit_id VARCHAR(191) UNIQUE REFERENCES seller_ledger_entries(id),managed_debit_id VARCHAR(191) UNIQUE REFERENCES managed_settlement_entries(id),fixed_obligation_id VARCHAR(191) REFERENCES managed_supplier_obligations(id),
 registered_company_credit_id VARCHAR(191) UNIQUE REFERENCES seller_ledger_entries(id),managed_company_credit_id VARCHAR(191) UNIQUE REFERENCES managed_settlement_entries(id),
 UNIQUE(review_id,allocation_id)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE seller_recovery_restoration_reclassifications(
 id VARCHAR(191) PRIMARY KEY,part_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_receipt_reversal_parts(id),restoration_id VARCHAR(191) NOT NULL,amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),UNIQUE(part_id,restoration_id)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX recovery_receipt_reversal_case ON seller_recovery_receipt_reversal_parts(case_id,allocation_id);
CREATE INDEX recovery_receipt_reversal_receipt ON seller_recovery_receipt_reversal_reviews(receipt_id,state);
CREATE VIEW seller_recovery_reversed_allocations AS SELECT part.allocation_id,part.case_id,SUM(part.amount_paisa) amount_paisa,SUM(part.company_loss_paisa) company_loss_paisa FROM seller_recovery_receipt_reversal_parts part JOIN seller_recovery_receipt_reversal_reviews review ON review.id=part.review_id WHERE review.state='completed' GROUP BY part.allocation_id,part.case_id;
CREATE VIEW seller_recovery_raw_restorations AS
 SELECT id,case_id,allocation_id,method,amount_paisa,correction_id,NULL AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,review_id AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_carrier_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,NULL AS carrier_review_id,review_id AS payout_return_review_id FROM seller_recovery_payout_return_restorations
 UNION ALL SELECT id,case_id,allocation_id,'carrier' AS method,amount_paisa,NULL AS correction_id,NULL AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_carrier_unpaid_reviews;
DROP VIEW seller_recovery_all_restorations;
CREATE VIEW seller_recovery_all_restorations AS SELECT original.id,original.case_id,original.allocation_id,original.method,
 original.amount_paisa-COALESCE((SELECT SUM(reclass.amount_paisa) FROM seller_recovery_restoration_reclassifications reclass JOIN seller_recovery_receipt_reversal_parts part ON part.id=reclass.part_id JOIN seller_recovery_receipt_reversal_reviews review ON review.id=part.review_id WHERE reclass.restoration_id=original.id AND part.case_id=original.case_id AND part.allocation_id=original.allocation_id AND review.state='completed'),0) amount_paisa,
 original.correction_id,original.carrier_review_id,original.payout_return_review_id FROM seller_recovery_raw_restorations original;
DROP VIEW seller_recovery_original_source_pools;
CREATE VIEW seller_recovery_original_source_pools AS SELECT 'registered' payout_model,pool.* FROM (SELECT source_pool.*,
  CASE WHEN nativeDebitPaisa<capacityPaisa-usedPaisa THEN nativeDebitPaisa ELSE capacityPaisa-usedPaisa END AS offsetPaisa
  FROM (SELECT native_source.refundId,native_source.sellerId,native_source.orderItemId,native_source.scopeId,native_source.basisPaisa,native_source.remainingPaisa AS nativeRemainingPaisa,native_source.offsetPaisa AS nativeDebitPaisa,
   (COALESCE((SELECT SUM(original.amount_paisa) FROM seller_ledger_entries original WHERE original.order_item_id=native_source.scopeId AND original.seller_id=native_source.sellerId
    AND (original.type IN('sale','commission','reserve_release') OR original.amount_paisa<0 AND original.type NOT IN('refund','commission_reversal','payout','recovery_receipt_reversal'))),0)-COALESCE((SELECT SUM((SELECT SUM(x.amount_paisa) FROM payout_entries included JOIN seller_ledger_entries x ON x.id=included.ledger_entry_id WHERE included.payout_id=p.id AND included.released_at IS NULL AND x.seller_id=native_source.sellerId AND x.order_item_id=native_source.scopeId)) FROM payouts p WHERE p.seller_id=native_source.sellerId AND p.status='paid' AND EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.registered_payout_id=p.id AND t.payout_model='registered' AND t.seller_id=native_source.sellerId AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM payouts original WHERE original.id=p.id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id) AND (SELECT SUM(x.amount_paisa) FROM payout_entries included JOIN seller_ledger_entries x ON x.id=included.ledger_entry_id WHERE included.payout_id=p.id AND included.released_at IS NULL AND x.seller_id=native_source.sellerId AND x.order_item_id=native_source.scopeId)>0),0)) AS capacityPaisa,COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_unpaid_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='registered' AND used.seller_id=native_source.sellerId AND used.scope_id=native_source.scopeId),0)
  +COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_partial_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='registered' AND used.seller_id=native_source.sellerId AND used.scope_id=native_source.scopeId),0) AS usedPaisa FROM (SELECT r.id AS refundId,i.seller_id AS sellerId,i.id AS orderItemId,i.id AS scopeId,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0) AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND (x.amount_paisa<0 OR x.type IN('sale','commission','refund','commission_reversal','reserve_release'))),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id

  WHERE r.id=r.id AND i.seller_id=i.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0))>0
  AND NOT EXISTS(SELECT 1 FROM payout_entries pe JOIN seller_ledger_entries x ON x.id=pe.ledger_entry_id WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND NOT (EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN payouts retired_native ON retired_native.id=retired.payout_id
  WHERE retired.payout_model='registered' AND retired.payout_id=pe.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.registered_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM payout_entries retired_entry WHERE retired_entry.payout_id=retired_native.id AND retired_entry.released_at IS NULL)) OR EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.registered_payout_id=pe.payout_id AND t.payout_model='registered' AND t.seller_id=i.seller_id AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM payouts original WHERE original.id=pe.payout_id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id))) AND COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='refund'),0)=COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='commission_reversal'),0)=r.commission_reversal_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots snapshot WHERE snapshot.order_item_id=i.id)
  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source WHERE NOT EXISTS(SELECT 1 FROM seller_ledger_entries reserve WHERE reserve.seller_id=native_source.sellerId AND reserve.order_item_id=native_source.orderItemId AND reserve.type IN('reserve_hold','reserve_release') GROUP BY reserve.order_item_id HAVING SUM(reserve.amount_paisa)<0)) source_pool
  WHERE capacityPaisa>=usedPaisa AND capacityPaisa<=basisPaisa) pool
UNION ALL
SELECT 'managed' payout_model,pool.* FROM (SELECT source_pool.*,
  CASE WHEN nativeDebitPaisa<capacityPaisa-usedPaisa THEN nativeDebitPaisa ELSE capacityPaisa-usedPaisa END AS offsetPaisa
  FROM (SELECT native_source.refundId,native_source.sellerId,native_source.orderItemId,native_source.scopeId,native_source.basisPaisa,native_source.remainingPaisa AS nativeRemainingPaisa,native_source.offsetPaisa AS nativeDebitPaisa,
   (COALESCE((SELECT SUM(original.amount_paisa) FROM managed_settlement_entries original JOIN managed_entitlements entitlement ON entitlement.id=original.entitlement_id
    WHERE original.entitlement_id=native_source.scopeId AND entitlement.seller_id=native_source.sellerId AND (original.type='earned' OR original.amount_paisa<0
    AND COALESCE(original.reason_code,'')<>'recovery_receipt_reversal' AND original.type<>'refund_adjustment' AND NOT(original.type='dispute_adjustment' AND original.reason_code='refund_responsibility'))),0)-(COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a JOIN managed_payouts p ON p.id=a.payout_id WHERE a.entitlement_id=native_source.scopeId AND a.amount_paisa>0 AND a.disposition='paid' AND p.seller_id=native_source.sellerId AND p.status='paid' AND EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.managed_payout_id=p.id AND t.payout_model='managed' AND t.seller_id=native_source.sellerId AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM managed_payouts original WHERE original.id=p.id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id)),0)+COALESCE((SELECT SUM((SELECT SUM(x.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries x ON x.id=included.settlement_entry_id WHERE included.payout_id=p.id AND x.entitlement_id=native_source.scopeId AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=x.entitlement_id AND a.disposition='paid'))) FROM managed_payouts p WHERE p.seller_id=native_source.sellerId AND p.status='paid' AND EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.managed_payout_id=p.id AND t.payout_model='managed' AND t.seller_id=native_source.sellerId AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM managed_payouts original WHERE original.id=p.id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id) AND (SELECT SUM(x.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries x ON x.id=included.settlement_entry_id WHERE included.payout_id=p.id AND x.entitlement_id=native_source.scopeId AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=x.entitlement_id AND a.disposition='paid'))>0),0))) AS capacityPaisa,COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_unpaid_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='managed' AND used.seller_id=native_source.sellerId AND used.scope_id=native_source.scopeId),0)
  +COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_partial_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='managed' AND used.seller_id=native_source.sellerId AND used.scope_id=native_source.scopeId),0) AS usedPaisa FROM (SELECT r.id AS refundId,i.seller_id AS sellerId,i.id AS orderItemId,e.id AS scopeId,e.calculated_paisa AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND (x.amount_paisa<0 OR x.type IN('earned','refund_adjustment') OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility') AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews review WHERE review.managed_credit_id=x.id)),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id
  JOIN managed_commercial_snapshots snapshot ON snapshot.order_item_id=i.id AND snapshot.commercial_model='managed_sale_linked_percentage_v1' JOIN managed_entitlements e ON e.snapshot_id=snapshot.id AND e.seller_id=i.seller_id
  WHERE r.id=r.id AND i.seller_id=i.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (e.calculated_paisa)>0
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.entitlement_id=e.id AND NOT (EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_payouts retired_native ON retired_native.id=retired.payout_id
  WHERE retired.payout_model='managed' AND retired.payout_id=a.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations retired_allocation WHERE retired_allocation.payout_id=retired_native.id AND retired_allocation.disposition<>'released')) OR EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.managed_payout_id=a.payout_id AND t.payout_model='managed' AND t.seller_id=i.seller_id AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM managed_payouts original WHERE original.id=a.payout_id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id)))
    AND NOT EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE x.entitlement_id=e.id AND NOT (EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_payouts retired_native ON retired_native.id=retired.payout_id
  WHERE retired.payout_model='managed' AND retired.payout_id=pe.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations retired_allocation WHERE retired_allocation.payout_id=retired_native.id AND retired_allocation.disposition<>'released')) OR EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.managed_payout_id=pe.payout_id AND t.payout_model='managed' AND t.seller_id=i.seller_id AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM managed_payouts original WHERE original.id=pe.payout_id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id))) AND COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)=(CASE WHEN EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='merchandise' AND cost.party='seller' AND cost.seller_id=i.seller_id AND cost.amount_paisa>0)
    THEN COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND x.type='refund_adjustment'),0) ELSE 0 END)
    +COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='original_delivery' AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND e.earned_at IS NOT NULL AND COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.type='earned'),0)=e.calculated_paisa

  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source WHERE 1) source_pool
  WHERE capacityPaisa>=usedPaisa AND capacityPaisa<=basisPaisa) pool;
DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_receipt_review_source BEFORE INSERT ON seller_recovery_receipt_reversal_reviews FOR EACH ROW BEGIN IF (NEW.state<>'planned' OR NEW.completed_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversal JOIN company_money_receipts receipt ON receipt.id=reversal.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE reversal.id=NEW.reversal_id AND reversal.receipt_id=NEW.receipt_id AND reversal.amount_minor=NEW.amount_paisa AND control.revision=NEW.receipt_revision AND receipt.kind='bank_credit' AND receipt.currency='NPR' AND actor.status='active' AND COALESCE(receipt.payer_user_id,'')<>actor.id
 AND NEW.unallocated_paisa<=receipt.amount_minor-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.receipt_id=receipt.id),0)-COALESCE((SELECT SUM(u.amount_minor) FROM manual_receipt_uses u WHERE u.receipt_id=receipt.id AND u.state<>'released'),0)-COALESCE((SELECT SUM(prior.unallocated_paisa) FROM seller_recovery_receipt_reversal_reviews prior WHERE prior.receipt_id=receipt.id),0)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN seller_recovery_cases c ON c.id=a.case_id JOIN seller_profiles seller ON seller.id=c.seller_id WHERE a.receipt_id=receipt.id AND (seller.user_id=actor.id OR json_extract(c.original_source_json,'$.ownerId')=actor.id OR json_extract(c.original_source_json,'$.customerId')=actor.id)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_immutable_0_update BEFORE UPDATE ON seller_recovery_receipt_reversal_parts FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_immutable_0_delete BEFORE DELETE ON seller_recovery_receipt_reversal_parts FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_immutable_1_update BEFORE UPDATE ON seller_recovery_restoration_reclassifications FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_immutable_1_delete BEFORE DELETE ON seller_recovery_restoration_reclassifications FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_review_completion BEFORE UPDATE ON seller_recovery_receipt_reversal_reviews FOR EACH ROW BEGIN IF (OLD.state<>'planned' OR NEW.state<>'completed' OR NEW.completed_at IS NULL OR NEW.id<>OLD.id OR NEW.reversal_id<>OLD.reversal_id OR NEW.receipt_id<>OLD.receipt_id OR NEW.receipt_revision<>OLD.receipt_revision OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.unallocated_paisa<>OLD.unallocated_paisa OR NEW.source_json<>OLD.source_json OR NEW.plan_json<>OLD.plan_json OR NEW.actor_id<>OLD.actor_id OR NEW.request_id<>OLD.request_id OR NEW.created_at<>OLD.created_at OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.reason<>OLD.reason OR NEW.public_message<>OLD.public_message
 OR NOT EXISTS(SELECT 1 FROM company_receipt_controls control JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin' WHERE control.receipt_id=NEW.receipt_id AND control.revision=NEW.receipt_revision+1 AND actor.status='active')
 OR NEW.amount_paisa<>NEW.unallocated_paisa+COALESCE((SELECT SUM(part.amount_paisa) FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id),0)
 OR (SELECT COUNT(*) FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id)<>JSON_LENGTH(NEW.plan_json,'$.parts')
 OR EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id AND part.company_loss_paisa<>COALESCE((SELECT SUM(reclass.amount_paisa) FROM seller_recovery_restoration_reclassifications reclass WHERE reclass.part_id=part.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_complete_projection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_part_source BEFORE INSERT ON seller_recovery_receipt_reversal_parts FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews review JOIN company_receipt_controls control ON control.receipt_id=review.receipt_id JOIN seller_recovery_allocations a ON a.id=NEW.allocation_id JOIN seller_recovery_cases c ON c.id=a.case_id
 WHERE review.id=NEW.review_id AND review.state='planned' AND control.revision=review.receipt_revision+1 AND a.receipt_id=review.receipt_id AND c.id=NEW.case_id AND c.revision=NEW.case_revision
 AND JSON_CONTAINS(review.plan_json,JSON_OBJECT('id',NEW.id,'allocationId',NEW.allocation_id,'caseId',NEW.case_id,'caseRevision',NEW.case_revision,'amountPaisa',NEW.amount_paisa,'companyLossPaisa',NEW.company_loss_paisa,'registeredDebitId',NEW.registered_debit_id,'managedDebitId',NEW.managed_debit_id,'fixedObligationId',NEW.fixed_obligation_id,'registeredCompanyCreditId',NEW.registered_company_credit_id,'managedCompanyCreditId',NEW.managed_company_credit_id),'$.parts')
 AND NEW.amount_paisa<=a.amount_paisa-COALESCE((SELECT SUM(prior.amount_paisa) FROM seller_recovery_receipt_reversal_parts prior WHERE prior.allocation_id=a.id),0)
 AND (c.payout_model='registered' AND NEW.managed_debit_id IS NULL AND NEW.fixed_obligation_id IS NULL AND NEW.managed_company_credit_id IS NULL
  AND EXISTS(SELECT 1 FROM seller_ledger_entries debit JOIN seller_ledger_entries original ON original.id=a.registered_credit_id WHERE debit.id=NEW.registered_debit_id AND debit.seller_id=c.seller_id AND debit.order_item_id=original.order_item_id AND debit.type='recovery_receipt_reversal' AND debit.amount_paisa=-NEW.amount_paisa)
  AND (NEW.company_loss_paisa=0 AND NEW.registered_company_credit_id IS NULL OR EXISTS(SELECT 1 FROM seller_ledger_entries credit JOIN seller_ledger_entries debit ON debit.id=NEW.registered_debit_id WHERE credit.id=NEW.registered_company_credit_id AND credit.seller_id=c.seller_id AND credit.order_item_id=debit.order_item_id AND credit.type='recovery_bank_loss' AND credit.amount_paisa=NEW.company_loss_paisa AND NEW.company_loss_paisa>0))
 OR c.payout_model='managed' AND NEW.registered_debit_id IS NULL AND NEW.fixed_obligation_id IS NULL AND NEW.registered_company_credit_id IS NULL
  AND EXISTS(SELECT 1 FROM managed_settlement_entries debit JOIN managed_settlement_entries original ON original.id=a.managed_credit_id WHERE debit.id=NEW.managed_debit_id AND debit.entitlement_id=original.entitlement_id AND debit.refund_id=c.refund_id AND debit.reason_code='recovery_receipt_reversal' AND debit.amount_paisa=-NEW.amount_paisa AND json_extract(debit.metadata_json,'$.partId')=NEW.id AND json_extract(debit.metadata_json,'$.reviewId')=review.id)
  AND (NEW.company_loss_paisa=0 AND NEW.managed_company_credit_id IS NULL OR EXISTS(SELECT 1 FROM managed_settlement_entries credit JOIN managed_settlement_entries debit ON debit.id=NEW.managed_debit_id WHERE credit.id=NEW.managed_company_credit_id AND credit.entitlement_id=debit.entitlement_id AND credit.refund_id=c.refund_id AND credit.reason_code='recovery_bank_loss' AND credit.amount_paisa=NEW.company_loss_paisa AND NEW.company_loss_paisa>0))
 OR c.payout_model='fixed' AND NEW.registered_debit_id IS NULL AND NEW.managed_debit_id IS NULL AND NEW.registered_company_credit_id IS NULL AND NEW.managed_company_credit_id IS NULL
  AND EXISTS(SELECT 1 FROM managed_supplier_recovery_credits original JOIN managed_supplier_adjustments adjustment ON adjustment.id=c.supplier_adjustment_id WHERE original.id=a.fixed_credit_id AND original.case_id=c.id AND original.obligation_id=NEW.fixed_obligation_id AND adjustment.obligation_id=NEW.fixed_obligation_id)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_exact_attribution_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_part_loss BEFORE INSERT ON seller_recovery_receipt_reversal_parts FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN seller_recovery_receipt_reversal_reviews review ON review.id=NEW.review_id WHERE a.id=NEW.allocation_id
 AND NEW.company_loss_paisa=(CASE WHEN (COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=NEW.allocation_id),0)-(a.amount_paisa-COALESCE((SELECT SUM(prior.amount_paisa) FROM seller_recovery_receipt_reversal_parts prior WHERE prior.allocation_id=a.id),0)-NEW.amount_paisa))>0 THEN (COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=NEW.allocation_id),0)-(a.amount_paisa-COALESCE((SELECT SUM(prior.amount_paisa) FROM seller_recovery_receipt_reversal_parts prior WHERE prior.allocation_id=a.id),0)-NEW.amount_paisa)) ELSE 0 END)
 AND (NEW.company_loss_paisa=0 OR JSON_CONTAINS(review.plan_json,CONCAT('{"id":',JSON_QUOTE(NEW.id),',"companyLossApproved":true}'),'$.parts')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_exact_company_loss_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_registered_entry_source BEFORE INSERT ON seller_ledger_entries FOR EACH ROW BEGIN IF (NEW.type IN('recovery_receipt_reversal','recovery_bank_loss') AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews review JOIN seller_recovery_cases c ON c.seller_id=NEW.seller_id WHERE review.state='planned' AND c.payout_model='registered' AND abs(NEW.amount_paisa)<=review.amount_paisa AND (NEW.type='recovery_receipt_reversal' AND NEW.amount_paisa<0 AND JSON_CONTAINS(review.plan_json,JSON_OBJECT('caseId',c.id,'caseRevision',c.revision,'registeredDebitId',NEW.id,'amountPaisa',-NEW.amount_paisa),'$.parts') OR NEW.type='recovery_bank_loss' AND NEW.amount_paisa>0 AND JSON_CONTAINS(review.plan_json,JSON_OBJECT('caseId',c.id,'caseRevision',c.revision,'registeredCompanyCreditId',NEW.id,'companyLossPaisa',NEW.amount_paisa),'$.parts')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_native_plan_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_managed_entry_source BEFORE INSERT ON managed_settlement_entries FOR EACH ROW BEGIN IF (NEW.reason_code IN('recovery_receipt_reversal','recovery_bank_loss') AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews review JOIN managed_entitlements entitlement ON entitlement.id=NEW.entitlement_id JOIN seller_recovery_cases c ON c.seller_id=entitlement.seller_id AND c.refund_id=NEW.refund_id WHERE review.id=json_extract(NEW.metadata_json,'$.reviewId') AND review.state='planned' AND c.payout_model='managed' AND NEW.created_by=review.actor_id AND abs(NEW.amount_paisa)<=review.amount_paisa AND (NEW.reason_code='recovery_receipt_reversal' AND NEW.amount_paisa<0 AND JSON_CONTAINS(review.plan_json,JSON_OBJECT('id',json_extract(NEW.metadata_json,'$.partId'),'caseId',c.id,'caseRevision',c.revision,'managedDebitId',NEW.id,'amountPaisa',-NEW.amount_paisa),'$.parts') OR NEW.reason_code='recovery_bank_loss' AND NEW.amount_paisa>0 AND JSON_CONTAINS(review.plan_json,JSON_OBJECT('id',json_extract(NEW.metadata_json,'$.partId'),'caseId',c.id,'caseRevision',c.revision,'managedCompanyCreditId',NEW.id,'companyLossPaisa',NEW.amount_paisa),'$.parts')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_native_plan_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_registered_entry_update BEFORE UPDATE ON seller_ledger_entries FOR EACH ROW BEGIN IF (OLD.type IN('recovery_receipt_reversal','recovery_bank_loss') OR NEW.type IN('recovery_receipt_reversal','recovery_bank_loss')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_native_entry_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_registered_entry_delete BEFORE DELETE ON seller_ledger_entries FOR EACH ROW BEGIN IF (OLD.type IN('recovery_receipt_reversal','recovery_bank_loss')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_native_entry_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_managed_entry_update BEFORE UPDATE ON managed_settlement_entries FOR EACH ROW BEGIN IF (OLD.reason_code IN('recovery_receipt_reversal','recovery_bank_loss') OR NEW.reason_code IN('recovery_receipt_reversal','recovery_bank_loss')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_native_entry_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_managed_entry_delete BEFORE DELETE ON managed_settlement_entries FOR EACH ROW BEGIN IF (OLD.reason_code IN('recovery_receipt_reversal','recovery_bank_loss')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_native_entry_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_restoration_source BEFORE INSERT ON seller_recovery_restoration_reclassifications FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_parts part JOIN seller_recovery_receipt_reversal_reviews review ON review.id=part.review_id JOIN seller_recovery_raw_restorations original ON original.id=NEW.restoration_id AND original.case_id=part.case_id AND original.allocation_id=part.allocation_id
 WHERE part.id=NEW.part_id AND review.state='planned' AND NEW.amount_paisa<=part.company_loss_paisa-COALESCE((SELECT SUM(prior.amount_paisa) FROM seller_recovery_restoration_reclassifications prior WHERE prior.part_id=part.id),0)
 AND NEW.amount_paisa<=original.amount_paisa-COALESCE((SELECT SUM(prior.amount_paisa) FROM seller_recovery_restoration_reclassifications prior WHERE prior.restoration_id=original.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_original_restoration_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_review_retained BEFORE DELETE ON seller_recovery_receipt_reversal_reviews FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_allocation_cap BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.blocker IS NULL AND (
 NEW.method IN('cash','earnings') AND c.state IN('open','part_recovered','repayment_plan','disputed') AND c.approved_by IS NOT NULL AND c.approved_cap_paisa<=c.confirmed_paisa
 AND NEW.amount_paisa<=c.approved_cap_paisa-c.absorbed_paisa-c.disputed_paisa-c.historical_recovered_paisa+c.restored_paisa-COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)
 OR NEW.method='returned_payout' AND EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id
 AND review.restored_paisa-review.principal_excess_paisa=COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id AND r.kind='seller_collection'),0)
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.disputed_paisa+review.resolved_disputed_paisa-c.historical_recovered_paisa+c.restored_paisa+review.restored_paisa-COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))
 OR NEW.method='carrier' AND EXISTS(SELECT 1 FROM seller_recovery_carrier_unpaid_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id)
 OR NEW.method='carrier' AND EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id
 AND review.restored_paisa=COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_carrier_restorations r WHERE r.review_id=review.id),0)
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.disputed_paisa+review.resolved_disputed_paisa-c.historical_recovered_paisa+c.restored_paisa+review.restored_paisa-COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_remaining_cap_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_cap BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id
 AND r.status='verified' AND r.currency='NPR'
 AND NOT EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.receipt_id=r.id AND e.kind='receipt_reversal' AND e.state<>'resolved')
 AND NEW.amount_paisa<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)
 -COALESCE((SELECT SUM(u.amount_minor) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)
 -COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_balance_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER manual_receipt_recovery_cap BEFORE INSERT ON manual_receipt_uses FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id
 AND NEW.amount_minor<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)
 -COALESCE((SELECT SUM(u.amount_minor) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)
 -COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_receipt_recovery_balance_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_reduction_cap BEFORE INSERT ON seller_recovery_reductions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.blocker IS NULL
 AND c.approved_by IS NOT NULL AND c.state IN('open','part_recovered','disputed','repayment_plan')
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.historical_recovered_paisa+c.restored_paisa
 -COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_reduction_remaining_cap_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_correction_current_source BEFORE INSERT ON seller_recovery_liability_corrections FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision
 AND c.confirmed_paisa=NEW.old_confirmed_paisa AND c.absorbed_paisa=NEW.old_absorbed_paisa AND c.blocker IS NULL
 AND NEW.restored_paisa=GREATEST(0,c.historical_recovered_paisa+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa-NEW.new_confirmed_paisa+NEW.new_absorbed_paisa)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (NOT (r.status IN('verified','reversed') AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=r.id
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed')))))
 AND (
  c.payout_model='registered' AND NEW.managed_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL AND
   (NEW.native_credit_paisa=0 AND NEW.registered_credit_id IS NULL OR EXISTS(SELECT 1 FROM seller_ledger_entries e WHERE e.id=NEW.registered_credit_id AND e.seller_id=c.seller_id AND e.type='recovery_correction' AND e.refund_id IS NULL AND e.amount_paisa=NEW.native_credit_paisa))
  OR c.payout_model='managed' AND NEW.registered_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL AND
   (NEW.native_credit_paisa=0 AND NEW.managed_credit_id IS NULL OR EXISTS(SELECT 1 FROM managed_settlement_entries e JOIN managed_entitlements entitlement ON entitlement.id=e.entitlement_id WHERE e.id=NEW.managed_credit_id AND entitlement.seller_id=c.seller_id AND e.refund_id=c.refund_id AND e.reason_code='recovery_correction' AND e.type='dispute_adjustment' AND e.amount_paisa=NEW.native_credit_paisa))
  OR c.payout_model='fixed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL AND EXISTS(SELECT 1 FROM managed_supplier_adjustments a JOIN managed_supplier_obligations o ON o.id=a.obligation_id WHERE a.id=c.supplier_adjustment_id AND o.id=NEW.fixed_obligation_id AND o.seller_id=c.seller_id)
 ))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_correction_current_original_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_restoration_source BEFORE INSERT ON seller_recovery_restorations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections correction JOIN seller_recovery_cases c ON c.id=correction.case_id
 WHERE correction.id=NEW.correction_id AND c.id=NEW.case_id AND c.revision=correction.case_revision
 AND NEW.amount_paisa<=correction.restored_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.correction_id=correction.id),0)
 AND (NEW.allocation_id IS NULL AND NEW.method='earnings' AND NEW.amount_paisa<=c.historical_recovered_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.case_id=c.id AND r.allocation_id IS NULL),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.case_id=c.id AND a.method=NEW.method AND NEW.amount_paisa<=a.amount_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.allocation_id=a.id),0))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_restoration_original_collection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_correction_projection BEFORE UPDATE ON seller_recovery_cases FOR EACH ROW BEGIN IF (NEW.liability_reduced_paisa<>COALESCE((SELECT SUM(x.old_confirmed_paisa-x.new_confirmed_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)
 OR NEW.restored_paisa<>COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_carrier_reviews x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_payout_return_reviews x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=NEW.id),0)-COALESCE((SELECT SUM(part.company_loss_paisa) FROM seller_recovery_receipt_reversal_parts part JOIN seller_recovery_receipt_reversal_reviews review ON review.id=part.review_id WHERE part.case_id=NEW.id AND review.state='completed'),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id AND x.restored_paisa<>COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.correction_id=x.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_correction_complete_projection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_source BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa=0 AND c.exposure_paisa=0
 AND c.approved_cap_paisa=0 AND c.absorbed_paisa=0 AND c.historical_recovered_paisa=0 AND c.disputed_paisa=0 AND (c.restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=c.id),0) AND c.liability_reduced_paisa=0 OR (EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)) OR (c.payout_model='fixed'
  AND c.liability_reduced_paisa=(SELECT amount_paisa FROM managed_supplier_adjustments WHERE id=c.supplier_adjustment_id)-NEW.original_charge_paisa
  AND c.restored_paisa=COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))
 AND actor.status='active' AND s.user_id<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND (NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_carrier_unpaid_reviews review WHERE review.allocation_id=a.id AND review.case_id=a.case_id AND review.amount_paisa=a.amount_paisa AND a.method='carrier')) OR (EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)) OR (c.payout_model='fixed'
  AND c.liability_reduced_paisa=(SELECT amount_paisa FROM managed_supplier_adjustments WHERE id=c.supplier_adjustment_id)-NEW.original_charge_paisa
  AND c.restored_paisa=COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND (NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id) OR (EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)) OR (c.payout_model='fixed'
  AND c.liability_reduced_paisa=(SELECT amount_paisa FROM managed_supplier_adjustments WHERE id=c.supplier_adjustment_id)-NEW.original_charge_paisa
  AND c.restored_paisa=COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts receipt ON receipt.id=a.receipt_id WHERE a.case_id=c.id
    AND (NOT (receipt.status IN('verified','reversed') AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=receipt.id
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed'))))) AND NEW.previous_restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_unpaid_corrections x WHERE x.case_id=c.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_carrier_current_source BEFORE INSERT ON seller_recovery_carrier_reviews FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 JOIN company_money_receipts receipt ON receipt.id=NEW.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa>0 AND c.exposure_paisa=c.confirmed_paisa
 AND actor.status='active' AND actor.id<>seller.user_id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND receipt.kind='bank_credit' AND receipt.status='verified' AND receipt.currency='NPR' AND control.revision=NEW.receipt_revision
 AND receipt.payer_user_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=receipt.id
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed'))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (NOT (r.status IN('verified','reversed') AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=r.id
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed')))))
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0)
 AND NEW.restored_paisa=GREATEST(0,c.historical_recovered_paisa+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-c.confirmed_paisa+c.absorbed_paisa)
 AND NEW.resolved_disputed_paisa<=c.disputed_paisa
 AND c.disputed_paisa-NEW.resolved_disputed_paisa<=c.confirmed_paisa-c.absorbed_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-NEW.restored_paisa))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_carrier_restoration_source BEFORE INSERT ON seller_recovery_carrier_restorations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews review JOIN seller_recovery_cases c ON c.id=review.case_id WHERE review.id=NEW.review_id AND c.id=NEW.case_id AND c.revision=review.case_revision
 AND NEW.amount_paisa<=review.restored_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_carrier_restorations r WHERE r.review_id=review.id),0)
 AND (NEW.allocation_id IS NULL AND NEW.method='earnings' AND NEW.amount_paisa<=c.historical_recovered_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.case_id=c.id AND r.allocation_id IS NULL),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.case_id=c.id AND a.method=NEW.method AND a.method<>'carrier' AND NEW.amount_paisa<=(a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.allocation_id=a.id),0))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_original_collection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_correction_carrier_boundary BEFORE INSERT ON seller_recovery_liability_corrections FOR EACH ROW BEGIN IF (NEW.new_confirmed_paisa-NEW.new_absorbed_paisa<COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=NEW.case_id AND a.method='carrier'),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_excess_needs_own_disposition'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_payout_return_current BEFORE INSERT ON seller_recovery_payout_return_reviews FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 JOIN company_money_receipts receipt ON receipt.id=NEW.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa>=0 AND c.payout_model=NEW.payout_model AND c.exposure_paisa=c.confirmed_paisa
 AND actor.status='active' AND actor.id<>seller.user_id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND receipt.kind='bank_credit' AND receipt.status='verified' AND receipt.currency='NPR' AND control.revision=NEW.receipt_revision
 AND (receipt.payer_user_id IS NULL OR receipt.payer_user_id=seller.user_id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=receipt.id
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed'))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (NOT (r.status IN('verified','reversed') AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=r.id
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed')))))
 AND c.historical_recovered_paisa+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa>=COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0) AND c.historical_recovered_paisa+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa<=c.confirmed_paisa-c.absorbed_paisa
 AND NEW.principal_excess_paisa=GREATEST(0,NEW.restored_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa)+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0))
 AND NEW.restored_paisa=GREATEST(0,c.historical_recovered_paisa+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-c.confirmed_paisa+c.absorbed_paisa)
 AND NEW.resolved_disputed_paisa<=c.disputed_paisa
 AND c.disputed_paisa-NEW.resolved_disputed_paisa<=c.confirmed_paisa-c.absorbed_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-NEW.restored_paisa))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_payout_return_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_payout_return_restoration BEFORE INSERT ON seller_recovery_payout_return_restorations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews review JOIN seller_recovery_cases c ON c.id=review.case_id WHERE review.id=NEW.review_id AND c.id=NEW.case_id AND c.revision=review.case_revision
 AND NEW.amount_paisa<=review.restored_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id),0)
 AND (NEW.kind='returned_principal' AND NEW.method='returned_payout' AND NEW.allocation_id=review.allocation_id AND NEW.amount_paisa=review.principal_excess_paisa
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id AND r.kind='returned_principal')
  AND EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.case_id=c.id AND a.method='returned_payout' AND a.receipt_id=review.receipt_id AND a.amount_paisa=review.amount_paisa)
 OR NEW.kind='seller_collection'
  AND NEW.amount_paisa<=review.restored_paisa-review.principal_excess_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id AND r.kind='seller_collection'),0)
  AND (NEW.allocation_id IS NULL AND NEW.method='earnings' AND NEW.amount_paisa<=c.historical_recovered_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.case_id=c.id AND r.allocation_id IS NULL),0)
   OR EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.id<>review.allocation_id AND a.case_id=c.id AND a.method=NEW.method AND a.method<>'carrier' AND NEW.amount_paisa<=(a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.allocation_id=a.id),0)))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_payout_return_original_collection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_carrier_unpaid_source BEFORE INSERT ON seller_recovery_carrier_unpaid_reviews FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 JOIN company_money_receipts receipt ON receipt.id=NEW.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL  AND c.exposure_paisa=c.confirmed_paisa
 AND actor.status='active' AND actor.id<>seller.user_id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND receipt.kind='bank_credit' AND receipt.status='verified' AND receipt.currency='NPR' AND control.revision=NEW.receipt_revision
 AND receipt.payer_user_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=receipt.id
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed'))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (NOT (r.status IN('verified','reversed') AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=r.id
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed')))))
 )) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_carrier_unpaid_current_source_required'; END IF; END$$
DELIMITER ;
-- Source parity for 0140; native verification and execution remain held.
CREATE TABLE customer_refund_reversals(
 id VARCHAR(191) PRIMARY KEY,packet_id VARCHAR(191) NOT NULL REFERENCES outgoing_payment_packets(id),obligation_id VARCHAR(191) NOT NULL REFERENCES refund_obligations(id),receipt_id VARCHAR(191) NOT NULL UNIQUE REFERENCES company_money_receipts(id),amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,created_at BIGINT NOT NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE customer_refund_reversal_dispositions(
 id VARCHAR(191) PRIMARY KEY,reversal_id VARCHAR(191) NOT NULL UNIQUE REFERENCES customer_refund_reversals(id),case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,kind VARCHAR(191) NOT NULL CHECK(kind IN('retain','restore')),retry_obligation_id VARCHAR(191) UNIQUE REFERENCES refund_obligations(id),correction_id VARCHAR(191) REFERENCES seller_recovery_liability_corrections(id),actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL,evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,created_at BIGINT NOT NULL,
 CHECK(kind='retain' AND retry_obligation_id IS NOT NULL AND correction_id IS NULL OR kind='restore' AND retry_obligation_id IS NULL AND correction_id IS NOT NULL)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE customer_refund_return_pools(packet_id VARCHAR(191) PRIMARY KEY REFERENCES outgoing_payment_packets(id),used_paisa BIGINT NOT NULL CHECK(used_paisa>0 AND used_paisa<=9007199254740991) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE OR REPLACE TRIGGER customer_refund_reversal_original BEFORE INSERT ON customer_refund_reversals FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM outgoing_payment_packets packet JOIN refund_obligations original ON original.id=packet.obligation_id JOIN company_money_receipts receipt ON receipt.id=NEW.receipt_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE packet.id=NEW.packet_id AND original.id=NEW.obligation_id AND original.source_kind='return_refund' AND original.state='completed' AND packet.state='paid' AND packet.currency='NPR'
 AND EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa AND bank.identity_hash=packet.transaction_identity_hash AND bank.account_version_id=packet.account_version_id)
 AND receipt.kind='bank_credit' AND receipt.status='verified' AND receipt.currency='NPR' AND receipt.payer_user_id=original.customer_id AND receipt.account_version_id=packet.account_version_id AND receipt.bank_at>packet.bank_at AND receipt.amount_minor=NEW.amount_paisa
 AND NEW.amount_paisa<=packet.amount_paisa-COALESCE((SELECT SUM(prior.amount_paisa) FROM customer_refund_reversals prior WHERE prior.packet_id=packet.id),0)
 AND actor.status='active' AND actor.id<>original.customer_id AND NOT EXISTS(SELECT 1 FROM order_items item JOIN seller_profiles personal_seller ON personal_seller.id=item.seller_id WHERE item.order_id=original.order_id AND personal_seller.user_id=actor.id) AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases retained WHERE retained.refund_id=original.source_id AND (JSON_UNQUOTE(JSON_EXTRACT(retained.original_source_json,'$.ownerId'))=actor.id OR JSON_UNQUOTE(JSON_EXTRACT(retained.original_source_json,'$.customerId'))=actor.id)) AND NOT EXISTS(SELECT 1 FROM company_payment_account_versions account LEFT JOIN company_payment_accounts head ON head.latest_version_id=account.id LEFT JOIN company_payment_account_versions retained_account ON retained_account.id=receipt.account_version_id WHERE (account.id=receipt.account_version_id OR head.id=retained_account.account_id) AND JSON_CONTAINS(account.conflicts_json,JSON_QUOTE(actor.id))=1) AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id) AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id)
 AND NOT EXISTS(SELECT 1 FROM manual_receipt_uses used WHERE used.receipt_id=receipt.id AND used.state<>'released') AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations used WHERE used.receipt_id=receipt.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_refund_actual_return_required'; END IF; END$$
CREATE OR REPLACE TRIGGER customer_refund_disposition_source BEFORE INSERT ON customer_refund_reversal_dispositions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM customer_refund_reversals reversal JOIN refund_obligations original ON original.id=reversal.obligation_id JOIN company_money_receipts receipt ON receipt.id=reversal.receipt_id JOIN seller_recovery_cases c ON c.refund_id=original.source_id JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE reversal.id=NEW.reversal_id AND c.id=NEW.case_id AND actor.status='active' AND actor.id<>original.customer_id AND NOT EXISTS(SELECT 1 FROM order_items item JOIN seller_profiles personal_seller ON personal_seller.id=item.seller_id WHERE item.order_id=original.order_id AND personal_seller.user_id=actor.id) AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases retained WHERE retained.refund_id=original.source_id AND (JSON_UNQUOTE(JSON_EXTRACT(retained.original_source_json,'$.ownerId'))=actor.id OR JSON_UNQUOTE(JSON_EXTRACT(retained.original_source_json,'$.customerId'))=actor.id)) AND NOT EXISTS(SELECT 1 FROM company_payment_account_versions account LEFT JOIN company_payment_accounts head ON head.latest_version_id=account.id LEFT JOIN company_payment_account_versions retained_account ON retained_account.id=receipt.account_version_id WHERE (account.id=receipt.account_version_id OR head.id=retained_account.account_id) AND JSON_CONTAINS(account.conflicts_json,JSON_QUOTE(actor.id))=1) AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id) AND actor.id<>seller.user_id AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(c.original_source_json,'$.ownerId')),'')<>actor.id
 AND ((NEW.kind='retain' AND c.revision=NEW.case_revision AND EXISTS(SELECT 1 FROM refund_obligations retry JOIN manual_receipt_uses used ON used.id=retry.receipt_use_id WHERE retry.id=NEW.retry_obligation_id AND retry.source_kind='receipt_return' AND retry.source_id=receipt.id AND retry.receipt_id=receipt.id AND retry.customer_id=original.customer_id AND retry.cash_paisa=reversal.amount_paisa AND retry.wallet_paisa=0 AND retry.currency='NPR' AND retry.state IN('open','processing','uncertain','completed') AND used.receipt_id=receipt.id AND used.kind='return' AND used.target_id=retry.id AND used.amount_minor=reversal.amount_paisa AND used.state IN('reserved','returned')))
 OR (NEW.kind='restore' AND EXISTS(SELECT 1 FROM seller_recovery_liability_corrections correction WHERE correction.id=NEW.correction_id AND correction.case_id=c.id AND correction.case_revision=NEW.case_revision AND c.revision IN(NEW.case_revision,NEW.case_revision+1) AND correction.actor_id=NEW.actor_id AND correction.request_id=NEW.request_id))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_refund_disposition_link_required'; END IF; END$$
CREATE OR REPLACE TRIGGER customer_reversal_receipt_use BEFORE INSERT ON manual_receipt_uses FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM customer_refund_reversals reversal WHERE reversal.receipt_id=NEW.receipt_id) AND (NEW.kind<>'return' OR NEW.state<>'reserved' OR NEW.amount_minor<>(SELECT amount_paisa FROM customer_refund_reversals WHERE receipt_id=NEW.receipt_id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_reversal_credit_reserved_for_customer'; END IF; END$$
CREATE OR REPLACE TRIGGER customer_reversal_no_recovery_use BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM customer_refund_reversals reversal WHERE reversal.receipt_id=NEW.receipt_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_reversal_credit_reserved_for_customer'; END IF; END$$
CREATE OR REPLACE TRIGGER customer_reversal_collection_pending BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN refund_obligations original ON original.source_kind='return_refund' AND original.source_id=c.refund_id JOIN customer_refund_reversals reversal ON reversal.obligation_id=original.id WHERE c.id=NEW.case_id AND NOT EXISTS(SELECT 1 FROM customer_refund_reversal_dispositions disposition WHERE disposition.reversal_id=reversal.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_refund_reversal_disposition_required'; END IF; END$$
CREATE OR REPLACE TRIGGER customer_refund_reversals_update BEFORE UPDATE ON customer_refund_reversals FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_refund_reversal_history_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER customer_refund_reversals_delete BEFORE DELETE ON customer_refund_reversals FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_refund_reversal_history_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER customer_refund_reversal_dispositions_update BEFORE UPDATE ON customer_refund_reversal_dispositions FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_refund_reversal_history_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER customer_refund_reversal_dispositions_delete BEFORE DELETE ON customer_refund_reversal_dispositions FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_refund_reversal_history_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER customer_refund_pool_insert BEFORE INSERT ON customer_refund_return_pools FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM customer_refund_return_pools existing WHERE existing.packet_id=NEW.packet_id) AND (NOT EXISTS(SELECT 1 FROM outgoing_payment_packets packet WHERE packet.id=NEW.packet_id AND packet.state='paid' AND NEW.used_paisa<=packet.amount_paisa) OR NEW.used_paisa<>COALESCE((SELECT SUM(reversal.amount_paisa) FROM customer_refund_reversals reversal WHERE reversal.packet_id=NEW.packet_id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_refund_original_paid_cash_cap_required'; END IF; END$$
CREATE OR REPLACE TRIGGER customer_refund_pool_update BEFORE UPDATE ON customer_refund_return_pools FOR EACH ROW BEGIN IF (NEW.packet_id<>OLD.packet_id OR (NOT EXISTS(SELECT 1 FROM outgoing_payment_packets packet WHERE packet.id=NEW.packet_id AND packet.state='paid' AND NEW.used_paisa<=packet.amount_paisa) OR NEW.used_paisa<>COALESCE((SELECT SUM(reversal.amount_paisa) FROM customer_refund_reversals reversal WHERE reversal.packet_id=NEW.packet_id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_refund_original_paid_cash_cap_required'; END IF; END$$
CREATE OR REPLACE TRIGGER customer_refund_pool_delete BEFORE DELETE ON customer_refund_return_pools FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_refund_return_pool_retained'; END IF; END$$
DELIMITER ;

DELIMITER $$
CREATE OR REPLACE TRIGGER customer_refund_pool_consume AFTER INSERT ON customer_refund_reversals FOR EACH ROW BEGIN INSERT INTO customer_refund_return_pools(packet_id,used_paisa) VALUES(NEW.packet_id,NEW.amount_paisa) ON DUPLICATE KEY UPDATE used_paisa=used_paisa+NEW.amount_paisa; END$$
DELIMITER ;
-- Source parity for 0141. Canonical/live execution remains held.
CREATE TABLE seller_recovery_repayment_attributions (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 receipt_id VARCHAR(191) NOT NULL UNIQUE REFERENCES company_money_receipts(id),receipt_revision BIGINT NOT NULL,
 payer_user_id VARCHAR(191) NOT NULL REFERENCES users(id),owner_user_id VARCHAR(191) NOT NULL REFERENCES users(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,created_at BIGINT NOT NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_repayment_attribution_source BEFORE INSERT ON seller_recovery_repayment_attributions FOR EACH ROW BEGIN IF (length(trim(NEW.evidence_reference))<8 OR length(NEW.evidence_reference)>1500 OR length(trim(NEW.reason))<10 OR length(NEW.reason)>1500 OR length(trim(NEW.public_message))<10 OR length(NEW.public_message)>1500 OR NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id
 JOIN company_money_receipts r ON r.id=NEW.receipt_id JOIN company_receipt_controls control ON control.receipt_id=r.id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.approved_by IS NOT NULL AND c.blocker IS NULL
 AND c.approved_cap_paisa<=c.confirmed_paisa AND c.state IN('open','part_recovered','repayment_plan','disputed') AND seller.user_id=NEW.owner_user_id AND json_extract(c.original_source_json,'$.ownerId')=NEW.owner_user_id
 AND r.kind='bank_credit' AND r.status='verified' AND r.currency='NPR' AND NOT EXISTS(SELECT 1 FROM customer_refund_reversals returned_customer WHERE returned_customer.receipt_id=r.id) AND r.payer_user_id=NEW.payer_user_id AND control.revision=NEW.receipt_revision
 AND actor.status='active' AND actor.id<>NEW.payer_user_id AND actor.id<>NEW.owner_user_id AND actor.id<>COALESCE(json_extract(c.original_source_json,'$.customerId'),'')
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=r.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversal WHERE reversal.receipt_id=r.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews review WHERE review.reversal_id=reversal.id AND review.receipt_id=r.id AND review.amount_paisa=reversal.amount_minor AND review.state='completed'))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.receipt_id=r.id)
 AND NOT EXISTS(SELECT 1 FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released')
 AND NEW.amount_paisa<=r.amount_minor-COALESCE((SELECT SUM(reversal.amount_minor) FROM company_receipt_reversals reversal WHERE reversal.receipt_id=r.id),0) AND NEW.amount_paisa<=c.approved_cap_paisa-c.absorbed_paisa-c.disputed_paisa-c.historical_recovered_paisa+c.restored_paisa-COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_repayment_attribution_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_repayment_attribution_immutable BEFORE UPDATE ON seller_recovery_repayment_attributions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_repayment_attribution_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_repayment_attribution_retained BEFORE DELETE ON seller_recovery_repayment_attributions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_repayment_attribution_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_cash_attribution_required BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (NEW.method='cash' AND NOT EXISTS(SELECT 1 FROM company_money_receipts r JOIN seller_recovery_cases c ON c.id=NEW.case_id WHERE r.id=NEW.receipt_id
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id AND t.case_id<>c.id)
 AND ((r.payer_user_id=json_extract(c.original_source_json,'$.ownerId') AND NOT EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id))
 OR EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id AND t.case_id=c.id AND t.owner_user_id=json_extract(c.original_source_json,'$.ownerId') AND t.payer_user_id=r.payer_user_id
 AND NEW.amount_paisa<=t.amount_paisa-COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_cash_original_or_attributed_payer_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_attributed_receipt_use BEFORE INSERT ON manual_receipt_uses FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=NEW.receipt_id) AND NEW.kind<>'return') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_attributed_receipt_original_payer_return_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_attributed_receipt_case BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=NEW.receipt_id AND (t.case_id<>NEW.case_id OR NEW.method<>'cash'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_attributed_receipt_original_case_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_claim_verified_receipt BEFORE UPDATE ON seller_recovery_repayment_claims FOR EACH ROW BEGIN IF (NEW.status='receipt_verified' AND NOT EXISTS(SELECT 1 FROM company_money_receipts r JOIN company_receipt_controls control ON control.receipt_id=r.id WHERE r.id=NEW.receipt_id AND control.revision=NEW.receipt_revision
 AND r.kind='bank_credit' AND r.status='verified' AND r.currency='NPR'
 AND ((r.payer_user_id=NEW.submitted_by AND r.amount_minor=NEW.amount_paisa AND NOT EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id AND t.case_id<>NEW.case_id))
 OR EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=r.id AND t.case_id=NEW.case_id AND t.owner_user_id=NEW.submitted_by AND t.payer_user_id=r.payer_user_id AND (r.amount_minor=NEW.amount_paisa OR t.amount_paisa>=NEW.amount_paisa AND r.amount_minor>=NEW.amount_paisa)))
 AND (NEW.account_version_id IS NULL OR r.account_version_id=NEW.account_version_id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=r.id AND conflict.user_id=NEW.reviewed_by)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversal WHERE reversal.receipt_id=r.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_claim_actual_attributed_receipt_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_attributed_receipt_customer_return BEFORE INSERT ON customer_refund_reversals FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_repayment_attributions t WHERE t.receipt_id=NEW.receipt_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_attributed_receipt_original_case_required'; END IF; END$$
DELIMITER ;
-- Source parity0142. Native verification remains required.
CREATE TABLE receipt_return_bank_losses(
 id VARCHAR(191) PRIMARY KEY,review_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_receipt_reversal_reviews(id),reversal_id VARCHAR(191) NOT NULL REFERENCES company_receipt_reversals(id),receipt_id VARCHAR(191) NOT NULL REFERENCES company_money_receipts(id),receipt_use_id VARCHAR(191) NOT NULL REFERENCES manual_receipt_uses(id),use_revision BIGINT NOT NULL,packet_id VARCHAR(191) NOT NULL REFERENCES outgoing_payment_packets(id),obligation_id VARCHAR(191) NOT NULL REFERENCES refund_obligations(id),amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,UNIQUE(review_id,receipt_use_id)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE receipt_return_bank_loss_pools(receipt_use_id VARCHAR(191) PRIMARY KEY REFERENCES manual_receipt_uses(id),used_paisa BIGINT NOT NULL CHECK(used_paisa>0 AND used_paisa<=9007199254740991) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE VIEW manual_receipt_bank_backing AS SELECT used.id receipt_use_id,used.amount_minor-COALESCE((SELECT SUM(loss.amount_paisa) FROM receipt_return_bank_losses loss JOIN seller_recovery_receipt_reversal_reviews review ON review.id=loss.review_id WHERE loss.receipt_use_id=used.id AND review.state='completed'),0) amount_paisa FROM manual_receipt_uses used;
DELIMITER $$
CREATE OR REPLACE TRIGGER receipt_return_bank_loss_source BEFORE INSERT ON receipt_return_bank_losses FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews review JOIN company_receipt_reversals reversal ON reversal.id=review.reversal_id JOIN company_money_receipts receipt ON receipt.id=review.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id JOIN manual_receipt_uses used ON used.id=NEW.receipt_use_id JOIN refund_obligations original ON original.id=NEW.obligation_id JOIN outgoing_payment_packets packet ON packet.id=NEW.packet_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE review.id=NEW.review_id AND review.state='planned' AND review.reversal_id=NEW.reversal_id AND reversal.receipt_id=NEW.receipt_id AND receipt.id=NEW.receipt_id AND review.actor_id=NEW.actor_id AND review.request_id=NEW.request_id AND control.revision=review.receipt_revision+1 AND actor.status='active' AND receipt.kind='bank_credit' AND receipt.currency='NPR' AND used.revision=NEW.use_revision AND json_extract(review.plan_json,'$.companyLossApproved')=1 AND JSON_CONTAINS(review.plan_json,JSON_OBJECT('id',NEW.id,'receiptUseId',NEW.receipt_use_id,'useRevision',NEW.use_revision,'packetId',NEW.packet_id,'amountPaisa',NEW.amount_paisa,'obligationId',NEW.obligation_id),'$.returnLosses')=1)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='completed_original_payer_return_loss_required'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_bank_loss_paid_proof BEFORE INSERT ON receipt_return_bank_losses FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM manual_receipt_uses used JOIN company_money_receipts receipt ON receipt.id=used.receipt_id JOIN refund_obligations original ON original.id=NEW.obligation_id JOIN outgoing_payment_packets packet ON packet.id=NEW.packet_id WHERE used.id=NEW.receipt_use_id AND receipt.id=NEW.receipt_id AND used.kind='return' AND used.state='returned' AND used.receipt_id=receipt.id AND original.id=used.target_id AND original.receipt_use_id=used.id AND original.source_kind='receipt_return' AND original.source_id=receipt.id AND original.receipt_id=receipt.id AND original.customer_id=receipt.payer_user_id AND original.currency='NPR' AND original.wallet_paisa=0 AND original.cash_paisa=used.amount_minor AND original.state='completed' AND packet.obligation_id=original.id AND packet.state='paid' AND packet.currency='NPR' AND packet.amount_paisa=COALESCE((SELECT backing.amount_paisa FROM manual_receipt_bank_backing backing WHERE backing.receipt_use_id=used.id),0)+COALESCE((SELECT SUM(prior_loss.amount_paisa) FROM receipt_return_bank_losses prior_loss JOIN seller_recovery_receipt_reversal_reviews prior_review ON prior_review.id=prior_loss.review_id WHERE prior_loss.receipt_use_id=used.id AND prior_review.state='completed'),0) AND EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa AND bank.account_version_id=packet.account_version_id AND bank.identity_hash=packet.transaction_identity_hash AND bank.bank_at=packet.bank_at) AND EXISTS(SELECT 1 FROM refund_destination_versions destination WHERE destination.id=packet.destination_version_id AND destination.obligation_id=original.id AND destination.status='verified' AND destination.relationship IN('own_account','original_payer')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='completed_original_payer_return_loss_required'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_bank_loss_interest BEFORE INSERT ON receipt_return_bank_losses FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM company_money_receipts receipt JOIN refund_obligations original ON original.id=NEW.obligation_id JOIN outgoing_payment_packets packet ON packet.id=NEW.packet_id WHERE receipt.id=NEW.receipt_id AND NEW.actor_id<>original.customer_id AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=NEW.actor_id) AND NOT EXISTS(SELECT 1 FROM company_payment_account_versions account WHERE account.id IN(receipt.account_version_id,packet.account_version_id) AND JSON_CONTAINS(account.conflicts_json,JSON_QUOTE(NEW.actor_id))=1) AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id WHERE (EXISTS(SELECT 1 FROM seller_recovery_allocations allocation WHERE allocation.receipt_id=receipt.id AND allocation.case_id=c.id) OR EXISTS(SELECT 1 FROM customer_refund_reversals returned JOIN refund_obligations paid ON paid.id=returned.obligation_id WHERE returned.receipt_id=receipt.id AND paid.source_kind='return_refund' AND paid.source_id=c.refund_id)) AND (seller.user_id=NEW.actor_id OR JSON_UNQUOTE(JSON_EXTRACT(c.original_source_json,'$.ownerId'))=NEW.actor_id OR JSON_UNQUOTE(JSON_EXTRACT(c.original_source_json,'$.customerId'))=NEW.actor_id OR EXISTS(SELECT 1 FROM refunds linked_refund JOIN orders linked_order ON linked_order.id=linked_refund.order_id WHERE linked_refund.id=c.refund_id AND linked_order.customer_id=NEW.actor_id))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receipt_return_bank_loss_personal_interest'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_bank_loss_backing BEFORE INSERT ON receipt_return_bank_losses FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM manual_receipt_bank_backing backing WHERE backing.receipt_use_id=NEW.receipt_use_id AND backing.amount_paisa>=NEW.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receipt_return_actual_completed_loss_cap_required'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_bank_loss_update BEFORE UPDATE ON receipt_return_bank_losses FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receipt_return_bank_loss_history_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_bank_loss_delete BEFORE DELETE ON receipt_return_bank_losses FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receipt_return_bank_loss_history_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_loss_pool_insert BEFORE INSERT ON receipt_return_bank_loss_pools FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM receipt_return_bank_loss_pools existing WHERE existing.receipt_use_id=NEW.receipt_use_id) AND (NOT EXISTS(SELECT 1 FROM manual_receipt_uses used WHERE used.id=NEW.receipt_use_id AND used.kind='return' AND used.state='returned' AND EXISTS(SELECT 1 FROM outgoing_payment_packets paid WHERE paid.obligation_id=used.target_id AND paid.state='paid' AND NEW.used_paisa<=paid.amount_paisa)) OR NEW.used_paisa<>COALESCE((SELECT SUM(loss.amount_paisa) FROM receipt_return_bank_losses loss WHERE loss.receipt_use_id=NEW.receipt_use_id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receipt_return_actual_completed_loss_cap_required'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_loss_pool_update BEFORE UPDATE ON receipt_return_bank_loss_pools FOR EACH ROW BEGIN IF (NEW.receipt_use_id<>OLD.receipt_use_id OR (NOT EXISTS(SELECT 1 FROM manual_receipt_uses used WHERE used.id=NEW.receipt_use_id AND used.kind='return' AND used.state='returned' AND EXISTS(SELECT 1 FROM outgoing_payment_packets paid WHERE paid.obligation_id=used.target_id AND paid.state='paid' AND NEW.used_paisa<=paid.amount_paisa)) OR NEW.used_paisa<>COALESCE((SELECT SUM(loss.amount_paisa) FROM receipt_return_bank_losses loss WHERE loss.receipt_use_id=NEW.receipt_use_id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receipt_return_actual_completed_loss_cap_required'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_loss_pool_delete BEFORE DELETE ON receipt_return_bank_loss_pools FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receipt_return_loss_pool_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER manual_receipt_use_cap BEFORE INSERT ON manual_receipt_uses FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id AND r.status='verified' AND NOT EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.receipt_id=r.id AND e.kind='receipt_reversal' AND e.state<>'resolved') AND NEW.amount_minor<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)-COALESCE((SELECT SUM(COALESCE((SELECT backing.amount_paisa FROM manual_receipt_bank_backing backing WHERE backing.receipt_use_id=u.id),0)) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_receipt_balance_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_cap BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id
 AND r.status='verified' AND r.currency='NPR'
 AND NOT EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.receipt_id=r.id AND e.kind='receipt_reversal' AND e.state<>'resolved')
 AND NEW.amount_paisa<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)
 -COALESCE((SELECT SUM(COALESCE((SELECT backing.amount_paisa FROM manual_receipt_bank_backing backing WHERE backing.receipt_use_id=u.id),0)) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)
 -COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_balance_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER manual_receipt_recovery_cap BEFORE INSERT ON manual_receipt_uses FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id
 AND NEW.amount_minor<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)
 -COALESCE((SELECT SUM(COALESCE((SELECT backing.amount_paisa FROM manual_receipt_bank_backing backing WHERE backing.receipt_use_id=u.id),0)) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)
 -COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='manual_receipt_recovery_balance_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_review_completion BEFORE UPDATE ON seller_recovery_receipt_reversal_reviews FOR EACH ROW BEGIN IF (OLD.state<>'planned' OR NEW.state<>'completed' OR NEW.completed_at IS NULL OR NEW.id<>OLD.id OR NEW.reversal_id<>OLD.reversal_id OR NEW.receipt_id<>OLD.receipt_id OR NEW.receipt_revision<>OLD.receipt_revision OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.unallocated_paisa<>OLD.unallocated_paisa OR NEW.source_json<>OLD.source_json OR NEW.plan_json<>OLD.plan_json OR NEW.actor_id<>OLD.actor_id OR NEW.request_id<>OLD.request_id OR NEW.created_at<>OLD.created_at OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.reason<>OLD.reason OR NEW.public_message<>OLD.public_message
 OR NOT EXISTS(SELECT 1 FROM company_receipt_controls control JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin' WHERE control.receipt_id=NEW.receipt_id AND control.revision=NEW.receipt_revision+1 AND actor.status='active')
 OR NEW.amount_paisa<>NEW.unallocated_paisa+COALESCE((SELECT SUM(loss.amount_paisa) FROM receipt_return_bank_losses loss WHERE loss.review_id=NEW.id),0)+COALESCE((SELECT SUM(part.amount_paisa) FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id),0)
 OR (SELECT COUNT(*) FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id)<>JSON_LENGTH(NEW.plan_json,'$.parts')
 OR EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id AND part.company_loss_paisa<>COALESCE((SELECT SUM(reclass.amount_paisa) FROM seller_recovery_restoration_reclassifications reclass WHERE reclass.part_id=part.id),0))
 OR (SELECT COUNT(*) FROM receipt_return_bank_losses loss WHERE loss.review_id=NEW.id)<>COALESCE(JSON_LENGTH(NEW.plan_json,'$.returnLosses'),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_complete_projection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_loss_pool_consume AFTER INSERT ON receipt_return_bank_losses FOR EACH ROW BEGIN INSERT INTO receipt_return_bank_loss_pools(receipt_use_id,used_paisa) VALUES(NEW.receipt_use_id,NEW.amount_paisa) ON DUPLICATE KEY UPDATE used_paisa=used_paisa+NEW.amount_paisa; END$$
DELIMITER ;
-- Source parity0143; native MariaDB verification remains required.
CREATE TABLE receipt_return_bank_satisfactions(
 id VARCHAR(191) PRIMARY KEY,review_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_receipt_reversal_reviews(id),reversal_id VARCHAR(191) NOT NULL REFERENCES company_receipt_reversals(id),receipt_id VARCHAR(191) NOT NULL REFERENCES company_money_receipts(id),
 receipt_use_id VARCHAR(191) NOT NULL REFERENCES manual_receipt_uses(id),use_revision BIGINT NOT NULL,obligation_id VARCHAR(191) NOT NULL REFERENCES refund_obligations(id),obligation_revision BIGINT NOT NULL,customer_id VARCHAR(191) NOT NULL REFERENCES users(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),original_payer_returned_confirmed BIGINT NOT NULL CHECK(original_payer_returned_confirmed=1),actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,UNIQUE(review_id,receipt_use_id)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE receipt_return_bank_satisfaction_pools(receipt_use_id VARCHAR(191) PRIMARY KEY REFERENCES manual_receipt_uses(id),used_paisa BIGINT NOT NULL CHECK(used_paisa>0 AND used_paisa<=9007199254740991) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DROP VIEW manual_receipt_bank_backing;
CREATE VIEW manual_receipt_bank_backing AS SELECT used.id receipt_use_id,used.amount_minor-COALESCE((SELECT SUM(loss.amount_paisa) FROM receipt_return_bank_losses loss JOIN seller_recovery_receipt_reversal_reviews reviewed ON reviewed.id=loss.review_id WHERE loss.receipt_use_id=used.id AND reviewed.state='completed'),0)-COALESCE((SELECT SUM(satisfied.amount_paisa) FROM receipt_return_bank_satisfactions satisfied JOIN seller_recovery_receipt_reversal_reviews reviewed ON reviewed.id=satisfied.review_id WHERE satisfied.receipt_use_id=used.id AND reviewed.state='completed'),0) amount_paisa FROM manual_receipt_uses used;
DELIMITER $$
CREATE OR REPLACE TRIGGER receipt_return_bank_satisfaction_source BEFORE INSERT ON receipt_return_bank_satisfactions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews review JOIN company_receipt_reversals reversal ON reversal.id=review.reversal_id JOIN company_money_receipts receipt ON receipt.id=review.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id JOIN manual_receipt_uses used ON used.id=NEW.receipt_use_id JOIN refund_obligations original ON original.id=NEW.obligation_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE review.id=NEW.review_id AND review.state='planned' AND review.reversal_id=NEW.reversal_id AND reversal.receipt_id=NEW.receipt_id AND receipt.id=NEW.receipt_id AND review.actor_id=NEW.actor_id AND review.request_id=NEW.request_id AND control.revision=review.receipt_revision+1 AND actor.status='active' AND receipt.kind='bank_credit' AND receipt.currency='NPR'
 AND JSON_CONTAINS(review.plan_json,JSON_MERGE_PATCH(JSON_OBJECT('id',NEW.id,'receiptUseId',NEW.receipt_use_id,'useRevision',NEW.use_revision,'obligationId',NEW.obligation_id,'obligationRevision',NEW.obligation_revision,'customerId',NEW.customer_id,'amountPaisa',NEW.amount_paisa),'{"originalPayerReturnedConfirmed":true}'),'$.returnSatisfactions')=1)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='never_paid_original_payer_bank_return_required'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_bank_satisfaction_original BEFORE INSERT ON receipt_return_bank_satisfactions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM manual_receipt_uses used JOIN company_money_receipts receipt ON receipt.id=used.receipt_id JOIN refund_obligations original ON original.id=NEW.obligation_id WHERE used.id=NEW.receipt_use_id AND receipt.id=NEW.receipt_id AND used.revision=NEW.use_revision AND original.revision=NEW.obligation_revision AND used.kind='return' AND used.state='reserved' AND used.receipt_id=receipt.id AND original.id=used.target_id AND original.receipt_use_id=used.id AND original.source_kind='receipt_return' AND original.source_id=receipt.id AND original.receipt_id=receipt.id AND original.customer_id=receipt.payer_user_id AND original.customer_id=NEW.customer_id AND original.currency='NPR' AND original.wallet_paisa=0 AND original.cash_paisa=used.amount_minor AND original.state IN('open','blocked'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='never_paid_original_payer_bank_return_required'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_bank_satisfaction_interest BEFORE INSERT ON receipt_return_bank_satisfactions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM company_money_receipts receipt JOIN refund_obligations original ON original.id=NEW.obligation_id JOIN users actor ON actor.id=NEW.actor_id WHERE receipt.id=NEW.receipt_id AND actor.id<>original.customer_id AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_payment_account_versions account WHERE (account.id=receipt.account_version_id OR EXISTS(SELECT 1 FROM outgoing_payment_packets prior WHERE prior.obligation_id=original.id AND prior.account_version_id=account.id)) AND JSON_CONTAINS(account.conflicts_json,JSON_QUOTE(actor.id))=1)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id WHERE (EXISTS(SELECT 1 FROM seller_recovery_allocations allocation WHERE allocation.receipt_id=receipt.id AND allocation.case_id=c.id) OR EXISTS(SELECT 1 FROM customer_refund_reversals returned JOIN refund_obligations paid ON paid.id=returned.obligation_id WHERE returned.receipt_id=receipt.id AND paid.source_kind='return_refund' AND paid.source_id=c.refund_id)) AND (seller.user_id=actor.id OR JSON_UNQUOTE(JSON_EXTRACT(c.original_source_json,'$.ownerId'))=actor.id OR JSON_UNQUOTE(JSON_EXTRACT(c.original_source_json,'$.customerId'))=actor.id OR EXISTS(SELECT 1 FROM refunds linked_refund JOIN orders linked_order ON linked_order.id=linked_refund.order_id WHERE linked_refund.id=c.refund_id AND linked_order.customer_id=actor.id))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='never_paid_original_payer_bank_return_required'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_bank_satisfaction_nonpayment BEFORE INSERT ON receipt_return_bank_satisfactions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM refund_obligations original WHERE original.id=NEW.obligation_id AND NOT EXISTS(SELECT 1 FROM outgoing_payment_packets attempt WHERE attempt.obligation_id=original.id AND NOT (attempt.state='void' AND attempt.started_at IS NULL AND attempt.evidence_reference IS NOT NULL OR attempt.state='failed' AND attempt.evidence_reference IS NOT NULL AND EXISTS(SELECT 1 FROM refund_obligation_events outcome WHERE outcome.obligation_id=original.id AND outcome.action='packet_failed' AND JSON_UNQUOTE(JSON_EXTRACT(outcome.private_details_json,'$.packetId'))=attempt.id AND JSON_UNQUOTE(JSON_EXTRACT(outcome.private_details_json,'$.failureBasis')) IN('not_sent','no_debit','debit_returned'))))
 AND NOT EXISTS(SELECT 1 FROM outgoing_payment_packets attempt JOIN company_outgoing_bank_identities bank ON bank.packet_kind='refund' AND bank.packet_id=attempt.id WHERE attempt.obligation_id=original.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='never_paid_original_payer_bank_return_required'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_bank_satisfaction_cap BEFORE INSERT ON receipt_return_bank_satisfactions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM manual_receipt_uses used JOIN company_receipt_reversals reversal ON reversal.id=NEW.reversal_id WHERE used.id=NEW.receipt_use_id AND NEW.amount_paisa<=reversal.amount_minor AND NEW.amount_paisa<=used.amount_minor-COALESCE((SELECT used_paisa FROM receipt_return_bank_satisfaction_pools pool WHERE pool.receipt_use_id=used.id),0)-COALESCE((SELECT used_paisa FROM receipt_return_bank_loss_pools pool WHERE pool.receipt_use_id=used.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='never_paid_original_payer_bank_return_required'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_bank_satisfaction_update BEFORE UPDATE ON receipt_return_bank_satisfactions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receipt_return_bank_satisfaction_history_retained'; END$$
CREATE OR REPLACE TRIGGER receipt_return_bank_satisfaction_delete BEFORE DELETE ON receipt_return_bank_satisfactions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receipt_return_bank_satisfaction_history_retained'; END$$
CREATE OR REPLACE TRIGGER receipt_return_satisfaction_pool_insert BEFORE INSERT ON receipt_return_bank_satisfaction_pools FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM receipt_return_bank_satisfaction_pools existing WHERE existing.receipt_use_id=NEW.receipt_use_id) AND (NOT EXISTS(SELECT 1 FROM manual_receipt_uses used WHERE used.id=NEW.receipt_use_id AND used.kind='return' AND used.state='reserved' AND NEW.used_paisa<=used.amount_minor) OR NEW.used_paisa<>COALESCE((SELECT SUM(satisfied.amount_paisa) FROM receipt_return_bank_satisfactions satisfied WHERE satisfied.receipt_use_id=NEW.receipt_use_id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receipt_return_bank_satisfaction_cap_required'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_satisfaction_pool_update BEFORE UPDATE ON receipt_return_bank_satisfaction_pools FOR EACH ROW BEGIN IF (NEW.receipt_use_id<>OLD.receipt_use_id OR NOT EXISTS(SELECT 1 FROM manual_receipt_uses used WHERE used.id=NEW.receipt_use_id AND used.kind='return' AND used.state='reserved' AND NEW.used_paisa<=used.amount_minor) OR NEW.used_paisa<>COALESCE((SELECT SUM(satisfied.amount_paisa) FROM receipt_return_bank_satisfactions satisfied WHERE satisfied.receipt_use_id=NEW.receipt_use_id),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receipt_return_bank_satisfaction_cap_required'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_satisfaction_pool_delete BEFORE DELETE ON receipt_return_bank_satisfaction_pools FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receipt_return_bank_satisfaction_history_retained'; END$$
CREATE OR REPLACE TRIGGER receipt_return_satisfaction_pool_consume AFTER INSERT ON receipt_return_bank_satisfactions FOR EACH ROW BEGIN INSERT INTO receipt_return_bank_satisfaction_pools(receipt_use_id,used_paisa) VALUES(NEW.receipt_use_id,NEW.amount_paisa) ON DUPLICATE KEY UPDATE used_paisa=used_paisa+NEW.amount_paisa; END$$
CREATE OR REPLACE TRIGGER receipt_return_remaining_packet_insert BEFORE INSERT ON outgoing_payment_packets FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM refund_obligations original WHERE original.id=NEW.obligation_id AND original.source_kind='receipt_return' AND (original.state<>'open' OR NEW.amount_paisa<>original.cash_paisa-COALESCE((SELECT SUM(satisfied.amount_paisa) FROM receipt_return_bank_satisfactions satisfied JOIN seller_recovery_receipt_reversal_reviews reviewed ON reviewed.id=satisfied.review_id WHERE satisfied.obligation_id=original.id AND reviewed.state='completed'),0)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receipt_return_remaining_cash_required'; END IF; END$$
CREATE OR REPLACE TRIGGER receipt_return_remaining_packet_update BEFORE UPDATE ON outgoing_payment_packets FOR EACH ROW BEGIN IF (NEW.state IN('approved','processing','paid') AND EXISTS(SELECT 1 FROM refund_obligations original WHERE original.id=NEW.obligation_id AND original.source_kind='receipt_return' AND NEW.amount_paisa<>original.cash_paisa-COALESCE((SELECT SUM(satisfied.amount_paisa) FROM receipt_return_bank_satisfactions satisfied JOIN seller_recovery_receipt_reversal_reviews reviewed ON reviewed.id=satisfied.review_id WHERE satisfied.obligation_id=original.id AND reviewed.state='completed'),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receipt_return_remaining_cash_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_receipt_review_completion BEFORE UPDATE ON seller_recovery_receipt_reversal_reviews FOR EACH ROW BEGIN IF (OLD.state<>'planned' OR NEW.state<>'completed' OR NEW.completed_at IS NULL OR NEW.id<>OLD.id OR NEW.reversal_id<>OLD.reversal_id OR NEW.receipt_id<>OLD.receipt_id OR NEW.receipt_revision<>OLD.receipt_revision OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.unallocated_paisa<>OLD.unallocated_paisa OR NEW.source_json<>OLD.source_json OR NEW.plan_json<>OLD.plan_json OR NEW.actor_id<>OLD.actor_id OR NEW.request_id<>OLD.request_id OR NEW.created_at<>OLD.created_at OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.reason<>OLD.reason OR NEW.public_message<>OLD.public_message
 OR NOT EXISTS(SELECT 1 FROM company_receipt_controls control JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin' WHERE control.receipt_id=NEW.receipt_id AND control.revision=NEW.receipt_revision+1 AND actor.status='active')
 OR NEW.amount_paisa<>NEW.unallocated_paisa+COALESCE((SELECT SUM(satisfied.amount_paisa) FROM receipt_return_bank_satisfactions satisfied WHERE satisfied.review_id=NEW.id),0)+COALESCE((SELECT SUM(loss.amount_paisa) FROM receipt_return_bank_losses loss WHERE loss.review_id=NEW.id),0)+COALESCE((SELECT SUM(part.amount_paisa) FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id),0)
 OR (SELECT COUNT(*) FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id)<>JSON_LENGTH(NEW.plan_json,'$.parts')
 OR EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id AND part.company_loss_paisa<>COALESCE((SELECT SUM(reclass.amount_paisa) FROM seller_recovery_restoration_reclassifications reclass WHERE reclass.part_id=part.id),0))
 OR (SELECT COUNT(*) FROM receipt_return_bank_losses loss WHERE loss.review_id=NEW.id)<>COALESCE(JSON_LENGTH(NEW.plan_json,'$.returnLosses'),0)
 OR (SELECT COUNT(*) FROM receipt_return_bank_satisfactions satisfied WHERE satisfied.review_id=NEW.id)<>COALESCE(JSON_LENGTH(NEW.plan_json,'$.returnSatisfactions'),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_receipt_reversal_complete_projection_required'; END IF; END$$
DELIMITER ;
-- Source parity for 0144; execution remains held.
DELIMITER $$
CREATE OR REPLACE TRIGGER funding_bank_reversal_new_0 BEFORE INSERT ON outgoing_payment_packets FOR EACH ROW BEGIN IF (NEW.amount_paisa>0 AND NEW.funding_statement_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=NEW.funding_statement_id AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed JOIN company_money_receipts receipt ON receipt.id=reversed.receipt_id JOIN company_payment_account_versions bank_version ON bank_version.id=receipt.account_version_id WHERE bank_version.account_id=s.account_id AND reversed.bank_at>s.as_of))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='funding_reverify_bank_balance_after_reversal_required'; END IF; END$$
CREATE OR REPLACE TRIGGER funding_bank_reversal_unsent_0 BEFORE UPDATE ON outgoing_payment_packets FOR EACH ROW BEGIN IF (NEW.amount_paisa>0 AND OLD.state IN('prepared','approved') AND NEW.state IN('prepared','approved','processing') AND NOT EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=NEW.funding_statement_id AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed JOIN company_money_receipts receipt ON receipt.id=reversed.receipt_id JOIN company_payment_account_versions bank_version ON bank_version.id=receipt.account_version_id WHERE bank_version.account_id=s.account_id AND reversed.bank_at>s.as_of))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='funding_reverify_bank_balance_after_reversal_required'; END IF; END$$
CREATE OR REPLACE TRIGGER funding_bank_reversal_new_1 BEFORE INSERT ON payout_transfer_packets FOR EACH ROW BEGIN IF (NEW.amount_paisa>0 AND NEW.funding_statement_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=NEW.funding_statement_id AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed JOIN company_money_receipts receipt ON receipt.id=reversed.receipt_id JOIN company_payment_account_versions bank_version ON bank_version.id=receipt.account_version_id WHERE bank_version.account_id=s.account_id AND reversed.bank_at>s.as_of))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='funding_reverify_bank_balance_after_reversal_required'; END IF; END$$
CREATE OR REPLACE TRIGGER funding_bank_reversal_unsent_1 BEFORE UPDATE ON payout_transfer_packets FOR EACH ROW BEGIN IF (NEW.amount_paisa>0 AND OLD.state IN('prepared','approved') AND NEW.state IN('prepared','approved','processing') AND NOT EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=NEW.funding_statement_id AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed JOIN company_money_receipts receipt ON receipt.id=reversed.receipt_id JOIN company_payment_account_versions bank_version ON bank_version.id=receipt.account_version_id WHERE bank_version.account_id=s.account_id AND reversed.bank_at>s.as_of))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='funding_reverify_bank_balance_after_reversal_required'; END IF; END$$
CREATE OR REPLACE TRIGGER funding_bank_reversal_reservation BEFORE UPDATE ON company_funding_accounts FOR EACH ROW BEGIN IF (NEW.statement_id=OLD.statement_id AND NEW.revision<>OLD.revision AND NOT EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=OLD.statement_id AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed JOIN company_money_receipts receipt ON receipt.id=reversed.receipt_id JOIN company_payment_account_versions bank_version ON bank_version.id=receipt.account_version_id WHERE bank_version.account_id=s.account_id AND reversed.bank_at>s.as_of))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='funding_reverify_bank_balance_after_reversal_required'; END IF; END$$
DELIMITER ;
-- Source0145 MariaDB parity. Native engine verification remains required.
CREATE TABLE managed_clearance_evidence_intents(id VARCHAR(191) PRIMARY KEY,seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),material_scope_digest VARCHAR(191) NOT NULL CHECK(length(material_scope_digest)=64),uploaded_by VARCHAR(191) NOT NULL REFERENCES users(id),object_key VARCHAR(191) NOT NULL UNIQUE,original_name LONGTEXT NOT NULL,mime_type LONGTEXT NOT NULL CHECK(mime_type IN('application/pdf','image/jpeg','image/png')),size_bytes BIGINT NOT NULL CHECK(size_bytes>0 AND size_bytes<=5242880),content_hash VARCHAR(191) NOT NULL CHECK(length(content_hash)=64),request_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,UNIQUE(uploaded_by,seller_id,request_id) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE managed_clearance_evidence_files(id VARCHAR(191) PRIMARY KEY REFERENCES managed_clearance_evidence_intents(id),retained_at BIGINT NOT NULL ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE managed_live_clearances(id VARCHAR(191) PRIMARY KEY,seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),owner_id VARCHAR(191) NOT NULL REFERENCES users(id),model VARCHAR(191) NOT NULL CHECK(model='managed_sale_linked_percentage_v1'),material_scope_digest VARCHAR(191) NOT NULL CHECK(length(material_scope_digest)=64),company_scope_digest VARCHAR(191) NOT NULL CHECK(length(company_scope_digest)=64),financial_scope_id VARCHAR(191) NOT NULL,issuer_model VARCHAR(191) NOT NULL CHECK(issuer_model='company_commercial_invoice_v1'),issuer_scope_digest VARCHAR(191) NOT NULL CHECK(length(issuer_scope_digest)=64),scope_json LONGTEXT NOT NULL CHECK(json_valid(scope_json)),evidence_ids_json LONGTEXT NOT NULL CHECK(json_valid(evidence_ids_json) AND JSON_LENGTH(evidence_ids_json)>0),issuer LONGTEXT NOT NULL,external_reference LONGTEXT NOT NULL,issued_at BIGINT NOT NULL,effective_from BIGINT NOT NULL,valid_until BIGINT,reviewed_by VARCHAR(191) NOT NULL REFERENCES users(id),reviewed_at BIGINT NOT NULL,revision BIGINT NOT NULL DEFAULT 0,state VARCHAR(191) NOT NULL DEFAULT 'active' CHECK(state IN('active','revoked')),request_id VARCHAR(191) NOT NULL UNIQUE,reason LONGTEXT NOT NULL,revoked_by VARCHAR(191) REFERENCES users(id),revoked_at BIGINT,revocation_reason LONGTEXT,CHECK(issued_at>0 AND effective_from>=issued_at AND reviewed_at>=effective_from AND (valid_until IS NULL OR valid_until>reviewed_at)) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE managed_live_activation_decisions(id VARCHAR(191) PRIMARY KEY,seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),owner_id VARCHAR(191) NOT NULL REFERENCES users(id),model VARCHAR(191) NOT NULL CHECK(model='managed_sale_linked_percentage_v1'),clearance_id VARCHAR(191) NOT NULL REFERENCES managed_live_clearances(id),material_scope_digest VARCHAR(191) NOT NULL,company_scope_digest VARCHAR(191) NOT NULL,financial_scope_id VARCHAR(191) NOT NULL,issuer_model VARCHAR(191) NOT NULL CHECK(issuer_model='company_commercial_invoice_v1'),issuer_scope_digest VARCHAR(191) NOT NULL,source_json LONGTEXT NOT NULL CHECK(json_valid(source_json)),revision BIGINT NOT NULL CHECK(revision>=1),previous_decision_id VARCHAR(191) REFERENCES managed_live_activation_decisions(id),actor_id VARCHAR(191) NOT NULL REFERENCES users(id),created_at BIGINT NOT NULL,request_id VARCHAR(191) NOT NULL UNIQUE,reason LONGTEXT NOT NULL,UNIQUE(seller_id,revision) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX managed_live_clearance_scope ON managed_live_clearances(seller_id,material_scope_digest,state);
CREATE INDEX managed_live_decision_seller ON managed_live_activation_decisions(seller_id,revision);
DELIMITER $$
CREATE OR REPLACE TRIGGER managed_live_clearance_attestations BEFORE INSERT ON managed_live_clearances FOR EACH ROW BEGIN IF (NOT (JSON_UNQUOTE(JSON_EXTRACT(NEW.scope_json,'$.attestations.externalAuthenticityConfirmed')) <=> 'true') OR NOT (JSON_UNQUOTE(JSON_EXTRACT(NEW.scope_json,'$.attestations.supplierRegistrationTaxAssessmentConfirmed')) <=> 'true') OR NOT (JSON_UNQUOTE(JSON_EXTRACT(NEW.scope_json,'$.attestations.invoiceIssuerConfirmed')) <=> 'true') OR NOT (JSON_UNQUOTE(JSON_EXTRACT(NEW.scope_json,'$.attestations.payoutBeneficiaryConfirmed')) <=> 'true')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_explicit_external_attestation_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_clearance_upload_source BEFORE INSERT ON managed_clearance_evidence_intents FOR EACH ROW BEGIN IF (NOT (EXISTS(SELECT 1 FROM seller_profiles seller JOIN users owner ON owner.id=seller.user_id JOIN users actor ON actor.id=NEW.uploaded_by JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin' WHERE seller.id=NEW.seller_id AND owner.status='active' AND EXISTS(SELECT 1 FROM user_roles owner_access WHERE owner_access.user_id=owner.id AND owner_access.role='customer') AND actor.status='active' AND seller.user_id<>actor.id AND NOT EXISTS(SELECT 1 FROM managed_maker_application_details retained WHERE retained.seller_id=seller.id AND retained.agreement_accepted_by=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_clearances retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_activation_decisions retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id))) OR NEW.object_key<>CONCAT('private/managed-clearance-evidence/',NEW.id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_clearance_retained_file_source BEFORE INSERT ON managed_clearance_evidence_files FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM managed_clearance_evidence_intents intent WHERE intent.id=NEW.id AND EXISTS(SELECT 1 FROM seller_profiles seller JOIN users owner ON owner.id=seller.user_id JOIN users actor ON actor.id=intent.uploaded_by JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin' WHERE seller.id=intent.seller_id AND owner.status='active' AND EXISTS(SELECT 1 FROM user_roles owner_access WHERE owner_access.user_id=owner.id AND owner_access.role='customer') AND actor.status='active' AND seller.user_id<>actor.id AND NOT EXISTS(SELECT 1 FROM managed_maker_application_details retained WHERE retained.seller_id=seller.id AND retained.agreement_accepted_by=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_clearances retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_activation_decisions retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_clearance_evidence_intents_update BEFORE UPDATE ON managed_clearance_evidence_intents FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_history_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_clearance_evidence_intents_delete BEFORE DELETE ON managed_clearance_evidence_intents FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_history_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_clearance_evidence_files_update BEFORE UPDATE ON managed_clearance_evidence_files FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_history_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_clearance_evidence_files_delete BEFORE DELETE ON managed_clearance_evidence_files FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_history_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_activation_decisions_update BEFORE UPDATE ON managed_live_activation_decisions FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_history_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_activation_decisions_delete BEFORE DELETE ON managed_live_activation_decisions FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_history_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_clearance_actor BEFORE INSERT ON managed_live_clearances FOR EACH ROW BEGIN IF (NOT (EXISTS(SELECT 1 FROM seller_profiles seller JOIN users owner ON owner.id=seller.user_id JOIN users actor ON actor.id=NEW.reviewed_by JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin' WHERE seller.id=NEW.seller_id AND owner.status='active' AND EXISTS(SELECT 1 FROM user_roles owner_access WHERE owner_access.user_id=owner.id AND owner_access.role='customer') AND actor.status='active' AND seller.user_id<>actor.id AND NOT EXISTS(SELECT 1 FROM managed_maker_application_details retained WHERE retained.seller_id=seller.id AND retained.agreement_accepted_by=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_clearances retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_activation_decisions retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_clearance_original BEFORE INSERT ON managed_live_clearances FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_profiles s JOIN seller_participation_profiles p ON p.seller_id=s.id JOIN seller_protected_revisions revision ON revision.seller_id=s.id JOIN seller_beneficiary_versions beneficiary ON beneficiary.seller_id=s.id AND s.payout_account_reference=CONCAT('BENEFICIARY:',beneficiary.id) JOIN seller_documents document ON document.id=beneficiary.document_id AND document.seller_id=s.id WHERE s.id=NEW.seller_id AND s.user_id=NEW.owner_id AND p.participation_route='managed_maker' AND p.application_stage IN('approved_for_activation','active') AND revision.identity_revision=json_extract(NEW.scope_json,'$.sources.identityRevision') AND revision.bank_revision=json_extract(NEW.scope_json,'$.sources.bankRevision') AND beneficiary.id=JSON_UNQUOTE(JSON_EXTRACT(NEW.scope_json,'$.sources.beneficiaryVersionId')) AND beneficiary.identity_revision=revision.identity_revision AND beneficiary.verified_by<>s.user_id AND document.status='verified' AND (document.valid_until IS NULL OR document.valid_until>NEW.reviewed_at) AND JSON_UNQUOTE(JSON_EXTRACT(NEW.scope_json,'$.material.sellerId'))=s.id AND JSON_UNQUOTE(JSON_EXTRACT(NEW.scope_json,'$.material.ownerId'))=s.user_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_clearance_external_files BEFORE INSERT ON managed_live_clearances FOR EACH ROW BEGIN IF (JSON_LENGTH(NEW.evidence_ids_json)=0 OR EXISTS(SELECT 1 FROM JSON_TABLE(NEW.evidence_ids_json,'$[*]' COLUMNS(evidence_id VARCHAR(191) PATH '$')) evidence WHERE NOT EXISTS(SELECT 1 FROM managed_clearance_evidence_intents intent JOIN managed_clearance_evidence_files file ON file.id=intent.id WHERE intent.id=evidence.evidence_id AND intent.seller_id=NEW.seller_id AND intent.material_scope_digest=NEW.material_scope_digest))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_clearance_financial_scope BEFORE INSERT ON managed_live_clearances FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM managed_live_financial_scopes financial WHERE financial.id=NEW.financial_scope_id AND financial.company_scope_digest=NEW.company_scope_digest AND financial.issuer_model=NEW.issuer_model AND financial.issuer_scope_digest=NEW.issuer_scope_digest AND financial.company_entity_reference=JSON_UNQUOTE(JSON_EXTRACT(NEW.scope_json,'$.material.companyIdentity.entityReference')) AND JSON_UNQUOTE(JSON_EXTRACT(financial.issuer_snapshot_json,'$.legalName'))=JSON_UNQUOTE(JSON_EXTRACT(NEW.scope_json,'$.material.companyIdentity.company.legalName')) AND JSON_UNQUOTE(JSON_EXTRACT(financial.issuer_snapshot_json,'$.taxRegistrationNumber'))=JSON_UNQUOTE(JSON_EXTRACT(NEW.scope_json,'$.material.companyIdentity.company.pan')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_clearance_revocation BEFORE UPDATE ON managed_live_clearances FOR EACH ROW BEGIN IF (NOT (NEW.id <=> OLD.id) OR NOT (NEW.seller_id <=> OLD.seller_id) OR NOT (NEW.owner_id <=> OLD.owner_id) OR NOT (NEW.model <=> OLD.model) OR NOT (NEW.material_scope_digest <=> OLD.material_scope_digest) OR NOT (NEW.company_scope_digest <=> OLD.company_scope_digest) OR NOT (NEW.financial_scope_id <=> OLD.financial_scope_id) OR NOT (NEW.issuer_model <=> OLD.issuer_model) OR NOT (NEW.issuer_scope_digest <=> OLD.issuer_scope_digest) OR NOT (NEW.scope_json <=> OLD.scope_json) OR NOT (NEW.evidence_ids_json <=> OLD.evidence_ids_json) OR NOT (NEW.issuer <=> OLD.issuer) OR NOT (NEW.external_reference <=> OLD.external_reference) OR NOT (NEW.issued_at <=> OLD.issued_at) OR NOT (NEW.effective_from <=> OLD.effective_from) OR NOT (NEW.valid_until <=> OLD.valid_until) OR NOT (NEW.reviewed_by <=> OLD.reviewed_by) OR NOT (NEW.reviewed_at <=> OLD.reviewed_at) OR NOT (NEW.request_id <=> OLD.request_id) OR NOT (NEW.reason <=> OLD.reason) OR OLD.state<>'active' OR NEW.state<>'revoked' OR NEW.revision<>OLD.revision+1 OR NEW.revoked_at IS NULL OR length(NEW.revocation_reason)<8 OR NOT (EXISTS(SELECT 1 FROM seller_profiles seller JOIN users owner ON owner.id=seller.user_id JOIN users actor ON actor.id=NEW.revoked_by JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin' WHERE seller.id=NEW.seller_id  AND actor.status='active' AND seller.user_id<>actor.id AND NOT EXISTS(SELECT 1 FROM managed_maker_application_details retained WHERE retained.seller_id=seller.id AND retained.agreement_accepted_by=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_clearances retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_activation_decisions retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_clearance_history_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_clearance_delete BEFORE DELETE ON managed_live_clearances FOR EACH ROW BEGIN IF (1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_clearance_history_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_activation_actor BEFORE INSERT ON managed_live_activation_decisions FOR EACH ROW BEGIN IF (NOT (EXISTS(SELECT 1 FROM seller_profiles seller JOIN users owner ON owner.id=seller.user_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin' WHERE seller.id=NEW.seller_id AND owner.status='active' AND EXISTS(SELECT 1 FROM user_roles owner_access WHERE owner_access.user_id=owner.id AND owner_access.role='customer') AND actor.status='active' AND seller.user_id<>actor.id AND NOT EXISTS(SELECT 1 FROM managed_maker_application_details retained WHERE retained.seller_id=seller.id AND retained.agreement_accepted_by=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_clearances retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id) AND NOT EXISTS(SELECT 1 FROM managed_live_activation_decisions retained WHERE retained.seller_id=seller.id AND retained.owner_id=actor.id)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_activation_clearance BEFORE INSERT ON managed_live_activation_decisions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM managed_live_clearances clearance WHERE clearance.id=NEW.clearance_id AND clearance.seller_id=NEW.seller_id AND clearance.owner_id=NEW.owner_id AND clearance.model=NEW.model AND clearance.material_scope_digest=NEW.material_scope_digest AND clearance.company_scope_digest=NEW.company_scope_digest AND clearance.financial_scope_id=NEW.financial_scope_id AND clearance.issuer_model=NEW.issuer_model AND clearance.issuer_scope_digest=NEW.issuer_scope_digest AND clearance.state='active' AND clearance.effective_from<=NEW.created_at AND (clearance.valid_until IS NULL OR clearance.valid_until>NEW.created_at))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_activation_participation BEFORE INSERT ON managed_live_activation_decisions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_profiles s JOIN seller_participation_profiles p ON p.seller_id=s.id JOIN managed_maker_application_details accepted ON accepted.id=JSON_UNQUOTE(JSON_EXTRACT(NEW.source_json,'$.acceptedManagedDetailId')) JOIN seller_protected_revisions revision ON revision.seller_id=s.id WHERE s.id=NEW.seller_id AND s.user_id=NEW.owner_id AND p.participation_route='managed_maker' AND p.application_stage='active' AND p.commercial_model=NEW.model AND p.payout_beneficiary_reference=s.payout_account_reference AND p.legal_seller_reference=JSON_UNQUOTE(JSON_EXTRACT(accepted.agreement_snapshot_json,'$.companyAccount.entityReference')) AND p.invoice_issuer_reference=p.legal_seller_reference AND accepted.seller_id=s.id AND accepted.agreement_accepted_by=s.user_id AND accepted.agreement_version=p.managed_agreement_version AND accepted.agreement_accepted_at=p.managed_agreement_accepted_at AND accepted.agreement_accepted_at<=NEW.created_at AND revision.identity_revision=json_extract(NEW.source_json,'$.sources.identityRevision') AND revision.bank_revision=json_extract(NEW.source_json,'$.sources.bankRevision'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_activation_holds BEFORE INSERT ON managed_live_activation_decisions FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_capability_holds h WHERE h.seller_id=NEW.seller_id AND h.capability='new_orders' AND h.released_at IS NULL) OR EXISTS(SELECT 1 FROM seller_restrictions r WHERE r.seller_id=NEW.seller_id AND (r.mode='disabled' OR r.mode='suspended' AND r.suspended_until>NEW.created_at))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_activation_revision BEFORE INSERT ON managed_live_activation_decisions FOR EACH ROW BEGIN IF (NEW.revision<>COALESCE((SELECT MAX(previous.revision) FROM managed_live_activation_decisions previous WHERE previous.seller_id=NEW.seller_id),0)+1 OR COALESCE(NEW.previous_decision_id,'')<>COALESCE((SELECT previous.id FROM managed_live_activation_decisions previous WHERE previous.seller_id=NEW.seller_id ORDER BY previous.revision DESC LIMIT 1),'')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_clearances_clock BEFORE INSERT ON managed_live_clearances FOR EACH ROW BEGIN IF (NEW.reviewed_at<CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED)-1000 OR NEW.reviewed_at>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED)+1000) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_authoritative_time_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_activation_decisions_clock BEFORE INSERT ON managed_live_activation_decisions FOR EACH ROW BEGIN IF (NEW.created_at<CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED)-1000 OR NEW.created_at>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED)+1000) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_authoritative_time_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_activation_program BEFORE INSERT ON managed_live_activation_decisions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM business_setting_versions setting WHERE setting.id=(SELECT current.id FROM business_setting_versions current WHERE current.setting_key='managed_maker_program_mode' AND current.status='published' AND current.effective_from<=NEW.created_at AND (current.effective_until IS NULL OR current.effective_until>NEW.created_at) ORDER BY current.effective_from DESC,current.version DESC LIMIT 1) AND setting.id=JSON_UNQUOTE(JSON_EXTRACT(NEW.source_json,'$.sources.settingVersions.program')) AND setting.value_json='"activation_enabled"')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_activation_model BEFORE INSERT ON managed_live_activation_decisions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM business_setting_versions setting WHERE setting.id=(SELECT current.id FROM business_setting_versions current WHERE current.setting_key='managed_maker_active_model' AND current.status='published' AND current.effective_from<=NEW.created_at AND (current.effective_until IS NULL OR current.effective_until>NEW.created_at) ORDER BY current.effective_from DESC,current.version DESC LIMIT 1) AND setting.id=JSON_UNQUOTE(JSON_EXTRACT(NEW.source_json,'$.sources.settingVersions.model')) AND setting.value_json='"managed_sale_linked_percentage_v1"')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_activation_current_terms BEFORE INSERT ON managed_live_activation_decisions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM managed_maker_application_details accepted WHERE accepted.id=JSON_UNQUOTE(JSON_EXTRACT(NEW.source_json,'$.acceptedManagedDetailId')) AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(accepted.agreement_snapshot_json,'$.settingVersionIds.retention')),'')=COALESCE((SELECT current.id FROM business_setting_versions current WHERE current.setting_key='managed_sale_linked_platform_retention_bps' AND current.status='published' AND current.effective_from<=NEW.created_at AND (current.effective_until IS NULL OR current.effective_until>NEW.created_at) ORDER BY current.effective_from DESC,current.version DESC LIMIT 1),'') AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(accepted.agreement_snapshot_json,'$.settingVersionIds.account')),'')=COALESCE((SELECT current.id FROM business_setting_versions current WHERE current.setting_key='managed_maker_company_account' AND current.status='published' AND current.effective_from<=NEW.created_at AND (current.effective_until IS NULL OR current.effective_until>NEW.created_at) ORDER BY current.effective_from DESC,current.version DESC LIMIT 1),''))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_activation_document_representative_identity BEFORE INSERT ON managed_live_activation_decisions FOR EACH ROW BEGIN IF (JSON_UNQUOTE(JSON_EXTRACT(NEW.source_json,'$.agreementVersion'))='managed-supplier-maker-2026-10-20-v2' AND NOT EXISTS(SELECT 1 FROM seller_documents proof WHERE proof.seller_id=NEW.seller_id AND proof.kind='representative_identity' AND proof.status='verified' AND proof.reviewed_by IS NOT NULL AND proof.reviewed_by<>NEW.owner_id AND proof.reviewed_at IS NOT NULL AND (proof.valid_until IS NULL OR proof.valid_until>NEW.created_at) AND NOT EXISTS(SELECT 1 FROM seller_documents newer WHERE newer.seller_id=proof.seller_id AND newer.kind=proof.kind AND newer.status='verified' AND (newer.uploaded_at>proof.uploaded_at OR newer.uploaded_at=proof.uploaded_at AND newer.id>proof.id)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_activation_document_pan_certificate BEFORE INSERT ON managed_live_activation_decisions FOR EACH ROW BEGIN IF (JSON_UNQUOTE(JSON_EXTRACT(NEW.source_json,'$.agreementVersion'))='managed-supplier-maker-2026-10-20-v2' AND NOT EXISTS(SELECT 1 FROM seller_documents proof WHERE proof.seller_id=NEW.seller_id AND proof.kind='pan_certificate' AND proof.status='verified' AND proof.reviewed_by IS NOT NULL AND proof.reviewed_by<>NEW.owner_id AND proof.reviewed_at IS NOT NULL AND (proof.valid_until IS NULL OR proof.valid_until>NEW.created_at) AND NOT EXISTS(SELECT 1 FROM seller_documents newer WHERE newer.seller_id=proof.seller_id AND newer.kind=proof.kind AND newer.status='verified' AND (newer.uploaded_at>proof.uploaded_at OR newer.uploaded_at=proof.uploaded_at AND newer.id>proof.id)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_current_source_required'; END IF; END$$
DELIMITER ;
-- Source parity only; no canonical execution.
CREATE TABLE managed_live_financial_scopes (
 id VARCHAR(191) PRIMARY KEY NOT NULL,company_entity_reference VARCHAR(191) NOT NULL,company_scope_digest VARCHAR(191) NOT NULL,
 issuer_model VARCHAR(191) NOT NULL CHECK(issuer_model='company_commercial_invoice_v1'),issuer_scope_digest VARCHAR(191) NOT NULL,
 issuer_snapshot_json LONGTEXT NOT NULL CHECK(json_valid(issuer_snapshot_json)),series_prefix VARCHAR(191) NOT NULL UNIQUE,
 series_version VARCHAR(191) NOT NULL,opening_number BIGINT NOT NULL CHECK(opening_number>0),
 evidence_reference TEXT NOT NULL,reviewed_by VARCHAR(191) NOT NULL REFERENCES users(id),reviewed_at BIGINT NOT NULL,
 request_id VARCHAR(191) NOT NULL UNIQUE,reason TEXT NOT NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE managed_live_invoice_series (
 financial_scope_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES managed_live_financial_scopes(id),
 next_number BIGINT NOT NULL CHECK(next_number>0),revision BIGINT NOT NULL DEFAULT 0
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE managed_live_invoice_numbers (
 id VARCHAR(191) PRIMARY KEY NOT NULL,financial_scope_id VARCHAR(191) NOT NULL REFERENCES managed_live_financial_scopes(id),
 invoice_group_id VARCHAR(191) REFERENCES managed_invoice_groups(id),adjustment_id VARCHAR(191) REFERENCES managed_invoice_adjustments(id),
 sequence BIGINT NOT NULL CHECK(sequence>0),invoice_number VARCHAR(191) NOT NULL UNIQUE,
 request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,
 CHECK((invoice_group_id IS NULL)<>(adjustment_id IS NULL)),UNIQUE(financial_scope_id,sequence),UNIQUE(invoice_group_id),UNIQUE(adjustment_id)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE managed_live_invoice_adjustment_sources (
 adjustment_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES managed_invoice_adjustments(id),invoice_group_id VARCHAR(191) NOT NULL REFERENCES managed_invoice_groups(id),
 source_kind VARCHAR(191) NOT NULL CHECK(source_kind IN('refund','cancellation')),source_id VARCHAR(191) NOT NULL,
 UNIQUE(invoice_group_id,source_kind,source_id)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE managed_commercial_snapshots MODIFY simulation_label TEXT NULL, ADD COLUMN record_kind VARCHAR(191) NOT NULL DEFAULT 'simulation' CHECK(record_kind IN('simulation','live'));
ALTER TABLE managed_payouts MODIFY simulation_label TEXT NULL, ADD COLUMN record_kind VARCHAR(191) NOT NULL DEFAULT 'simulation' CHECK(record_kind IN('simulation','live'));
ALTER TABLE managed_invoice_groups MODIFY simulation_label TEXT NULL, ADD COLUMN record_kind VARCHAR(191) NOT NULL DEFAULT 'simulation' CHECK(record_kind IN('simulation','live'));
ALTER TABLE managed_invoice_adjustments MODIFY simulation_label TEXT NULL, ADD COLUMN record_kind VARCHAR(191) NOT NULL DEFAULT 'simulation' CHECK(record_kind IN('simulation','live'));
ALTER TABLE managed_commercial_snapshots ADD COLUMN live_activation_decision_id VARCHAR(191) NULL, ADD CONSTRAINT managed_live_snapshot_activation_fk FOREIGN KEY (live_activation_decision_id) REFERENCES managed_live_activation_decisions(id);
ALTER TABLE managed_commercial_snapshots ADD COLUMN live_clearance_id VARCHAR(191) NULL, ADD CONSTRAINT managed_live_snapshot_clearance_fk FOREIGN KEY (live_clearance_id) REFERENCES managed_live_clearances(id);
ALTER TABLE managed_commercial_snapshots ADD COLUMN live_financial_scope_id VARCHAR(191) NULL, ADD CONSTRAINT managed_live_snapshot_financial_fk FOREIGN KEY (live_financial_scope_id) REFERENCES managed_live_financial_scopes(id);
ALTER TABLE managed_commercial_snapshots ADD COLUMN live_customer_id VARCHAR(191) NULL, ADD CONSTRAINT managed_live_snapshot_customer_fk FOREIGN KEY (live_customer_id) REFERENCES users(id);
DELIMITER $$
CREATE OR REPLACE TRIGGER managed_commercial_snapshots_kind_insert BEFORE INSERT ON managed_commercial_snapshots FOR EACH ROW BEGIN IF ((NEW.record_kind='simulation' AND NEW.simulation_label IS NULL) OR (NEW.record_kind='live' AND NEW.simulation_label IS NOT NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_explicit_provenance_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_commercial_snapshots_kind_update BEFORE UPDATE ON managed_commercial_snapshots FOR EACH ROW BEGIN IF (NEW.record_kind<>OLD.record_kind OR NOT (NEW.simulation_label <=> OLD.simulation_label)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_original_kind_immutable'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_payouts_kind_insert BEFORE INSERT ON managed_payouts FOR EACH ROW BEGIN IF ((NEW.record_kind='simulation' AND NEW.simulation_label IS NULL) OR (NEW.record_kind='live' AND NEW.simulation_label IS NOT NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_explicit_provenance_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_payouts_kind_update BEFORE UPDATE ON managed_payouts FOR EACH ROW BEGIN IF (NEW.record_kind<>OLD.record_kind OR NOT (NEW.simulation_label <=> OLD.simulation_label)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_original_kind_immutable'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_invoice_groups_kind_insert BEFORE INSERT ON managed_invoice_groups FOR EACH ROW BEGIN IF ((NEW.record_kind='simulation' AND NEW.simulation_label IS NULL) OR (NEW.record_kind='live' AND NEW.simulation_label IS NOT NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_explicit_provenance_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_invoice_groups_kind_update BEFORE UPDATE ON managed_invoice_groups FOR EACH ROW BEGIN IF (NEW.record_kind<>OLD.record_kind OR NOT (NEW.simulation_label <=> OLD.simulation_label)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_original_kind_immutable'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_invoice_adjustments_kind_insert BEFORE INSERT ON managed_invoice_adjustments FOR EACH ROW BEGIN IF ((NEW.record_kind='simulation' AND NEW.simulation_label IS NULL) OR (NEW.record_kind='live' AND NEW.simulation_label IS NOT NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_explicit_provenance_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_invoice_adjustments_kind_update BEFORE UPDATE ON managed_invoice_adjustments FOR EACH ROW BEGIN IF (NEW.record_kind<>OLD.record_kind OR NOT (NEW.simulation_label <=> OLD.simulation_label)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_original_kind_immutable'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_snapshot_proof BEFORE INSERT ON managed_commercial_snapshots FOR EACH ROW BEGIN IF (NEW.record_kind='live' AND (NEW.commercial_model<>'managed_sale_linked_percentage_v1' OR NOT EXISTS(SELECT 1 FROM managed_live_activation_decisions d JOIN managed_live_clearances c ON c.id=d.clearance_id JOIN managed_live_financial_scopes f ON f.id=d.financial_scope_id WHERE d.id=NEW.live_activation_decision_id AND d.seller_id=NEW.seller_id AND d.clearance_id=NEW.live_clearance_id AND d.financial_scope_id=NEW.live_financial_scope_id AND d.model='managed_sale_linked_percentage_v1' AND d.revision=(SELECT MAX(latest.revision) FROM managed_live_activation_decisions latest WHERE latest.seller_id=d.seller_id) AND c.state='active' AND c.effective_from<=NEW.created_at AND (c.valid_until IS NULL OR c.valid_until>NEW.created_at) AND f.company_entity_reference=NEW.legal_seller_reference AND NEW.invoice_issuer_reference=f.company_entity_reference AND f.company_scope_digest=d.company_scope_digest AND f.issuer_scope_digest=d.issuer_scope_digest AND f.issuer_model=d.issuer_model AND c.financial_scope_id=f.id AND c.issuer_scope_digest=f.issuer_scope_digest))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_original_proof_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_simulation_no_live_proof BEFORE INSERT ON managed_commercial_snapshots FOR EACH ROW BEGIN IF (NEW.record_kind='simulation' AND (NEW.live_activation_decision_id IS NOT NULL OR NEW.live_clearance_id IS NOT NULL OR NEW.live_financial_scope_id IS NOT NULL OR NEW.live_customer_id IS NOT NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_simulation_cannot_claim_live_proof'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_original_customer BEFORE INSERT ON managed_commercial_snapshots FOR EACH ROW BEGIN IF (NEW.record_kind='live' AND (NEW.live_customer_id IS NULL OR NOT EXISTS(SELECT 1 FROM order_items item JOIN orders original_order ON original_order.id=item.order_id WHERE item.id=NEW.order_item_id AND original_order.customer_id=NEW.live_customer_id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_exact_original_customer_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_original_accepted_terms BEFORE INSERT ON managed_commercial_snapshots FOR EACH ROW BEGIN IF (NEW.record_kind='live' AND NOT EXISTS(SELECT 1 FROM managed_maker_application_details t JOIN seller_profiles owner ON owner.id=t.seller_id JOIN managed_live_financial_scopes financial ON financial.id=NEW.live_financial_scope_id WHERE t.id=NEW.accepted_managed_detail_id AND t.seller_id=NEW.seller_id AND t.agreement_accepted_by=owner.user_id AND t.agreement_accepted_at<=NEW.created_at AND t.agreement_version=NEW.agreement_version AND JSON_UNQUOTE(JSON_EXTRACT(t.agreement_snapshot_json,'$.version'))=NEW.agreement_version AND (t.agreement_language=NEW.agreement_language OR t.agreement_language IS NULL AND t.agreement_version='managed-supplier-maker-2026-10-20-v2' AND NEW.agreement_language='en') AND JSON_UNQUOTE(JSON_EXTRACT(t.agreement_snapshot_json,'$.company.legalName'))=NEW.company_legal_name_snapshot AND JSON_UNQUOTE(JSON_EXTRACT(financial.issuer_snapshot_json,'$.legalName'))=NEW.company_legal_name_snapshot AND JSON_UNQUOTE(JSON_EXTRACT(financial.issuer_snapshot_json,'$.taxRegistrationNumber'))=JSON_UNQUOTE(JSON_EXTRACT(t.agreement_snapshot_json,'$.company.pan')) AND JSON_UNQUOTE(JSON_EXTRACT(financial.issuer_snapshot_json,'$.address'))=JSON_UNQUOTE(JSON_EXTRACT(t.agreement_snapshot_json,'$.company.registeredOffice')) AND JSON_UNQUOTE(JSON_EXTRACT(t.agreement_snapshot_json,'$.commercialModel'))=NEW.commercial_model AND JSON_UNQUOTE(JSON_EXTRACT(t.agreement_snapshot_json,'$.platformRetentionBps'))=NEW.platform_retention_bps AND JSON_UNQUOTE(JSON_EXTRACT(t.agreement_snapshot_json,'$.companyAccount.entityReference'))=NEW.legal_seller_reference AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.agreement_snapshot_json,'$.settingVersionIds.retention')),'')=COALESCE(NEW.terms_setting_version_id,'') AND COALESCE((SELECT current_rate.id FROM business_setting_versions current_rate WHERE current_rate.setting_key='managed_sale_linked_platform_retention_bps' AND current_rate.status='published' AND current_rate.effective_from<=NEW.created_at AND (current_rate.effective_until IS NULL OR current_rate.effective_until>NEW.created_at) ORDER BY current_rate.effective_from DESC,current_rate.version DESC LIMIT 1),'')=COALESCE(NEW.terms_setting_version_id,''))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_exact_accepted_terms_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_allocation_same_original_kind BEFORE INSERT ON managed_payout_allocations FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM managed_payouts p JOIN managed_entitlements e ON e.id=NEW.entitlement_id JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id WHERE p.id=NEW.payout_id AND p.seller_id=e.seller_id AND p.record_kind=s.record_kind)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_payout_cannot_mix_simulation_live'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_no_live_legacy_links BEFORE INSERT ON managed_payout_entries FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM managed_payouts p WHERE p.id=NEW.payout_id AND p.record_kind='live') OR EXISTS(SELECT 1 FROM managed_settlement_entries x JOIN managed_entitlements e ON e.id=x.entitlement_id JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id WHERE x.id=NEW.settlement_entry_id AND s.record_kind='live')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_requires_exact_allocations'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_payout_source_cap BEFORE INSERT ON managed_payouts FOR EACH ROW BEGIN IF (NEW.record_kind='live' AND (NEW.amount_paisa>(COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x JOIN managed_entitlements e ON e.id=x.entitlement_id JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id WHERE e.seller_id=NEW.seller_id AND s.record_kind='live' AND s.live_activation_decision_id IS NOT NULL AND s.live_clearance_id IS NOT NULL AND s.live_financial_scope_id IS NOT NULL),0)-COALESCE((SELECT SUM(p.amount_paisa) FROM managed_payouts p WHERE p.seller_id=NEW.seller_id AND p.record_kind='live' AND p.status='paid'),0)) OR EXISTS(SELECT 1 FROM managed_payouts p WHERE p.seller_id=NEW.seller_id AND p.record_kind='live' AND p.status IN('prepared','approved','processing','failed')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_original_balance_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_payout_independent_actor BEFORE INSERT ON managed_payouts FOR EACH ROW BEGIN IF (NEW.record_kind='live' AND NOT EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=NEW.prepared_by JOIN user_roles r ON r.user_id=u.id WHERE s.id=NEW.seller_id AND s.user_id<>u.id AND u.status='active' AND r.role='super_admin' AND (NEW.approved_by IS NULL OR NEW.approved_by=u.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_payout_independent_actor_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_allocation_retained_interest BEFORE INSERT ON managed_payout_allocations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM managed_payouts p WHERE p.id=NEW.payout_id AND p.record_kind='live') AND NOT EXISTS(SELECT 1 FROM managed_payouts p JOIN managed_entitlements e ON e.id=NEW.entitlement_id JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id JOIN managed_live_activation_decisions d ON d.id=s.live_activation_decision_id WHERE p.id=NEW.payout_id AND NEW.actor_id=p.prepared_by AND d.owner_id<>p.prepared_by AND (p.approved_by IS NULL OR d.owner_id<>p.approved_by))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_original_interest_requires_independent_actor'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_allocation_original_parties BEFORE INSERT ON managed_payout_allocations FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM managed_payouts p JOIN managed_entitlements e ON e.id=NEW.entitlement_id JOIN managed_commercial_snapshots allocation_party ON allocation_party.id=e.snapshot_id WHERE p.id=NEW.payout_id AND p.record_kind='live' AND (allocation_party.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=allocation_party.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=allocation_party.live_activation_decision_id WHERE party_owner.id=allocation_party.seller_id AND (party_owner.user_id=NEW.actor_id OR party_decision.owner_id=NEW.actor_id OR allocation_party.live_customer_id=NEW.actor_id OR party_order.customer_id=NEW.actor_id))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_allocation_party_requires_independent_actor'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_packet_original_allocations BEFORE INSERT ON payout_transfer_packets FOR EACH ROW BEGIN IF (NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM managed_payouts original_packet WHERE original_packet.id=NEW.managed_payout_id AND original_packet.record_kind='live') AND NOT EXISTS(SELECT 1 FROM managed_payouts p WHERE p.id=NEW.managed_payout_id AND p.amount_paisa=NEW.amount_paisa AND (SELECT COALESCE(SUM(a.amount_paisa),0) FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.disposition='reserved')=p.amount_paisa AND EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.disposition='reserved'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_packet_original_allocations_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_packet_prepare_parties BEFORE INSERT ON payout_transfer_packets FOR EACH ROW BEGIN IF (NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM managed_payouts original_packet WHERE original_packet.id=NEW.managed_payout_id AND original_packet.record_kind='live') AND EXISTS(SELECT 1 FROM managed_payout_allocations party_allocation JOIN managed_entitlements party_earning ON party_earning.id=party_allocation.entitlement_id JOIN managed_commercial_snapshots payout_party ON payout_party.id=party_earning.snapshot_id WHERE party_allocation.payout_id=NEW.managed_payout_id AND (payout_party.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=payout_party.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=payout_party.live_activation_decision_id WHERE party_owner.id=payout_party.seller_id AND (party_owner.user_id=NEW.prepared_by OR party_decision.owner_id=NEW.prepared_by OR payout_party.live_customer_id=NEW.prepared_by OR party_order.customer_id=NEW.prepared_by))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_packet_party_requires_independent_actor'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_packet_approved_parties BEFORE UPDATE ON payout_transfer_packets FOR EACH ROW BEGIN IF (NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM managed_payouts original_packet WHERE original_packet.id=NEW.managed_payout_id AND original_packet.record_kind='live') AND NEW.state='approved' AND (NEW.state<>OLD.state OR NOT (NEW.approved_by <=> OLD.approved_by)) AND EXISTS(SELECT 1 FROM managed_payout_allocations party_allocation JOIN managed_entitlements party_earning ON party_earning.id=party_allocation.entitlement_id JOIN managed_commercial_snapshots payout_party ON payout_party.id=party_earning.snapshot_id WHERE party_allocation.payout_id=NEW.managed_payout_id AND (payout_party.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=payout_party.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=payout_party.live_activation_decision_id WHERE party_owner.id=payout_party.seller_id AND (party_owner.user_id=NEW.approved_by OR party_decision.owner_id=NEW.approved_by OR payout_party.live_customer_id=NEW.approved_by OR party_order.customer_id=NEW.approved_by))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_packet_party_requires_independent_actor'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_packet_processing_parties BEFORE UPDATE ON payout_transfer_packets FOR EACH ROW BEGIN IF (NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM managed_payouts original_packet WHERE original_packet.id=NEW.managed_payout_id AND original_packet.record_kind='live') AND NEW.state='processing' AND (NEW.state<>OLD.state OR NOT (NEW.started_by <=> OLD.started_by)) AND EXISTS(SELECT 1 FROM managed_payout_allocations party_allocation JOIN managed_entitlements party_earning ON party_earning.id=party_allocation.entitlement_id JOIN managed_commercial_snapshots payout_party ON payout_party.id=party_earning.snapshot_id WHERE party_allocation.payout_id=NEW.managed_payout_id AND (payout_party.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=payout_party.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=payout_party.live_activation_decision_id WHERE party_owner.id=payout_party.seller_id AND (party_owner.user_id=NEW.started_by OR party_decision.owner_id=NEW.started_by OR payout_party.live_customer_id=NEW.started_by OR party_order.customer_id=NEW.started_by))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_packet_party_requires_independent_actor'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_packet_uncertain_parties BEFORE UPDATE ON payout_transfer_packets FOR EACH ROW BEGIN IF (NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM managed_payouts original_packet WHERE original_packet.id=NEW.managed_payout_id AND original_packet.record_kind='live') AND NEW.state='uncertain' AND (NEW.state<>OLD.state OR NOT (NEW.recorded_by <=> OLD.recorded_by)) AND EXISTS(SELECT 1 FROM managed_payout_allocations party_allocation JOIN managed_entitlements party_earning ON party_earning.id=party_allocation.entitlement_id JOIN managed_commercial_snapshots payout_party ON payout_party.id=party_earning.snapshot_id WHERE party_allocation.payout_id=NEW.managed_payout_id AND (payout_party.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=payout_party.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=payout_party.live_activation_decision_id WHERE party_owner.id=payout_party.seller_id AND (party_owner.user_id=NEW.recorded_by OR party_decision.owner_id=NEW.recorded_by OR payout_party.live_customer_id=NEW.recorded_by OR party_order.customer_id=NEW.recorded_by))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_packet_party_requires_independent_actor'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_packet_paid_parties BEFORE UPDATE ON payout_transfer_packets FOR EACH ROW BEGIN IF (NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM managed_payouts original_packet WHERE original_packet.id=NEW.managed_payout_id AND original_packet.record_kind='live') AND NEW.state='paid' AND (NEW.state<>OLD.state OR NOT (NEW.recorded_by <=> OLD.recorded_by)) AND EXISTS(SELECT 1 FROM managed_payout_allocations party_allocation JOIN managed_entitlements party_earning ON party_earning.id=party_allocation.entitlement_id JOIN managed_commercial_snapshots payout_party ON payout_party.id=party_earning.snapshot_id WHERE party_allocation.payout_id=NEW.managed_payout_id AND (payout_party.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=payout_party.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=payout_party.live_activation_decision_id WHERE party_owner.id=payout_party.seller_id AND (party_owner.user_id=NEW.recorded_by OR party_decision.owner_id=NEW.recorded_by OR payout_party.live_customer_id=NEW.recorded_by OR party_order.customer_id=NEW.recorded_by))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_packet_party_requires_independent_actor'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_packet_failed_parties BEFORE UPDATE ON payout_transfer_packets FOR EACH ROW BEGIN IF (NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM managed_payouts original_packet WHERE original_packet.id=NEW.managed_payout_id AND original_packet.record_kind='live') AND NEW.state='failed' AND (NEW.state<>OLD.state OR NOT (NEW.recorded_by <=> OLD.recorded_by)) AND EXISTS(SELECT 1 FROM managed_payout_allocations party_allocation JOIN managed_entitlements party_earning ON party_earning.id=party_allocation.entitlement_id JOIN managed_commercial_snapshots payout_party ON payout_party.id=party_earning.snapshot_id WHERE party_allocation.payout_id=NEW.managed_payout_id AND (payout_party.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=payout_party.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=payout_party.live_activation_decision_id WHERE party_owner.id=payout_party.seller_id AND (party_owner.user_id=NEW.recorded_by OR party_decision.owner_id=NEW.recorded_by OR payout_party.live_customer_id=NEW.recorded_by OR party_order.customer_id=NEW.recorded_by))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_packet_party_requires_independent_actor'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_packet_void_parties BEFORE UPDATE ON payout_transfer_packets FOR EACH ROW BEGIN IF (NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM managed_payouts original_packet WHERE original_packet.id=NEW.managed_payout_id AND original_packet.record_kind='live') AND NEW.state='void' AND (NEW.state<>OLD.state OR NOT (NEW.recorded_by <=> OLD.recorded_by)) AND EXISTS(SELECT 1 FROM managed_payout_allocations party_allocation JOIN managed_entitlements party_earning ON party_earning.id=party_allocation.entitlement_id JOIN managed_commercial_snapshots payout_party ON payout_party.id=party_earning.snapshot_id WHERE party_allocation.payout_id=NEW.managed_payout_id AND (payout_party.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=payout_party.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=payout_party.live_activation_decision_id WHERE party_owner.id=payout_party.seller_id AND (party_owner.user_id=NEW.recorded_by OR party_decision.owner_id=NEW.recorded_by OR payout_party.live_customer_id=NEW.recorded_by OR party_order.customer_id=NEW.recorded_by))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_packet_party_requires_independent_actor'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_actual_live_instruction_retained BEFORE UPDATE ON managed_payouts FOR EACH ROW BEGIN IF (OLD.record_kind='live' AND NEW.status='rejected' AND OLD.status<>NEW.status AND EXISTS(SELECT 1 FROM payout_transfer_packets p WHERE p.managed_payout_id=NEW.id AND p.state NOT IN('void','failed'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retire_or_reconcile_original_payout_instruction_first'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_invoice_original_source BEFORE INSERT ON managed_invoice_groups FOR EACH ROW BEGIN IF (NEW.record_kind='live' AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots s JOIN order_items i ON i.id=s.order_item_id JOIN managed_live_financial_scopes f ON f.id=s.live_financial_scope_id WHERE i.order_id=NEW.order_id AND s.record_kind='live' AND s.invoice_issuer_reference=NEW.issuer_reference AND f.id=JSON_UNQUOTE(JSON_EXTRACT(NEW.snapshot_json,'$.financialScopeId')) AND f.issuer_model=JSON_UNQUOTE(JSON_EXTRACT(NEW.snapshot_json,'$.issuerModel')) AND f.issuer_scope_digest=JSON_UNQUOTE(JSON_EXTRACT(NEW.snapshot_json,'$.issuerScopeDigest')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_invoice_original_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_invoice_retained BEFORE UPDATE ON managed_invoice_groups FOR EACH ROW BEGIN IF (OLD.record_kind='live') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_invoice_history_immutable'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_invoice_no_delete BEFORE DELETE ON managed_invoice_groups FOR EACH ROW BEGIN IF (OLD.record_kind='live') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_invoice_history_immutable'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_adjustment_original BEFORE INSERT ON managed_invoice_adjustments FOR EACH ROW BEGIN IF (NEW.record_kind='live' AND (NEW.kind<>'credit_note' OR NOT EXISTS(SELECT 1 FROM managed_invoice_groups g WHERE g.id=NEW.invoice_group_id AND g.record_kind='live' AND g.id=JSON_UNQUOTE(JSON_EXTRACT(NEW.snapshot_json,'$.originalInvoiceId')) AND g.invoice_number=JSON_UNQUOTE(JSON_EXTRACT(NEW.snapshot_json,'$.originalInvoiceNumber'))))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_adjustment_original_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_adjustment_same_kind BEFORE INSERT ON managed_invoice_adjustments FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM managed_invoice_groups g WHERE g.id=NEW.invoice_group_id AND g.record_kind=NEW.record_kind)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_adjustment_cannot_mix_kinds'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_financial_scope_actor BEFORE INSERT ON managed_live_financial_scopes FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.reviewed_by AND u.status='active' AND r.role='super_admin') OR length(NEW.company_scope_digest)<>64 OR length(NEW.issuer_scope_digest)<>64 OR substr(NEW.series_prefix,1,3)='SIM' OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(NEW.issuer_snapshot_json,'$.taxMode')),'')<>'PAN' OR length(NEW.series_prefix)<3 OR length(NEW.series_prefix)>60) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_financial_scope_review_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_series_opening BEFORE INSERT ON managed_live_invoice_series FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM managed_live_financial_scopes f WHERE f.id=NEW.financial_scope_id AND f.opening_number=NEW.next_number AND NEW.revision=0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_actual_opening_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_series_increment BEFORE UPDATE ON managed_live_invoice_series FOR EACH ROW BEGIN IF (NEW.financial_scope_id<>OLD.financial_scope_id OR NEW.next_number<>OLD.next_number+1 OR NEW.revision<>OLD.revision+1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_actual_sequence_retained'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_series_no_delete BEFORE DELETE ON managed_live_invoice_series FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_actual_sequence_retained'; END$$
CREATE OR REPLACE TRIGGER managed_live_number_original_artifact BEFORE INSERT ON managed_live_invoice_numbers FOR EACH ROW BEGIN IF (NOT (EXISTS(SELECT 1 FROM managed_live_invoice_series n WHERE n.financial_scope_id=NEW.financial_scope_id AND n.next_number=NEW.sequence+1) AND (EXISTS(SELECT 1 FROM managed_invoice_groups g WHERE g.id=NEW.invoice_group_id AND g.record_kind='live' AND g.invoice_number=NEW.invoice_number AND JSON_UNQUOTE(JSON_EXTRACT(g.snapshot_json,'$.financialScopeId'))=NEW.financial_scope_id) OR EXISTS(SELECT 1 FROM managed_invoice_adjustments a JOIN managed_invoice_groups g ON g.id=a.invoice_group_id WHERE a.id=NEW.adjustment_id AND a.record_kind='live' AND a.adjustment_number=NEW.invoice_number AND JSON_UNQUOTE(JSON_EXTRACT(g.snapshot_json,'$.financialScopeId'))=NEW.financial_scope_id)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_number_original_artifact_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_credit_actual_source BEFORE INSERT ON managed_invoice_adjustments FOR EACH ROW BEGIN IF (NEW.record_kind='live' AND NOT ((JSON_UNQUOTE(JSON_EXTRACT(NEW.snapshot_json,'$.sourceKind'))='refund' AND EXISTS(SELECT 1 FROM refunds r JOIN return_requests rr ON rr.id=r.return_request_id JOIN managed_commercial_snapshots s ON s.order_item_id=rr.order_item_id JOIN managed_invoice_groups g ON g.id=NEW.invoice_group_id WHERE r.id=JSON_UNQUOTE(JSON_EXTRACT(NEW.snapshot_json,'$.sourceId')) AND r.order_id=g.order_id AND r.status='paid' AND r.amount_paisa=NEW.amount_paisa AND s.record_kind='live' AND s.live_financial_scope_id=JSON_UNQUOTE(JSON_EXTRACT(g.snapshot_json,'$.financialScopeId')))) OR (JSON_UNQUOTE(JSON_EXTRACT(NEW.snapshot_json,'$.sourceKind'))='cancellation' AND EXISTS(SELECT 1 FROM orders o JOIN managed_invoice_groups g ON g.order_id=o.id WHERE g.id=NEW.invoice_group_id AND o.id=JSON_UNQUOTE(JSON_EXTRACT(NEW.snapshot_json,'$.sourceId')) AND o.status='cancelled')))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_credit_actual_original_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_credit_original_cap BEFORE INSERT ON managed_invoice_adjustments FOR EACH ROW BEGIN IF (NEW.record_kind='live' AND NOT EXISTS(SELECT 1 FROM managed_invoice_groups g WHERE g.id=NEW.invoice_group_id AND NEW.amount_paisa<=CAST(JSON_UNQUOTE(JSON_EXTRACT(g.snapshot_json,'$.commercialValuePaisa')) AS INTEGER)-COALESCE((SELECT SUM(a.amount_paisa) FROM managed_invoice_adjustments a WHERE a.invoice_group_id=g.id AND a.record_kind='live' AND a.kind='credit_note'),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_credit_original_value_cap'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_credit_source_binding BEFORE INSERT ON managed_live_invoice_adjustment_sources FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM managed_invoice_adjustments a WHERE a.id=NEW.adjustment_id AND a.invoice_group_id=NEW.invoice_group_id AND a.record_kind='live' AND JSON_UNQUOTE(JSON_EXTRACT(a.snapshot_json,'$.sourceKind'))=NEW.source_kind AND JSON_UNQUOTE(JSON_EXTRACT(a.snapshot_json,'$.sourceId'))=NEW.source_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_credit_source_binding_required'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_recovery_earnings_same_original_kind BEFORE INSERT ON seller_recovery_allocations FOR EACH ROW BEGIN IF (NEW.method='earnings' AND EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed') AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN managed_commercial_snapshots original ON original.order_item_id=JSON_UNQUOTE(JSON_EXTRACT(c.original_source_json,'$.orderItemId')) AND original.seller_id=c.seller_id JOIN managed_settlement_entries credit ON credit.id=NEW.managed_credit_id JOIN managed_entitlements credit_earning ON credit_earning.id=credit.entitlement_id JOIN managed_commercial_snapshots credit_original ON credit_original.id=credit_earning.snapshot_id JOIN managed_settlement_entries debit ON debit.id=NEW.managed_debit_id JOIN managed_entitlements debit_earning ON debit_earning.id=debit.entitlement_id JOIN managed_commercial_snapshots debit_original ON debit_original.id=debit_earning.snapshot_id WHERE c.id=NEW.case_id AND credit_original.id=original.id AND debit_original.seller_id=c.seller_id AND debit_original.record_kind=original.record_kind AND credit_original.record_kind=original.record_kind AND (original.record_kind='simulation' OR original.live_activation_decision_id IS NOT NULL AND original.live_clearance_id IS NOT NULL AND original.live_financial_scope_id IS NOT NULL AND debit_original.live_activation_decision_id IS NOT NULL AND debit_original.live_clearance_id IS NOT NULL AND debit_original.live_financial_scope_id IS NOT NULL))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_recovery_cannot_mix_simulation_live'; END IF; END$$
CREATE OR REPLACE TRIGGER managed_live_financial_scopes_update BEFORE UPDATE ON managed_live_financial_scopes FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_financial_history_immutable'; END$$
CREATE OR REPLACE TRIGGER managed_live_financial_scopes_delete BEFORE DELETE ON managed_live_financial_scopes FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_financial_history_immutable'; END$$
CREATE OR REPLACE TRIGGER managed_live_invoice_numbers_update BEFORE UPDATE ON managed_live_invoice_numbers FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_financial_history_immutable'; END$$
CREATE OR REPLACE TRIGGER managed_live_invoice_numbers_delete BEFORE DELETE ON managed_live_invoice_numbers FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_financial_history_immutable'; END$$
CREATE OR REPLACE TRIGGER managed_live_invoice_adjustment_sources_update BEFORE UPDATE ON managed_live_invoice_adjustment_sources FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_financial_history_immutable'; END$$
CREATE OR REPLACE TRIGGER managed_live_invoice_adjustment_sources_delete BEFORE DELETE ON managed_live_invoice_adjustment_sources FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='managed_live_financial_history_immutable'; END$$
DELIMITER ;
-- Additive delivery evidence and operational clocks. Never applied by local startup.
CREATE TABLE email_delivery_attempts (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 queue_kind VARCHAR(191) NOT NULL CHECK(queue_kind IN('order','business')),
 queue_id VARCHAR(191) NOT NULL,
 claim_token VARCHAR(191) NOT NULL UNIQUE,
 attempt_number BIGINT NOT NULL CHECK(attempt_number>0),
 phase VARCHAR(191) NOT NULL CHECK(phase IN('claimed','handoff_started','accepted','captured','uncertain','not_accepted','cancelled')),
 message_id VARCHAR(191) NOT NULL,
 started_at BIGINT NOT NULL,
 transport VARCHAR(191),
 transport_key VARCHAR(191),
 provider_receipt TEXT,
 failure_category VARCHAR(191) CHECK(failure_category IN('temporary','permanent_recipient','configuration','unknown')),
 failure_code VARCHAR(191),
 config_fingerprint VARCHAR(191),
 recipient_fingerprint VARCHAR(191),
 handoff_at BIGINT,
 completed_at BIGINT,
 retry_at BIGINT,
 UNIQUE(queue_kind,queue_id,attempt_number)
);

CREATE INDEX email_delivery_attempt_queue ON email_delivery_attempts(queue_kind,queue_id,started_at);

CREATE INDEX email_delivery_attempt_fence ON email_delivery_attempts(queue_kind,queue_id,phase);

CREATE TABLE email_transport_backoff (
 transport_key VARCHAR(191) PRIMARY KEY NOT NULL,
 blocked_until BIGINT NOT NULL,
 updated_at BIGINT NOT NULL,
 config_fingerprint VARCHAR(191),
 failure_category VARCHAR(191) CHECK(failure_category IN('temporary','permanent_recipient','configuration','unknown')),
 failure_code VARCHAR(191)
);

CREATE TABLE operational_reminder_cursors (
 family VARCHAR(191) PRIMARY KEY NOT NULL,
 `cursor` TEXT NOT NULL DEFAULT '',
 revision BIGINT NOT NULL DEFAULT 0,
 lease_token VARCHAR(191),
 lease_until BIGINT
);

CREATE TABLE operational_notice_states (
 family VARCHAR(191) NOT NULL,
 source_id VARCHAR(191) NOT NULL,
 current_event_id VARCHAR(191) NOT NULL,
 current_status VARCHAR(191) NOT NULL,
 revision BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(family,source_id)
);

CREATE TABLE operational_reminder_milestones (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 family VARCHAR(191) NOT NULL,
 source_id VARCHAR(191) NOT NULL,
 milestone VARCHAR(191) NOT NULL,
 source_revision VARCHAR(191) NOT NULL,
 due_at BIGINT NOT NULL,
 created_at BIGINT NOT NULL,
 UNIQUE(family,source_id,milestone,source_revision,due_at)
);

CREATE INDEX operational_reminder_milestone_due ON operational_reminder_milestones(family,due_at,id);

DELIMITER $$
CREATE TRIGGER email_delivery_attempt_identity BEFORE UPDATE ON email_delivery_attempts FOR EACH ROW BEGIN
IF NOT(NEW.id<=>OLD.id) OR NOT(NEW.queue_kind<=>OLD.queue_kind) OR NOT(NEW.queue_id<=>OLD.queue_id) OR NOT(NEW.claim_token<=>OLD.claim_token) OR NOT(NEW.attempt_number<=>OLD.attempt_number) OR NOT(NEW.message_id<=>OLD.message_id) OR NOT(NEW.started_at<=>OLD.started_at) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_attempt_identity_immutable';
END IF;
END$$
CREATE TRIGGER email_delivery_acceptance_retained BEFORE UPDATE ON email_delivery_attempts FOR EACH ROW BEGIN
IF OLD.phase IN('accepted','captured') AND (NOT(NEW.phase<=>OLD.phase) OR NOT(NEW.transport<=>OLD.transport) OR NOT(NEW.provider_receipt<=>OLD.provider_receipt) OR NOT(NEW.completed_at<=>OLD.completed_at)) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_acceptance_immutable';
END IF;
END$$
CREATE TRIGGER email_delivery_attempt_retained BEFORE DELETE ON email_delivery_attempts FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='delivery_attempt_retained';
END$$
CREATE TRIGGER operational_reminder_milestone_immutable BEFORE UPDATE ON operational_reminder_milestones FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='reminder_milestone_immutable';
END$$
DELIMITER ;
-- Actual observation evidence; no scheduler or external contact is enabled by this schema.
CREATE TABLE service_health_observations (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 environment VARCHAR(191) NOT NULL CHECK(environment IN('production','development','local_staging','test')),
 service_key VARCHAR(191) NOT NULL,
 run_key VARCHAR(191) NOT NULL,
 observed_at BIGINT NOT NULL,
 successful BIGINT NOT NULL CHECK(successful IN(0,1)),
 functional_success BIGINT NOT NULL DEFAULT 0 CHECK(functional_success IN(0,1)),
 eligible_backlog BIGINT NOT NULL CHECK(eligible_backlog>=0),
 oldest_eligible_at BIGINT,
 progress_count BIGINT NOT NULL DEFAULT 0 CHECK(progress_count>=0),
 failure_category VARCHAR(191) CHECK(failure_category IN('provider','recipient','configuration','unknown','worker')),
 source_kind VARCHAR(191) NOT NULL CHECK(source_kind IN('sender','evaluator','watchdog')),
 UNIQUE(environment,service_key,run_key)
);

CREATE INDEX service_health_observation_clock ON service_health_observations(environment,service_key,observed_at,id);

CREATE TABLE service_health_incidents (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 environment VARCHAR(191) NOT NULL CHECK(environment IN('production','development','local_staging','test')),
 service_key VARCHAR(191) NOT NULL,
 episode BIGINT NOT NULL CHECK(episode>0),
 state VARCHAR(191) NOT NULL CHECK(state IN('detected','assigned','working','monitoring','resolved')),
 severity VARCHAR(191) NOT NULL DEFAULT 'high' CHECK(severity IN('critical','high','routine')),
 first_seen_at BIGINT NOT NULL,
 last_seen_at BIGINT NOT NULL,
 resolved_at BIGINT,
 failure_category VARCHAR(191) CHECK(failure_category IN('provider','recipient','configuration','unknown','worker')),
 revision BIGINT NOT NULL DEFAULT 0,
 UNIQUE(environment,service_key,episode)
);

ALTER TABLE service_health_incidents ADD COLUMN open_key VARCHAR(383) GENERATED ALWAYS AS (CASE WHEN state<>'resolved' THEN CONCAT(environment,':',service_key) ELSE NULL END) STORED, ADD UNIQUE KEY service_health_one_open(open_key);

CREATE TABLE service_health_guards (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 valid BIGINT NOT NULL CHECK(valid=1)
);

DELIMITER $$
CREATE TRIGGER service_health_observation_immutable BEFORE UPDATE ON service_health_observations FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='service_health_observation_immutable';
END$$
CREATE TRIGGER service_health_incident_identity BEFORE UPDATE ON service_health_incidents FOR EACH ROW BEGIN
IF NOT(NEW.id<=>OLD.id) OR NOT(NEW.environment<=>OLD.environment) OR NOT(NEW.service_key<=>OLD.service_key) OR NOT(NEW.episode<=>OLD.episode) OR NOT(NEW.first_seen_at<=>OLD.first_seen_at) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='service_health_incident_identity_immutable';
END IF;
END$$
DELIMITER ;
-- Additive governance records only. No actual roster, role or permission is seeded.
CREATE TABLE staff_invitation_grants (
 invitation_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES staff_invitations(id),permissions_json LONGTEXT NOT NULL CHECK(json_valid(permissions_json) AND JSON_TYPE(permissions_json)='ARRAY'),
 grant_version BIGINT NOT NULL DEFAULT 1 CHECK(grant_version>0),created_by VARCHAR(191) NOT NULL REFERENCES users(id),created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_duties (
 id VARCHAR(191) PRIMARY KEY NOT NULL, department VARCHAR(191) NOT NULL, label LONGTEXT NOT NULL,
 required_permission VARCHAR(191) NOT NULL, reserved_super_admin BIGINT NOT NULL CHECK(reserved_super_admin IN (0,1)),
 primary_user_id VARCHAR(191) REFERENCES users(id), revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at BIGINT NOT NULL, updated_by VARCHAR(191) NOT NULL REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_duty_backups (
 duty_id VARCHAR(191) NOT NULL REFERENCES team_duties(id), user_id VARCHAR(191) NOT NULL REFERENCES users(id),
 position BIGINT NOT NULL CHECK(position>=0), PRIMARY KEY(duty_id,user_id), UNIQUE(duty_id,position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE team_availability (
 id VARCHAR(191) PRIMARY KEY NOT NULL,user_id VARCHAR(191) NOT NULL REFERENCES users(id),starts_at BIGINT NOT NULL,ends_at BIGINT NOT NULL,
 available BIGINT NOT NULL CHECK(available IN(0,1)),reason LONGTEXT NOT NULL,revision BIGINT NOT NULL DEFAULT 0,
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),created_at BIGINT NOT NULL,CHECK(ends_at>starts_at),UNIQUE(user_id,revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_handoffs (
 id VARCHAR(191) PRIMARY KEY NOT NULL,duty_id VARCHAR(191) NOT NULL REFERENCES team_duties(id),from_user_id VARCHAR(191) REFERENCES users(id),
 to_user_id VARCHAR(191) NOT NULL REFERENCES users(id),starts_at BIGINT NOT NULL,ends_at BIGINT NOT NULL,
 state VARCHAR(191) NOT NULL CHECK(state IN('pending','accepted','cancelled')),revision BIGINT NOT NULL DEFAULT 0,
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),created_at BIGINT NOT NULL,accepted_at BIGINT,
 CHECK(ends_at>starts_at),CHECK(from_user_id IS NULL OR from_user_id<>to_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_access_reviews (
 id VARCHAR(191) PRIMARY KEY NOT NULL,user_id VARCHAR(191) NOT NULL REFERENCES users(id),grant_version BIGINT NOT NULL,
 completed_at BIGINT NOT NULL,reviewer_id VARCHAR(191) NOT NULL REFERENCES users(id),reason LONGTEXT NOT NULL,
 request_id VARCHAR(191) NOT NULL,UNIQUE(reviewer_id,request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_checkpoints (
 id VARCHAR(191) PRIMARY KEY NOT NULL,duty_id VARCHAR(191) NOT NULL REFERENCES team_duties(id),nepal_date VARCHAR(191) NOT NULL,
 kind VARCHAR(191) NOT NULL CHECK(kind IN('payout_queue','reconciliation')),due_at BIGINT NOT NULL,
 completed_at BIGINT,completed_by VARCHAR(191) REFERENCES users(id),next_action LONGTEXT,
 revision BIGINT NOT NULL DEFAULT 0,UNIQUE(nepal_date,kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_procedures (
 id VARCHAR(191) PRIMARY KEY NOT NULL,family VARCHAR(191) NOT NULL,version BIGINT NOT NULL CHECK(version>0),title LONGTEXT NOT NULL,
 body LONGTEXT NOT NULL,owner_id VARCHAR(191) REFERENCES users(id),published_at BIGINT NOT NULL,retired_at BIGINT,
 native_source_type VARCHAR(191) CHECK(native_source_type IS NULL OR native_source_type='internal_legal_procedure'),
 native_source_id VARCHAR(191) REFERENCES audit_logs(id),native_source_sha256 VARCHAR(191),
 UNIQUE(family,version),
 CHECK((native_source_type IS NULL AND native_source_id IS NULL AND native_source_sha256 IS NULL) OR (native_source_type='internal_legal_procedure' AND native_source_id IS NOT NULL AND native_source_sha256 IS NOT NULL AND length(native_source_sha256)=64 AND body=''))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_procedure_assignments (
 procedure_id VARCHAR(191) NOT NULL REFERENCES team_procedures(id),user_id VARCHAR(191) NOT NULL REFERENCES users(id),
 assigned_at BIGINT NOT NULL,acknowledged_at BIGINT,PRIMARY KEY(procedure_id,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_governance_tasks (
 id VARCHAR(191) PRIMARY KEY NOT NULL,kind VARCHAR(191) NOT NULL,source_id VARCHAR(191) NOT NULL,duty_id VARCHAR(191) REFERENCES team_duties(id),
 subject_user_id VARCHAR(191) REFERENCES users(id),created_at BIGINT NOT NULL,due_at BIGINT NOT NULL,
 state VARCHAR(191) NOT NULL CHECK(state IN('open','completed','superseded')),revision BIGINT NOT NULL DEFAULT 0,
 completed_at BIGINT,source_reference_json LONGTEXT NOT NULL DEFAULT '{}' CHECK(json_valid(source_reference_json)),UNIQUE(kind,source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_governance_events (
 id VARCHAR(191) PRIMARY KEY NOT NULL,source_type VARCHAR(191) NOT NULL,source_id VARCHAR(191) NOT NULL,action VARCHAR(191) NOT NULL,
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),created_at BIGINT NOT NULL,reason LONGTEXT NOT NULL,
 details_json LONGTEXT NOT NULL CHECK(json_valid(details_json)),request_id VARCHAR(191) NOT NULL,
 UNIQUE(actor_id,request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;















CREATE INDEX team_handoffs_current ON team_handoffs(duty_id,state,starts_at,ends_at);

CREATE INDEX team_governance_tasks_scan ON team_governance_tasks(state,id);

CREATE INDEX team_governance_tasks_subject ON team_governance_tasks(kind,subject_user_id,state);

DELIMITER $$
CREATE TRIGGER team_no_self_backup BEFORE INSERT ON team_duty_backups FOR EACH ROW BEGIN
IF EXISTS(SELECT 1 FROM team_duties WHERE id=NEW.duty_id AND primary_user_id=NEW.user_id) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='team_primary_cannot_back_own_absence';
END IF;
END$$
CREATE TRIGGER team_event_immutable BEFORE UPDATE ON team_governance_events FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='team_governance_history_immutable';
END$$
CREATE TRIGGER team_event_retained BEFORE DELETE ON team_governance_events FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='team_governance_history_retained';
END$$
CREATE TRIGGER team_access_review_immutable BEFORE UPDATE ON team_access_reviews FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='team_access_review_immutable';
END$$
CREATE TRIGGER team_access_review_retained BEFORE DELETE ON team_access_reviews FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='team_access_review_retained';
END$$
CREATE TRIGGER team_ack_original BEFORE UPDATE ON team_procedure_assignments FOR EACH ROW BEGIN
IF BINARY NEW.procedure_id<>BINARY OLD.procedure_id OR BINARY NEW.user_id<>BINARY OLD.user_id OR BINARY NEW.assigned_at<>BINARY OLD.assigned_at OR (OLD.acknowledged_at IS NOT NULL AND (NEW.acknowledged_at IS NULL OR BINARY NEW.acknowledged_at<>BINARY OLD.acknowledged_at)) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='team_acknowledgment_original_retained';
END IF;
END$$
CREATE TRIGGER team_procedure_original_immutable BEFORE UPDATE ON team_procedures FOR EACH ROW BEGIN
IF BINARY NEW.family<>BINARY OLD.family OR BINARY NEW.version<>BINARY OLD.version OR BINARY NEW.title<>BINARY OLD.title OR BINARY NEW.body<>BINARY OLD.body OR BINARY NEW.published_at<>BINARY OLD.published_at OR (NEW.native_source_type IS NULL)<>(OLD.native_source_type IS NULL) OR BINARY NEW.native_source_type<>BINARY OLD.native_source_type OR (NEW.native_source_id IS NULL)<>(OLD.native_source_id IS NULL) OR BINARY NEW.native_source_id<>BINARY OLD.native_source_id OR (NEW.native_source_sha256 IS NULL)<>(OLD.native_source_sha256 IS NULL) OR BINARY NEW.native_source_sha256<>BINARY OLD.native_source_sha256 THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='team_procedure_version_immutable';
END IF;
END$$
CREATE TRIGGER team_task_original_clock BEFORE UPDATE ON team_governance_tasks FOR EACH ROW BEGIN
IF BINARY NEW.created_at<>BINARY OLD.created_at OR BINARY NEW.due_at<>BINARY OLD.due_at OR BINARY NEW.kind<>BINARY OLD.kind OR BINARY NEW.source_id<>BINARY OLD.source_id OR BINARY NEW.source_reference_json<>BINARY OLD.source_reference_json THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='team_task_original_clock_immutable';
END IF;
END$$
DELIMITER ;
-- Incident governance extends the existing health episode; no parallel business queue.
ALTER TABLE service_health_observations ADD COLUMN evidence_scope LONGTEXT;
CREATE TABLE service_incident_governance (
 incident_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES service_health_incidents(id),
 title LONGTEXT NOT NULL DEFAULT 'Service incident',
 impact_class VARCHAR(191) NOT NULL DEFAULT 'ordinary' CHECK(impact_class IN('ordinary','privacy','security','financial_integrity')),
 impact_summary LONGTEXT NOT NULL DEFAULT 'Impact not yet assessed',
 failure_signature VARCHAR(191) NOT NULL,
 release_reference VARCHAR(191),
 configuration_reference VARCHAR(191),
 owner_id VARCHAR(191) REFERENCES users(id),
 backup_id VARCHAR(191) REFERENCES users(id),
 acknowledged_at BIGINT,
 acknowledged_by VARCHAR(191) REFERENCES users(id),
 plan_text LONGTEXT,
 plan_at BIGINT,
 first_review_at BIGINT,
 next_action LONGTEXT,
 next_update_at BIGINT,
 acknowledge_due_at BIGINT NOT NULL,
 plan_due_at BIGINT NOT NULL,
 update_interval_ms BIGINT NOT NULL CHECK(update_interval_ms>0),
 closure_required BIGINT NOT NULL DEFAULT 1 CHECK(closure_required IN(0,1)),
 closure_authorized_revision BIGINT,
 closed_by VARCHAR(191) REFERENCES users(id),
 resolution_cause LONGTEXT,
 recovery_first_observation_id VARCHAR(191) REFERENCES service_health_observations(id),
 recovery_last_observation_id VARCHAR(191) REFERENCES service_health_observations(id),
 merged_into VARCHAR(191) REFERENCES service_health_incidents(id),
 legacy_incident_id VARCHAR(191) UNIQUE REFERENCES operational_incidents(id),
 prior_incident_id VARCHAR(191) REFERENCES service_health_incidents(id),
 revision BIGINT NOT NULL DEFAULT 0,
 updated_at BIGINT NOT NULL,
 CHECK(owner_id IS NULL OR backup_id IS NULL OR owner_id<>backup_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX service_incident_due ON service_incident_governance(acknowledge_due_at,next_update_at,incident_id);
CREATE TABLE service_incident_events (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 incident_id VARCHAR(191) NOT NULL REFERENCES service_health_incidents(id),
 request_id VARCHAR(191) NOT NULL UNIQUE,
 actor_id VARCHAR(191) REFERENCES users(id),
 action VARCHAR(191) NOT NULL,
 from_revision VARCHAR(191),
 to_revision VARCHAR(191) NOT NULL,
 governance_revision BIGINT NOT NULL,
 facts_json LONGTEXT NOT NULL,
 occurred_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX service_incident_event_history ON service_incident_events(incident_id,occurred_at,id);
CREATE TABLE service_incident_links (
 incident_id VARCHAR(191) NOT NULL REFERENCES service_health_incidents(id),
 source_type VARCHAR(191) NOT NULL CHECK(source_type IN('order','seller','payment','refund','return_request','complaint','incident')),
 source_id VARCHAR(191) NOT NULL,
 linked_by VARCHAR(191) NOT NULL REFERENCES users(id),
 linked_at BIGINT NOT NULL,
 PRIMARY KEY(incident_id,source_type,source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE service_incident_legacy_links (
 legacy_incident_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES operational_incidents(id),
 incident_id VARCHAR(191) NOT NULL REFERENCES service_health_incidents(id),
 mapped_by VARCHAR(191) NOT NULL REFERENCES users(id),
 mapped_at BIGINT NOT NULL,
 legacy_status VARCHAR(191) NOT NULL,
 legacy_updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER service_incident_events_no_update BEFORE UPDATE ON service_incident_events FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='incident_history_immutable';
END$$
CREATE TRIGGER service_incident_events_no_delete BEFORE DELETE ON service_incident_events FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='incident_history_retained';
END$$
CREATE TRIGGER service_incident_links_no_delete BEFORE DELETE ON service_incident_links FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='incident_source_link_retained';
END$$
CREATE TRIGGER service_incident_legacy_link_no_update BEFORE UPDATE ON service_incident_legacy_links FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='incident_legacy_mapping_immutable';
END$$
CREATE TRIGGER service_incident_legacy_link_no_delete BEFORE DELETE ON service_incident_legacy_links FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='incident_legacy_mapping_retained';
END$$
CREATE TRIGGER service_incident_governed_close BEFORE UPDATE ON service_health_incidents FOR EACH ROW BEGIN
IF NEW.state='resolved' AND OLD.state<>'resolved' AND EXISTS(SELECT 1 FROM service_incident_governance g WHERE g.incident_id=OLD.id AND (g.closure_required=1 OR g.impact_class<>'ordinary') AND (g.closure_authorized_revision IS NULL OR g.closure_authorized_revision<>NEW.revision OR g.closed_by IS NULL)) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='incident_governance_closure_required';
END IF;
END$$
DELIMITER ;
-- Additive source only. No canonical migration or diagnostic cleanup is authorized.
ALTER TABLE form_answer_sets ADD COLUMN health_environment VARCHAR(191) CHECK(health_environment IN('production','development','local_staging','test'));

ALTER TABLE form_answer_sets ADD COLUMN health_release_id VARCHAR(191);

CREATE TABLE form_health_observations (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 support_reference VARCHAR(191) NOT NULL UNIQUE,
 environment VARCHAR(191) NOT NULL CHECK(environment IN('production','development','local_staging','test','unknown')),
 release_id VARCHAR(191) NOT NULL,
 form_id VARCHAR(191) NOT NULL,
 form_version BIGINT,
 journey VARCHAR(191) NOT NULL,
 phase VARCHAR(191) NOT NULL CHECK(phase IN('load','save')),
 outcome VARCHAR(191) NOT NULL CHECK(outcome IN('compatible','fallback','blocked','saved')),
 category VARCHAR(191) CHECK(category IN('definition_unavailable','definition_invalid','read_unavailable','durable_submission')),
 evidence_kind VARCHAR(191) NOT NULL CHECK(evidence_kind IN('runtime','form_answer_set','core_receipt')),
 evidence_id VARCHAR(191),
 observed_at BIGINT NOT NULL CHECK(observed_at>=0),
 CHECK((phase='load' AND outcome IN('compatible','fallback','blocked') AND evidence_kind='runtime' AND evidence_id IS NULL) OR (phase='save' AND outcome='saved' AND evidence_kind IN('form_answer_set','core_receipt') AND evidence_id IS NOT NULL)),
 UNIQUE(evidence_kind,evidence_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX form_health_scope_clock ON form_health_observations(environment,release_id,form_id,observed_at,id);

CREATE TABLE form_health_incident_links (
 observation_id VARCHAR(191) NOT NULL REFERENCES form_health_observations(id),
 incident_id VARCHAR(191) NOT NULL REFERENCES service_health_incidents(id),
 retained_at BIGINT NOT NULL,
 PRIMARY KEY(observation_id,incident_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;









CREATE TABLE file_health_observations (
 id VARCHAR(191) PRIMARY KEY NOT NULL,
 support_reference VARCHAR(191) NOT NULL UNIQUE,
 environment VARCHAR(191) NOT NULL CHECK(environment IN('production','development','local_staging','test','unknown')),
 release_id VARCHAR(191) NOT NULL,
 access_kind VARCHAR(191) NOT NULL CHECK(access_kind IN('public','private')),
 outcome VARCHAR(191) NOT NULL CHECK(outcome IN('read','blocked')),
 category VARCHAR(191) CHECK(category='storage_read_failed'),
 observed_at BIGINT NOT NULL CHECK(observed_at>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX file_health_scope_clock ON file_health_observations(environment,release_id,access_kind,observed_at,id);

CREATE TABLE file_health_incident_links (
 observation_id VARCHAR(191) NOT NULL REFERENCES file_health_observations(id),
 incident_id VARCHAR(191) NOT NULL REFERENCES service_health_incidents(id),
 retained_at BIGINT NOT NULL,
 PRIMARY KEY(observation_id,incident_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER form_health_observation_retained BEFORE UPDATE ON form_health_observations FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='form_health_observation_retained';
END$$
CREATE TRIGGER form_health_incident_link_retained BEFORE UPDATE ON form_health_incident_links FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='form_health_incident_link_retained';
END$$
CREATE TRIGGER form_health_observation_no_delete BEFORE DELETE ON form_health_observations FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='form_health_cleanup_not_enabled';
END$$
CREATE TRIGGER form_health_incident_link_no_delete BEFORE DELETE ON form_health_incident_links FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='form_health_incident_evidence_retained';
END$$
CREATE TRIGGER file_health_observation_retained BEFORE UPDATE ON file_health_observations FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='file_health_observation_retained';
END$$
CREATE TRIGGER file_health_observation_no_delete BEFORE DELETE ON file_health_observations FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='file_health_cleanup_not_enabled';
END$$
CREATE TRIGGER file_health_incident_link_retained BEFORE UPDATE ON file_health_incident_links FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='file_health_incident_link_retained';
END$$
CREATE TRIGGER file_health_incident_link_no_delete BEFORE DELETE ON file_health_incident_links FOR EACH ROW BEGIN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='file_health_incident_evidence_retained';
END$$
DELIMITER ;
-- Derived exclusively from existing SQLite 0033 and 0035; no new SQLite migration.
-- 0033 SHA256 87f1f28e308e288ae356051dcb4f87cd7457c0fdddb7229c4baa4ba5add9823c
-- 0035 SHA256 edca5c83b959ab533e1293e24d582ae64d23c4deeaa899e81eaf87c1560e4fee
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS business_event_key LONGTEXT NULL;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS required_permission LONGTEXT NULL;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS delivery_attempts BIGINT NOT NULL DEFAULT 0;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS delivery_next_attempt_at BIGINT NOT NULL DEFAULT 0;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS delivery_lease_until BIGINT NOT NULL DEFAULT 0;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS delivery_claim_token LONGTEXT NULL;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS guest_email LONGTEXT NULL;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS guest_order_id LONGTEXT NULL;
ALTER TABLE notification_messages MODIFY COLUMN recipient_user_id VARCHAR(191) NULL;
CREATE INDEX IF NOT EXISTS idx_business_notification_queue ON notification_messages(channel,status,delivery_next_attempt_at,delivery_lease_until);
DELIMITER $$
CREATE OR REPLACE TRIGGER notification_recipient_shape_insert BEFORE INSERT ON notification_messages FOR EACH ROW BEGIN IF NOT (NEW.recipient_user_id IS NOT NULL OR (BINARY NEW.audience_role=BINARY 'customer' AND BINARY NEW.channel=BINARY 'email' AND NEW.guest_email IS NOT NULL AND NEW.guest_order_id IS NOT NULL AND NEW.business_event_key IS NOT NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='notification_recipient_shape'; END IF; END$$
DELIMITER ;
DELIMITER $$
CREATE OR REPLACE TRIGGER notification_recipient_shape_update BEFORE UPDATE ON notification_messages FOR EACH ROW BEGIN IF NOT (NEW.recipient_user_id IS NOT NULL OR (BINARY NEW.audience_role=BINARY 'customer' AND BINARY NEW.channel=BINARY 'email' AND NEW.guest_email IS NOT NULL AND NEW.guest_order_id IS NOT NULL AND NEW.business_event_key IS NOT NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='notification_recipient_shape'; END IF; END$$
DELIMITER ;
-- Preserve the original human-event proof; add only truthful NULL-actor system ownership evidence.
-- No money, publication, triage, promise or case-identity mutation is authorized by this branch.
DROP TRIGGER product_priority_case_revision;

DELIMITER $$
CREATE TRIGGER product_priority_case_revision BEFORE UPDATE ON product_priority_cases FOR EACH ROW BEGIN
IF BINARY OLD.state=BINARY 'resolved' OR BINARY NEW.id<>BINARY OLD.id OR BINARY NEW.product_id<>BINARY OLD.product_id OR BINARY NEW.kind<>BINARY OLD.kind OR NOT(BINARY NEW.public_version_id<=>BINARY OLD.public_version_id) OR BINARY NEW.reported_by<>BINARY OLD.reported_by OR BINARY NEW.created_at<>BINARY OLD.created_at OR NEW.revision<>(OLD.revision+1) OR NOT (EXISTS(SELECT 1 FROM product_priority_events e JOIN review_tasks t ON BINARY t.source_type=BINARY 'product_priority' AND BINARY t.source_id=BINARY NEW.id AND BINARY t.source_revision=BINARY NEW.id WHERE BINARY e.id=BINARY NEW.last_event_id AND BINARY e.case_id=BINARY NEW.id AND BINARY e.product_id=BINARY NEW.product_id AND BINARY e.revision=BINARY NEW.revision AND BINARY JSON_VALUE(e.detail_json,'$.state')=BINARY NEW.state AND (BINARY JSON_VALUE(e.detail_json,'$.backupId')<=>BINARY NEW.backup_id) AND BINARY JSON_VALUE(e.detail_json,'$.backupUnavailableReason')=BINARY NEW.backup_unavailable_reason AND (BINARY JSON_VALUE(e.detail_json,'$.nextUpdateAt')<=>BINARY NEW.next_update_at) AND (BINARY JSON_VALUE(e.detail_json,'$.ownerId')<=>BINARY t.owner_id)) OR EXISTS(SELECT 1 FROM audit_logs a JOIN review_tasks t ON BINARY t.id=BINARY a.subject_id AND BINARY t.source_type=BINARY 'product_priority' AND BINARY t.source_id=BINARY NEW.id AND BINARY t.source_revision=BINARY NEW.id WHERE a.actor_id IS NULL AND BINARY a.action=BINARY 'review_task.coverage_rerouted' AND BINARY a.subject_type=BINARY 'review_task' AND JSON_CONTAINS(a.command_result_json,'true','$.system')=1 AND JSON_TYPE(JSON_EXTRACT(a.command_result_json,'$.system'))='BOOLEAN' AND BINARY JSON_VALUE(a.command_result_json,'$.sourceType')=BINARY 'product_priority' AND BINARY JSON_VALUE(a.command_result_json,'$.sourceId')=BINARY NEW.id AND BINARY JSON_VALUE(a.command_result_json,'$.sourceRevision')=BINARY NEW.id AND BINARY JSON_VALUE(a.command_result_json,'$.taskId')=BINARY t.id AND BINARY JSON_VALUE(a.command_result_json,'$.revision')=BINARY t.revision AND (BINARY JSON_VALUE(a.command_result_json,'$.ownerId')<=>BINARY t.owner_id) AND BINARY JSON_VALUE(a.command_result_json,'$.nativePriority.id')=BINARY NEW.id AND BINARY JSON_VALUE(a.command_result_json,'$.nativePriority.productId')=BINARY NEW.product_id AND BINARY JSON_VALUE(a.command_result_json,'$.nativePriority.previousRevision')=BINARY OLD.revision AND BINARY JSON_VALUE(a.command_result_json,'$.nativePriority.revision')=BINARY NEW.revision AND BINARY JSON_VALUE(a.command_result_json,'$.nativePriority.lastHumanEventId')=BINARY OLD.last_event_id AND BINARY NEW.last_event_id=BINARY OLD.last_event_id AND BINARY NEW.state=BINARY OLD.state AND (BINARY NEW.triaged_at<=>BINARY OLD.triaged_at) AND (BINARY NEW.next_update_at<=>BINARY OLD.next_update_at) AND BINARY JSON_VALUE(a.command_result_json,'$.nativePriority.state')=BINARY NEW.state AND (BINARY JSON_VALUE(a.command_result_json,'$.nativePriority.triagedAt')<=>BINARY NEW.triaged_at) AND (BINARY JSON_VALUE(a.command_result_json,'$.nativePriority.nextUpdateAt')<=>BINARY NEW.next_update_at) AND (BINARY JSON_VALUE(a.command_result_json,'$.nativePriority.backupId')<=>BINARY NEW.backup_id) AND BINARY JSON_VALUE(a.command_result_json,'$.nativePriority.backupUnavailableReason')=BINARY NEW.backup_unavailable_reason)) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_priority_case_revision';
END IF;
END$$
CREATE TRIGGER review_task_system_ownership_receipt_immutable BEFORE UPDATE ON audit_logs FOR EACH ROW BEGIN
IF BINARY OLD.action=BINARY 'review_task.coverage_rerouted' AND (NOT(BINARY NEW.id<=>BINARY OLD.id) OR NOT(BINARY NEW.actor_id<=>BINARY OLD.actor_id) OR NOT(BINARY NEW.action<=>BINARY OLD.action) OR NOT(BINARY NEW.subject_type<=>BINARY OLD.subject_type) OR NOT(BINARY NEW.subject_id<=>BINARY OLD.subject_id) OR NOT(BINARY NEW.request_id<=>BINARY OLD.request_id) OR NOT(BINARY NEW.created_at<=>BINARY OLD.created_at) OR NOT(BINARY NEW.command_key<=>BINARY OLD.command_key) OR NOT(BINARY NEW.command_digest<=>BINARY OLD.command_digest) OR NOT(BINARY NEW.command_result_json<=>BINARY OLD.command_result_json)) THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='review_task_system_ownership_receipt_immutable';
END IF;
END$$
CREATE TRIGGER review_task_system_ownership_receipt_retained BEFORE DELETE ON audit_logs FOR EACH ROW BEGIN
IF BINARY OLD.action=BINARY 'review_task.coverage_rerouted' THEN
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='review_task_system_ownership_receipt_retained';
END IF;
END$$
DELIMITER ;
SET FOREIGN_KEY_CHECKS = 1;
