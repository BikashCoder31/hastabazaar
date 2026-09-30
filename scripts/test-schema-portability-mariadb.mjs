import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, copyFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';

// This harness intentionally imports canonical SQL without repair substitutions.
// Removing the verified-rider prerequisite or the gift FK must break these checks.
const root = resolve('C:/Users/abinash/.codex/worktrees/hastabazaar-v1-2-1-staging/Hatskala');
assert.equal(resolve(process.cwd()), root);
assert.equal(process.argv.length, 2, 'No connection overrides or fixture reuse');
const reportDirectory = resolve('C:/Users/abinash/Desktop/Hatskala/deployment-20260929/schema');
const context = JSON.parse(execFileSync('docker', ['context', 'inspect'], { encoding: 'utf8' }))[0];
assert.match(context.Endpoints.docker.Host, /^(npipe|unix):\/\//);
const privateState = JSON.parse(await readFile('.staging/form-catalog-mariadb-private.json', 'utf8'));
assert.equal(privateState.host, '127.0.0.1');
assert.equal(privateState.port, 13316);
assert.equal(privateState.name, 'hastabazaar-form-catalog-qa-0928');
const container = JSON.parse(execFileSync('docker', ['inspect', privateState.name], { encoding: 'utf8' }))[0];
assert.equal(container.Id, privateState.id);
assert.equal(container.State.Running, true);
assert.equal(container.Config.Image, 'mariadb:10.11');
assert.equal(container.Config.Labels['hastabazaar.scope'], 'form-catalog-task22-disposable');
assert.deepEqual(container.HostConfig.PortBindings['3306/tcp'], [{ HostIp: '127.0.0.1', HostPort: '13316' }]);
assert.ok(container.HostConfig.Tmpfs['/var/lib/mysql']);
const db = await mysql.createConnection({ host: '127.0.0.1', port: 13316, user: privateState.user, password: privateState.password });
const prefix = 'schema_release_' + Date.now() + '_' + randomUUID().slice(0, 8).replaceAll('-', '');
const databases = [], observations = [];
const canonical = new Map();
async function file(name) {
  if (!canonical.has(name)) canonical.set(name, await readFile('deployment/babal/' + name, 'utf8'));
  return canonical.get(name);
}
function statements(sql) {
  let delimiter = ';', buffer = '';
  const result = [];
  for (const line of sql.split(/\r?\n/)) {
    const directive = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
    if (directive) { assert.ok(!buffer.trim() || buffer.trim().split('\n').every(l => !l.trim() || l.trim().startsWith('--'))); delimiter = directive[1]; continue; }
    buffer += line + '\n';
    if (buffer.trimEnd().endsWith(delimiter)) { result.push(buffer.trimEnd().slice(0, -delimiter.length)); buffer = ''; }
  }
  assert.ok(!buffer.trim() || buffer.trim().split('\n').every(l => !l.trim() || l.trim().startsWith('--')));
  return result.filter(s => s.trim());
}
async function load(sql) { for (const statement of statements(sql)) await db.query(statement); }
async function create(suffix) {
  const name = prefix + '_' + suffix;
  assert.match(name, /^schema_release_\d+_[a-f0-9]+_[a-z]+$/);
  await db.query('CREATE DATABASE `' + name + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  databases.push(name); await db.query('USE `' + name + '`');
}
async function stage(name, action) {
  try { await action(); observations.push({ stage: name, status: 'PASS' }); }
  catch (error) { observations.push({ stage: name, status: 'FAIL', code: error.code ?? error.name, message: String(error.message).replaceAll(privateState.password, '[redacted]').slice(0, 450) }); }
  console.log(JSON.stringify(observations.at(-1)));
}
async function snapshot() {
  const state = {};
  for (const table of ['users', 'orders', 'wallet_accounts', 'wallet_entries', 'referral_campaign', 'rider_applications', 'rider_events', 'rider_profiles']) state[table] = (await db.query('SELECT * FROM `' + table + '` ORDER BY 1'))[0];
  return state;
}
async function foreignKeys() {
  return (await db.query("SELECT k.CONSTRAINT_NAME name,k.COLUMN_NAME columnName,k.REFERENCED_TABLE_NAME parentTable,k.REFERENCED_COLUMN_NAME parentColumn,r.DELETE_RULE deleteRule,r.UPDATE_RULE updateRule FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND k.TABLE_NAME='wallet_entries' AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.COLUMN_NAME"))[0];
}
async function assertWalletForeignKeys(hasLoyalty = false) {
  const keys = await foreignKeys();
  assert.deepEqual(keys.map(({name: _name, ...key}) => key), [
    {columnName:'gift_card_id',parentTable:'gift_cards',parentColumn:'id',deleteRule:'RESTRICT',updateRule:'RESTRICT'},
    ...(hasLoyalty ? [{columnName:'loyalty_redemption_id',parentTable:'loyalty_redemptions',parentColumn:'id',deleteRule:'RESTRICT',updateRule:'RESTRICT'}] : []),
    {columnName:'order_id',parentTable:'orders',parentColumn:'id',deleteRule:'RESTRICT',updateRule:'RESTRICT'},
    {columnName:'user_id',parentTable:'wallet_accounts',parentColumn:'user_id',deleteRule:'RESTRICT',updateRule:'RESTRICT'},
  ]);
  assert.equal(keys.filter(k => k.name === 'wallet_entries_ibfk_1' && k.columnName === 'user_id').length, 1);
  assert.equal(keys.filter(k => k.name === 'wallet_entries_ibfk_2' && k.columnName === 'order_id').length, 1);
}
let engine;
try {
  engine = (await db.query('SELECT VERSION() version,@@sql_mode sqlMode'))[0][0];
  assert.match(engine.version, /^10\.11\./);
  const schema = await file('mariadb-schema.sql');
  await stage('checked-in bootstrap and recovery reproduce canonical generator', async () => {
    const generationRoot = resolve(reportDirectory, prefix + '_generator');
    await mkdir(resolve(generationRoot, 'scripts'), {recursive:true});
    await mkdir(resolve(generationRoot, 'drizzle/meta'), {recursive:true});
    await mkdir(resolve(generationRoot, 'deployment/babal'), {recursive:true});
    await copyFile('scripts/generate-mariadb-schema.mjs', resolve(generationRoot, 'scripts/generate-mariadb-schema.mjs'));
    await copyFile('drizzle/meta/0020_snapshot.json', resolve(generationRoot, 'drizzle/meta/0020_snapshot.json'));
    for (const name of await readdir('deployment/babal')) if (name.endsWith('.sql')) await copyFile('deployment/babal/' + name, resolve(generationRoot, 'deployment/babal', name));
    execFileSync(process.execPath, [resolve(generationRoot, 'scripts/generate-mariadb-schema.mjs')], {cwd:generationRoot,stdio:'pipe'});
    assert.equal(await readFile(resolve(generationRoot,'deployment/babal/mariadb-schema.sql'),'utf8'), schema);
    assert.equal(await readFile(resolve(generationRoot,'deployment/babal/mariadb-reset-empty-import.sql'),'utf8'), await file('mariadb-reset-empty-import.sql'));
  });
  await create('bootstrap');
  await stage('full unmodified canonical bootstrap', async () => {
    await load(schema); await assertWalletForeignKeys(true);
    assert.equal((await db.query("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rider_profiles' AND COLUMN_NAME='open_box_eligible'"))[0][0].n, 1);
    assert.equal((await db.query("SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rider_assignment_snapshots'"))[0][0].n, 1);
  });
  await create('recovery');
  await stage('unmodified recovery SQL imports only into fresh empty fixture', async () => {
    await load(await file('mariadb-reset-empty-import.sql'));
    await assertWalletForeignKeys(true);
    assert.equal((await db.query("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rider_profiles' AND COLUMN_NAME='open_box_eligible'"))[0][0].n,1);
  });
  await create('legacy');
  // Canonical pre-financial bootstrap is only setup for an existing-wallet upgrade;
  // it is never reported as a full import pass.
  const marker = '-- Legacy column prerequisites for promo DDL only; not full financial bootstrap repair.';
  assert.equal(schema.split(marker).length, 2);
  await load(schema.slice(0, schema.indexOf(marker)));
  await load(await file('mariadb-referrals-wallet.sql'));
  await db.query('SET FOREIGN_KEY_CHECKS=1');
  await db.query("INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES ('fixture-user','schema-fixture@example.test','Synthetic history',17,17)");
  await db.query("INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at) VALUES ('fixture-order','SCHEMA-FIXTURE','fixture-user','schema-fixture@example.test','9800000000','confirmed','en-NP','fixture-policy','{}',10000,0,10000,'cod','unpaid',17,17)");
  await db.query("INSERT INTO wallet_accounts(user_id,referral_code,balance_paisa,created_at) VALUES ('fixture-user','SCHEMA-FIXTURE',0,17)");
  await db.query("INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('historical-credit','fixture-user','fixture-order',5000,-5000,'referral_reward',17)");
  await db.query("INSERT INTO rider_profiles(user_id,status,application_id,version,updated_at) VALUES ('fixture-user','suspended','fixture-application',7,17)");
  await db.query("INSERT INTO rider_applications(id,user_id,legal_name,phone,district,identity_type,identity_number,object_key,mime_type,created_at) VALUES ('fixture-application','fixture-user','Synthetic history','9800000000','Kathmandu','citizenship','SYN-SCHEMA','synthetic/fixture','image/jpeg',17)");
  await db.query("INSERT INTO rider_events(id,user_id,actor_id,action,note,created_at) VALUES ('fixture-event','fixture-user','fixture-user','submitted','Synthetic history',17)");
  const before = await snapshot(), keysBefore = await foreignKeys();
  await stage('authentic gift upgrade repeated preserves existing wallet and rider history', async () => {
    await load(await file('mariadb-gift-cards.sql')); await load(await file('mariadb-gift-cards.sql'));
    const after = await snapshot();
    // gift_card_id is an additive nullable column, with all old values intact.
    after.wallet_entries = after.wallet_entries.map(({gift_card_id, ...row}) => { assert.equal(gift_card_id, null); return row; });
    assert.deepEqual(after, before); await assertWalletForeignKeys();
    assert.deepEqual((await foreignKeys()).filter(k => k.columnName !== 'gift_card_id'), keysBefore);
    await db.query("INSERT INTO gift_cards(id,code_hash,amount_paisa,issued_by,issuance_request_id,issued_at,redeemed_by,redeemed_at,redemption_request_id) VALUES ('fixture-gift','synthetic-code-hash',2500,'fixture-user','fixture-issue',18,'fixture-user',19,'fixture-redeem')");
    await db.query("INSERT INTO wallet_entries(id,user_id,order_id,gift_card_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('fixture-gift-credit','fixture-user',NULL,'fixture-gift',2500,-2500,'gift_card',19)");
    assert.equal((await db.query("SELECT balance_paisa balance FROM wallet_accounts WHERE user_id='fixture-user'"))[0][0].balance, 7500);
    await load(await file('mariadb-gift-cards.sql'));
    await assert.rejects(() => db.query("DELETE FROM gift_cards WHERE id='fixture-gift'"), /gift_cards_immutable/);
    await assert.rejects(() => db.query("UPDATE wallet_entries SET amount_paisa=6000 WHERE id='historical-credit'"), /wallet_entries_immutable/);
    await assert.rejects(() => db.query("UPDATE wallet_entries SET gift_card_id='missing' WHERE id='fixture-gift-credit'"), /wallet_entries_immutable/);
    await db.query('DROP TRIGGER wallet_gift_source_guard');
    await assert.rejects(() => db.query("INSERT INTO wallet_entries(id,user_id,order_id,gift_card_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('orphan-gift-credit','fixture-user',NULL,'missing',1,-1,'gift_card',20)"), error => error.code === 'ER_NO_REFERENCED_ROW_2');
    await load(await file('mariadb-gift-cards.sql'));
    await assert.rejects(() => db.query("INSERT INTO wallet_entries(id,user_id,order_id,gift_card_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('mismatch-gift-credit','fixture-user',NULL,'fixture-gift',1,-1,'gift_card',20)"), /gift_card_source_mismatch/);
    await assert.rejects(() => db.query("DELETE FROM rider_events WHERE id='fixture-event'"), /immutable/);
    // Older successful imports used MariaDB's autogenerated FK name. Reapplying
    // canonical SQL must keep that existing constraint and avoid a duplicate.
    const giftKey = (await foreignKeys()).find(k => k.columnName === 'gift_card_id');
    assert.ok(giftKey);
    await db.query('ALTER TABLE wallet_entries DROP FOREIGN KEY `' + giftKey.name + '`, ADD CONSTRAINT wallet_entries_legacy_gift_fk FOREIGN KEY (gift_card_id) REFERENCES gift_cards(id)');
    const legacyKeys = await foreignKeys();
    const legacyHistory = (await db.query('SELECT * FROM gift_cards ORDER BY id'))[0];
    const legacyLedger = (await db.query('SELECT * FROM wallet_entries ORDER BY id'))[0];
    await load(await file('mariadb-gift-cards.sql'));
    assert.deepEqual(await foreignKeys(), legacyKeys);
    assert.deepEqual((await db.query('SELECT * FROM gift_cards ORDER BY id'))[0], legacyHistory);
    assert.deepEqual((await db.query('SELECT * FROM wallet_entries ORDER BY id'))[0], legacyLedger);
  });
} catch (error) {
  observations.push({stage:'fixture setup',status:'FAIL',code:error.code ?? error.name,message:String(error.message).replaceAll(privateState.password,'[redacted]').slice(0,450)});
  console.log(JSON.stringify(observations.at(-1)));
} finally {
  // Only this invocation's freshly allocated fixtures are removed.
  for (const name of databases) await db.query('DROP DATABASE `' + name + '`');
  await db.end(); await mkdir(reportDirectory, {recursive:true});
  const report = {localOnly:true, canonicalSqlUnmodified:true, credentialsPrinted:false, engine, fixtures:databases, fixturesDropped:true, sqlHashes:Object.fromEntries([...canonical].map(([name,sql]) => [name,createHash('sha256').update(sql).digest('hex')])), observations};
  await writeFile(resolve(reportDirectory,prefix + '.json'), JSON.stringify(report,null,2) + '\n');
}
process.exitCode = observations.every(o => o.status === 'PASS') ? 0 : 1;
