import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, readlink, realpath, rm, writeFile } from 'node:fs/promises';
import { createConnection as connectLoopback, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Connection, Pool } from 'mysql2/promise';
import type { ConfiguredField } from '../../lib/forms/types';
import { assertRequiredNativeResults } from '../recovery/native-test-results.mjs';
import { bindSelectedBrowserViews } from '../recovery/selected-native-views.mjs';
import { verifyArtifactIdentity, verifySelectedPackage, assertSelectedConstraints, nativeReadinessAdapter } from './current-artifact-identity.mjs';
import {
  registrationTables, registrationSnapshot, assertOriginalRows, prepareRegistrationActors, preparePublicShopOwner,
  runRegistrationBrowser, retainRegistrationMedia, snapshotFormLoadObservations, assertPreservedWithFormLoads,
} from './registration-browser-fixture.mjs';
import { prepareRecordedWorkActors, runRecordedWorkBrowser } from './recorded-work-browser-fixture.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const catalogName = 'contact and catalog controls fit a 232px viewport without hiding real fields';
const summaryName = 'populated summary fits desktop and small screens';
// One registration journey application and three recorded-work applications
// produce these trigger rows. The latter each emit two moderation transitions.
const sourceAppends = {
  seller_protected_revisions: 4, seller_public_profile_states: 4, review_tasks: 4, moderation_events: 6,
  seller_agreement_acceptance_history: 4,
};
const snapshotTables = [...registrationTables, ...Object.keys(sourceAppends)];
const publicShopFixtureAppends: Readonly<Record<string, number>> = {
  users: 1, user_roles: 2, user_credentials: 1, account_email_verifications: 1,
  seller_profiles: 1, seller_protected_revisions: 1,
  seller_public_profile_states: 1, review_tasks: 1,
};

export function assertLoopbackOrigin(value: string): string {
  const url = new URL(value);
  assert.ok(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.origin === value &&
    !url.username && !url.password && url.port && url.port !== '3018', 'Only a new owned HTTP loopback origin is permitted');
  return url.origin;
}

export function assertHostedBrowserState(value: unknown, origin: string): void {
  const state = value as { cookies?: Record<string, unknown>[]; origins?: unknown[] };
  assertLoopbackOrigin(origin);
  assert.ok(state && Object.keys(state).sort().join(',') === 'cookies,origins' &&
    Array.isArray(state.origins) && state.origins.length === 0 && Array.isArray(state.cookies) && state.cookies.length === 1,
  'Hosted browser state must contain only one session cookie');
  const cookie = state.cookies[0];
  assert.ok(cookie.name === 'hastabazaar_session' && typeof cookie.value === 'string' && cookie.value.length >= 16 &&
    cookie.domain === new URL(origin).hostname && cookie.path === '/' && cookie.secure === true && cookie.httpOnly === true &&
    cookie.sameSite === 'Lax' && typeof cookie.expires === 'number' && cookie.expires > Date.now() / 1000,
  'The genuine hosted session must remain Secure, HttpOnly and unexpired');
}

/** Browser/test children cannot inherit native, database, mail, auth or deployment authority. */
export function safeChildEnvironment(source: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { NODE_ENV: 'development' };
  for (const name of ['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR',
    'LANG', 'LC_ALL', 'PLAYWRIGHT_MODULE', 'CHROME_PATH']) if (source[name]) result[name] = source[name];
  return result;
}

type OwnedChild = { process: ChildProcess; output: string; exited: Promise<number | null>; error?: Error; truncated?: boolean };

type CleanupStage = 'resource-close' | 'ownership-records' | 'ownership-record' | 'leader-identity' |
  'leader-executable' | 'leader-arguments' | 'leader-transition' | 'proc-enumeration' | 'proc-identity' |
  'group-identity' | 'group-signal' | 'group-stopped' | 'helper-finalize';
const cleanupErrnos = new Set(['ENOENT', 'ESRCH', 'EACCES', 'EPERM', 'EIO', 'ENOTDIR', 'ELOOP', 'EBADF',
  'EINVAL', 'EMFILE', 'ENFILE', 'ENOMEM', 'EBUSY', 'ENOSYS', 'ETIMEDOUT', 'EINTR']);
const classifiedCleanupFailures = new WeakMap<object, readonly string[]>();

/** Read only own data properties: even hostile error getters/proxies cannot interrupt other owners. */
function cleanupFailure(stage: CleanupStage, failure: unknown): Error {
  const diagnostics = new Set<string>(), seen = new WeakSet<object>();
  const property = (value: object, key: string): unknown => {
    try { const descriptor = Object.getOwnPropertyDescriptor(value, key); return descriptor && 'value' in descriptor ? descriptor.value : undefined; }
    catch { return undefined; }
  };
  const visit = (value: unknown, depth: number) => {
    if (diagnostics.size >= 8) return;
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) { diagnostics.add(`${stage}:unknown`); return; }
    if (seen.has(value)) return;
    seen.add(value);
    const known = classifiedCleanupFailures.get(value);
    if (known) { for (const diagnostic of known) { if (diagnostics.size >= 8) break; diagnostics.add(diagnostic); } return; }
    const code = property(value, 'code');
    diagnostics.add(`${stage}:${code === 'ERR_ASSERTION' ? 'assertion' : typeof code === 'string' && cleanupErrnos.has(code) ? code : 'unknown'}`);
    if (depth >= 3) return;
    const nested = property(value, 'errors');
    try {
      if (Array.isArray(nested)) for (let index = 0; index < 4; index++) {
        const child = property(nested, String(index)); if (child !== undefined) visit(child, depth + 1);
      }
    } catch { diagnostics.add(`${stage}:unknown`); }
    const cause = property(value, 'cause'); if (cause !== undefined) visit(cause, depth + 1);
  };
  visit(failure, 0);
  const result = new Error(`An owned resource could not be safely closed [${[...diagnostics].join(',')}]`);
  classifiedCleanupFailures.set(result, [...diagnostics]);
  return result;
}
async function atCleanupStage<T>(stage: CleanupStage, work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) { throw cleanupFailure(stage, error); }
}

