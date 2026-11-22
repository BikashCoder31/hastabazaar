import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { inspectReadiness } from '../lib/operations/readiness';
import manifest from '../deployment/babal/release-manifest.json';
import nativeFeeMetadata from './helpers/mariadb-fee-readiness-metadata.json';

type Requirements = typeof manifest & {
  requiredForeignKeys: Record<string, { columns: string[]; referencedTable: string; referencedColumns: string[] }>;
  requiredTriggerShapes: Record<string, { table: string; event: string; timing: string }>;
};

// Metadata fixture for the inspector only. Real native execution lives in
// fee-waiver-native.test.ts and is mandatory in verify-staging-native.mjs.
function metadataFixture(change = (rows: Record<string, unknown>[], _sql: string) => rows) {
  const m = manifest as Requirements;
  return { dialect: 'mariadb', prepare(sql: string) { return { async all() {
    let rows: Record<string, unknown>[] = [];
    if (sql.includes('information_schema.COLUMNS')) rows = Object.entries(m.requiredTables).flatMap(([tableName, columns]) => columns.map(columnName => ({ tableName, columnName, generationExpression: m.requiredGeneratedColumns[`${tableName}.${columnName}` as keyof typeof m.requiredGeneratedColumns]?.[0] ?? '', collation: m.requiredColumnCollations[`${tableName}.${columnName}` as keyof typeof m.requiredColumnCollations] ?? 'utf8mb4_unicode_ci' })));
    else if (sql.includes('information_schema.STATISTICS')) rows = Object.entries(m.requiredUniqueIndexes).flatMap(([key, columns]) => columns.map((columnName, i) => ({ tableName: key.split('.')[0], name: key.split('.')[1], columnName, position: i + 1, nonUnique: 0, prefixLength: null })));
    else if (sql.includes('information_schema.TRIGGERS')) rows = Object.entries(m.requiredTriggers).map(([name, fragments]) => ({ name, definition: nativeFeeMetadata.triggers.find(row => row.name === name)?.definition ?? (fragments.join(' ') || 'SIGNAL SQLSTATE'), tableName: m.requiredTriggerShapes?.[name]?.table, event: m.requiredTriggerShapes?.[name]?.event, timing: m.requiredTriggerShapes?.[name]?.timing }));
    else if (sql.includes('information_schema.CHECK_CONSTRAINTS')) rows = Object.entries(m.requiredChecks).map(([key, fragments]) => nativeFeeMetadata.checks.find(row => row.tableName + '.' + row.name === key) ?? ({ tableName: key.split('.')[0], name: key.split('.')[1], definition: fragments.join(' ') }));
    else if (sql.includes('information_schema.KEY_COLUMN_USAGE')) rows = Object.entries(m.requiredForeignKeys ?? {}).flatMap(([key, fk]) => fk.columns.map((columnName, i) => ({ tableName: key.split('.')[0], name: key.split('.')[1], columnName, position: i + 1, referencedTable: fk.referencedTable, referencedColumn: fk.referencedColumns[i], referencedSchema: 'fixture', databaseName: 'fixture', deleteRule: 'RESTRICT', updateRule: 'RESTRICT' })));
    else if (sql.includes('FROM marketplace_fee_waiver_control') || sql.includes('FROM customer_fee_waiver_control')) rows = [{ id: 'default', revision: 0 }];
    return { results: change(rows, sql) };
  } }; } } as unknown as D1Database;
}

void test('fee packaging requires exact base/additive definitions and meaningful financial readiness evidence', async () => {
  const sql = (await readFile(new URL('../deployment/babal/mariadb-marketplace-fee-waivers.sql', import.meta.url), 'utf8')).trim();
  const base = await readFile(new URL('../deployment/babal/mariadb-schema.sql', import.meta.url), 'utf8');
  assert.ok(base.includes(sql), 'fresh schema must embed the canonical additive fee source');
  const m = manifest as Requirements;
  assert.ok(m.requiredChecks['order_item_marketplace_fees.marketplace_fee_reconciled' as keyof typeof m.requiredChecks]);
  assert.ok(m.requiredChecks['order_item_marketplace_fees.marketplace_fee_full_waiver' as keyof typeof m.requiredChecks]);
  assert.equal(m.requiredColumnCollations['marketplace_fee_waiver_campaigns.id' as keyof typeof m.requiredColumnCollations], 'utf8mb4_bin');
  assert.ok(m.requiredForeignKeys?.['order_item_marketplace_fees.fee_evidence_revision_fk']);
  assert.deepEqual(m.requiredTriggerShapes?.order_item_marketplace_fees_no_update, { table: 'order_item_marketplace_fees', event: 'UPDATE', timing: 'BEFORE' });
});

