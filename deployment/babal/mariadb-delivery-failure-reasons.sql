-- Nullable for past parcels. Existing courier and rider outcomes are retained.
ALTER TABLE shipping_jobs
  ADD COLUMN delivery_failure_reason VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  ADD CONSTRAINT chk_shipping_job_delivery_failure_reason
    CHECK (delivery_failure_reason IN ('refused', 'not_reached', 'wrong_address', 'courier_problem', 'other'));
