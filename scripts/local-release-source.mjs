import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire, isBuiltin } from 'node:module';

const repository = fileURLToPath(new URL('../', import.meta.url));
const directories = ['app', 'components', 'lib', 'db', 'hooks', 'public', 'scripts', 'tests', 'drizzle', 'deployment', 'vendor', '.github'];
const fixedFiles = ['.openai/hosting.json', '.editorconfig', '.gitattributes', '.gitignore', 'START-HASTABAZAAR.cmd', 'AGENTS.md', 'LOCAL-START.md'];
export const derivedBrandPaths = ['hastabazaar-logo-lockup-640.png', 'hastabazaar-logo-lockup-640.webp', 'hastabazaar-mark-512.png', 'hastabazaar-mark-192.png', 'hastabazaar-mark-96.png', 'hastabazaar-icon-32.png', 'hastabazaar-apple-touch-icon.png'].map(name => `public/brand/${name}`);
const scope = 'application-build-and-tests-v1: declared input directories, root code/config files, hosting config, launcher instructions, selected schema; docs and dependency installation excluded';
const exclusions = ['docs/', 'node_modules/', '.git/', '.staging/', '.wrangler/', '.next/', '.vinext/', 'dist/', 'output/', 'outputs/', 'private-media/', 'uploads/', '.test-artifacts/ except selected schema', 'qa-test-accounts.json', 'next-env.d.ts', 'root environment/credential files', 'other root directories and prose/assets outside declared input scope', ...derivedBrandPaths];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sorted = records => records.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export function requireLocalLinux() {
  assert.ok(!process.env.CI && !process.env.GITHUB_ACTIONS && !process.env.GITHUB_SHA, 'Local candidates are forbidden in CI or with commit-identity environment.');
  assert.equal(process.platform + '/' + process.arch, 'linux/x64', 'Local candidates require real Linux x64.');
  const [major, minor] = process.versions.node.split('.').map(Number);
  assert.ok(major > 22 || major === 22 && minor >= 13, 'Node >=22.13.0 is required.');
}

function sourcePath(path) {
  assert.ok(typeof path === 'string' && path && !Array.from(path).some(character => character === '\\' || character === ':' || character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127) && path.split('/').every(part => part && part !== '.' && part !== '..'), 'Forbidden source path.');
  assert.ok(!/(^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|\.npmrc|\.netrc|\.pypirc|\.ssh|\.aws|\.git|\.staging|node_modules|private-media|uploads|backups?|id_rsa|id_ed25519)(\/|$)/i.test(path) && !/\.(?:pem|key|p12|pfx|sqlite(?:3)?(?:-wal|-shm)?|db(?:-wal|-shm)?|zip|tar|tgz|gz|log)$/i.test(path), 'Private/generated source path is forbidden.');
}

/** Reject every link ancestor, including the chosen root. Never resolve through it. */
export async function realPath(path) {
  const absolute = resolve(path);
  const base = parse(absolute).root;
  let cursor = base;
  for (const part of relative(base, absolute).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    assert.ok(!(await lstat(cursor)).isSymbolicLink(), 'Path must not contain links or redirects.');
  }
  return absolute;
}

async function record(root, path) {
  sourcePath(path);
  const absolute = await realPath(join(root, path));
  assert.ok((await lstat(absolute)).isFile(), 'Source input must be a regular file.');
  const bytes = await readFile(absolute);
  return { path, bytes: bytes.length, sha256: hash(bytes) };
}

function sourceDigest(snapshot) {
  return hash(JSON.stringify({ scope, exclusions, files: snapshot.files, schema: snapshot.schema }));
}

