/** Compare the entire reviewed SQL definition, preserving operators, grouping,
 * literal case and token boundaries. Only formatting/backtick quoting/word case
 * are normalized. Comments and unknown syntax fail closed, not stripped. */
export function sameFeeSqlDefinition(actual, expected) {
  function tokens(value) {
    if (typeof value !== 'string') return null;
    const source = value.trim().replace(/;$/, '');
    const pattern = /\s+|'(?:''|[^'\\])*'|`[a-z_][a-z0-9_]*`|[a-z_][a-z0-9_]*|\d+|<>|!=|<=|>=|[=<>(),;.-]/giy;
    const result = [];
    let cursor = 0;
    while (cursor < source.length) {
      pattern.lastIndex = cursor;
      const match = pattern.exec(source);
      if (!match) return null;
      const token = match[0];
      if (!/^\s+$/.test(token)) result.push(token.startsWith("'") ? token : token.replaceAll('`', '').toLowerCase());
      cursor = pattern.lastIndex;
    }
    return JSON.stringify(result);
  }
  const left = tokens(actual), right = tokens(expected);
  return left !== null && right !== null && left === right;
}

// Reviewed 0074 contract. SQLite definitions include all column types, NULL/PK/FK,
// collations and CHECK grouping; MariaDB predicates are synthetic expectations
// until the separate Task 7 native introspection gate confirms server output.

/** Metadata only: callers may use this with a read-only SQLite handle or D1. */
export function customerFeeSqliteDefinitionProblems(rows) {
  const missing = [];
  for (const {kind, expected} of [
    {kind:'table', expected:customerFeeSqliteTableDefinitions},
    {kind:'index', expected:customerFeeSqliteIndexDefinitions},
    {kind:'trigger', expected:Object.fromEntries(Object.entries(customerFeeTriggerDefinitions).map(([name, shape]) => [name, shape.sqlite]))},
  ]) for (const [name, definition] of Object.entries(expected)) {
    const actual = rows.find(row => row.type === kind && row.name === name)?.definition;
    if (!actual) missing.push(kind + ':' + name);
    else if (!sameFeeSqlDefinition(actual, definition)) missing.push(kind + '-version:' + name);
  }
  return missing;
}
export function customerFeeControlProblems(rows) {
  if (rows.length !== 1 || rows[0]?.id !== 'default') return ['control:customer_fee_waiver_control.default'];
  const revision = rows[0].revision;
  if (!(typeof revision === 'number' || typeof revision === 'string' && /^[0-9]+$/.test(revision)) ||
    !Number.isSafeInteger(Number(revision)) || Number(revision) < 0)
    return ['control-version:customer_fee_waiver_control.default'];
  return [];
}

