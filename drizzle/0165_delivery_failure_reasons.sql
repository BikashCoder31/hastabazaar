-- Nullable for past parcels. Existing courier and rider outcomes are retained.
ALTER TABLE shipping_jobs ADD COLUMN delivery_failure_reason TEXT DEFAULT NULL
  CHECK (delivery_failure_reason IN ('refused', 'not_reached', 'wrong_address', 'courier_problem', 'other'));
