import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import test from 'node:test';

import {
  assertDisposableStagingContext,
  assertResetConfirmation,
  readAndVerifyStagingMarker,
  resolveDisposableStagingPaths,
  stagingMarker,
} from '../scripts/staging/guards.mjs';

const safeEnvironment = {
  HASTABAZAAR_RUNTIME_ENV: 'local_staging',
  NODE_ENV: 'development',
  APP_ORIGIN: 'http://127.0.0.1:3000',
  HASTABAZAAR_MAIL_MODE: 'capture',
  HASTABAZAAR_PAYMENT_MODE: 'simulated',
  HASTABAZAAR_RECIPIENT_DOMAIN: 'local.hastabazaar.test',
};

void test('disposable staging accepts only loopback, captured mail, and simulated payments', () => {
  assert.equal(
    assertDisposableStagingContext(safeEnvironment).recordLabel,
    'SIMULATED — NOT VALID FOR PRODUCTION',
  );
  assert.throws(() =>
    assertDisposableStagingContext({ ...safeEnvironment, HASTABAZAAR_RUNTIME_ENV: 'production' }),
  );
  assert.throws(() =>
    assertDisposableStagingContext({ ...safeEnvironment, APP_ORIGIN: 'https://hastabazaar.com' }),
  );
  assert.throws(() =>
    assertDisposableStagingContext({ ...safeEnvironment, HASTABAZAAR_MAIL_MODE: 'smtp' }),
  );
  assert.throws(() =>
    assertDisposableStagingContext({ ...safeEnvironment, DB_HOST: 'db.example.test' }),
  );
});

void test('state, media, mail, and recovery targets remain inside the exact project staging root', () => {
  const project = join(tmpdir(), 'hastabazaar-guard-project');
  const paths = resolveDisposableStagingPaths(project, {});
  assert.equal(paths.root, join(project, '.staging'));
  for (const path of [paths.state, paths.media, paths.mailCapture, paths.recovery]) {
    assert.ok(path.startsWith(`${paths.root}${sep}`));
  }
  assert.throws(() =>
    resolveDisposableStagingPaths(project, { HASTABAZAAR_STAGING_ROOT: join(project, '..') }),
  );
});

void test('marker verification rejects missing, mismatched, and production-shaped state', async () => {
  const project = await mkdtemp(join(tmpdir(), 'hastabazaar-stage-'));
  try {
    const paths = resolveDisposableStagingPaths(project, {});
    await assert.rejects(() => readAndVerifyStagingMarker(paths));
    await mkdir(paths.root, { recursive: true });
    await writeFile(paths.marker, JSON.stringify({ ...stagingMarker(paths), scopeId: 'wrong' }));
    await assert.rejects(() => readAndVerifyStagingMarker(paths));
    await writeFile(paths.marker, JSON.stringify(stagingMarker(paths)));
    assert.equal((await readAndVerifyStagingMarker(paths)).scopeId, 'hastabazaar-v1.2.1-local-staging');
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

void test('reset requires an exact human confirmation and never targets the project or staging root', () => {
  assert.throws(() => assertResetConfirmation([]));
  assert.throws(() => assertResetConfirmation(['--confirm-reset=yes']));
  assert.doesNotThrow(() =>
    assertResetConfirmation(['--confirm-reset=HASTABAZAAR-LOCAL-STAGING']),
  );
  const paths = resolveDisposableStagingPaths(join(tmpdir(), 'hastabazaar-reset-project'), {});
  assert.notEqual(paths.state, paths.root);
  assert.notEqual(paths.media, paths.root);
  assert.notEqual(paths.mailCapture, paths.root);
});
