-- Source only. Existing carts and their legacy lines are preserved without backfill.
CREATE TABLE cart_offer_lines(id TEXT PRIMARY KEY,cart_id TEXT NOT NULL REFERENCES carts(id),product_id TEXT NOT NULL REFERENCES products(id),offer_id TEXT NOT NULL REFERENCES product_offer_identities(id),version_id TEXT NOT NULL REFERENCES product_offer_versions(id),public_version_id TEXT REFERENCES product_publication_candidates(id),quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10),revision INTEGER NOT NULL CHECK(revision>=0),snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(cart_id,offer_id));
--> statement-breakpoint
CREATE TRIGGER cart_offer_line_identity BEFORE INSERT ON cart_offer_lines WHEN NOT EXISTS(SELECT 1 FROM product_offer_identities i JOIN product_offer_versions v ON v.product_id=i.product_id WHERE i.id=NEW.offer_id AND i.product_id=NEW.product_id AND v.id=NEW.version_id) BEGIN SELECT RAISE(ABORT,'cart_offer_line_identity'); END;
--> statement-breakpoint
CREATE TRIGGER cart_offer_line_revision BEFORE UPDATE ON cart_offer_lines WHEN NEW.id<>OLD.id OR NEW.cart_id<>OLD.cart_id OR NEW.product_id<>OLD.product_id OR NEW.offer_id<>OLD.offer_id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR NOT EXISTS(SELECT 1 FROM product_offer_versions WHERE id=NEW.version_id AND product_id=NEW.product_id) BEGIN SELECT RAISE(ABORT,'cart_offer_line_revision'); END;
--> statement-breakpoint
CREATE TABLE cart_offer_commands(cart_id TEXT NOT NULL REFERENCES carts(id),request_id TEXT NOT NULL,payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),created_at INTEGER NOT NULL,PRIMARY KEY(cart_id,request_id));
--> statement-breakpoint
CREATE TRIGGER cart_offer_command_immutable BEFORE UPDATE ON cart_offer_commands BEGIN SELECT RAISE(ABORT,'cart_offer_command_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER cart_offer_command_retained BEFORE DELETE ON cart_offer_commands BEGIN SELECT RAISE(ABORT,'cart_offer_command_retained'); END;
