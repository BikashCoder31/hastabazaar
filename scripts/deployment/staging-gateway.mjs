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
import { guardedStagingSwitch } from './staging-switch.mjs';

const execute = promisify(execFile);
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
  const { stdout } = await execute('/usr/sbin/cloudlinux-selector', ['restart', '--json', '--interpreter', 'nodejs', '--app-root', 'hastabazaar-staging-app'], { timeout: 60_000, signal: restartSignal });
  assert.equal(JSON.parse(stdout).result, 'success', 'Staging restart failed.');
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
  const runtime = JSON.parse(await readFile(`${tools}/runtime.json`, 'utf8'));
  assert.equal(runtime.DB_NAME, guard.database);
  assert.equal(runtime.DB_USER, 'hastabaz_stageapp');
  assert.equal(runtime.MEDIA_ROOT, guard.media);
  assert.equal(runtime.APP_ORIGIN, guard.origin);
  assert.equal(runtime.EMAIL_DELIVERY_CONFIGURED, 'false');
  assert.equal(runtime.CHECKOUT_CONTACT_POLICY, 'email_only');
  assert.ok(!Object.keys(runtime).some((key) => /SMTP|GOOGLE|PAYMENT|API_KEY|SMS|SUPER_ADMIN/i.test(key)), 'Staging provider credentials are forbidden.');
  const { stdout } = await execute('/usr/sbin/cloudlinux-selector', ['get', '--json', '--interpreter', 'nodejs'], { timeout: 30_000, signal });
  const configuration = JSON.parse(stdout).available_versions['22.23.2'].users.hastabaz.applications['hastabazaar-staging-app'];
  assert.equal(configuration.domain, 'staging.hastabazaar.com');
  assert.equal(configuration.startup_file, 'app.cjs');
  const variables = Object.fromEntries(Object.entries(configuration.env_vars).map(([key, value]) => [key, typeof value === 'string' ? value : value.value]));
  assert.ok(Object.keys(variables).length === Object.keys(runtime).length && Object.entries(runtime).every(([key, value]) => variables[key] === value), 'Passenger environment differs from approved staging bindings.');
  const production = await fetch('https://hastabazaar.com/health', { signal: AbortSignal.timeout(10_000), redirect: 'error' }).then((response) => response.json());
  assert.equal(production.marketplaceReady, true, 'Production must be healthy before staging deployment.');
  signal.throwIfAborted();
  incoming = `${releases}/incoming-${randomUUID()}`;
  await mkdir(incoming, { mode: 0o700 });
  incomingOwned = true;
  const archive = `${incoming}/release.tar.gz`;
  const identity = await receiveStagingPayload(process.stdin, archive, signal);
  const candidate = `${incoming}/application`;
  await mkdir(candidate, { mode: 0o700 });
  await extractStagingArchive(archive, candidate, identity.files);
  signal.throwIfAborted();
  const manifest = JSON.parse(await readFile(`${candidate}/deployment/babal/release-manifest.json`, 'utf8'));
  assert.equal(manifest.release, identity.release);
  await verifyRelease(candidate, identity.files, manifest.migrations.map((migration) => migration.path));
  const target = `${releases}/${identity.release}`;
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
  try {
    const status = await lstat(current);
    assert.ok(status.isSymbolicLink(), 'Staging current target must be a link.');
    const resolved = await realpath(current);
    assert.ok(resolved.startsWith(releases + sep), 'Current staging release escaped its own directory.');
    previous = await readlink(current);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let after;
  await guardedStagingSwitch({
    activate: () => activate(target),
    verify: async () => {
      await restart(signal);
      await health(identity.release);
      after = await fetch('https://hastabazaar.com/health', { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]), redirect: 'error' }).then((response) => response.json());
      assert.equal(after.marketplaceReady, true);
      assert.equal(after.release, production.release, 'Production release changed during staging deployment.');
    },
    rollback: async () => { if (previous) await activate(previous); else await unlink(current); await restart(); },
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
  try {
    if (incomingOwned && await realpath(incoming) === incoming) await rm(incoming, { recursive: true });
  } finally { await lock.close(); await unlink(lockPath); }
}
