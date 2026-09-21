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
