import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  assertLocalCheckout,
  assertLocalNodeVersion,
  checkLocalData,
  createLocalEnvironment,
  parseLocalArguments,
  verifyLocalEnvironmentFiles,
} from '../scripts/start-local.mjs';

const projectRoot = resolve('test-canonical-hastabazaar');
const checkout = {
  projectRoot,
  cwd: projectRoot,
  configuredRoot: projectRoot,
  gitRoot: projectRoot,
  baseline: 'd9056dc10fee13dc11d15f24a14f63b003befe0b',
  head: 'd9056dc10fee13dc11d15f24a14f63b003befe0b',
  branch: 'main',
  baselineIsAncestor: true,
};

void test('a copied checkout or a different working directory cannot use the canonical launch', () => {
  assert.doesNotThrow(() => assertLocalCheckout(checkout));
  for (const key of ['projectRoot', 'cwd', 'gitRoot']) {
    assert.throws(() => assertLocalCheckout({ ...checkout, [key]: resolve('archived-copy') }), /canonical|directory|checkout/i);
  }
  assert.throws(() => assertLocalCheckout({ ...checkout, configuredRoot: '' }), /config|canonical/i);
  assert.throws(() => assertLocalCheckout({ ...checkout, baseline: '' }), /baseline/i);
});

void test('a stale main branch is rejected while a descendant feature branch is allowed', () => {
  assert.throws(() => assertLocalCheckout({ ...checkout, baselineIsAncestor: false }), /baseline|older|descend/i);
  assert.doesNotThrow(() => assertLocalCheckout({ ...checkout, branch: 'codex/later-change', head: 'a'.repeat(40) }));
});

void test('the launcher requires the Node SQLite runtime supported by the project', () => {
  for (const version of ['20.19.0', '22.12.0', 'invalid']) {
    assert.throws(() => assertLocalNodeVersion(version), /Node.*22\.13/i);
  }
  assert.doesNotThrow(() => assertLocalNodeVersion('22.13.0'));
  assert.doesNotThrow(() => assertLocalNodeVersion('22.23.1'));
});

void test('normal launch and read-only check accept no host, port, mode, or command overrides', () => {
  assert.equal(parseLocalArguments([]), false);
  assert.equal(parseLocalArguments(['--check']), true);
  for (const args of [['--host', '0.0.0.0'], ['--port', '4000'], ['--mode', 'production'], ['--check', '--check'], ['build']]) {
    assert.throws(() => parseLocalArguments(args), /argument|--check/i);
  }
});

void test('a clean environment receives only the fixed local runtime settings and is not mutated', () => {
  const input = { PATH: 'preserved-path' };
  const environment = createLocalEnvironment(input);
  assert.deepEqual(input, { PATH: 'preserved-path' });
  assert.equal(environment.PATH, 'preserved-path');
  assert.equal(environment.HASTABAZAAR_RUNTIME_ENV, 'local_staging');
  assert.equal(environment.NODE_ENV, 'development');
  assert.equal(environment.APP_ORIGIN, 'http://localhost:3018');
  assert.equal(environment.HASTABAZAAR_MAIL_MODE, 'capture');
  assert.equal(environment.HASTABAZAAR_PAYMENT_MODE, 'simulated');
  assert.equal(environment.HASTABAZAAR_RECIPIENT_DOMAIN, 'local.hastabazaar.test');
  assert.equal(environment.CHECKOUT_CONTACT_POLICY, 'email_only');
});

