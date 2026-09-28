-- Permit staff authors to approve only with current active Super Admin authority.
--> statement-breakpoint
-- Preserve every existing row, foreign key, index and domain trigger.
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
PRAGMA legacy_alter_table=ON;
--> statement-breakpoint
-- BEGIN payouts
--> statement-breakpoint
CREATE TABLE "__single_sa_payouts" (
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
	`updated_at` integer NOT NULL, `processed_by` text REFERENCES users(id), `note` text, `period_start` integer, `period_end` integer, `approved_at` integer, `processed_at` integer, `failed_at` integer, `failure_reason` text, `created_request_id` text, `operation_request_id` text,
	FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payouts_amount_positive" CHECK("amount_paisa" > 0)
);
--> statement-breakpoint
INSERT INTO "__single_sa_payouts"("id","seller_id","payout_number","status","amount_paisa","destination_reference","prepared_by","approved_by","provider_reference","scheduled_for","paid_at","created_at","updated_at","processed_by","note","period_start","period_end","approved_at","processed_at","failed_at","failure_reason","created_request_id","operation_request_id") SELECT "id","seller_id","payout_number","status","amount_paisa","destination_reference","prepared_by","approved_by","provider_reference","scheduled_for","paid_at","created_at","updated_at","processed_by","note","period_start","period_end","approved_at","processed_at","failed_at","failure_reason","created_request_id","operation_request_id" FROM "payouts";
--> statement-breakpoint
DROP TABLE "payouts";
--> statement-breakpoint
ALTER TABLE "__single_sa_payouts" RENAME TO "payouts";
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payouts_created_request_unique` ON `payouts` (`created_request_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payouts_number_unique` ON `payouts` (`payout_number`);
--> statement-breakpoint
CREATE INDEX `idx_payouts_seller_status` ON `payouts` (`seller_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_payouts_status_scheduled` ON `payouts` (`status`,`scheduled_for`);
--> statement-breakpoint
CREATE TRIGGER payouts_single_sa_insert BEFORE INSERT ON payouts FOR EACH ROW WHEN (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) BEGIN SELECT RAISE(ABORT,'payouts_approval_requires_active_super_admin'); END;
--> statement-breakpoint
CREATE TRIGGER payouts_single_sa_update BEFORE UPDATE ON payouts FOR EACH ROW WHEN (NEW.approved_by IS NOT OLD.approved_by OR NEW.prepared_by IS NOT OLD.prepared_by OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) BEGIN SELECT RAISE(ABORT,'payouts_approval_requires_active_super_admin'); END;
--> statement-breakpoint
-- END payouts
--> statement-breakpoint
-- BEGIN refunds
--> statement-breakpoint
CREATE TABLE "__single_sa_refunds" (
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
	`processed_at` integer, wallet_credit_paisa BIGINT NOT NULL DEFAULT 0 CHECK(wallet_credit_paisa >= 0), referral_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(referral_discount_paisa >= 0), credit_base_paisa BIGINT NOT NULL DEFAULT 0, commission_base_refunded_paisa INTEGER NOT NULL DEFAULT 0, commission_reversal_paisa INTEGER NOT NULL DEFAULT 0, promo_discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(typeof(promo_discount_paisa)='integer' AND promo_discount_paisa BETWEEN 0 AND 9007199254740991),
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`return_request_id`) REFERENCES `return_requests`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`high_value_approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`processed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "refunds_amount_positive" CHECK("amount_paisa" > 0),
	CONSTRAINT "refunds_components_valid" CHECK("item_amount_paisa" IS NULL OR ("item_amount_paisa" >= 0 AND "delivery_amount_paisa" >= 0 AND "item_amount_paisa" + "delivery_amount_paisa" = "amount_paisa"))
);
--> statement-breakpoint
INSERT INTO "__single_sa_refunds"("id","order_id","return_request_id","payment_id","status","amount_paisa","item_amount_paisa","delivery_amount_paisa","reason","requested_by","approved_by","high_value_approved_by","processed_by","liability","is_high_value","operation_request_id","provider_reference","requested_at","approved_at","processed_at","wallet_credit_paisa","referral_discount_paisa","credit_base_paisa","commission_base_refunded_paisa","commission_reversal_paisa","promo_discount_paisa") SELECT "id","order_id","return_request_id","payment_id","status","amount_paisa","item_amount_paisa","delivery_amount_paisa","reason","requested_by","approved_by","high_value_approved_by","processed_by","liability","is_high_value","operation_request_id","provider_reference","requested_at","approved_at","processed_at","wallet_credit_paisa","referral_discount_paisa","credit_base_paisa","commission_base_refunded_paisa","commission_reversal_paisa","promo_discount_paisa" FROM "refunds";
--> statement-breakpoint
DROP TABLE "refunds";
--> statement-breakpoint
ALTER TABLE "__single_sa_refunds" RENAME TO "refunds";
--> statement-breakpoint
CREATE INDEX `idx_refunds_order` ON `refunds` (`order_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_refunds_return_request_unique` ON `refunds` (`return_request_id`);
--> statement-breakpoint
CREATE INDEX `idx_refunds_status_requested` ON `refunds` (`status`,`requested_at`);
--> statement-breakpoint
CREATE TRIGGER refunds_promo_offset_immutable BEFORE UPDATE ON refunds FOR EACH ROW WHEN NEW.promo_discount_paisa<>OLD.promo_discount_paisa BEGIN SELECT RAISE(ABORT,'promo_refund_snapshot_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER wallet_refund_guard BEFORE INSERT ON refunds FOR EACH ROW WHEN (NEW.promo_discount_paisa>0 OR EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.order_id AND o.wallet_credit_paisa+o.referral_discount_paisa+o.promo_discount_paisa>0)) AND
 (NEW.item_amount_paisa IS NULL OR NEW.credit_base_paisa<>COALESCE((SELECT SUM(item_amount_paisa) FROM refunds WHERE order_id=NEW.order_id AND status<>'rejected'),0)
 OR NEW.wallet_credit_paisa>NEW.item_amount_paisa-NEW.referral_discount_paisa-NEW.promo_discount_paisa
 OR NEW.promo_discount_paisa>COALESCE((SELECT promo_discount_paisa FROM orders WHERE id=NEW.order_id),0)-COALESCE((SELECT SUM(promo_discount_paisa) FROM refunds WHERE order_id=NEW.order_id AND status<>'rejected'),0)
 OR (NEW.promo_discount_paisa>0 AND NEW.referral_discount_paisa>0)
 OR (NEW.referral_discount_paisa>0 AND EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND promo_discount_paisa>0))) BEGIN SELECT RAISE(ABORT,'wallet_refund_changed_retry'); END;
--> statement-breakpoint
CREATE TRIGGER wallet_refund_lock BEFORE INSERT ON refunds FOR EACH ROW  BEGIN UPDATE orders SET updated_at=updated_at WHERE id=NEW.order_id; END;
--> statement-breakpoint
CREATE TRIGGER wallet_refund_restore AFTER UPDATE ON refunds FOR EACH ROW WHEN NEW.status = 'paid' AND OLD.status <> 'paid' AND NEW.wallet_credit_paisa > 0 BEGIN INSERT INTO wallet_entries (id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
 SELECT 'refund:' || NEW.id, customer_id, id, NEW.wallet_credit_paisa, -NEW.wallet_credit_paisa, 'refund', NEW.processed_at FROM orders WHERE id = NEW.order_id; END;
--> statement-breakpoint
CREATE TRIGGER refunds_single_sa_insert BEFORE INSERT ON refunds FOR EACH ROW WHEN (NEW.high_value_approved_by=NEW.approved_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.high_value_approved_by AND u.status='active' AND r.role='super_admin')) BEGIN SELECT RAISE(ABORT,'refunds_approval_requires_active_super_admin'); END;
--> statement-breakpoint
CREATE TRIGGER refunds_single_sa_update BEFORE UPDATE ON refunds FOR EACH ROW WHEN (NEW.high_value_approved_by IS NOT OLD.high_value_approved_by OR NEW.approved_by IS NOT OLD.approved_by OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.high_value_approved_by=NEW.approved_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.high_value_approved_by AND u.status='active' AND r.role='super_admin')) BEGIN SELECT RAISE(ABORT,'refunds_approval_requires_active_super_admin'); END;
--> statement-breakpoint
-- END refunds
--> statement-breakpoint
-- BEGIN promotions
--> statement-breakpoint
CREATE TABLE "__single_sa_promotions" (
	`id` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`name_ne` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`placement` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`approved_by` text,
	`note` text NOT NULL,
	`created_request_id` text NOT NULL,
	`operation_request_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "promotions_window_valid" CHECK("ends_at" > "starts_at")
);
--> statement-breakpoint
INSERT INTO "__single_sa_promotions"("id","name_en","name_ne","status","placement","starts_at","ends_at","created_by","approved_by","note","created_request_id","operation_request_id","created_at","updated_at") SELECT "id","name_en","name_ne","status","placement","starts_at","ends_at","created_by","approved_by","note","created_request_id","operation_request_id","created_at","updated_at" FROM "promotions";
--> statement-breakpoint
DROP TABLE "promotions";
--> statement-breakpoint
ALTER TABLE "__single_sa_promotions" RENAME TO "promotions";
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_promotions_created_request_unique` ON `promotions` (`created_request_id`);
--> statement-breakpoint
CREATE INDEX `idx_promotions_status_window` ON `promotions` (`status`,`starts_at`,`ends_at`);
--> statement-breakpoint
CREATE TRIGGER promotions_single_sa_insert BEFORE INSERT ON promotions FOR EACH ROW WHEN (NEW.approved_by=NEW.created_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) BEGIN SELECT RAISE(ABORT,'promotions_approval_requires_active_super_admin'); END;
--> statement-breakpoint
CREATE TRIGGER promotions_single_sa_update BEFORE UPDATE ON promotions FOR EACH ROW WHEN (NEW.approved_by IS NOT OLD.approved_by OR NEW.created_by IS NOT OLD.created_by OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.approved_by=NEW.created_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) BEGIN SELECT RAISE(ABORT,'promotions_approval_requires_active_super_admin'); END;
--> statement-breakpoint
-- END promotions
--> statement-breakpoint
-- BEGIN managed_payouts
--> statement-breakpoint
CREATE TABLE "__single_sa_managed_payouts" (
  id TEXT PRIMARY KEY NOT NULL,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  payout_number TEXT NOT NULL UNIQUE,
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
  status TEXT NOT NULL CHECK(status IN ('prepared','approved','processing','paid','failed','rejected','reversed')),
  destination_reference TEXT NOT NULL,
  simulation_label TEXT NOT NULL CHECK(length(trim(simulation_label))>0),
  prepared_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  scheduled_for INTEGER NOT NULL,
  provider_reference TEXT,
  request_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  paid_at INTEGER
);
--> statement-breakpoint
INSERT INTO "__single_sa_managed_payouts"("id","seller_id","payout_number","amount_paisa","status","destination_reference","simulation_label","prepared_by","approved_by","scheduled_for","provider_reference","request_id","created_at","updated_at","paid_at") SELECT "id","seller_id","payout_number","amount_paisa","status","destination_reference","simulation_label","prepared_by","approved_by","scheduled_for","provider_reference","request_id","created_at","updated_at","paid_at" FROM "managed_payouts";
--> statement-breakpoint
DROP TABLE "managed_payouts";
--> statement-breakpoint
ALTER TABLE "__single_sa_managed_payouts" RENAME TO "managed_payouts";
--> statement-breakpoint
CREATE INDEX idx_managed_payouts_status ON managed_payouts(status,scheduled_for);
--> statement-breakpoint
CREATE TRIGGER managed_payouts_single_sa_insert BEFORE INSERT ON managed_payouts FOR EACH ROW WHEN (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) BEGIN SELECT RAISE(ABORT,'managed_payouts_approval_requires_active_super_admin'); END;
--> statement-breakpoint
CREATE TRIGGER managed_payouts_single_sa_update BEFORE UPDATE ON managed_payouts FOR EACH ROW WHEN (NEW.approved_by IS NOT OLD.approved_by OR NEW.prepared_by IS NOT OLD.prepared_by OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) BEGIN SELECT RAISE(ABORT,'managed_payouts_approval_requires_active_super_admin'); END;
--> statement-breakpoint
-- END managed_payouts
--> statement-breakpoint
-- BEGIN managed_supplier_payments
--> statement-breakpoint
CREATE TABLE "__single_sa_managed_supplier_payments" (
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL REFERENCES managed_supplier_obligations(id) ON DELETE RESTRICT,
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
  status TEXT NOT NULL CHECK(status IN ('prepared','approved','paid','failed','cancelled')),
  destination_reference TEXT NOT NULL,
  simulation_label TEXT NOT NULL,
  prepared_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  paid_at INTEGER
);
--> statement-breakpoint
INSERT INTO "__single_sa_managed_supplier_payments"("id","obligation_id","amount_paisa","status","destination_reference","simulation_label","prepared_by","approved_by","request_id","created_at","updated_at","paid_at") SELECT "id","obligation_id","amount_paisa","status","destination_reference","simulation_label","prepared_by","approved_by","request_id","created_at","updated_at","paid_at" FROM "managed_supplier_payments";
--> statement-breakpoint
DROP TABLE "managed_supplier_payments";
--> statement-breakpoint
ALTER TABLE "__single_sa_managed_supplier_payments" RENAME TO "managed_supplier_payments";
--> statement-breakpoint
CREATE INDEX idx_managed_supplier_payment_obligation ON managed_supplier_payments(obligation_id,status);
--> statement-breakpoint
CREATE TRIGGER managed_supplier_payments_single_sa_insert BEFORE INSERT ON managed_supplier_payments FOR EACH ROW WHEN (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) BEGIN SELECT RAISE(ABORT,'managed_supplier_payments_approval_requires_active_super_admin'); END;
--> statement-breakpoint
CREATE TRIGGER managed_supplier_payments_single_sa_update BEFORE UPDATE ON managed_supplier_payments FOR EACH ROW WHEN (NEW.approved_by IS NOT OLD.approved_by OR NEW.prepared_by IS NOT OLD.prepared_by OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.approved_by=NEW.prepared_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')) BEGIN SELECT RAISE(ABORT,'managed_supplier_payments_approval_requires_active_super_admin'); END;
--> statement-breakpoint
-- END managed_supplier_payments
--> statement-breakpoint
-- BEGIN staff_permission_requests
--> statement-breakpoint
CREATE TABLE "__single_sa_staff_permission_requests" (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 permissions_json TEXT NOT NULL,
 expected_version INTEGER NOT NULL,
 preset_name TEXT,
 reason TEXT NOT NULL,
 proposed_by TEXT NOT NULL REFERENCES users(id),
 proposed_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 decided_by TEXT REFERENCES users(id),
 decided_at INTEGER,
 decision_note TEXT,
 decision_token TEXT
);
--> statement-breakpoint
INSERT INTO "__single_sa_staff_permission_requests"("id","user_id","permissions_json","expected_version","preset_name","reason","proposed_by","proposed_at","status","decided_by","decided_at","decision_note","decision_token") SELECT "id","user_id","permissions_json","expected_version","preset_name","reason","proposed_by","proposed_at","status","decided_by","decided_at","decision_note","decision_token" FROM "staff_permission_requests";
--> statement-breakpoint
DROP TABLE "staff_permission_requests";
--> statement-breakpoint
ALTER TABLE "__single_sa_staff_permission_requests" RENAME TO "staff_permission_requests";
--> statement-breakpoint
CREATE TRIGGER staff_permission_requests_single_sa_insert BEFORE INSERT ON staff_permission_requests FOR EACH ROW WHEN (NEW.decided_by=NEW.proposed_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.decided_by AND u.status='active' AND r.role='super_admin')) BEGIN SELECT RAISE(ABORT,'staff_permission_requests_approval_requires_active_super_admin'); END;
--> statement-breakpoint
CREATE TRIGGER staff_permission_requests_single_sa_update BEFORE UPDATE ON staff_permission_requests FOR EACH ROW WHEN (NEW.decided_by IS NOT OLD.decided_by OR NEW.proposed_by IS NOT OLD.proposed_by OR (NEW.status='approved' AND OLD.status<>'approved')) AND (NEW.decided_by=NEW.proposed_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.decided_by AND u.status='active' AND r.role='super_admin')) BEGIN SELECT RAISE(ABORT,'staff_permission_requests_approval_requires_active_super_admin'); END;
--> statement-breakpoint
-- END staff_permission_requests
--> statement-breakpoint
-- BEGIN parcel_cash_records
--> statement-breakpoint
CREATE TABLE "__single_sa_parcel_cash_records" (
 id VARCHAR(191) PRIMARY KEY,
 shipping_job_id VARCHAR(191) NOT NULL REFERENCES shipping_parcels(shipping_job_id),
 kind VARCHAR(32) NOT NULL CHECK(kind IN ('collection','remittance')),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0),
 evidence_reference VARCHAR(120) NOT NULL,
 status VARCHAR(32) NOT NULL CHECK(status IN ('pending','posted','rejected')),
 created_by VARCHAR(191) NOT NULL REFERENCES users(id),
 approved_by VARCHAR(191) REFERENCES users(id),
 created_at BIGINT NOT NULL,
 approved_at BIGINT, rider_user_id TEXT REFERENCES users(id), UNIQUE(kind,evidence_reference)
);
--> statement-breakpoint
INSERT INTO "__single_sa_parcel_cash_records"("id","shipping_job_id","kind","amount_paisa","evidence_reference","status","created_by","approved_by","created_at","approved_at","rider_user_id") SELECT "id","shipping_job_id","kind","amount_paisa","evidence_reference","status","created_by","approved_by","created_at","approved_at","rider_user_id" FROM "parcel_cash_records";
--> statement-breakpoint
DROP TABLE "parcel_cash_records";
--> statement-breakpoint
ALTER TABLE "__single_sa_parcel_cash_records" RENAME TO "parcel_cash_records";
--> statement-breakpoint
CREATE INDEX idx_parcel_cash_status ON parcel_cash_records(status,created_at);
--> statement-breakpoint
CREATE TRIGGER parcel_cash_posted_no_delete BEFORE DELETE ON parcel_cash_records FOR EACH ROW WHEN OLD.status='posted' BEGIN SELECT RAISE(ABORT,'posted_cash_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER parcel_cash_posted_no_update BEFORE UPDATE ON parcel_cash_records FOR EACH ROW WHEN OLD.status='posted' BEGIN SELECT RAISE(ABORT,'posted_cash_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER parcel_cash_records_single_sa_insert BEFORE INSERT ON parcel_cash_records FOR EACH ROW WHEN (NEW.kind='remittance' AND NEW.status='posted' AND (NEW.approved_by IS NULL OR (NEW.rider_user_id IS NOT NULL AND NEW.rider_user_id=NEW.approved_by) OR (NEW.approved_by=NEW.created_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')))) BEGIN SELECT RAISE(ABORT,'parcel_cash_records_approval_requires_active_super_admin'); END;
--> statement-breakpoint
CREATE TRIGGER parcel_cash_records_single_sa_update BEFORE UPDATE ON parcel_cash_records FOR EACH ROW WHEN (NEW.kind='remittance' AND NEW.status='posted' AND (NEW.approved_by IS NULL OR (NEW.rider_user_id IS NOT NULL AND NEW.rider_user_id=NEW.approved_by) OR (NEW.approved_by=NEW.created_by AND NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin')))) BEGIN SELECT RAISE(ABORT,'parcel_cash_records_approval_requires_active_super_admin'); END;
--> statement-breakpoint
-- END parcel_cash_records
--> statement-breakpoint
PRAGMA legacy_alter_table=OFF;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
