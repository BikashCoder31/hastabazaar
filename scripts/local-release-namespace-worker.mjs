// Executed only within the finite host-reviewed namespace. No host-path fallback.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, lstat, mkdir, readFile, readdir, readlink, writeFile } from 'node:fs/promises';
import { createServer, connect } from 'node:net';
import { once } from 'node:events';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { requireLocalLinux, realPath, verifyDependencyLocations, verifyDependencyEntry, verifyIsolatedSource, verifyLocalSource, inventoryDerivedBrand } from './local-release-source.mjs';
import { sha256, saveExclusive, verifyInputs, inventoryTree } from './local-release-namespace.mjs';

requireLocalLinux();
assert.equal(process.execPath, '/runtime/bin/node');
const [phase] = process.argv.slice(2); assert.ok(['transfer', 'build'].includes(phase));
const config = JSON.parse(await readFile('/worker-config.json', 'utf8'));
assert.equal(config.commit, null); assert.equal(config.kind, 'namespace-aliases-not-checkout');
assert.match(config.owner, /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const owner = `/project/.test-artifacts/t35/${config.owner}`, source = `${owner}/source`;
const output = `/evidence/${phase}`; await mkdir(output);
const save = (name, value) => saveExclusive(join(output, name), value);
const mounts = (await readFile('/proc/self/mountinfo', 'utf8')).trim().split('\n').map(line => line.split(' '));
for (const path of ['/project', '/runtime', '/worker-config.json', `${owner}/source.json`, ...config.snapshot.files.map(f => `/project/${f.path}`), `/project/${config.snapshot.schema.path}`, ...config.brands.filter(f => !f.absent).map(f => `/project/${f.path}`), ...(phase === 'build' ? [`${source}/node_modules`] : ['/acquired'])]) {
  assert.ok(mounts.some(fields => fields[4] === path.replaceAll(' ', '\\040') && fields[5].split(',').includes('ro')), `Read-only mount missing: ${path}`);
}
const namespaces = {};
for (const name of ['user', 'mnt', 'net', 'pid']) {
  namespaces[name] = await readlink(`/proc/self/ns/${name}`);
  assert.ok(process.env[`RELEASE_HOST_${name.toUpperCase()}_NS`]);
  assert.notEqual(namespaces[name], process.env[`RELEASE_HOST_${name.toUpperCase()}_NS`]);
}
const interfaces = networkInterfaces();
assert.deepEqual(Object.keys(interfaces), ['lo']);
assert.ok(Object.values(interfaces).flat().every(x => x.internal));
for (const path of [config.canonicalHostPath, '/project/node_modules', '/node_modules', '/nonexistent-home', '/home', '/root', '/run/docker.sock', '/var/run/docker.sock', '/project/.git', '/project/.staging', '/project/.env', '/project/.dev.vars']) await assert.rejects(lstat(path), { code: 'ENOENT' });
assert.equal(process.env.HOME, '/nonexistent-home');
await save('namespace.json', { aliases: { '/project': 'read-only selected actual host canonical files, not a checkout', [source]: 'owned source artifact, never a preview launch target', [owner]: 'explicit writable output parent; source.json read-only; candidate initially absent' }, namespaces, interfaces, mounts });
await verifyLocalSource('/project', config.snapshot, config.sourceSha256);
await verifyIsolatedSource(source, config.snapshot, config.sourceSha256);
assert.deepEqual(await inventoryDerivedBrand('/project'), config.brands);
await verifyInputs(source, config.inputs);
await assert.rejects(lstat(`${owner}/candidate`), { code: 'ENOENT' });
assert.deepEqual((await readdir(owner)).sort(), ['source', 'source.json']);

if (phase === 'transfer') {
  await verifyInputs('/acquired', config.inputs);
  await assert.rejects(lstat(`${source}/node_modules`), { code: 'ENOENT' });
  for (const cache of ['.vite-temp', '.vite']) await assert.rejects(lstat(`/acquired/node_modules/${cache}`), { code: 'ENOENT' }, 'Never exclude an acquired dependency path as cache.');
  const before = await inventoryTree('/acquired');
  await save('dependencies-before.json', before);
  // Linux cp preserves raw relative symlinks and file modes; never copy or follow canonical node_modules.
  await cp('/acquired/node_modules', `${source}/node_modules`, { recursive: true, dereference: false, verbatimSymlinks: true, errorOnExist: true, force: false, preserveTimestamps: true });
  const after = await inventoryTree(source);
  assert.deepEqual(after, before, 'Dependency transfer changed bytes, relative links or modes.');
  assert.deepEqual(await inventoryTree('/acquired'), before, 'Acquired dependency tree changed during transfer.');
  await verifyInputs('/acquired', config.inputs); await verifyInputs(source, config.inputs);
  await verifyIsolatedSource(source, config.snapshot, config.sourceSha256);
  for (const cache of ['.vite-temp', '.vite']) await mkdir(`${source}/node_modules/${cache}`);
  await save('cache-mountpoints.json', { addedEmptyDirectories: ['node_modules/.vite-temp', 'node_modules/.vite'], originalAcquiredPathsAbsent: true });
  await save('result.json', { commit: null, copiedRecords: after.length, links: after.filter(r => r.link).length, inputRecords: 13, inputsUnchanged: true, dependencyInventorySha256: sha256(JSON.stringify(after)), lifecycleScriptsExecuted: false, nativePackagesExecuted: false, applicationBuild: false });
} else {
  // First verify loopback can carry a private connection. No host/external interface is present.
  const server = createServer(socket => socket.end('private-loopback'));
  let client;
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    client = connect(server.address().port, '127.0.0.1'); client.setTimeout(5000, () => client.destroy(new Error('Loopback probe timed out.')));
    let value = ''; client.on('data', chunk => { value += chunk; }); await once(client, 'end'); assert.equal(value, 'private-loopback');
  } finally { client?.destroy(); if (server.listening) await new Promise(done => server.close(done)); }
  await save('loopback.json', { privateConnectionSucceeded: true });
  const transferred = JSON.parse(await readFile('/evidence/transfer/dependencies-before.json', 'utf8'));
  assert.ok(transferred.every(r => !['node_modules/.vite-temp', 'node_modules/.vite'].some(cache => r.path === cache || r.path.startsWith(cache + '/'))));
  assert.deepEqual(await inventoryTree(source, 'node_modules', [], true), transferred, 'Final-root dependency transfer differs.');
  for (const cache of ['.vite-temp', '.vite']) {
    const path = `${source}/node_modules/${cache}`;
    assert.ok(mounts.some(fields => fields[4] === path && fields[5].split(',').includes('rw')), 'Exact cache overlay missing.');
    assert.deepEqual(await readdir(path), [], 'Build cache must start empty.');
  }
  try {
  await mkdir(`${output}/tmp`); await mkdir(`${output}/cache`); await mkdir(`${output}/logs`);
  for (const name of ['user', 'global']) await writeFile(`${output}/npm-${name}.conf`, '', { flag: 'wx' });
  const env = { HOME: '/nonexistent-home', PATH: '/runtime/bin:/usr/bin', TMPDIR: `${output}/tmp`, TMP: `${output}/tmp`, TEMP: `${output}/tmp`, NODE_DISABLE_COMPILE_CACHE: '1', DO_NOT_TRACK: '1', WRANGLER_SEND_METRICS: 'false', NPM_CONFIG_CACHE: `${output}/cache`, NPM_CONFIG_LOGS_DIR: `${output}/logs`, NPM_CONFIG_USERCONFIG: `${output}/npm-user.conf`, NPM_CONFIG_GLOBALCONFIG: `${output}/npm-global.conf`, NPM_CONFIG_OFFLINE: 'true', NPM_CONFIG_IGNORE_SCRIPTS: 'true', NPM_CONFIG_AUDIT: 'false', NPM_CONFIG_FUND: 'false', NPM_CONFIG_UPDATE_NOTIFIER: 'false' };
  const npm = spawnSync(process.execPath, ['/runtime/lib/node_modules/npm/bin/npm-cli.js', '--offline', '--ignore-scripts', 'ls', '--all', '--parseable'], { cwd: source, env, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
  await writeFile(`${output}/npm-ls.log`, `${npm.stdout ?? ''}\n${npm.stderr ?? ''}`, { flag: 'wx' });
  await save('npm-ls.json', { status: npm.status, signal: npm.signal, error: npm.error?.message ?? null });
  if (npm.error) throw npm.error; assert.equal(npm.status, 0);
  const resolutions = [], packageRoots = await verifyDependencyLocations(source, npm.stdout, resolutions);
  const compilerEntry = await verifyDependencyEntry(source, `${source}/package.json`, './node_modules/vinext/dist/cli.js');
  assert.equal(sha256(await readFile(await realPath(`${source}/node_modules/vinext/dist/typegen.js`))), '47f1dbeb0c0b16f88c6c7428495a51f2623bf3bb0d66f3a2d9bd8789d2f3ff92');
  await save('dependency-resolution.json', { helperFullyAccepted: true, helperExitCode: 0, npmLsExitCode: 0, rawRelativeLinks: transferred.filter(r => r.link), compilerEntry, packageRoots, resolutions });
  const { probeNativeDependencies } = await import('./local-release-native-probes.mjs');
  await probeNativeDependencies(source, `${output}/native`, env, config.inputs);
  await verifyInputs(source, config.inputs);
  // The existing runner independently repeats every source/dependency/typegen/build/archive/extract/smoke gate.
  const run = spawnSync(process.execPath, ['/project/scripts/build-local-release-candidate.mjs', `${owner}/source.json`, config.sourceSha256, source, config.release], { cwd: '/project', env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  await writeFile(`${output}/runner.log`, `${run.stdout ?? ''}\n${run.stderr ?? ''}`, { flag: 'wx' });
  await save('runner-exit.json', { status: run.status, signal: run.signal, error: run.error?.message ?? null });
  if (run.error) throw run.error; assert.equal(run.status, 0, 'Unchanged runner failed.');
  await verifyInputs(source, config.inputs);
  await save('result.json', { commit: null, finalRootDependencyAccepted: true, finalRootNativeAccepted: true, unchangedRunnerExitCode: 0, deploymentAuthorized: false });
  } finally {
    // Preserve generated cache evidence and recheck every original dependency even on build/native failure.
    for (const cache of ['.vite-temp', '.vite']) await save(`cache-${cache.slice(1)}.json`, await inventoryTree(source, `node_modules/${cache}`));
    await verifyInputs(source, config.inputs);
    assert.deepEqual(await inventoryTree(source, 'node_modules', [], true), transferred, 'Read-only original dependency inventory changed.');
    await save('dependency-preservation.json', { originalInventorySha256: sha256(JSON.stringify(transferred)), unchanged: true, cacheOverlays: ['node_modules/.vite-temp', 'node_modules/.vite'] });
  }
}
