ALTER TABLE products ADD COLUMN packed_weight_grams INTEGER DEFAULT NULL
  CHECK(packed_weight_grams IS NULL OR (typeof(packed_weight_grams)='integer' AND packed_weight_grams BETWEEN 50 AND 30000));
--> statement-breakpoint
CREATE TABLE seller_parcel_weights (
  order_id TEXT NOT NULL REFERENCES orders(id),
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
  weight_grams INTEGER NOT NULL CHECK(typeof(weight_grams)='integer' AND weight_grams BETWEEN 50 AND 30000),
  item_count INTEGER NOT NULL CHECK(typeof(item_count)='integer' AND item_count>0),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 1 AND 150),
  recorded_at INTEGER NOT NULL,
  PRIMARY KEY(order_id,seller_id)
);
