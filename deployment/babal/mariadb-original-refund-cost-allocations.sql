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
