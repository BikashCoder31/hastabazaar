CREATE TABLE IF NOT EXISTS account_email_verifications (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id), email TEXT NOT NULL, verified_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS order_items_require_eligible_seller BEFORE INSERT ON order_items
WHEN NEW.product_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM products p JOIN seller_profiles s ON s.id=p.seller_id JOIN users u ON u.id=s.user_id
 WHERE p.id=NEW.product_id AND p.status='published' AND s.status='approved' AND u.status='active'
 AND NOT EXISTS (SELECT 1 FROM product_deletions d WHERE d.product_id=p.id)
)
BEGIN SELECT RAISE(ABORT, 'product_unavailable'); END;
