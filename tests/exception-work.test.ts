import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {DatabaseSync,type SQLInputValue,type StatementSync} from 'node:sqlite';
import {createExceptionWork,updateExceptionWork,listExceptionWork} from '../lib/operations/exception-work';
async function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec("CREATE TABLE users(id TEXT PRIMARY KEY,display_name TEXT,status TEXT);CREATE TABLE user_roles(user_id TEXT,role TEXT);CREATE TABLE staff_permission_profiles(user_id TEXT PRIMARY KEY,permissions_json TEXT);CREATE TABLE shipping_jobs(id TEXT PRIMARY KEY,order_id TEXT,status TEXT);CREATE TABLE parcel_cash_records(id TEXT PRIMARY KEY,shipping_job_id TEXT,status TEXT);CREATE TABLE operation_transaction_guards(id TEXT PRIMARY KEY,valid INTEGER CHECK(valid=1));CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,request_id TEXT UNIQUE,created_at INTEGER);CREATE TABLE notification_messages(id TEXT PRIMARY KEY,recipient_user_id TEXT,audience_role TEXT,channel TEXT,template_key TEXT,subject_en TEXT,subject_ne TEXT,body_en TEXT,body_ne TEXT,related_type TEXT,related_id TEXT,status TEXT,request_id TEXT UNIQUE,created_at INTEGER,required_permission TEXT,business_event_key TEXT);");
 sqlite.exec(await readFile(new URL('../drizzle/0034_exception_work.sql',import.meta.url),'utf8'));
 sqlite.exec("INSERT INTO users VALUES ('admin','Admin','active'),('finance','Finance','active'),('super','Super','active'),('seller','Seller','active');INSERT INTO user_roles VALUES ('admin','admin'),('finance','admin'),('super','super_admin'),('seller','seller');INSERT INTO staff_permission_profiles VALUES ('finance','[\"order.manage\",\"payout.prepare\"]');INSERT INTO shipping_jobs VALUES ('job','order','delivery_failed'),('cancelled','order','cancelled');INSERT INTO parcel_cash_records VALUES ('cash','job','posted'),('pending','job','proposed');");
 return {sqlite,db:new TestD1Database(sqlite) as unknown as D1Database};
}
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



const base={actorId:'admin',jobId:'job',kind:'failed_delivery',note:'Delivery failure report references the existing parcel state.',nextAction:'Review delivery evidence and authorize next attempt.',requestId:'create',now:1000};
void test('exception work is source-bound, idempotent, assigned safely and never changes parcel or cash',async()=>{
 const f=await fixture();try{
 const id=await createExceptionWork(f.db,base);assert.equal(await createExceptionWork(f.db,{...base,now:2000}),id);
 assert.equal((await listExceptionWork(f.db,'admin'))[0].ownerId,null);
 await updateExceptionWork(f.db,{id,actorId:'admin',version:0,ownerId:'finance',nextAction:'Review evidence before arranging another attempt.',note:'Assigned to the active operations reviewer.',requestId:'assign',now:1100});
 assert.equal((await listExceptionWork(f.db,'admin'))[0].ownerId,'finance');
 await assert.rejects(()=>updateExceptionWork(f.db,{id,actorId:'admin',version:0,ownerId:'seller',nextAction:'Invalid stale owner change.',note:'This must fail safely.',requestId:'stale',now:1200}));
 assert.equal(f.sqlite.prepare("SELECT status FROM shipping_jobs WHERE id='job'").get()?.status,'delivery_failed');
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM exception_work_events WHERE work_id=?").get(id)?.n,2);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM notification_messages').get()?.n,2);
 }finally{f.sqlite.close();}
});
void test('incorrect cash requires posted same-parcel evidence and cannot be resolved without a correction workflow',async()=>{
 const f=await fixture();try{
 await assert.rejects(()=>createExceptionWork(f.db,{...base,kind:'incorrect_cash',cashRecordId:'pending'}));
 const id=await createExceptionWork(f.db,{...base,kind:'incorrect_cash',cashRecordId:'cash'});
 await assert.rejects(()=>updateExceptionWork(f.db,{id,actorId:'super',version:0,ownerId:'super',nextAction:'Investigate the posted discrepancy.',note:'Cannot pretend this is settled.',requestId:'close',now:1200,resolve:true,evidence:'Reviewed source and all obligations.',checks:{sourceReviewed:true,obligationsReviewed:true,followupComplete:true}}));
 assert.equal(f.sqlite.prepare("SELECT status FROM parcel_cash_records WHERE id='cash'").get()?.status,'posted');
 }finally{f.sqlite.close();}
});
void test('resolution requires permitted owner, changed source and explicit evidence; revoked staff cannot mutate',async()=>{
 const f=await fixture();try{
 const id=await createExceptionWork(f.db,{...base,ownerId:'admin'});
 const update={id,actorId:'admin',version:0,ownerId:'admin',nextAction:'Evidence reviewed; workflow completed.',note:'Reviewer confirms documented next actions.',requestId:'close',now:1200,resolve:true,evidence:'Delivery was retried and completed under the order workflow.',checks:{sourceReviewed:true,obligationsReviewed:true,followupComplete:true}};
 await assert.rejects(()=>updateExceptionWork(f.db,update));
 f.sqlite.exec("UPDATE shipping_jobs SET status='delivered' WHERE id='job'");
 await updateExceptionWork(f.db,update);assert.equal((await listExceptionWork(f.db,'admin'))[0].status,'resolved');
 f.sqlite.exec("INSERT INTO staff_permission_profiles VALUES ('admin','[]')");
 await assert.rejects(()=>createExceptionWork(f.db,{...base,requestId:'revoked'}));
 }finally{f.sqlite.close();}
});

