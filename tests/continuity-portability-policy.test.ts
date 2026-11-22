import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  classifySqlTransferTable,
  recognizedSqlTransferTableNames,
} from '../lib/portability/d1-source';

const continuityTables = [
  'commission_continuity_operations',
  'commission_continuity_sellers',
  'commission_continuity_settings',
] as const;

for (const name of continuityTables) {
  void test(`${name} is recognized as durable provenance`, () => {
    assert.ok(recognizedSqlTransferTableNames().includes(name));
    assert.equal(classifySqlTransferTable(name), 'durable');
    assert.equal(classifySqlTransferTable(name, { [name]: 'durable' }), 'durable');
  });

  void test(`${name} refuses every conflicting supplied classification`, () => {
    for (const classification of [
      'security',
      'transient',
      'dispatch',
      'installation',
    ] as const) {
      assert.throws(
        () => classifySqlTransferTable(name, { [name]: classification }),
        /reviewed table policy cannot be overridden/i,
      );
    }
  });
}

void test('continuity policy keeps unknown table discovery fail-closed', () => {
  for (const name of [
    'commission_continuity_unreviewed',
    'future_unreviewed_table',
  ]) {
    assert.ok(!recognizedSqlTransferTableNames().includes(name));
    assert.throws(() => classifySqlTransferTable(name), /unreviewed table/i);
  }
});

for (const schema of [
  '../deployment/babal/mariadb-commission-continuity.sql',
  '../drizzle/0075_commission_continuity.sql',
]) {
  void test(`${schema} CREATE TABLE set has durable portable coverage`, async () => {
    const sql = (await readFile(new URL(schema, import.meta.url), 'utf8'))
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const names = [
      ...sql.matchAll(
        /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?([A-Za-z_]\w*)[`"']?/gi,
      ),
    ].map((match) => match[1]);
    assert.deepEqual([...names].sort(), continuityTables);
    const reviewed = new Set(recognizedSqlTransferTableNames());
    for (const name of names) {
      assert.ok(reviewed.has(name), `schema table needs reviewed policy: ${name}`);
      assert.equal(classifySqlTransferTable(name), 'durable');
    }
  });
}
