CREATE TABLE order_delivery_shipment_allocations (
  id TEXT NOT NULL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
  shipment_ordinal INTEGER NOT NULL CHECK(typeof(shipment_ordinal)='integer' AND shipment_ordinal BETWEEN 1 AND 9007199254740991),
  amount_paisa INTEGER NOT NULL CHECK(typeof(amount_paisa)='integer' AND amount_paisa BETWEEN 0 AND 9007199254740991),
  unit_count INTEGER NOT NULL CHECK(typeof(unit_count)='integer' AND unit_count BETWEEN 1 AND 9007199254740991),
  policy_version TEXT NOT NULL CHECK(policy_version='seller_shipment_equal_units_v2'),
  allocation_source TEXT NOT NULL CHECK(length(trim(allocation_source))>0 AND length(allocation_source)<=191),
  created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX delivery_shipment_order_seller ON order_delivery_shipment_allocations(order_id,seller_id);
--> statement-breakpoint
CREATE UNIQUE INDEX delivery_shipment_order_ordinal ON order_delivery_shipment_allocations(order_id,shipment_ordinal);
--> statement-breakpoint
CREATE TABLE order_delivery_unit_allocations (
  shipment_id TEXT NOT NULL REFERENCES order_delivery_shipment_allocations(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_item_id TEXT NOT NULL REFERENCES order_items(id),
  line_ordinal INTEGER NOT NULL CHECK(typeof(line_ordinal)='integer' AND line_ordinal BETWEEN 1 AND 9007199254740991),
  unit_ordinal INTEGER NOT NULL CHECK(typeof(unit_ordinal)='integer' AND unit_ordinal BETWEEN 1 AND 9007199254740991),
  shipment_unit_ordinal INTEGER NOT NULL CHECK(typeof(shipment_unit_ordinal)='integer' AND shipment_unit_ordinal BETWEEN 1 AND 9007199254740991),
  amount_paisa INTEGER NOT NULL CHECK(typeof(amount_paisa)='integer' AND amount_paisa BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(order_item_id,unit_ordinal)
);
--> statement-breakpoint
CREATE UNIQUE INDEX delivery_unit_shipment_ordinal ON order_delivery_unit_allocations(shipment_id,shipment_unit_ordinal);
--> statement-breakpoint
CREATE INDEX delivery_unit_order_shipment ON order_delivery_unit_allocations(order_id,shipment_id,shipment_unit_ordinal);
--> statement-breakpoint
CREATE TABLE order_delivery_unit_claims (
  order_item_id TEXT NOT NULL,
  unit_ordinal INTEGER NOT NULL,
  refund_id TEXT REFERENCES refunds(id),
  cancellation_event_id TEXT REFERENCES order_cancellation_events(id),
  created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(order_item_id,unit_ordinal),
  FOREIGN KEY(order_item_id,unit_ordinal) REFERENCES order_delivery_unit_allocations(order_item_id,unit_ordinal),
  CHECK((refund_id IS NULL)<>(cancellation_event_id IS NULL))
);
--> statement-breakpoint
CREATE INDEX delivery_unit_claim_refund ON order_delivery_unit_claims(refund_id);
--> statement-breakpoint
CREATE INDEX delivery_unit_claim_cancellation ON order_delivery_unit_claims(cancellation_event_id);
--> statement-breakpoint
CREATE TABLE order_delivery_unit_parcels (
  order_item_id TEXT NOT NULL,
  unit_ordinal INTEGER NOT NULL,
  shipping_job_id TEXT NOT NULL REFERENCES shipping_jobs(id),
  created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(order_item_id,unit_ordinal),
  FOREIGN KEY(order_item_id,unit_ordinal) REFERENCES order_delivery_unit_allocations(order_item_id,unit_ordinal)
);
--> statement-breakpoint
CREATE INDEX delivery_unit_parcel_job ON order_delivery_unit_parcels(shipping_job_id);
--> statement-breakpoint
CREATE TRIGGER delivery_shipment_insert BEFORE INSERT ON order_delivery_shipment_allocations
BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM order_delivery_shipment_allocations
    WHERE id=NEW.id OR (order_id=NEW.order_id AND (seller_id=NEW.seller_id OR shipment_ordinal=NEW.shipment_ordinal))
  ) THEN RAISE(ABORT,'delivery_shipment_history_retained') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM orders AS original
    WHERE original.id=NEW.order_id
      AND NEW.unit_count=(SELECT SUM(item.quantity) FROM order_items AS item WHERE item.order_id=original.id AND item.seller_id=NEW.seller_id)
      AND NEW.shipment_ordinal<=(SELECT COUNT(DISTINCT item.seller_id) FROM order_items AS item WHERE item.order_id=original.id)
      AND NEW.amount_paisa<=original.delivery_charge_paisa-COALESCE((
        SELECT SUM(prior.amount_paisa) FROM order_delivery_shipment_allocations AS prior WHERE prior.order_id=original.id
      ),0)
  ) THEN RAISE(ABORT,'delivery_shipment_original_mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER delivery_shipment_no_update BEFORE UPDATE ON order_delivery_shipment_allocations
BEGIN SELECT RAISE(ABORT,'delivery_shipment_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER delivery_shipment_no_delete BEFORE DELETE ON order_delivery_shipment_allocations
BEGIN SELECT RAISE(ABORT,'delivery_shipment_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER delivery_shipment_marker_no_rewrite BEFORE UPDATE OF delivery_rate_snapshot_json ON orders
WHEN NEW.delivery_rate_snapshot_json IS NOT OLD.delivery_rate_snapshot_json
  AND EXISTS(SELECT 1 FROM order_delivery_shipment_allocations WHERE order_id=OLD.id)
  AND CASE WHEN json_valid(OLD.delivery_rate_snapshot_json)
    THEN json_extract(OLD.delivery_rate_snapshot_json,'$.unitAllocationPolicy') END='seller_shipment_equal_units_v2'
BEGIN SELECT RAISE(ABORT,'delivery_shipment_marker_retained'); END;
--> statement-breakpoint
CREATE TRIGGER delivery_unit_insert BEFORE INSERT ON order_delivery_unit_allocations
BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM order_delivery_unit_allocations
    WHERE (order_item_id=NEW.order_item_id AND unit_ordinal=NEW.unit_ordinal)
      OR (shipment_id=NEW.shipment_id AND shipment_unit_ordinal=NEW.shipment_unit_ordinal)
  ) THEN RAISE(ABORT,'delivery_unit_history_retained') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM order_delivery_shipment_allocations AS shipment
    JOIN order_items AS item ON item.order_id=shipment.order_id AND item.seller_id=shipment.seller_id
    WHERE shipment.id=NEW.shipment_id AND shipment.order_id=NEW.order_id AND item.id=NEW.order_item_id
      AND NEW.unit_ordinal<=item.quantity AND NEW.shipment_unit_ordinal<=shipment.unit_count
      AND NEW.amount_paisa=CAST(shipment.amount_paisa / shipment.unit_count AS INTEGER)
        + CASE WHEN NEW.shipment_unit_ordinal<=shipment.amount_paisa % shipment.unit_count THEN 1 ELSE 0 END
      AND (
        (NEW.shipment_unit_ordinal=1 AND NEW.line_ordinal=1 AND NEW.unit_ordinal=1)
        OR EXISTS(
          SELECT 1 FROM order_delivery_unit_allocations AS previous
          JOIN order_items AS previous_item ON previous_item.id=previous.order_item_id
          WHERE previous.shipment_id=shipment.id AND previous.shipment_unit_ordinal=NEW.shipment_unit_ordinal-1
            AND (
              (previous.order_item_id=NEW.order_item_id AND previous.line_ordinal=NEW.line_ordinal AND NEW.unit_ordinal=previous.unit_ordinal+1)
              OR (previous.order_item_id<>NEW.order_item_id AND NEW.line_ordinal=previous.line_ordinal+1
                AND previous.unit_ordinal=previous_item.quantity AND NEW.unit_ordinal=1)
            )
        )
      )
  ) THEN RAISE(ABORT,'delivery_unit_original_mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER delivery_unit_no_update BEFORE UPDATE ON order_delivery_unit_allocations
BEGIN SELECT RAISE(ABORT,'delivery_unit_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER delivery_unit_no_delete BEFORE DELETE ON order_delivery_unit_allocations
BEGIN SELECT RAISE(ABORT,'delivery_unit_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER delivery_unit_claim_insert BEFORE INSERT ON order_delivery_unit_claims
BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM order_delivery_unit_claims WHERE order_item_id=NEW.order_item_id AND unit_ordinal=NEW.unit_ordinal
  ) THEN RAISE(ABORT,'delivery_unit_claim_history_retained') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM order_delivery_unit_allocations AS unit
    JOIN order_delivery_shipment_allocations AS shipment ON shipment.id=unit.shipment_id
    WHERE unit.order_item_id=NEW.order_item_id AND unit.unit_ordinal=NEW.unit_ordinal
      AND (
        (NEW.refund_id IS NOT NULL AND NEW.cancellation_event_id IS NULL AND EXISTS(
          SELECT 1 FROM refunds AS refund
          JOIN return_requests AS request ON request.id=refund.return_request_id
          WHERE refund.id=NEW.refund_id AND refund.order_id=unit.order_id AND refund.status<>'rejected'
            AND request.order_item_id=unit.order_item_id
            AND (SELECT COUNT(*) FROM order_delivery_unit_claims AS prior WHERE prior.refund_id=refund.id)<request.quantity
        ))
        OR (NEW.cancellation_event_id IS NOT NULL AND NEW.refund_id IS NULL AND EXISTS(
          SELECT 1 FROM order_cancellation_events AS event
          WHERE event.id=NEW.cancellation_event_id AND event.order_id=unit.order_id
            AND json_type(event.seller_ids_json)='array'
            AND EXISTS(SELECT 1 FROM json_each(event.seller_ids_json) AS seller WHERE seller.type='text' AND seller.value=shipment.seller_id)
            AND json_type(event.original_allocations_json)='array'
            AND EXISTS(
              SELECT 1 FROM json_each(event.original_allocations_json) AS line
              WHERE line.type='object' AND json_extract(line.value,'$.id')=unit.order_item_id
                AND json_extract(line.value,'$.sellerId')=shipment.seller_id
            )
        ))
      )
  ) THEN RAISE(ABORT,'delivery_unit_claim_source_mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER delivery_unit_claim_no_update BEFORE UPDATE ON order_delivery_unit_claims
BEGIN SELECT RAISE(ABORT,'delivery_unit_claim_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER delivery_unit_claim_no_delete BEFORE DELETE ON order_delivery_unit_claims
WHEN NOT EXISTS(SELECT 1 FROM refunds WHERE id=OLD.refund_id AND status='rejected')
BEGIN SELECT RAISE(ABORT,'delivery_unit_claim_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER delivery_unit_parcel_insert BEFORE INSERT ON order_delivery_unit_parcels
BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM order_delivery_unit_parcels WHERE order_item_id=NEW.order_item_id AND unit_ordinal=NEW.unit_ordinal
  ) THEN RAISE(ABORT,'delivery_unit_parcel_history_retained') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM order_delivery_unit_allocations AS unit
    JOIN order_delivery_shipment_allocations AS shipment ON shipment.id=unit.shipment_id
    JOIN shipping_jobs AS job ON job.order_id=unit.order_id AND job.seller_id=shipment.seller_id
    WHERE unit.order_item_id=NEW.order_item_id AND unit.unit_ordinal=NEW.unit_ordinal
      AND job.id=NEW.shipping_job_id AND job.direction='outbound'
  ) THEN RAISE(ABORT,'delivery_unit_parcel_source_mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER delivery_unit_parcel_no_update BEFORE UPDATE ON order_delivery_unit_parcels
BEGIN SELECT RAISE(ABORT,'delivery_unit_parcel_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER delivery_unit_parcel_no_delete BEFORE DELETE ON order_delivery_unit_parcels
BEGIN SELECT RAISE(ABORT,'delivery_unit_parcel_history_retained'); END;
