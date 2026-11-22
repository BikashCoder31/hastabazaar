import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import {captureNativeInventory,normalizeNativeView} from '../scripts/recovery/native-inventory.mjs';
import * as nativeInventory from '../scripts/recovery/native-inventory.mjs';
import {customerFeeCheckoutFixture,AT,terms,feeWaiverContext} from './helpers/customer-fee-waiver-fixture';
import {seedNativeLegacyHistory} from './helpers/customer-fee-native-fixture';
import {mutateCustomerFeeWaiver} from '../lib/db/repositories/customer-fee-waivers';
import {createCodOrder} from '../lib/db/repositories/orders';
import {saveBusinessSettingChange} from '../lib/db/repositories/business-settings';

function fixture(database:string,view='loyalty_latest_claims',suffix='',relationDatabase=database){
 return {async query(sql:string){
  if(sql==='SELECT DATABASE() name')return [[{name:database}]];
  if(sql.includes('information_schema.TABLES'))return [[{name:view,kind:'VIEW',engine:null}]];
  if(sql.startsWith('SHOW CREATE VIEW'))return [[{'Create View':`CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW ${view} AS SELECT d.* FROM \`${relationDatabase}\`.\`loyalty_daily_claims\` d${suffix}`,character_set_client:'utf8mb4',collation_connection:'utf8mb4_general_ci'}]];
  if(/information_schema\.(ROUTINES|EVENTS|TRIGGERS)/.test(sql))return [[]];
  throw Error('Unexpected inventory query');
 }};
}
void test('native recovery compares the reviewed view definition across owned schema names and rejects unknown views',async()=>{
 const source=await captureNativeInventory(fixture('native_123_fresh'));
 assert.equal(source.views,1);
 assert.deepEqual(await captureNativeInventory(fixture('native_123_recovery')),source);
 assert.notEqual((await captureNativeInventory(fixture('native_123_recovery','loyalty_latest_claims',' WHERE 1=0'))).schemaSha256,source.schemaSha256);
 await assert.rejects(captureNativeInventory(fixture('native_123_fresh','unknown_view')),/Unreviewed views/);
 await assert.rejects(captureNativeInventory(fixture('native_123_recovery','loyalty_latest_claims','','native_123_fresh')),/Cross-schema/);
 const sql="CREATE VIEW loyalty_latest_claims AS SELECT 'FROM `native_123_fresh`.`loyalty_daily_claims`' literal FROM `native_123_fresh`.`loyalty_daily_claims` d";
 assert.ok(normalizeNativeView(sql,'native_123_fresh').includes("'FROM `native_123_fresh`.`loyalty_daily_claims`'"));
 assert.ok(normalizeNativeView(sql,'native_123_fresh').endsWith('FROM `$database`.`loyalty_daily_claims` d'));
 const qualified='CREATE VIEW loyalty_latest_claims AS SELECT d.* FROM `native_123_fresh`.`loyalty_daily_claims` d';
 assert.equal(normalizeNativeView(qualified.replace('`native_123_fresh`.',''),'native_123_recovery'),normalizeNativeView(qualified,'native_123_fresh'));
});

void test('native encrypted recovery requires populated durable fee revisions, receipts and line evidence in its compared inventory', () => {
  assert.equal(typeof nativeInventory.assertFeeRecoveryEvidence, 'function');
  const tables = ['customer_fee_waiver_control', 'customer_fee_waiver_campaigns', 'customer_fee_waiver_revisions', 'customer_fee_waiver_requests', 'order_customer_service_fees', 'marketplace_fee_waiver_control', 'marketplace_fee_waiver_campaigns', 'marketplace_fee_waiver_revisions', 'marketplace_fee_waiver_requests', 'order_item_marketplace_fees'].map(name => ({ name, classification: 'durable', rows: name.endsWith('_revisions') || name.endsWith('_requests') ? 2 : 1, sha256: 'a'.repeat(64) }));
  const inspect = nativeInventory.assertFeeRecoveryEvidence;
  assert.deepEqual(inspect({ tables }), tables);
  for (const row of tables) assert.throws(() => inspect({tables:tables.filter(other=>other!==row)}),/populated durable fee evidence/);
  for (const altered of [tables.map(row => ({ ...row, rows: 0 })), tables.map(row => ({ ...row, classification: 'transient' })), tables.map(row => ({ ...row, sha256: '' })),tables.map(row=>({...row,rows:row.name.endsWith('_control')?2:row.rows}))]) assert.throws(() => inspect({ tables: altered }));
});

