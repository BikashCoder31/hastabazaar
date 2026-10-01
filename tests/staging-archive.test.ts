import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import * as tar from 'tar';

async function fixture(run: (root: string, source: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'staging-archive-'));
  const source = join(root, 'source');
  await mkdir(source);
  try { await run(root, source); } finally { await rm(root, { recursive: true, force: true }); }
}

void test('staging archive extracts only exactly inventoried regular files', async () => fixture(async (root, source) => {
  await mkdir(join(source, 'nested'));
  await writeFile(join(source, 'nested/file.txt'), 'verified');
  const archive = join(root, 'release.tar.gz');
  await tar.c({ gzip: true, cwd: source, file: archive }, ['.']);
  const { extractStagingArchive } = await import('../scripts/deployment/staging-archive.mjs');
  const target = join(root, 'target');
  await mkdir(target);
  await extractStagingArchive(archive, target, [{ path: 'nested/file.txt', bytes: 8,
    sha256: createHash('sha256').update('verified').digest('hex') }]);
  assert.equal(await readFile(join(target, 'nested/file.txt'), 'utf8'), 'verified');
}));

void test('staging archive rejects links, extra files and size mismatches before extraction', async () => fixture(async (root, source) => {
  const { extractStagingArchive } = await import('../scripts/deployment/staging-archive.mjs');
  await writeFile(join(source, 'file.txt'), 'verified');
  const entry = { path: 'file.txt', bytes: 8, sha256: createHash('sha256').update('verified').digest('hex') };
  const archive = join(root, 'release.tar.gz');
  await tar.c({ gzip: true, cwd: source, file: archive }, ['file.txt']);
  const target = join(root, 'target');
  await mkdir(target);
  await assert.rejects(extractStagingArchive(archive, target, []));
  await assert.rejects(extractStagingArchive(archive, target, [{ ...entry, bytes: 7 }]));
  await symlink(source, join(source, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  await tar.c({ gzip: true, cwd: source, file: archive }, ['file.txt', 'link']);
  await assert.rejects(extractStagingArchive(archive, target, [entry]));
  await assert.rejects(readFile(join(target, 'file.txt')));
}));

void test('staging archive rejects traversal and oversized inventory', async () => {
  const { validateStagingInventory } = await import('../scripts/deployment/staging-archive.mjs');
  const hash = 'a'.repeat(64);
  for (const path of ['../escape', '/absolute', 'nested/../escape', 'C:/escape', 'a\\b']) {
    assert.throws(() => validateStagingInventory([{ path, bytes: 1, sha256: hash }]));
  }
  assert.throws(() => validateStagingInventory([{ path: 'huge', bytes: 600 * 1024 * 1024, sha256: hash }]));
  assert.throws(() => validateStagingInventory([{ path: 'file', bytes: 1, sha256: hash }, { path: 'file', bytes: 1, sha256: hash }]));
});
