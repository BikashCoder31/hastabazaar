import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const repository = resolve(import.meta.dirname, '..');
const parent = join(repository, '.test-artifacts/t35/local-release-builtin-fix-sol-20261105/fixtures');
const api = () => import('../scripts/local-release-source.mjs');
async function fixture() {
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'source-'));
  for (const [path, bytes] of Object.entries({ 'package.json': '{}', 'package-lock.json': '{}', 'app/auth.ts': 'export const fixture = true;', '.test-artifacts/t35/schema/mariadb-schema.sql': '-- reviewed schema\n' })) {
    await put(root, path, bytes);
  }
  return { root, schema: '.test-artifacts/t35/schema/mariadb-schema.sql' };
}
async function put(root, path, bytes) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), bytes); }

void test('dirty and untracked inputs identify content without claiming a commit or runtime', async () => {
  const { captureLocalSource, verifyLocalSource } = await api();
  const { root, schema } = await fixture();
  const first = await captureLocalSource(root, schema);
  assert.equal(first.commit, null);
  assert.equal(first.artifactKind, 'source-snapshot');
  assert.equal(first.linuxRuntimeVerified, false);
  assert.equal(first.schema.sha256, createHash('sha256').update('-- reviewed schema\n').digest('hex'));
  await verifyLocalSource(root, first, first.sourceSha256);
  await put(root, 'lib/new-untracked.ts', 'export const added = 1;');
  await assert.rejects(verifyLocalSource(root, first, first.sourceSha256), /Source changed/);
  const second = await captureLocalSource(root, schema);
  assert.notEqual(first.sourceSha256, second.sourceSha256);
  await put(root, 'app/auth.ts', 'export const fixture = false;');
  await assert.rejects(verifyLocalSource(root, second, second.sourceSha256), /Source changed/);
});

void test('schema changes and tampered manifest identity fail independently of Git', async () => {
  const { captureLocalSource, verifyLocalSource } = await api();
  const { root, schema } = await fixture();
  const before = await captureLocalSource(root, schema);
  await assert.rejects(verifyLocalSource(root, { ...before, commit: 'a'.repeat(40) }, before.sourceSha256), /source snapshot/);
  const modified = structuredClone(before); modified.files[0].sha256 = 'b'.repeat(64);
  await assert.rejects(verifyLocalSource(root, modified, before.sourceSha256), /digest/);
  await assert.rejects(verifyLocalSource(root, before, '0'.repeat(64)), /digest/);
  await put(root, schema, '-- changed schema\n');
  await assert.rejects(verifyLocalSource(root, before, before.sourceSha256), /Source changed/);
});

void test('generated and private root data are excluded explicitly; private data under input roots stops capture', async () => {
  const { captureLocalSource } = await api();
  const { root, schema } = await fixture();
  const before = await captureLocalSource(root, schema);
  await put(root, '.staging/config.json', 'private');
  await put(root, 'dist/standalone/server.js', 'generated');
  await put(root, 'public/brand/hastabazaar-mark-96.png', 'generated');
  const after = await captureLocalSource(root, schema);
  assert.equal(after.sourceSha256, before.sourceSha256);
  assert.ok(after.exclusions.includes('public/brand/hastabazaar-mark-96.png'));
  for (const path of ['lib/.env.production', 'public/private-media/customer.txt', 'scripts/key.pem', 'app/.dev.vars']) {
    const item = await fixture(); await put(item.root, path, 'private');
    await assert.rejects(captureLocalSource(item.root, item.schema), /Private|Forbidden/);
  }
});

