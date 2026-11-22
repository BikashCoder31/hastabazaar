CREATE TABLE seller_dispatch_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_item_id TEXT NOT NULL REFERENCES order_items(id),
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 8 AND 150),
  object_key TEXT NOT NULL UNIQUE CHECK(object_key='private/seller-dispatch-evidence/'||id),
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes INTEGER NOT NULL CHECK(typeof(size_bytes)='integer' AND size_bytes BETWEEN 1 AND 5242880),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 1 AND 9007199254740991),
  UNIQUE(actor_id,request_id)
);
--> statement-breakpoint
CREATE INDEX seller_dispatch_evidence_item ON seller_dispatch_evidence(order_item_id,created_at,id);
--> statement-breakpoint
CREATE TRIGGER seller_dispatch_evidence_source BEFORE INSERT ON seller_dispatch_evidence BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id JOIN users u ON u.id=s.user_id
    WHERE i.id=NEW.order_item_id AND i.order_id=NEW.order_id AND i.seller_id=NEW.seller_id
      AND u.id=NEW.actor_id AND u.status='active' AND s.status='approved'
      AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='seller')
      AND i.fulfillment_status IN ('confirmed','packing','ready_for_pickup')
      AND NOT EXISTS(SELECT 1 FROM order_item_status_events e WHERE e.order_item_id=i.id AND e.to_status IN ('dispatched','delivered'))
      AND NOT EXISTS(SELECT 1 FROM shipping_jobs j WHERE j.order_id=i.order_id AND j.seller_id=i.seller_id
        AND j.direction='outbound' AND j.status NOT IN ('pickup_requested','label_pending','label_ready','pickup_scheduled'))
  ) THEN RAISE(ABORT,'seller_dispatch_evidence_source') END;
END;
--> statement-breakpoint
CREATE TRIGGER seller_dispatch_evidence_immutable BEFORE UPDATE ON seller_dispatch_evidence
BEGIN SELECT RAISE(ABORT,'seller_dispatch_evidence_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER seller_dispatch_evidence_retained BEFORE DELETE ON seller_dispatch_evidence
BEGIN SELECT RAISE(ABORT,'seller_dispatch_evidence_retained'); END;
