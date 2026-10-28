import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { inspectLocalFeatureSchema } from '../scripts/start-local.mjs';
import { inspectReadiness } from '../lib/operations/readiness';
import { classifySqlTransferTable } from '../lib/portability/d1-source';
import { assertFeeRecoveryEvidence } from '../scripts/recovery/native-inventory.mjs';

async function legacyDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for (const name of (await readdir(new URL('../drizzle/', import.meta.url))).filter(name => /^\d{4}_.+\.sql$/.test(name) && Number(name.slice(0, 4)) <= 73).sort())
    db.exec(await readFile(new URL('../drizzle/' + name, import.meta.url), 'utf8'));
  // Hosted-auth storage is a separately provisioned prerequisite, reproduced
  // only in this disposable fixture so central schema readiness is meaningful.
  db.exec(`CREATE TABLE user_credentials(user_id TEXT NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE ON UPDATE NO ACTION,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,password_version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE user_sessions(token_hash TEXT NOT NULL PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE NO ACTION,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL);
    CREATE TABLE email_login_challenges(token_hash TEXT NOT NULL PRIMARY KEY,code_hash TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE NO ACTION,attempts INTEGER NOT NULL DEFAULT 0,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,consumed_at INTEGER);`);
  db.exec(`INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES('owner','owner','owner@example.test','Owner','en-NP','active',1,1);
    INSERT INTO orders(id,order_number,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at)
    VALUES('legacy','LEGACY','buyer@example.test','9800000000','placed','en-NP','historical','{}',10000,0,1000,11000,'cod','pending',1,1);
    INSERT INTO order_policy_acceptances(id,order_id,policy_version,terms_snapshot_json,acceptance_method,request_id,accepted_at)
    VALUES('acceptance','legacy','historical','{"serviceFee":{"enabled":true,"amountPaisa":1000,"chargedPaisa":1000,"versionId":null,"rule":"non_refundable_except_law_v1"}}','checkbox','legacy-acceptance',1);
    INSERT INTO marketplace_fee_waiver_campaigns(id,revision,created_at,updated_at) VALUES('legacy-campaign',2,1,2);
    INSERT INTO marketplace_fee_waiver_revisions(campaign_id,revision,state,name,description,starts_at,ends_at,created_by,request_id,created_at)
    VALUES('legacy-campaign',1,'draft','Historical seller waiver','Retain history',1,1000,'owner','legacy-create',1),('legacy-campaign',2,'published','Historical seller waiver','Retain history',1,1000,'owner','legacy-publish',2);
    INSERT INTO marketplace_fee_waiver_requests VALUES('legacy-create','owner','owner','{"type":"create"}','{"id":"legacy-campaign"}',1),('legacy-publish','owner','owner','{"type":"publish"}','{"id":"legacy-campaign"}',2);
    UPDATE marketplace_fee_waiver_control SET revision=2;
    INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at)
    VALUES('seller','owner','Historical Maker','Historical Shop','Local','REG-OLD','PAN','123456789','Maker','9800000000','maker@example.test','Bagmati','Kathmandu','Kathmandu','Ward 1','approved',1,1);
    INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
    VALUES('historical-rate','independent_seller_commission_bps',1,'900','published',1,'controlled',1,'Fictional historical accepted 9 percent','owner',1,'historical-rate');
    INSERT INTO seller_agreement_acceptance_history(id,seller_id,agreement_version,language_presented,commission_setting_version_id,commission_bps,acceptance_request_id,accepted_by,accepted_at)
    VALUES('old-seller-acceptance','seller','historical','en','historical-rate',900,'old-seller-acceptance','owner',1);
    INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at)
    VALUES('old-identity','seller','identity','private/fictional/old-identity.pdf','fictional.pdf','application/pdf',10,'approved',1);
    INSERT INTO managed_maker_application_details(id,seller_id,government_id_type,personal_pan,identity_document_id,agreement_version,agreement_accepted_at,agreement_accepted_by,agreement_snapshot_json,created_at)
    VALUES('old-personal-pan','seller','citizenship','987654321','old-identity','historical',1,'owner','{"historical":true}',1);
    INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('category','historical','Historical',1,1,1,1);
    INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at)
    VALUES('product','seller','category','historical','OLD-SKU','Historical','Fictional historical product',10000,10,'Maker','NP','Wood','published',1,1);
    INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,commission_bps,commission_paisa,line_total_paisa,created_at)
    VALUES('old-line','legacy','product','seller','Historical Shop','Historical','OLD-SKU',10000,1,0,0,10000,1);
    INSERT INTO order_item_marketplace_fees VALUES('old-line',900,10000,900,900,0,'legacy-campaign',2,1);
    INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,type,amount_paisa,description,created_at)
    VALUES('old-sale','seller','old-line','sale',10000,'Historical amount retained',1);
    INSERT INTO payments(id,order_id,provider,method,status,amount_paisa,idempotency_key,created_at,updated_at)
    VALUES('old-payment','legacy','manual','cod','pending',11000,'old-payment',1,1);
    INSERT INTO refunds(id,order_id,payment_id,status,amount_paisa,reason,requested_at)
    VALUES('old-refund','legacy','old-payment','requested',500,'Fictional historical refund',1);`);
  return db;
}
async function applyCustomer(db: DatabaseSync, transform = (source: string) => source) {
  const path = new URL('../drizzle/0074_customer_service_fee_waivers.sql', import.meta.url);
  // A missing additive migration is the intended initial red assertion.
  const source = await readFile(path, 'utf8').catch(() => null);
  assert.ok(source, 'reviewed customer fee migration 0074 is required');
  db.exec(transform(source));
}
function rows(db: DatabaseSync, tables: string[]) {
  return Object.fromEntries(tables.map(name => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
}
function adapter(db: DatabaseSync) {
  return { prepare(sql: string) { return { async all() { return { results: db.prepare(sql).all() }; } }; } } as unknown as D1Database;
}
function seedCampaign(db: DatabaseSync) {
  db.exec(`INSERT INTO customer_fee_waiver_campaigns VALUES('campaign',2,1,2);
    INSERT INTO customer_fee_waiver_revisions VALUES('campaign',1,'draft','Customer launch','Global customer fee',1,1000,'owner','create',1),('campaign',2,'published','Customer launch','Global customer fee',1,1000,'owner','publish',2);
    INSERT INTO customer_fee_waiver_requests VALUES('create','owner','owner','{"type":"create"}','{"id":"campaign"}',1),('publish','owner','owner','{"type":"publish"}','{"id":"campaign"}',2);`);
}
function evidence(db: DatabaseSync, overrides: Record<string, SQLInputValue> = {}) {
  const values = { order_id: 'legacy', policy_enabled: 1, policy_amount_paisa: 1000, policy_version_id: null, standard_paisa: 1000, waived_paisa: 0, net_paisa: 1000, campaign_id: null, campaign_revision: null, created_at: 3, ...overrides };
  return db.prepare(`INSERT INTO order_customer_service_fees(${Object.keys(values).join(',')}) VALUES(${Object.keys(values).map(() => '?').join(',')})`).run(...Object.values(values));
}
function order(db: DatabaseSync, id: string, fee: number) {
  db.prepare(`INSERT INTO orders(id,order_number,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at)
    VALUES(?,?,'buyer@example.test','9800000000','placed','en-NP','historical','{}',10000,0,?,?, 'cod','pending',1,1)`).run(id, id, fee, 10000 + fee);
}

void test('0074 conserves every original table row and column and seeds only the empty customer control', async () => {
  const db = await legacyDatabase();
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => String(row.name));
    const before = rows(db, tables);
    const columns = Object.fromEntries(tables.map(name => [name, db.prepare(`PRAGMA table_info("${name}")`).all()]));
    await applyCustomer(db);
    assert.deepEqual(rows(db, tables), before);
    assert.deepEqual(Object.fromEntries(tables.map(name => [name, db.prepare(`PRAGMA table_info("${name}")`).all()])), columns);
    assert.deepEqual({ ...db.prepare('SELECT * FROM customer_fee_waiver_control').get() }, { id: 'default', revision: 0 });
    for (const name of ['customer_fee_waiver_campaigns', 'customer_fee_waiver_revisions', 'customer_fee_waiver_requests', 'order_customer_service_fees'])
      assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${name}`).get()?.n, 0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    console.log('CONSERVATION: all ' + tables.length + ' original tables and their columns/rows equal after applying only 0074; old campaign revisions/requests/order/line evidence/accepted 900bps/payment/refund/ledger/personal-PAN application retained; new control revision=0, other new tables empty.');
  } finally { db.close(); }
});

void test('customer evidence reconciles the saved original order charge and full positive waivers', async () => {
  const db = await legacyDatabase();
  try {
    await applyCustomer(db); seedCampaign(db);
    evidence(db);
    order(db, 'waived', 0);
    evidence(db, { order_id: 'waived', waived_paisa: 1000, net_paisa: 0, campaign_id: 'campaign', campaign_revision: 2 });
    order(db, 'disabled', 0);
    evidence(db, { order_id: 'disabled', policy_enabled: 0, policy_amount_paisa: 2500, standard_paisa: 0, net_paisa: 0 });
    order(db, 'zero', 0);
    evidence(db, { order_id: 'zero', policy_amount_paisa: 0, standard_paisa: 0, net_paisa: 0 });
    order(db, 'variable-policy', 0);
    evidence(db, { order_id: 'variable-policy', policy_amount_paisa: 1500, standard_paisa: 1500, waived_paisa: 1500, net_paisa: 0, campaign_id: 'campaign', campaign_revision: 1 });
    assert.deepEqual(db.prepare('SELECT f.net_paisa,o.buyer_platform_fee_paisa FROM order_customer_service_fees f JOIN orders o ON o.id=f.order_id').all().map(row => row.net_paisa === row.buyer_platform_fee_paisa), [true,true,true,true,true]);
    assert.throws(() => db.exec("UPDATE orders SET buyer_platform_fee_paisa=2000 WHERE id='legacy'"), /customer_fee_order_mismatch/);
    db.exec("UPDATE orders SET status='confirmed' WHERE id='legacy'");
    order(db, 'legacy-after-upgrade', 1000); // Recovery may still insert original legacy orders with no customer evidence.
    assert.equal(db.prepare("SELECT COUNT(*) n FROM order_customer_service_fees WHERE order_id='legacy-after-upgrade'").get()?.n, 0);
    let invalid = 0;
    for (const [field, value] of [['policy_enabled', 2], ['policy_amount_paisa', -1], ['policy_amount_paisa', 100001], ['standard_paisa', 999], ['waived_paisa', 1], ['net_paisa', 999], ['created_at', 1.5], ['campaign_revision', 2], ['campaign_id', 'campaign']] as const) {
      const id = 'invalid-' + invalid++; order(db, id, 1000);
      assert.throws(() => evidence(db, { order_id: id, [field]: value }), /constraint|mismatch/i, field);
    }
    const invalidChanges: Record<string, SQLInputValue>[] = [
      { policy_enabled: 0, standard_paisa: 1000 },
      { standard_paisa: 0, policy_amount_paisa: 0, waived_paisa: 0, net_paisa: 0, campaign_id: 'campaign', campaign_revision: 2 },
      { waived_paisa: 500, net_paisa: 500, campaign_id: 'campaign', campaign_revision: 2 },
      { waived_paisa: 1000, net_paisa: 0, campaign_id: 'campaign', campaign_revision: 99 },
    ];
    for (const change of invalidChanges) {
      const id = 'bad-' + crypto.randomUUID(); order(db, id, Number(change.net_paisa ?? 1000));
      assert.throws(() => evidence(db, { order_id: id, ...change }), /constraint/i);
    }
  } finally { db.close(); }
});

void test('customer campaign revisions, receipts, order evidence and campaign identity are retained', async () => {
  const db = await legacyDatabase();
  try {
    await applyCustomer(db); seedCampaign(db); evidence(db);
    for (const [table, column] of [['customer_fee_waiver_revisions','name'], ['customer_fee_waiver_requests','auth_subject'], ['order_customer_service_fees','net_paisa']] as const) {
      assert.throws(() => db.exec(`UPDATE ${table} SET ${column}=${column}`), /immutable/);
      assert.throws(() => db.exec(`DELETE FROM ${table}`), /immutable/);
    }
    assert.throws(() => db.exec('DELETE FROM customer_fee_waiver_campaigns'), /retained/);
    db.exec("INSERT INTO customer_fee_waiver_campaigns VALUES('A',1,1,1),('a',1,1,1)");
    assert.deepEqual(db.prepare("SELECT id FROM customer_fee_waiver_campaigns WHERE id IN ('A','a') ORDER BY id").all().map(row => row.id), ['A','a']);
    assert.throws(() => db.exec("INSERT INTO customer_fee_waiver_requests VALUES('array','owner','owner','[]','{}',1)"), /constraint/i);
  } finally { db.close(); }
});

for (const prefix of ['INSERT OR REPLACE INTO', 'REPLACE INTO']) {
  for (const [identity, table, replacement, message] of [
    ['revision composite PK', 'customer_fee_waiver_revisions', "('campaign',1,'draft','Replacement name','Replacement description',1,1000,'owner','replacement-pk',9)", 'customer_fee_waiver_revision_immutable'],
    ['revision separate request ID with a different revision', 'customer_fee_waiver_revisions', "('campaign',3,'draft','Replacement name','Replacement description',1,1000,'owner','create',9)", 'customer_fee_waiver_revision_immutable'],
    ['receipt PK', 'customer_fee_waiver_requests', "('create','owner','changed-subject','{\"type\":\"changed\"}','{\"changed\":true}',9)", 'customer_fee_waiver_request_immutable'],
    ['order evidence PK with the original valid net', 'order_customer_service_fees', "('legacy',1,1000,'replacement-policy',1000,0,1000,NULL,NULL,9)", 'customer_fee_snapshot_immutable'],
  ] as const) {
    void test(`${prefix} cannot rewrite ${identity} when recursive triggers are OFF`, async () => {
      const db = await legacyDatabase();
      try {
        db.exec('PRAGMA recursive_triggers=OFF');
        assert.equal(db.prepare('PRAGMA recursive_triggers').get()?.recursive_triggers, 0);
        await applyCustomer(db); seedCampaign(db); evidence(db);
        const tables = ['customer_fee_waiver_control','customer_fee_waiver_campaigns','customer_fee_waiver_revisions','customer_fee_waiver_requests','order_customer_service_fees','orders'];
        const before = rows(db, tables);
        assert.throws(() => db.exec(`${prefix} ${table} VALUES${replacement}`), new RegExp(message));
        assert.deepEqual(rows(db, tables), before, 'every original field and row must survive the rejected replacement');
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
        assert.equal(db.prepare('PRAGMA recursive_triggers').get()?.recursive_triggers, 0);
      } finally { db.close(); }
    });
  }
}

void test('duplicate-insert guards preserve new customer inserts, lifecycle pointer updates and legacy recovery orders with recursion OFF', async () => {
  const db = await legacyDatabase();
  try {
    db.exec('PRAGMA recursive_triggers=OFF');
    await applyCustomer(db); seedCampaign(db); evidence(db);
    db.exec(`INSERT INTO customer_fee_waiver_revisions VALUES('campaign',3,'paused','Customer launch','Global customer fee',1,1000,'owner','pause',3);
      INSERT INTO customer_fee_waiver_requests VALUES('pause','owner','owner','{"type":"pause"}','{"id":"campaign","revision":3}',3);
      UPDATE customer_fee_waiver_campaigns SET revision=3,updated_at=3 WHERE id='campaign';
      UPDATE customer_fee_waiver_control SET revision=3 WHERE id='default';`);
    order(db, 'ordinary-new', 1000); evidence(db, { order_id: 'ordinary-new', created_at: 4 });
    order(db, 'legacy-recovery', 1000);
    assert.equal(db.prepare("SELECT revision FROM customer_fee_waiver_campaigns WHERE id='campaign'").get()?.revision, 3);
    assert.equal(db.prepare("SELECT revision FROM customer_fee_waiver_control WHERE id='default'").get()?.revision, 3);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM customer_fee_waiver_revisions').get()?.n, 3);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM customer_fee_waiver_requests').get()?.n, 3);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM order_customer_service_fees').get()?.n, 2);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM order_customer_service_fees WHERE order_id='legacy-recovery'").get()?.n, 0);
    assert.equal(db.prepare('PRAGMA recursive_triggers').get()?.recursive_triggers, 0);
  } finally { db.close(); }
});

void test('local and central SQLite readiness require every duplicate-insert guard', async () => {
  const db = await legacyDatabase();
  try {
    await applyCustomer(db);
    for (const name of ['customer_fee_waiver_revisions_no_replace','customer_fee_waiver_requests_no_replace','order_customer_service_fees_no_replace']) {
      const definition = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").get(name)?.sql;
      assert.equal(typeof definition, 'string', name + ' is required');
      db.exec(`DROP TRIGGER ${name}`);
      assert.ok(inspectLocalFeatureSchema(db).missing.includes('trigger:' + name));
      assert.ok((await inspectReadiness(adapter(db))).missing.includes('trigger:' + name));
      db.exec(String(definition));
    }
  } finally { db.close(); }
});

void test('read-only local and central readiness reject missing or weakened customer storage', async () => {
  const db = await legacyDatabase();
  try {
    // This fixture tests missing 0074, not the later continuity schema.
    db.exec(await readFile(new URL('../drizzle/0075_commission_continuity.sql', import.meta.url), 'utf8'));
    assert.equal(inspectLocalFeatureSchema(db).ready, false, 'missing 0074 must stop the local launcher');
    assert.equal((await inspectReadiness(adapter(db))).ready, false);
    await applyCustomer(db);
    assert.deepEqual(inspectLocalFeatureSchema(db), { ready: true, missing: [] });
    assert.deepEqual(await inspectReadiness(adapter(db)), { ready: true, missing: [] });
    db.exec('DROP TRIGGER order_customer_service_fees_match_order');
    assert.equal(inspectLocalFeatureSchema(db).ready, false);
    assert.equal((await inspectReadiness(adapter(db))).ready, false);
  } finally { db.close(); }
});

void test('portability and native recovery require both historical and customer durable fee evidence', () => {
  const names = ['marketplace_fee_waiver_control','marketplace_fee_waiver_campaigns','marketplace_fee_waiver_revisions','marketplace_fee_waiver_requests','order_item_marketplace_fees','customer_fee_waiver_control','customer_fee_waiver_campaigns','customer_fee_waiver_revisions','customer_fee_waiver_requests','order_customer_service_fees'];
  for (const name of names) assert.equal(classifySqlTransferTable(name), 'durable');
  const inventory = { tables: names.map(name => ({ name, classification: 'durable', rows: name.endsWith('_control') ? 1 : 2, sha256: 'a'.repeat(64) })) };
  assert.equal(assertFeeRecoveryEvidence(inventory).length, 10);
  for (const name of names) assert.throws(() => assertFeeRecoveryEvidence({ tables: inventory.tables.filter(row => row.name !== name) }), /populated durable fee evidence/);
});

void test('SQLite readiness rejects weakened checks, revision references, binary identity and conditional immutable guards', async () => {
  for (const [label, transform] of [
    ['positive-waiver', (sql: string) => sql.replace('AND standard_paisa>0 ', '')],
    ['revision-reference', (sql: string) => sql.replace('FOREIGN KEY(campaign_id,campaign_revision) REFERENCES customer_fee_waiver_revisions(campaign_id,revision),', '')],
    ['binary-identity', (sql: string) => sql.replace('COLLATE BINARY', 'COLLATE NOCASE')],
    ['policy-standard', (sql: string) => sql.replace('standard_paisa=policy_amount_paisa', 'standard_paisa<=policy_amount_paisa')],
    ['conditional-immutable', (sql: string) => sql.replace('BEFORE UPDATE ON order_customer_service_fees BEGIN', 'BEFORE UPDATE ON order_customer_service_fees WHEN 0 BEGIN')],
  ] as const) {
    const db = await legacyDatabase();
    try {
      await applyCustomer(db, transform);
      const local = inspectLocalFeatureSchema(db), central = await inspectReadiness(adapter(db));
      assert.equal(local.ready, false, label);
      assert.equal(central.ready, false, label);
      assert.ok(local.missing.some(name => name.includes('-version:')), label);
      assert.ok(central.missing.some(name => name.includes('-version:')), label);
    } finally { db.close(); }
  }
  const db = await legacyDatabase();
  try {
    await applyCustomer(db); db.exec('DELETE FROM customer_fee_waiver_control');
    assert.ok(inspectLocalFeatureSchema(db).missing.includes('control:customer_fee_waiver_control.default'));
    assert.ok((await inspectReadiness(adapter(db))).missing.includes('control:customer_fee_waiver_control.default'));
  } finally { db.close(); }
});
