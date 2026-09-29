-- Static identity security controls; never configurable through the form catalogue.
CREATE TABLE account_phone_verifications (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 phone TEXT NOT NULL,
 verified_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE account_contact_challenges (
 token_hash TEXT PRIMARY KEY NOT NULL,
 code_hash TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 auth_subject TEXT NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('email','phone')),
 contact_value TEXT NOT NULL,
 contact_snapshot TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 delivered_at INTEGER,
 consumed_at INTEGER,
 UNIQUE(user_id,channel)
);
--> statement-breakpoint
-- Disposable local capture only. No production delivery adapter writes this table.
CREATE TABLE local_contact_captures (
 token_hash TEXT PRIMARY KEY NOT NULL REFERENCES account_contact_challenges(token_hash) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 channel TEXT NOT NULL,
 contact_value TEXT NOT NULL,
 code TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 simulation_label TEXT NOT NULL CHECK(simulation_label='SIMULATED — NOT VALID FOR PRODUCTION')
);
--> statement-breakpoint
CREATE TRIGGER account_phone_change_revoke AFTER UPDATE OF phone ON users
WHEN OLD.phone IS NOT NEW.phone
BEGIN
 DELETE FROM account_phone_verifications WHERE user_id=NEW.id;
 DELETE FROM account_contact_challenges WHERE user_id=NEW.id AND channel='phone';
END;
--> statement-breakpoint
CREATE TRIGGER account_email_change_revoke AFTER UPDATE OF email ON users
WHEN lower(OLD.email)<>lower(NEW.email)
BEGIN
 DELETE FROM account_email_verifications WHERE user_id=NEW.id;
 DELETE FROM account_contact_challenges WHERE user_id=NEW.id AND channel='email';
END;
