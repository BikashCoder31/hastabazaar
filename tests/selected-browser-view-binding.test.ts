import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assertSelectedRecoveryViewBinding, bindSelectedBrowserViews, selectedViewPlan } from '../scripts/recovery/selected-native-views.mjs';
import { captureNativeInventory } from '../scripts/recovery/native-inventory.mjs';

const sourceName = 'native_456_fresh';
const columns = Object.fromEntries(Array.from({ length: 309 }, (_, index) => [`fictional.c${index}`, 'value >= 0']));
const manifest = { requiredExactChecks: columns };

function connectionFixture(names: string[]) {
  const statements: string[] = [];
  const server = { host: 'owned-maria-fixture', port: 3306, serverId: 1, definer: 'root@%' };
  let openedSchema: string | undefined;
  let viewDatabase = sourceName;
  let stopped = false;
  let duplicate = false;
  let interrupted: AbortController | undefined;
  let referenceNames = names;
  let change = '';
  const source = {
    connection: {},
    async query(sql: string) {
      if (sql.startsWith('SELECT DATABASE() name,')) return [[{ name: sourceName, connectionId: 11, ...server }]];
      return answer(sql, sourceName, names, change, viewDatabase);
    },
  };
  const reference = {
    connection: {},
    async query(statement: { sql: string }) {
      const sql = statement.sql;
      statements.push(sql);
      if (sql.startsWith('SELECT DATABASE() name,')) return [[{ name: openedSchema ?? sourceName, connectionId: 12, ...server }]];
      if (sql.startsWith('CREATE DATABASE')) {
        if (duplicate) throw new Error('schema already exists');
        openedSchema = sql.match(/`([^`]+)`/)?.[1];
        interrupted?.abort();
      }
      return answer(sql, openedSchema ?? sourceName, referenceNames);
    },
    async end() { stopped = true; },
  };
  function answer(sql: string, database: string, currentNames: string[], suffix = '', relationship = database) {
    if (sql === 'SELECT DATABASE() name') return [[{ name: database }]];
    if (sql.startsWith('SELECT @@collation_database')) return [[{ value: 'utf8mb4_unicode_ci' }]];
    if (sql.startsWith('SELECT CURRENT_USER() definer')) return [[{ definer: 'root@%' }]];
    if (sql.startsWith('SELECT @@foreign_key_checks')) return [[{ foreignKeys: 1, checksEnabled: 1 }]];
    if (sql.includes('information_schema.CHECK_CONSTRAINTS')) return [Object.entries(columns).map(([key, definition]) => ({ tableName: 'fictional', name: key.split('.')[1], definition }))];
    if (sql.includes('information_schema.VIEWS')) return [currentNames.map(name => ({ name, definer: 'root@%', securityType: 'DEFINER', checkOption: 'NONE', updatable: 'NO' }))];
    if (sql.includes('information_schema.TABLES')) return [currentNames.map(name => ({ name, kind: 'VIEW', engine: null }))];
    if (/information_schema\.(ROUTINES|EVENTS|TRIGGERS)/.test(sql)) return [[]];
    if (sql.startsWith('SHOW CREATE VIEW')) {
      return [[{ 'Create View': `CREATE VIEW ${sql.split(' ').at(-1)} AS SELECT val FROM \`${relationship}\`.\`fictional\`${suffix}`, character_set_client: 'utf8mb4', collation_connection: 'utf8mb4_unicode_ci' }]];
    }
    return [[]]; // Pinned SQL is applied only to the fake reference connection.
  }
  return {
    source, reference, statements,
    duplicate: () => { duplicate = true; },
    interrupt: (controller: AbortController) => { interrupted = controller; },
    drift: () => { change = ' WHERE val=0'; },
    crossDatabase: () => { viewDatabase = 'foreign_database'; },
    extraReferenceView: () => { referenceNames = [...referenceNames, 'unexpected']; },
    closed: () => stopped,
    createdSchema: () => openedSchema,
  };
}

void test('packaged browser inventory proves the exact selected views on its own socket without admitting unrelated views', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'hb-selected-browser-view-'));
  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    await promisify(execFile)(process.execPath, ['scripts/generate-mariadb-schema.mjs', '--output-directory=' + scratch], { cwd: root });
    const schema = await readFile(join(scratch, 'mariadb-schema.sql'));
    const selected = { schema, manifest, manifestSha256: 'c'.repeat(64) };
    const { names } = selectedViewPlan(selected);
    assert.equal(names.length, 12);
    const fixture = connectionFixture(names);
    await assert.rejects(captureNativeInventory(fixture.source), /Unreviewed views block native recovery/);
    const owned = async () => {};
    const bind = (db: ReturnType<typeof connectionFixture>, signal = new AbortController().signal) => bindSelectedBrowserViews({
      connection: db.source, openReference: async () => db.reference, database: sourceName, selected, assertOwned: owned, signal,
    });
    const binding = await bind(fixture);
    assert.equal((await captureNativeInventory(fixture.source, binding)).views, 12);
    assert.equal(fixture.closed(), true);
    const created = fixture.createdSchema();
    assert.ok(created && created !== sourceName);
    assert.deepEqual(fixture.statements.filter(sql => sql.startsWith('DROP DATABASE')), ['DROP DATABASE `' + created + '`']);
    await assert.rejects(captureNativeInventory(connectionFixture(names).source, binding), /Unexpected selected view source connection/);
    assert.throws(() => assertSelectedRecoveryViewBinding(binding.baseline, { connection: fixture.source, database: sourceName,
      containerId: 'a'.repeat(64), selected, archiveSha256: 'b'.repeat(64) }), /owned fresh bootstrap view baseline/);

    fixture.drift();
    await assert.rejects(captureNativeInventory(fixture.source, binding), /differs from the bootstrap/);
    fixture.crossDatabase();
    await assert.rejects(captureNativeInventory(fixture.source, binding), /Cross-schema/);

    const foreign = connectionFixture(names);
    foreign.extraReferenceView();
    await assert.rejects(bind(foreign), /view set differs/);
    assert.equal(foreign.closed(), true);
    const duplicate = connectionFixture(names);
    duplicate.duplicate();
    await assert.rejects(bind(duplicate), /schema already exists/);
    assert.equal(duplicate.statements.some(sql => sql.startsWith('DROP DATABASE')), false);

    const interrupted = connectionFixture(names), cancellation = new AbortController();
    interrupted.interrupt(cancellation);
    await assert.rejects(bind(interrupted, cancellation.signal), { name: 'AbortError' });
    assert.deepEqual(interrupted.statements.filter(sql => sql.startsWith('DROP DATABASE')), ['DROP DATABASE `' + interrupted.createdSchema() + '`']);
    assert.equal(interrupted.closed(), true);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
