-- Historical cancellations and pending reviews keep their unrecorded cause.
ALTER TABLE order_cancellation_events ADD COLUMN cause TEXT DEFAULT NULL
  CHECK (cause IN ('seller', 'customer', 'courier', 'hastabazaar', 'payment'));
--> statement-breakpoint
ALTER TABLE order_cancellation_reviews ADD COLUMN cause TEXT DEFAULT NULL
  CHECK (cause IN ('seller', 'customer', 'courier', 'hastabazaar', 'payment'));
