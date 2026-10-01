import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertReleasePath, inventoryRelease, verifyRelease } from './release-files.mjs';
import { smokeStandalone } from './smoke-standalone.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = process.argv[2];
if (!/^hastabazaar-release-[a-z0-9._-]+$/.test(release ?? '')) throw new Error('A versioned release ID is required.');
if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('CI packages must be built on Linux x64 for Babalhost.');
const standalone = resolve(root, 'dist/standalone');
const output = resolve(root, 'outputs', release);
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // Never replace an earlier artifact.
const manifestSource = resolve(root, 'deployment/babal/release-manifest.json');
const manifest = JSON.parse(await readFile(manifestSource, 'utf8'));
if (manifest.release !== release) throw new Error('Build release ID does not match the requested package.');
for (const migration of manifest.migrations) {
  assertReleasePath(migration.path);
  if (!migration.path.startsWith('deployment/babal/') || !migration.path.endsWith('.sql')) throw new Error('Invalid migration path.');
  const source = resolve(root, migration.path);
  if (!(await lstat(source)).isFile() || createHash('sha256').update(await readFile(source)).digest('hex') !== migration.sha256) {
    throw new Error(`Migration hash mismatch: ${migration.path}`);
  }
  const destination = resolve(standalone, migration.path);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}
await copyFile(manifestSource, resolve(standalone, 'deployment/babal/release-manifest.json'));
const migrationPaths = manifest.migrations.map((migration) => migration.path);
const files = await inventoryRelease(standalone, migrationPaths);
await verifyRelease(standalone, files, migrationPaths);
const commit = process.env.GITHUB_SHA;
if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('GITHUB_SHA must identify the exact source commit.');
const archive = `${release}.tar.gz`;
function tar(args) {
  const result = spawnSync('tar', args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Release archive operation failed.');
}
tar(['-czf', resolve(output, archive), '-C', standalone, '.']);
const verification = await mkdtemp(resolve(tmpdir(), 'hastabazaar-package-'));
let runtime;
try {
  tar(['-xzf', resolve(output, archive), '--no-same-owner', '-C', verification]);
  await verifyRelease(verification, files, migrationPaths);
  runtime = await smokeStandalone(verification, release);
} finally { await rm(verification, { recursive: true, force: true }); }
const bytes = await readFile(resolve(output, archive));
const sha256 = createHash('sha256').update(bytes).digest('hex');
await writeFile(resolve(output, 'inventory.json'), JSON.stringify({
  schemaVersion: 1, release, commit, platform: process.platform, arch: process.arch,
  node: process.version, runtime, archive, archiveBytes: bytes.length, archiveSha256: sha256,
  fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), files,
}, null, 2) + '\n', { flag: 'wx' });
await writeFile(resolve(output, 'SHA256SUMS'), `${sha256}  ${archive}\n`, { flag: 'wx' });
console.log(`Verified ${release}: ${files.length} files, ${bytes.length} archive bytes, SHA-256 ${sha256}`);
