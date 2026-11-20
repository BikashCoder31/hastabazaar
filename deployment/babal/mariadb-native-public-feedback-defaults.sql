-- Source: drizzle/0154_native_public_feedback_defaults.sql SHA256 b9ba568f8a321f0295f9cf62e9e0752b392c8b7b248c05653b5c01d2480eb674
-- Preserve the original composite FK, indexes, checks and every existing delivery row.
ALTER TABLE `feedback_delivery_jobs` MODIFY COLUMN `config_version_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NULL;
ALTER TABLE `feedback_delivery_jobs` ADD CONSTRAINT `feedback_delivery_jobs_native_json_object` CHECK (JSON_TYPE(`feedback_json`)='OBJECT');

DELIMITER $$
CREATE TRIGGER `feedback_native_origin_insert` BEFORE INSERT ON `feedback_delivery_jobs` FOR EACH ROW
BEGIN
  IF NEW.config_version_id IS NULL THEN
    IF NOT EXISTS (
    SELECT 1 FROM audit_logs fact JOIN audit_logs receipt
      ON HEX(receipt.id)=HEX(JSON_VALUE(fact.next_json,'$.coreReceiptId'))
    WHERE HEX(fact.id)=HEX(CONCAT('feedback:',NEW.id,':submitted'))
      AND HEX(fact.action)=HEX('feedback.submitted') AND fact.actor_id IS NULL
      AND HEX(fact.subject_type)=HEX('feedback_submission') AND HEX(fact.subject_id)=HEX(NEW.id)
      AND fact.created_at=NEW.created_at
      AND HEX(JSON_VALUE(fact.next_json,'$.formId'))=HEX(NEW.form_id)
      AND HEX(JSON_VALUE(fact.next_json,'$.requestId'))=HEX(NEW.request_id)
      AND HEX(JSON_VALUE(fact.next_json,'$.versionId'))=HEX(CONCAT('core:',NEW.form_id,':1'))
      AND HEX(JSON_VALUE(fact.next_json,'$.payloadHash'))=HEX(NEW.payload_hash)
      AND HEX(receipt.action)=HEX('form.core_answers') AND receipt.actor_id IS NULL
      AND HEX(receipt.subject_type)=HEX('feedback_submission') AND HEX(receipt.subject_id)=HEX(NEW.id)
      AND receipt.created_at=NEW.created_at
      AND HEX(JSON_VALUE(receipt.next_json,'$.formId'))=HEX(NEW.form_id)
      AND HEX(JSON_VALUE(receipt.next_json,'$.requestId'))=HEX(NEW.request_id)
      AND HEX(JSON_VALUE(receipt.next_json,'$.versionId'))=HEX(CONCAT('core:',NEW.form_id,':1'))
      AND JSON_TYPE(JSON_EXTRACT(receipt.next_json,'$.version'))='INTEGER' AND JSON_VALUE(receipt.next_json,'$.version')=1
      AND JSON_TYPE(JSON_EXTRACT(receipt.next_json,'$.answers'))='ARRAY'
      AND JSON_LENGTH(JSON_EXTRACT(receipt.next_json,'$.answers'))=0
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Native feedback origin requires its exact immutable receipts'; END IF;
  END IF;
END$$

CREATE TRIGGER `feedback_native_origin_update` BEFORE UPDATE ON `feedback_delivery_jobs` FOR EACH ROW
BEGIN
  IF NEW.config_version_id IS NULL THEN
    IF NOT EXISTS (
    SELECT 1 FROM audit_logs fact JOIN audit_logs receipt
      ON HEX(receipt.id)=HEX(JSON_VALUE(fact.next_json,'$.coreReceiptId'))
    WHERE HEX(fact.id)=HEX(CONCAT('feedback:',NEW.id,':submitted'))
      AND HEX(fact.action)=HEX('feedback.submitted') AND fact.actor_id IS NULL
      AND HEX(fact.subject_type)=HEX('feedback_submission') AND HEX(fact.subject_id)=HEX(NEW.id)
      AND fact.created_at=NEW.created_at
      AND HEX(JSON_VALUE(fact.next_json,'$.formId'))=HEX(NEW.form_id)
      AND HEX(JSON_VALUE(fact.next_json,'$.requestId'))=HEX(NEW.request_id)
      AND HEX(JSON_VALUE(fact.next_json,'$.versionId'))=HEX(CONCAT('core:',NEW.form_id,':1'))
      AND HEX(JSON_VALUE(fact.next_json,'$.payloadHash'))=HEX(NEW.payload_hash)
      AND HEX(receipt.action)=HEX('form.core_answers') AND receipt.actor_id IS NULL
      AND HEX(receipt.subject_type)=HEX('feedback_submission') AND HEX(receipt.subject_id)=HEX(NEW.id)
      AND receipt.created_at=NEW.created_at
      AND HEX(JSON_VALUE(receipt.next_json,'$.formId'))=HEX(NEW.form_id)
      AND HEX(JSON_VALUE(receipt.next_json,'$.requestId'))=HEX(NEW.request_id)
      AND HEX(JSON_VALUE(receipt.next_json,'$.versionId'))=HEX(CONCAT('core:',NEW.form_id,':1'))
      AND JSON_TYPE(JSON_EXTRACT(receipt.next_json,'$.version'))='INTEGER' AND JSON_VALUE(receipt.next_json,'$.version')=1
      AND JSON_TYPE(JSON_EXTRACT(receipt.next_json,'$.answers'))='ARRAY'
      AND JSON_LENGTH(JSON_EXTRACT(receipt.next_json,'$.answers'))=0
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Native feedback origin requires its exact immutable receipts'; END IF;
  END IF;
END$$

CREATE TRIGGER `feedback_native_facts_immutable` BEFORE UPDATE ON `feedback_delivery_jobs` FOR EACH ROW
BEGIN
  IF OLD.config_version_id IS NULL AND (
  NOT (HEX(NEW.id) <=> HEX(OLD.id)) OR NOT (HEX(NEW.request_id) <=> HEX(OLD.request_id)) OR NOT (HEX(NEW.form_id) <=> HEX(OLD.form_id))
  OR NOT (HEX(NEW.config_version_id) <=> HEX(OLD.config_version_id)) OR NOT (HEX(NEW.payload_hash) <=> HEX(OLD.payload_hash))
  OR NOT (HEX(NEW.feedback_json) <=> HEX(OLD.feedback_json)) OR NOT (HEX(NEW.created_at) <=> HEX(OLD.created_at))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Original native feedback facts are immutable';
  END IF;
END$$

CREATE TRIGGER `feedback_native_proof_immutable` BEFORE UPDATE ON `audit_logs` FOR EACH ROW
BEGIN
  IF HEX(OLD.action)=HEX('feedback.submitted') AND (
  NOT (HEX(NEW.id) <=> HEX(OLD.id)) OR NOT (HEX(NEW.action) <=> HEX(OLD.action)) OR NOT (HEX(NEW.subject_type) <=> HEX(OLD.subject_type))
  OR NOT (HEX(NEW.subject_id) <=> HEX(OLD.subject_id)) OR NOT (HEX(NEW.request_id) <=> HEX(OLD.request_id))
  OR NOT (HEX(NEW.next_json) <=> HEX(OLD.next_json)) OR NOT (HEX(NEW.previous_json) <=> HEX(OLD.previous_json))
  OR NOT (HEX(NEW.created_at) <=> HEX(OLD.created_at)) OR (NEW.actor_id IS NOT NULL AND NOT (HEX(NEW.actor_id) <=> HEX(OLD.actor_id)))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Native feedback parent proof is immutable';
  END IF;
END$$

CREATE TRIGGER `feedback_native_proof_retained` BEFORE DELETE ON `audit_logs` FOR EACH ROW
BEGIN
  IF HEX(OLD.action)=HEX('feedback.submitted') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Native feedback parent proof is retained';
  END IF;
END$$
DELIMITER ;
