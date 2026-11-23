import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const generator = fileURLToPath(new URL('../scripts/generate-production-schema-check.mjs', import.meta.url));
const checkedIn = new URL('../deployment/babal/check-production-schema.sql', import.meta.url);
const releaseManifest = fileURLToPath(new URL('../deployment/babal/release-manifest.json', import.meta.url));

void test('production schema check is current and has only one metadata query', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'hb-schema-check-'));
  try {
    const output = join(folder, 'check.sql');
    execFileSync(process.execPath, [generator, '--manifest', releaseManifest, '--output', output]);
    const report = await readFile(output, 'utf8');
    assert.equal(report, await readFile(checkedIn, 'utf8'));
    const statements = report.replace(/^--.*$/gm, '');
    assert.equal(statements.split(';').length, 2);
    assert.match(statements.trimStart(), /^WITH\b/);
    assert.doesNotMatch(statements, /\b(?:ALTER TABLE|CREATE TABLE|UPDATE\s+\w+\s+SET|INSERT INTO|DELETE FROM)\b/i);
    const inventory = [...report.matchAll(/0x([0-9a-f]+)(?:,|\s+\))/g)].map(match => match[1]).join('');
    const expected: [migration: string, kind: string, table: string, name: string][] =
      JSON.parse(Buffer.from(inventory, 'hex').toString('utf8'));
    assert.deepEqual([...new Set(expected.map(([migration]) => migration).filter(Boolean))],
      ['0164', '0165', '0166', '0167', '0168', '0169', '0170', '0171', '0172']);
    assert.ok(expected.some(([migration, kind, table, name]) =>
      migration === '0164' && kind === 'check-exact' && table === 'first_cod_reviews' && name === 'chk_first_cod_hold_total'));
    assert.ok(expected.some(([migration, kind, table, name]) =>
      migration === '0172' && kind === 'check-exact' && table === 'ncm_bookings' && name === 'ncm_booking_state'));
    assert.deepEqual(expected.filter(([migration, kind]) => migration === '0172' && kind === 'unique-index')
      .map(([, , table, name]) => table + '.' + name), [
      'ncm_partner_settings.PRIMARY', 'ncm_pickup_branches.PRIMARY',
      'ncm_bookings.PRIMARY', 'ncm_bookings.idx_ncm_booking_reference',
      'ncm_bookings.idx_ncm_booking_order', 'ncm_bookings.idx_ncm_booking_request',
      'ncm_api_daily_usage.PRIMARY', 'ncm_webhook_events.PRIMARY', 'ncm_courier_notes.PRIMARY',
    ]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

void test('production schema check refuses an owner entry without detectable prerequisites', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'hb-schema-check-invalid-'));
  try {
    const manifest = join(folder, 'manifest.json');
    const output = join(folder, 'check.sql');
    await writeFile(manifest, JSON.stringify({
      ownerAppliedMigrations: [{d1: {path: 'drizzle/0164_fixture.sql'}}],
    }));
    assert.throws(() => execFileSync(process.execPath, [generator, '--manifest', manifest, '--output', output], {stdio: 'pipe'}),
      /Owner migration 0164 has no schema requirements/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

void test('metadata report emits names and counts, and separates unverified triggers', () => {
  const report = execFileSync(process.execPath, [generator, '--manifest', releaseManifest,
    '--metadata-only-stdout'], {encoding: 'utf8'});
  const statements = report.replace(/^--.*$/gm, '').trim();
  assert.match(statements, /^WITH\b/);
  assert.equal(statements.split(';').length, 2);
  assert.match(report, /trigger-exact'\) AND o\.objectValue IS NULL THEN -1/);
  const output = report.slice(report.indexOf('AS scope, kind'));
  assert.match(output, /unverifiedCount/);
  assert.match(output, /CONCAT_WS\('\.', NULLIF\(tableName, ''\), NULLIF\(name, ''\)\)/);
  assert.doesNotMatch(output, /objectValue|ACTION_STATEMENT|expected|CURRENT_USER\(\)/);
  assert.doesNotMatch(report, /\b(?:ALTER TABLE|CREATE TABLE|UPDATE\s+\w+\s+SET|INSERT INTO|DELETE FROM)\b/i);
});
