import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import { stagingNativeFixture } from '../../tests/helpers/staging-native-fixture.ts';
import { assertRequiredNativeResults } from '../recovery/native-test-results.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const execAsync = promisify(execFile);

// Cleanup authorization is independent of the DB fixture marker. Never stop by
// name: a name may have been reused. This contract binds the exact returned ID
// and a per-run random label to the original local daemon and container shape.
export function attestCleanup(context, container, owner) {
  assert.equal(context.Endpoints.docker.Host, owner.endpoint);
  assert.match(owner.endpoint, /^(npipe|unix):\/\//);
  assert.match(owner.id, /^[a-f0-9]{64}$/);
  assert.equal(container.Id, owner.id);
  assert.equal(container.Name, '/' + owner.name);
  assert.equal(container.Config.Image, 'mariadb:10.11');
  assert.equal(container.Config.Labels['codex.scope'], 'staging-native-compatibility');
  assert.equal(container.Config.Labels['codex.native-owner'], owner.token);
  assert.deepEqual(container.HostConfig.PortBindings['3306/tcp'], [{ HostIp: '127.0.0.1', HostPort: '13329' }]);
  assert.equal(container.Mounts.some(m => m.Type === 'bind'), false);
}

/** @param {{ signals?: Pick<import('node:events').EventEmitter, 'on' | 'off'>, requested: () => Promise<boolean> }} options */
export function cooperativeCancellation({ signals = process, requested }) {
  let reason;
  const interrupt = () => { reason ??= 'SIGINT'; };
  const terminate = () => { reason ??= 'SIGTERM'; };
  signals.on('SIGINT', interrupt); signals.on('SIGTERM', terminate);
  return {
    async checkpoint() {
      if (!reason && await requested()) reason = 'STOP file';
      if (reason) throw new Error('Native run cancelled: ' + reason);
    },
    dispose() { signals.off('SIGINT', interrupt); signals.off('SIGTERM', terminate); },
  };
}

// Formatting untrusted thrown values must never interrupt cleanup or receipt writing.
/** @param {unknown} value */
function failureText(value) {
  try { return String(value); }
  catch { return '[Unserializable failure]'; }
}

export async function ownedLifecycle({ start, persist, work, close, attest, stop, receipt }) {
  let id, failure; const cleanupErrors = []; let stopped = false;
  try { id = await start(); await persist(id); await work(); }
  catch (error) { failure = error; }
  finally {
    try { await close(); } catch (error) { cleanupErrors.push(failureText(error)); }
    if (id) {
      try { await attest(id); await stop(id); stopped = true; }
      catch (error) { cleanupErrors.push(failureText(error)); }
    }
    // Receipt failure must not prevent cleanup, or hide the primary error.
    try { await receipt({ id, stopped, failure: failure ? failureText(failure) : null, cleanupErrors }); }
    catch (error) { cleanupErrors.push('receipt: ' + failureText(error)); }
  }
  if (failure || cleanupErrors.length) throw new Error([failure ? failureText(failure) : '', ...cleanupErrors].filter(Boolean).join('\n'));
}
export const currentNativePlan = Object.freeze([
  { file: 'tests/customer-fee-native.test.ts', expected: 29 },
  ...['catchup', 'rollback', 'repair'].map(scenario => ({ file: 'tests/form-health-maria-native.test.ts', expected: 1, scenario })),
]);
export async function reviewedSchema(path, hash) {
  assert.match(hash ?? '', /^[a-f0-9]{64}$/, 'Explicit reviewed SHA256 required');
  const absolute = await realpath(resolve(project, path));
  assert.ok(absolute.startsWith((await realpath(project)) + sep), 'Schema must be inside canonical project');
  const bytes = await readFile(absolute);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, 'Reviewed schema bytes changed');
  return bytes.toString('utf8');
}
export function sqlStatements(sql) {
  let delimiter = ';', buffer = '';
  const statements = [];
  const commentsOnly = value => !value.trim() || value.trim().split('\n').every(line => !line.trim() || line.trim().startsWith('--'));
  for (const line of sql.split(/\r?\n/)) {
    const directive = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
    if (directive) { assert.ok(commentsOnly(buffer)); buffer = ''; delimiter = directive[1]; continue; }
    buffer += line + '\n';
    if (buffer.trimEnd().endsWith(delimiter)) { statements.push(buffer.trimEnd().slice(0, -delimiter.length)); buffer = ''; }
  }
  assert.ok(commentsOnly(buffer), 'Incomplete SQL statement');
  return statements.filter(statement => statement.trim());
}
export function safeEnvironment(source) {
  const env = {};
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'WINDIR', 'LANG', 'LC_ALL']) if (source[key]) env[key] = source[key];
  return { ...env, NODE_ENV: 'development', HASTABAZAAR_RUNTIME_ENV: 'local_staging', HASTABAZAAR_MAIL_MODE: 'capture', HASTABAZAAR_PAYMENT_MODE: 'simulated', HASTABAZAAR_RECIPIENT_DOMAIN: 'local.hastabazaar.test' };
}

