CREATE TABLE `complaint_events` (
	`id` text PRIMARY KEY NOT NULL,
	`complaint_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text,
	`actor_type` text NOT NULL,
	`public_message_en` text NOT NULL,
	`public_message_ne` text NOT NULL,
	`internal_note` text,
	`request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`complaint_id`) REFERENCES `complaints`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_complaint_events_case_created` ON `complaint_events` (`complaint_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_complaint_events_request_id_unique` ON `complaint_events` (`request_id`);--> statement-breakpoint
CREATE TABLE `refund_liability_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`refund_id` text NOT NULL,
	`seller_id` text,
	`party` text NOT NULL,
	`amount_paisa` integer NOT NULL,
	`description` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`refund_id`) REFERENCES `refunds`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "refund_liability_amount_positive" CHECK("refund_liability_entries"."amount_paisa" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_refund_liability_refund` ON `refund_liability_entries` (`refund_id`);--> statement-breakpoint
CREATE INDEX `idx_refund_liability_seller` ON `refund_liability_entries` (`seller_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `return_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`return_request_id` text NOT NULL,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by_type` text NOT NULL,
	`uploaded_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`return_request_id`) REFERENCES `return_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "return_evidence_size_positive" CHECK("return_evidence"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_return_evidence_object_key_unique` ON `return_evidence` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_return_evidence_request_created` ON `return_evidence` (`return_request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `return_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`return_request_id` text NOT NULL,
	`outcome` text NOT NULL,
	`refund_id` text,
	`replacement_reference` text,
	`return_shipment_reference` text,
	`restock_quantity` integer DEFAULT 0 NOT NULL,
	`note_en` text NOT NULL,
	`note_ne` text NOT NULL,
	`resolved_by` text NOT NULL,
	`request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`return_request_id`) REFERENCES `return_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`refund_id`) REFERENCES `refunds`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "return_outcomes_restock_non_negative" CHECK("return_outcomes"."restock_quantity" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_return_outcomes_request_unique` ON `return_outcomes` (`return_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_return_outcomes_request_id_unique` ON `return_outcomes` (`request_id`);--> statement-breakpoint
CREATE TABLE `return_request_events` (
	`id` text PRIMARY KEY NOT NULL,
	`return_request_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text,
	`actor_type` text NOT NULL,
	`public_message_en` text NOT NULL,
	`public_message_ne` text NOT NULL,
	`internal_note` text,
	`request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`return_request_id`) REFERENCES `return_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_return_events_request_created` ON `return_request_events` (`return_request_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_return_events_request_id_unique` ON `return_request_events` (`request_id`);--> statement-breakpoint
ALTER TABLE `complaints` ADD `order_item_id` text REFERENCES order_items(id);--> statement-breakpoint
ALTER TABLE `complaints` ADD `seller_id` text REFERENCES seller_profiles(id);--> statement-breakpoint
ALTER TABLE `complaints` ADD `locale` text DEFAULT 'en-NP' NOT NULL;--> statement-breakpoint
ALTER TABLE `complaints` ADD `priority` text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `complaints` ADD `resolution_ne` text;--> statement-breakpoint
ALTER TABLE `complaints` ADD `seller_response` text;--> statement-breakpoint
ALTER TABLE `complaints` ADD `seller_responded_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `complaints` ADD `seller_responded_at` integer;--> statement-breakpoint
ALTER TABLE `complaints` ADD `escalation_reason` text;--> statement-breakpoint
ALTER TABLE `complaints` ADD `escalated_to` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `complaints` ADD `assigned_at` integer;--> statement-breakpoint
ALTER TABLE `complaints` ADD `created_request_id` text;--> statement-breakpoint
ALTER TABLE `complaints` ADD `operation_request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_complaints_created_request_unique` ON `complaints` (`created_request_id`);--> statement-breakpoint
CREATE INDEX `idx_complaints_seller_queue` ON `complaints` (`seller_id`,`status`);--> statement-breakpoint
ALTER TABLE `order_items` ADD `return_eligible_snapshot` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `return_policy_snapshot_json` text DEFAULT '{"generalRequestWindowDays":7,"deliveryDamageEvidenceWindowHours":48,"changeOfMindEnabled":true,"highValueRefundThresholdPaisa":1000000,"refundInitiationBusinessDays":2,"codRefundEstimateBusinessDays":[3,7]}' NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`return_request_id` text,
	`payment_id` text,
	`status` text NOT NULL,
	`amount_paisa` integer NOT NULL,
	`item_amount_paisa` integer,
	`delivery_amount_paisa` integer DEFAULT 0 NOT NULL,
	`reason` text NOT NULL,
	`requested_by` text,
	`approved_by` text,
	`high_value_approved_by` text,
	`processed_by` text,
	`liability` text DEFAULT 'platform' NOT NULL,
	`is_high_value` integer DEFAULT false NOT NULL,
	`operation_request_id` text,
	`provider_reference` text,
	`requested_at` integer NOT NULL,
	`approved_at` integer,
	`processed_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`return_request_id`) REFERENCES `return_requests`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`high_value_approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`processed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "refunds_amount_positive" CHECK("__new_refunds"."amount_paisa" > 0),
	CONSTRAINT "refunds_components_valid" CHECK("__new_refunds"."item_amount_paisa" IS NULL OR ("__new_refunds"."item_amount_paisa" >= 0 AND "__new_refunds"."delivery_amount_paisa" >= 0 AND "__new_refunds"."item_amount_paisa" + "__new_refunds"."delivery_amount_paisa" = "__new_refunds"."amount_paisa")),
	CONSTRAINT "refunds_high_value_maker_checker" CHECK("__new_refunds"."high_value_approved_by" IS NULL OR "__new_refunds"."approved_by" IS NULL OR "__new_refunds"."high_value_approved_by" != "__new_refunds"."approved_by")
);
--> statement-breakpoint
INSERT INTO `__new_refunds`("id", "order_id", "return_request_id", "payment_id", "status", "amount_paisa", "reason", "requested_by", "approved_by", "provider_reference", "requested_at", "processed_at") SELECT "id", "order_id", "return_request_id", "payment_id", "status", "amount_paisa", "reason", "requested_by", "approved_by", "provider_reference", "requested_at", "processed_at" FROM `refunds`;--> statement-breakpoint
DROP TABLE `refunds`;--> statement-breakpoint
ALTER TABLE `__new_refunds` RENAME TO `refunds`;--> statement-breakpoint
CREATE INDEX `idx_refunds_order` ON `refunds` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_refunds_status_requested` ON `refunds` (`status`,`requested_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_refunds_return_request_unique` ON `refunds` (`return_request_id`);--> statement-breakpoint
CREATE TABLE `__new_return_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`reference_number` text,
	`order_item_id` text NOT NULL,
	`requested_by` text,
	`reason` text NOT NULL,
	`detail` text NOT NULL,
	`locale` text DEFAULT 'en-NP' NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`requested_resolution` text DEFAULT 'refund' NOT NULL,
	`status` text NOT NULL,
	`responsibility` text DEFAULT 'undetermined' NOT NULL,
	`eligibility_decision` text DEFAULT 'manual_review' NOT NULL,
	`eligibility_reason_en` text DEFAULT 'Pending review' NOT NULL,
	`eligibility_reason_ne` text DEFAULT 'समीक्षा बाँकी' NOT NULL,
	`policy_snapshot_json` text DEFAULT '{}' NOT NULL,
	`seller_recommendation` text,
	`seller_response` text,
	`seller_response_locale` text,
	`seller_responded_by` text,
	`seller_responded_at` integer,
	`investigation_summary` text,
	`resolution_outcome` text,
	`return_shipment_reference` text,
	`created_request_id` text,
	`operation_request_id` text,
	`requested_at` integer NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`resolved_at` integer,
	`reviewed_by` text,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`seller_responded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "return_requests_quantity_positive" CHECK("__new_return_requests"."quantity" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_return_requests`("id", "order_item_id", "requested_by", "reason", "detail", "status", "responsibility", "requested_at", "resolved_at", "reviewed_by") SELECT "id", "order_item_id", "requested_by", "reason", "detail", "status", "responsibility", "requested_at", "resolved_at", "reviewed_by" FROM `return_requests`;--> statement-breakpoint
DROP TABLE `return_requests`;--> statement-breakpoint
ALTER TABLE `__new_return_requests` RENAME TO `return_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_return_requests_reference_unique` ON `return_requests` (`reference_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_return_requests_item_unique` ON `return_requests` (`order_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_return_requests_created_request_unique` ON `return_requests` (`created_request_id`);--> statement-breakpoint
CREATE INDEX `idx_return_requests_status` ON `return_requests` (`status`,`requested_at`);--> statement-breakpoint
ALTER TABLE `seller_ledger_entries` ADD `refund_id` text REFERENCES refunds(id);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_seller_ledger_refund_unique` ON `seller_ledger_entries` (`refund_id`);