export async function captureLocalSource(project, schemaPath) {
  const root = await realPath(project);
  assert.ok((await lstat(root)).isDirectory(), 'Source root must be a real directory.');
  assert.ok(typeof schemaPath === 'string' && /^\.test-artifacts\/t35\/[a-zA-Z0-9._-]+\/mariadb-schema\.sql$/.test(schemaPath) && !schemaPath.split('/').includes('..'), 'Selected schema path must name a reviewed T35 child/mariadb-schema.sql.');
  const files = [];
  async function visit(path, optional = false) {
    if (derivedBrandPaths.includes(path)) return;
    sourcePath(path);
    let stat;
    try { stat = await lstat(join(root, path)); } catch (error) { if (optional && error.code === 'ENOENT') return; throw error; }
    assert.ok(!stat.isSymbolicLink(), 'Source input must not be a link.');
    if (stat.isDirectory()) for (const name of (await readdir(join(root, path))).sort()) await visit(path + '/' + name);
    else files.push(await record(root, path));
  }
  for (const directory of directories) await visit(directory, true);
  for (const path of fixedFiles) await visit(path, true);
  for (const name of (await readdir(root)).sort()) {
    if (name === 'qa-test-accounts.json' || name === 'next-env.d.ts' || name.startsWith('.env') || name.startsWith('.dev.vars')) continue;
    if (/\.(?:[cm]?js|[cm]?ts|tsx|jsx|json|yaml|yml)$/.test(name)) await visit(name);
  }
  sorted(files);
  for (const required of ['package.json', 'package-lock.json', 'app/auth.ts']) assert.ok(files.some(file => file.path === required), `Missing source input: ${required}`);
  const snapshot = { schemaVersion: 1, artifactKind: 'source-snapshot', commit: null, linuxRuntimeVerified: false, scope, exclusions, files, schema: await record(root, schemaPath) };
  return { ...snapshot, sourceSha256: sourceDigest(snapshot) };
}

export async function verifyLocalSource(project, snapshot, expectedSha256) {
  assert.ok(snapshot?.schemaVersion === 1 && snapshot.artifactKind === 'source-snapshot' && snapshot.commit === null && snapshot.linuxRuntimeVerified === false, 'Expected an honest local source snapshot.');
  assert.equal(snapshot.scope, scope, 'Source scope differs.');
  assert.deepEqual(snapshot.exclusions, exclusions, 'Source exclusions differ.');
  assert.ok(/^[a-f0-9]{64}$/.test(expectedSha256 ?? '') && snapshot.sourceSha256 === expectedSha256 && sourceDigest(snapshot) === expectedSha256, 'Source manifest digest mismatch.');
  const actual = await captureLocalSource(project, snapshot.schema.path);
  assert.equal(actual.sourceSha256, expectedSha256, 'Source changed since the reviewed freeze.');
  return actual;
}

export async function inventoryDerivedBrand(project) {
  const files = [];
  for (const path of derivedBrandPaths) {
    try { files.push(await record(project, path)); }
    catch (error) { if (error.code === 'ENOENT') files.push({ path, absent: true }); else throw error; }
  }
  return files;
}

/** A materialized build copy admits only the frozen files and named build/dependency outputs. */
export async function verifyIsolatedSource(project, snapshot, expectedSha256, { afterBuild = false } = {}) {
  await verifyLocalSource(project, snapshot, expectedSha256);
  const expected = new Set([...snapshot.files.map(file => file.path), snapshot.schema.path, ...derivedBrandPaths]);
  if (afterBuild) {
    // Exact Linux output of pinned vinext 1.0.0-beta.9 for this app (no Next dependency).
    const generated = 'import "vinext/types";\nimport "./.next/types/routes.d.ts";\n\n// NOTE: This file should not be edited\n// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.\n';
    const declaration = await realPath(join(project, 'next-env.d.ts'));
    assert.ok((await lstat(declaration)).isFile(), 'Generated next-env declaration must be a regular file.');
    assert.equal(await readFile(declaration, 'utf8'), generated, 'Unexpected generated next-env declaration content.');
    expected.add('next-env.d.ts');
  }
  const parents = new Set();
  for (const path of expected) {
    const parts = path.split('/');
    while (parts.length > 1) { parts.pop(); parents.add(parts.join('/')); }
  }
  async function visit(prefix = '') {
    for (const name of await readdir(join(project, prefix))) {
      const path = prefix ? prefix + '/' + name : name;
      const stat = await lstat(join(project, path));
      assert.ok(!stat.isSymbolicLink(), 'Isolated input/output root must not be a link.');
      if (['node_modules', 'dist', '.next', '.vinext'].includes(path)) {
        assert.ok(stat.isDirectory(), 'Dependency/build output must be a real directory.');
      } else if (stat.isDirectory()) {
        assert.ok(parents.has(path), `Unexpected isolated input directory: ${path}`);
        await visit(path);
      } else assert.ok(stat.isFile() && expected.has(path), `Unexpected isolated input file: ${path}`);
    }
  }
  await visit();
}

