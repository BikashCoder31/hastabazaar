import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';

import { issueManagedInvoiceGroups } from '../lib/db/repositories/managed-documents';
import { SIMULATED_RECORD_LABEL } from '../lib/staging/environment';

function fixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(`
    CREATE TABLE orders(id TEXT PRIMARY KEY,order_number TEXT,customer_email TEXT,payment_status TEXT,currency TEXT,delivered_at INTEGER,status TEXT);
    CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT,product_name_snapshot TEXT,sku_snapshot TEXT,quantity INTEGER,unit_price_paisa INTEGER,line_total_paisa INTEGER);
    CREATE TABLE managed_commercial_snapshots(id TEXT PRIMARY KEY,order_item_id TEXT,invoice_issuer_reference TEXT,legal_seller_reference TEXT,agreement_version TEXT);
    CREATE TABLE managed_invoice_groups(id TEXT PRIMARY KEY,order_id TEXT,issuer_reference TEXT,invoice_number TEXT UNIQUE,snapshot_json TEXT,barcode_payload TEXT,qr_payload TEXT,simulation_label TEXT,status TEXT,request_id TEXT UNIQUE,issued_at INTEGER,voided_at INTEGER,UNIQUE(order_id,issuer_reference));
    INSERT INTO orders VALUES ('order','HB-SIM-1','customer@local.hastabazaar.test','paid','NPR',1000,'delivered');
    INSERT INTO order_items VALUES ('item-a','order','Clay cup','CLAY-1',1,100000,100000),('item-b','order','Clay plate','CLAY-2',2,50000,100000),('item-c','order','Woven bag','WEAVE-1',1,80000,80000);
    INSERT INTO managed_commercial_snapshots VALUES ('snap-a','item-a','SIM-ISSUER-A','SIM-SELLER-A','SIM-AGREEMENT-A'),('snap-b','item-b','SIM-ISSUER-A','SIM-SELLER-A','SIM-AGREEMENT-A'),('snap-c','item-c','SIM-ISSUER-B','SIM-SELLER-B','SIM-AGREEMENT-B');
  `);
  const db={prepare(sql:string){let values:SQLInputValue[]=[];const statement=sqlite.prepare(sql);return{bind(...next:SQLInputValue[]){values=next;return this;},async first<T>(){return (statement.get(...values) as T|undefined)??null;},async all<T>(){return{results:statement.all(...values) as T[]};},async run(){return{meta:{changes:Number(statement.run(...values).changes)}};}};},async batch(statements:{run():Promise<{meta:{changes:number}}> }[]){const results=[];for(const statement of statements)results.push(await statement.run());return results;}} as unknown as D1Database;
  return{sqlite,db};
}

void test('delivered paid managed items create one clearly simulated invoice record per issuer group',async()=>{
  const {sqlite,db}=fixture();try{
    assert.equal(await issueManagedInvoiceGroups(db,{orderId:'order',requestId:'invoice-run',now:2000}),2);
    assert.equal(await issueManagedInvoiceGroups(db,{orderId:'order',requestId:'invoice-run',now:2001}),0);
    const rows=sqlite.prepare('SELECT * FROM managed_invoice_groups ORDER BY issuer_reference').all() as Array<Record<string,unknown>>;
    assert.equal(rows.length,2);assert.equal(rows[0]?.simulation_label,SIMULATED_RECORD_LABEL);
    const first=JSON.parse(String(rows[0]?.snapshot_json)) as {taxDocument:boolean;items:unknown[];reviewStatus:string};
    assert.equal(first.taxDocument,false);assert.equal(first.items.length,2);assert.match(first.reviewStatus,/SIMULATED/);
    assert.match(String(rows[0]?.barcode_payload),/SIM-ISSUER-A/);assert.match(String(rows[0]?.qr_payload),/simulated-invoice/);
  }finally{sqlite.close();}
});

void test('local mail capture rejects real recipients and cannot replace the production SMTP path',async()=>{
  const source=await readFile('lib/runtime/node-bindings.ts','utf8');
  assert.match(source,/HASTABAZAAR_RUNTIME_ENV !== 'local_staging'/);
  assert.match(source,/@local\.hastabazaar\.test/);
  assert.match(source,/Local staging mail capture rejected a non-test recipient/);
  assert.match(source,/new SmtpEmailService/);
});
