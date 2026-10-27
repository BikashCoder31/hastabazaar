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
SET FOREIGN_KEY_CHECKS = 1;
