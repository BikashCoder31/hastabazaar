import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, lstat, mkdir, open, readFile, readlink, realpath, rename, rm, symlink, unlink } from 'node:fs/promises';
import { sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { extractStagingArchive } from './staging-archive.mjs';
import { assertStagingCommand, receiveStagingPayload } from './staging-protocol.mjs';
import { verifyRelease } from '../release-files.mjs';
import { createStagingPhaseTimer, guardedStagingSwitch } from './staging-switch.mjs';
import { captureStagingWorkers, stopCapturedStagingWorkers } from './staging-workers.mjs';
import { assertStagingRuntime } from './staging-runtime.mjs';
import { assertStagingSelectorConfiguration } from './staging-selector.mjs';

const execute = promisify(execFile);
const timePhase = createStagingPhaseTimer((entry) => console.error(JSON.stringify(entry)));
const home = '/home2/hastabaz';
const tools = `${home}/.hastabazaar-deployment`;
const application = `${home}/hastabazaar-staging-app`;
const releases = `${home}/hastabazaar-staging-releases`;
const current = `${application}/current`;
assertStagingCommand(process.env.SSH_ORIGINAL_COMMAND);
assert.equal(process.platform, 'linux');
assert.equal(await realpath(process.env.HOME), home);
for (const path of [tools, application, releases]) assert.equal(await realpath(path), path);
const guard = JSON.parse(await readFile(`${tools}/staging.json`, 'utf8'));
assert.equal(guard.origin, 'https://staging.hastabazaar.com');
assert.equal(guard.database, 'hastabaz_staging');
assert.equal(guard.media, `${home}/hastabazaar-staging-private-media`);
assert.equal(await realpath(guard.media), guard.media);
const authorization = 'Basic ' + Buffer.from(`${guard.username}:${guard.password}`).toString('base64');
const lockPath = `${tools}/staging.lock`;
const lock = await open(lockPath, 'wx', 0o600);
const cancellation = new AbortController();
const deadline = setTimeout(() => cancellation.abort(new Error('Staging deployment timed out.')), 300_000);
deadline.unref();
const terminate = () => cancellation.abort(new Error('Staging deployment interrupted.'));
process.once('SIGTERM', terminate);
process.once('SIGINT', terminate);
process.once('SIGHUP', terminate);
const signal = cancellation.signal;
let previous = null;
let incoming;
let incomingOwned = false;

async function restart(restartSignal) {
  const workers = await captureStagingWorkers(restartSignal);
  const { stdout } = await execute('/usr/sbin/cloudlinux-selector', ['restart', '--json', '--interpreter', 'nodejs', '--app-root', 'hastabazaar-staging-app'], { timeout: 60_000, signal: restartSignal });
  assert.equal(JSON.parse(stdout).result, 'success', 'Staging restart failed.');
  await stopCapturedStagingWorkers(workers, restartSignal);
}

async function activate(target) {
  const pending = `${application}/current-${randomUUID()}`;
  await symlink(target, pending);
  await rename(pending, current);
}

async function health(release) {
  for (let attempt = 0; attempt < 30; attempt++) {
    signal.throwIfAborted();
    try {
      const response = await fetch(`${guard.origin}/health`, { headers: { Authorization: authorization },
        signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]), redirect: 'error' });
      const state = await response.json();
      if (response.status === 200 && state.marketplaceReady && state.release === release) return;
    } catch { /* Passenger may still be starting after a staging-only restart. */ }
    await delay(1_000);
  }
  throw new Error('Staging HTTPS readiness or release identity failed.');
}

try {
  const production = await timePhase('preflight', async () => {
    const runtime = JSON.parse(await readFile(`${tools}/runtime.json`, 'utf8'));
    assertStagingRuntime(runtime);
    const { stdout } = await execute('/usr/sbin/cloudlinux-selector', ['get', '--json', '--interpreter', 'nodejs'], { timeout: 30_000, signal });
    assertStagingSelectorConfiguration(JSON.parse(stdout), process.versions.node, runtime);
    const health = await fetch('https://hastabazaar.com/health', { signal: AbortSignal.timeout(10_000), redirect: 'error' }).then((response) => response.json());
    assert.equal(health.marketplaceReady, true, 'Production must be healthy before staging deployment.');
    return health;
  });
  signal.throwIfAborted();
  incoming = `${releases}/incoming-${randomUUID()}`;
  await mkdir(incoming, { mode: 0o700 });
  incomingOwned = true;
  const archive = `${incoming}/release.tar.gz`;
  const identity = await timePhase('upload', () => receiveStagingPayload(process.stdin, archive, signal));
  const candidate = `${incoming}/application`;
  await mkdir(candidate, { mode: 0o700 });
  await timePhase('extract', () => extractStagingArchive(archive, candidate, identity.files));
  signal.throwIfAborted();
  const target = `${releases}/${identity.release}`;
  await timePhase('verify_artifact', async () => {
    const manifest = JSON.parse(await readFile(`${candidate}/deployment/babal/release-manifest.json`, 'utf8'));
    assert.equal(manifest.release, identity.release);
    await verifyRelease(candidate, identity.files, manifest.migrations.map((migration) => migration.path));
    let exists = false;
    try { await lstat(target); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (exists) {
      assert.equal(await realpath(target), target, 'Existing staging artifact must not redirect.');
      await verifyRelease(target, identity.files, manifest.migrations.map((migration) => migration.path));
    } else {
      await rename(candidate, target);
    }
    await appendFile(`${tools}/history.jsonl`, JSON.stringify({ event: 'verified', release: identity.release, commit: identity.commit,
      sha256: identity.archiveSha256, time: new Date().toISOString() }) + '\n', { mode: 0o600 });
  });
  try {
    const status = await lstat(current);
    assert.ok(status.isSymbolicLink(), 'Staging current target must be a link.');
    const resolved = await realpath(current);
    assert.ok(resolved.startsWith(releases + sep), 'Current staging release escaped its own directory.');
    previous = await readlink(current);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let after;
  await guardedStagingSwitch({
    activate: () => timePhase('activate', () => activate(target)),
    verify: async () => {
      await timePhase('restart', () => restart(signal));
      await timePhase('readiness', () => health(identity.release));
      await timePhase('production_release_check', async () => {
        after = await fetch('https://hastabazaar.com/health', { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]), redirect: 'error' }).then((response) => response.json());
        assert.equal(after.marketplaceReady, true);
        assert.equal(after.release, production.release, 'Production release changed during staging deployment.');
      });
    },
    rollback: () => timePhase('rollback', async () => {
      if (previous) await activate(previous); else await unlink(current);
      await restart();
    }),
  }, signal);
  await appendFile(`${tools}/history.jsonl`, JSON.stringify({ event: 'activated', release: identity.release, time: new Date().toISOString() }) + '\n');
  console.log(JSON.stringify({ staging: guard.origin, release: identity.release, commit: identity.commit,
    productionRelease: after.release, productionUntouched: true, databaseMigrations: 0 }));
} catch (error) {
  console.error('Staging deployment rejected:', error.message);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  process.removeListener('SIGTERM', terminate);
  process.removeListener('SIGINT', terminate);
  process.removeListener('SIGHUP', terminate);
  await timePhase('cleanup', async () => {
    try {
      if (incomingOwned && await realpath(incoming) === incoming) await rm(incoming, { recursive: true });
    } finally { await lock.close(); await unlink(lockPath); }
  });
}
