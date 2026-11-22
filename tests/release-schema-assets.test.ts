import assert from 'node:assert/strict';
import { copyReleaseManifestInputs } from './helpers/copy-release-manifest-inputs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const repository = resolve(import.meta.dirname, '..');
const fixtureParent = join(repository, '.test-artifacts/t35');
const release = 'hastabazaar-release-schema-fixture';
const schemaPath = 'deployment/babal/mariadb-schema.sql';
const manifestPath = 'deployment/babal/release-manifest.json';
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const run = (script: string, args: string[], cwd: string) => spawnSync(process.execPath, [join(repository, script), ...args], {
  cwd, encoding: 'utf8', timeout: 30_000, env: { ...process.env, HASTABAZAAR_RELEASE_ID: release },
});
async function fixture() {
  await mkdir(fixtureParent, { recursive: true });
  const root = await mkdtemp(join(fixtureParent, 'schema-assets-'));
  for (const name of await readdir(join(repository, 'deployment/babal'), { recursive: true })) {
    if (!name.endsWith('.sql')) continue;
    const destination = join(root, 'deployment/babal', name);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(repository, 'deployment/babal', name), destination);
  }
  await copyReleaseManifestInputs(root);
  const migrationHelper = 'lib/operations/order-refund-maria-migrations.mjs';
  await copyFile(join(repository, migrationHelper), join(root, migrationHelper));
  return root;
}
async function cleanup(root: string) {
  const child = relative(fixtureParent, root);
  assert.ok(child.startsWith('schema-assets-') && !child.includes(sep) && resolve(root).startsWith(fixtureParent + sep));
  await rm(root, { recursive: true, force: true });
}

void test('selected schema bytes, readiness and manifest travel together without replacing historical sources', async () => {
  const root = await fixture();
  try {
    const historical = await readFile(join(root, schemaPath));
    const selected = Buffer.concat([historical, Buffer.from('\r\n-- Selected UTF-8 bytes: नेपाल\r\nCREATE TABLE selected_candidate (id BIGINT, proof TEXT) ENGINE=InnoDB;\r\n')]);
    const candidate = join(root, 'candidate.sql');
    const bundle = join(root, 'bundle');
    await writeFile(candidate, selected);
    const generated = run('scripts/generate-release-manifest.mjs', [`--schema-input=${candidate}`, `--asset-root=${bundle}`], root);
    assert.equal(generated.status, 0, generated.stderr);
    assert.deepEqual(await readFile(join(bundle, schemaPath)), selected, 'the bundle must contain the selected bytes, including line endings');
    const manifest = JSON.parse(await readFile(join(bundle, manifestPath), 'utf8'));
    const historicalManifest = JSON.parse(await readFile(join(repository, manifestPath), 'utf8'));
    assert.deepEqual(manifest.ownerAppliedMigrations, historicalManifest.ownerAppliedMigrations);
    assert.equal(manifest.migrations[0].path, schemaPath);
    assert.equal(manifest.migrations[0].sha256, sha256(selected));
    assert.deepEqual(manifest.requiredTables.selected_candidate, ['id', 'proof']);
    assert.equal(manifest.migrations.some((entry: { path: string }) => entry.path.includes('reset-empty')), false);
    for (const entry of manifest.migrations) assert.equal(sha256(await readFile(join(bundle, entry.path))), entry.sha256);
    assert.deepEqual(await readFile(join(root, schemaPath)), historical);
    await assert.rejects(readFile(join(root, manifestPath)), { code: 'ENOENT' }, 'bundle generation must not rewrite the public manifest');
    const repeated = run('scripts/generate-release-manifest.mjs', [`--schema-input=${candidate}`, `--asset-root=${bundle}`], root);
    assert.notEqual(repeated.status, 0, 'existing bundles are immutable');
    assert.deepEqual(await readFile(join(bundle, schemaPath)), selected);
  } finally { await cleanup(root); }
});

