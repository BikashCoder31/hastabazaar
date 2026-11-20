import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveOrderRefundScratchOutput } from '../lib/operations/order-refund-maria-migrations.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const include = '--include-order-refund-migrations';
const schemaScript = 'scripts/generate-mariadb-schema.mjs';
const manifestScript = 'scripts/generate-release-manifest.mjs';
const schemaName = 'mariadb-schema.sql';
const resetName = 'mariadb-reset-empty-import.sql';
const migrationNames = [
  'mariadb-order-item-pricing-snapshots.sql',
  'mariadb-seller-shipment-delivery-allocations.sql',
  'mariadb-priced-return-effects.sql',
  'mariadb-seller-dispatch-evidence.sql',
  'mariadb-refund-route-reservations.sql',
  'mariadb-priced-order-acceptance-lock.sql',
];
const babal = 'deployment/babal/';

function run(cwd, script, ...args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, HASTABAZAAR_RELEASE_ID: 'local-order-refund-fixture' },
  });
}

void test('malformed generator options fail before either historical default can be written', async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), 'hb-order-refund-options-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  for (const path of [schemaScript, manifestScript, 'lib/forms/public-feedback-schema.mjs', ...[
    'bootstrap-prerequisites', 'bootstrap-completion', 'fresh-bootstrap-defaults', 'check-parity',
    'text-length-parity', 'fee-schema-readiness', 'sql-schema-inventory',
  ].map((name) => `lib/operations/${name}.mjs`)]) {
    const destination = join(scratch, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(root, path), destination);
  }
  await mkdir(join(scratch, babal), { recursive: true });
  const defaultPaths = [schemaName, resetName, 'release-manifest.json'].map((name) => join(scratch, babal, name));
  for (const path of defaultPaths) await writeFile(path, 'retained output\n');
  for (const [script, valueOption] of [[schemaScript, '--output-directory'], [manifestScript, '--output']]) {
    for (const [args, expected] of [
      [[`${include}=true`], /ERR_PARSE_ARGS_INVALID_OPTION_VALUE/],
      [[`${include}-typo`], /ERR_PARSE_ARGS_UNKNOWN_OPTION/],
      [['--'], /Only named options are supported/],
      [[`${valueOption}=`], /Option values must be nonempty/],
      [[include, include], /Options may only be specified once/],
      [[`${valueOption}=one`, `${valueOption}=two`], /Options may only be specified once/],
    ]) {
      const result = run(scratch, script, ...args);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
    }
  }
  for (const path of defaultPaths) assert.equal(await readFile(path, 'utf8'), 'retained output\n');
});

void test('the order and refund schema opt-in rejects an existing scratch directory', async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), 'hb-order-refund-existing-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const result = run(root, schemaScript, include, `--output-directory=${scratch}`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EEXIST/);
  await assert.rejects(stat(join(scratch, schemaName)), { code: 'ENOENT' });
});

void test('a path through a symlink to the checkout is ineligible for scratch output', async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), 'hb-order-refund-symlink-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const checkout = join(scratch, 'checkout');
  const alias = join(scratch, 'alias');
  await mkdir(checkout);
  await symlink(checkout, alias, 'junction');
  await assert.rejects(resolveOrderRefundScratchOutput(checkout, join(alias, 'candidate')), /outside the checkout/);
});

void test('the order and refund source bundle appends the six companions to the historical schema', async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), 'hb-order-refund-migrations-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const historical = join(scratch, 'historical');
  const candidate = join(scratch, 'candidate');
  const historicalManifestPath = join(scratch, 'historical.json');
  const bundle = join(scratch, 'bundle');
  const historicalSchemaPath = join(historical, schemaName);
  const candidateSchemaPath = join(candidate, schemaName);

  for (const result of [
    run(root, schemaScript, `--output-directory=${historical}`),
    run(root, schemaScript, include, `--output-directory=${candidate}`),
    run(root, manifestScript, `--schema-input=${historicalSchemaPath}`, `--output=${historicalManifestPath}`),
    run(root, manifestScript, include, `--schema-input=${candidateSchemaPath}`, `--asset-root=${bundle}`),
  ]) assert.equal(result.status, 0, result.stderr);

  const previousSchema = await readFile(historicalSchemaPath);
  const candidateSchema = await readFile(candidateSchemaPath);
  assert.deepEqual(candidateSchema.subarray(0, previousSchema.length), previousSchema);
  assert.deepEqual(await readFile(join(candidate, resetName)), await readFile(join(historical, resetName)));
  const previousManifest = JSON.parse(await readFile(historicalManifestPath, 'utf8'));
  const manifest = JSON.parse(await readFile(join(bundle, babal, 'release-manifest.json'), 'utf8'));
  assert.deepEqual(manifest.migrations.slice(1, -migrationNames.length), previousManifest.migrations.slice(1));
  assert.deepEqual(manifest.migrations.slice(-migrationNames.length).map((migration) => migration.path),
    migrationNames.map((name) => babal + name));
  assert.equal(manifest.migrations[0].usage, 'empty-database-only');
  assert.deepEqual(await readFile(join(bundle, babal, schemaName)), candidateSchema);
  const companionBytes = await Promise.all(migrationNames.map((name) => readFile(join(root, babal, name))));
  const expectedTail = companionBytes.map((bytes) => bytes.toString('utf8').replaceAll('\r\n', '\n')).join('\n');
  assert.ok(candidateSchema.toString('utf8').endsWith(expectedTail));
  for (const [index, migration] of manifest.migrations.slice(-migrationNames.length).entries()) {
    const bytes = companionBytes[index];
    assert.equal(migration.usage, 'additive-maintenance');
    assert.equal(migration.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.deepEqual(await readFile(join(bundle, migration.path)), bytes);
  }
  assert.deepEqual(manifest.requiredTables.refund_route_bank_terminal_evidence, ['event_id', 'obligation_id', 'packet_id']);
  assert.ok(Object.hasOwn(manifest.requiredTriggers, 'order_item_pricing_snapshot_insert'));
  assert.ok(!Object.hasOwn(previousManifest.requiredTables, 'refund_route_bank_terminal_evidence'));

  const badInput = join(scratch, 'bad-schema.sql');
  await writeFile(badInput, Buffer.concat([Buffer.from('-- unexpected prefix\n'), candidateSchema]));
  for (const [args, message] of [
    [[`--schema-input=${candidateSchemaPath}`], /requires --include-order-refund-migrations/],
    [[include, `--schema-input=${historicalSchemaPath}`], /does not match the order and refund migration sources/],
    [[include, `--schema-input=${badInput}`], /does not match the reviewed historical schema/],
    [[include], /requires --schema-input/],
  ]) {
    const badOutput = join(scratch, 'rejected-manifest.json');
    const result = run(root, manifestScript, ...args, `--output=${badOutput}`);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
    await assert.rejects(stat(badOutput), { code: 'ENOENT' });
  }
});
