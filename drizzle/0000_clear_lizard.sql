CREATE TABLE `addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`recipient_name` text NOT NULL,
	`phone` text NOT NULL,
	`province` text NOT NULL,
	`district` text NOT NULL,
	`municipality` text NOT NULL,
	`ward` text,
	`locality` text NOT NULL,
	`landmark` text,
	`postal_code` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_addresses_user_default` ON `addresses` (`user_id`,`is_default`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text,
	`reason` text,
	`previous_json` text,
	`next_json` text,
	`request_id` text,
	`ip_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_subject` ON `audit_logs` (`subject_type`,`subject_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_actor` ON `audit_logs` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cart_items` (
	`id` text PRIMARY KEY NOT NULL,
	`cart_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cart_items_quantity_positive" CHECK("cart_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cart_items_cart_product_unique` ON `cart_items` (`cart_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `carts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`anonymous_token_hash` text,
	`currency` text DEFAULT 'NPR' NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_carts_user_unique` ON `carts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_carts_anonymous_token_unique` ON `carts` (`anonymous_token_hash`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`slug` text NOT NULL,
	`name_en` text NOT NULL,
	`name_ne` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_categories_parent_sort` ON `categories` (`parent_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `complaints` (
	`id` text PRIMARY KEY NOT NULL,
	`reference_number` text NOT NULL,
	`customer_id` text,
	`order_id` text,
	`category` text NOT NULL,
	`subject` text NOT NULL,
	`detail` text NOT NULL,
	`status` text NOT NULL,
	`assigned_to` text,
	`resolution` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_complaints_reference_unique` ON `complaints` (`reference_number`);--> statement-breakpoint
CREATE INDEX `idx_complaints_queue` ON `complaints` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_complaints_order` ON `complaints` (`order_id`);--> statement-breakpoint
CREATE TABLE `moderation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`reason` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_moderation_events_subject` ON `moderation_events` (`subject_type`,`subject_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text,
	`seller_id` text NOT NULL,
	`seller_name_snapshot` text NOT NULL,
	`product_name_snapshot` text NOT NULL,
	`sku_snapshot` text NOT NULL,
	`unit_price_paisa` integer NOT NULL,
	`quantity` integer NOT NULL,
	`seller_discount_paisa` integer DEFAULT 0 NOT NULL,
	`commission_bps` integer NOT NULL,
	`commission_paisa` integer NOT NULL,
	`tax_paisa` integer DEFAULT 0 NOT NULL,
	`line_total_paisa` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "order_items_quantity_positive" CHECK("order_items"."quantity" > 0),
	CONSTRAINT "order_items_commission_valid" CHECK("order_items"."commission_bps" >= 0 AND "order_items"."commission_bps" <= 10000)
);
--> statement-breakpoint
CREATE INDEX `idx_order_items_order` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_order_items_seller` ON `order_items` (`seller_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`customer_id` text,
	`customer_email` text NOT NULL,
	`customer_phone` text NOT NULL,
	`status` text NOT NULL,
	`locale` text NOT NULL,
	`currency` text DEFAULT 'NPR' NOT NULL,
	`policy_version` text NOT NULL,
	`shipping_address_json` text NOT NULL,
	`item_subtotal_paisa` integer NOT NULL,
	`seller_discount_paisa` integer DEFAULT 0 NOT NULL,
	`delivery_charge_paisa` integer NOT NULL,
	`buyer_platform_fee_paisa` integer DEFAULT 0 NOT NULL,
	`tax_total_paisa` integer DEFAULT 0 NOT NULL,
	`grand_total_paisa` integer NOT NULL,
	`payment_mode` text NOT NULL,
	`payment_status` text NOT NULL,
	`placed_at` integer,
	`delivered_at` integer,
	`cancelled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "orders_money_non_negative" CHECK("orders"."item_subtotal_paisa" >= 0 AND "orders"."seller_discount_paisa" >= 0 AND "orders"."delivery_charge_paisa" >= 0 AND "orders"."buyer_platform_fee_paisa" >= 0 AND "orders"."tax_total_paisa" >= 0 AND "orders"."grand_total_paisa" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `idx_orders_customer_created` ON `orders` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_orders_status_created` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_reference` text,
	`method` text NOT NULL,
	`status` text NOT NULL,
	`amount_paisa` integer NOT NULL,
	`currency` text DEFAULT 'NPR' NOT NULL,
	`idempotency_key` text NOT NULL,
	`failure_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payments_amount_non_negative" CHECK("payments"."amount_paisa" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payments_idempotency_unique` ON `payments` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payments_provider_reference_unique` ON `payments` (`provider`,`provider_reference`);--> statement-breakpoint
CREATE INDEX `idx_payments_order_created` ON `payments` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `payout_entries` (
	`payout_id` text NOT NULL,
	`ledger_entry_id` text NOT NULL,
	PRIMARY KEY(`payout_id`, `ledger_entry_id`),
	FOREIGN KEY (`payout_id`) REFERENCES `payouts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `seller_ledger_entries`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payout_entries_ledger_unique` ON `payout_entries` (`ledger_entry_id`);--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`payout_number` text NOT NULL,
	`status` text NOT NULL,
	`amount_paisa` integer NOT NULL,
	`destination_reference` text NOT NULL,
	`prepared_by` text NOT NULL,
	`approved_by` text,
	`provider_reference` text,
	`scheduled_for` integer NOT NULL,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payouts_amount_positive" CHECK("payouts"."amount_paisa" > 0),
	CONSTRAINT "payouts_maker_checker" CHECK("payouts"."approved_by" IS NULL OR "payouts"."approved_by" != "payouts"."prepared_by")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payouts_number_unique` ON `payouts` (`payout_number`);--> statement-breakpoint
CREATE INDEX `idx_payouts_seller_status` ON `payouts` (`seller_id`,`status`);--> statement-breakpoint
CREATE TABLE `policy_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_key` text NOT NULL,
	`version` text NOT NULL,
	`document_json` text NOT NULL,
	`effective_from` integer NOT NULL,
	`effective_until` integer,
	`created_by` text NOT NULL,
	`approved_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_policy_versions_key_version_unique` ON `policy_versions` (`policy_key`,`version`);--> statement-breakpoint
CREATE INDEX `idx_policy_versions_effective` ON `policy_versions` (`policy_key`,`effective_from`);--> statement-breakpoint
CREATE TABLE `product_media` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`object_key` text NOT NULL,
	`alt_en` text NOT NULL,
	`alt_ne` text,
	`width` integer,
	`height` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_product_media_object_key_unique` ON `product_media` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_product_media_product_sort` ON `product_media` (`product_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`category_id` text NOT NULL,
	`slug` text NOT NULL,
	`sku` text NOT NULL,
	`name_en` text NOT NULL,
	`name_ne` text,
	`description_en` text NOT NULL,
	`description_ne` text,
	`price_paisa` integer NOT NULL,
	`compare_at_price_paisa` integer,
	`inventory_quantity` integer DEFAULT 0 NOT NULL,
	`producer` text NOT NULL,
	`country_of_origin` text DEFAULT 'NP' NOT NULL,
	`materials` text NOT NULL,
	`dimensions` text,
	`care_instructions` text,
	`safety_information` text,
	`return_eligible` integer DEFAULT true NOT NULL,
	`warranty` text,
	`manufactured_at` integer,
	`expires_at` integer,
	`licence_reference` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`review_note` text,
	`reviewed_by` text,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "products_price_non_negative" CHECK("products"."price_paisa" >= 0),
	CONSTRAINT "products_compare_price_non_negative" CHECK("products"."compare_at_price_paisa" IS NULL OR "products"."compare_at_price_paisa" >= 0),
	CONSTRAINT "products_inventory_non_negative" CHECK("products"."inventory_quantity" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_seller_sku_unique` ON `products` (`seller_id`,`sku`);--> statement-breakpoint
CREATE INDEX `idx_products_public_catalog` ON `products` (`status`,`category_id`,`published_at`);--> statement-breakpoint
CREATE INDEX `idx_products_seller_status` ON `products` (`seller_id`,`status`);--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`return_request_id` text,
	`payment_id` text,
	`status` text NOT NULL,
	`amount_paisa` integer NOT NULL,
	`reason` text NOT NULL,
	`requested_by` text,
	`approved_by` text,
	`provider_reference` text,
	`requested_at` integer NOT NULL,
	`processed_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`return_request_id`) REFERENCES `return_requests`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "refunds_amount_positive" CHECK("refunds"."amount_paisa" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_refunds_order` ON `refunds` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_refunds_status_requested` ON `refunds` (`status`,`requested_at`);--> statement-breakpoint
CREATE TABLE `return_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`order_item_id` text NOT NULL,
	`requested_by` text,
	`reason` text NOT NULL,
	`detail` text NOT NULL,
	`status` text NOT NULL,
	`responsibility` text DEFAULT 'undetermined' NOT NULL,
	`requested_at` integer NOT NULL,
	`resolved_at` integer,
	`reviewed_by` text,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_return_requests_status` ON `return_requests` (`status`,`requested_at`);--> statement-breakpoint
CREATE TABLE `seller_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`kind` text NOT NULL,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`uploaded_at` integer NOT NULL,
	`reviewed_at` integer,
	`reviewed_by` text,
	FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_seller_documents_object_key_unique` ON `seller_documents` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_seller_documents_seller_kind` ON `seller_documents` (`seller_id`,`kind`);--> statement-breakpoint
CREATE TABLE `seller_ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`order_item_id` text,
	`type` text NOT NULL,
	`amount_paisa` integer NOT NULL,
	`available_at` integer,
	`description` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_seller_ledger_balance` ON `seller_ledger_entries` (`seller_id`,`available_at`);--> statement-breakpoint
CREATE INDEX `idx_seller_ledger_order_item` ON `seller_ledger_entries` (`order_item_id`);--> statement-breakpoint
CREATE TABLE `seller_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`legal_name` text NOT NULL,
	`trading_name` text NOT NULL,
	`registration_authority` text NOT NULL,
	`registration_number` text NOT NULL,
	`tax_mode` text NOT NULL,
	`tax_registration_number` text NOT NULL,
	`representative_name` text NOT NULL,
	`support_phone` text NOT NULL,
	`support_email` text NOT NULL,
	`province` text NOT NULL,
	`district` text NOT NULL,
	`municipality` text NOT NULL,
	`ward` text,
	`locality` text NOT NULL,
	`payout_account_reference` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`seller_agreement_version` text,
	`seller_agreement_accepted_at` integer,
	`review_note` text,
	`reviewed_by` text,
	`approved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_seller_profiles_user_unique` ON `seller_profiles` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_seller_profiles_registration_unique` ON `seller_profiles` (`registration_authority`,`registration_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_seller_profiles_tax_number_unique` ON `seller_profiles` (`tax_registration_number`);--> statement-breakpoint
CREATE INDEX `idx_seller_profiles_review_queue` ON `seller_profiles` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `shipment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`shipment_id` text NOT NULL,
	`provider_event_id` text,
	`status` text NOT NULL,
	`location` text,
	`note` text,
	`occurred_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shipment_events_provider_event_unique` ON `shipment_events` (`shipment_id`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `idx_shipment_events_timeline` ON `shipment_events` (`shipment_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_shipment_id` text,
	`tracking_code` text,
	`status` text NOT NULL,
	`payment_mode` text NOT NULL,
	`cod_amount_paisa` integer,
	`delivery_charge_paisa` integer NOT NULL,
	`estimated_min_days` integer NOT NULL,
	`estimated_max_days` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shipments_provider_id_unique` ON `shipments` (`provider`,`provider_shipment_id`);--> statement-breakpoint
CREATE INDEX `idx_shipments_order` ON `shipments` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_shipments_tracking` ON `shipments` (`tracking_code`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`assigned_by` text,
	`assigned_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `role`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_user_roles_role` ON `user_roles` (`role`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_subject` text,
	`email` text NOT NULL,
	`phone` text,
	`display_name` text NOT NULL,
	`locale` text DEFAULT 'en-NP' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_phone_unique` ON `users` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_auth_subject_unique` ON `users` (`auth_subject`);