/** A refusal for one owner cannot abandon another owner or discard private state. */
export async function closeOwnedResources(resources: readonly { close(): Promise<unknown> }[], onClosed?: () => Promise<void>): Promise<void> {
  const errors: Error[] = [];
  for (const resource of resources) {
    try { await resource.close(); } catch (error) { errors.push(cleanupFailure('resource-close', error)); }
  }
  if (errors.length) throw new AggregateError(errors,
    `Owned process cleanup failed; private ownership state retained: ${cleanupFailure('resource-close', { errors }).message}`);
  await onClosed?.();
}

class OwnedProcesses {
  private children: OwnedChild[] = [];
  private closing = false;
  private cleanup: Promise<void> | undefined;
  constructor(private graceMilliseconds = 5_000) {}
  start(command: string, args: string[], options: SpawnOptions): OwnedChild {
    assert.equal(this.closing, false, 'Cannot acquire a child after cleanup starts');
    const child = spawn(command, args, { ...options, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    // Track immediately, before any await or setup which can fail.
    const owned: OwnedChild = { process: child, output: '', exited: Promise.resolve(null) };
    this.children.push(owned);
    owned.exited = new Promise((done) => {
      child.once('error', (error) => { owned.error = error; done(null); });
      child.once('close', (code) => done(code));
    });
    for (const stream of [child.stdout, child.stderr]) stream?.on('data', (chunk) => {
      const next = owned.output + String(chunk);
      if (next.length > 4 * 1024 * 1024) owned.truncated = true;
      owned.output = next.slice(-4 * 1024 * 1024);
    });
    return owned;
  }
  async wait(child: OwnedChild, milliseconds: number): Promise<{ code: number | null; output: string }> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const code = await Promise.race([child.exited, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Owned child deadline exceeded')), milliseconds);
      })]);
      if (child.error) throw child.error;
      assert.ok(!child.truncated, 'Owned child diagnostic output exceeded its bound');
      return { code, output: child.output };
    } finally { clearTimeout(timer); }
  }
  async run(command: string, args: string[], options: SpawnOptions, milliseconds = 90_000) {
    return this.wait(this.start(command, args, options), milliseconds);
  }
  private alive(child: OwnedChild): boolean {
    if (!child.process.pid) return false;
    try { process.kill(process.platform === 'win32' ? child.process.pid : -child.process.pid, 0); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
  }
  close(): Promise<void> {
    this.closing = true;
    return this.cleanup ??= closeOwnedResources([...this.children].reverse().map((child) => ({ close: async () => {
      const signal = (value: NodeJS.Signals) => {
        try { process.kill(process.platform === 'win32' ? child.process.pid! : -child.process.pid!, value); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
      };
      if (this.alive(child)) {
        signal('SIGTERM');
        for (let elapsed = 0; elapsed < this.graceMilliseconds && this.alive(child); elapsed += 100) await delay(100);
        if (this.alive(child)) signal('SIGKILL');
      }
      let validationError: unknown;
      try { await this.wait(child, 5_000); } catch (error) { validationError = error; }
      for (let attempt = 0; attempt < 50 && this.alive(child); attempt++) await delay(100);
      assert.equal(this.alive(child), false, 'Owned child process group did not stop');
      if (validationError) throw validationError;
    } })));
  }
}

export async function withOwnedProcesses<T>(work: (owner: OwnedProcesses) => Promise<T>, graceMilliseconds = 5_000): Promise<T> {
  const owner = new OwnedProcesses(graceMilliseconds);
  try { return await work(owner); } finally { await owner.close(); }
}

function contained(root: string, path: string) {
  const part = relative(root, path);
  return part !== '' && !part.startsWith(`..${sep}`) && part !== '..' && !isAbsolute(part);
}
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

type LinuxIdentity = { pid: number; uid: number; pgid: number; session: number; startTicks: string };
export function assertRecordedIdentity(record: LinuxIdentity, observed: LinuxIdentity): void {
  assert.ok(Number.isSafeInteger(record.pid) && record.pid > 1 && Number.isSafeInteger(record.uid) && record.uid >= 0 &&
    record.pgid === record.pid && record.session === record.pid && /^[1-9][0-9]*$/.test(record.startTicks), 'Malformed owned browser process identity');
  assert.deepEqual(observed, record, 'Owned browser process identity changed; signaling is refused');
}
async function linuxIdentity(pid: number): Promise<LinuxIdentity> {
  const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
  const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
  assert.ok(fields.length >= 20 && /^[0-9]+$/.test(fields[19]), 'Linux process identity is unavailable');
  return { pid, uid: (await lstat(`/proc/${pid}`)).uid, pgid: Number(fields[2]), session: Number(fields[3]), startTicks: fields[19] };
}

/** Playwright detaches Chromium. Record its group before exec without changing
 * the official executable or a single browser argument. Never signal by name/port. */
export async function createRecordedBrowserLauncher(root: string, executable: string) {
  assert.equal(process.platform, 'linux');
  const directory = resolve(root, 'browser-processes'), wrapper = resolve(root, 'owned-chromium');
  assert.ok(contained(root, directory) && contained(root, wrapper));
  const binary = await realpath(executable), shell = await realpath('/bin/sh'), uid = process.getuid!();
  assert.ok(isAbsolute(binary) && (await lstat(binary)).isFile());
  await mkdir(directory, { mode: 0o700 });
  const nonce = randomUUID();
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const script = `#!/bin/sh
set -eu
set -f
umask 077
record() {
  tail=\${1##*) }
  set -- $tail
  pgid=$3
  session=$4
  shift 19
  start=$1
  uid=
  while read -r label first rest; do
    if [ "$label" = 'Uid:' ]; then uid=$first; break; fi
  done < /proc/$$/status
  [ "$uid" = '${uid}' ] && [ "$pgid" = "$$" ] && [ "$session" = "$$" ]
  case "$start" in ''|*[!0-9]*) exit 71;; esac
  set -C
  printf '%s %s %s %s %s %s\\n' "$$" "$uid" "$pgid" "$session" "$start" '${nonce}' > ${quote(directory)}/$$.pid
}
IFS= read -r identity < /proc/$$/stat
record "$identity"
exec ${quote(binary)} "$@"
`;
  await writeFile(wrapper, script, { flag: 'wx', mode: 0o700 });
  const readRecords = async (): Promise<{ records: LinuxIdentity[]; errors: unknown[] }> => {
    const info = await lstat(directory);
    assert.ok(info.isDirectory() && !info.isSymbolicLink() && info.uid === uid && (info.mode & 0o077) === 0);
    const records: LinuxIdentity[] = [];
    const errors: unknown[] = [];
    for (const name of await readdir(directory)) {
      try {
        assert.match(name, /^[1-9][0-9]*\.pid$/);
        const handle = await open(resolve(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const info = await handle.stat();
          assert.ok(info.isFile() && info.uid === uid && (info.mode & 0o077) === 0 && info.size > 0 && info.size < 256);
          const fields = (await handle.readFile('utf8')).trim().split(' ');
          assert.ok(fields.length === 6 && fields[5] === nonce && fields.slice(0, 5).every((value) => /^[0-9]+$/.test(value)), 'Malformed browser ownership record');
          const record = { pid: Number(fields[0]), uid: Number(fields[1]), pgid: Number(fields[2]), session: Number(fields[3]), startTicks: fields[4] };
          assert.equal(`${record.pid}.pid`, name); assert.equal(record.uid, uid); assertRecordedIdentity(record, record);
          records.push(record);
        } finally { await handle.close(); }
      } catch (error) { errors.push(cleanupFailure('ownership-record', error)); }
    }
    return { records, errors };
  };
  const members = async (record: LinuxIdentity) => {
    let stage: CleanupStage = 'leader-identity';
    try {
      let leader: LinuxIdentity | undefined;
      try { leader = await linuxIdentity(record.pid); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (leader) {
        assertRecordedIdentity(record, leader);
        stage = 'leader-executable';
        const currentExecutable = await readlink(`/proc/${record.pid}/exe`).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return ''; });
        if (currentExecutable) {
          stage = 'leader-arguments';
          const arguments_ = await readFile(`/proc/${record.pid}/cmdline`).then((bytes) => bytes.toString().split('\0')).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return []; });
          if (arguments_.length && currentExecutable !== binary && !(currentExecutable === shell && arguments_[1] === wrapper)) {
            // exec can occur between reading exe and cmdline. Authenticate the same
            // start identity again and permit only the known shell -> binary transition.
            stage = 'leader-transition';
            try {
              assertRecordedIdentity(record, await linuxIdentity(record.pid));
              assert.equal(await readlink(`/proc/${record.pid}/exe`), binary, 'Recorded browser executable changed');
            } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
          }
        }
      }
      stage = 'proc-enumeration';
      const result: LinuxIdentity[] = [];
      for (const name of await readdir('/proc')) if (/^[1-9][0-9]*$/.test(name)) {
        stage = 'proc-identity';
        let current: LinuxIdentity;
        try { current = await linuxIdentity(Number(name)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
        if (current.pgid !== record.pgid) continue;
        stage = 'group-identity';
        assert.ok(current.uid === record.uid && current.session === record.session && BigInt(current.startTicks) >= BigInt(record.startTicks), 'Recorded browser group identity is uncertain');
        result.push(current);
      }
      return result;
    } catch (error) { throw cleanupFailure(stage, error); }
  };
  let cleanup: Promise<number> | undefined;
  return { executablePath: wrapper, close() {
    return cleanup ??= (async () => {
      const { records, errors } = await atCleanupStage('ownership-records', readRecords);
      await closeOwnedResources([
        ...errors.map((error) => ({ async close() { throw error; } })),
        ...records.map((record) => ({ close: () => atCleanupStage('group-stopped', async () => {
          if (!(await members(record)).length) return;
          // Re-read start identity, UID, PGID/session and executable immediately before each signal.
          const signal = async (value: NodeJS.Signals) => {
            if (!(await members(record)).length) return;
            try { process.kill(-record.pgid, value); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw cleanupFailure('group-signal', error); }
          };
          await signal('SIGTERM');
          for (let attempt = 0; attempt < 50 && (await members(record)).length; attempt++) await delay(100);
          if ((await members(record)).length) await signal('SIGKILL');
          for (let attempt = 0; attempt < 50 && (await members(record)).length; attempt++) await delay(100);
          assert.equal((await members(record)).length, 0, 'Recorded owned browser group survived cleanup');
        }) })),
      ]);
      return records.length;
    })();
  } };
}

async function main() {
  assert.equal(process.platform, 'linux', 'Packaged browser acceptance requires the owned Linux native runner');
  assert.equal(process.argv.length, 2, 'No database or target arguments are accepted');
  assert.equal(resolve(process.cwd()), project);
  let root: string | undefined;
  let evidence: string | undefined;
  let verification: Record<string, unknown> | undefined;
  let registrationMediaManifestSha256: string | undefined;
  let recordedBrowsers: Awaited<ReturnType<typeof createRecordedBrowserLauncher>> | undefined;
  let phase = 'ownership';
  let activeOwner: OwnedProcesses | undefined;
  const pools: Pool[] = [];
  let restorePoolFactory: (() => void) | undefined;
  let source: Connection | undefined;
  const secrets: string[] = [];
  const redacted = (value: string) => secrets.reduce((text, secret) => text.replaceAll(secret, '[redacted]'), value);
  const interrupted = () => { throw new Error('Packaged browser helper interrupted'); };
  // Signal handlers route cancellation through the same outer cleanup, including child groups.
  const cancellation = new AbortController();
  let cancellationCleanup: Promise<void> | undefined;
  const cancel = () => {
    cancellation.abort(); cancellationCleanup ??= closeOwnedResources([...(activeOwner ? [activeOwner] : []), ...(recordedBrowsers ? [recordedBrowsers] : [])]);
    void cancellationCleanup?.catch(() => {}); // Awaited and propagated by outer finally.
  };
  process.once('SIGTERM', cancel); process.once('SIGINT', cancel);
  try {
    const { stagingNativeFixture } = await import('../../tests/helpers/staging-native-fixture');
    const fixture = await stagingNativeFixture(); // Authenticates container/marker; never resets or seeds.
    const key = process.env.HASTABAZAAR_NATIVE_SECURITY_KEY;
    assert.ok(key && /^[A-Za-z0-9_-]{43}$/.test(key), 'Generated native security key is required');
    secrets.push(key, fixture.password, process.env.HATSKALA_NATIVE_TOKEN!);
    assert.equal(process.env.HASTABAZAAR_RUNTIME_ENV, 'local_staging');
    const artifact = await realpath(process.env.HASTABAZAAR_NATIVE_ARTIFACT_DIRECTORY ?? 'missing');
    const admitted = await verifyArtifactIdentity({ project, artifactDirectory: artifact });
    evidence = resolve(artifact, 'browser-evidence');
    await mkdir(evidence, { mode: 0o700 }); // Exclusive; a prior run is never overwritten.
    root = await mkdtemp(resolve(tmpdir(), 'hb-browser-'));
    assert.ok(contained(await realpath(tmpdir()), await realpath(root)));
    const ownedRoot = root;
    const own = (path: string) => { const target = resolve(ownedRoot, path); assert.ok(contained(ownedRoot, target)); return target; };
    const inventory = admitted.inventory;
    assert.match(inventory.archive, /^hastabazaar-release-[a-z0-9._-]+\.tar\.gz$/);
    const archive = resolve(artifact, inventory.archive);
    assert.ok((await lstat(archive)).isFile() && !(await lstat(archive)).isSymbolicLink());
    assert.equal(digest(await readFile(archive)), inventory.archiveSha256);
    const packageRoot = own('package'); await mkdir(packageRoot, { mode: 0o700 });
    const childTemporary = own('tmp'); await mkdir(childTemporary, { mode: 0o700 });
    const childEnv = { ...safeChildEnvironment(process.env), TEMP: childTemporary, TMP: childTemporary, TMPDIR: childTemporary };
    await withOwnedProcesses(async (owner) => {
      activeOwner = owner;
      if (cancellation.signal.aborted) interrupted();
      phase = 'verified extraction';
      const listing = await owner.run('tar', ['-tzf', archive], { env: childEnv });
      assert.equal(listing.code, 0);
      for (const entry of listing.output.trim().split('\n')) {
        const name = entry.replace(/^\.\//, '').replace(/\/$/, '');
        if (!name || name === '.') continue;
        assert.ok(!isAbsolute(name) && !/[\\:]/.test(name) && !name.split('/').some((part) => part === '..' || part === '.' || !part), 'Unsafe archive path');
      }
      const types = await owner.run('tar', ['-tvzf', archive], { env: childEnv });
      assert.equal(types.code, 0);
      assert.ok(types.output.trim().split('\n').every((line) => /^[d-]/.test(line)), 'Archive links and special entries are forbidden');
      assert.equal((await owner.run('tar', ['-xzf', archive, '--no-same-owner', '-C', packageRoot], { env: childEnv })).code, 0);
      const manifest = JSON.parse(await readFile(resolve(packageRoot, 'deployment/babal/release-manifest.json'), 'utf8'));
      const { verifyRelease } = await import('../release-files.mjs');
      await verifyRelease(packageRoot, inventory.files, manifest.migrations.map((item: { path: string }) => item.path));
      const currentPackage = process.env.HASTABAZAAR_CURRENT_ARTIFACT_NATIVE === '1'
        ? await verifySelectedPackage(packageRoot, inventory) : null;
      assert.ok(inventory.artifactKind !== 'local-linux-candidate' || currentPackage, 'Local artifact requires selected-schema binding');
      await assert.rejects(lstat(resolve(packageRoot, '.staging')), { code: 'ENOENT' });

      phase = 'append fictional optional Admin and real form publications';
      const { default: mysql } = await import('mysql2/promise');
      const originalCreatePool = mysql.createPool;
      mysql.createPool = ((...args: Parameters<typeof originalCreatePool>) => {
        const pool = originalCreatePool(...args); pools.push(pool); return pool;
      }) as typeof originalCreatePool;
      restorePoolFactory = () => { mysql.createPool = originalCreatePool; };
      source = await mysql.createConnection(fixture);
      let selectedViews: Awaited<ReturnType<typeof bindSelectedBrowserViews>> | undefined;
      if (currentPackage) {
        await assertSelectedConstraints(source, currentPackage.manifest);
        const { inspectReadiness } = await import('../../lib/operations/readiness');
        assert.deepEqual(await inspectReadiness(nativeReadinessAdapter(source) as unknown as D1Database,'mariadb',currentPackage.manifest),{ready:true,missing:[]});
        const marker: { id: string } = JSON.parse(await readFile(process.env.HATSKALA_NATIVE_MARKER!, 'utf8'));
        assert.match(marker.id, /^[a-f0-9]{64}$/);
        const attestOwner = async () => {
          assert.deepEqual(await stagingNativeFixture(), fixture);
          const [container] = JSON.parse(execFileSync('docker', ['inspect', '--type', 'container', marker.id], { encoding: 'utf8', timeout: 30_000 }));
          assert.equal(container.Id, marker.id);
          assert.equal(container.State.Running, true);
          assert.equal(container.Config.Labels['codex.native-owner'], process.env.HATSKALA_NATIVE_TOKEN);
        };
        selectedViews = await bindSelectedBrowserViews({ connection: source, openReference: () => mysql.createConnection(fixture),
          database: fixture.database, selected: currentPackage, assertOwned: attestOwner, signal: cancellation.signal });
      }
      const { captureNativeInventory } = await import('../recovery/native-inventory.mjs');
      const before = await captureNativeInventory(source, selectedViews);
      const originalFormLoads = await snapshotFormLoadObservations(source);
      const setupTables = [...snapshotTables, 'users', 'user_roles', 'user_credentials'];
      const registrationBefore = await registrationSnapshot(source, setupTables);
      const { env } = await import('../../lib/runtime/node-bindings');
      const db = env.DB;
      const { SecurityStore, accountSecurityKey, SECURITY_MANIFEST_KEY } = await import('../../lib/security/store');
      const { passwordRecord, verifyPassword, createHostedSessionForUser, getHostedIdentity, hostedSessionCookieName } = await import('../../lib/auth/hosted-session');
      const store = new SecurityStore(db, key, true);
      const publicOwner = await preparePublicShopOwner(db, secret => secrets.push(secret));
      const registrationWithPublicShop = await registrationSnapshot(source, setupTables);
      for (const table of setupTables) {
        const original = registrationBefore.get(table)!;
        const seeded = registrationWithPublicShop.get(table)!;
        assertOriginalRows(original, seeded);
        assert.equal(seeded.length - original.length, publicShopFixtureAppends[table] ?? 0, `Unexpected public shop fixture appends: ${table}`);
      }
      const oldManifest = await store.readManifest(); assert.ok(oldManifest);
      const oldPrivate = await db.prepare("SELECT `key`,value,updated_at FROM marketplace_settings WHERE `key`<>? ORDER BY BINARY `key`").bind(SECURITY_MANIFEST_KEY).all<{ key: string; value: string; updated_at: number }>();
      const actor = await db.prepare("SELECT u.id FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.status='active' AND r.role='super_admin' ORDER BY u.id LIMIT 1").first<{ id: string }>();
      assert.ok(actor);
      const authority = await store.readAccount(actor.id); assert.equal(authority?.value.status, 'active'); assert.ok(authority);
      const id = `browser-admin-${randomUUID()}`, now = Date.now();
      const password = Buffer.from(randomBytes(32)).toString('base64url'); secrets.push(password);
      const credential = await passwordRecord(password);
      assert.equal(await verifyPassword(password, credential.hash, credential.salt), true);
      const guard = randomUUID();
      await store.registerStaff(id, now, [
        db.prepare("INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='super_admin') AND EXISTS(SELECT 1 FROM marketplace_settings WHERE `key`=? AND BINARY value=BINARY ?) THEN 1 ELSE 0 END").bind(guard, actor.id, accountSecurityKey(actor.id), authority.raw),
        db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guard),
        db.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,locale,created_at,updated_at) VALUES(?,?,?,?,'active','en',?,?)").bind(id, `native-browser:${id}`, `${id}@example.test`, 'Fictional browser Admin', now, now),
        db.prepare("INSERT INTO user_roles(user_id,role,assigned_by,assigned_at) VALUES(?,'admin',?,?)").bind(id, actor.id, now),
        db.prepare('INSERT INTO user_credentials(user_id,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id, credential.hash, credential.salt, now, now),
        db.prepare('INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES(?,?,1,?,?)').bind(id, JSON.stringify(['catalog.manage', 'seller.application.review']), actor.id, now),
      ]);
      assert.equal((await store.readAccount(id))?.value.status, 'pending');
      const token = await createHostedSessionForUser(db, id, now, { passwordHash: credential.hash, securityKey: key, initialized: true });
      secrets.push(token);
      const registrationAccounts = await prepareRegistrationActors(db);
      secrets.push(...registrationAccounts.map(account => account.password));
      assert.equal((await getHostedIdentity(db, new Headers({ cookie: `${hostedSessionCookieName}=${token}` }), now, { securityKey: key, initialized: true, activity: false }))?.userId, `native-browser:${id}`);

      const { validateFormDraft } = await import('../../lib/forms/validation');
      const { FORM_REGISTRY } = await import('../../lib/forms/registry');
      const { coreFormContract } = await import('../../lib/forms/core-contracts');
      const { getRegisteredSellerTerms } = await import('../../lib/db/repositories/marketplace-settings');
      const clock = await db.prepare("SELECT unixepoch('now') * 1000 AS now").first<{ now: number }>();
      assert.ok(clock && Number.isSafeInteger(Number(clock.now)));
      const registeredTerms = await getRegisteredSellerTerms(db, Number(clock.now));
      assert.equal(/^[a-f0-9]{64}$/.test(registeredTerms.context), true, 'Current Registered Seller terms are required');
      assert.ok(registeredTerms.versionId, 'The fixture must publish the agreed standard commission before registering');
      const { resolvePublishedForm } = await import('../../lib/forms/runtime');
      const { saveFormDraft, publishFormDraft } = await import('../../lib/db/repositories/form-catalog');
      const formsWithBrowserNote = new Set(['public.contact', 'staff.catalog']);
      const fixtureForms = [...new Set([...formsWithBrowserNote, ...Object.keys(FORM_REGISTRY).filter(formId => !coreFormContract(formId))])];
      assert.ok(fixtureForms.includes('identity.login-password'));
      for (const formId of fixtureForms) {
        const history = await db.prepare('SELECT status,config_json FROM form_config_versions WHERE form_id=? ORDER BY version').bind(formId).all<{ status: string; config_json: string }>();
        for (const row of history.results) validateFormDraft(formId, JSON.parse(row.config_json));
        if (!history.results.some((row) => row.status === 'published')) {
          assert.equal(history.results.length, 0, 'Existing unpublished history requires review: ' + formId);
          let fields: ConfiguredField[] = [];
          if (formsWithBrowserNote.has(formId)) {
            fields = FORM_REGISTRY[formId].baseFields.filter((field) => field.capability !== 'protected' && field.required !== undefined)
              .map((field, order) => ({ id: field.key, key: field.key, type: field.type, label: field.label, required: field.required,
                status: field.status, order, ...(field.choices ? { choices: field.choices } : {}),
                ...(field.min !== undefined ? { min: field.min } : {}), ...(field.max !== undefined ? { max: field.max } : {}),
                ...(field.integerOnly !== undefined ? { integerOnly: field.integerOnly } : {}) } as ConfiguredField));
            fields.push({ id: 'browser_fixture_note', key: 'browser_fixture_note', type: 'short_text',
              label: 'Fictional browser note', required: false, order: fields.length, status: 'active' });
          }
          const config = validateFormDraft(formId, { formId, fields });
          const draft = await saveFormDraft(db, { formId, actorId: actor.id, actorRole: 'super_admin', expectedPublishedVersion: 0, config, reason: 'Fictional packaged browser acceptance', requestId: randomUUID(), now });
          await publishFormDraft(db, { formId, draftId: draft.id, actorId: actor.id, actorRole: 'super_admin', expectedPublishedVersion: 0, expectedDraftRevision: draft.revision, reason: 'Fictional packaged browser acceptance', requestId: randomUUID(), now: now + 1 });
        }
        await resolvePublishedForm(db, formId);
      }
      phase = 'protected packaged policy recovery';
      const listener = createServer();
      const port = await new Promise<number>((done, reject) => {
        listener.once('error', reject);
        listener.listen(0, '127.0.0.1', () => done((listener.address() as { port: number }).port));
      });
      await new Promise<void>((done, reject) => listener.close((error) => error ? reject(error) : done()));
      const origin = assertLoopbackOrigin(`http://127.0.0.1:${port}`);
      const media = own('media'); await mkdir(media, { mode: 0o700 });
      const productionEnv: NodeJS.ProcessEnv = { ...childEnv, NODE_ENV: 'production', HASTABAZAAR_RUNTIME_ENV: 'production',
        APP_ORIGIN: 'https://native-browser.example.test', APP_ALLOWED_ORIGINS: origin,
        HASTABAZAAR_SECURITY_KEY: key, HASTABAZAAR_SECURITY_POLICY_ROOT: own('policy'), MEDIA_ROOT: media,
        DB_HOST: fixture.host, DB_PORT: String(fixture.port), DB_NAME: fixture.database, DB_USER: fixture.user, DB_PASSWORD: fixture.password,
        EMAIL_DELIVERY_CONFIGURED: 'false', HOST: '127.0.0.1', PORT: String(port) };
      for (const operation of ['--recover-existing-host', '--check-readiness']) {
        const result = await owner.run(process.execPath, ['hosted-security.mjs', operation], { cwd: packageRoot, env: productionEnv }, 30_000);
        assert.equal(result.code, 0, `Packaged hosted-security ${operation} failed; private diagnostics withheld`);
      }
      // The recovered host must be ready before the test intentionally adds a
      // pending Super Admin. Keep the preparation pool open for those writes.
      const recordedWorkAccounts = await prepareRecordedWorkActors(db, store, actor.id);
      secrets.push(...[...recordedWorkAccounts.staff, ...recordedWorkAccounts.applicants].map(account => account.password));
      const closingPools = [...pools];
      const closedPools = await Promise.allSettled(closingPools.map((pool) => pool.end()));
      pools.splice(0, pools.length, ...closingPools.filter((_, index) => closedPools[index].status === 'rejected'));
      assert.equal(pools.length, 0, 'Every preparation pool must close before packaged browser activity');
      restorePoolFactory(); restorePoolFactory = undefined;

      const state = { cookies: [{ name: hostedSessionCookieName, value: token, domain: '127.0.0.1', path: '/', secure: true,
        httpOnly: true, sameSite: 'Lax', expires: Math.floor(now / 1000) + 600 }], origins: [] };
      assertHostedBrowserState(state, origin);
      const statePath = own('admin-state.json'); await writeFile(statePath, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
      const catalog = own('catalog'), summary = own('summary'); await mkdir(catalog); await mkdir(summary);
      assert.ok(process.env.CHROME_PATH, 'Official configured Chromium is required');
      recordedBrowsers = await createRecordedBrowserLauncher(ownedRoot, process.env.CHROME_PATH);
      phase = 'owned packaged app startup';
      const app = owner.start(process.execPath, ['app.cjs'], { cwd: packageRoot, env: productionEnv });
      let live = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        if (cancellation.signal.aborted) interrupted();
        assert.ok(!app.error && app.process.exitCode === null, 'Packaged app exited before browser acceptance');
        // Observe the owned child's actual bind; never attach to a preexisting listener.
        if (app.output.includes(`[vinext] Production server running at ${origin}`)) {
          try { const response = await fetch(`${origin}/health/live`, { signal: AbortSignal.timeout(1000) }); const health = await response.json() as { status?: string }; live = response.status === 200 && health.status === 'ok'; } catch { /* bounded readiness poll */ }
          if (live) break;
        }
        await delay(200);
      }
      assert.equal(live, true, 'Owned packaged loopback server failed startup');
      phase = 'actual Secure-cookie contact/catalog and offline summary browser gates';
      for (const [file, name, count, environment, log] of [
        ['tests/form-catalog-rendered-polish.test.ts', catalogName, 1, { FORM_CATALOG_BROWSER_ORIGIN: origin, FORM_CATALOG_HOSTED_STORAGE_STATE: statePath, FORM_CATALOG_POLISH_EVIDENCE: catalog }, 'catalog.tap'],
        ['tests/super-admin-marketplace-summary-page.test.ts', summaryName, 3, { MARKETPLACE_SUMMARY_SCREENSHOTS: summary }, 'summary.tap'],
      ] as const) {
        if (cancellation.signal.aborted) interrupted();
        const result = await owner.run(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap', '--test-concurrency=1', '--test-name-pattern', name, file], { cwd: project, env: { ...childEnv, CHROME_PATH: recordedBrowsers.executablePath, ...environment } }, 120_000);
        await writeFile(resolve(evidence!, log), redacted(result.output), { flag: 'wx', mode: 0o600 });
        assert.equal(result.code, 0, `Required browser gate failed: ${name}; see sanitized ${log}. Secure-cookie HTTP acceptance must be proved, never downgraded.`);
        assert.ok(result.output.includes(`# Subtest: ${name}`), 'Required browser gate did not execute');
        assertRequiredNativeResults(result.output, count);
      }
      phase = 'genuine registration sign-in, draft, private documents and original receipt';
      const registration = await runRegistrationBrowser({ db: source, origin,
        executablePath: recordedBrowsers.executablePath, reviewerState: statePath, accounts: registrationAccounts, publicOwner, registeredTerms,
        signal: cancellation.signal,
        onStep: step => { phase = 'packaged registration: ' + step; },
        browserEnvironment: Object.fromEntries(Object.entries(childEnv).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) });
      phase = 'genuine recorded work counts, filtering, read-only source and current role denials';
      const recordedWork = await runRecordedWorkBrowser({ db: source, origin, selectedViews,
        executablePath: recordedBrowsers.executablePath, accounts: recordedWorkAccounts, signal: cancellation.signal,
        releaseId: inventory.release, registeredTerms,
        onStep: step => { phase = 'packaged recorded work: ' + step; },
        browserEnvironment: Object.fromEntries(Object.entries(childEnv).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) });
      phase = 'packaged policy readiness after Super Admin enrollment';
      const readyAfterEnrollment = await owner.run(process.execPath, ['hosted-security.mjs', '--check-readiness'],
        { cwd: packageRoot, env: productionEnv }, 30_000);
      assert.equal(readyAfterEnrollment.code, 0, 'Packaged hosted security must be ready after browser enrollment');
      await owner.close(); // No further page/API traffic before the recovery inventory.
      const browserGroups = await recordedBrowsers.close();
      assert.ok(browserGroups >= 4, 'All four real browser launches must have authenticated ownership records');
      await new Promise<void>((done, reject) => {
        const socket = connectLoopback({ host: '127.0.0.1', port });
        socket.setTimeout(1000);
        socket.once('connect', () => { socket.destroy(); reject(new Error('Owned packaged listener remained active')); });
        socket.once('timeout', () => { socket.destroy(); reject(new Error('Owned listener shutdown could not be observed')); });
        socket.once('error', (error: NodeJS.ErrnoException) => { socket.destroy(); if (error.code === 'ECONNREFUSED') done(); else reject(error); });
      });
      await stagingNativeFixture(); // Re-attest owner before the exclusive private media transfer.
      if (cancellation.signal.aborted) interrupted();
      const registrationMedia = await retainRegistrationMedia(project, media, registration.mediaKeys, inventory.archiveSha256);
      registrationMediaManifestSha256 = registrationMedia.manifestSha256;
      phase = 'financial and enrolled-security conservation after browser shutdown';
      const after = await captureNativeInventory(source, selectedViews);
      const runtimeFormLoadsAppended = assertPreservedWithFormLoads(originalFormLoads, await snapshotFormLoadObservations(source), inventory.release, true);
      const registrationAfter = await registrationSnapshot(source, snapshotTables);
      for (const table of snapshotTables) assertOriginalRows(registrationWithPublicShop.get(table)!, registrationAfter.get(table)!);
      for (const [table, added] of Object.entries(sourceAppends)) {
        assert.equal(registrationAfter.get(table)!.length - registrationWithPublicShop.get(table)!.length, added, `Unexpected source appends: ${table}`);
      }
      assert.equal(after.schemaSha256, before.schemaSha256);
      const appendTables = new Set(['users', 'user_roles', 'user_credentials', 'staff_permission_profiles', 'user_sessions', 'marketplace_settings', 'form_config_versions', 'audit_logs', 'traffic_sessions', 'traffic_events', 'form_health_observations', ...snapshotTables]);
      const protectedTables = before.tables.filter((table: { name: string }) => !appendTables.has(table.name));
      for (const table of protectedTables) assert.deepEqual(after.tables.find((candidate: { name: string }) => candidate.name === table.name), table, `Original table changed: ${table.name}`);
      for (const row of oldPrivate.results) {
        const [current] = await source.query('SELECT value,updated_at FROM marketplace_settings WHERE `key`=?', [row.key]);
        const records = current as { value: string; updated_at: number }[];
        assert.ok(records.length === 1 && records[0].value === row.value && Number(records[0].updated_at) === Number(row.updated_at), 'Original settings/enrolled account ciphertext or recovery state changed');
      }
      await source.end(); source = undefined;
      verification = { status: 'PASS', commit: inventory.commit, archiveSha256: inventory.archiveSha256,
        artifactKind: inventory.artifactKind ?? 'linux-release', sourceSha256: inventory.sourceSha256 ?? null,
        ...(currentPackage ? {bootstrapSha256:currentPackage.manifest.migrations[0].sha256,releaseManifestSha256:currentPackage.manifestSha256,requiredExactChecks:309} : {}),
        catalog: { name: catalogName, tests: 1, skipped: 0, transport: 'owned HTTP loopback with unchanged Secure/HttpOnly hosted session' },
        summary: { name: summaryName, tests: 3, skipped: 0, scope: 'offline real dashboard and application CSS, 1280px and 390px' },
        registration: { ...registration.acceptance, ...registrationMedia, originalRowPreservationTables: registrationTables, publicShopFixtureAppends },
        recordedWork,
        runtimeFormLoadsAppended,
        hostedSecurityReadyBeforeAndAfterEnrollment: true,
        sourceAppends,
        originalProtectedTables: protectedTables.length, originalSettingsRecords: oldPrivate.results.length, childrenStopped: true, recordedBrowserGroupsStopped: browserGroups, originalEnrolledSecurityExact: true,
        appendedOptionalAdminRetainedForRecovery: true, sourceInventoryCapturedAfterBrowserShutdown: after };
    });
  } catch (error) {
    if (evidence) await writeFile(resolve(evidence, 'failure.json'), JSON.stringify({ status: 'FAIL', phase, message: 'Required packaged browser acceptance failed; inspect sanitized gate TAP when present. No transport/auth downgrade was attempted.' }), { flag: 'wx', mode: 0o600 });
    throw new Error(`Packaged browser acceptance failed during ${phase}: ${redacted(error instanceof Error ? error.message : 'unknown failure')}`);
  } finally {
    process.removeListener('SIGTERM', cancel); process.removeListener('SIGINT', cancel);
    const cleanupErrors: unknown[] = [];
    const cleanup = async (work: () => void | Promise<unknown>, optionalMissing = false) => {
      try { await work(); } catch (error) {
        if (!optionalMissing || (error as NodeJS.ErrnoException).code !== 'ENOENT') cleanupErrors.push(error);
      }
    };
    await cleanup(async () => cancellationCleanup);
    let processesStopped = false;
    await cleanup(() => closeOwnedResources([...(activeOwner ? [activeOwner] : []), ...(recordedBrowsers ? [recordedBrowsers] : [])],
      async () => { processesStopped = true; }));
    await cleanup(() => restorePoolFactory?.());
    for (const pool of pools) await cleanup(() => pool.end());
    await cleanup(async () => source?.end());
    if (root) {
      assert.ok(contained(resolve(tmpdir()), root));
      const cleanupRoot = root, evidenceRoot = evidence;
      // Only these four fictional screenshots survive, on failure as well as success.
      if (evidence) for (const [from, to] of [['catalog/polish-public-232-after.png', 'contact-232.png'], ['catalog/polish-staff-232-after.png', 'catalog-232.png'],
        ['summary/populated-summary-1280.png', 'summary-1280.png'], ['summary/populated-summary-390.png', 'summary-390.png']]) {
        await cleanup(async () => {
          const path = resolve(cleanupRoot, from), info = await lstat(path);
          assert.ok(contained(cleanupRoot, path) && info.isFile() && !info.isSymbolicLink());
          await copyFile(path, resolve(evidenceRoot!, to), constants.COPYFILE_EXCL);
        }, true);
      }
      if (processesStopped) await cleanup(() => rm(root!, { recursive: true, force: true }));
    }
    assert.equal(cleanupErrors.length, 0, cleanupErrors.length ? cleanupFailure('helper-finalize', new AggregateError(cleanupErrors)).message : 'Owned browser helper cleanup failed; acceptance is refused');
  }
  assert.ok(evidence && verification && registrationMediaManifestSha256);
  await writeFile(resolve(evidence, 'verification.json'), JSON.stringify(verification, null, 2), { flag: 'wx', mode: 0o600 });
  console.log('Registration media manifest SHA-256: ' + registrationMediaManifestSha256);
  console.log('PASS: required exact-package contact/catalog, populated-summary, genuine registration and recorded work browser gates');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
