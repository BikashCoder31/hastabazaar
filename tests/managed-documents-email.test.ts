import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

import {
  issueManagedInvoiceAdjustment,
  issueManagedInvoiceGroups,
  listManagedInvoiceAdjustments,
} from '../lib/db/repositories/managed-documents';
import { buildCode39Barcode, renderQrSvg } from '../lib/documents/machine-codes';
import { SIMULATED_RECORD_LABEL } from '../lib/staging/environment';

function fixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(`
    CREATE TABLE order_documents(id TEXT PRIMARY KEY,order_id TEXT,kind TEXT,snapshot_json TEXT);
    CREATE TABLE shipping_jobs(id TEXT PRIMARY KEY,order_id TEXT NOT NULL);
    CREATE TABLE shipping_parcels(shipping_job_id TEXT PRIMARY KEY REFERENCES shipping_jobs(id),cod_due_paisa INTEGER NOT NULL CHECK(cod_due_paisa>=0),collected_paisa INTEGER NOT NULL DEFAULT 0 CHECK(collected_paisa>=0 AND collected_paisa<=cod_due_paisa));
    CREATE TABLE orders(id TEXT PRIMARY KEY,order_number TEXT,customer_email TEXT,payment_status TEXT,currency TEXT,delivered_at INTEGER,status TEXT);
    CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT,product_name_snapshot TEXT,sku_snapshot TEXT,quantity INTEGER,unit_price_paisa INTEGER,line_total_paisa INTEGER);
    CREATE TABLE managed_commercial_snapshots(id TEXT PRIMARY KEY,order_item_id TEXT,invoice_issuer_reference TEXT,legal_seller_reference TEXT,agreement_version TEXT);
    CREATE TABLE managed_invoice_groups(id TEXT PRIMARY KEY,order_id TEXT,issuer_reference TEXT,invoice_number TEXT UNIQUE,snapshot_json TEXT,barcode_payload TEXT,qr_payload TEXT,simulation_label TEXT,status TEXT,request_id TEXT UNIQUE,issued_at INTEGER,voided_at INTEGER,UNIQUE(order_id,issuer_reference));
    CREATE TABLE users(id TEXT PRIMARY KEY);
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT UNIQUE,ip_hash TEXT,created_at INTEGER);
    CREATE TABLE managed_invoice_adjustments(id TEXT PRIMARY KEY,invoice_group_id TEXT,adjustment_number TEXT UNIQUE,kind TEXT,amount_paisa INTEGER,reason_code TEXT,note TEXT,snapshot_json TEXT,simulation_label TEXT,request_id TEXT UNIQUE,created_by TEXT,issued_at INTEGER);
    CREATE TRIGGER managed_invoice_adjustment_no_update BEFORE UPDATE ON managed_invoice_adjustments BEGIN SELECT RAISE(ABORT,'managed_invoice_adjustment_immutable'); END;
    CREATE TRIGGER managed_invoice_adjustment_no_delete BEFORE DELETE ON managed_invoice_adjustments BEGIN SELECT RAISE(ABORT,'managed_invoice_adjustment_immutable'); END;
    INSERT INTO users VALUES ('admin');
    INSERT INTO orders VALUES ('order','HB-SIM-1','customer@local.hastabazaar.test','paid','NPR',1000,'delivered');
    INSERT INTO order_items VALUES ('item-a','order','Clay cup','CLAY-1',1,100000,100000),('item-b','order','Clay plate','CLAY-2',2,50000,100000),('item-c','order','Woven bag','WEAVE-1',1,80000,80000);
    INSERT INTO managed_commercial_snapshots VALUES ('snap-a','item-a','SIM-ISSUER-A','SIM-SELLER-A','SIM-AGREEMENT-A'),('snap-b','item-b','SIM-ISSUER-A','SIM-SELLER-A','SIM-AGREEMENT-A'),('snap-c','item-c','SIM-ISSUER-B','SIM-SELLER-B','SIM-AGREEMENT-B');
  `);
  sqlite.exec('ALTER TABLE managed_commercial_snapshots ADD COLUMN accepted_managed_detail_id TEXT; ALTER TABLE managed_commercial_snapshots ADD COLUMN maker_name_snapshot TEXT');
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
    assert.equal(rows[0]?.barcode_payload,'SIM-INV-HB-SIM-1-1');assert.match(String(rows[0]?.qr_payload),/simulated-invoice/);
  }finally{sqlite.close();}
});

