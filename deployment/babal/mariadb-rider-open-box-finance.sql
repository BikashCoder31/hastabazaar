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
