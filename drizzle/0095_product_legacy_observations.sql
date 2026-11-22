-- Source only. An observed legacy row is not an approved publication snapshot.
CREATE TABLE product_legacy_observations(product_id TEXT PRIMARY KEY REFERENCES products(id),draft_id TEXT NOT NULL UNIQUE REFERENCES product_intake_drafts(id),source_fingerprint TEXT NOT NULL CHECK(length(source_fingerprint)=64),observed_json TEXT NOT NULL CHECK(json_valid(observed_json)),created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TRIGGER product_legacy_observation_source BEFORE INSERT ON product_legacy_observations WHEN NOT EXISTS(SELECT 1 FROM product_publication_links l JOIN product_intake_drafts d ON d.id=l.draft_id JOIN products p ON p.id=l.product_id JOIN seller_profiles s ON s.id=p.seller_id JOIN users u ON u.id=s.user_id WHERE l.product_id=NEW.product_id AND l.draft_id=NEW.draft_id AND d.owner_id=NEW.created_by AND s.user_id=NEW.created_by AND u.status='active' AND json_extract(NEW.observed_json,'$.product.id')=p.id AND json_extract(NEW.observed_json,'$.product.seller_id')=s.id) BEGIN SELECT RAISE(ABORT,'product_legacy_observation_source'); END;
--> statement-breakpoint
CREATE TRIGGER product_legacy_observation_immutable BEFORE UPDATE ON product_legacy_observations BEGIN SELECT RAISE(ABORT,'product_legacy_observation_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER product_legacy_observation_retained BEFORE DELETE ON product_legacy_observations BEGIN SELECT RAISE(ABORT,'product_legacy_observation_retained'); END;

--> statement-breakpoint
CREATE TABLE product_legacy_media_copies(draft_id TEXT NOT NULL REFERENCES product_intake_drafts(id),source_media_id TEXT NOT NULL REFERENCES product_media(id),source_object_key TEXT NOT NULL,intake_media_id TEXT NOT NULL UNIQUE REFERENCES product_intake_media(id),created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,PRIMARY KEY(draft_id,source_media_id));
--> statement-breakpoint
CREATE TRIGGER product_legacy_media_copy_source BEFORE INSERT ON product_legacy_media_copies WHEN NOT EXISTS(SELECT 1 FROM product_legacy_observations o JOIN product_intake_drafts d ON d.id=o.draft_id JOIN product_media m ON m.product_id=o.product_id JOIN product_intake_media n ON n.draft_id=d.id JOIN users u ON u.id=d.owner_id WHERE d.id=NEW.draft_id AND m.id=NEW.source_media_id AND m.object_key=NEW.source_object_key AND n.id=NEW.intake_media_id AND n.owner_id=NEW.created_by AND d.owner_id=NEW.created_by AND n.state='ready' AND u.status='active' AND EXISTS(SELECT 1 FROM json_each(o.observed_json,'$.media') original WHERE json_extract(original.value,'$.id')=NEW.source_media_id AND HEX(json_extract(original.value,'$.object_key'))=HEX(NEW.source_object_key))) BEGIN SELECT RAISE(ABORT,'product_legacy_media_copy_source'); END;
--> statement-breakpoint
CREATE TRIGGER product_legacy_media_copy_immutable BEFORE UPDATE ON product_legacy_media_copies BEGIN SELECT RAISE(ABORT,'product_legacy_media_copy_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER product_legacy_media_copy_retained BEFORE DELETE ON product_legacy_media_copies BEGIN SELECT RAISE(ABORT,'product_legacy_media_copy_retained'); END;
