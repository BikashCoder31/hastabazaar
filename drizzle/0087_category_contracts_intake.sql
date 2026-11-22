-- Additive source only. No existing category, product or canonical database is changed here.
CREATE TABLE category_template_versions (
 id TEXT PRIMARY KEY NOT NULL,category_id TEXT NOT NULL REFERENCES categories(id),version INTEGER NOT NULL CHECK(version>0),
 contract_json TEXT NOT NULL CHECK(json_valid(contract_json)),created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 1000),UNIQUE(category_id,version)
);
--> statement-breakpoint
CREATE TABLE category_template_states (
 category_id TEXT PRIMARY KEY NOT NULL REFERENCES categories(id),version_id TEXT NOT NULL REFERENCES category_template_versions(id),
 revision INTEGER NOT NULL CHECK(revision>=0),last_event_id TEXT NOT NULL,updated_by TEXT NOT NULL REFERENCES users(id),updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE product_intake_drafts (
 id TEXT PRIMARY KEY NOT NULL,owner_id TEXT NOT NULL REFERENCES users(id),seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
 product_id TEXT REFERENCES products(id),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),category_id TEXT,
 answers_json TEXT NOT NULL CHECK(json_valid(answers_json)),category_change_json TEXT CHECK(category_change_json IS NULL OR json_valid(category_change_json)),
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE product_intake_versions (
 id TEXT PRIMARY KEY NOT NULL,draft_id TEXT NOT NULL REFERENCES product_intake_drafts(id),revision INTEGER NOT NULL CHECK(revision>=0),category_id TEXT,
 answers_json TEXT NOT NULL CHECK(json_valid(answers_json)),category_contract_version_id TEXT REFERENCES category_template_versions(id),created_at INTEGER NOT NULL,
 request_id TEXT NOT NULL UNIQUE,UNIQUE(draft_id,revision)
);
--> statement-breakpoint
CREATE TRIGGER category_template_version_immutable BEFORE UPDATE ON category_template_versions BEGIN SELECT RAISE(ABORT,'category_template_version_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER category_template_version_retention BEFORE DELETE ON category_template_versions BEGIN SELECT RAISE(ABORT,'category_template_version_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER category_template_head_valid BEFORE UPDATE ON category_template_states
 WHEN NEW.category_id<>OLD.category_id OR NEW.revision<>OLD.revision+1 OR NOT EXISTS(SELECT 1 FROM category_template_versions WHERE id=NEW.version_id AND category_id=NEW.category_id AND version=NEW.revision+1)
 BEGIN SELECT RAISE(ABORT,'category_template_head_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER category_template_head_retention BEFORE DELETE ON category_template_states BEGIN SELECT RAISE(ABORT,'category_template_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER product_intake_owner_immutable BEFORE UPDATE ON product_intake_drafts
 WHEN NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.seller_id<>OLD.seller_id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1
 BEGIN SELECT RAISE(ABORT,'product_intake_revision_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER product_intake_version_immutable BEFORE UPDATE ON product_intake_versions BEGIN SELECT RAISE(ABORT,'product_intake_version_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER product_intake_version_retention BEFORE DELETE ON product_intake_versions BEGIN SELECT RAISE(ABORT,'product_intake_version_immutable'); END;
