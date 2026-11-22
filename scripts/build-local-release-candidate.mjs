import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inventoryDerivedBrand, ownedEvidencePath, realPath, requireLocalLinux, verifyDependencyEntry, verifyDependencyLocations, verifyIsolatedSource, verifyLocalSource } from './local-release-source.mjs';

// This independent local path never accepts a fabricated CI commit or a platform override.
// No compilation, archive mutation, dependency loading or output creation precedes admission.
requireLocalLinux();
const repository = fileURLToPath(new URL('../', import.meta.url));
const [snapshotArgument, expectedSourceSha256, sourceArgument, release] = process.argv.slice(2);
assert.ok(process.argv.length === 6 && /^hastabazaar-release-[a-z0-9._-]+$/.test(release ?? ''), 'Expected source.json, reviewed source SHA256, isolated source path and new release ID.');
const snapshotPath = await ownedEvidencePath(repository, snapshotArgument, 'source.json');
const source = await ownedEvidencePath(repository, sourceArgument, 'source');
assert.equal(dirname(source), dirname(snapshotPath), 'Snapshot and isolated source must share the reviewed evidence child.');
await realPath(snapshotPath);
await realPath(source);
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
await verifyLocalSource(repository, snapshot, expectedSourceSha256);
await verifyIsolatedSource(source, snapshot, expectedSourceSha256);
const output = join(dirname(source), 'candidate');
for (const path of [output, ...['dist', 'outputs', 'output', '.git', '.next', '.vinext'].map(name => join(source, name))]) {
  try { await lstat(path); throw new Error(`Refusing existing candidate/build destination: ${path}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
assert.ok((await lstat(await realPath(join(source, 'node_modules')))).isDirectory(), 'Install reviewed Linux dependencies only in the isolated source child before running.');
await realPath(join(source, 'node_modules/vinext/dist/cli.js'));
const canonicalBrandBefore = await inventoryDerivedBrand(repository);
const brandBefore = await inventoryDerivedBrand(source);
await mkdir(output);
const temporary = join(output, 'tmp');
await mkdir(temporary);
process.env.TMPDIR = temporary;
process.env.TMP = temporary;
process.env.TEMP = temporary;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (name, value) => writeFile(join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
await save('source.json', snapshot);
await save('brand-before.json', { canonical: canonicalBrandBefore, isolated: brandBefore });
// Subprocesses cannot inherit database, SMTP, payment or deployment configuration.
const npmCache = join(output, 'npm-cache'), npmLogs = join(output, 'npm-logs');
const npmUserConfig = join(output, 'npm-user-empty.conf'), npmGlobalConfig = join(output, 'npm-global-empty.conf');
await mkdir(npmCache);
await mkdir(npmLogs);
await writeFile(npmUserConfig, '', { flag: 'wx' });
await writeFile(npmGlobalConfig, '', { flag: 'wx' });
const environment = {
  PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: temporary, TMP: temporary, TEMP: temporary, HASTABAZAAR_RELEASE_ID: release,
  NPM_CONFIG_CACHE: npmCache, NPM_CONFIG_LOGS_DIR: npmLogs, NPM_CONFIG_USERCONFIG: npmUserConfig, NPM_CONFIG_GLOBALCONFIG: npmGlobalConfig,
  NPM_CONFIG_OFFLINE: 'true', NPM_CONFIG_AUDIT: 'false', NPM_CONFIG_FUND: 'false', NPM_CONFIG_UPDATE_NOTIFIER: 'false', NPM_CONFIG_IGNORE_SCRIPTS: 'true',
};
const npm = spawnSync('npm', ['--version'], { cwd: source, env: environment, encoding: 'utf8' });
if (npm.error) throw npm.error;
assert.equal(npm.status, 0, 'Isolated Linux toolchain requires working npm.');
const dependencyTree = spawnSync('npm', ['ls', '--all', '--parseable'], { cwd: source, env: environment, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
await writeFile(join(output, 'dependency-tree.log'), `${dependencyTree.stdout ?? ''}\n${dependencyTree.stderr ?? ''}`, { flag: 'wx' });
if (dependencyTree.error) throw dependencyTree.error;
assert.equal(dependencyTree.status, 0, 'The isolated dependency tree must be complete before building.');
const dependencyResolution = [];
const dependencyPaths = await verifyDependencyLocations(source, dependencyTree.stdout, dependencyResolution);
const compilerEntry = await verifyDependencyEntry(source, join(source, 'package.json'), './node_modules/vinext/dist/cli.js');
const generator = await readFile(await realPath(join(source, 'node_modules/vinext/dist/typegen.js')));
assert.equal(digest(generator), '47f1dbeb0c0b16f88c6c7428495a51f2623bf3bb0d66f3a2d9bd8789d2f3ff92', 'Review generated declaration admission for changed Vinext type generator.');
await save('dependency-resolution.json', { scope: 'Preflight of installed links, package targets and declared Node dependencies; not a process/filesystem sandbox. Undeclared dynamic imports and custom compiler/native reads are not universally contained.', compilerEntry, compilerSha256: digest(await readFile(compilerEntry)), typeGeneratorSha256: digest(generator), packageRoots: dependencyPaths, resolutions: dependencyResolution });
const dependencies = [];
for (const name of ['vinext', 'vite', 'esbuild', 'sharp']) {
  const bytes = await readFile(await realPath(join(source, 'node_modules', name, 'package.json')));
  dependencies.push({ name, version: JSON.parse(bytes.toString('utf8')).version, packageJsonSha256: digest(bytes) });
}
const toolchain = { platform: process.platform, arch: process.arch, node: process.version, npm: npm.stdout.trim(), dependencies, dependencyPathCount: dependencyPaths.length, dependencyPathsSha256: digest(JSON.stringify(dependencyPaths)) };
await save('toolchain.json', toolchain);
const build = spawnSync(process.execPath, [join(source, 'scripts/build-babal.mjs'), `--schema-input=${join(source, snapshot.schema.path)}`], {
  cwd: source, env: environment, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});
const buildLog = `${build.stdout ?? ''}\n${build.stderr ?? ''}`;
await writeFile(join(output, 'build.log'), buildLog, { flag: 'wx' });
await save('build-result.json', { command: 'node scripts/build-babal.mjs --schema-input=<frozen-selected-schema>', exitCode: build.status, signal: build.signal, platform: process.platform, arch: process.arch, node: process.version, sourceSha256: expectedSourceSha256, logSha256: digest(buildLog) });
if (build.error) throw build.error;
assert.equal(build.status, 0, 'Local Linux build failed; retained output is not a verified candidate.');
await verifyIsolatedSource(source, snapshot, expectedSourceSha256, { afterBuild: true });
await verifyLocalSource(repository, snapshot, expectedSourceSha256);
const brandAfter = await inventoryDerivedBrand(source);
const canonicalBrandAfter = await inventoryDerivedBrand(repository);
await save('brand-after.json', { canonical: canonicalBrandAfter, isolated: brandAfter });
assert.deepEqual(canonicalBrandAfter, canonicalBrandBefore, 'Canonical generated brand assets changed.');
assert.ok(brandAfter.every(file => !file.absent), 'Build did not generate all seven brand outputs.');

// Reuse the existing strict SQL/path/hash inventory, bounded archive extraction and smoke gates.
const { verifyStandaloneAssets } = await import(pathToFileURL(join(source, 'scripts/release-schema-assets.mjs')).href);
const { verifyRelease } = await import(pathToFileURL(join(source, 'scripts/release-files.mjs')).href);
const { extractStagingArchive } = await import(pathToFileURL(join(source, 'scripts/deployment/staging-archive.mjs')).href);
const { smokeStandalone } = await import(pathToFileURL(join(source, 'scripts/smoke-standalone.mjs')).href);
const standalone = join(source, 'dist/standalone');
await realPath(standalone);
const { files, migrationPaths, manifest } = await verifyStandaloneAssets(standalone, release);
assert.equal(manifest.migrations[0].sha256, snapshot.schema.sha256, 'Built schema differs from the reviewed source schema.');
const archive = `${release}.tar.gz`;
const archivePath = join(output, archive);
const packed = spawnSync('tar', ['-czf', archivePath, '-C', standalone, '.'], { env: environment, encoding: 'utf8' });
if (packed.error) throw packed.error;
assert.equal(packed.status, 0, 'Local archive creation failed.');
const archiveBytes = await readFile(archivePath);
const archiveSha256 = digest(archiveBytes);
await save('pending-inventory.json', { schemaVersion: 1, release, artifactKind: 'local-linux-candidate', commit: null, sourceSha256: expectedSourceSha256, linuxRuntimeVerified: false, archive, archiveBytes: archiveBytes.length, archiveSha256, files });
const extracted = join(output, 'extracted');
await mkdir(extracted);
await extractStagingArchive(archivePath, extracted, files);
await verifyRelease(extracted, files, migrationPaths);
await verifyStandaloneAssets(extracted, release);
const runtime = await smokeStandalone(extracted, release);
await verifyRelease(extracted, files, migrationPaths);
await verifyStandaloneAssets(extracted, release);
assert.equal(digest(await readFile(archivePath)), archiveSha256, 'Archive changed during verification.');
await verifyIsolatedSource(source, snapshot, expectedSourceSha256, { afterBuild: true });
await verifyLocalSource(repository, snapshot, expectedSourceSha256);
assert.deepEqual(await inventoryDerivedBrand(repository), canonicalBrandBefore, 'Canonical brand assets changed during verification.');
assert.deepEqual(await inventoryDerivedBrand(source), brandAfter, 'Generated build assets changed during verification.');
await save('inventory.json', {
  schemaVersion: 1, release, artifactKind: 'local-linux-candidate', commit: null,
  sourceIdentityKind: 'source-snapshot', sourceSha256: expectedSourceSha256, sourceScope: snapshot.scope,
  platform: process.platform, arch: process.arch, node: process.version, toolchain,
  linuxRuntimeVerified: true, runtime, productionReady: false, deploymentAuthorized: false,
  schemaSha256: snapshot.schema.sha256, archive, archiveBytes: archiveBytes.length, archiveSha256,
  fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), files,
  buildLogSha256: digest(buildLog), brandBefore, brandAfter,
});
await writeFile(join(output, 'SHA256SUMS'), `${archiveSha256}  ${archive}\n`, { flag: 'wx' });
console.log(`Local Linux candidate verified: ${release}; source ${expectedSourceSha256}; archive ${archiveSha256}. Deployment remains held.`);
