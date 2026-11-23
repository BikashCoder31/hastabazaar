import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applySchema, checkpointSql, clientProtocol, migrationSteps, verifiedSql,
} from '../scripts/deployment/mariadb-schema-upgrade.mjs';

const digest = (digit: string) => digit.repeat(64);
const before = { target: digest('1'), schema: digest('2') };
const after = { target: before.target, schema: digest('3') };
const steps = [
  { id: '59', sql: 'first file' },
  { id: '60', sql: 'second file' },
];
type MigrationStep = { id: string; checkpoint?: boolean };

void test('profile media keeps its seller foreign-key index while the replacement is installed', () => {
  const sql = readFileSync(new URL('../deployment/babal/mariadb-public-profile-revisions.sql', import.meta.url), 'utf8');
  const replacement = sql.indexOf('CREATE INDEX seller_profile_media_history ON seller_profile_media(seller_id,kind,uploaded_at,id)');
  const oldIndex = sql.indexOf('DROP INDEX idx_seller_profile_media_kind ON seller_profile_media');
  assert.ok(replacement >= 0 && oldIndex > replacement, 'Create the seller_id index before dropping the old key');
});

function exercise(options: { fail?: boolean; mismatch?: boolean; failVerify?: boolean;
  expectedTarget?: string; hosted?: boolean } = {}) {
  const writes: string[] = [];
  const journal: { event: string; id?: string }[] = [];
  const run = () => applySchema({
    steps,
    approval: {
      target: options.expectedTarget ?? before.target,
      before: before.schema,
      ...(options.hosted ? { after: { '59': after.schema, '60': after.schema } } : {}),
    },
    hosted: options.hosted ?? false,
    inspect: () => writes.length ? (options.mismatch ? before : after) : before,
    execute: (step: { id: string }) => {
      writes.push(step.id);
      if (options.fail) throw new Error('MariaDB rejected the file');
    },
    record: (row: { event: string; id?: string }) => journal.push(row),
    verify: () => {
      if (options.failVerify) throw new Error('Backfill verification failed');
    },
  });
  return { run, writes, journal };
}

void test('selection preserves 137 as a checkpoint, excludes 139, and keeps the owner batch separate', () => {
  const manifest = {
    migrations: Array.from({ length: 142 }, () => ({ usage: 'additive-maintenance' })),
    ownerAppliedMigrations: Array.from({ length: 9 }, (_, i) => ({
      usage: 'owner-applied', d1: { path: `drizzle/0${164 + i}_name.sql` },
    })),
  };
  const core: MigrationStep[] = migrationSteps(manifest, 'core');
  assert.equal(core.filter(step => !step.checkpoint).length, 82);
  assert.deepEqual(core.slice(-6).map(step => [step.id, !!step.checkpoint]), [
    ['136', false], ['137', true], ['138', false], ['140', false], ['141', false], ['142', false],
  ]);
  const owner: MigrationStep[] = migrationSteps(manifest, 'owner');
  assert.deepEqual(owner.map(step => step.id),
    ['0164', '0165', '0166', '0167', '0168', '0169', '0170', '0171', '0172']);
  manifest.ownerAppliedMigrations.reverse();
  assert.throws(() => migrationSteps(manifest, 'owner'), /order/i);
});

void test('retained convergence runs before CHECK parity and keeps the reviewed position numbers', () => {
  const original = Array.from({ length: 142 }, () => ({ usage: 'additive-maintenance', path: '' }));
  original[139].path = 'deployment/babal/mariadb-check-parity.sql';
  const convergence = { usage: 'additive-maintenance', path: 'deployment/babal/mariadb-retained-schema-convergence.sql' };
  const revised = original.toSpliced(139, 0, convergence);
  const core: MigrationStep[] = migrationSteps({ migrations: revised }, 'core');
  assert.deepEqual(core.slice(-5).map(step => step.id), ['138', '139a', '140', '141', '142']);
  assert.throws(() => migrationSteps({ migrations: original.toSpliced(138, 0, convergence) }, 'core'), /position/i);
});

void test('retained convergence checks its data before SQL and compares the original values afterward', () => {
  const trace: unknown[] = [];
  const step = { id: '139a' };
  applySchema({
    steps: [step], approval: { target: before.target, before: before.schema }, hosted: false,
    inspect: () => before,
    capture: (current: MigrationStep) => { trace.push('capture', current.id); return ['row digest']; },
    execute: () => trace.push('apply'),
    verify: (current: MigrationStep, previous: unknown) => { trace.push('verify', current.id, previous); },
    record: () => {},
  });
  assert.deepEqual(trace, ['capture', '139a', 'apply', 'verify', '139a', ['row digest']]);
});

void test('companion bytes must match before use', () => {
  assert.throws(() => verifiedSql(Buffer.from('tampered'), digest('0'), '59'), /fingerprint/i);
});

void test('position 137 keeps the original validations and cannot apply the original DDL', () => {
  const source = readFileSync(new URL('../deployment/babal/mariadb-bootstrap-prerequisites.sql', import.meta.url));
  const sql = checkpointSql(source);
  assert.match(sql, /bootstrap_prerequisites_duplicate_refund_type/);
  assert.match(sql, /old_index_count<>0 OR new_index_count<>2/);
  assert.doesNotMatch(sql, /\b(?:ALTER TABLE|PREPARE|EXECUTE|INSERT INTO|DELETE FROM)\b/i);
});

void test('a wrong target stops before the first file', () => {
  const { run, writes } = exercise({ expectedTarget: digest('4') });
  assert.throws(run, /fingerprint/i);
  assert.deepEqual(writes, []);
});

void test('a SQL error leaves an unfinished journal entry and does not run the next file', () => {
  const { run, writes, journal } = exercise({ fail: true });
  assert.throws(run, /MariaDB rejected/);
  assert.deepEqual(writes, ['59']);
  assert.equal(journal.at(-1)?.event, 'started');
});

void test('an unexpected post-file fingerprint stops a hosted apply', () => {
  const { run, writes, journal } = exercise({ hosted: true, mismatch: true });
  assert.throws(run, /fingerprint/i);
  assert.deepEqual(writes, ['59']);
  assert.equal(journal.at(-1)?.event, 'started');
});

void test('matching hosted fingerprints allow the full ordered phase', () => {
  const { run, writes, journal } = exercise({ hosted: true });
  run();
  assert.deepEqual(writes, ['59', '60']);
  assert.equal(journal.at(-1)?.event, 'finished');
});

void test('a data checkpoint failure stops before the next companion', () => {
  const { run, writes, journal } = exercise({ failVerify: true });
  assert.throws(run, /Backfill verification failed/);
  assert.deepEqual(writes, ['59']);
  assert.equal(journal.at(-1)?.event, 'started');
});

void test('connection file cannot override error handling or add startup commands', () => {
  for (const option of ['force=1', 'database=other', 'init-command=SELECT 1', '!include /tmp/another.cnf']) {
    const config = Buffer.from('[client]\nuser=reviewer\nsocket=/var/run/mysqld.sock\n' + option);
    assert.throws(() => clientProtocol(config, 'production'), /connection options/);
  }
  assert.equal(clientProtocol(Buffer.from('[client]\nuser=reviewer\nsocket=/var/run/mysqld.sock'), 'production'), 'SOCKET');
  const remote = Buffer.from('[client]\nuser=reviewer\nhost=mariadb.example.test\n');
  assert.throws(() => clientProtocol(remote, 'rehearsal'), /loopback/);
  assert.throws(() => clientProtocol(remote, 'production'), /TLS/);
});
