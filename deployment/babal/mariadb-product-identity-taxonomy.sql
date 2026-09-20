-- Additive. Apply under maintenance; never renumber existing products.
CREATE TABLE IF NOT EXISTS product_sku_claims (
 sku VARCHAR(191) PRIMARY KEY,
 product_id VARCHAR(191) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO product_sku_claims(sku,product_id) SELECT sku,MIN(id) FROM products GROUP BY sku;
DROP TRIGGER IF EXISTS claim_new_product_sku;
DELIMITER $$
CREATE TRIGGER claim_new_product_sku AFTER INSERT ON products FOR EACH ROW
BEGIN
 INSERT INTO product_sku_claims(sku,product_id) VALUES (NEW.sku,NEW.id);
END$$
DELIMITER ;
INSERT INTO categories (id,slug,name_en,name_ne,is_active,sort_order,created_at,updated_at)
SELECT 'hastabazaar-category-others','others','Others',NULL,1,999,1789257600000,1789257600000 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug='others' OR lower(trim(name_en))='others');

INSERT INTO occasions (id,slug,name_en,name_ne,is_active,sort_order,created_at,updated_at)
SELECT 'hastabazaar-occasion-others','others','Others',NULL,1,999,1789257600000,1789257600000 WHERE NOT EXISTS (SELECT 1 FROM occasions WHERE slug='others' OR lower(trim(name_en))='others');
