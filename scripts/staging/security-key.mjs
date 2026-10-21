import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, realpath, rename, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const pendingWrites = new Map();
const invalid = () => Error('Invalid local security key or initialization metadata; preserve it and review recovery.');
const samePath = (left, right) => process.platform === 'win32' ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right);
function keyBytes(key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key)) throw invalid();
  const bytes = Buffer.from(key, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== key) throw invalid();
  return bytes;
}
const keyId = key => createHash('sha256').update(keyBytes(key)).digest('hex').slice(0, 32);

async function paths(projectRoot, createDirectory = false) {
  const root = await realpath(projectRoot);
  const staging = join(root, '.staging');
  if (!samePath(await realpath(staging), staging)) throw invalid();
  const directory = join(staging, 'security');
  if (createDirectory) await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!samePath(await realpath(directory), directory)) throw invalid();
  return { directory, file: join(directory, 'key.json') };
}

async function readRecord(location, expectedKey) {
  if (!samePath(await realpath(location.file), location.file) || !(await stat(location.file)).isFile()) throw invalid();
  let record;
  try {
    const raw = await readFile(location.file, 'utf8');
    if (raw.length > 512) throw invalid();
    record = JSON.parse(raw);
  } catch { throw invalid(); }
  const columns = record && typeof record === 'object' && !Array.isArray(record) ? Object.keys(record).sort().join(',') : '';
  if (record?.version !== 1 || !['key,version', 'initialized,key,version'].includes(columns) || (record.initialized !== undefined && typeof record.initialized !== 'boolean')) throw invalid();
  const material = keyBytes(record.key);
  if (expectedKey !== undefined && !timingSafeEqual(material, keyBytes(expectedKey))) throw invalid();
  return { version: 1, key: record.key, initialized: record.initialized === true, legacy: record.initialized === undefined };
}

async function atomicWrite(location, record) {
  const temporary = join(location.directory, `.key-${randomBytes(16).toString('hex')}.tmp`);
  let file;
  try {
    file = await open(temporary, 'wx', 0o600);
    await file.writeFile(JSON.stringify({ version: 1, key: record.key, initialized: record.initialized }));
    await file.sync(); await file.close(); file = undefined;
    if (!samePath(await realpath(location.file), location.file)) throw invalid();
    await rename(temporary, location.file);
    let directory;
    try { directory = await open(location.directory, 'r'); await directory.sync(); }
    catch (error) { if (!['EPERM', 'EACCES', 'EINVAL', 'EISDIR', 'ENOTSUP'].includes(error.code)) throw error; }
    finally { await directory?.close(); }
  } finally {
    await file?.close();
    await unlink(temporary).catch(() => undefined);
  }
}

async function withWriteLock(location, work) {
  const prior = pendingWrites.get(location.file) ?? Promise.resolve();
  const current = prior.catch(() => undefined).then(async () => {
    const name = join(location.directory, '.key-write.lock');
    let lock;
    try {
      try { lock = await open(name, 'wx', 0o600); }
      catch (error) { if (error.code === 'EEXIST') throw Error('Local security metadata is being updated. Retry after the checked launcher finishes.'); throw error; }
      return await work();
    } finally { if (lock) { await lock.close(); await unlink(name); } }
  });
  pendingWrites.set(location.file, current);
  try { return await current; } finally { if (pendingWrites.get(location.file) === current) pendingWrites.delete(location.file); }
}

/** Metadata only: never return raw key material through a policy response. */
export async function readLocalSecurityPolicy(projectRoot, expectedKey) {
  const record = await readRecord(await paths(projectRoot), expectedKey);
  return { initialized: record.initialized, keyId: keyId(record.key) };
}

/** Monotonic external latch. There is deliberately no clear/reset API. */
export async function markLocalSecurityInitialized(projectRoot, expectedKey) {
  keyBytes(expectedKey);
  const location = await paths(projectRoot);
  return withWriteLock(location, async () => {
    const record = await readRecord(location, expectedKey);
    if (!record.initialized || record.legacy) await atomicWrite(location, { ...record, initialized: true });
    return { initialized: true, keyId: keyId(record.key) };
  });
}

/** Called only after canonical launcher/data checks, never by read-only preflight. */
export async function provisionLocalSecurityKey(projectRoot, hasSecurityRecords) {
  if (typeof hasSecurityRecords !== 'boolean') throw invalid();
  let location;
  try { location = await paths(projectRoot); await readRecord(location); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (hasSecurityRecords) throw Error('Local security key is missing while encrypted records exist. Recover the matching key; do not replace it.');
    location = await paths(projectRoot, true);
  }
  return withWriteLock(location, async () => {
    let record;
    try { record = await readRecord(location); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const key = randomBytes(32).toString('base64url');
      const file = await open(location.file, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify({ version: 1, key, initialized: false })); await file.sync(); }
      finally { await file.close(); }
      record = await readRecord(location, key);
    }
    const initialized = record.initialized || hasSecurityRecords;
    if (record.legacy || initialized !== record.initialized) await atomicWrite(location, { ...record, initialized });
    return record.key;
  });
}
