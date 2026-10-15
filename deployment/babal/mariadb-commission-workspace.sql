-- Apply after mariadb-policy-commission-9-percent.sql, before deploying the
-- Commission workspace. Historical order and ledger snapshots are untouched.
CREATE TABLE IF NOT EXISTS commission_control (
  id VARCHAR(191) PRIMARY KEY NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO commission_control(id, revision) VALUES ('default', 0);

CREATE TABLE IF NOT EXISTS commission_rate_changes (
  id VARCHAR(191) PRIMARY KEY NOT NULL,
  basis_points BIGINT NOT NULL CHECK (basis_points BETWEEN 0 AND 10000),
  effective_at BIGINT NOT NULL,
  agreement_version LONGTEXT NOT NULL,
  terms_text LONGTEXT NOT NULL,
  reason LONGTEXT NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id),
  CHECK (effective_at >= created_at + 1296000000),
  INDEX idx_commission_rates_effective (effective_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS commission_rate_cancellations (
  rate_id VARCHAR(191) PRIMARY KEY NOT NULL,
  request_id VARCHAR(191) NOT NULL UNIQUE,
  reason LONGTEXT NOT NULL,
  cancelled_by VARCHAR(191) NOT NULL,
  cancelled_at BIGINT NOT NULL,
  FOREIGN KEY (rate_id) REFERENCES commission_rate_changes(id),
  FOREIGN KEY (cancelled_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS commission_rate_acceptances (
  rate_id VARCHAR(191) NOT NULL,
  seller_id VARCHAR(191) NOT NULL,
  actor_id VARCHAR(191) NOT NULL,
  accepted_at BIGINT NOT NULL,
  PRIMARY KEY (rate_id, seller_id),
  FOREIGN KEY (rate_id) REFERENCES commission_rate_changes(id),
  FOREIGN KEY (seller_id) REFERENCES seller_profiles(id),
  FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX idx_commission_acceptances_seller (seller_id, rate_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
