import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync,type SQLInputValue,type StatementSync} from 'node:sqlite';
import {archiveSellerProduct,deleteSellerProduct} from '../lib/db/repositories/products';
import {productClosureBlockers} from '../lib/db/repositories/product-closure';
class TestD1PreparedStatement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) {
    this.values = values;
    return this;
  }
  async first<T>() {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }
  async all<T>() {
    return {
      results: this.statement.all(...this.values) as T[],
      success: true,
      meta: {},
    };
  }
  async run() {
    const result = this.statement.run(...this.values);
    return {
      success: true,
      meta: { changes: Number(result.changes) },
      results: [],
    };
  }
}

class TestD1Database {
  constructor(private readonly sqlite: DatabaseSync) {}
  prepare(sql: string) {
    return new TestD1PreparedStatement(this.sqlite.prepare(sql));
  }
  async batch(statements: readonly TestD1PreparedStatement[]) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}




function fixture(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(`
CREATE TABLE products(id TEXT PRIMARY KEY,seller_id TEXT,status TEXT,updated_at INTEGER,review_request_id TEXT);
CREATE TABLE product_deletions(product_id TEXT PRIMARY KEY,deleted_by TEXT,deleted_at INTEGER,request_id TEXT);
CREATE TABLE audit_logs(id TEXT,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT,ip_hash TEXT,created_at INTEGER);
CREATE TABLE orders(id TEXT PRIMARY KEY,payment_status TEXT);
CREATE TABLE order_items(id TEXT PRIMARY KEY,product_id TEXT,seller_id TEXT,order_id TEXT,fulfillment_status TEXT);
CREATE TABLE shipping_jobs(id TEXT,order_id TEXT,seller_id TEXT,status TEXT);
CREATE TABLE shipping_parcels(shipping_job_id TEXT,remitted_paisa INTEGER,cod_due_paisa INTEGER);
CREATE TABLE return_requests(id TEXT,order_item_id TEXT,status TEXT);
CREATE TABLE complaints(id TEXT,order_item_id TEXT,order_id TEXT,seller_id TEXT,status TEXT);
CREATE TABLE refunds(id TEXT,order_id TEXT,return_request_id TEXT,status TEXT);
CREATE TABLE seller_ledger_entries(id TEXT,seller_id TEXT,order_item_id TEXT,payout_id TEXT,type TEXT,amount_paisa INTEGER);
CREATE TABLE payouts(id TEXT,seller_id TEXT,status TEXT);
CREATE TABLE payout_entries(payout_id TEXT,ledger_entry_id TEXT,released_at INTEGER);
INSERT INTO products VALUES ('p','s','published',1,NULL),('other','s','published',1,NULL);
INSERT INTO orders VALUES ('o','paid');INSERT INTO order_items VALUES ('i','p','s','o','delivered'),('other-i','other','s','o','delivered');
INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,payout_id,type,amount_paisa) VALUES ('sale','s','i',NULL,'sale',100),('commission','s','i',NULL,'commission',-10);
INSERT INTO payouts VALUES ('paid','s','paid');INSERT INTO payout_entries VALUES ('paid','sale',NULL),('paid','commission',NULL);
`);sqlite.exec('ALTER TABLE seller_ledger_entries ADD refund_id TEXT');return {sqlite,db:new TestD1Database(sqlite) as unknown as D1Database};}
const options={productId:'p',sellerId:'s',actorId:'seller',now:100};
void test('actual unpaid product earnings block archive and delete while paid history stays retained',async()=>{const f=fixture();try{
 f.sqlite.exec("DELETE FROM payout_entries");assert.ok((await productClosureBlockers(f.db,'p','s')).some(b=>b.kind==='earnings'));
 await assert.rejects(()=>archiveSellerProduct(f.db,options));assert.equal(f.sqlite.prepare("SELECT status FROM products WHERE id='p'").get()?.status,'published');
 f.sqlite.exec("UPDATE products SET status='archived' WHERE id='p'");await assert.rejects(()=>deleteSellerProduct(f.db,options));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_deletions').get()?.n,0);
 }finally{f.sqlite.close();}});
