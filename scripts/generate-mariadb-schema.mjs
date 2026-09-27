import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = resolve(projectRoot, 'drizzle/meta/0020_snapshot.json');
const outputPath = resolve(projectRoot, 'deployment/babal/mariadb-schema.sql');
const recoveryOutputPath = resolve(
  projectRoot,
  'deployment/babal/mariadb-reset-empty-import.sql',
);
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const sellerParticipationSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-seller-participation.sql'),
  'utf8',
);
const managedCommerceSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-managed-commerce.sql'),
  'utf8',
);
const productStoryMaterialsSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-product-story-materials.sql'),
  'utf8',
);
const checkoutRecipientSnapshotsSql = await readFile(
  resolve(
    projectRoot,
    'deployment/babal/mariadb-checkout-recipient-snapshots.sql',
  ),
  'utf8',
);
const sellerGovernanceSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-seller-governance.sql'),
  'utf8',
);
const firstPartyAnalyticsSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-first-party-analytics.sql'),
  'utf8',
);
const invoiceAdjustmentsSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-invoice-adjustments.sql'),
  'utf8',
);
const riderOpenBoxFinanceSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-rider-open-box-finance.sql'),
  'utf8',
);
const recentlyViewedSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-recently-viewed.sql'),
  'utf8',
);
const managedFixedSupplySql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-managed-fixed-supply.sql'),
  'utf8',
);
const formCatalogSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-form-catalog.sql'),
  'utf8',
);
const dataRightsLegalHoldsSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-data-rights-legal-holds.sql'),
  'utf8',
);
const addressAnswerOwnerTombstonesSql = await readFile(
  resolve(projectRoot, 'deployment/babal/mariadb-address-answer-owner-tombstones.sql'),
  'utf8',
);

const quote = (value) => `\`${String(value).replaceAll('`', '``')}\``;

function identifier(value) {
  if (value.length <= 64) return value;
  const suffix = createHash('sha256').update(value).digest('hex').slice(0, 10);
  return `${value.slice(0, 53)}_${suffix}`;
}

function indexedTextColumns(table) {
  const names = new Set();
  for (const column of Object.values(table.columns)) {
    if (column.primaryKey) names.add(column.name);
  }
  for (const index of Object.values(table.indexes ?? {})) {
    for (const column of index.columns) names.add(column);
  }
  for (const key of Object.values(table.foreignKeys ?? {})) {
    for (const column of key.columnsFrom) names.add(column);
    for (const column of key.columnsTo) names.add(column);
  }
  for (const key of Object.values(table.compositePrimaryKeys ?? {})) {
    for (const column of key.columns) names.add(column);
  }
  return names;
}

function columnType(column, compactText) {
  if (column.type === 'integer') return 'BIGINT';
  if (column.type === 'text') {
    if (compactText.has(column.name)) return 'VARCHAR(191)';
    return 'LONGTEXT';
  }
  throw new Error(`Unsupported SQLite column type: ${column.type}`);
}

function defaultSql(value) {
  if (value === undefined) return '';
  if (value === true) return ' DEFAULT 1';
  if (value === false) return ' DEFAULT 0';
  return ` DEFAULT ${value}`;
}

function checkExpression(tableName, expression) {
  return expression.replace(
    new RegExp(`"${tableName}"\\."([^"]+)"`, 'g'),
    (_, column) => quote(column),
  );
}

function checkConflictsWithForeignKeyAction(table, check) {
  return Object.values(table.foreignKeys ?? {}).some((key) => {
    const changesColumn =
      key.onDelete === 'set null' ||
      key.onDelete === 'cascade' ||
      key.onUpdate === 'set null' ||
      key.onUpdate === 'cascade';
    return (
      changesColumn &&
      key.columnsFrom.some((column) => check.value.includes(`"${column}"`))
    );
  });
}

