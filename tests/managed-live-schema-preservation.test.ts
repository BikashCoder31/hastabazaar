import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';

void test('0146 retains legacy rows, labels, references, indexes and immutable source protections without dropping parent tables',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
 db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE seller_profiles(id TEXT PRIMARY KEY);CREATE TABLE order_items(id TEXT PRIMARY KEY);CREATE TABLE orders(id TEXT PRIMARY KEY);CREATE TABLE refunds(id TEXT PRIMARY KEY);CREATE TABLE seller_participation_profiles(id TEXT PRIMARY KEY);CREATE TABLE payout_transfer_packets(managed_payout_id TEXT,state TEXT);CREATE TABLE seller_recovery_allocations(id TEXT,method TEXT,case_id TEXT,managed_credit_id TEXT,managed_debit_id TEXT);`);
 const original=await readFile(new URL('../drizzle/0046_managed_commerce.sql',import.meta.url),'utf8');
 db.exec(original);
 db.exec(await readFile(new URL('../drizzle/0051_invoice_adjustments.sql',import.meta.url),'utf8'));
 const readiness=await readFile(new URL('../drizzle/0071_company_store_maker_readiness.sql',import.meta.url),'utf8');
 db.exec(readiness.slice(readiness.indexOf('CREATE TABLE managed_payout_allocations')));
 db.exec(`ALTER TABLE managed_commercial_snapshots ADD COLUMN accepted_managed_detail_id TEXT;
 INSERT INTO users VALUES('prepare'),('review');INSERT INTO seller_profiles VALUES('maker');INSERT INTO order_items VALUES('item');INSERT INTO orders VALUES('order');
 INSERT INTO managed_commercial_snapshots(id,order_item_id,seller_id,participation_route,commercial_model,legal_seller_reference,invoice_issuer_reference,payout_beneficiary_reference,agreement_version,agreement_language,product_value_paisa,eligible_base_paisa,maker_entitlement_paisa,simulation_label,created_at)
 VALUES('snapshot','item','maker','managed_maker','managed_sale_linked_percentage_v1','company','company','bank','agreement','en',10000,10000,10000,'SIMULATED — ORIGINAL LABEL',1);
 INSERT INTO managed_entitlements(id,snapshot_id,seller_id,status,calculated_paisa,created_at,updated_at)VALUES('entitlement','snapshot','maker','calculated',10000,1,1);
 INSERT INTO managed_payouts(id,seller_id,payout_number,amount_paisa,status,destination_reference,simulation_label,prepared_by,scheduled_for,request_id,created_at,updated_at)VALUES('payout','maker','SIM-MP-OLD',10000,'prepared','bank','SIMULATED — PAYMENT','prepare',1,'old-payout',1,1);
 INSERT INTO managed_payout_allocations VALUES('payout','entitlement',10000,'reserved',1,NULL,'old-allocation','prepare');
 INSERT INTO managed_invoice_groups VALUES('invoice','order','company','SIM-INV-OLD','{}','barcode','qr','SIMULATED — INVOICE','issued','old-invoice',1,NULL);
 INSERT INTO managed_invoice_adjustments(id,invoice_group_id,adjustment_number,kind,amount_paisa,reason_code,note,snapshot_json,simulation_label,request_id,created_by,issued_at)VALUES('adjustment','invoice','SIM-CN-OLD','credit_note',100,'refund','Original note','{}','SIMULATED — ADJUSTMENT','old-adjustment','review',2);`);
 const tables=['managed_commercial_snapshots','managed_payouts','managed_invoice_groups','managed_invoice_adjustments'];
 const before=tables.map(t=>({...db.prepare('SELECT * FROM '+t).get()!}));
 const source=await readFile(new URL('../drizzle/0146_managed_live_financial.sql',import.meta.url),'utf8');
 assert.doesNotMatch(source,/DROP TABLE|foreign_keys\s*=\s*OFF/i);
 db.exec(source);
 for(const [i,table] of tables.entries()){
  const row=db.prepare('SELECT * FROM '+table).get()!;
  for(const [key,value] of Object.entries(before[i]))assert.equal(row[key],value,table+'.'+key);
  assert.equal(row.record_kind,'simulation');
 }
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM managed_payout_allocations').get()!.n,1);
 assert.throws(()=>db.exec("UPDATE managed_commercial_snapshots SET simulation_label=NULL"),/immutable/);
 assert.throws(()=>db.exec("UPDATE managed_payouts SET record_kind='live'"),/immutable/);
 assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='managed_allocation_one_reservation'").get());
 }finally{db.close();}
});

