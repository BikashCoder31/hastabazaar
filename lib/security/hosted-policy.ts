import { constants } from 'node:fs';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { link, lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { SecurityStateError, securityKeyId } from './crypto';
import { hasPrivateSecurityState, SecurityStore } from './store';
import { readSecurityInitialization, type SecurityPolicyAdapter, type SecurityPolicyBindings } from './runtime-policy';

export interface HostedSecurityConfiguration extends SecurityPolicyBindings {
  HASTABAZAAR_SECURITY_POLICY_ROOT?: string;
  MEDIA_ROOT?: string;
}
type PolicyRecord = { schema: 1; keyId: string; origin: string; initialized: boolean; mac: string };
const unavailable = () => new SecurityStateError('Hosted account security state is unavailable. Recover the matching external policy and key; do not reprovision existing accounts.');
function contained(root: string, path: string) { const part = relative(root, path); return !part || (!part.startsWith(`..${sep}`) && part !== '..' && !isAbsolute(part)); }

/** No default directory, generated key, environment-string downgrade or local-mode fallback. */
export function validateHostedSecurityConfiguration(config: HostedSecurityConfiguration) {
  try {
    if (config.HASTABAZAAR_RUNTIME_ENV !== 'production' || !config.HASTABAZAAR_SECURITY_KEY || !config.HASTABAZAAR_SECURITY_POLICY_ROOT) throw unavailable();
    const keyId = securityKeyId(config.HASTABAZAAR_SECURITY_KEY), origin = new URL(config.APP_ORIGIN ?? '');
    if (origin.protocol !== 'https:' || origin.origin !== config.APP_ORIGIN || origin.username || origin.password) throw unavailable();
    const root = config.HASTABAZAAR_SECURITY_POLICY_ROOT;
    if (!isAbsolute(root) || resolve(root) !== root || contained(process.cwd(), root) ||
      (config.MEDIA_ROOT && contained(resolve(config.MEDIA_ROOT), root))) throw unavailable();
    return { root, key: config.HASTABAZAAR_SECURITY_KEY, keyId, origin: origin.origin };
  } catch { throw unavailable(); }
}

function authenticatedRecord(config: ReturnType<typeof validateHostedSecurityConfiguration>, initialized: boolean): PolicyRecord {
  const value = { schema: 1 as const, keyId: config.keyId, origin: config.origin, initialized };
  const mac = createHmac('sha256', Buffer.from(config.key, 'base64url')).update(JSON.stringify(['hastabazaar-hosted-security-policy', value])).digest('hex');
  return { ...value, mac };
}
function privateMode(info: { mode: number; uid: number }) {
  if (process.platform !== 'win32' && ((info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid()))) throw unavailable();
}
async function checkedRoot(root: string) {
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink() || resolve(await realpath(root)) !== root) throw unavailable();
  privateMode(info);
}
async function readRecord(config: ReturnType<typeof validateHostedSecurityConfiguration>, name: string, optional = false): Promise<PolicyRecord | null> {
  const path = join(config.root, name);
  let info;
  try { info = await lstat(path); } catch (error) { if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw unavailable(); }
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1024) throw unavailable();
  privateMode(info);
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (opened.ino !== info.ino || opened.dev !== info.dev || opened.size > 1024) throw unavailable();
    const buffer = Buffer.alloc(1025), { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 1024) throw unavailable();
    const value = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')) as PolicyRecord;
    if (!value || Object.keys(value).sort().join(',') !== 'initialized,keyId,mac,origin,schema' || typeof value.initialized !== 'boolean') throw unavailable();
    const expected = authenticatedRecord(config, value.initialized);
    if (value.schema !== 1 || value.keyId !== expected.keyId || value.origin !== expected.origin || typeof value.mac !== 'string' || !/^[a-f0-9]{64}$/.test(value.mac) || !timingSafeEqual(Buffer.from(value.mac, 'hex'), Buffer.from(expected.mac, 'hex'))) throw unavailable();
    return value;
  } finally { await handle.close(); }
}
async function durableFile(path: string, record: PolicyRecord) {
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(record) + '\n'); await handle.sync(); } finally { await handle.close(); }
}
async function syncRoot(root: string) {
  if (process.platform === 'win32') return; // Windows does not support opening directories for fsync.
  const handle = await open(root, 'r'); try { await handle.sync(); } finally { await handle.close(); }
}