function generatedColumns(tableName) {
  if (tableName === 'staff_invitations') {
    return [
      "`pending_email_key` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `status` = 'pending' THEN `email` ELSE NULL END) STORED",
    ];
  }
  if (tableName === 'payout_entries') {
    return [
      '`active_ledger_entry_key` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `released_at` IS NULL THEN `ledger_entry_id` ELSE NULL END) STORED',
    ];
  }
  if (tableName === 'seller_ledger_entries') {
    const active =
      "`order_item_id` IS NOT NULL AND `type` IN ('sale', 'commission', 'reserve_hold', 'reserve_release')";
    return [
      `\`active_order_item_key\` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN ${active} THEN \`order_item_id\` ELSE NULL END) STORED`,
      `\`active_order_item_type\` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN ${active} THEN \`type\` ELSE NULL END) STORED`,
    ];
  }
  return [];
}

function generatedIndexes(tableName) {
  if (tableName === 'staff_invitations') {
    return [
      'UNIQUE KEY `idx_staff_invitations_pending_email_unique` (`pending_email_key`)',
    ];
  }
  if (tableName === 'payout_entries') {
    return [
      'UNIQUE KEY `idx_payout_entries_active_ledger_unique` (`active_ledger_entry_key`)',
    ];
  }
  if (tableName === 'seller_ledger_entries') {
    return [
      'UNIQUE KEY `idx_seller_ledger_order_item_type_unique` (`active_order_item_key`, `active_order_item_type`)',
    ];
  }
  return [];
}

const output = [
  '-- Hatsabazaar production schema for MariaDB 10.11+',
  '-- Generated from drizzle/meta/0020_snapshot.json. Import into an empty database.',
  'SET NAMES utf8mb4;',
  "SET time_zone = '+00:00';",
  'SET FOREIGN_KEY_CHECKS = 0;',
  '',
];
const foreignKeys = [];

for (const [tableName, table] of Object.entries(snapshot.tables)) {
  const compactText = indexedTextColumns(table);
  const definitions = [];
  for (const column of Object.values(table.columns)) {
    definitions.push(
      [
        quote(column.name),
        columnType(column, compactText),
        column.notNull ? 'NOT NULL' : 'NULL',
        defaultSql(column.default).trim(),
      ]
        .filter(Boolean)
        .join(' '),
    );
  }
  definitions.push(...generatedColumns(tableName));

  const primaryColumns = Object.values(table.columns)
    .filter((column) => column.primaryKey)
    .map((column) => column.name);
  if (primaryColumns.length > 0) {
    definitions.push(`PRIMARY KEY (${primaryColumns.map(quote).join(', ')})`);
  }
  for (const key of Object.values(table.compositePrimaryKeys ?? {})) {
    definitions.push(`PRIMARY KEY (${key.columns.map(quote).join(', ')})`);
  }
  for (const index of Object.values(table.indexes ?? {})) {
    if (index.where) continue;
    definitions.push(
      `${index.isUnique ? 'UNIQUE ' : ''}KEY ${quote(index.name)} (${index.columns.map(quote).join(', ')})`,
    );
  }
  definitions.push(...generatedIndexes(tableName));
  for (const check of Object.values(table.checkConstraints ?? {})) {
    if (checkConflictsWithForeignKeyAction(table, check)) {
      output.push(
        `-- ${check.name} is enforced by application transactions because MariaDB 10.11 rejects CHECK columns changed by SET NULL/CASCADE foreign-key actions.`,
      );
      continue;
    }
    definitions.push(
      `CONSTRAINT ${quote(check.name)} CHECK (${checkExpression(tableName, check.value)})`,
    );
  }

  output.push(
    `CREATE TABLE IF NOT EXISTS ${quote(tableName)} (`,
    definitions.map((definition) => `  ${definition}`).join(',\n'),
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    '',
  );

  for (const key of Object.values(table.foreignKeys ?? {})) {
    foreignKeys.push(
      `ALTER TABLE ${quote(key.tableFrom)} ADD CONSTRAINT ${quote(identifier(key.name))} FOREIGN KEY (${key.columnsFrom.map(quote).join(', ')}) REFERENCES ${quote(key.tableTo)} (${key.columnsTo.map(quote).join(', ')}) ON DELETE ${key.onDelete.toUpperCase()} ON UPDATE ${key.onUpdate.toUpperCase()};`,
    );
  }
}

