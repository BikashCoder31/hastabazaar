// Host-only admission and finite bubblewrap assembly. No package code is imported here.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { linkSync } from 'node:fs';
import { open, lstat, mkdir, readFile, readdir, readlink, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureLocalSource, inventoryDerivedBrand, materializeLocalSource, ownedEvidencePath, realPath, requireLocalLinux, verifyLocalSource } from './local-release-source.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const saveExclusive = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const contained = (root, path) => { const child = relative(root, path); return !isAbsolute(child) && child !== '..' && !child.startsWith('../'); };
export async function inventoryTree(root, prefix = 'node_modules', records = [], cacheOverlays = false, io = { lstat, readdir, readFile, readlink, realpath }) {
  const directory = await io.lstat(join(root, prefix));
  assert.ok(directory.isDirectory() && !directory.isSymbolicLink(), 'Inventory root must be a real directory.');
  records.push({ path: prefix, directory: true, mode: directory.mode & 0o7777 });
  for (const entry of (await io.readdir(join(root, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${prefix}/${entry.name}`, full = join(root, path), stat = await io.lstat(full);
    if (cacheOverlays && ['node_modules/.vite-temp', 'node_modules/.vite'].includes(path)) {
      assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Cache overlay must be a real directory.');
      continue; // Only newly admitted empty mountpoints, never preexisting dependency entries.
    }
    if (stat.isSymbolicLink()) {
      const target = await io.readlink(full);
      assert.ok(!isAbsolute(target) && contained(root, resolve(dirname(full), target)), `Absolute/escaping raw link: ${path}`);
      assert.ok(contained(root, await io.realpath(full)), `Resolved link escape: ${path}`);
      records.push({ path, link: target, mode: stat.mode & 0o7777 });
    } else if (stat.isDirectory()) { await inventoryTree(root, path, records, cacheOverlays, io); }
    else { assert.ok(stat.isFile(), 'Special dependency file refused.'); const bytes = await io.readFile(full); records.push({ path, bytes: bytes.length, mode: stat.mode & 0o7777, sha256: sha256(bytes) }); }
  }
  return records;
}

export function safeRelative(path, { dependencyPin = false } = {}) {
  assert.ok(typeof path === 'string' && path && !Array.from(path).some(c => c === '\\' || c === ':' || c.charCodeAt(0) <= 31 || c.charCodeAt(0) === 127) && path.split('/').every(x => x && x !== '.' && x !== '..'), 'Invalid relative mount/input path.');
  assert.ok(!/(^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|\.npmrc|\.netrc|\.git|\.ssh|\.aws|\.staging|uploads|private-media)(\/|$)/i.test(path), 'Private mount/input path.');
  assert.ok(dependencyPin || !/(^|\/)node_modules(\/|$)/.test(path), 'Dependency canonical mount forbidden.');
  return path;
}
export function validateInputRecords(records) {
  assert.ok(Array.isArray(records) && records.length === 13, 'Exactly thirteen acquisition inputs required.');
  const seen = new Set();
  for (const r of records) {
    safeRelative(r.path);
    assert.ok(['package.json', 'package-lock.json'].includes(r.path) || r.path.startsWith('vendor/'), 'Unexpected acquisition input.');
    assert.ok(!seen.has(r.path), 'Duplicate acquisition input.'); seen.add(r.path);
    assert.ok(Number.isSafeInteger(r.size) && r.size >= 0 && /^[a-f0-9]{64}$/.test(r.sha256));
  }
  assert.ok(seen.has('package.json') && seen.has('package-lock.json'));
}
export async function verifyInputs(root, records) {
  validateInputRecords(records);
  for (const r of records) {
    const bytes = await readFile(await realPath(join(root, r.path)));
    assert.equal(bytes.length, r.size); assert.equal(sha256(bytes), r.sha256, `Changed acquisition input: ${r.path}`);
  }
}
export async function preserveAround(capture, work) {
  const before = await capture('before');
  let result, failure;
  try { result = await work(); } catch (error) { failure = error; }
  try { assert.deepEqual(await capture('after'), before, 'Actual host preservation failed.'); }
  catch (error) { if (failure) throw new AggregateError([failure, error], 'Worker and host preservation failed.'); throw error; }
  if (failure) throw failure;
  return result;
}
// Call only after preserveAround has completed host after-checks.
export async function acceptCandidate(ownerPath, evidence, sourceSha256, cancellation, {
  readInventory = path => readFile(path, 'utf8'), stage = saveExclusive,
} = {}) {
  const checkCancellation = () => assert.equal(cancellation(), null, 'Host namespace run cancelled.');
  checkCancellation();
  const inventoryPath = await realPath(join(ownerPath, 'candidate/inventory.json'));
  const inventory = JSON.parse(await readInventory(inventoryPath));
  assert.equal(inventory.commit, null); assert.equal(inventory.sourceSha256, sourceSha256); assert.equal(inventory.linuxRuntimeVerified, true); assert.equal(inventory.deploymentAuthorized, false);
  checkCancellation();
  const pending = join(evidence, 'acceptance-pending.json');
  await stage(pending, { kind: 'host-preserved-local-linux-candidate', commit: null, sourceSha256, inventory: `${ownerPath}/candidate/inventory.json`, archiveSha256: inventory.archiveSha256, hostPreserved: true, deploymentAuthorized: false });
  checkCancellation();
  // Atomic completion boundary: exclusive synchronous hard-link publication, with
  // no await between the final observed-cancellation check and completion. Signal
  // callbacks cannot interleave here. Pending evidence alone is never acceptance.
  // A signal delivered after this boundary is a post-completion signal.
  linkSync(pending, join(evidence, 'accepted.json'));
}

export function makeNamespaceArguments(o, phase = 'build') {
  assert.ok(['transfer', 'build'].includes(phase));
  assert.match(o.owner, /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
  const owner = `/project/.test-artifacts/t35/${o.owner}`, hostOwner = `${o.canonical}/.test-artifacts/t35/${o.owner}`;
  const seen = new Set();
  for (const file of [...o.snapshot.files, o.snapshot.schema]) {
    safeRelative(file.path); assert.ok(!seen.has(file.path), 'Duplicate canonical mount.'); seen.add(file.path);
    assert.ok(!file.path.startsWith(`.test-artifacts/t35/${o.owner}/`), 'Canonical schema/output overlap.');
  }
  const args = ['--unshare-all', '--unshare-user', '--disable-userns', '--cap-drop', 'ALL', '--die-with-parent', '--new-session', '--clearenv', '--json-status-fd', '3',
    '--ro-bind', '/usr/lib/x86_64-linux-gnu', '/usr/lib/x86_64-linux-gnu', '--ro-bind', '/usr/lib64', '/usr/lib64', '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64',
    '--ro-bind', o.runtime, '/runtime', '--ro-bind', o.skeleton, '/project'];
  for (const file of [...o.snapshot.files, o.snapshot.schema, ...o.brands.filter(x => !x.absent)]) {
    safeRelative(file.path);
    args.push('--ro-bind', `${o.canonical}/${file.path}`, `/project/${file.path}`);
  }
  // Explicitly approved writable parent: runner must create a previously absent candidate.
  args.push('--bind', hostOwner, owner, '--ro-bind', `${hostOwner}/source.json`, `${owner}/source.json`, '--bind', `${hostOwner}/source`, `${owner}/source`);
  if (phase === 'transfer') args.push('--ro-bind', o.acquired, '/acquired');
  else {
    args.push('--ro-bind', `${hostOwner}/source/node_modules`, `${owner}/source/node_modules`);
    for (const cache of ['.vite-temp', '.vite']) args.push('--bind', `${o.evidence}/work/cache-${cache.slice(1)}`, `${owner}/source/node_modules/${cache}`);
  }
  // Never expose the backing skeleton/config through a writable evidence alias.
  args.push('--bind', `${o.evidence}/work`, '/evidence', '--ro-bind', `${o.evidence}/worker-config.json`, '/worker-config.json');
  if (phase === 'build') args.push('--ro-bind', `${o.evidence}/work/transfer`, '/evidence/transfer');
  // No host /usr/bin directory is exposed; archive helpers have finite individual binds.
  for (const tool of ['tar', 'gzip', 'sh', 'env']) args.push('--ro-bind', `/usr/bin/${tool}`, `/usr/bin/${tool}`);
  args.push('--symlink', 'usr/bin', '/bin', '--proc', '/proc', '--dev', '/dev', '--size', '67108864', '--tmpfs', '/tmp', '--chdir', `${owner}/source`,
    '--setenv', 'HOME', '/nonexistent-home', '--setenv', 'PATH', '/runtime/bin:/usr/bin', '--setenv', 'TMPDIR', '/tmp', '--setenv', 'NODE_DISABLE_COMPILE_CACHE', '1');
  for (const name of ['user', 'mnt', 'net', 'pid']) args.push('--setenv', `RELEASE_HOST_${name.toUpperCase()}_NS`, o.namespaces[name]);
  args.push('/runtime/bin/node', '/project/scripts/local-release-namespace-worker.mjs', phase);
  return args;
}

async function absent(path) { await assert.rejects(lstat(path), { code: 'ENOENT' }, `Destination must be absent: ${path}`); }
async function regularHash(path, expected) {
  assert.match(expected, /^[a-f0-9]{64}$/);
  assert.ok((await lstat(await realPath(path))).isFile());
  assert.equal(sha256(await readFile(path)), expected, `Reviewed file changed: ${path}`);
}
export async function runOwned(args, evidence, phase, canonical, deadlineSeconds = 3600) {
  assert.ok(Number.isSafeInteger(deadlineSeconds) && deadlineSeconds >= 1 && deadlineSeconds <= 3600, 'Deadline must be an integer from 1 to 3600 seconds.');
  // timeout owns its process group; cancellation is forwarded only to this live direct child.
  const handles = await Promise.all(['stdout.log', 'stderr.log', 'status.jsonl'].map(name => open(join(evidence, `${phase}.${name}`), 'wx')));
  const argv = ['--signal=TERM', '--kill-after=5s', `${deadlineSeconds}s`, '/usr/bin/env', '-i', '/usr/bin/bwrap', ...args];
  let child, completion, cancellation = null;
  const stop = signal => { cancellation = signal; if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); };
  const term = () => stop('SIGTERM'), interrupt = () => stop('SIGINT');
  process.on('SIGTERM', term); process.on('SIGINT', interrupt);
  try {
    child = spawn('/usr/bin/timeout', argv, { cwd: canonical, env: {}, stdio: ['ignore', handles[0].fd, handles[1].fd, handles[2].fd] });
    completion = new Promise((done, reject) => { child.once('error', reject); child.once('exit', (code, signal) => done({ code, signal })); });
    completion.catch(() => {}); // Capture spawn errors immediately; the awaited promise still rejects.
    const identity = { pid: child.pid, parentPid: process.pid, argv: ['/usr/bin/timeout', ...argv], cwd: canonical, deadlineSeconds, killGraceSeconds: 5, cancellation: 'SIGTERM/SIGINT to this host supervisor forwards TERM only to its live directly owned timeout; no process-name or PID-discovery signalling.' };
    if (child.pid) {
      try {
        identity.stat = await readFile(`/proc/${child.pid}/stat`, 'utf8');
        identity.executable = await readlink(`/proc/${child.pid}/exe`);
        identity.bootId = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
        identity.rawArgvHex = (await readFile(`/proc/${child.pid}/cmdline`)).toString('hex');
      } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error; identity.exitedBeforeIdentityCapture = true; }
    }
    await saveExclusive(join(evidence, `${phase}.process.json`), identity);
    const result = { ...await completion, cancellation };
    await saveExclusive(join(evidence, `${phase}.exit.json`), result);
    assert.equal(cancellation, null, 'Cancelled namespace phase.'); assert.equal(result.signal, null); assert.equal(result.code, 0, `Namespace ${phase} failed.`);
    const statuses = (await readFile(join(evidence, `${phase}.status.jsonl`), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.ok(statuses.some(record => record['exit-code'] === 0), 'Missing successful bubblewrap final status.');
  } finally {
    // Errors while capturing identity must not abandon an owned child before host post-checks.
    if (child?.pid && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    if (completion) await completion.catch(() => {});
    process.off('SIGTERM', term); process.off('SIGINT', interrupt);
    await Promise.all(handles.map(handle => handle.close()));
  }
}

export async function runNamespaceRelease(planPath, reviewedPlanSha256) {
  requireLocalLinux();
  const canonical = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
  assert.equal(canonical, '/mnt/c/Users/abinash/Desktop/HastaBazaar', 'Only the authoritative checkout is a host launch target.');
  await realPath(canonical);
  await regularHash(planPath, reviewedPlanSha256);
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  assert.equal(plan.kind, 'reviewed-local-release-namespace-v1');
  assert.equal(plan.commit, null); assert.equal(plan.deploymentAuthorized, false);
  assert.match(plan.release, /^hastabazaar-release-[a-z0-9._-]+$/);
  const snapshotPath = await ownedEvidencePath(canonical, plan.snapshot, 'source.json');
  const ownerPath = dirname(snapshotPath), owner = posix.basename(ownerPath);
  assert.deepEqual((await readdir(ownerPath)).sort(), ['source.json'], 'Final owner must contain only reviewed source.json; source and candidate must be absent.');
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  await verifyLocalSource(canonical, snapshot, plan.sourceSha256);
  assert.match(plan.schemaSha256, /^[a-f0-9]{64}$/);
  assert.equal(snapshot.schema.sha256, plan.schemaSha256, 'Explicitly reviewed schema selection differs.');
  const evidence = await ownedEvidencePath(canonical, plan.evidence, 'namespace');
  assert.notEqual(dirname(evidence), ownerPath); await absent(evidence);
  // All external inputs are explicitly hashed by the reviewed plan. No receipt self-attestation alone admits work.
  assert.ok(Array.isArray(plan.pins) && plan.pins.length >= 10);
  const pins = new Map();
  for (const pin of plan.pins) { safeRelative(pin.path, { dependencyPin: true }); assert.ok(!pins.has(pin.path)); pins.set(pin.path, pin.sha256); await regularHash(join(canonical, pin.path), pin.sha256); }
  for (const key of ['target', 'auditResult', 'auditExit', 'auditStatus', 'nativeResult', 'nativeExit', 'nativeStatus']) assert.ok(pins.has(plan[key]), `Missing reviewed receipt pin: ${key}`);
  const audit = JSON.parse(await readFile(join(canonical, plan.auditResult), 'utf8'));
  await regularHash(join(canonical, 'scripts/local-release-source.mjs'), '61a88bea37fe926ff5d68a77a168f6a5d909421f4f1696474c64c4903f55dbbc');
  await regularHash(join(canonical, 'scripts/build-local-release-candidate.mjs'), 'f60f04c705ea0dfac3ab589ed91ec355574f2f69d802b884d33ba98a5666fc03');
  assert.equal(audit.helperSha256, '61a88bea37fe926ff5d68a77a168f6a5d909421f4f1696474c64c4903f55dbbc');
  assert.equal(audit.helperFullyAccepted, true); assert.equal(audit.helperExitCode, 0); assert.equal(audit.npmLsExitCode, 0); assert.equal(audit.inputsUnchanged, true);
  assert.equal(audit.absoluteOrEscapingRawLinks, 0); assert.equal(audit.checkedInputRecords, 13);
  assert.equal((await readFile(join(canonical, plan.auditExit), 'utf8')).trim(), '0');
  assert.ok((await readFile(join(canonical, plan.auditStatus), 'utf8')).trim().split('\n').map(JSON.parse).some(r => r['exit-code'] === 0));
  const native = JSON.parse(await readFile(join(canonical, plan.nativeResult), 'utf8'));
  assert.equal(native.error, null); assert.equal(native.inputsUnchanged, true); assert.equal(native.probeCount, 14); assert.equal(native.binaryFiles.length, 6);
  assert.equal(native.commands.length, 14); assert.ok(native.commands.every(command => command.exitCode === 0 && command.signal === null && command.error === null));
  assert.equal((await readFile(join(canonical, plan.nativeExit), 'utf8')).trim(), '0');
  assert.ok((await readFile(join(canonical, plan.nativeStatus), 'utf8')).trim().split('\n').map(JSON.parse).some(r => r['exit-code'] === 0));
  const target = JSON.parse(await readFile(join(canonical, plan.target), 'utf8'));
  validateInputRecords(target.inputs);
  for (const key of ['acquired', 'runtime']) {
    safeRelative(plan[key]); assert.ok(plan[key].startsWith('.test-artifacts/t35/')); await realPath(join(canonical, plan[key]));
  }
  for (const file of ['bin/node', 'lib/node_modules/npm/bin/npm-cli.js', 'lib/node_modules/npm/package.json']) assert.ok(pins.has(`${plan.runtime}/${file}`), `Missing runtime pin: ${file}`);
  assert.equal(process.version, 'v22.23.2');
  assert.equal(process.execPath, join(canonical, plan.runtime, 'bin/node'), 'Host must use the reviewed acquired runtime.');
  await verifyInputs(canonical, target.inputs); await verifyInputs(join(canonical, plan.acquired), target.inputs);
  const brands = await inventoryDerivedBrand(canonical);
  await mkdir(evidence);
  await mkdir(join(evidence, 'work'));
  for (const cache of ['vite-temp', 'vite']) await mkdir(join(evidence, 'work', `cache-${cache}`));
  const capture = async phase => {
    // Capture actual host canonical bytes, including new/deleted source files, even after worker failure.
    try {
      const current = await captureLocalSource(canonical, snapshot.schema.path);
      const brand = await inventoryDerivedBrand(canonical);
      const actualPins = [];
      for (const pin of plan.pins) actualPins.push({ path: pin.path, sha256: sha256(await readFile(await realPath(join(canonical, pin.path)))) });
      const receipt = { sourceSha256: current.sourceSha256, source: current, brands: brand, pins: actualPins, snapshotSha256: sha256(await readFile(await realPath(snapshotPath))) };
      await saveExclusive(join(evidence, `host-${phase}.json`), receipt);
      if (phase === 'before') { assert.equal(current.sourceSha256, plan.sourceSha256); assert.deepEqual(actualPins, plan.pins); }
      else {
        for (const cache of ['.vite-temp', '.vite']) {
          const path = join(ownerPath, 'source/node_modules', cache);
          try { await realPath(path); assert.deepEqual(await readdir(path), [], 'Underlying cache mountpoint must remain empty.'); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
      }
      return receipt;
    } catch (error) { await saveExclusive(join(evidence, `host-${phase}-failure.json`), { error: String(error.stack ?? error) }); throw error; }
  };
  let interrupted = null;
  const requestStop = signal => { interrupted = signal; };
  const stopTerm = () => requestStop('SIGTERM'), stopInt = () => requestStop('SIGINT');
  process.on('SIGTERM', stopTerm); process.on('SIGINT', stopInt);
  try {
    await preserveAround(capture, async () => {
      await materializeLocalSource(canonical, snapshot, plan.sourceSha256, join(ownerPath, 'source'));
      assert.equal(interrupted, null, 'Host preparation cancelled.');
      const skeleton = join(evidence, 'skeleton'); await mkdir(skeleton);
      for (const file of [...snapshot.files, snapshot.schema, ...brands.filter(x => !x.absent)]) {
        safeRelative(file.path); const path = join(skeleton, file.path); await mkdir(dirname(path), { recursive: true }); await writeFile(path, '', { flag: 'wx' });
      }
      await mkdir(join(skeleton, '.test-artifacts/t35', owner), { recursive: true });
      const namespaces = Object.fromEntries(await Promise.all(['user', 'mnt', 'net', 'pid'].map(async name => [name, await readlink(`/proc/self/ns/${name}`)])));
      const config = { kind: 'namespace-aliases-not-checkout', commit: null, canonicalHostPath: canonical, owner, sourceSha256: plan.sourceSha256, release: plan.release, inputs: target.inputs, snapshot, brands, deploymentAuthorized: false };
      await saveExclusive(join(evidence, 'worker-config.json'), config);
      const o = { canonical, owner, evidence, skeleton, snapshot, brands, namespaces, acquired: join(canonical, plan.acquired), runtime: join(canonical, plan.runtime), sourceSha256: plan.sourceSha256, release: plan.release };
      for (const phase of ['transfer', 'build']) {
        assert.equal(interrupted, null, 'Host namespace run cancelled.');
        const args = makeNamespaceArguments(o, phase); await saveExclusive(join(evidence, `${phase}.argv.json`), args);
        await runOwned(args, evidence, phase, canonical);
        assert.deepEqual((await readdir(ownerPath)).sort(), phase === 'transfer' ? ['source', 'source.json'] : ['candidate', 'source', 'source.json'], 'Unexpected output-parent sibling.');
        for (const path of [ownerPath, snapshotPath, join(ownerPath, 'source')]) await realPath(path);
      }
    });
    await acceptCandidate(ownerPath, evidence, plan.sourceSha256, () => interrupted);
  } catch (error) {
    await saveExclusive(join(evidence, 'failure.json'), { error: String(error.stack ?? error), accepted: false, deploymentAuthorized: false }); throw error;
  } finally {
    process.off('SIGTERM', stopTerm); process.off('SIGINT', stopInt);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 4, 'Expected reviewed plan path and separately reviewed SHA256.');
  await runNamespaceRelease(resolve(process.argv[2]), process.argv[3]);
}
