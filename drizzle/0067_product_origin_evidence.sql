-- Existing origin values remain intact for review; legacy NP defaults are not evidence.
ALTER TABLE products ADD COLUMN origin_evidence_status TEXT NOT NULL DEFAULT 'unverified';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN origin_evidence_reference TEXT;
