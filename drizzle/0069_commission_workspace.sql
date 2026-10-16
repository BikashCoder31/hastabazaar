CREATE TABLE commission_control (
  id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO commission_control (id, revision) VALUES ('default', 0);

CREATE TABLE commission_rate_changes (
  id TEXT PRIMARY KEY NOT NULL,
  basis_points INTEGER NOT NULL CHECK (basis_points BETWEEN 0 AND 10000),
  effective_at INTEGER NOT NULL,
  agreement_version TEXT NOT NULL,
  terms_text TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  CHECK (effective_at >= created_at + 1296000000)
);
CREATE INDEX idx_commission_rates_effective ON commission_rate_changes(effective_at, created_at);

CREATE TABLE commission_rate_cancellations (
  rate_id TEXT PRIMARY KEY NOT NULL REFERENCES commission_rate_changes(id),
  request_id TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  cancelled_by TEXT NOT NULL REFERENCES users(id),
  cancelled_at INTEGER NOT NULL
);

CREATE TABLE commission_rate_acceptances (
  rate_id TEXT NOT NULL REFERENCES commission_rate_changes(id),
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  accepted_at INTEGER NOT NULL,
  PRIMARY KEY (rate_id, seller_id)
);
CREATE INDEX idx_commission_acceptances_seller ON commission_rate_acceptances(seller_id, rate_id);
