import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';import {DatabaseSync,type SQLInputValue,type StatementSync} from 'node:sqlite';
import {submitRiderReport,riderReportAcceptance,issueRiderOtp,verifyRiderOtp} from '../lib/riders/repository';
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





function fixture(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,auth_subject TEXT,status TEXT);CREATE TABLE user_roles(user_id TEXT,role TEXT);CREATE TABLE staff_permission_profiles(user_id TEXT,permissions_json TEXT,version INTEGER,updated_by TEXT,updated_at INTEGER);CREATE TABLE staff_permission_guards(id TEXT,valid INTEGER CHECK(valid=1));CREATE TABLE operation_transaction_guards(id TEXT,valid INTEGER CHECK(valid=1));CREATE TABLE orders(id TEXT PRIMARY KEY,order_number TEXT,payment_mode TEXT,customer_id TEXT,receipt_token_hash TEXT,status TEXT,customer_email TEXT);CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT);CREATE TABLE managed_commercial_snapshots(id TEXT PRIMARY KEY,order_item_id TEXT);CREATE TABLE shipping_jobs(id TEXT PRIMARY KEY,order_id TEXT,status TEXT);CREATE TABLE shipping_parcels(shipping_job_id TEXT,rider_user_id TEXT,version INTEGER,method TEXT,cod_due_paisa INTEGER,collected_paisa INTEGER,operation_request_id TEXT);CREATE TABLE audit_logs(id TEXT,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,created_at INTEGER);CREATE TABLE notification_messages(id TEXT,recipient_user_id TEXT,audience_role TEXT,channel TEXT,template_key TEXT,subject_en TEXT,subject_ne TEXT,body_en TEXT,body_ne TEXT,related_type TEXT,related_id TEXT,status TEXT,request_id TEXT UNIQUE,created_at INTEGER,business_event_key TEXT,required_permission TEXT,guest_email TEXT,guest_order_id TEXT);INSERT INTO users VALUES ('rider','rider','active'),('admin','admin','active'),('customer','customer','active');INSERT INTO user_roles VALUES ('admin','admin');INSERT INTO orders VALUES ('order','HB-TEST','prepaid','customer','receipt-secret-hash','dispatched','customer@example.test');INSERT INTO shipping_jobs VALUES ('job','order','dispatched');INSERT INTO shipping_parcels VALUES ('job','rider',0,'own_rider',0,0,NULL);`);sqlite.exec(readFileSync('drizzle/0038_verified_riders.sql','utf8'));sqlite.exec(readFileSync('drizzle/0034_exception_work.sql','utf8'));sqlite.exec("INSERT INTO rider_profiles(user_id,status,application_id,updated_at) VALUES ('rider','approved','app',1)");return {sqlite,db:new TestD1Database(sqlite) as unknown as D1Database};}
const report={riderId:'rider',jobId:'job',version:0,kind:'customer_unavailable',note:'Customer was unavailable at the agreed place.',cashPaisa:0,key:null,mime:null,requestId:'report',openBox:false,now:100};
void test('optional prepaid OTP does not prevent a failure report and report never moves cash or delivery',async()=>{const f=fixture();try{f.sqlite.exec("UPDATE rider_policy SET otp_scope='prepaid_only'");await submitRiderReport(f.db,report);assert.equal(f.sqlite.prepare("SELECT status FROM shipping_jobs").get()?.status,'dispatched');assert.equal(f.sqlite.prepare('SELECT collected_paisa FROM shipping_parcels').get()?.collected_paisa,0);}finally{f.sqlite.close();}});
void test('acceptance cannot bypass staff permission or commit an obsolete rider assignment',async()=>{const f=fixture();try{const id=await submitRiderReport(f.db,report);await assert.rejects(()=>riderReportAcceptance(f.db,{reportId:id,jobId:'job',actorId:'rider',version:0,requestId:'op',now:101}));const result=await riderReportAcceptance(f.db,{reportId:id,jobId:'job',actorId:'admin',version:0,requestId:'op',now:101});f.sqlite.exec("UPDATE shipping_parcels SET rider_user_id='other',version=1,operation_request_id='op'");await assert.rejects(()=>f.db.batch(result.statements));assert.equal(f.sqlite.prepare('SELECT status FROM rider_reports').get()?.status,'pending');}finally{f.sqlite.close();}});
void test('report source and event history remain immutable, duplicate pending and unapproved rider reject',async()=>{const f=fixture();try{await submitRiderReport(f.db,report);await assert.rejects(()=>submitRiderReport(f.db,{...report,requestId:'other'}));await assert.rejects(()=>f.db.prepare("UPDATE rider_reports SET note='rewrite'").run());await assert.rejects(()=>f.db.prepare('DELETE FROM rider_reports').run());await assert.rejects(()=>f.db.prepare("UPDATE rider_events SET note='rewrite'").run());f.sqlite.exec("UPDATE rider_profiles SET status='suspended'");await assert.rejects(()=>submitRiderReport(f.db,{...report,requestId:'suspended'}));}finally{f.sqlite.close();}});

void test('staff acceptance requires matching operation token and rolls back on revoked current permission',async()=>{const f=fixture();try{const id=await submitRiderReport(f.db,report);const result=await riderReportAcceptance(f.db,{reportId:id,jobId:'job',actorId:'admin',version:0,requestId:'op',now:101});f.sqlite.exec("UPDATE shipping_parcels SET version=1,operation_request_id='wrong'");await assert.rejects(()=>f.db.batch(result.statements));f.sqlite.exec("UPDATE shipping_parcels SET operation_request_id='op';INSERT INTO staff_permission_profiles(user_id,permissions_json) VALUES ('admin','[]')");await assert.rejects(()=>f.db.batch(result.statements));assert.equal(f.sqlite.prepare('SELECT status FROM rider_reports').get()?.status,'pending');f.sqlite.exec('DELETE FROM staff_permission_profiles');await f.db.batch(result.statements);assert.equal(f.sqlite.prepare('SELECT status FROM rider_reports').get()?.status,'accepted');assert.equal(f.sqlite.prepare('SELECT status FROM shipping_jobs').get()?.status,'dispatched');assert.equal(f.sqlite.prepare('SELECT collected_paisa FROM shipping_parcels').get()?.collected_paisa,0);}finally{f.sqlite.close();}});
void test('COD handover never requires OTP but always requires proof and pending staff confirmation',async()=>{const f=fixture();try{f.sqlite.exec("UPDATE rider_policy SET otp_scope='prepaid_only';UPDATE orders SET payment_mode='cod';UPDATE shipping_parcels SET cod_due_paisa=100");await assert.rejects(()=>submitRiderReport(f.db,{...report,kind:'delivered',cashPaisa:100}));await submitRiderReport(f.db,{...report,kind:'delivered',cashPaisa:100,key:'synthetic-proof',mime:'image/jpeg'});assert.equal(f.sqlite.prepare('SELECT status FROM rider_reports').get()?.status,'pending');assert.equal(f.sqlite.prepare('SELECT collected_paisa FROM shipping_parcels').get()?.collected_paisa,0);}finally{f.sqlite.close();}});

void test('optional delivery code is owner-only, hashed, assignment-bound and limited to five attempts',async()=>{const f=fixture();try{
 f.sqlite.exec("UPDATE rider_policy SET otp_scope='prepaid_only'");await assert.rejects(()=>issueRiderOtp(f.db,{jobId:'job',customerId:'rider',now:100}));const challenge=await issueRiderOtp(f.db,{jobId:'job',customerId:'customer',now:100});assert.match(challenge.code,/^\d{6}$/);assert.notEqual(f.sqlite.prepare('SELECT code_hash FROM rider_otp_challenges').get()?.code_hash,challenge.code);
 assert.equal(await verifyRiderOtp(f.db,{jobId:'job',riderId:'rider',version:1,code:challenge.code,now:101}),false);const wrong=challenge.code==='000000'?'111111':'000000';for(let i=0;i<5;i++)assert.equal(await verifyRiderOtp(f.db,{jobId:'job',riderId:'rider',version:0,code:wrong,now:101}),false);assert.equal(await verifyRiderOtp(f.db,{jobId:'job',riderId:'rider',version:0,code:challenge.code,now:102}),false);
 const next=await issueRiderOtp(f.db,{jobId:'job',customerId:'customer',now:700000});assert.equal(await verifyRiderOtp(f.db,{jobId:'job',riderId:'rider',version:0,code:next.code,now:700001}),true);assert.equal(await verifyRiderOtp(f.db,{jobId:'job',riderId:'rider',version:0,code:next.code,now:700002}),false);assert.equal(f.sqlite.prepare('SELECT status FROM shipping_jobs').get()?.status,'dispatched');
 }finally{f.sqlite.close();}});

void test('receipt capability must match exactly and notification recipients remain permission-bound at insert',async()=>{const f=fixture();try{const {riderNotifications}=await import('../lib/riders/repository');f.sqlite.exec("UPDATE orders SET customer_id=NULL;UPDATE rider_policy SET otp_scope='prepaid_only'");await assert.rejects(()=>issueRiderOtp(f.db,{jobId:'job',customerId:null,now:100}));await assert.rejects(()=>issueRiderOtp(f.db,{jobId:'job',customerId:null,receiptTokenHash:'wrong',now:100}));assert.match((await issueRiderOtp(f.db,{jobId:'job',customerId:null,receiptTokenHash:'receipt-secret-hash',now:100})).code,/^\d{6}$/);const statements=await riderNotifications(f.db,'event','rider_report','report','rider','order.manage',100,'Report pending');f.sqlite.exec("INSERT INTO staff_permission_profiles(user_id,permissions_json) VALUES ('admin','[]')");await f.db.batch(statements);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE recipient_user_id='admin'").get()?.n,0);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE recipient_user_id='rider'").get()?.n,2);}finally{f.sqlite.close();}});

void test('policy updates preserve immutable snapshots and stale versions reject',async()=>{const f=fixture();try{const {saveRiderPolicy}=await import('../lib/riders/repository');f.sqlite.exec("INSERT INTO user_roles VALUES ('admin','super_admin')");await saveRiderPolicy(f.db,{actorId:'admin',version:0,openBox:true,otpScope:'prepaid_only',now:100});assert.equal(f.sqlite.prepare('SELECT open_box FROM rider_policy_versions WHERE version=1').get()?.open_box,1);await assert.rejects(()=>saveRiderPolicy(f.db,{actorId:'admin',version:0,openBox:false,otpScope:'off',now:101}));await assert.rejects(()=>f.db.prepare('UPDATE rider_policy_versions SET open_box=0 WHERE version=1').run());await assert.rejects(()=>f.db.prepare('DELETE FROM rider_policy_versions WHERE version=1').run());}finally{f.sqlite.close();}});

void test('cancelled orders reject reports and optional codes; report primary identity and terminal decision are immutable',async()=>{const f=fixture();try{f.sqlite.exec("UPDATE orders SET status='cancelled';UPDATE rider_policy SET otp_scope='prepaid_only'");await assert.rejects(()=>submitRiderReport(f.db,report));await assert.rejects(()=>issueRiderOtp(f.db,{jobId:'job',customerId:'customer',now:100}));f.sqlite.exec("UPDATE orders SET status='dispatched'");const id=await submitRiderReport(f.db,report);await assert.rejects(()=>f.db.prepare("UPDATE rider_reports SET id='new-id' WHERE id=?").bind(id).run());await f.db.prepare("UPDATE rider_reports SET status='rejected',reviewed_by='admin',review_note='Evidence incomplete',reviewed_at=100 WHERE id=?").bind(id).run();await assert.rejects(()=>f.db.prepare("UPDATE rider_reports SET status='pending' WHERE id=?").bind(id).run());await assert.rejects(()=>f.db.prepare("UPDATE rider_reports SET review_note='overwrite' WHERE id=?").bind(id).run());}finally{f.sqlite.close();}});
