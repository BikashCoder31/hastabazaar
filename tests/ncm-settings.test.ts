import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { changeNcmSettings, ncmSchemaAvailable, ncmSettingsView, suggestNcmBranch } from '../lib/delivery/ncm-settings';
import { securityDatabase } from './helpers/security-database';
import { installNcmFixtureTables } from './helpers/ncm-fixture-tables';

void test('branch suggestion requires a unique covered area or district match', () => {
  const branches = [
    { name: 'KATHMANDU', district: 'Kathmandu', areas: ['Kathmandu Metropolitan City'] },
    { name: 'TINKUNE', district: 'Kathmandu', areas: ['Tinkune'] },
    { name: 'POKHARA', district: 'Kaski', areas: ['Pokhara'] },
  ];
  assert.equal(suggestNcmBranch(branches, {district: 'Kathmandu', municipality: 'Tinkune'}), 'TINKUNE');
  assert.equal(suggestNcmBranch(branches, {district: 'Kaski', municipality: 'New ward'}), 'POKHARA');
  assert.equal(suggestNcmBranch(branches, {district: 'Kathmandu', municipality: 'New ward'}), null);
  assert.equal(suggestNcmBranch(branches, {district: 'Chitwan', municipality: 'Tinkune'}), null);
});

void test('staff connect, cache branches once a day, confirm an address revision and audit settings', async () => {
  const fixture = securityDatabase();
  installNcmFixtureTables(fixture.sqlite);
  fixture.sqlite.exec(`
    CREATE TABLE delivery_partners (id TEXT PRIMARY KEY,name TEXT,revision INTEGER);
    CREATE TABLE staff_permission_profiles (user_id TEXT PRIMARY KEY,permissions_json TEXT);
    CREATE TABLE staff_permission_guards (id TEXT PRIMARY KEY,valid INTEGER CHECK(valid=1));
    CREATE TABLE audit_logs (id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,
      request_id TEXT,created_at INTEGER,command_key TEXT UNIQUE,command_digest TEXT,command_result_json TEXT);
    CREATE TABLE seller_profiles (id TEXT PRIMARY KEY,trading_name TEXT);
    CREATE TABLE seller_operational_addresses (id TEXT PRIMARY KEY,seller_id TEXT,purpose TEXT,locality TEXT,ward TEXT,
      municipality TEXT,district TEXT,province TEXT,updated_at INTEGER);
    INSERT INTO users VALUES ('staff','staff@example.test','staff@example.test','Staff','active',1);
    INSERT INTO user_roles VALUES ('staff','super_admin');
    INSERT INTO delivery_partners VALUES ('ncm','Nepal Can Move',1);
    INSERT INTO seller_profiles VALUES ('seller','Fixture arts');
    INSERT INTO seller_operational_addresses VALUES ('addr','seller','pickup','Tinkune','1','Kathmandu','Kathmandu','Bagmati',10);
  `);
  const endpoints: string[] = [];
  const server = createServer((request, response) => {
    endpoints.push(request.url ?? '');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(request.url === '/api/v2/vendor/assigned-branches' ? ['KATHMANDU'] :
      [{name:'KATHMANDU',district:'Kathmandu',covered_areas:['Tinkune']}]));
  });
  try {
    await new Promise<void>((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const runtime = {HASTABAZAAR_RUNTIME_ENV:'test',NCM_API_BASE_URL:`http://127.0.0.1:${address.port}`,NCM_API_TOKEN:'fake-token'};
    const change = (input: Omit<Parameters<typeof changeNcmSettings>[3], 'partnerId'>, now: number) =>
      changeNcmSettings(fixture.db, runtime, 'staff', {partnerId:'ncm', ...input}, now);
    await change({action:'test',requestId:'test-connection', revision:undefined}, 1_000);
    const connected = await ncmSettingsView(fixture.db, 'ncm', runtime, 1_001);
    assert.deepEqual(connected?.assignedBranches, ['KATHMANDU']);
    assert.equal(connected?.connectedAt, 1_000);
    await change({action:'refresh',requestId:'refresh-branches'}, 1_002);
    await assert.rejects(() => change({action:'refresh',requestId:'refresh-too-soon'}, 1_003), {status:429});
    assert.deepEqual(endpoints, ['/api/v2/vendor/assigned-branches', '/api/v2/branches']);
    const refreshed = await ncmSettingsView(fixture.db, 'ncm', runtime, 1_003);
    assert.equal(refreshed?.pickups[0].suggestedBranch, 'KATHMANDU');
    assert.equal(refreshed?.pickups[0].branch, null);
    await change({action:'map',requestId:'confirm-pickup',pickupAddressId:'addr',addressUpdatedAt:10,branch:'KATHMANDU'}, 1_004);
    assert.equal((await ncmSettingsView(fixture.db, 'ncm', runtime, 1_005))?.pickups[0].branch, 'KATHMANDU');
    fixture.sqlite.prepare('UPDATE seller_operational_addresses SET updated_at=11').run();
    assert.equal((await ncmSettingsView(fixture.db, 'ncm', runtime, 1_006))?.pickups[0].branch, null);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='ncm.map'").get()?.n, 1);
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    fixture.sqlite.close();
  }
});

void test('the NCM schema guard refuses missing or partially installed tables', async () => {
  const fixture = securityDatabase();
  try {
    assert.equal(await ncmSchemaAvailable(fixture.db), false);
    fixture.sqlite.exec('CREATE TABLE ncm_partner_settings (partner_id TEXT PRIMARY KEY)');
    assert.equal(await ncmSchemaAvailable(fixture.db), false);
  } finally { fixture.sqlite.close(); }
});