void test('invoice barcode and QR render as offline machine-readable SVG',async()=>{
  const payload='hastabazaar-simulated-invoice:SIM-INV-HB-SIM-1-1';
  const barcode=buildCode39Barcode('SIM-INV-HB-SIM-1-1');
  assert.equal(barcode.value,'SIM-INV-HB-SIM-1-1');
  assert.ok(barcode.width>200);assert.ok(barcode.bars.length>20);
  assert.ok(barcode.bars.every(bar=>bar.width>0&&bar.x>=0));
  const qr=await renderQrSvg(payload);
  assert.match(qr,/^<svg/);assert.match(qr,/<path/);assert.doesNotMatch(qr,/<script|onerror=|javascript:/i);
  const png=PNG.sync.read(await QRCode.toBuffer(payload,{errorCorrectionLevel:'M',margin:4,width:256}));
  const decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);
  assert.equal(decoded?.data,payload);
});

void test('simulated credit and debit documents append without rewriting the original invoice',async()=>{
  const {sqlite,db}=fixture();try{
    await issueManagedInvoiceGroups(db,{orderId:'order',requestId:'invoice-run',now:2000});
    const invoice=sqlite.prepare("SELECT id,snapshot_json FROM managed_invoice_groups WHERE issuer_reference='SIM-ISSUER-A'").get() as {id:string;snapshot_json:string};
    const original=invoice.snapshot_json;
    const credit=await issueManagedInvoiceAdjustment(db,{
      invoiceGroupId:invoice.id,kind:'credit_note',amountPaisa:25000,reasonCode:'refund',
      note:'Simulated partial refund correction for test.',actorId:'admin',requestId:'credit-0001',now:3000,
      approvedReasonCodes:['refund','accepted_defect'],
    });
    assert.equal(credit.created,true);
    const duplicate=await issueManagedInvoiceAdjustment(db,{
      invoiceGroupId:invoice.id,kind:'credit_note',amountPaisa:25000,reasonCode:'refund',
      note:'Simulated partial refund correction for test.',actorId:'admin',requestId:'credit-0001',now:3001,
      approvedReasonCodes:['refund','accepted_defect'],
    });
    assert.equal(duplicate.created,false);assert.equal(duplicate.id,credit.id);
    await issueManagedInvoiceAdjustment(db,{
      invoiceGroupId:invoice.id,kind:'debit_note',amountPaisa:5000,reasonCode:'accepted_defect',
      note:'Simulated reviewed debit correction for test.',actorId:'admin',requestId:'debit-0001',now:4000,
      approvedReasonCodes:['refund','accepted_defect'],
    });
    const adjustments=await listManagedInvoiceAdjustments(db,invoice.id);
    assert.equal(adjustments.length,2);
    assert.deepEqual(adjustments.map(item=>[item.kind,item.amountPaisa]),[['debit_note',5000],['credit_note',25000]]);
    assert.equal(sqlite.prepare('SELECT snapshot_json FROM managed_invoice_groups WHERE id=?').get(invoice.id)?.snapshot_json,original);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get()?.count,2);
    assert.throws(()=>sqlite.prepare("UPDATE managed_invoice_adjustments SET amount_paisa=1 WHERE id=?").run(credit.id),/immutable/);
    assert.throws(()=>sqlite.prepare('DELETE FROM managed_invoice_adjustments WHERE id=?').run(credit.id),/immutable/);
  }finally{sqlite.close();}
});