void test('paid product can close with historical items and without waiting an unused return window; unrelated item reserves do not block',async()=>{const f=fixture();try{
 f.sqlite.exec("INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,payout_id,type,amount_paisa) VALUES ('other-reserve','s','other-i',NULL,'reserve_hold',-20)");assert.deepEqual(await productClosureBlockers(f.db,'p','s'),[]);
 await archiveSellerProduct(f.db,options);await deleteSellerProduct(f.db,options);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM order_items WHERE product_id='p'").get()?.n,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs").get()?.n,2);
 }finally{f.sqlite.close();}});
void test('related cases refunds cash and missing or ambiguous ledger evidence are explicit blockers',async()=>{const samples=[
 ["UPDATE order_items SET fulfillment_status='packing' WHERE id='i'",'order'],
 ["INSERT INTO return_requests VALUES ('r','i','requested')",'return'],
 ["INSERT INTO complaints VALUES ('c',NULL,'o',NULL,'open')",'complaint'],
 ["INSERT INTO refunds VALUES ('r','o',NULL,'processing')",'refund'],
 ["INSERT INTO shipping_jobs VALUES ('j','o','s','delivered');INSERT INTO shipping_parcels VALUES ('j',0,100)",'cash'],
 ["DELETE FROM seller_ledger_entries WHERE id='commission'",'earnings_review'],
 ["INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,payout_id,type,amount_paisa) VALUES ('unknown','s',NULL,NULL,'adjustment',-20)",'attribution_review'],
 ["INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,payout_id,type,amount_paisa) VALUES ('reserve','s','i',NULL,'reserve_hold',-20)",'reserve']
 ];for(const [sql,kind]of samples){const f=fixture();try{f.sqlite.exec(sql);const blockers=await productClosureBlockers(f.db,'p','s');assert.ok(blockers.some(b=>b.kind===kind),kind);await assert.rejects(()=>archiveSellerProduct(f.db,options));assert.deepEqual(await productClosureBlockers(f.db,'p','outsider'),[]);}finally{f.sqlite.close();}}});
void test('closure mutation rechecks an obligation arriving after the screen read',async()=>{const f=fixture();try{
 assert.deepEqual(await productClosureBlockers(f.db,'p','s'),[]);const original=f.db.batch.bind(f.db);f.db.batch=async statements=>{f.sqlite.exec("INSERT INTO return_requests VALUES ('late','i','requested')");return original(statements);};
 await assert.rejects(()=>archiveSellerProduct(f.db,options));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs').get()?.n,0);
 }finally{f.sqlite.close();}});

void test('refund-linked legacy ledger follows its actual item and seller-wide unknown complaint requires review',async()=>{const f=fixture();try{
 f.sqlite.exec("INSERT INTO return_requests VALUES ('other-return','other-i','resolved');INSERT INTO refunds VALUES ('other-refund','o','other-return','paid');INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,payout_id,type,amount_paisa,refund_id) VALUES ('other-adjustment','s',NULL,NULL,'refund',-10,'other-refund')");
 assert.deepEqual(await productClosureBlockers(f.db,'p','s'),[]);
 f.sqlite.exec("UPDATE return_requests SET order_item_id='i' WHERE id='other-return'");assert.ok((await productClosureBlockers(f.db,'p','s')).some(b=>b.kind==='refund_earnings'));
 f.sqlite.exec("INSERT INTO payout_entries VALUES ('paid','other-adjustment',NULL)");assert.deepEqual(await productClosureBlockers(f.db,'p','s'),[]);
 f.sqlite.exec("INSERT INTO complaints VALUES ('unattributed',NULL,NULL,'s','open')");assert.ok((await productClosureBlockers(f.db,'p','s')).some(b=>b.kind==='case_attribution_review'));
 }finally{f.sqlite.close();}});