void test('source and selected schema reject traversal, symlink ancestors and non-source paths', async () => {
  const { captureLocalSource } = await api();
  const { root, schema } = await fixture();
  await assert.rejects(captureLocalSource(root, '../schema.sql'), /schema path/);
  await assert.rejects(captureLocalSource(root, 'dist/schema.sql'), /schema path/);
  const external = await fixture();
  await symlink(join(external.root, 'app'), join(root, 'lib'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(captureLocalSource(root, schema), /link|redirect/i);
  const redirected = await fixture();
  await symlink(join(external.root, '.test-artifacts/t35/schema'), join(redirected.root, '.test-artifacts/t35/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(captureLocalSource(redirected.root, '.test-artifacts/t35/linked/mariadb-schema.sql'), /link|redirect/i);
});

void test('local Linux admission rejects the real non-Linux host before accepting a runtime claim', async () => {
  const { requireLocalLinux } = await api();
  if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITHUB_SHA) assert.throws(() => requireLocalLinux(), /forbidden in CI/);
  else if (process.platform !== 'linux' || process.arch !== 'x64') assert.throws(() => requireLocalLinux(), /Linux x64/);
  else assert.doesNotThrow(() => requireLocalLinux());
});

void test('materialized source retains exact dirty bytes, excludes generated assets and refuses reuse', async () => {
  const { captureLocalSource, materializeLocalSource, verifyLocalSource, inventoryDerivedBrand } = await api();
  const { root, schema } = await fixture();
  await put(root, 'lib/untracked.ts', 'export const value = "नेपाल";\r\n');
  await put(root, 'public/brand/hastabazaar-mark-96.png', 'preserved old brand bytes');
  const snapshot = await captureLocalSource(root, schema);
  const destination = join(parent, 'copy-' + root.split(sepForHost()).at(-1));
  await materializeLocalSource(root, snapshot, snapshot.sourceSha256, destination);
  await verifyLocalSource(destination, snapshot, snapshot.sourceSha256);
  assert.deepEqual(await readFile(join(destination, 'lib/untracked.ts')), await readFile(join(root, 'lib/untracked.ts')));
  assert.ok((await inventoryDerivedBrand(destination)).every(file => file.absent));
  assert.equal((await inventoryDerivedBrand(root)).find(file => file.path.endsWith('mark-96.png')).bytes, 25);
  await assert.rejects(materializeLocalSource(root, snapshot, snapshot.sourceSha256, destination), { code: 'EEXIST' });
});
function sepForHost() { return process.platform === 'win32' ? '\\' : '/'; }

void test('builtin-named declared npm dependencies require installed local packages', async () => {
  const { verifyDependencyLocations } = await api();
  for (const name of ['events', 'buffer', 'util']) {
    const { root } = await fixture();
    await put(root, 'package.json', JSON.stringify({ dependencies: { [name]: '1.0.0' } }));
    await put(root, `node_modules/${name}/package.json`, JSON.stringify({ name, main: 'index.cjs' }));
    await put(root, `node_modules/${name}/index.cjs`, 'throw new Error("must never execute during admission");');
    const receipt = [];
    await verifyDependencyLocations(root, `${root}\n${join(root, 'node_modules', name)}`, receipt);
    const dependency = receipt.find(item => item.specifier === name);
    assert.equal(dependency.packageRoot, join(root, 'node_modules', name));
    assert.equal(dependency.entry, name); // Node still resolves the bare name to its builtin.
    const missing = await fixture();
    await put(missing.root, 'package.json', JSON.stringify({ dependencies: { [name]: '1.0.0' } }));
    // The project may itself install this npm package: ancestor fallback is also rejected.
    await assert.rejects(verifyDependencyLocations(missing.root, missing.root), new RegExp(`Missing declared dependency: ${name}|Dependency resolved outside isolated source: ${name}`));
  }
  const missing = await fixture();
  await put(missing.root, 'package.json', '{"dependencies":{"owned-builtin-fix-definitely-missing":"1.0.0"}}');
  await assert.rejects(verifyDependencyLocations(missing.root, missing.root), /Missing declared dependency: owned-builtin-fix-definitely-missing/);
});

void test('isolated copy admits only the exact regular generated next-env declaration', async () => {
  const { captureLocalSource, verifyIsolatedSource } = await api();
  const { root, schema } = await fixture();
  const snapshot = await captureLocalSource(root, schema);
  await put(root, 'next-env.d.ts', 'import "vinext/types";\nimport "./.next/types/routes.d.ts";\n\n// NOTE: This file should not be edited\n// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.\n');
  await assert.rejects(verifyIsolatedSource(root, snapshot, snapshot.sourceSha256), /Unexpected isolated/);
  await verifyIsolatedSource(root, snapshot, snapshot.sourceSha256, { afterBuild: true });
  await put(root, 'next-env.d.ts', 'import "outside-package";');
  await assert.rejects(verifyIsolatedSource(root, snapshot, snapshot.sourceSha256, { afterBuild: true }), /Unexpected generated/);
  await put(root, 'next-env.js', 'unexpected');
  await assert.rejects(verifyIsolatedSource(root, snapshot, snapshot.sourceSha256), /Source changed|Unexpected/);
});

void test('dependency entry preflight rejects an escaping main even when package directories are local', async () => {
  const { verifyDependencyLocations } = await api();
  const { root } = await fixture();
  await put(root, 'node_modules/local/package.json', JSON.stringify({ name: 'local', main: '../../../outside.cjs' }));
  await put(dirname(root), 'outside.cjs', 'module.exports = "owned sentinel";');
  await assert.rejects(verifyDependencyLocations(root, `${root}\n${join(root, 'node_modules/local')}\n`), /outside isolated/);
});

void test('dependency entry preflight rejects declared ancestor fallback and compiler metadata escapes', async () => {
  const { verifyDependencyLocations } = await api();
  const { root } = await fixture();
  await put(dirname(root), 'node_modules/owned-ancestor/package.json', '{"name":"owned-ancestor","main":"index.cjs"}');
  await put(dirname(root), 'node_modules/owned-ancestor/index.cjs', 'module.exports = 1;');
  await put(root, 'package.json', '{"dependencies":{"owned-ancestor":"1.0.0"}}');
  await assert.rejects(verifyDependencyLocations(root, root), /outside isolated/);
  await put(root, 'package.json', '{}');
  for (const metadata of [{ module: '../../../outside.mjs' }, { bin: { tool: '../../../outside.cjs' } }, { exports: { import: '../../../outside.mjs' } }]) {
    await put(root, 'node_modules/local/package.json', JSON.stringify({ name: 'local', ...metadata }));
    await assert.rejects(verifyDependencyLocations(root, `${root}\n${join(root, 'node_modules/local')}`), /outside isolated|Invalid dependency target/);
  }
});

void test('resolution receipt identifies actual local entries and rejects a probed undeclared ancestor import', async () => {
  const { verifyDependencyLocations, verifyDependencyEntry } = await api();
  const { root } = await fixture();
  await put(root, 'package.json', '{"dependencies":{"owned-local":"1.0.0"}}');
  await put(root, 'node_modules/owned-local/package.json', '{"name":"owned-local","main":"index.cjs"}');
  await put(root, 'node_modules/owned-local/index.cjs', 'throw new Error("must never execute during admission");');
  const receipt = [];
  await verifyDependencyLocations(root, `${root}\n${join(root, 'node_modules/owned-local')}`, receipt);
  assert.equal(receipt.find(item => item.specifier === 'owned-local').entry, join(root, 'node_modules/owned-local/index.cjs'));
  await put(dirname(root), 'node_modules/owned-undeclared/package.json', '{"main":"index.cjs"}');
  await put(dirname(root), 'node_modules/owned-undeclared/index.cjs', 'module.exports = 1;');
  await assert.rejects(verifyDependencyEntry(root, join(root, 'package.json'), 'owned-undeclared'), /outside isolated/);
});

void test('generated declaration directories and dependency internal redirects are rejected', async () => {
  const { captureLocalSource, verifyIsolatedSource, verifyDependencyLocations } = await api();
  const { root, schema } = await fixture();
  const snapshot = await captureLocalSource(root, schema);
  await mkdir(join(root, 'next-env.d.ts'));
  await assert.rejects(verifyIsolatedSource(root, snapshot, snapshot.sourceSha256, { afterBuild: true }), /regular file/);
  const external = await fixture();
  await mkdir(join(root, 'node_modules/local'), { recursive: true });
  await symlink(join(external.root, 'app'), join(root, 'node_modules/local/internal'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyDependencyLocations(root, `${root}\n${join(root, 'node_modules/local')}`), /outside isolated/);
});

void test('candidate CLI stops CI and wrong-platform execution before touching inputs or outputs', () => {
  const run = env => spawnSync(process.execPath, [join(repository, 'scripts/build-local-release-candidate.mjs'), 'missing.json', '0'.repeat(64), 'missing/source', 'hastabazaar-release-fixture'], { cwd: repository, encoding: 'utf8', env });
  const ci = run({ ...process.env, CI: 'true' });
  assert.notEqual(ci.status, 0); assert.match(ci.stderr, /forbidden in CI/);
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    const env = { ...process.env }; delete env.CI; delete env.GITHUB_ACTIONS; delete env.GITHUB_SHA;
    const wrongHost = run(env);
    assert.notEqual(wrongHost.status, 0); assert.match(wrongHost.stderr, /Linux x64/);
  }
});

void test('isolated build copy rejects extra private input even when canonical freeze excludes it', async () => {
  const { captureLocalSource, materializeLocalSource, verifyIsolatedSource } = await api();
  const { root, schema } = await fixture();
  const snapshot = await captureLocalSource(root, schema);
  const destination = join(parent, 'isolated-' + root.split(sepForHost()).at(-1));
  await materializeLocalSource(root, snapshot, snapshot.sourceSha256, destination);
  await verifyIsolatedSource(destination, snapshot, snapshot.sourceSha256);
  await put(destination, '.env.production', 'DATABASE_URL=must-not-be-read');
  await assert.rejects(verifyIsolatedSource(destination, snapshot, snapshot.sourceSha256), /Unexpected isolated/);
});

void test('candidate shared archive gates reject extracted runtime and schema tampering', async () => {
  const { verifyStandaloneAssets } = await import('../scripts/release-schema-assets.mjs');
  const { verifyRelease } = await import('../scripts/release-files.mjs');
  const { extractStagingArchive } = await import('../scripts/deployment/staging-archive.mjs');
  const tar = await import('tar');
  const { root } = await fixture();
  const standalone = join(root, 'fixture-bundle');
  const schema = '-- fixture schema\n';
  const release = 'hastabazaar-release-local-identity-fixture';
  const schemaPath = 'deployment/babal/mariadb-schema.sql';
  for (const name of ['app.cjs', 'server.js', 'package.json', 'hosted-security.mjs', 'dist/client/vinext-client-entry-manifest.json']) await put(standalone, name, 'runtime');
  await put(standalone, schemaPath, schema);
  await put(standalone, 'deployment/babal/release-manifest.json', JSON.stringify({ release, migrations: [{ path: schemaPath, usage: 'empty-database-only', sha256: createHash('sha256').update(schema).digest('hex') }] }));
  const { files, migrationPaths } = await verifyStandaloneAssets(standalone, release);
  const archive = join(root, 'fixture.tar.gz');
  await tar.c({ cwd: standalone, file: archive, gzip: true }, ['.']);
  const extracted = join(root, 'extracted'); await mkdir(extracted);
  await extractStagingArchive(archive, extracted, files);
  await verifyRelease(extracted, files, migrationPaths);
  await verifyStandaloneAssets(extracted, release);
  await put(extracted, 'server.js', 'tamper!');
  await assert.rejects(verifyRelease(extracted, files, migrationPaths), /inventory mismatch/);
  await put(extracted, schemaPath, '-- altered schema\n');
  await assert.rejects(verifyStandaloneAssets(extracted, release), /Migration hash mismatch/);
});

void test('dependency admission accepts local vendor links and rejects ancestor or linked external packages', async () => {
  const { verifyDependencyLocations } = await api();
  const { root } = await fixture();
  const external = await fixture();
  await mkdir(join(root, 'node_modules'));
  await mkdir(join(root, 'vendor/local-package'), { recursive: true });
  await symlink(join(root, 'vendor/local-package'), join(root, 'node_modules/local-package'), process.platform === 'win32' ? 'junction' : 'dir');
  const approved = `${root}\n${join(root, 'node_modules/local-package')}\n`;
  const paths = await verifyDependencyLocations(root, approved);
  assert.equal(paths.length, 2);
  await assert.rejects(verifyDependencyLocations(root, `${root}\n${external.root}\n`), /outside isolated/);
  await symlink(external.root, join(root, 'node_modules/escaped'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyDependencyLocations(root, `${root}\n${join(root, 'node_modules/escaped')}\n`), /outside isolated/);
});
