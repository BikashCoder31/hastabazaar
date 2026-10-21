import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { inspectReadiness } from '../lib/operations/readiness';
import manifest from '../deployment/babal/release-manifest.json';

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
    else if (sql.includes('information_schema.TRIGGERS')) rows = Object.entries(m.requiredTriggers).map(([name, fragments]) => ({ name, definition: fragments.join(' ') || 'SIGNAL SQLSTATE', tableName: m.requiredTriggerShapes?.[name]?.table, event: m.requiredTriggerShapes?.[name]?.event, timing: m.requiredTriggerShapes?.[name]?.timing }));
    else if (sql.includes('information_schema.CHECK_CONSTRAINTS')) rows = Object.entries(m.requiredChecks).map(([key, fragments]) => ({ tableName: key.split('.')[0], name: key.split('.')[1], definition: fragments.join(' ') }));
    else if (sql.includes('information_schema.KEY_COLUMN_USAGE')) rows = Object.entries(m.requiredForeignKeys ?? {}).flatMap(([key, fk]) => fk.columns.map((columnName, i) => ({ tableName: key.split('.')[0], name: key.split('.')[1], columnName, position: i + 1, referencedTable: fk.referencedTable, referencedColumn: fk.referencedColumns[i], referencedSchema: 'fixture', databaseName: 'fixture', deleteRule: 'RESTRICT', updateRule: 'RESTRICT' })));
    else if (sql.includes('FROM marketplace_fee_waiver_control')) rows = [{ id: 'default', revision: 0 }];
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