async function main() {
  assert.equal(resolve(process.cwd()), project);
  assert.equal(process.argv.length, 4, 'Usage: node --import tsx scripts/testing/verify-current-native.mjs REVIEWED_SCHEMA SHA256');
  const [schemaPath, schemaHash] = process.argv.slice(2);
  const schema = await reviewedSchema(schemaPath, schemaHash);
  const statements = sqlStatements(schema);
  const docker = process.platform === 'win32' ? 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' : 'docker';
  // Refuse remote overrides before any daemon command. The unchanged fixture
  // independently verifies the context and full container ownership each time.
  assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT && !process.env.DOCKER_TLS_VERIFY && !process.env.DOCKER_CERT_PATH, 'Docker overrides are not accepted');
  const context = JSON.parse(execFileSync(docker, ['context', 'inspect'], { encoding: 'utf8' }))[0];
  assert.match(context.Endpoints.docker.Host, /^(npipe|unix):\/\//);
  execFileSync(docker, ['info', '--format', '{{.ServerVersion}}'], { stdio: 'pipe' });
  const run = Date.now().toString();
  const artifact = resolve(project, '.test-artifacts/t34/current-native-' + run);
  const workspace = resolve(project, '.superpowers/sdd/2026-10-16-staging-native-compatibility');
  await mkdir(artifact); await mkdir(resolve(artifact, 'tmp')); await mkdir(resolve(artifact, 'media'));
  await mkdir(workspace, { recursive: true });
  const name = 'hastabazaar-native-' + run, database = 'native_' + run + '_fresh';
  const password = randomBytes(32).toString('hex'), token = randomBytes(24).toString('hex'), securityKey = randomBytes(32).toString('base64url');
  const envFile = resolve(artifact, '.container-env'), marker = resolve(workspace, '.native-' + run + '.json');
  await writeFile(envFile, 'MARIADB_ROOT_PASSWORD=' + password + '\nMARIADB_ROOT_HOST=%\n', { flag: 'wx', mode: 0o600 });
  const env = { ...safeEnvironment(process.env), TEMP: resolve(artifact, 'tmp'), TMP: resolve(artifact, 'tmp'), TMPDIR: resolve(artifact, 'tmp'), MEDIA_ROOT: resolve(artifact, 'media'), HATSKALA_STAGING_NATIVE: '1', HATSKALA_NATIVE_MARKER: marker, HATSKALA_NATIVE_TOKEN: token, HASTABAZAAR_NATIVE_SECURITY_KEY: securityKey, DB_HOST: '127.0.0.1', DB_PORT: '13329', DB_USER: 'root', DB_PASSWORD: password, DB_NAME: database };
  let connection;
  const results = [];
  const redact = value => String(value).replaceAll(password, '[redacted]').replaceAll(token, '[redacted]').replaceAll(securityKey, '[redacted]');
  const owned = async () => {
    Object.assign(process.env, env);
    return stagingNativeFixture();
  };
  const owner = { name, token, endpoint: context.Endpoints.docker.Host };
  const cancel = cooperativeCancellation({ requested: async () => existsSync(resolve(artifact, 'STOP')) });
  const query = async sql => { await cancel.checkpoint(); return connection.query({ sql, timeout: 30000 }); };
  console.log('Cooperative stop: create ' + resolve(artifact, 'STOP'));
  const dockerRead = args => JSON.parse(execFileSync(docker, args, { encoding: 'utf8', timeout: 30000 }))[0];
  try { await ownedLifecycle({
    start: async () => {
      await cancel.checkpoint();
      // Durable intent exists before acquisition; contains no DB credentials.
      await writeFile(resolve(artifact, 'ownership.json'), JSON.stringify(owner), { flag: 'wx', mode: 0o600 });
      const id = execFileSync(docker, ['run', '-d', '--pull=never', '--name', name, '--label', 'codex.scope=staging-native-compatibility', '--label', 'codex.native-owner=' + token, '-p', '127.0.0.1:13329:3306', '--env-file', envFile, 'mariadb:10.11'], { encoding: 'utf8', timeout: 30000 }).trim();
      return id;
    },
    persist: async id => {
      assert.match(id, /^[a-f0-9]{64}$/);
      attestCleanup(dockerRead(['context', 'inspect']), dockerRead(['inspect', id]), { ...owner, id });
      await writeFile(marker, JSON.stringify({ id, name, database, password, token, host: '127.0.0.1', port: 13329 }), { flag: 'wx', mode: 0o600 });
    },
    work: async () => {
    await cancel.checkpoint();
    await owned();
    for (let attempt = 0; attempt < 60; attempt++) {
      await cancel.checkpoint();
      try { connection = await mysql.createConnection({ host: env.DB_HOST, port: 13329, user: 'root', password, connectTimeout: 5000 }); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
    }
    assert.ok(connection, 'Owned MariaDB did not become ready');
    assert.match((await query('SELECT VERSION() v'))[0][0].v, /^10\.11\./);
    for (const [index, target] of currentNativePlan.entries()) {
      await cancel.checkpoint();
      await owned(); await reviewedSchema(schemaPath, schemaHash);
      await query('USE information_schema');
      if (index) await query('DROP DATABASE `' + database + '`');
      await query('CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
      await query('USE `' + database + '`');
      for (const sql of statements) await query(sql);
      let output;
      try {
        ({ stdout: output } = await execAsync(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap', '--test-concurrency=1', target.file], { cwd: project, env: { ...env, HASTABAZAAR_NATIVE_HEALTH_SCENARIO: target.scenario ?? '' }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 300000 }));
      } catch (error) {
        await writeFile(resolve(artifact, index + '.tap'), redact(String(error.stdout ?? '') + '\n' + String(error.stderr ?? '')), { flag: 'wx' });
        throw new Error('Required native child failed: ' + target.file + ' ' + (target.scenario ?? ''));
      }
      await writeFile(resolve(artifact, index + '.tap'), redact(output), { flag: 'wx' });
      await cancel.checkpoint();
      const counts = assertRequiredNativeResults(output, target.expected);
      results.push({ ...target, ...counts });
      console.log(JSON.stringify(results.at(-1)));
    }
    await reviewedSchema(schemaPath, schemaHash);
    },
    close: async () => { connection?.destroy(); },
    attest: async id => attestCleanup(dockerRead(['context', 'inspect']), dockerRead(['inspect', id]), { ...owner, id }),
    stop: async id => { execFileSync(docker, ['stop', id], { stdio: 'pipe', timeout: 30000 }); },
    receipt: async outcome => {
      const receipt = redact(JSON.stringify({ schemaPath, schemaHash, container: name, results, ...outcome, databasesPreserved: true }, null, 2));
      // Console fallback survives a filesystem receipt error.
      console.log(receipt);
      await writeFile(resolve(artifact, 'results.json'), receipt, { flag: 'wx' });
    },
  }); } finally { cancel.dispose(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
