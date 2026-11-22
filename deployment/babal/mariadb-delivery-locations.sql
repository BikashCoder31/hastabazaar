-- Additive, repeatable. Apply before deploying delivery maps and assignments.
CREATE TABLE IF NOT EXISTS address_locations (
 address_id VARCHAR(191) PRIMARY KEY NOT NULL,
 latitude DOUBLE NOT NULL, longitude DOUBLE NOT NULL,
 FOREIGN KEY(address_id) REFERENCES addresses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS delivery_assignments (
 order_id VARCHAR(191) PRIMARY KEY NOT NULL,
 method VARCHAR(20) NOT NULL,
 rider_user_id VARCHAR(191) NULL, courier_name VARCHAR(120) NULL,
 tracking_url VARCHAR(500) NULL, tracking_reference VARCHAR(80) NULL,
 latitude DOUBLE NULL, longitude DOUBLE NULL, accuracy DOUBLE NULL, position_at BIGINT NULL,
 assigned_by VARCHAR(191) NOT NULL, updated_at BIGINT NOT NULL,
 FOREIGN KEY(order_id) REFERENCES orders(id), FOREIGN KEY(rider_user_id) REFERENCES users(id),
 FOREIGN KEY(assigned_by) REFERENCES users(id), INDEX idx_delivery_rider(rider_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DROP TRIGGER IF EXISTS clear_closed_delivery_location;
CREATE TRIGGER clear_closed_delivery_location AFTER UPDATE ON orders FOR EACH ROW
UPDATE delivery_assignments SET latitude=NULL,longitude=NULL,accuracy=NULL,position_at=NULL
WHERE order_id=NEW.id AND NEW.status <> 'dispatched';