void test('exception assignments reject unpermitted owners and history cannot be rewritten',async()=>{
 const f=await fixture();try{
 await assert.rejects(()=>createExceptionWork(f.db,{...base,ownerId:'seller'}));
 const id=await createExceptionWork(f.db,{...base,kind:'cancelled_parcel',jobId:'cancelled',ownerId:'admin'});
 assert.throws(()=>f.sqlite.prepare('UPDATE exception_work_events SET note=? WHERE work_id=?').run('Rewrite',id),/immutable/);
 assert.throws(()=>f.sqlite.prepare('DELETE FROM exception_work_events WHERE work_id=?').run(id),/immutable/);
 await assert.rejects(()=>createExceptionWork(f.db,{...base,kind:'customer_unavailable',jobId:'cancelled',requestId:'wrong-reference'}));
 f.sqlite.exec("UPDATE shipping_jobs SET status='dispatched' WHERE id='job'");
 await createExceptionWork(f.db,{...base,kind:'customer_unavailable',requestId:'unavailable'});
 }finally{f.sqlite.close();}
});
void test('exception mutation rolls back its task and notifications when audit insertion fails',async()=>{
 const f=await fixture();try{
 f.sqlite.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'Synthetic audit failure'); END;");
 await assert.rejects(()=>createExceptionWork(f.db,{...base,ownerId:'admin'}));
 for(const table of ['exception_work_items','exception_work_events','notification_messages'])assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM '+table).get()?.n,0);
 }finally{f.sqlite.close();}
});

void test('permission changes between assignment read and commit fail the guarded transaction',async()=>{
 const f=await fixture();try{
 const id=await createExceptionWork(f.db,base);const original=f.db.batch.bind(f.db);let injected=false;
 f.db.batch=async statements=>{if(!injected){injected=true;f.sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[]' WHERE user_id='finance'");}return original(statements);};
 await assert.rejects(()=>updateExceptionWork(f.db,{id,actorId:'admin',version:0,ownerId:'finance',nextAction:'Review source evidence and next actions.',note:'Assign to the selected reviewer.',requestId:'race',now:1500}));
 assert.equal((await listExceptionWork(f.db,'admin'))[0].ownerId,null);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM exception_work_events WHERE work_id=?').get(id)?.n,1);
 }finally{f.sqlite.close();}
});

void test('empty corrupted permission profile denies exception actor, owner and reader',async()=>{
 const f=await fixture();try{
 f.sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='' WHERE user_id='finance'");
 await assert.rejects(()=>listExceptionWork(f.db,'finance'));
 await assert.rejects(()=>createExceptionWork(f.db,{...base,actorId:'finance'}));
 await assert.rejects(()=>createExceptionWork(f.db,{...base,ownerId:'finance'}));
 }finally{f.sqlite.close();}
});