void test('customer packaging requires the additive source, exact financial predicates, references and binary identities', async () => {
  const sql = (await readFile(new URL('../deployment/babal/mariadb-customer-service-fee-waivers.sql', import.meta.url), 'utf8').catch(() => '')).trim();
  assert.ok(sql, 'customer companion is required');
  const base = await readFile(new URL('../deployment/babal/mariadb-schema.sql', import.meta.url), 'utf8');
  assert.ok(base.includes(sql));
  const m = manifest as Requirements;
  assert.equal(m.release, 'local-unversioned-candidate');
  for (const name of ['customer_fee_reconciled','customer_fee_full_waiver','customer_fee_policy_standard'])
    assert.ok(m.requiredChecks[`order_customer_service_fees.${name}` as keyof typeof m.requiredChecks]);
  assert.equal(m.requiredColumnCollations['customer_fee_waiver_campaigns.id' as keyof typeof m.requiredColumnCollations], 'utf8mb4_bin');
  assert.ok(m.requiredForeignKeys['order_customer_service_fees.customer_fee_evidence_revision_fk']);
  assert.deepEqual(m.requiredTriggerShapes.order_customer_service_fees_match_order, { table: 'order_customer_service_fees', event: 'INSERT', timing: 'BEFORE' });
});

void test('native customer readiness rejects missing control, weakened predicates and a disabled net-match trigger', async () => {
  assert.deepEqual(await inspectReadiness(metadataFixture()), { ready: true, missing: [] });
  for (const [expected, change] of [
    ['control:customer_fee_waiver_control.default', (rows: Record<string, unknown>[], sql: string) => sql.includes('FROM customer_fee_waiver_control') ? [] : rows],
    ['control-version:customer_fee_waiver_control.default', (rows: Record<string, unknown>[], sql: string) => sql.includes('FROM customer_fee_waiver_control') ? [{ id: 'default', revision: -1 }] : rows],
    ['column-collation:customer_fee_waiver_campaigns.id', (rows: Record<string, unknown>[], sql: string) => sql.includes('information_schema.COLUMNS') ? rows.map(row => row.tableName === 'customer_fee_waiver_campaigns' && row.columnName === 'id' ? { ...row, collation: 'utf8mb4_unicode_ci' } : row) : rows],
    ['trigger-version:order_customer_service_fees_match_order', (rows: Record<string, unknown>[], sql: string) => sql.includes('information_schema.TRIGGERS') ? rows.map(row => row.name === 'order_customer_service_fees_match_order' ? { ...row, definition: "BEGIN IF 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='customer_fee_order_mismatch'; END IF; END" } : row) : rows],
    ['check-version:order_customer_service_fees.customer_fee_full_waiver', (rows: Record<string, unknown>[], sql: string) => sql.includes('information_schema.CHECK_CONSTRAINTS') ? rows.map(row => row.tableName === 'order_customer_service_fees' && row.name === 'customer_fee_full_waiver' ? { ...row, definition: String(row.definition) + ' OR 1 = 1' } : row) : rows],
  ] as const) {
    const state = await inspectReadiness(metadataFixture(change));
    assert.ok(state.missing.includes(expected), expected + ': ' + state.missing.join(','));
  }
});

void test('native readiness requires all replacement guards with their complete conflict identities', async () => {
  const m = manifest as Requirements;
  for (const [name, table] of [
    ['customer_fee_waiver_revisions_no_replace','customer_fee_waiver_revisions'],
    ['customer_fee_waiver_requests_no_replace','customer_fee_waiver_requests'],
    ['order_customer_service_fees_no_replace','order_customer_service_fees'],
  ] as const) {
    assert.deepEqual(m.requiredTriggerShapes[name], { table, event: 'INSERT', timing: 'BEFORE' });
    const state = await inspectReadiness(metadataFixture((rows, sql) => sql.includes('information_schema.TRIGGERS') ? rows.filter(row => row.name !== name) : rows));
    assert.ok(state.missing.includes('trigger:' + name));
  }
  const name = 'customer_fee_waiver_revisions_no_replace';
  const state = await inspectReadiness(metadataFixture((rows, sql) => sql.includes('information_schema.TRIGGERS') ? rows.map(row => row.name === name ? { ...row, definition: String(row.definition).replace(' OR request_id=NEW.request_id', '') } : row) : rows));
  assert.ok(state.missing.includes('trigger-version:' + name), 'the separate unique request identity must remain guarded');
});

void test('native fee checks reject token-preserving changes to every complete predicate', async () => {
  assert.deepEqual(await inspectReadiness(metadataFixture()), { ready: true, missing: [] });
  for (const expected of nativeFeeMetadata.checks) {
    const definition = expected.definition;
    const broken = definition.includes(' between ')
      ? definition.replace(' between ', ' not between ')
      : definition.includes(' in ')
        ? definition.replace(' in ', ' not in ')
        : definition.includes(' <= ')
          ? definition.replace(' <= ', ' >= ')
          : definition.includes(' > ')
            ? definition.replace(' > ', ' < ')
            : definition.replace(' = ', ' <> ');
    assert.notEqual(broken, definition);
    const state = await inspectReadiness(metadataFixture((rows, sql) => sql.includes('information_schema.CHECK_CONSTRAINTS') ? rows.map(row => row.tableName === expected.tableName && row.name === expected.name ? { ...row, definition: broken } : row) : rows));
    assert.ok(state.missing.includes(`check-version:${expected.tableName}.${expected.name}`), `${expected.tableName}.${expected.name} accepted ${broken}`);
  }
});

