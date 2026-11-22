-- Coordinated source records only. No existing rate/date/consent is modified or inferred.
CREATE TABLE commission_common_policies(id TEXT PRIMARY KEY,registered_setting_id TEXT NOT NULL UNIQUE REFERENCES business_setting_versions(id),managed_setting_id TEXT NOT NULL UNIQUE REFERENCES business_setting_versions(id),basis_points INTEGER NOT NULL CHECK(basis_points BETWEEN 0 AND 10000),effective_at INTEGER NOT NULL,published_at INTEGER NOT NULL,published_by TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,terms_text TEXT NOT NULL,replaces_id TEXT REFERENCES commission_common_policies(id),CHECK(effective_at>=published_at+1296000000));
--> statement-breakpoint
CREATE TABLE commission_common_cancellations(policy_id TEXT PRIMARY KEY REFERENCES commission_common_policies(id),replacement_id TEXT REFERENCES commission_common_policies(id),actor_id TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,created_at INTEGER NOT NULL,event_id TEXT NOT NULL UNIQUE);
--> statement-breakpoint
CREATE TRIGGER common_fee_policy_immutable BEFORE UPDATE ON commission_common_policies BEGIN SELECT RAISE(ABORT,'common_fee_policy_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER common_fee_policy_retained BEFORE DELETE ON commission_common_policies BEGIN SELECT RAISE(ABORT,'common_fee_policy_retained'); END;
--> statement-breakpoint
CREATE TRIGGER common_fee_cancellation_immutable BEFORE UPDATE ON commission_common_cancellations BEGIN SELECT RAISE(ABORT,'common_fee_cancellation_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER common_fee_cancellation_retained BEFORE DELETE ON commission_common_cancellations BEGIN SELECT RAISE(ABORT,'common_fee_cancellation_retained'); END;
--> statement-breakpoint
CREATE TABLE commission_terms_cases(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL REFERENCES seller_profiles(id),source_version_id TEXT NOT NULL REFERENCES business_setting_versions(id),offer_key TEXT NOT NULL,route TEXT NOT NULL CHECK(route IN ('registered_seller','managed_maker')),state TEXT NOT NULL CHECK(state IN ('open','accepted','replaced')),revision INTEGER NOT NULL DEFAULT 1,published_at INTEGER NOT NULL,effective_at INTEGER NOT NULL,created_at INTEGER NOT NULL,observed_at INTEGER NOT NULL,last_notice_event_id TEXT,last_staff_event_id TEXT,last_contact_at INTEGER,last_reply_at INTEGER,hold_reviewed_at INTEGER,super_admin_reviewed_at INTEGER,next_review_at INTEGER,technical_issue_at INTEGER,technical_owner_id TEXT REFERENCES users(id),technical_resolved_at INTEGER,delivery_issue_at INTEGER,delivery_resolved_at INTEGER,UNIQUE(seller_id,offer_key));
--> statement-breakpoint
CREATE TABLE commission_terms_events(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES commission_terms_cases(id),event_key TEXT NOT NULL UNIQUE,kind TEXT NOT NULL,due_at INTEGER NOT NULL,created_at INTEGER NOT NULL,routine INTEGER NOT NULL CHECK(routine IN (0,1)),actor_id TEXT REFERENCES users(id),detail_json TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE commission_terms_email_controls(seller_id TEXT PRIMARY KEY REFERENCES seller_profiles(id),revision INTEGER NOT NULL DEFAULT 0,last_routine_queued_at INTEGER,last_routine_sent_at INTEGER,last_personal_contact_at INTEGER,last_routine_message_id TEXT,routine_claim_token TEXT,routine_claim_message_id TEXT,routine_claim_until INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE commission_terms_hold_batches(id TEXT PRIMARY KEY,created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE commission_terms_hold_batch_events(event_id TEXT PRIMARY KEY REFERENCES commission_terms_events(id),batch_id TEXT NOT NULL REFERENCES commission_terms_hold_batches(id));
--> statement-breakpoint
CREATE TRIGGER commission_terms_event_immutable BEFORE UPDATE ON commission_terms_events BEGIN SELECT RAISE(ABORT,'commission_terms_event_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER commission_terms_event_retained BEFORE DELETE ON commission_terms_events BEGIN SELECT RAISE(ABORT,'commission_terms_event_retained'); END;
--> statement-breakpoint
CREATE TABLE commission_terms_scan_state(id TEXT PRIMARY KEY CHECK(id='default'),cursor TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
INSERT INTO commission_terms_scan_state(id) VALUES('default');