export const customerFeeMariaMigration = 'mariadb-customer-service-fee-waivers.sql';
export const customerFeeRequiredTables = Object.freeze({
  "customer_fee_waiver_control": [
    "id",
    "revision"
  ],
  "customer_fee_waiver_campaigns": [
    "id",
    "revision",
    "created_at",
    "updated_at"
  ],
  "customer_fee_waiver_revisions": [
    "campaign_id",
    "revision",
    "state",
    "name",
    "description",
    "starts_at",
    "ends_at",
    "created_by",
    "request_id",
    "created_at"
  ],
  "customer_fee_waiver_requests": [
    "request_id",
    "actor_id",
    "auth_subject",
    "command_json",
    "response_json",
    "created_at"
  ],
  "order_customer_service_fees": [
    "order_id",
    "policy_enabled",
    "policy_amount_paisa",
    "policy_version_id",
    "standard_paisa",
    "waived_paisa",
    "net_paisa",
    "campaign_id",
    "campaign_revision",
    "created_at"
  ]
});
export const customerFeeSqliteTableDefinitions = Object.freeze({
  "customer_fee_waiver_control": "CREATE TABLE customer_fee_waiver_control (\n id TEXT PRIMARY KEY NOT NULL CHECK(id='default'),\n revision INTEGER NOT NULL DEFAULT 0 CHECK(typeof(revision)='integer' AND revision BETWEEN 0 AND 9007199254740991)\n);",
  "customer_fee_waiver_campaigns": "CREATE TABLE customer_fee_waiver_campaigns (\n id VARCHAR(191) COLLATE BINARY PRIMARY KEY NOT NULL,\n revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),\n created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991),\n updated_at INTEGER NOT NULL CHECK(typeof(updated_at)='integer' AND updated_at BETWEEN 0 AND 9007199254740991)\n);",
  "customer_fee_waiver_revisions": "CREATE TABLE customer_fee_waiver_revisions (\n campaign_id VARCHAR(191) COLLATE BINARY NOT NULL REFERENCES customer_fee_waiver_campaigns(id),\n revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),\n state VARCHAR(16) NOT NULL CHECK(state IN ('draft','published','paused','ended')),\n name VARCHAR(100) NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),\n description TEXT NOT NULL CHECK(length(description)<=1000),\n starts_at INTEGER NOT NULL CHECK(typeof(starts_at)='integer' AND starts_at BETWEEN 0 AND 9007199254740991),\n ends_at INTEGER NOT NULL CHECK(typeof(ends_at)='integer' AND ends_at BETWEEN 1 AND 9007199254740991 AND ends_at>starts_at),\n created_by VARCHAR(191) NOT NULL REFERENCES users(id),\n request_id VARCHAR(191) COLLATE BINARY NOT NULL UNIQUE,\n created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991),\n PRIMARY KEY(campaign_id,revision)\n);",
  "customer_fee_waiver_requests": "CREATE TABLE customer_fee_waiver_requests (\n request_id VARCHAR(191) COLLATE BINARY PRIMARY KEY NOT NULL CHECK(length(request_id) BETWEEN 1 AND 191),\n actor_id VARCHAR(191) NOT NULL REFERENCES users(id),\n auth_subject VARCHAR(191) NOT NULL,\n command_json TEXT NOT NULL CHECK(json_valid(command_json) AND json_type(command_json)='object'),\n response_json TEXT NOT NULL CHECK(json_valid(response_json) AND json_type(response_json)='object'),\n created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991)\n);",
  "order_customer_service_fees": "CREATE TABLE order_customer_service_fees (\n order_id VARCHAR(191) PRIMARY KEY NOT NULL REFERENCES orders(id),\n policy_enabled INTEGER NOT NULL CHECK(typeof(policy_enabled)='integer' AND policy_enabled IN (0,1)),\n policy_amount_paisa INTEGER NOT NULL CHECK(typeof(policy_amount_paisa)='integer' AND policy_amount_paisa BETWEEN 0 AND 100000),\n policy_version_id VARCHAR(191),\n standard_paisa INTEGER NOT NULL CHECK(typeof(standard_paisa)='integer' AND standard_paisa BETWEEN 0 AND 9007199254740991),\n waived_paisa INTEGER NOT NULL CHECK(typeof(waived_paisa)='integer' AND waived_paisa BETWEEN 0 AND 9007199254740991),\n net_paisa INTEGER NOT NULL CHECK(typeof(net_paisa)='integer' AND net_paisa BETWEEN 0 AND 9007199254740991),\n campaign_id VARCHAR(191) COLLATE BINARY,\n campaign_revision INTEGER CHECK(campaign_revision IS NULL OR (typeof(campaign_revision)='integer' AND campaign_revision BETWEEN 1 AND 9007199254740991)),\n created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 0 AND 9007199254740991),\n FOREIGN KEY(campaign_id,campaign_revision) REFERENCES customer_fee_waiver_revisions(campaign_id,revision),\n CONSTRAINT customer_fee_policy_standard CHECK((policy_enabled=1 AND standard_paisa=policy_amount_paisa) OR (policy_enabled=0 AND standard_paisa=0)),\n CONSTRAINT customer_fee_reconciled CHECK(standard_paisa-waived_paisa=net_paisa),\n CONSTRAINT customer_fee_full_waiver CHECK((campaign_id IS NULL AND campaign_revision IS NULL AND waived_paisa=0) OR\n       (campaign_id IS NOT NULL AND campaign_revision IS NOT NULL AND standard_paisa>0 AND waived_paisa=standard_paisa AND net_paisa=0))\n);"
});
export const customerFeeSqliteIndexDefinitions = Object.freeze({
  "idx_customer_fee_waiver_history": "CREATE INDEX idx_customer_fee_waiver_history ON customer_fee_waiver_revisions(campaign_id,created_at,revision);",
  "idx_order_customer_service_fees_campaign": "CREATE INDEX idx_order_customer_service_fees_campaign ON order_customer_service_fees(campaign_id,campaign_revision);"
});
export const customerFeeTriggerDefinitions = Object.freeze({
  "customer_fee_waiver_revisions_no_replace": {
    "table": "customer_fee_waiver_revisions",
    "event": "INSERT",
    "timing": "BEFORE",
    "sqlite": "CREATE TRIGGER customer_fee_waiver_revisions_no_replace BEFORE INSERT ON customer_fee_waiver_revisions WHEN EXISTS(SELECT 1 FROM customer_fee_waiver_revisions WHERE (campaign_id=NEW.campaign_id AND revision=NEW.revision) OR request_id=NEW.request_id) BEGIN SELECT RAISE(ABORT,'customer_fee_waiver_revision_immutable'); END;",
    "mariadb": "BEGIN IF EXISTS(SELECT 1 FROM customer_fee_waiver_revisions WHERE (campaign_id=NEW.campaign_id AND revision=NEW.revision) OR request_id=NEW.request_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_revision_immutable'; END IF; END"
  },
  "customer_fee_waiver_requests_no_replace": {
    "table": "customer_fee_waiver_requests",
    "event": "INSERT",
    "timing": "BEFORE",
    "sqlite": "CREATE TRIGGER customer_fee_waiver_requests_no_replace BEFORE INSERT ON customer_fee_waiver_requests WHEN EXISTS(SELECT 1 FROM customer_fee_waiver_requests WHERE request_id=NEW.request_id) BEGIN SELECT RAISE(ABORT,'customer_fee_waiver_request_immutable'); END;",
    "mariadb": "BEGIN IF EXISTS(SELECT 1 FROM customer_fee_waiver_requests WHERE request_id=NEW.request_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_request_immutable'; END IF; END"
  },
  "order_customer_service_fees_no_replace": {
    "table": "order_customer_service_fees",
    "event": "INSERT",
    "timing": "BEFORE",
    "sqlite": "CREATE TRIGGER order_customer_service_fees_no_replace BEFORE INSERT ON order_customer_service_fees WHEN EXISTS(SELECT 1 FROM order_customer_service_fees WHERE order_id=NEW.order_id) BEGIN SELECT RAISE(ABORT,'customer_fee_snapshot_immutable'); END;",
    "mariadb": "BEGIN IF EXISTS(SELECT 1 FROM order_customer_service_fees WHERE order_id=NEW.order_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_snapshot_immutable'; END IF; END"
  },
  "customer_fee_waiver_revisions_no_update": {
    "table": "customer_fee_waiver_revisions",
    "event": "UPDATE",
    "timing": "BEFORE",
    "sqlite": "CREATE TRIGGER customer_fee_waiver_revisions_no_update BEFORE UPDATE ON customer_fee_waiver_revisions BEGIN SELECT RAISE(ABORT,'customer_fee_waiver_revision_immutable'); END;",
    "mariadb": "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_revision_immutable'"
  },
  "customer_fee_waiver_revisions_no_delete": {
    "table": "customer_fee_waiver_revisions",
    "event": "DELETE",
    "timing": "BEFORE",
    "sqlite": "CREATE TRIGGER customer_fee_waiver_revisions_no_delete BEFORE DELETE ON customer_fee_waiver_revisions BEGIN SELECT RAISE(ABORT,'customer_fee_waiver_revision_immutable'); END;",
    "mariadb": "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_revision_immutable'"
  },
  "customer_fee_waiver_requests_no_update": {
    "table": "customer_fee_waiver_requests",
    "event": "UPDATE",
    "timing": "BEFORE",
    "sqlite": "CREATE TRIGGER customer_fee_waiver_requests_no_update BEFORE UPDATE ON customer_fee_waiver_requests BEGIN SELECT RAISE(ABORT,'customer_fee_waiver_request_immutable'); END;",
    "mariadb": "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_request_immutable'"
  },
  "customer_fee_waiver_requests_no_delete": {
    "table": "customer_fee_waiver_requests",
    "event": "DELETE",
    "timing": "BEFORE",
    "sqlite": "CREATE TRIGGER customer_fee_waiver_requests_no_delete BEFORE DELETE ON customer_fee_waiver_requests BEGIN SELECT RAISE(ABORT,'customer_fee_waiver_request_immutable'); END;",
    "mariadb": "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_request_immutable'"
  },
  "customer_fee_waiver_campaigns_no_delete": {
    "table": "customer_fee_waiver_campaigns",
    "event": "DELETE",
    "timing": "BEFORE",
    "sqlite": "CREATE TRIGGER customer_fee_waiver_campaigns_no_delete BEFORE DELETE ON customer_fee_waiver_campaigns BEGIN SELECT RAISE(ABORT,'customer_fee_waiver_campaign_retained'); END;",
    "mariadb": "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_waiver_campaign_retained'"
  },
  "order_customer_service_fees_no_update": {
    "table": "order_customer_service_fees",
    "event": "UPDATE",
    "timing": "BEFORE",
    "sqlite": "CREATE TRIGGER order_customer_service_fees_no_update BEFORE UPDATE ON order_customer_service_fees BEGIN SELECT RAISE(ABORT,'customer_fee_snapshot_immutable'); END;",
    "mariadb": "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_snapshot_immutable'"
  },
  "order_customer_service_fees_no_delete": {
    "table": "order_customer_service_fees",
    "event": "DELETE",
    "timing": "BEFORE",
    "sqlite": "CREATE TRIGGER order_customer_service_fees_no_delete BEFORE DELETE ON order_customer_service_fees BEGIN SELECT RAISE(ABORT,'customer_fee_snapshot_immutable'); END;",
    "mariadb": "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_snapshot_immutable'"
  },
  "order_customer_service_fees_match_order": {
    "table": "order_customer_service_fees",
    "event": "INSERT",
    "timing": "BEFORE",
    "sqlite": "CREATE TRIGGER order_customer_service_fees_match_order BEFORE INSERT ON order_customer_service_fees WHEN NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND buyer_platform_fee_paisa=NEW.net_paisa) BEGIN SELECT RAISE(ABORT,'customer_fee_order_mismatch'); END;",
    "mariadb": "BEGIN IF NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND buyer_platform_fee_paisa=NEW.net_paisa) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_order_mismatch'; END IF; END"
  },
  "orders_preserve_customer_service_fee": {
    "table": "orders",
    "event": "UPDATE",
    "timing": "BEFORE",
    "sqlite": "CREATE TRIGGER orders_preserve_customer_service_fee BEFORE UPDATE ON orders WHEN EXISTS(SELECT 1 FROM order_customer_service_fees WHERE order_id=OLD.id AND (NEW.id<>OLD.id OR net_paisa<>NEW.buyer_platform_fee_paisa)) BEGIN SELECT RAISE(ABORT,'customer_fee_order_mismatch'); END;",
    "mariadb": "BEGIN IF EXISTS(SELECT 1 FROM order_customer_service_fees WHERE order_id=OLD.id AND (NEW.id<>OLD.id OR net_paisa<>NEW.buyer_platform_fee_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_order_mismatch'; END IF; END"
  }
});
export const customerFeeRequiredExactChecks = Object.freeze({
  "customer_fee_waiver_control.revision": "revision BETWEEN 0 AND 9007199254740991",
  "customer_fee_waiver_campaigns.revision": "revision BETWEEN 1 AND 9007199254740991",
  "customer_fee_waiver_campaigns.created_at": "created_at BETWEEN 0 AND 9007199254740991",
  "customer_fee_waiver_campaigns.updated_at": "updated_at BETWEEN 0 AND 9007199254740991",
  "customer_fee_waiver_revisions.revision": "revision BETWEEN 1 AND 9007199254740991",
  "customer_fee_waiver_revisions.starts_at": "starts_at BETWEEN 0 AND 9007199254740991",
  "customer_fee_waiver_revisions.ends_at": "ends_at BETWEEN 1 AND 9007199254740991 AND ends_at > starts_at",
  "customer_fee_waiver_revisions.created_at": "created_at BETWEEN 0 AND 9007199254740991",
  "customer_fee_waiver_requests.created_at": "created_at BETWEEN 0 AND 9007199254740991",
  "order_customer_service_fees.standard_paisa": "standard_paisa BETWEEN 0 AND 9007199254740991",
  "order_customer_service_fees.waived_paisa": "waived_paisa BETWEEN 0 AND 9007199254740991",
  "order_customer_service_fees.net_paisa": "net_paisa BETWEEN 0 AND 9007199254740991",
  "order_customer_service_fees.created_at": "created_at BETWEEN 0 AND 9007199254740991",
  "customer_fee_waiver_control.id": "id = 'default'",
  "customer_fee_waiver_revisions.state": "state IN ('draft','published','paused','ended')",
  "customer_fee_waiver_revisions.name": "CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 100",
  "customer_fee_waiver_revisions.description": "CHAR_LENGTH(description) <= 1000",
  "customer_fee_waiver_requests.request_id": "CHAR_LENGTH(request_id) BETWEEN 1 AND 191",
  "customer_fee_waiver_requests.command_json": "JSON_VALID(command_json) AND JSON_TYPE(command_json) = 'OBJECT'",
  "customer_fee_waiver_requests.response_json": "JSON_VALID(response_json) AND JSON_TYPE(response_json) = 'OBJECT'",
  "order_customer_service_fees.policy_enabled": "policy_enabled IN (0,1)",
  "order_customer_service_fees.policy_amount_paisa": "policy_amount_paisa BETWEEN 0 AND 100000",
  "order_customer_service_fees.campaign_revision": "campaign_revision IS NULL OR campaign_revision BETWEEN 1 AND 9007199254740991",
  "order_customer_service_fees.customer_fee_policy_standard": "policy_enabled = 1 AND standard_paisa = policy_amount_paisa OR policy_enabled = 0 AND standard_paisa = 0",
  "order_customer_service_fees.customer_fee_reconciled": "standard_paisa - waived_paisa = net_paisa",
  "order_customer_service_fees.customer_fee_full_waiver": "campaign_id IS NULL AND campaign_revision IS NULL AND waived_paisa = 0 OR campaign_id IS NOT NULL AND campaign_revision IS NOT NULL AND standard_paisa > 0 AND waived_paisa = standard_paisa AND net_paisa = 0"
});
export const customerFeeRequiredForeignKeys = Object.freeze({
  "customer_fee_waiver_revisions.customer_fee_revision_campaign_fk": {
    "columns": [
      "campaign_id"
    ],
    "referencedTable": "customer_fee_waiver_campaigns",
    "referencedColumns": [
      "id"
    ]
  },
  "customer_fee_waiver_revisions.customer_fee_revision_actor_fk": {
    "columns": [
      "created_by"
    ],
    "referencedTable": "users",
    "referencedColumns": [
      "id"
    ]
  },
  "customer_fee_waiver_requests.customer_fee_request_actor_fk": {
    "columns": [
      "actor_id"
    ],
    "referencedTable": "users",
    "referencedColumns": [
      "id"
    ]
  },
  "order_customer_service_fees.customer_fee_evidence_order_fk": {
    "columns": [
      "order_id"
    ],
    "referencedTable": "orders",
    "referencedColumns": [
      "id"
    ]
  },
  "order_customer_service_fees.customer_fee_evidence_revision_fk": {
    "columns": [
      "campaign_id",
      "campaign_revision"
    ],
    "referencedTable": "customer_fee_waiver_revisions",
    "referencedColumns": [
      "campaign_id",
      "revision"
    ]
  }
});
export const customerFeeRequiredUniqueIndexes = Object.freeze({
  "customer_fee_waiver_control.PRIMARY": [
    "id"
  ],
  "customer_fee_waiver_campaigns.PRIMARY": [
    "id"
  ],
  "customer_fee_waiver_revisions.PRIMARY": [
    "campaign_id",
    "revision"
  ],
  "customer_fee_waiver_revisions.request_id": [
    "request_id"
  ],
  "customer_fee_waiver_requests.PRIMARY": [
    "request_id"
  ],
  "order_customer_service_fees.PRIMARY": [
    "order_id"
  ]
});
export const customerFeeRequiredColumnCollations = Object.freeze({
  "customer_fee_waiver_campaigns.id": "utf8mb4_bin",
  "customer_fee_waiver_revisions.campaign_id": "utf8mb4_bin",
  "customer_fee_waiver_revisions.request_id": "utf8mb4_bin",
  "customer_fee_waiver_requests.request_id": "utf8mb4_bin",
  "order_customer_service_fees.campaign_id": "utf8mb4_bin",
  "customer_fee_waiver_revisions.created_by": "utf8mb4_unicode_ci",
  "customer_fee_waiver_requests.actor_id": "utf8mb4_unicode_ci",
  "order_customer_service_fees.order_id": "utf8mb4_unicode_ci",
  "orders.id": "utf8mb4_unicode_ci"
});
export const customerFeeRecoveryMinimumRows = Object.freeze({
  "customer_fee_waiver_control": 1,
  "customer_fee_waiver_campaigns": 1,
  "customer_fee_waiver_revisions": 2,
  "customer_fee_waiver_requests": 2,
  "order_customer_service_fees": 1
});