output.push(
  '-- Versioned business configuration. Values are validated by the typed application registry.',
  'CREATE TABLE IF NOT EXISTS `business_setting_versions` (',
  '  `id` VARCHAR(191) NOT NULL,',
  '  `setting_key` VARCHAR(191) NOT NULL,',
  '  `version` BIGINT NOT NULL,',
  '  `value_json` LONGTEXT NOT NULL,',
  "  `status` VARCHAR(32) NOT NULL DEFAULT 'draft',",
  '  `revision` BIGINT NOT NULL DEFAULT 1,',
  '  `change_control` VARCHAR(32) NOT NULL,',
  '  `effective_from` BIGINT NULL,',
  '  `effective_until` BIGINT NULL,',
  '  `reason` LONGTEXT NOT NULL,',
  '  `created_by` VARCHAR(191) NOT NULL,',
  '  `created_at` BIGINT NOT NULL,',
  '  `submitted_by` VARCHAR(191) NULL,',
  '  `submitted_at` BIGINT NULL,',
  '  `approved_by` VARCHAR(191) NULL,',
  '  `approved_at` BIGINT NULL,',
  '  `published_by` VARCHAR(191) NULL,',
  '  `published_at` BIGINT NULL,',
  '  `decision_note` LONGTEXT NULL,',
  '  `supersedes_id` VARCHAR(191) NULL,',
  '  `last_request_id` VARCHAR(191) NOT NULL,',
  '  PRIMARY KEY (`id`),',
  '  UNIQUE KEY `idx_business_setting_versions_key_version` (`setting_key`, `version`),',
  '  UNIQUE KEY `idx_business_setting_versions_request` (`last_request_id`),',
  '  KEY `idx_business_setting_versions_effective` (`setting_key`, `status`, `effective_from`, `effective_until`),',
  '  KEY `idx_business_setting_versions_review` (`status`, `created_at`),',
  "  CONSTRAINT `business_setting_versions_status` CHECK (`status` IN ('draft', 'pending_approval', 'published', 'rejected', 'cancelled')),",
  '  CONSTRAINT `business_setting_versions_revision` CHECK (`revision` >= 1),',
  "  CONSTRAINT `business_setting_versions_control` CHECK (`change_control` IN ('simple', 'controlled')),",
  '  CONSTRAINT `business_setting_versions_interval` CHECK (`effective_until` IS NULL OR (`effective_from` IS NOT NULL AND `effective_until` > `effective_from`)),',
  '  CONSTRAINT `business_setting_versions_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,',
  '  CONSTRAINT `business_setting_versions_submitted_by_users_id_fk` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,',
  '  CONSTRAINT `business_setting_versions_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,',
  '  CONSTRAINT `business_setting_versions_published_by_users_id_fk` FOREIGN KEY (`published_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,',
  '  CONSTRAINT `business_setting_versions_supersedes_id_fk` FOREIGN KEY (`supersedes_id`) REFERENCES `business_setting_versions` (`id`) ON DELETE RESTRICT',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  '',
  'CREATE TABLE IF NOT EXISTS `business_setting_guards` (',
  '  `id` VARCHAR(191) NOT NULL,',
  '  `valid` BIGINT NOT NULL,',
  '  PRIMARY KEY (`id`),',
  '  CONSTRAINT `business_setting_guards_valid` CHECK (`valid` = 1)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  '',
  sellerParticipationSql.trim(),
  '',
  managedCommerceSql.trim(),
  '',
  productStoryMaterialsSql.trim(),
  '',
  checkoutRecipientSnapshotsSql.trim(),
  '',
  sellerGovernanceSql.trim(),
  '',
  firstPartyAnalyticsSql.trim(),
  '',
  invoiceAdjustmentsSql.trim(),
  '',
  riderOpenBoxFinanceSql.trim(),
  '',
  recentlyViewedSql.trim(),
  '',
  managedFixedSupplySql.trim(),
  '',
  formCatalogSql.trim(),
  dataRightsLegalHoldsSql.trim(),
  addressAnswerOwnerTombstonesSql.trim(),
  '',
  '-- Babal.Host password authentication and server-side sessions.',
  'CREATE TABLE IF NOT EXISTS `user_credentials` (',
  '  `user_id` VARCHAR(191) NOT NULL,',
  '  `password_hash` VARCHAR(191) NOT NULL,',
  '  `password_salt` VARCHAR(191) NOT NULL,',
  '  `password_version` BIGINT NOT NULL DEFAULT 1,',
  '  `created_at` BIGINT NOT NULL,',
  '  `updated_at` BIGINT NOT NULL,',
  '  PRIMARY KEY (`user_id`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  '',
  'CREATE TABLE IF NOT EXISTS `user_sessions` (',
  '  `token_hash` VARCHAR(64) NOT NULL,',
  '  `user_id` VARCHAR(191) NOT NULL,',
  '  `expires_at` BIGINT NOT NULL,',
  '  `created_at` BIGINT NOT NULL,',
  '  `last_seen_at` BIGINT NOT NULL,',
  '  PRIMARY KEY (`token_hash`),',
  '  KEY `idx_user_sessions_user` (`user_id`),',
  '  KEY `idx_user_sessions_expiry` (`expires_at`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  '',
  'CREATE TABLE IF NOT EXISTS `email_login_challenges` (',
  '  `token_hash` VARCHAR(64) NOT NULL,',
  '  `code_hash` VARCHAR(64) NOT NULL,',
  '  `user_id` VARCHAR(191) NOT NULL,',
  '  `attempts` BIGINT NOT NULL DEFAULT 0,',
  '  `expires_at` BIGINT NOT NULL,',
  '  `created_at` BIGINT NOT NULL,',
  '  `consumed_at` BIGINT NULL,',
  '  PRIMARY KEY (`token_hash`),',
  '  KEY `idx_email_login_challenges_user_created` (`user_id`, `created_at`),',
  '  KEY `idx_email_login_challenges_expiry` (`expires_at`),',
  '  CONSTRAINT `email_login_challenges_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  '',
  '-- Foreign keys are added after every table exists to support circular references.',
  ...foreignKeys,
  'ALTER TABLE `user_credentials` ADD CONSTRAINT `user_credentials_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;',
  'ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;',
  '',
  '-- Production-safe discovery taxonomy. No sample users, sellers, or products are inserted.',
  `INSERT IGNORE INTO \`categories\` (\`id\`, \`parent_id\`, \`slug\`, \`name_en\`, \`name_ne\`, \`is_active\`, \`sort_order\`, \`created_at\`, \`updated_at\`) VALUES
  ('cat-gifts', NULL, 'gifts', 'Gifts', 'उपहार', 1, 10, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-home-decor', NULL, 'home-decor', 'Home decor', 'गृह सजावट', 1, 20, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-jewelry-accessories', NULL, 'jewelry-accessories', 'Jewelry & accessories', 'गहना तथा सहायक सामग्री', 1, 30, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-traditional-textiles', NULL, 'traditional-textiles', 'Traditional textiles', 'परम्परागत कपडा', 1, 40, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-lifestyle', NULL, 'lifestyle', 'Lifestyle', 'जीवनशैली', 1, 50, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-art-paintings', NULL, 'art-paintings', 'Art & paintings', 'कला तथा चित्रकला', 1, 60, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-pottery', NULL, 'pottery', 'Pottery', 'माटोका भाँडा', 1, 70, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-wood-bamboo-craft', NULL, 'wood-bamboo-craft', 'Wood/bamboo craft', 'काठ तथा बाँसका हस्तकला', 1, 80, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-personalized-gifts', NULL, 'personalized-gifts', 'Personalized gifts', 'व्यक्तिगत उपहार', 1, 90, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('cat-corporate-gifting', NULL, 'corporate-gifting', 'Corporate gifting', 'संस्थागत उपहार', 1, 100, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000);`,
  '',
  `INSERT IGNORE INTO \`occasions\` (\`id\`, \`slug\`, \`name_en\`, \`name_ne\`, \`is_active\`, \`sort_order\`, \`created_at\`, \`updated_at\`) VALUES
  ('occasion-birthday', 'birthday-gifts', 'Birthday gifts', 'जन्मदिनका उपहार', 1, 10, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-wedding', 'wedding-gifts', 'Wedding gifts', 'विवाहका उपहार', 1, 20, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-dashain', 'dashain-gifts', 'Dashain gifts', 'दशैंका उपहार', 1, 30, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-tihar', 'tihar-gifts', 'Tihar gifts', 'तिहारका उपहार', 1, 40, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-mothers-day', 'mothers-day', 'Mother''s Day', 'आमाको मुख हेर्ने दिन', 1, 50, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-fathers-day', 'fathers-day', 'Father''s Day', 'बुबाको मुख हेर्ने दिन', 1, 60, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-anniversary', 'anniversary', 'Anniversary', 'वार्षिकोत्सव', 1, 70, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-corporate', 'corporate-gifts', 'Corporate gifts', 'संस्थागत उपहार', 1, 80, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-nepali-abroad', 'nepali-gifts-abroad', 'Nepali gifts abroad', 'विदेशमा नेपाली उपहार', 1, 90, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-housewarming', 'housewarming', 'Housewarming', 'गृहप्रवेशका उपहार', 1, 100, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('occasion-personalized', 'personalized-gifts', 'Personalized gifts', 'व्यक्तिगत उपहार', 1, 110, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000);`,
  '',
  'CREATE TABLE IF NOT EXISTS `hastabazaar_schema_versions` (',
  '  `version` VARCHAR(64) NOT NULL,',
  '  `applied_at` BIGINT NOT NULL,',
  '  PRIMARY KEY (`version`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  "INSERT IGNORE INTO `hastabazaar_schema_versions` (`version`, `applied_at`) VALUES ('0020_snapshot', UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000);",
  '',
  'SET FOREIGN_KEY_CHECKS = 1;',
  '',
);

