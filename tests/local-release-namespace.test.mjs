import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, lstat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import * as namespace from '../scripts/local-release-namespace.mjs';
import { makeNamespaceArguments, validateInputRecords, preserveAround } from '../scripts/local-release-namespace.mjs';

const options = () => ({ canonical: '/host/project', owner: 'fresh-v1', evidence: '/host/project/.test-artifacts/t35/evidence-v1', runtime: '/host/project/.test-artifacts/t35/runtime-v1/node', skeleton: '/host/project/.test-artifacts/t35/evidence-v1/skeleton', snapshot: { files: [{ path: 'package.json' }, { path: 'scripts/build-local-release-candidate.mjs' }], schema: { path: '.test-artifacts/t35/schema-v1/mariadb-schema.sql' } }, brands: [{ path: 'public/brand/example.png', absent: true }], sourceSha256: 'a'.repeat(64), release: 'hastabazaar-release-fixture', namespaces: { user: 'u', mnt: 'm', net: 'n', pid: 'p' } });
void test('canonical namespace uses individual selected files, read-only skeleton, finite writable owner and read-only dependencies', () => {
  const args = makeNamespaceArguments(options());
  const binds = [];
  for (let i = 0; i < args.length; i++) if (['--bind', '--ro-bind'].includes(args[i])) binds.push(args.slice(i, i + 3));
  assert.ok(!binds.some(x => x[1] === '/host/project'));
  assert.ok(binds.some(x => x[0] === '--ro-bind' && x[2] === '/project/package.json'));
  assert.ok(binds.some(x => x[0] === '--ro-bind' && x[2] === '/project'));
  assert.ok(binds.some(x => x[0] === '--bind' && x[2] === '/project/.test-artifacts/t35/fresh-v1'));
  assert.ok(binds.some(x => x[0] === '--ro-bind' && x[2].endsWith('/source/node_modules')));
  assert.ok(!binds.some(x => x[0] === '--bind' && x[1] === options().evidence), 'Writable evidence must not expose skeleton/config backing files.');
  assert.ok(binds.some(x => x[0] === '--ro-bind' && x[2] === '/evidence/transfer'));
  assert.deepEqual(binds.filter(x => x[0] === '--bind' && x[2].includes('/node_modules/')).map(x => x[2].split('/').at(-1)).sort((a,b)=>a.localeCompare(b)), ['.vite', '.vite-temp']);
  assert.ok(args.includes('--unshare-all') && args.includes('--clearenv'));
  assert.ok(!args.some(x => x.includes('GITHUB_SHA')));
});
void test('route filenames and transfer boundaries preserve literal names without shell expansion', () => {
  const o = options(); o.acquired = '/host/project/.test-artifacts/t35/acquired/input'; o.snapshot.files.push({ path: 'app/(auth)/[locale]/page.tsx' });
  const args = makeNamespaceArguments(o, 'transfer');
  assert.ok(args.includes('/project/app/(auth)/[locale]/page.tsx'));
  assert.ok(args.includes('/acquired'));
  assert.ok(!args.includes('/project/.test-artifacts/t35/fresh-v1/source/node_modules'));
});
void test('reject traversal, private mounts, duplicate records and output/schema collision before argument creation', () => {
  for (const path of ['../private', '.env.production', 'node_modules/a', 'app/../secret', 'a\\b', '/etc/passwd']) {
    const o = options(); o.snapshot.files.push({ path });
    assert.throws(() => makeNamespaceArguments(o));
  }
  const o = options(); o.snapshot.schema.path = '.test-artifacts/t35/fresh-v1/mariadb-schema.sql';
  assert.throws(() => makeNamespaceArguments(o));
});
void test('dependency input list must contain exactly thirteen distinct approved package/lock/vendor paths', () => {
  assert.throws(() => validateInputRecords([]));
  const records = ['package.json', 'package-lock.json', ...Array.from({ length: 11 }, (_, i) => `vendor/pkg/file${i}.js`)].map(path => ({ path, size: 1, sha256: 'a'.repeat(64) }));
  assert.doesNotThrow(() => validateInputRecords(records));
  assert.throws(() => validateInputRecords(records.map((r, i) => i === 12 ? records[11] : r)));
  assert.throws(() => validateInputRecords(records.map((r, i) => i === 12 ? { ...r, path: '.env' } : r)));
});
void test('host preservation runs after worker failure and never converts failed work to success', async () => {
  const calls = [];
  await assert.rejects(preserveAround(async phase => { calls.push(phase); return { bytes: 1 }; }, async () => { calls.push('work'); throw new Error('worker failed'); }), /worker failed/);
  assert.deepEqual(calls, ['before', 'work', 'after']);
});
void test('host drift rejects otherwise successful worker', async () => {
  await assert.rejects(preserveAround(async phase => ({ phase }), async () => 'success'), /preservation/);
});
void test('failure to capture before prevents work and dual failure retains both errors', async () => {
  let worked = false;
  await assert.rejects(preserveAround(async () => { throw new Error('before unavailable'); }, async () => { worked = true; }), /before unavailable/);
  assert.equal(worked, false);
  await assert.rejects(preserveAround(async phase => { if (phase === 'after') throw new Error('after unavailable'); return {}; }, async () => { throw new Error('worker failure'); }), error => error instanceof AggregateError && error.errors.length === 2);
});

