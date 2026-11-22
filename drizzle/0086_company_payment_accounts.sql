-- Source migration only. Never apply to the canonical local data to make startup pass.
CREATE TABLE company_payment_accounts (
 id TEXT PRIMARY KEY NOT NULL,revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),latest_version_id TEXT,
 last_event_id TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE company_payment_account_identities (
 identity_hash TEXT PRIMARY KEY NOT NULL CHECK(length(identity_hash)=64),account_id TEXT NOT NULL REFERENCES company_payment_accounts(id)
);
--> statement-breakpoint
CREATE TABLE company_payment_account_versions (
 id TEXT PRIMARY KEY NOT NULL,account_id TEXT NOT NULL REFERENCES company_payment_accounts(id),number INTEGER NOT NULL CHECK(number>0),
 supersedes_id TEXT REFERENCES company_payment_account_versions(id),identity_hash TEXT NOT NULL REFERENCES company_payment_account_identities(identity_hash),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','awaiting_verification','verified','inactive')),
 details_json TEXT NOT NULL CHECK(json_valid(details_json) AND json_type(details_json)='object'),
 evidence_reference TEXT NOT NULL CHECK(length(trim(evidence_reference)) BETWEEN 8 AND 500),
 conflicts_json TEXT NOT NULL CHECK(json_valid(conflicts_json) AND json_type(conflicts_json)='array'),
 created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,submitted_at INTEGER,
 verified_by TEXT REFERENCES users(id),verified_at INTEGER,verification_reference TEXT,
 UNIQUE(account_id,number),CHECK(status NOT IN ('awaiting_verification','verified') OR submitted_at IS NOT NULL),
 CHECK(status<>'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND length(trim(verification_reference))>=8))
);
--> statement-breakpoint
CREATE TABLE company_payment_account_current (
 currency TEXT PRIMARY KEY NOT NULL CHECK(currency='NPR'),version_id TEXT REFERENCES company_payment_account_versions(id),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),updated_by TEXT REFERENCES users(id),updated_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO company_payment_account_current(currency,version_id,revision,updated_at) VALUES('NPR',NULL,0,0);
--> statement-breakpoint
CREATE TABLE company_payment_account_events (
 id TEXT PRIMARY KEY NOT NULL,account_id TEXT NOT NULL REFERENCES company_payment_accounts(id),version_id TEXT NOT NULL REFERENCES company_payment_account_versions(id),
 actor_id TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 1000),created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE company_payment_instructions (
 order_id TEXT PRIMARY KEY NOT NULL REFERENCES orders(id),account_version_id TEXT NOT NULL REFERENCES company_payment_account_versions(id),
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json) AND json_type(snapshot_json)='object'),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),currency TEXT NOT NULL CHECK(currency='NPR'),
 payment_reference TEXT NOT NULL UNIQUE,issued_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL CHECK(deadline_at=issued_at+86400000),
 calendar_version TEXT NOT NULL,issued_by TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TRIGGER company_account_head_valid BEFORE UPDATE ON company_payment_accounts
 WHEN NEW.revision<>OLD.revision+1 OR NEW.id<>OLD.id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
 OR NOT EXISTS(SELECT 1 FROM company_payment_account_versions WHERE id=NEW.latest_version_id AND account_id=NEW.id)
 BEGIN SELECT RAISE(ABORT,'company_account_head_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER company_account_version_immutable BEFORE UPDATE ON company_payment_account_versions
 WHEN NEW.id<>OLD.id OR NEW.account_id<>OLD.account_id OR NEW.number<>OLD.number OR NEW.supersedes_id IS NOT OLD.supersedes_id
 OR NEW.identity_hash<>OLD.identity_hash OR NEW.details_json<>OLD.details_json OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.conflicts_json<>OLD.conflicts_json
 OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1
 OR (OLD.submitted_at IS NOT NULL AND NEW.submitted_at IS NOT OLD.submitted_at)
 OR (OLD.verified_at IS NOT NULL AND (NEW.verified_by IS NOT OLD.verified_by OR NEW.verified_at IS NOT OLD.verified_at OR NEW.verification_reference IS NOT OLD.verification_reference))
 OR NOT ((OLD.status='draft' AND NEW.status='awaiting_verification') OR (OLD.status='awaiting_verification' AND NEW.status='verified') OR (OLD.status='verified' AND NEW.status='verified') OR (OLD.status<>'inactive' AND NEW.status='inactive'))
 BEGIN SELECT RAISE(ABORT,'company_account_version_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER company_account_selector_valid BEFORE UPDATE ON company_payment_account_current
 WHEN NEW.currency<>OLD.currency OR NEW.revision<>OLD.revision+1 OR (NEW.version_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM company_payment_account_versions v JOIN company_payment_accounts a ON a.id=v.account_id
 WHERE v.id=NEW.version_id AND a.latest_version_id=v.id AND v.status='verified' AND json_extract(v.details_json,'$.currency')=NEW.currency AND json_extract(v.details_json,'$.purpose') IN ('receiving','both')))
 BEGIN SELECT RAISE(ABORT,'company_account_selector_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER company_account_retention BEFORE DELETE ON company_payment_accounts BEGIN SELECT RAISE(ABORT,'company_account_immutable_history'); END;
--> statement-breakpoint
CREATE TRIGGER company_account_selector_retention BEFORE DELETE ON company_payment_account_current BEGIN SELECT RAISE(ABORT,'company_account_immutable_history'); END;
--> statement-breakpoint
CREATE TRIGGER company_account_identity_immutable BEFORE UPDATE ON company_payment_account_identities BEGIN SELECT RAISE(ABORT,'company_account_immutable_history'); END;
--> statement-breakpoint
CREATE TRIGGER company_account_identity_retention BEFORE DELETE ON company_payment_account_identities BEGIN SELECT RAISE(ABORT,'company_account_immutable_history'); END;
--> statement-breakpoint
CREATE TRIGGER company_account_version_retention BEFORE DELETE ON company_payment_account_versions BEGIN SELECT RAISE(ABORT,'company_account_immutable_history'); END;
--> statement-breakpoint
CREATE TRIGGER company_account_event_immutable BEFORE UPDATE ON company_payment_account_events BEGIN SELECT RAISE(ABORT,'company_account_immutable_history'); END;
--> statement-breakpoint
CREATE TRIGGER company_account_event_retention BEFORE DELETE ON company_payment_account_events BEGIN SELECT RAISE(ABORT,'company_account_immutable_history'); END;
--> statement-breakpoint
CREATE TRIGGER company_instruction_immutable BEFORE UPDATE ON company_payment_instructions BEGIN SELECT RAISE(ABORT,'company_instruction_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER company_instruction_retention BEFORE DELETE ON company_payment_instructions BEGIN SELECT RAISE(ABORT,'company_instruction_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER company_account_review_task_created AFTER UPDATE ON company_payment_account_versions
 WHEN NEW.status='awaiting_verification' AND OLD.status='draft'
 BEGIN INSERT INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,has_deadline)
 VALUES(lower(hex(randomblob(16))),'company_account',NEW.id,NEW.id,NEW.submitted_at,NEW.submitted_at,'no-agreed-deadline-v1',NEW.submitted_at,0); END;
