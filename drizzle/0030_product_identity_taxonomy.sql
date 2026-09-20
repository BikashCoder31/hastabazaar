-- Additive; historical duplicate SKUs retain their values. Claims are never recycled.
CREATE TABLE IF NOT EXISTS product_sku_claims(sku TEXT PRIMARY KEY NOT NULL,product_id TEXT NOT NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO product_sku_claims(sku,product_id) SELECT sku,MIN(id) FROM products GROUP BY sku;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS claim_new_product_sku AFTER INSERT ON products BEGIN INSERT INTO product_sku_claims(sku,product_id) VALUES (NEW.sku,NEW.id); END;
--> statement-breakpoint
INSERT INTO categories (id,slug,name_en,name_ne,is_active,sort_order,created_at,updated_at)
SELECT 'hastabazaar-category-others','others','Others',NULL,1,999,1789257600000,1789257600000 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug='others' OR lower(trim(name_en))='others');
--> statement-breakpoint
INSERT INTO occasions (id,slug,name_en,name_ne,is_active,sort_order,created_at,updated_at)
SELECT 'hastabazaar-occasion-others','others','Others',NULL,1,999,1789257600000,1789257600000 WHERE NOT EXISTS (SELECT 1 FROM occasions WHERE slug='others' OR lower(trim(name_en))='others');