void test('dependency inventory includes root, every permission bit, links and original cache-named entries', async () => {
  const root = resolve('fixture');
  const entries = new Map([
    ['node_modules', { type: 'directory', mode: 0o40755 }],
    ['node_modules/pkg', { type: 'directory', mode: 0o40755 }],
    ['node_modules/pkg/file', { type: 'file', mode: 0o100755 }],
    ['node_modules/link', { type: 'link', mode: 0o120777 }],
    ['node_modules/.vite', { type: 'directory', mode: 0o40755 }],
    ['node_modules/.vite/original', { type: 'file', mode: 0o100644 }],
  ]);
  const key = path => path.slice(root.length + 1).replaceAll('\\', '/');
  const io = {
    lstat: async path => { const e = entries.get(key(path)); return { mode: e.mode, isDirectory: () => e.type === 'directory', isFile: () => e.type === 'file', isSymbolicLink: () => e.type === 'link' }; },
    readdir: async path => [...entries.keys()].filter(p => p.startsWith(key(path) + '/') && !p.slice(key(path).length + 1).includes('/')).map(p => ({ name: p.split('/').at(-1) })),
    readFile: async () => Buffer.from('original'), readlink: async () => 'pkg/file', realpath: async () => join(root, 'node_modules/pkg/file'),
  };
  const inventory = () => namespace.inventoryTree(root, 'node_modules', [], false, io);
  const before = await inventory();
  assert.equal(before.length, entries.size);
  assert.deepEqual(before[0], { path: 'node_modules', directory: true, mode: 0o755 });
  assert.ok(before.some(r => r.path === 'node_modules/.vite/original'));
  for (const path of ['node_modules', 'node_modules/pkg', 'node_modules/pkg/file', 'node_modules/link']) {
    const entry = entries.get(path), original = entry.mode;
    for (const bit of [0o4000, 0o2000, 0o1000, 0o400, 0o200, 0o100, 0o40, 0o20, 0o10, 0o4, 0o2, 0o1]) {
      entry.mode = original ^ bit;
      const changed = await inventory();
      assert.notDeepEqual(changed, before, `${path}: permission bit ${bit.toString(8)} must affect comparison`);
      assert.equal(changed.find(r => r.path === path).mode, entry.mode & 0o7777);
    }
    entry.mode = original;
  }
  assert.deepEqual(await inventory(), before);
});

for (const cancelAt of ['load', 'publication', null]) void test(`final acceptance: ${cancelAt ?? 'success'} preserves host checks and atomic acceptance`, async () => {
  const fixtureParent = resolve('.test-artifacts/t35/release-namespace-fix1-20261110-astra/fixtures');
  await mkdir(fixtureParent, { recursive: true });
  const fixture = await mkdtemp(join(fixtureParent, 'acceptance-'));
  const owner = join(fixture, 'owner'), evidence = join(fixture, 'evidence');
  await mkdir(join(owner, 'candidate'), { recursive: true }); await mkdir(evidence);
  const sourceSha256 = 'a'.repeat(64);
  const inventory = { commit: null, sourceSha256, linuxRuntimeVerified: true, deploymentAuthorized: false, archiveSha256: 'b'.repeat(64) };
  await writeFile(join(owner, 'candidate/inventory.json'), JSON.stringify(inventory));
  let interrupted = null;
  const calls = [];
  await namespace.preserveAround(async phase => { calls.push(phase); const receipt = { bytes: 'unchanged' }; await namespace.saveExclusive(join(evidence, `host-${phase}.json`), receipt); return receipt; }, async () => { calls.push('work'); });
  const result = namespace.acceptCandidate(owner, evidence, sourceSha256, () => interrupted, {
    readInventory: async path => { const value = await readFile(path, 'utf8'); if (cancelAt === 'load') interrupted = 'SIGINT'; return value; },
    stage: async (path, value) => { await namespace.saveExclusive(path, value); if (cancelAt === 'publication') interrupted = 'SIGTERM'; },
  });
  if (cancelAt) {
    await assert.rejects(result, /cancelled/);
    await assert.rejects(lstat(join(evidence, 'accepted.json')), { code: 'ENOENT' });
  } else {
    await result;
    assert.equal(JSON.parse(await readFile(join(evidence, 'accepted.json'))).hostPreserved, true);
  }
  assert.deepEqual(calls, ['before', 'work', 'after']);
  assert.deepEqual(JSON.parse(await readFile(join(evidence, 'host-after.json'))), JSON.parse(await readFile(join(evidence, 'host-before.json'))));
});
