-- Historical cancellations and pending reviews keep their unrecorded cause.
ALTER TABLE order_cancellation_events
  ADD COLUMN cause VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  ADD CONSTRAINT chk_cancellation_event_cause
    CHECK (cause IN ('seller', 'customer', 'courier', 'hastabazaar', 'payment'));
ALTER TABLE order_cancellation_reviews
  ADD COLUMN cause VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  ADD CONSTRAINT chk_cancellation_review_cause
    CHECK (cause IN ('seller', 'customer', 'courier', 'hastabazaar', 'payment'));
