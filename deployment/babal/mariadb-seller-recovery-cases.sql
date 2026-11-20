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