void test('production, deployment, different local runtime, remote credentials, and Git overrides stop launch', () => {
  const conflicts = {
    NODE_ENV: 'production',
    DEPLOY_TARGET: 'babal',
    VERCEL_ENV: 'preview',
    HASTABAZAAR_RUNTIME_ENV: 'development',
    APP_ORIGIN: 'http://localhost:3000',
    HASTABAZAAR_MAIL_MODE: 'smtp',
    HASTABAZAAR_PAYMENT_MODE: 'live',
    HASTABAZAAR_RECIPIENT_DOMAIN: 'hastabazaar.com',
    CHECKOUT_CONTACT_POLICY: 'phone_required',
    HOST: '0.0.0.0',
    PORT: '4000',
    DB_HOST: 'remote.invalid',
    DATABASE_URL: 'mysql://remote.invalid/example',
    SMTP_PASSWORD: 'example-secret',
    CLOUDFLARE_API_TOKEN: 'example-secret',
    GOOGLE_CLIENT_SECRET: 'example-secret',
    R2_SECRET_ACCESS_KEY: 'example-secret',
    NODE_OPTIONS: '--import ./unexpected.mjs',
    GIT_DIR: 'different-git-directory',
  };
  for (const [name, value] of Object.entries(conflicts)) {
    assert.throws(() => createLocalEnvironment({ [name]: value }), new RegExp(name));
  }
});

void test('Windows environment name casing cannot hide a runtime conflict or remote credential', () => {
  assert.throws(() => createLocalEnvironment({ node_env: 'production' }), /node_env/i);
  assert.throws(() => createLocalEnvironment({ Smtp_Password: 'example-secret' }), /smtp_password/i);
  assert.throws(() => createLocalEnvironment({ hastabazaar_staging_root: '../another-copy' }), /staging_root/i);
});

void test('empty mixed-case aliases cannot shadow the forced child runtime settings', () => {
  const environment = createLocalEnvironment({ node_env: '', app_origin: '', NODE_ENV: 'development' });
  assert.equal(Object.hasOwn(environment, 'node_env'), false);
  assert.equal(Object.hasOwn(environment, 'app_origin'), false);
  assert.equal(environment.NODE_ENV, 'development');
  assert.equal(environment.APP_ORIGIN, 'http://localhost:3018');
});

void test('conflicting environment files are rejected even when the process settings would override them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hastabazaar-local-env-'));
  try {
    await writeFile(join(directory, '.env.development.local'), 'APP_ORIGIN=https://hastabazaar.com\n');
    await assert.rejects(verifyLocalEnvironmentFiles(directory), /APP_ORIGIN/);
    await writeFile(join(directory, '.env.development.local'), 'APP_ORIGIN=http://localhost:3018\n');
    await writeFile(join(directory, '.dev.vars'), 'SMTP_PASSWORD="hidden-fixture-value"\n');
    await assert.rejects(verifyLocalEnvironmentFiles(directory), (error: Error) => {
      assert.match(error.message, /SMTP_PASSWORD/);
      assert.equal(error.message.includes('hidden-fixture-value'), false);
      return true;
    });
    await writeFile(join(directory, '.dev.vars'), 'HASTABAZAAR_RUNTIME_ENV=local_staging\n');
    await assert.doesNotReject(verifyLocalEnvironmentFiles(directory));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

void test('missing local data stops the check without creating or restoring a staging directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hastabazaar-local-data-'));
  try {
    await assert.rejects(checkLocalData(directory, createLocalEnvironment({})), /staging|missing/i);
    assert.deepEqual(await readdir(directory), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

void test('a valid staging marker without a D1 database is not silently seeded', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hastabazaar-local-missing-db-'));
  try {
    await mkdir(join(directory, '.staging'));
    const marker = JSON.stringify({
      schemaVersion: 1,
      scopeId: 'hastabazaar-v1.2.1-local-staging',
      recordLabel: 'SIMULATED — NOT VALID FOR PRODUCTION',
      projectRelativeRoot: '.staging',
      stateDirectory: 'state',
      mediaDirectory: 'media',
      mailCaptureDirectory: 'mail-capture',
    });
    await writeFile(join(directory, '.staging', 'staging-environment.json'), marker);
    await assert.rejects(checkLocalData(directory, createLocalEnvironment({})), /database|state|missing/i);
    assert.deepEqual(await readdir(join(directory, '.staging')), ['staging-environment.json']);
    assert.equal(await readFile(join(directory, '.staging', 'staging-environment.json'), 'utf8'), marker);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