void test('fictional recovery fixture contains both nonempty fee histories and actual published commercial policies without rewriting a new order',async(t)=>{
 t.mock.method(Date,'now',()=>AT);
 const f=await customerFeeCheckoutFixture();
 try{
  await saveBusinessSettingChange(f.database,{key:'platform_service_fee_policy',value:{enabled:true,amountPaisa:1000},actorId:'owner',reason:'Fictional native recovery policy',requestId:'recovery-policy',now:AT-1,effectiveFrom:null,expectedVersion:0});
  const original=await seedNativeLegacyHistory(f.database);
  const history=f.sqlite.prepare('SELECT * FROM order_item_marketplace_fees').all();
  const draft=await mutateCustomerFeeWaiver(f.database,feeWaiverContext('recovery-create',0,{now:AT}),{type:'create',terms});
  await mutateCustomerFeeWaiver(f.database,feeWaiverContext('recovery-publish',1,{now:AT}),{type:'publish',campaignId:draft.id});
  const receipt=await createCodOrder(f.database,'token','receipt',f.input,AT,'checkout-buyer');
  const current=f.sqlite.prepare('SELECT i.commission_bps,i.commission_paisa,f.standard_paisa,f.waived_paisa,f.net_paisa,f.policy_version_id FROM order_customer_service_fees f JOIN orders o ON o.id=f.order_id JOIN order_items i ON i.order_id=o.id WHERE o.order_number=?').get(receipt.orderNumber)!;
  assert.deepEqual([current.commission_bps,current.commission_paisa,current.standard_paisa,current.waived_paisa,current.net_paisa],[1200,12000,1000,1000,0]);
  assert.ok(current.policy_version_id);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM order_item_marketplace_fees').all(),history);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_customer_service_fees WHERE order_id=?').get(original.orderId)?.n,0);
  for(const key of ['independent_seller_commission_bps','managed_sale_linked_platform_retention_bps','platform_service_fee_policy'])assert.ok(f.sqlite.prepare("SELECT 1 FROM business_setting_versions WHERE setting_key=? AND status='published'").get(key));
 }finally{await f.dispose();}
});

void test('native view rejects comma relations disguised as aliases and schema-qualified routines',()=>{
 const prefix='CREATE VIEW loyalty_latest_claims AS SELECT d.* FROM `native_123_fresh`.`loyalty_daily_claims` d';
 assert.throws(()=>normalizeNativeView(prefix+', d.secret newer','native_123_fresh'),/Unreviewed native view relation/);
 assert.throws(()=>normalizeNativeView(prefix+' WHERE d.some_function()=1','native_123_fresh'),/routine/);
 assert.throws(()=>normalizeNativeView(prefix+' JOIN newer.secret x ON 1=1','native_123_fresh'),/Unreviewed native view relation/);
});

void test('native authority invalidation keeps invitation selections and denies an otherwise unexpired acceptance', async () => {
  const { classifySqlTransferTable } = await import('../lib/portability/d1-source');
  const { staffInvitationAcceptanceStatements } = await import('../lib/operations/staff-invitation-grants');
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`
      CREATE TABLE marketplace_settings(key TEXT PRIMARY KEY);
      CREATE TABLE staff_invitations(
        id TEXT PRIMARY KEY, role TEXT, invited_by TEXT, status TEXT, email TEXT, expires_at INTEGER
      );
      CREATE TABLE staff_invitation_grants(
        invitation_id TEXT PRIMARY KEY REFERENCES staff_invitations(id),
        permissions_json TEXT, grant_version INTEGER, created_by TEXT, created_at INTEGER
      );
      CREATE TABLE service_health_guards(id TEXT PRIMARY KEY, valid INTEGER CHECK(valid=1));
      INSERT INTO staff_invitations VALUES
        ('pending','admin','owner','pending','pending@example.test',9999999999999),
        ('accepted','admin','owner','accepted','accepted@example.test',100),
        ('revoked','admin','owner','revoked','revoked@example.test',200);
      INSERT INTO staff_invitation_grants VALUES
        ('pending','[]',3,'owner',10),('accepted','["product.review"]',7,'owner',11),('revoked','[]',2,'owner',12);
      INSERT INTO service_health_guards VALUES('stale-assertion',1);
    `);
    const original = sqlite.prepare('SELECT * FROM staff_invitation_grants ORDER BY invitation_id').all();
    const connection = {
      async beginTransaction() { sqlite.exec('BEGIN'); },
      async query(sql: string) { sqlite.exec(sql); },
      async commit() { sqlite.exec('COMMIT'); },
      async rollback() { sqlite.exec('ROLLBACK'); },
    };
    const tables = ['staff_invitations', 'staff_invitation_grants', 'service_health_guards']
      .map((name) => ({ name, classification: classifySqlTransferTable(name) }));
    await nativeInventory.invalidateRestoredAuthority(connection, { tables });
    assert.deepEqual(sqlite.prepare('SELECT * FROM staff_invitation_grants ORDER BY invitation_id').all(), original);
    assert.deepEqual(
      sqlite.prepare('SELECT status FROM staff_invitations ORDER BY id').all().map(({status}) => status),
      ['accepted', 'expired', 'revoked'],
    );
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM service_health_guards').get()?.n, 0);

    const d1 = {
      prepare(sql: string) {
        const statement = sqlite.prepare(sql);
        return {
          bind(...values: SQLInputValue[]) {
            return { async first() { return statement.get(...values) ?? null; } };
          },
        };
      },
    } as unknown as D1Database;
    assert.equal(await staffInvitationAcceptanceStatements(d1, {
      invitationId: 'pending', userId: 'recipient', authSubject: 'test-subject',
      email: 'pending@example.test', now: 500,
    }), null);
  } finally {
    sqlite.close();
  }
});
