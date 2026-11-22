-- Explicit separately reviewed cutover only. No startup/backlog normalization.
CREATE TABLE complete_version_legacy_transitions (
 source_request_id TEXT PRIMARY KEY NOT NULL REFERENCES seller_document_change_requests(id),
 case_id TEXT NOT NULL UNIQUE REFERENCES seller_protected_change_cases(id),
 cutover_key TEXT NOT NULL,
 transition_operation_id TEXT NOT NULL UNIQUE,
 source_fingerprint TEXT NOT NULL CHECK(length(source_fingerprint)=64 AND source_fingerprint NOT GLOB '*[^0-9a-f]*'),
 source_snapshot_json TEXT NOT NULL CHECK(json_valid(source_snapshot_json)),
 original_operation_id TEXT,
 historical_request_identity_revision INTEGER CHECK(historical_request_identity_revision IS NULL),
 historical_request_bank_reference TEXT CHECK(historical_request_bank_reference IS NULL),
 baseline_basis TEXT NOT NULL CHECK(baseline_basis='cutover_observation'),
 observed_identity_revision INTEGER NOT NULL CHECK(observed_identity_revision>=0),
 observed_bank_reference TEXT,
 observed_at INTEGER NOT NULL CHECK(observed_at>=0),
 original_requested_at INTEGER NOT NULL CHECK(original_requested_at>=0),
 review_task_id TEXT NOT NULL REFERENCES review_tasks(id),
 existing_task_preserved INTEGER NOT NULL CHECK(existing_task_preserved IN(0,1)),
 first_review_due_at INTEGER NOT NULL,
 deadline_started_at INTEGER NOT NULL CHECK(deadline_started_at>=0),
 cutover_at INTEGER NOT NULL CHECK(cutover_at>=0),
 initiated_by TEXT NOT NULL REFERENCES users(id),
 CHECK(hex(case_id)=hex(source_request_id)),
 CHECK(existing_task_preserved=1 OR first_review_due_at>=cutover_at)
);
--> statement-breakpoint
CREATE TRIGGER legacy_transition_link_guard BEFORE INSERT ON complete_version_legacy_transitions
WHEN NOT EXISTS(SELECT 1 FROM seller_document_change_requests r JOIN seller_protected_change_cases c ON hex(c.source_request_id)=hex(r.id)
 JOIN review_tasks t ON hex(t.id)=hex(NEW.review_task_id) AND hex(t.source_type)=hex('document_change') AND hex(t.source_id)=hex(r.id) AND hex(t.source_revision)=hex(CASE WHEN NEW.existing_task_preserved=1 THEN r.id ELSE NEW.transition_operation_id END)
 WHERE hex(r.id)=hex(NEW.source_request_id) AND hex(c.id)=hex(NEW.case_id) AND hex(c.seller_id)=hex(r.seller_id) AND hex(c.source_document_id)=hex(r.document_id)
 AND hex(NEW.transition_operation_id)=hex(c.operation_request_id) AND c.requested_at=r.requested_at AND NEW.observed_at=NEW.cutover_at AND c.updated_at=NEW.cutover_at
 AND hex(NEW.baseline_basis)=hex('cutover_observation') AND NEW.observed_identity_revision=c.original_identity_revision AND NEW.observed_bank_reference IS c.original_bank_reference AND NEW.original_operation_id IS r.operation_request_id AND NEW.original_requested_at=r.requested_at AND NEW.first_review_due_at=t.due_at)
BEGIN SELECT RAISE(ABORT,'legacy_transition_source_link_required'); END;
--> statement-breakpoint
CREATE TRIGGER legacy_transition_immutable BEFORE UPDATE ON complete_version_legacy_transitions BEGIN SELECT RAISE(ABORT,'legacy_transition_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER legacy_transition_retained BEFORE DELETE ON complete_version_legacy_transitions BEGIN SELECT RAISE(ABORT,'legacy_transition_retained'); END;