void test('invoice adjustments reject unknown reasons, zero amounts, and unsupported document kinds',async()=>{
  const {sqlite,db}=fixture();try{
    await issueManagedInvoiceGroups(db,{orderId:'order',requestId:'invoice-run',now:2000});
    const invoice=sqlite.prepare('SELECT id FROM managed_invoice_groups LIMIT 1').get() as {id:string};
    const base={invoiceGroupId:invoice.id,kind:'credit_note' as const,amountPaisa:1000,reasonCode:'refund',note:'A sufficiently clear simulated correction.',actorId:'admin',requestId:'bad',now:3000,approvedReasonCodes:['refund']};
    await assert.rejects(()=>issueManagedInvoiceAdjustment(db,{...base,amountPaisa:0}),/amount/i);
    await assert.rejects(()=>issueManagedInvoiceAdjustment(db,{...base,reasonCode:'secret_fee'}),/reason/i);
    await assert.rejects(()=>issueManagedInvoiceAdjustment(db,{...base,kind:'invoice' as 'credit_note'}),/kind/i);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM managed_invoice_adjustments').get()?.count,0);
  }finally{sqlite.close();}
});

void test('local mail capture rejects real recipients and cannot replace the production SMTP path',async()=>{
  const source=await readFile('lib/runtime/node-bindings.ts','utf8');
  assert.match(source,/HASTABAZAAR_RUNTIME_ENV !== 'local_staging'/);
  assert.match(source,/@local\.hastabazaar\.test/);
  assert.match(source,/Local staging mail capture rejected a non-test recipient/);
  assert.match(source,/new SmtpEmailService/);
});

void test('invoice correction API is bounded, Super-Admin tax-authorized, and simulation-only',async()=>{
  const source=await readFile('app/api/admin/invoices/[id]/adjustments/route.ts','utf8');
  assert.match(source,/requireStaffApi\('tax_policy\.manage'\)/);
  assert.match(source,/readBoundedJsonObject\(request\)/);
  const reader=await readFile('lib/http/form-json-body.ts','utf8');
  assert.match(reader,/readBoundedBody\(request, FORM_JSON_BODY_BYTES\)/);
  assert.match(reader,/FORM_JSON_BODY_BYTES = 256 \* 1024/);
  assert.match(source,/assertSimulationAllowed/);
  assert.match(source,/managed_adjustment_reason_codes/);
});


void test('refunded managed orders issue original gross simulated groups only after all original parcel cash is collected',async()=>{
  for(const status of ['part_refunded','refunded']){
    const {sqlite,db}=fixture();try{
      sqlite.prepare('UPDATE orders SET payment_status=? WHERE id=?').run(status,'order');
      sqlite.exec("INSERT INTO shipping_jobs VALUES ('first','order'),('second','order'); INSERT INTO shipping_parcels VALUES ('first',100000,100000),('second',180000,0)");
      assert.equal(await issueManagedInvoiceGroups(db,{orderId:'order',requestId:'invoice-refunded-uncollected',now:2000}),0);
      sqlite.exec("UPDATE shipping_parcels SET collected_paisa=cod_due_paisa WHERE shipping_job_id='second'");
      assert.equal(await issueManagedInvoiceGroups(db,{orderId:'order',requestId:'invoice-refunded-collected',now:2001}),2);
      assert.equal(await issueManagedInvoiceGroups(db,{orderId:'order',requestId:'invoice-refunded-collected',now:2002}),0);
      const snapshots=sqlite.prepare('SELECT snapshot_json AS snapshot FROM managed_invoice_groups').all() as {snapshot:string}[];
      assert.equal(snapshots.reduce((total,row)=>total+JSON.parse(row.snapshot).productTotalPaisa,0),280000);
      assert.ok(snapshots.every(row=>JSON.parse(row.snapshot).taxDocument===false));
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM managed_invoice_adjustments').get()?.n,0);
    }finally{sqlite.close();}
  }
});