void test('fee boolean predicates retain grouping and reject an added OR that weakens the invariant', async () => {
  const expected = nativeFeeMetadata.checks.find(row => row.name === 'marketplace_fee_full_waiver')!;
  for (const broken of [
    '(' + expected.definition + ') OR 1 = 1',
    expected.definition.replace('`campaign_id` is null and ', '`campaign_id` is null and (') + ')',
  ]) {
    const state = await inspectReadiness(metadataFixture((rows, sql) => sql.includes('information_schema.CHECK_CONSTRAINTS') ? rows.map(row => row.name === expected.name ? { ...row, definition: broken } : row) : rows));
    assert.ok(state.missing.includes('check-version:order_item_marketplace_fees.marketplace_fee_full_waiver'));
  }
});

void test('native fee immutable triggers reject IF 0, extra statements and altered literal case while allowing formatting', async () => {
  const formatting = await inspectReadiness(metadataFixture((rows, sql) => sql.includes('information_schema.TRIGGERS') ? rows.map(row => String(row.name).startsWith('marketplace_fee_waiver_') || String(row.name).startsWith('order_item_marketplace_fees_') ? { ...row, definition: String(row.definition).replace('SIGNAL SQLSTATE', 'signal\n sqlstate').replace('MESSAGE_TEXT=', '`MESSAGE_TEXT` = ') + ';' } : row) : rows));
  assert.deepEqual(formatting, { ready: true, missing: [] });
  for (const guard of nativeFeeMetadata.triggers) {
    for (const definition of [`BEGIN IF 0 THEN ${guard.definition}; END IF; END`, `${guard.definition}; SET @extra=1`, guard.definition.replace('immutable', 'IMMUTABLE').replace('retained', 'RETAINED').replace('mismatch', 'MISMATCH')]) {
      const state = await inspectReadiness(metadataFixture((rows, sql) => sql.includes('information_schema.TRIGGERS') ? rows.map(row => row.name === guard.name ? { ...row, definition } : row) : rows));
      assert.ok(state.missing.includes(`trigger-version:${guard.name}`), `${guard.name} accepted ${definition}`);
    }
  }
});

void test('native fee readiness rejects absent or malformed control, collation, unique identity, constraints, references and ineffective guards', async () => {
  assert.deepEqual(await inspectReadiness(metadataFixture()), { ready: true, missing: [] });
  for (const [label, change] of [
    ['control', (rows: Record<string, unknown>[], sql: string) => sql.includes('FROM marketplace_fee_waiver_control') ? [] : rows],
    ['control-version', (rows: Record<string, unknown>[], sql: string) => sql.includes('FROM marketplace_fee_waiver_control') ? [{ id: 'default', revision: -1 }] : rows],
    ['control-version', (rows: Record<string, unknown>[], sql: string) => sql.includes('FROM marketplace_fee_waiver_control') ? [{ id: 'default', revision: null }] : rows],
    ['column-collation', (rows: Record<string, unknown>[], sql: string) => sql.includes('information_schema.COLUMNS') ? rows.map(row => row.tableName === 'marketplace_fee_waiver_campaigns' && row.columnName === 'id' ? { ...row, collation: 'utf8mb4_unicode_ci' } : row) : rows],
    ['index', (rows: Record<string, unknown>[], sql: string) => sql.includes('information_schema.STATISTICS') ? rows.filter(row => row.tableName !== 'marketplace_fee_waiver_requests') : rows],
    ['check', (rows: Record<string, unknown>[], sql: string) => sql.includes('information_schema.CHECK_CONSTRAINTS') ? rows.filter(row => row.tableName !== 'order_item_marketplace_fees') : rows],
    ['foreign-key-version', (rows: Record<string, unknown>[], sql: string) => sql.includes('information_schema.KEY_COLUMN_USAGE') ? rows.map(row => ({ ...row, deleteRule: 'CASCADE' })) : rows],
    ['trigger-version', (rows: Record<string, unknown>[], sql: string) => sql.includes('information_schema.TRIGGERS') ? rows.map(row => row.name === 'order_item_marketplace_fees_no_update' ? { ...row, definition: 'SET @noop=1' } : row) : rows],
    ['trigger-shape', (rows: Record<string, unknown>[], sql: string) => sql.includes('information_schema.TRIGGERS') ? rows.map(row => row.name === 'order_item_marketplace_fees_no_update' ? { ...row, event: 'INSERT' } : row) : rows],
  ] as const) {
    const state = await inspectReadiness(metadataFixture(change));
    assert.equal(state.ready, false, label);
    assert.ok(state.missing.some(key => key.startsWith(label + ':')), `${label}: ${state.missing.join(',')}`);
  }
});