function contained(root, path) {
  const child = relative(root, path);
  return !isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep);
}

/** Audit resolved files, without loading package code. This is not a process/filesystem sandbox. */
export async function verifyDependencyEntry(project, importer, specifier) {
  const root = await realpath(await realPath(project));
  if (isBuiltin(specifier)) return specifier;
  const entry = await realpath(createRequire(importer).resolve(specifier));
  assert.ok(contained(root, entry), `Dependency entry resolved outside isolated source: ${specifier}`);
  assert.ok((await lstat(entry)).isFile(), 'Dependency entry must be a regular file.');
  return entry;
}

/** npm directories plus link, package-target and Node resolution preflight; not universal dynamic-import containment. */
export async function verifyDependencyLocations(project, npmPaths, receipt = []) {
  const root = await realpath(await realPath(project));
  const paths = npmPaths.trim().split(/\r?\n/);
  assert.ok(paths.length > 0 && paths.every(path => isAbsolute(path)), 'Expected absolute npm dependency paths.');
  assert.equal(await realpath(paths[0]), root, 'npm inspected a different source root.');
  const resolved = [];
  for (const path of paths) {
    const actual = await realpath(path);
    const child = relative(root, actual);
    assert.ok(!isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep), 'Dependency resolved outside isolated source.');
    assert.ok(!child || ['node_modules', 'vendor'].includes(child.split(sep)[0]), 'Dependency resolved outside isolated dependency locations.');
    assert.ok((await lstat(actual)).isDirectory(), 'Dependency root must be a directory.');
    resolved.push(actual);
  }
  // Check even unreported bundled files and internal links, not just package roots.
  const visited = new Set();
  async function inspectTree(path) {
    const actual = await realpath(path);
    assert.ok(contained(root, actual), 'Dependency file/link resolved outside isolated source.');
    if (visited.has(actual)) return;
    visited.add(actual);
    const stat = await lstat(actual);
    if (stat.isDirectory()) for (const name of await readdir(actual)) await inspectTree(join(actual, name));
    else assert.ok(stat.isFile(), 'Dependency input must be a regular file.');
  }
  for (const path of ['node_modules', 'vendor']) {
    const location = join(root, path);
    try { await lstat(location); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    await inspectTree(location);
  }
  for (const directory of new Set(resolved)) {
    let metadata;
    try { metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const importer = join(directory, 'package.json');
    async function target(value, field) {
      if (value === false || value === null || value === undefined) return;
      if (typeof value === 'object') { for (const item of Object.values(value)) await target(item, field); return; }
      assert.equal(typeof value, 'string', 'Invalid dependency target.');
      if (field === 'imports' && !value.startsWith('.')) {
        if (!value.includes('*')) receipt.push({ importer, specifier: value, entry: await verifyDependencyEntry(root, importer, value) });
        return;
      }
      const destination = resolve(directory, value);
      assert.ok(contained(root, destination), 'Dependency target outside isolated source.');
      // Existing prefix covers wildcard targets and optional/unshipped platform entries.
      let prefix = destination.split('*')[0];
      while (contained(root, prefix)) {
        try { assert.ok(contained(root, await realpath(prefix)), 'Dependency target outside isolated source.'); break; }
        catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; prefix = dirname(prefix); }
      }
      receipt.push({ importer, field, target: value, destination });
    }
    for (const field of ['main', 'module', 'browser', 'bin', 'exports', 'imports', 'types', 'typings']) await target(metadata[field], field);
    const require = createRequire(importer);
    const declared = { ...metadata.dependencies, ...metadata.optionalDependencies, ...metadata.peerDependencies, ...(directory === root ? metadata.devDependencies : {}) };
    for (const name of Object.keys(declared)) {
      // Locate package independently of exports and builtin bare-name resolution.
      // The package.json subpath requests ordinary importer-relative node_modules paths;
      // a builtin entry alone must never satisfy a declared npm dependency.
      let packageRoot;
      for (const search of require.resolve.paths(`${name}/package.json`) ?? []) {
        try { packageRoot = await realpath(join(search, name)); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      if (!packageRoot) {
        assert.ok(Object.hasOwn(metadata.optionalDependencies ?? {}, name) || metadata.peerDependenciesMeta?.[name]?.optional, `Missing declared dependency: ${name}`);
        continue;
      }
      assert.ok(contained(root, packageRoot), `Dependency resolved outside isolated source: ${name}`);
      let entry = null;
      try { entry = await verifyDependencyEntry(root, importer, name); }
      catch (error) {
        // A package can have only named exports or types; target metadata is still audited.
        if (!['ERR_PACKAGE_PATH_NOT_EXPORTED', 'MODULE_NOT_FOUND'].includes(error.code)) throw error;
      }
      receipt.push({ importer, specifier: name, packageRoot, entry });
    }
  }
  return resolved;
}

export async function materializeLocalSource(project, snapshot, expectedSha256, destination) {
  await verifyLocalSource(project, snapshot, expectedSha256);
  await realPath(dirname(destination));
  await mkdir(destination); // A source evidence copy is never an active preview checkout.
  for (const file of [...snapshot.files, snapshot.schema]) {
    const bytes = await readFile(await realPath(join(project, file.path)));
    assert.equal(hash(bytes), file.sha256, 'Source changed while copying.');
    const target = join(destination, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }
  await verifyLocalSource(project, snapshot, expectedSha256);
  await verifyLocalSource(destination, snapshot, expectedSha256);
  return destination;
}

export async function ownedEvidencePath(project, path, leaf) {
  const absolute = resolve(project, path);
  const local = relative(resolve(project, '.test-artifacts/t35'), absolute).split(sep);
  assert.ok(local.length === 2 && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(local[0]) && local[1] === leaf, `Expected a T35 child/${leaf} path.`);
  await realPath(dirname(absolute));
  return absolute;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, first, second, third] = process.argv.slice(2);
  assert.ok(!process.env.CI && !process.env.GITHUB_ACTIONS, 'Local source preparation is forbidden in CI.');
  if (command === 'freeze' && first && second && !third) {
    const output = await ownedEvidencePath(repository, second, 'source.json');
    const snapshot = await captureLocalSource(repository, first);
    await verifyLocalSource(repository, snapshot, snapshot.sourceSha256);
    await writeFile(output, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
    console.log(snapshot.sourceSha256);
  } else if (command === 'materialize' && first && second && third && process.argv.length === 6) {
    const snapshotPath = await ownedEvidencePath(repository, first, 'source.json');
    await realPath(snapshotPath);
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
    const destination = await ownedEvidencePath(repository, third, 'source');
    await materializeLocalSource(repository, snapshot, second, destination);
    console.log(destination);
  } else throw new Error('Usage: local-release-source.mjs freeze <reviewed-schema-relative-path> <T35-child/source.json> | materialize <T35-child/source.json> <reviewed-source-sha256> <T35-child/source>');
}
