import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { migrationSteps } from '../scripts/deployment/mariadb-schema-upgrade.mjs';

const packagePhase = '--package-pricing-migrations';
const schemaSha = 'b40c9fde31cad9f4dc05c64227c91ef473d10748b51716c7bfce75fcede11843';
const orderedPaths = [
  'order-item-pricing-snapshots', 'seller-shipment-delivery-allocations', 'priced-return-effects',
  'seller-dispatch-evidence', 'refund-route-reservations', 'priced-order-acceptance-lock',
].map(name => `deployment/babal/mariadb-${name}.sql`);

void test('the pricing package preserves the checked bootstrap and makes the six files separately applicable', async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), 'hb-pricing-release-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const bootstrap = join(scratch, 'bootstrap');
  const bundle = join(scratch, 'bundle');
  const manifestPath = join(bundle, 'deployment/babal/release-manifest.json');
  const schemaInput = `--schema-input=${join(bootstrap, 'mariadb-schema.sql')}`;
  const env = { ...process.env, HASTABAZAAR_RELEASE_ID: 'hastabazaar-release-pricing-fixture' };
  const run = (script: string, ...args: string[]) => execFileSync(process.execPath, [script, ...args], {
    env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  run('scripts/generate-mariadb-schema.mjs', `--output-directory=${bootstrap}`);
  run('scripts/generate-release-manifest.mjs', schemaInput, `--asset-root=${bundle}`, packagePhase);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const historicalManifestPath = join(scratch, 'without-pricing.json');
  run('scripts/generate-release-manifest.mjs', schemaInput, `--output=${historicalManifestPath}`);
  const historical = JSON.parse(await readFile(historicalManifestPath, 'utf8'));
  const { pricingSchema, migrations, ...baselineRequirements } = manifest;
  const { migrations: coreMigrations, ...historicalRequirements } = historical;
  assert.deepEqual(baselineRequirements, historicalRequirements);
  assert.equal(migrations[0].sha256, schemaSha);
  assert.deepEqual(migrations.slice(0, -6), coreMigrations);
  assert.deepEqual(migrations.slice(-6).map(({ path, usage }: {path: string; usage: string}) => [path, usage]),
    orderedPaths.map(path => [path, 'pricing-maintenance']));

  const { readReleaseAssets } = await import('../scripts/release-schema-assets.mjs');
  const assets = await readReleaseAssets(bundle, manifest.release);
  assert.deepEqual(assets.files.slice(-6).map(({ path }) => path), orderedPaths);
  assert.deepEqual(migrationSteps(manifest, 'core'), migrationSteps(historical, 'core'));
  assert.deepEqual(migrationSteps(manifest, 'owner'), migrationSteps(historical, 'owner'));
  assert.deepEqual(migrationSteps(manifest, 'pricing').map(({ id, path }: {id: string; path: string}) => [id, path]),
    orderedPaths.map((path, index) => [`pricing-${index + 1}`, path]));
  for (const malformedMigrations of [
    migrations.slice(0, -1),
    [...migrations.slice(0, -2), ...migrations.slice(-2).reverse()],
    [...migrations.slice(0, -1), { ...migrations.at(-1), sha256: '1'.repeat(64) }],
  ]) {
    const malformed = { ...manifest, migrations: malformedMigrations };
    for (const phase of ['core', 'pricing']) assert.throws(() => migrationSteps(malformed, phase), /pricing/i);
  }

  const { inspectPricingSchema, pricingSchemaSql } = await import('../lib/operations/pricing-schema-readiness.mjs');
  const query = pricingSchemaSql(pricingSchema);
  assert.match(query, /VIEW_DEFINITION/);
  assert.match(query, /ACTION_STATEMENT/);
  assert.match(query, /CHECK_CLAUSE/);
  assert.doesNotMatch(query, /\b(?:ALTER TABLE|CREATE TABLE|UPDATE \w+ SET|INSERT INTO|DELETE FROM)\b/);
  assert.equal((await inspectPricingSchema({ prepare() { throw new Error('Metadata unavailable'); } }, pricingSchema)).ready, false);
  assert.equal((await inspectPricingSchema({ prepare() { return { async all() { return { results: [] }; } }; } }, pricingSchema)).ready, false);
  const metadata = Object.entries({table: pricingSchema.tables, trigger: pricingSchema.triggers,
    view: pricingSchema.views, 'trigger-set': pricingSchema.tableTriggers, session: {constraint_checks: true}})
    .flatMap(([kind, objects]) => Object.keys(objects).map(objectName => ({kind, objectName, matched: 1})));
  assert.equal(metadata.length, 69);
  const database = { prepare() { return { async all<T>() { return { results: metadata as T[] }; } }; } };
  assert.deepEqual(await inspectPricingSchema(database, pricingSchema), { ready: true, missing: [] });
  metadata.find(row => row.objectName === 'refund_route_bank_terminal_evidence')!.matched = 0;
  assert.deepEqual(await inspectPricingSchema(database, pricingSchema), {
    ready: false, missing: ['pricing-schema:view:refund_route_bank_terminal_evidence'],
  });
  const report = run('scripts/generate-production-schema-check.mjs', '--manifest', manifestPath, '--metadata-only-stdout');
  assert.match(report, /'pricing'/);
  assert.match(report, /refund_route_bank_terminal_evidence/);
  assert.match(report, /refund_cost_original_capacity/);

  await writeFile(join(bundle, orderedPaths[0]), '-- altered migration fixture');
  await assert.rejects(readReleaseAssets(bundle, manifest.release), /Migration hash mismatch/);
});
