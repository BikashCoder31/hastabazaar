-- Source-only private storage. No historical price, cost, evidence or consent is inferred.
CREATE TABLE product_private_price_inputs(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),subject_kind TEXT NOT NULL CHECK(subject_kind IN ('product','intake')),subject_id TEXT NOT NULL,offer_key TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=0),cost_text TEXT NOT NULL,target_text TEXT NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(owner_id,subject_kind,subject_id,offer_key));
--> statement-breakpoint
CREATE TABLE product_private_price_requests(owner_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,payload_digest TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=0),created_at INTEGER NOT NULL,PRIMARY KEY(owner_id,request_id));
