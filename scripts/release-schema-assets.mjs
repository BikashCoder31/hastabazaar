import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertReleasePath, inventoryRelease, verifyRelease } from './release-files.mjs';

export const releaseManifestPath = 'deployment/babal/release-manifest.json';
export const releaseSchemaPath = 'deployment/babal/mariadb-schema.sql';
const emptyOnlyAssets = new Set([releaseSchemaPath, 'deployment/babal/mariadb-fresh-bootstrap-defaults.sql']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Reject links in every path component, not just the final SQL file.
async function assetPath(root, path, createDirectories = false) {
  assertReleasePath(path);
  if (!(await lstat(root)).isDirectory()) throw new Error('Release asset root must be a real directory.');
  let current = root;
  const parts = path.split('/');
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]);
    const directory = index < parts.length - 1;
    if (directory && createDirectories) {
      try { await mkdir(current); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    let stat;
    try { stat = await lstat(current); }
    catch (error) {
      if (createDirectories && !directory && error.code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) {
      throw new Error(`Release asset must be a real ${directory ? 'directory' : 'file'}: ${path}`);
    }
  }
  return current;
}

export async function readReleaseAssets(root, expectedRelease) {
  const manifestBytes = await readFile(await assetPath(root, releaseManifestPath));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/i.test(manifest.release ?? '') ||
      (expectedRelease !== undefined && manifest.release !== expectedRelease)) {
    throw new Error('Build release ID does not match the requested package.');
  }
  if (!Array.isArray(manifest.migrations) || manifest.migrations[0]?.path !== releaseSchemaPath) {
    throw new Error('Release manifest must start with the selected empty-database schema.');
  }
  const files = [];
  const names = new Set();
  const hasPricing = Object.hasOwn(manifest, 'pricingSchema') ||
    manifest.migrations.some(migration => migration.usage === 'pricing-maintenance');
  const pricingPaths = new Set(hasPricing ?
    (await import('../lib/operations/pricing-schema-readiness.mjs')).registeredPricingMigrations(manifest).map(migration => migration.path) : []);
  for (const migration of manifest.migrations) {
    assertReleasePath(migration.path);
    if (!/^deployment\/babal\/(?:migrations\/)?[a-z0-9._-]+\.sql$/.test(migration.path) ||
        names.has(migration.path) || !/^[a-f0-9]{64}$/.test(migration.sha256 ?? '') ||
        migration.usage !== (emptyOnlyAssets.has(migration.path) ? 'empty-database-only' :
          pricingPaths.has(migration.path) ? 'pricing-maintenance' : 'additive-maintenance')) {
      throw new Error('Invalid migration entry.');
    }
    names.add(migration.path);
    const bytes = await readFile(await assetPath(root, migration.path));
    if (hash(bytes) !== migration.sha256) throw new Error(`Migration hash mismatch: ${migration.path}`);
    files.push({ path: migration.path, bytes });
  }
  return { manifest, files, manifestBytes };
}

export async function copyReleaseAssets(source, destination, expectedRelease) {
  const assets = await readReleaseAssets(source, expectedRelease);
  // Copy precisely the buffers validated above; do not re-read mutable source files.
  for (const file of assets.files) await writeFile(await assetPath(destination, file.path, true), file.bytes);
  await writeFile(await assetPath(destination, releaseManifestPath, true), assets.manifestBytes);
  await readReleaseAssets(destination, assets.manifest.release);
  return assets.manifest;
}

export async function verifyStandaloneAssets(root, expectedRelease) {
  const { manifest, manifestBytes } = await readReleaseAssets(root, expectedRelease);
  const paths = manifest.migrations.map(migration => migration.path);
  const files = await inventoryRelease(root, paths);
  const byPath = new Map(files.map(file => [file.path, file]));
  for (const migration of manifest.migrations) {
    if (byPath.get(migration.path)?.sha256 !== migration.sha256) throw new Error(`Migration hash mismatch: ${migration.path}`);
  }
  if (byPath.get(releaseManifestPath)?.sha256 !== hash(manifestBytes)) throw new Error('Release manifest changed during verification.');
  await verifyRelease(root, files, paths);
  return { manifest, files, migrationPaths: paths };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, root, release] = process.argv.slice(2);
  if (command !== 'verify' || !root || !release || process.argv.length !== 5) {
    throw new Error('Usage: node release-schema-assets.mjs verify <standalone-root> <release-id>');
  }
  const { files } = await verifyStandaloneAssets(resolve(root), release);
  console.log(JSON.stringify(files));
}