await mkdir(dirname(outputPath), { recursive: true });
const schemaSql = output.join('\n');
await writeFile(outputPath, schemaSql, 'utf8');
const resetTables = [
  'address_answer_owner_tombstones',
  'data_rights_legal_holds',
  'form_answer_sets',
  'form_config_versions',
  'seller_agreement_acceptance_history',
  'seller_route_transition_applications',
  'managed_supplier_payments',
  'managed_supplier_adjustments',
  'managed_supplier_obligations',
  'managed_supply_records',
  'recently_viewed_products',
  'managed_invoice_adjustments',
  'traffic_events',
  'traffic_sessions',
  'seller_deletion_preflights',
  'seller_restriction_events',
  'seller_restrictions',
  'managed_invoice_groups',
  'managed_payout_entries',
  'managed_payouts',
  'managed_settlement_entries',
  'managed_entitlements',
  'managed_commercial_snapshots',
  'seller_profile_media',
  'seller_operational_addresses',
  'seller_participation_guards',
  'seller_participation_profiles',
  'business_setting_guards',
  'business_setting_versions',
  'email_login_challenges',
  'user_sessions',
  'user_credentials',
  'hastabazaar_schema_versions',
  ...Object.keys(snapshot.tables).reverse(),
];
const recoverySql = [
  '-- RECOVERY ONLY: clears the failed partial import in an otherwise empty database.',
  '-- Do not use this file after real users, products, orders, or uploads exist.',
  'SET FOREIGN_KEY_CHECKS = 0;',
  ...resetTables.map((table) => `DROP TABLE IF EXISTS ${quote(table)};`),
  '',
  schemaSql,
].join('\n');
await writeFile(recoveryOutputPath, recoverySql, 'utf8');
console.log(`Wrote ${outputPath}`);
console.log(`Wrote ${recoveryOutputPath}`);