void test('build without explicit schema selection stops before compiler or canonical asset writes', async () => {
  const root = await fixture();
  try {
    // The fixture compiler would fail if reached; no application compiler is run.
    await mkdir(join(root, 'scripts'), { recursive: true });
    await copyFile(join(repository, 'scripts/build-babal.mjs'), join(root, 'scripts/build-babal.mjs'));
    await writeFile(join(root, 'scripts/build-hosted-security-cli.mjs'), 'export async function buildHostedSecurityCli() { throw new Error("Compiler must not run"); }');
    await copyFile(join(repository, 'scripts/generate-release-manifest.mjs'), join(root, 'scripts/generate-release-manifest.mjs'));
    await mkdir(join(root, 'lib/operations'), { recursive: true });
    await copyFile(join(repository, 'lib/operations/fee-schema-readiness.mjs'), join(root, 'lib/operations/fee-schema-readiness.mjs'));
    await writeFile(join(root, 'scripts/prepare-brand-assets.mjs'), 'throw new Error("Asset preparation must not run without explicit schema selection");');
    // Copy the production helper when present, allowing this regression to run before its introduction.
    try { await copyFile(join(repository, 'scripts/release-schema-assets.mjs'), join(root, 'scripts/release-schema-assets.mjs')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await copyFile(join(repository, 'scripts/release-files.mjs'), join(root, 'scripts/release-files.mjs'));
    const result = spawnSync(process.execPath, [join(root, 'scripts/build-babal.mjs')], { cwd: root, encoding: 'utf8', timeout: 30_000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /explicit --schema-input/, 'a frozen public schema must never become the implicit current build input');
    await assert.rejects(readFile(join(root, manifestPath)), { code: 'ENOENT' });
  } finally { await cleanup(root); }
});

void test('actual build orchestration snapshots selected bytes before the compiler and verifies the standalone inventory', async () => {
  const root = await fixture();
  try {
    const historical = await readFile(join(root, schemaPath));
    const selected = Buffer.concat([historical, Buffer.from('\nCREATE TABLE selected_build (id BIGINT) ENGINE=InnoDB;\n')]);
    await writeFile(join(root, 'selected.sql'), selected);
    for (const path of ['scripts/build-babal.mjs', 'scripts/generate-release-manifest.mjs', 'scripts/release-schema-assets.mjs', 'scripts/release-files.mjs', 'lib/operations/fee-schema-readiness.mjs', 'lib/operations/sql-schema-inventory.mjs', 'lib/operations/bootstrap-completion-contract.json']) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await copyFile(join(repository, path), join(root, path));
    }
    await writeFile(join(root, 'deployment/babal/app.cjs'), '// fixture startup\n');
    // Only external compilation is replaced. Production build, generator,
    // asset copy, schema validation and inventory all run unmodified.
    await writeFile(join(root, 'scripts/prepare-brand-assets.mjs'), '// no branding compiler in this fixture\n');
    await writeFile(join(root, 'scripts/build-hosted-security-cli.mjs'), `import {writeFile} from 'node:fs/promises'; import {join} from 'node:path'; export async function buildHostedSecurityCli(root) { await writeFile(join(root,'hosted-security.mjs'),'// fixture operator'); }`);
    await mkdir(join(root, 'node_modules/vinext/dist'), { recursive: true });
    await writeFile(join(root, 'node_modules/vinext/dist/cli.js'), `const fs = require('node:fs');
if (process.argv[2] !== 'build' || process.env.DEPLOY_TARGET !== 'babal') throw Error('Unexpected compiler invocation');
fs.mkdirSync('dist/standalone/dist/client',{recursive:true});
if (!process.env.HASTABAZAAR_BUILD_RELEASE_MANIFEST) throw Error('Build compiler received no selected manifest');
const selectedManifest=JSON.parse(fs.readFileSync(process.env.HASTABAZAAR_BUILD_RELEASE_MANIFEST,'utf8'));
fs.writeFileSync('dist/standalone/server.js',JSON.stringify(selectedManifest));
fs.writeFileSync('dist/standalone/package.json','{}');
fs.writeFileSync('dist/standalone/dist/client/vinext-client-entry-manifest.json','{}');
fs.writeFileSync('selected.sql','-- Input changed after its build snapshot.');
`);
    const built = spawnSync(process.execPath, [join(root, 'scripts/build-babal.mjs'), '--schema-input=selected.sql'], {
      cwd: root, encoding: 'utf8', timeout: 30_000, env: { ...process.env, HASTABAZAAR_RELEASE_ID: release },
    });
    assert.equal(built.status, 0, built.stderr);
    const standalone = join(root, 'dist/standalone');
    assert.deepEqual(await readFile(join(standalone, schemaPath)), selected);
    assert.deepEqual(JSON.parse(await readFile(join(standalone, 'server.js'), 'utf8')), JSON.parse(await readFile(join(standalone, manifestPath), 'utf8')), 'compiler and copied standalone assets use the identical manifest snapshot');
    assert.notDeepEqual(await readFile(join(root, 'selected.sql')), selected, 'the compiler changed the original input after selection');
    assert.deepEqual(await readFile(join(root, schemaPath)), historical);
    await assert.rejects(readFile(join(root, manifestPath)), { code: 'ENOENT' });
    const verify = (releaseId = release) => run('scripts/release-schema-assets.mjs', ['verify', standalone, releaseId], root);
    let result = verify();
    assert.equal(result.status, 0, result.stderr);
    const files = JSON.parse(result.stdout) as { path: string; sha256: string }[];
    assert.equal(files.find(file => file.path === schemaPath)?.sha256, sha256(selected));
    assert.notEqual(verify('hastabazaar-release-wrong').status, 0);

    // Replacing the selected SQL with the historical file must fail closed.
    await writeFile(join(standalone, schemaPath), historical);
    result = verify();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Migration hash mismatch/);
    await writeFile(join(standalone, schemaPath), selected);

    for (const forbidden of ['.env', '.staging/state.json', 'backup.db', 'deployment/babal/mariadb-reset-empty-import.sql', 'deployment/babal/unapproved.sql']) {
      const path = join(standalone, forbidden);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, 'synthetic forbidden fixture');
      result = verify();
      assert.notEqual(result.status, 0, forbidden);
      assert.match(result.stderr, /Forbidden/);
      await rm(path);
      if (forbidden.startsWith('.staging/')) await rm(dirname(path), { recursive: true });
    }
    const realAssets = join(standalone, 'deployment/real-babal');
    const linkedAssets = join(standalone, 'deployment/babal');
    await rename(linkedAssets, realAssets);
    await symlink(realAssets, linkedAssets, process.platform === 'win32' ? 'junction' : 'dir');
    result = verify();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be a real directory/);
    await rm(linkedAssets);
    await rename(realAssets, linkedAssets);
    const manifest = JSON.parse(await readFile(join(standalone, manifestPath), 'utf8'));
    manifest.migrations.push(manifest.migrations[0]);
    await writeFile(join(standalone, manifestPath), JSON.stringify(manifest));
    result = verify();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid migration entry/);
  } finally { await cleanup(root); }
});

