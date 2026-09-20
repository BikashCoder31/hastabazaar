ALTER TABLE products ADD COLUMN materials_json TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN origin_story TEXT;
