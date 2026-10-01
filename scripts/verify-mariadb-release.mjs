import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { inspectReadiness } from '../lib/operations/readiness.ts';

// Dedicated local release fixture only; no arbitrary credentials or remote target.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assert.equal(resolve(process.cwd()), project);
assert.equal(process.argv.length, 2);
const evidence = resolve(project, '.superpowers/sdd/2026-09-30-local-audit-remediation-roadmap');
const privateState = JSON.parse(await readFile(resolve(evidence, '.env.mariadb-release-private.json'), 'utf8'));
assert.equal(privateState.host, '127.0.0.1');
assert.equal(privateState.port, 13328);
assert.equal(privateState.name, 'hastabazaar-release-readiness-20261001');
const context = JSON.parse(execFileSync('docker', ['context', 'inspect'], { encoding: 'utf8' }))[0];
assert.match(context.Endpoints.docker.Host, /^(npipe|unix):\/\//);
const container = JSON.parse(execFileSync('docker', ['inspect', privateState.name], { encoding: 'utf8' }))[0];
assert.equal(container.Id, privateState.id);
assert.equal(container.State.Running, true);
assert.equal(container.Config.Image, 'mariadb:10.11');
assert.equal(container.Config.Labels['codex.scope'], 'mariadb-release-readiness');
assert.deepEqual(container.HostConfig.PortBindings['3306/tcp'], [{HostIp: '127.0.0.1', HostPort: '13328'}]);
const connection = await mysql.createConnection({host: privateState.host, port: privateState.port, user: privateState.user, password: privateState.password});
const manifest = JSON.parse(await readFile(resolve(project, 'deployment/babal/release-manifest.json'), 'utf8'));
const prefix = 'release_' + Date.now();
const observations = [], fixtures = [], hashes = {};
let activeFile, activeStatement;

function sqlStatements(sql) {
  let delimiter = ';', buffer = '';
  const result = [];
  for (const line of sql.split(/\r?\n/)) {
    const directive = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
    if (directive) {
      assert.ok(!buffer.trim() || buffer.trim().split('\n').every(l => !l.trim() || l.trim().startsWith('--')));
      delimiter = directive[1]; continue;
    }
    buffer += line + '\n';
    if (buffer.trimEnd().endsWith(delimiter)) {result.push(buffer.trimEnd().slice(0, -delimiter.length)); buffer = '';}
  }
  assert.ok(!buffer.trim() || buffer.trim().split('\n').every(l => !l.trim() || l.trim().startsWith('--')));
  return result.filter(s => s.trim());
}
async function load(path, override) {
  activeFile = path;
  const sql = override ?? await readFile(resolve(project, path), 'utf8');
  hashes[path] = createHash('sha256').update(sql).digest('hex');
  for (const statement of sqlStatements(sql)) {
    activeStatement = statement.replace(/^\s*--[^\n]*(\n|$)/gm, '').trim().slice(0, 150);
    await connection.query(statement);
  }
}
async function create(label) {
  const database = prefix + '_' + label;
  assert.match(database, /^release_\d+_[a-z]+$/);
  // Exercise host defaults rather than silently converting the fixture to match tables.
  await connection.query('CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci');
  fixtures.push(database); await connection.query('USE `' + database + '`');
  await connection.query('SET FOREIGN_KEY_CHECKS=1');
  return database;
}
async function check(label, run) {
  try {await run(); observations.push({label, status: 'PASS'});}
  catch (error) {
    observations.push({label, status: 'FAIL', file: activeFile, statement: activeStatement, code: error.code ?? error.name,
      message: String(error.message).replaceAll(privateState.password, '[redacted]').slice(0, 600)});
  }
  console.log(JSON.stringify(observations.at(-1)));
}
const adapter = {dialect: 'mariadb', prepare(sql) {return {async all() {const [results] = await connection.query(sql); return {results};}};}};
let engine;
try {
  engine = (await connection.query('SELECT VERSION() version,@@sql_mode sqlMode'))[0][0];
  assert.match(engine.version, /^10\.11\./);
  await check('canonical generator reproduces checked-in bootstrap and empty recovery', async () => {
    const generationRoot = resolve(evidence, prefix + '_generator');
    for (const directory of ['scripts', 'drizzle/meta', 'deployment/babal']) await mkdir(resolve(generationRoot, directory), {recursive: true});
    await copyFile(resolve(project, 'scripts/generate-mariadb-schema.mjs'), resolve(generationRoot, 'scripts/generate-mariadb-schema.mjs'));
    await copyFile(resolve(project, 'drizzle/meta/0020_snapshot.json'), resolve(generationRoot, 'drizzle/meta/0020_snapshot.json'));
    for (const name of await readdir(resolve(project, 'deployment/babal'))) if (name.endsWith('.sql')) await copyFile(resolve(project, 'deployment/babal', name), resolve(generationRoot, 'deployment/babal', name));
    execFileSync(process.execPath, [resolve(generationRoot, 'scripts/generate-mariadb-schema.mjs')], {cwd: generationRoot, stdio: 'pipe'});
    for (const name of ['mariadb-schema.sql', 'mariadb-reset-empty-import.sql']) assert.equal(await readFile(resolve(generationRoot, 'deployment/babal', name), 'utf8'), await readFile(resolve(project, 'deployment/babal', name), 'utf8'));
  });
  const freshDatabase = await create('fresh');
  await check('unmodified generated bootstrap imports', async () => {
    await load('deployment/babal/mariadb-schema.sql');
    assert.equal((await connection.query('SELECT @@foreign_key_checks value'))[0][0].value, 1);
  });
  for (const companion of ['mariadb-managed-commerce.sql', 'mariadb-product-story-materials.sql', 'mariadb-checkout-recipient-snapshots.sql', 'mariadb-rider-open-box-finance.sql']) {
    await check('bootstrap overlap: ' + companion, async () => {await load('deployment/babal/' + companion);});
  }
  await check('complete actual fresh release sequence imports', async () => {
    for (const migration of manifest.migrations.filter(m => m.usage === 'additive-maintenance')) await load(migration.path);
    assert.deepEqual(await inspectReadiness(adapter), {ready: true, missing: []});
  });
  await check('actual repository/runtime contracts on fresh release', async () => {
    execFileSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', 'tests/mariadb-release-runtime.test.ts', 'tests/native-commerce-remediation.test.ts', 'tests/native-identity-remediation.test.ts'], {
      cwd: project, stdio: 'inherit', env: {...process.env, HATSKALA_MARIADB_RELEASE: '1', HATSKALA_NATIVE_COMMERCE: '1', HATSKALA_NATIVE_IDENTITY: '1', HASTABAZAAR_RUNTIME_ENV: 'local_staging',
        DB_HOST: '127.0.0.1', DB_PORT: '13328', DB_NAME: freshDatabase, DB_USER: 'root', DB_PASSWORD: privateState.password},
    });
  });
  await create('recovery');
  await check('canonical empty-only recovery imports on separately allocated fixture', async () => {
    await load('deployment/babal/mariadb-reset-empty-import.sql');
    assert.equal((await connection.query('SELECT @@foreign_key_checks value'))[0][0].value, 1);
  });
  await create('legacy');
  await check('equivalent frozen legacy base plus actual release upgrades', async () => {
    const schema = await readFile(resolve(project, 'deployment/babal/mariadb-schema.sql'), 'utf8');
    const marker = '-- Versioned business configuration.';
    assert.equal(schema.split(marker).length, 2);
    const base = schema.slice(0, schema.indexOf(marker));
    await load('frozen-0020-base', base);
    const snapshot = JSON.parse(await readFile(resolve(project, 'drizzle/meta/0020_snapshot.json'), 'utf8'));
    const baseTables = new Set([...Object.keys(snapshot.tables), 'user_credentials', 'user_sessions']);
    for (const statement of sqlStatements(schema)) {
      const create = /CREATE TABLE IF NOT EXISTS `([^`]+)`/.exec(statement);
      const fk = /ALTER TABLE `([^`]+)` ADD CONSTRAINT `[^`]+` FOREIGN KEY/.exec(statement);
      if ((create && ['user_credentials', 'user_sessions', 'hastabazaar_schema_versions'].includes(create[1])) || (fk && baseTables.has(fk[1]))) await connection.query(statement);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS=1');
    const additive = manifest.migrations.filter(m => m.usage === 'additive-maintenance');
    const historicalEnd = additive.findIndex(m => m.path.endsWith('mariadb-verified-riders.sql'));
    assert.ok(historicalEnd >= 0);
    for (const migration of additive.slice(0, historicalEnd + 1)) await load(migration.path);
    await connection.query("INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES ('legacy-user','fictional-legacy@example.test','Fictional legacy',17,17)");
    await connection.query("INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at) VALUES ('legacy-order','FICTIONAL-LEGACY','legacy-user','fictional-legacy@example.test','9800000000','confirmed','en-NP','fictional-policy','{}',10000,0,10000,'cod','unpaid',17,17)");
    await connection.query("INSERT INTO wallet_accounts(user_id,referral_code,balance_paisa,created_at) VALUES ('legacy-user','FICTIONAL-LEGACY',0,17)");
    await connection.query("INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('legacy-credit','legacy-user','legacy-order',5000,-5000,'referral_reward',17)");
    await connection.query("INSERT INTO rider_profiles(user_id,status,application_id,version,updated_at) VALUES ('legacy-user','suspended','legacy-application',7,17)");
    await connection.query("INSERT INTO rider_applications(id,user_id,legal_name,phone,district,identity_type,identity_number,object_key,mime_type,created_at) VALUES ('legacy-application','legacy-user','Fictional legacy','9800000000','Kathmandu','citizenship','FICTIONAL-LEGACY','fictional/legacy','image/jpeg',17)");
    await connection.query("INSERT INTO rider_events(id,user_id,actor_id,action,note,created_at) VALUES ('legacy-event','legacy-user','legacy-user','submitted','Fictional historical event',17)");
    await connection.query("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,created_at) VALUES ('legacy-audit','legacy-user','fictional.history','user','legacy-user','legacy-request',17)");
    const historicTables = ['users', 'orders', 'wallet_accounts', 'wallet_entries', 'rider_profiles', 'rider_applications', 'rider_events', 'audit_logs'];
    const before = {};
    for (const table of historicTables) before[table] = (await connection.query('SELECT * FROM `' + table + '` ORDER BY 1'))[0];
    for (const migration of additive.slice(historicalEnd + 1)) await load(migration.path);
    for (const table of historicTables) {
      const columns = Object.keys(before[table][0]).map(c => '`' + c + '`').join(',');
      assert.deepEqual((await connection.query('SELECT ' + columns + ' FROM `' + table + '` ORDER BY 1'))[0], before[table], table + ' conserves every historical value');
    }
    assert.deepEqual(await inspectReadiness(adapter), {ready: true, missing: []});
    await assert.rejects(() => connection.query("UPDATE wallet_entries SET amount_paisa=6000 WHERE id='legacy-credit'"), /wallet_entries_immutable/);
    await assert.rejects(() => connection.query("DELETE FROM rider_events WHERE id='legacy-event'"), /immutable/);
    await assert.rejects(() => connection.query("DELETE FROM users WHERE id='legacy-user'"));
    await assert.rejects(() => connection.query("INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('orphan-credit','missing-user','legacy-order',1,-1,'referral_reward',18)"), error => error.code === 'ER_NO_REFERENCED_ROW_2');
    observations.push({label: 'legacy historical row conservation', status: 'PASS', rows: Object.fromEntries(historicTables.map(table => [table, before[table].length]))});
  });
} finally {
  await connection.end();
  await mkdir(evidence, {recursive: true});
  await writeFile(resolve(evidence, 'mariadb-release-' + prefix + '.json'), JSON.stringify({localOnly: true, canonicalSqlUnmodified: true, credentialsPrinted: false, engine, fixtures, fixturesPreserved: true, hashes, observations}, null, 2) + '\n');
}
process.exitCode = observations.every(result => result.status === 'PASS') ? 0 : 1;
