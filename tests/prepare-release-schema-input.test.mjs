import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const helper = resolve(root, 'scripts/prepare-release-schema-input.mjs');
const reviewedHash = 'aa248443d0f54096a83a11c74c6b3cda66774431417cd64be9cd127af98a3493';
const destination = () => `.test-artifacts/t35/ci-schema-test-${randomUUID()}`;
const run = args => spawnSync(process.execPath, [helper, ...args], { cwd: root, encoding: 'utf8' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

void test('fresh source generation selects only the reviewed schema bytes and preserves public release assets', async () => {
  const retained = ['mariadb-schema.sql', 'mariadb-reset-empty-import.sql', 'release-manifest.json'];
  const before = await Promise.all(retained.map(path => readFile(resolve(root, 'deployment/babal', path))));
  const output = destination();
  const result = run([`--output-directory=${output}`, `--expected-sha256=${reviewedHash}`]);
  assert.equal(result.status, 0, result.stderr);
  const selected = JSON.parse(result.stdout.trim());
  assert.equal(selected.schemaInput, resolve(root, output, 'mariadb-schema.sql'));
  assert.equal(selected.sha256, reviewedHash);
  assert.equal(hash(await readFile(selected.schemaInput)), reviewedHash);
  // The generator also writes a recovery file. It is never returned as build input.
  assert.ok((await readFile(resolve(root, output, 'mariadb-reset-empty-import.sql'))).length > 0);
  assert.deepEqual(Object.keys(selected).sort(), ['schemaInput', 'sha256']);
  for (const [index, path] of retained.entries()) {
    assert.deepEqual(await readFile(resolve(root, 'deployment/babal', path)), before[index], path);
  }
});

void test('schema preparation rejects absent, malformed, duplicate and unknown selection arguments before writing', async () => {
  for (const args of [[], [`--output-directory=${destination()}`], [`--expected-sha256=${reviewedHash}`],
    [`--output-directory=${destination()}`, '--expected-sha256=bad'],
    [`--output-directory=${destination()}`, `--expected-sha256=${reviewedHash}`, `--expected-sha256=${reviewedHash}`],
    [`--output-directory=${destination()}`, `--expected-sha256=${reviewedHash}`, '--schema-input=historical.sql']]) {
    const result = run(args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Require exactly --output-directory=.*--expected-sha256=/);
    assert.equal(result.stdout, '');
    const output = args.find(arg => arg.startsWith('--output-directory='))?.slice('--output-directory='.length);
    if (output) await assert.rejects(lstat(resolve(root, output)), { code: 'ENOENT' });
  }
});

void test('a generated schema hash mismatch supplies no selected input and retains the failed candidate for review', async () => {
  const output = destination();
  const result = run([`--output-directory=${output}`, `--expected-sha256=${'0'.repeat(64)}`]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Generated schema SHA256 does not match the explicitly reviewed selection/);
  assert.equal(result.stdout, '');
  assert.equal(hash(await readFile(resolve(root, output, 'mariadb-schema.sql'))), reviewedHash);
});

void test('an existing destination is never overwritten or reused as schema evidence', async () => {
  const output = destination();
  await mkdir(resolve(root, output), { recursive: true });
  const sentinel = resolve(root, output, 'mariadb-schema.sql');
  await writeFile(sentinel, 'pre-existing candidate\r\n', { flag: 'wx' });
  const result = run([`--output-directory=${output}`, `--expected-sha256=${reviewedHash}`]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /new owned output directory/);
  assert.equal(await readFile(sentinel, 'utf8'), 'pre-existing candidate\r\n');
  assert.equal(result.stdout, '');
});

void test('schema generation cannot target canonical assets, an ancestor, or a different artifact tree', () => {
  for (const output of ['deployment/babal', '.test-artifacts/t35', '.test-artifacts/t35/../t33/forbidden', '../forbidden']) {
    const result = run([`--output-directory=${output}`, `--expected-sha256=${reviewedHash}`]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /one new direct child of .test-artifacts\/t35/);
    assert.equal(result.stdout, '');
  }
});

void test('all workflow triggers leave staging unreachable and artifact jobs have no deployment credentials', async () => {
  // GitHub owns workflow scheduling; it cannot be exercised locally without dispatch.
  // Inspect the job-level YAML scalars, rather than running any retained SSH step.
  const source = await readFile(resolve(root, '.github/workflows/verify-release.yml'), 'utf8');
  const jobs = [...source.matchAll(/^  ([a-z][a-z0-9_-]*):\r?\n([\s\S]*?)(?=^  [a-z][a-z0-9_-]*:\r?$|(?![\s\S]))/gm)];
  const staging = jobs.find(job => job[1] === 'staging');
  assert.ok(staging, 'Retain the held historical staging job for review');
  const conditions = [...staging[2].matchAll(/^    if: (.+)\r?$/gm)];
  assert.equal(conditions.length, 1, 'Exactly one job-level deployment condition');
  const expression = conditions[0][1].trim().match(/^\$\{\{\s*(.*?)\s*\}\}$/)?.[1];
  assert.ok(expression !== undefined, 'The job must have an explicit constant hold expression');
  assert.equal(JSON.parse(expression), false, 'A literal false cannot be enabled by a trigger, ref, secret or manual input');
  for (const job of jobs.filter(job => job[1] !== 'staging')) {
    assert.doesNotMatch(job[2], /secrets\.|STAGING_(?:KEY|KNOWN_HOSTS)|send-staging|\bssh(?:-agent|-add|-keyscan)?\b|\bscp\b/i, job[1]);
  }
});
