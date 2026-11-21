ALTER TABLE products ADD COLUMN packed_weight_grams INT DEFAULT NULL,
  ADD CONSTRAINT products_packed_weight_grams_range CHECK(packed_weight_grams IS NULL OR packed_weight_grams BETWEEN 50 AND 30000);

CREATE TABLE seller_parcel_weights (
  order_id VARCHAR(191) NOT NULL,
  seller_id VARCHAR(191) NOT NULL,
  weight_grams INT NOT NULL CHECK(weight_grams BETWEEN 50 AND 30000),
  item_count INT NOT NULL CHECK(item_count>0),
  recorded_by VARCHAR(191) NOT NULL,
  request_id VARCHAR(150) NOT NULL CHECK(CHAR_LENGTH(request_id) BETWEEN 1 AND 150),
  recorded_at BIGINT NOT NULL,
  PRIMARY KEY(order_id,seller_id),
  CONSTRAINT seller_parcel_weights_order_fk FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT seller_parcel_weights_seller_fk FOREIGN KEY (seller_id) REFERENCES seller_profiles(id),
  CONSTRAINT seller_parcel_weights_actor_fk FOREIGN KEY (recorded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