/** External to DB/backups and releases. A second durable record prevents a stale pending file from downgrading state. */
export function createHostedSecurityPolicy(configuration: HostedSecurityConfiguration): SecurityPolicyAdapter {
  const config = validateHostedSecurityConfiguration(configuration);
  let observedInitialized = false;
  const read = async () => {
    try {
      await checkedRoot(config.root);
      const policy = (await readRecord(config, 'policy.json'))!;
      const marker = await readRecord(config, 'initialized.json', true);
      if (marker && !marker.initialized || policy.initialized && !marker) throw unavailable();
      const initialized = policy.initialized || Boolean(marker);
      if (observedInitialized && !initialized) throw unavailable();
      observedInitialized ||= initialized;
      return initialized;
    } catch { throw unavailable(); }
  };
  return { read, async mark() {
    await read();
    const temporary = join(config.root, `.initialize-${randomUUID()}.tmp`);
    try {
      await durableFile(temporary, authenticatedRecord(config, true));
      try { await link(temporary, join(config.root, 'initialized.json')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !(await readRecord(config, 'initialized.json'))?.initialized) throw unavailable(); }
      await syncRoot(config.root);
      await rename(temporary, join(config.root, 'policy.json'));
      await syncRoot(config.root);
      observedInitialized = true;
    } catch { throw unavailable(); }
    finally { await unlink(temporary).catch(() => undefined); }
  } };
}

/** Explicit fresh-install operation only. Existing directories and any private DB records are stop conditions. */
export async function provisionHostedSecurityPolicy(configuration: HostedSecurityConfiguration, database: D1Database): Promise<void> {
  const config = validateHostedSecurityConfiguration(configuration);
  if (await hasPrivateSecurityState(database)) throw unavailable();
  if (resolve(await realpath(dirname(config.root))) !== dirname(config.root)) throw unavailable();
  await mkdir(config.root, { mode: 0o700 }); // Exclusive directory creation also prevents retry/reset of damaged policy.
  await durableFile(join(config.root, 'policy.json'), authenticatedRecord(config, false));
  await syncRoot(config.root);
  await syncRoot(dirname(config.root));
}

/** Explicit recovery only: authenticate existing protected records, then create a
 * new initialized policy. It never changes DB records or repairs missing state. */
export async function recoverHostedSecurityPolicy(configuration: HostedSecurityConfiguration, database: D1Database): Promise<void> {
  const config = validateHostedSecurityConfiguration(configuration);
  const store = new SecurityStore(database, config.key, true);
  const manifest = await store.readManifest();
  if (!manifest) throw unavailable();
  for (const id of manifest.value.userIds) await store.readAccount(id);
  if (resolve(await realpath(dirname(config.root))) !== dirname(config.root)) throw unavailable();
  await mkdir(config.root, { mode: 0o700 });
  const initialized = authenticatedRecord(config, true);
  await durableFile(join(config.root, 'initialized.json'), initialized);
  await durableFile(join(config.root, 'policy.json'), initialized);
  await syncRoot(config.root);
  await syncRoot(dirname(config.root));
}

export async function inspectHostedSecurityReadiness(bindings: SecurityPolicyBindings, database: D1Database) {
  const result = { ready: false, phase: 'unavailable' as 'unavailable' | 'pending' | 'initialized', reasonCodes: [] as string[], enrolled: 0, pending: 0 };
  try {
    if (!bindings.SECURITY_POLICY || !bindings.HASTABAZAAR_SECURITY_KEY) throw unavailable();
    const initialized = await readSecurityInitialization(bindings);
    const store = new SecurityStore(database, bindings.HASTABAZAAR_SECURITY_KEY, initialized);
    const manifest = await store.readManifest();
    result.phase = initialized ? 'initialized' : 'pending';
    if (!initialized) result.reasonCodes.push('SECURITY_SETUP_PENDING');
    const staff = await database.prepare("SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.status='active' AND r.role='super_admin'").all<{ id: string }>();
    if (!staff.results.length) result.reasonCodes.push('SECURITY_STAFF_MISSING');
    for (const id of manifest?.value.userIds ?? []) await store.readAccount(id);
    for (const { id } of staff.results) {
      if (!manifest?.value.userIds.includes(id)) { result.reasonCodes.push('SECURITY_STAFF_UNREGISTERED'); continue; }
      const account = await store.readAccount(id);
      if (account?.value.status === 'active') result.enrolled++; else if (account?.value.status !== 'disabled') result.pending++;
    }
    if (result.pending) result.reasonCodes.push('SECURITY_ENROLLMENT_PENDING');
    if (!initialized && result.enrolled) throw unavailable();
    result.reasonCodes = [...new Set(result.reasonCodes)];
    result.ready = result.reasonCodes.length === 0;
  } catch { result.phase = 'unavailable'; result.reasonCodes = ['SECURITY_STATE_UNAVAILABLE']; }
  return result;
}
