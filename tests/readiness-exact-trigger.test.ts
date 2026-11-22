import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectReadiness } from '../lib/operations/readiness';
import publicManifest from '../deployment/babal/release-manifest.json';

const name = 'native_form_command_provenance_retained';
const definition = "BEGIN IF OLD.command_key IS NOT NULL AND (NOT (HEX(NEW.id) <=> HEX(OLD.id)) OR NOT (HEX(NEW.next_json) <=> HEX(OLD.next_json))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='native_form_command_provenance_retained'; END IF; END";
const selected = {
  ...publicManifest, requiredTables: {}, requiredGeneratedColumns: {}, requiredColumnCollations: {},
  requiredUniqueIndexes: {}, requiredForeignKeys: {}, requiredChecks: {}, requiredExactChecks: {},
  requiredTriggers: { [name]: ['old.command_key is not null', 'hex(new.id)', 'hex(old.id)'] },
  requiredTriggerShapes: { [name]: { table: 'audit_logs', event: 'UPDATE', timing: 'BEFORE' } },
  requiredExactTriggerDefinitions: { [name]: definition },
};
const row = { name, definition, tableName: 'audit_logs', event: 'UPDATE', timing: 'BEFORE' };
async function inspect(trigger = row, manifest: object = selected, dialect: 'mariadb' | 'sqlite' = 'mariadb') {
  const db = { prepare(sql: string) { return { async all() {
    return { results: sql.includes('information_schema.TRIGGERS') ? [trigger] : [] };
  } }; } } as unknown as D1Database;
  return inspectReadiness(db, dialect, manifest as typeof publicManifest);
}

void test('selected exact MariaDB trigger definition accepts the complete conditional body', async () => {
  assert.deepEqual(await inspect(), { ready: true, missing: [] });
});
void test('selected exact MariaDB trigger refuses changed conditional and body', async () => {
  for (const changed of [definition.replace('IS NOT NULL', 'IS NULL'), definition.replace('HEX(NEW.next_json)', 'HEX(OLD.next_json)'), "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='hex(old.id)'"]) {
    assert.deepEqual(await inspect({ ...row, definition: changed }), { ready: false, missing: ['trigger-version:' + name] });
  }
});
void test('selected exact MariaDB trigger retains independent table, event and timing checks', async () => {
  for (const change of [{ tableName: 'orders' }, { event: 'DELETE' }, { timing: 'AFTER' }]) {
    assert.deepEqual(await inspect({ ...row, ...change }), { ready: false, missing: ['trigger-shape:' + name] });
  }
});
void test('manifest without optional exact trigger definitions retains simple SIGNAL checks', async () => {
  const legacy = Object.fromEntries(Object.entries(selected).filter(([key]) => key !== 'requiredExactTriggerDefinitions'));
  const legacyManifest = { ...legacy, requiredTriggers: { [name]: ['signal sqlstate', '45000', name] } };
  const simple = `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${name}'`;
  assert.deepEqual(await inspect({ ...row, definition: simple }, legacyManifest), { ready: true, missing: [] });
  assert.deepEqual(await inspect({ ...row, definition: simple.replace('45000', '45001') }, legacyManifest), { ready: false, missing: ['trigger-version:' + name] });
});
