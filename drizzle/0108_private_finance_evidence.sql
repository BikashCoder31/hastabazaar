CREATE TABLE finance_evidence_intents(
 id TEXT PRIMARY KEY,scope_kind TEXT NOT NULL CHECK(scope_kind IN('obligation','company_account','order')),
 scope_id TEXT NOT NULL,uploaded_by TEXT NOT NULL REFERENCES users(id),object_key TEXT NOT NULL UNIQUE,
 original_name TEXT NOT NULL,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=5242880),
 content_hash TEXT NOT NULL,created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE finance_evidence_files(id TEXT PRIMARY KEY REFERENCES finance_evidence_intents(id),retained_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TRIGGER finance_evidence_intent_no_update BEFORE UPDATE ON finance_evidence_intents BEGIN SELECT RAISE(ABORT,'private_finance_evidence_retained'); END;
--> statement-breakpoint
CREATE TRIGGER finance_evidence_intent_no_delete BEFORE DELETE ON finance_evidence_intents BEGIN SELECT RAISE(ABORT,'private_finance_evidence_retained'); END;
--> statement-breakpoint
CREATE TRIGGER finance_evidence_file_no_update BEFORE UPDATE ON finance_evidence_files BEGIN SELECT RAISE(ABORT,'private_finance_evidence_retained'); END;
--> statement-breakpoint
CREATE TRIGGER finance_evidence_file_no_delete BEFORE DELETE ON finance_evidence_files BEGIN SELECT RAISE(ABORT,'private_finance_evidence_retained'); END;
