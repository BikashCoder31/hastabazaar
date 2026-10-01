import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const moduleUrl = new URL('../scripts/release-files.mjs', import.meta.url);
const load = async () => {
  const implementation = await import(moduleUrl.href).catch(() => ({}));
  assert.equal(typeof implementation.inventoryRelease, 'function', 'release inventory must be implemented');
  return implementation;
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hastabazaar-ci-'));
  for (const name of ['app.cjs', 'server.js', 'package.json',
    'deployment/babal/release-manifest.json', 'dist/client/vinext-client-entry-manifest.json']) {
    await mkdir(join(root, name, '..'), { recursive: true });
    await writeFile(join(root, name), '{}');
  }
  return root;
}

void test('release inventory is exact, sorted and verifies all required files', async () => {
  const { inventoryRelease, verifyRelease } = await load();
  const root = await fixture();
  try {
    const files = await inventoryRelease(root);
    assert.equal(files.length, 5);
    assert.equal(files.reduce((sum: number, file: { bytes: number }) => sum + file.bytes, 0), 10);
    assert.deepEqual(files.map((file: { path: string }) => file.path),
      files.map((file: { path: string }) => file.path).sort((a: string, b: string) => a < b ? -1 : a > b ? 1 : 0));
    await verifyRelease(root, files);
    await rm(join(root, 'server.js'));
    await assert.rejects(() => verifyRelease(root, files), /required|mismatch/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

void test('release verification rejects changed bytes and unexpected files', async () => {
  const { inventoryRelease, verifyRelease } = await load();
  const root = await fixture();
  try {
    const files = await inventoryRelease(root);
    await writeFile(join(root, 'server.js'), 'changed');
    await assert.rejects(() => verifyRelease(root, files), /mismatch/i);
    await writeFile(join(root, 'server.js'), '{}');
    await writeFile(join(root, 'extra.txt'), 'unexpected');
    await assert.rejects(() => verifyRelease(root, files), /mismatch/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

void test('release packaging refuses credentials, backup history, media and seeds', async () => {
  const { inventoryRelease } = await load();
  for (const name of ['.env', '.env.production', 'setup.key', 'id_ed25519',
    'private-media/photo.jpg', '.staging/state.json', 'db/seeds/dev.sql',
    'deployment-backups/latest/database.sql.gz', 'backup-old.zip',
    'deployment/babal/mariadb-reset-empty-import.sql',
    'deployment/babal/mariadb-reset-empty-import.SQL',
    'public/backup/database.sql', 'public/seed.sql', 'public/.npmrc',
    'public/.netrc', 'public/database.db-wal', 'public/database.sqlite-shm']) {
    const root = await fixture();
    try {
      await mkdir(join(root, name, '..'), { recursive: true });
      await writeFile(join(root, name), 'must not ship');
      await assert.rejects(() => inventoryRelease(root), /forbidden/i, name);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

void test('only explicitly approved migration SQL can enter a release', async () => {
  const { inventoryRelease, verifyRelease } = await load();
  const root = await fixture();
  const migration = 'deployment/babal/migrations/add-field.sql';
  try {
    await mkdir(join(root, migration, '..'), { recursive: true });
    await writeFile(join(root, migration), 'ALTER TABLE fixture ADD field INT;');
    await assert.rejects(() => inventoryRelease(root), /forbidden/i);
    const files = await inventoryRelease(root, [migration]);
    assert.equal(files.length, 6);
    await verifyRelease(root, files, [migration]);
    await writeFile(join(root, 'deployment/babal/unapproved.sql'), 'unknown');
    await assert.rejects(() => inventoryRelease(root, [migration]), /forbidden/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

void test('archive runtime smoke rejects missing packaged dependencies outside the source checkout', async () => {
  const implementation = await import(new URL('../scripts/smoke-standalone.mjs', import.meta.url).href).catch(() => ({}));
  assert.equal(typeof implementation.smokeStandalone, 'function', 'isolated archive smoke must be implemented');
  const root = await fixture();
  try {
    await assert.rejects(() => implementation.smokeStandalone(root, 'hastabazaar-release-test'), /sharp|dependency/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

void test('release inventory refuses links instead of following them outside its root', async () => {
  const { inventoryRelease } = await load();
  const root = await fixture();
  const outside = await mkdtemp(join(tmpdir(), 'hastabazaar-ci-link-'));
  try {
    await writeFile(join(outside, 'secret.txt'), 'outside');
    await symlink(outside, join(root, 'linked'), 'junction');
    await assert.rejects(() => inventoryRelease(root), /link/i);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

void test('release path validation refuses traversal, absolute and nonportable paths', async () => {
  const { assertReleasePath } = await load();
  for (const path of ['../server.js', '/etc/passwd', 'C:/secret', 'a\\b', 'a/../b',
    './server.js', 'a//b', 'a\nfile', '']) {
    assert.throws(() => assertReleasePath(path), /path/i, path);
  }
  assert.doesNotThrow(() => assertReleasePath('node_modules/sharp/lib/index.js'));
});