void test('Linux CI packager remains unavailable on a non-Linux platform', { skip: process.platform === 'linux' && process.arch === 'x64' }, () => {
  const result = run('scripts/package-babal-ci.mjs', [release], repository);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be built on Linux x64/);
});

void test('hosted Vite config compiles readiness and form health from the selected manifest without rewriting public JSON', async () => {
  const root = await fixture();
  const previousTarget = process.env.DEPLOY_TARGET;
  const previousManifest = process.env.HASTABAZAAR_BUILD_RELEASE_MANIFEST;
  try {
    const publicPath = join(repository, manifestPath);
    const historical = await readFile(publicPath, 'utf8');
    const selected = { ...JSON.parse(historical), release,
      requiredTables: { selected_compiled_table: ['id', 'proof'] },
      migrations: [{ path: schemaPath, sha256: 'a'.repeat(64), usage: 'empty-database-only' }],
    };
    const selectedPath = join(root, 'selected-manifest.json');
    await writeFile(selectedPath, JSON.stringify(selected));
    process.env.DEPLOY_TARGET = 'babal';
    process.env.HASTABAZAAR_BUILD_RELEASE_MANIFEST = selectedPath;
    // Exercise the plugin selected by the actual hosted Vite configuration,
    // but compile only these pure consumers. No vinext app build or server.
    const factory = (await import('../vite.config')).default;
    assert.equal(typeof factory, 'function');
    const configuration = await factory({ command: 'build', mode: 'production' });
    const { build } = await import('vite');
    const plugins = (configuration.plugins ?? []).filter((plugin): plugin is import('vite').Plugin =>
      Boolean(plugin && typeof plugin === 'object' && !Array.isArray(plugin) && 'name' in plugin && plugin.name === 'hastabazaar-build-release-manifest'));
    const entry = join(root, 'entry.ts');
    await writeFile(entry, `
import {releaseId} from ${JSON.stringify(join(repository, 'lib/operations/readiness.ts').replaceAll('\\', '/'))};
import {formHealthRuntimeScope} from ${JSON.stringify(join(repository, 'lib/operations/form-health.ts').replaceAll('\\', '/'))};
import manifest from ${JSON.stringify(publicPath.replaceAll('\\', '/'))};
export const proof = {releaseId, formHealthRelease:formHealthRuntimeScope({},0).releaseId, schemaHash:manifest.migrations[0].sha256, tables:manifest.requiredTables};
`);
    await build({ configFile: false, envDir: false, root, publicDir: false, plugins, logLevel: 'silent', resolve: { alias: { '@': repository } },
      build: { ssr: entry, outDir: join(root, 'compiled'), minify: false,
        rolldownOptions: { output: { entryFileNames: 'proof.mjs' } } },
    });
    const compiled = await import(pathToFileURL(join(root, 'compiled/proof.mjs')).href);
    assert.equal(compiled.proof.releaseId, release);
    assert.equal(compiled.proof.formHealthRelease, release);
    assert.equal(compiled.proof.schemaHash, 'a'.repeat(64));
    assert.deepEqual(compiled.proof.tables, { selected_compiled_table: ['id', 'proof'] });
    assert.equal(await readFile(publicPath, 'utf8'), historical);
  } finally {
    if (previousTarget === undefined) delete process.env.DEPLOY_TARGET; else process.env.DEPLOY_TARGET = previousTarget;
    if (previousManifest === undefined) delete process.env.HASTABAZAAR_BUILD_RELEASE_MANIFEST; else process.env.HASTABAZAAR_BUILD_RELEASE_MANIFEST = previousManifest;
    await cleanup(root);
  }
});
